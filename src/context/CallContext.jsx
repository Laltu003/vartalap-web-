import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { db } from '../firebase/config';
import { useAuth } from './AuthContext';
import { CallSession, initiateCall, acceptCall, declineCall, endCall, cancelCall } from '../utils/webrtc';
import toast from 'react-hot-toast';

const CallContext = createContext();

export function useCall() {
  return useContext(CallContext);
}

const RING_TIMEOUT_MS = 30000; // auto-cancel if nobody answers in 30s

export function CallProvider({ children }) {
  const { currentUser, userProfile } = useAuth();

  // 'idle' | 'ringing-outgoing' | 'ringing-incoming' | 'connected' | 'ended'
  const [callStatus, setCallStatus] = useState('idle');
  const [activeCall, setActiveCall] = useState(null); // { callId, peerName, peerPhoto, isCaller }
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const sessionRef = useRef(null);
  const statusListenerRef = useRef(null); // unsub for the calls/{id} status listener, separate from the WebRTC session
  const remoteAudioRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const connectingRef = useRef(false); // guards against double-connecting from duplicate Firebase events

  // ── Listen app-wide for incoming calls ──
  useEffect(() => {
    if (!currentUser) return;

    let unsub;
    let retried = false;

    function subscribe() {
      const incomingRef = ref(db, `incomingCalls/${currentUser.uid}`);
      unsub = onValue(
        incomingRef,
        async (snap) => {
          const data = snap.val();
          if (!data?.callId || callStatus !== 'idle') return;

          const callSnap = await get(ref(db, `calls/${data.callId}`));
          const callData = callSnap.val();
          if (!callData || callData.status !== 'ringing') return;

          setActiveCall({
            callId: data.callId,
            peerName: callData.callerName,
            peerPhoto: callData.callerPhoto,
            isCaller: false,
          });
          setCallStatus('ringing-incoming');
        },
        (err) => {
          // This listener detects incoming calls app-wide, so a silent
          // failure here means missed calls entirely — retry once.
          console.error('Incoming call listener error:', err);
          if (!retried) {
            retried = true;
            setTimeout(subscribe, 400);
          }
        }
      );
    }

    subscribe();
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, callStatus]);

  function startDurationTimer() {
    setCallDuration(0);
    durationIntervalRef.current = setInterval(() => {
      setCallDuration(d => d + 1);
    }, 1000);
  }

  function stopDurationTimer() {
    clearInterval(durationIntervalRef.current);
  }

  // ── Outgoing call ──
  const startCall = useCallback(async (calleeId, calleeName, calleePhoto) => {
    if (callStatus !== 'idle') return;

    let callId;
    try {
      callId = await initiateCall(
        currentUser.uid,
        userProfile?.username || 'Unknown',
        userProfile?.photoURL,
        calleeId
      );
    } catch (err) {
      console.error('Failed to start call:', err);
      toast.error('Could not start the call. Please try again.', { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } });
      return;
    }

    setActiveCall({ callId, peerName: calleeName, peerPhoto: calleePhoto, isCaller: true });
    setCallStatus('ringing-outgoing');

    // Watch the call doc to know when it's accepted/declined/cancelled
    const callRef = ref(db, `calls/${callId}`);
    const unsub = onValue(
      callRef,
      async (snap) => {
        const data = snap.val();
        if (!data) return;

        if (data.status === 'accepted' && !connectingRef.current) {
          connectingRef.current = true;
          clearTimeout(ringTimeoutRef.current);
          await connectSession(callId, true);
        } else if (data.status === 'declined' || data.status === 'cancelled' || data.status === 'ended') {
          clearTimeout(ringTimeoutRef.current);
          teardown();
        }
      },
      (err) => console.error('Outgoing call status listener error:', err)
    );

    ringTimeoutRef.current = setTimeout(async () => {
      await cancelCall(callId, calleeId);
      unsub();
      teardown();
    }, RING_TIMEOUT_MS);

    statusListenerRef.current = unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus, currentUser, userProfile]);

  // ── Accept an incoming call ──
  const answerCall = useCallback(async () => {
    if (!activeCall) return;
    await acceptCall(activeCall.callId, currentUser.uid);
    await connectSession(activeCall.callId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall, currentUser]);

  // ── Decline an incoming call ──
  const rejectCall = useCallback(async () => {
    if (!activeCall) return;
    await declineCall(activeCall.callId, currentUser.uid);
    teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall, currentUser]);

  // ── Establish the actual WebRTC connection (called after accept) ──
  async function connectSession(callId, isCaller) {
    try {
      const session = new CallSession({
        callId,
        isCaller,
        onRemoteStream: (stream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            remoteAudioRef.current.play().catch(() => {});
          }
        },
        onStateChange: (state) => {
          if (state === 'connected') {
            setCallStatus('connected');
            startDurationTimer();
          } else if (state === 'ended' || state === 'disconnected' || state === 'failed') {
            teardown();
          }
        },
      });
      await session.start();
      sessionRef.current = session;
    } catch (err) {
      console.error('Failed to connect call:', err);
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone permission denied. Please allow microphone access.'
        : 'Could not connect the call. Please try again.';
      toast.error(msg, { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } });
      teardown();
    }
  }

  // ── Hang up an active or ringing call ──
  const hangUp = useCallback(async () => {
    if (!activeCall || !currentUser) return;
    await endCall(activeCall.callId, currentUser.uid);
    teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall, currentUser]);

  function teardown() {
    clearTimeout(ringTimeoutRef.current);
    stopDurationTimer();
    connectingRef.current = false;
    if (sessionRef.current?.cleanup) sessionRef.current.cleanup();
    sessionRef.current = null;
    if (statusListenerRef.current) {
      statusListenerRef.current();
      statusListenerRef.current = null;
    }
    setActiveCall(null);
    setCallStatus('idle');
    setIsMuted(false);
    setCallDuration(0);
  }

  function toggleMute() {
    const next = !isMuted;
    setIsMuted(next);
    sessionRef.current?.toggleMute?.(next);
  }

  const value = {
    callStatus,
    activeCall,
    isMuted,
    callDuration,
    startCall,
    answerCall,
    rejectCall,
    hangUp,
    toggleMute,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
    </CallContext.Provider>
  );
}
