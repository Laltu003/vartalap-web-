// ============================================================
// src/utils/webrtc.js
// WebRTC voice-call engine. Firebase Realtime Database is used
// purely as a signaling channel (exchanging offer/answer/ICE
// candidates) — the actual audio flows peer-to-peer once
// connected, never through Firebase.
// ============================================================
import { ref, push, set, update, onValue, remove, get, serverTimestamp } from 'firebase/database';
import { db } from '../firebase/config';

// Free public STUN server — helps peers discover their public IP.
// No TURN server configured (that would need a paid relay service);
// this means calls may fail to connect if both users are behind
// strict/symmetric NATs (common on some mobile carriers). Most
// home wifi and many mobile networks will work fine without TURN.
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class CallSession {
  constructor({ callId, isCaller, onRemoteStream, onStateChange }) {
    this.callId = callId;
    this.isCaller = isCaller;
    this.onRemoteStream = onRemoteStream;
    this.onStateChange = onStateChange;
    this.pc = null;
    this.localStream = null;
    this.unsubscribers = [];
  }

  async start() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));

    this.pc.ontrack = (event) => {
      this.onRemoteStream?.(event.streams[0]);
    };

    this.pc.onconnectionstatechange = () => {
      this.onStateChange?.(this.pc.connectionState);
    };

    const myRole = this.isCaller ? 'caller' : 'callee';
    const otherRole = this.isCaller ? 'callee' : 'caller';

    // Send our ICE candidates to Firebase as we discover them
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        push(ref(db, `calls/${this.callId}/candidates/${myRole}`), event.candidate.toJSON());
      }
    };

    // Listen for the other side's ICE candidates
    const candidatesRef = ref(db, `calls/${this.callId}/candidates/${otherRole}`);
    const seenCandidates = new Set();
    const unsubCandidates = onValue(
      candidatesRef,
      (snap) => {
        snap.forEach((child) => {
          if (seenCandidates.has(child.key)) return;
          seenCandidates.add(child.key);
          const candidate = new RTCIceCandidate(child.val());
          this.pc.addIceCandidate(candidate).catch(() => {});
        });
      },
      (err) => console.error('ICE candidates listener error:', err)
    );
    this.unsubscribers.push(unsubCandidates);

    if (this.isCaller) {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await update(ref(db, `calls/${this.callId}`), {
        offer: { type: offer.type, sdp: offer.sdp },
      });

      // Wait for the callee's answer
      const callRef = ref(db, `calls/${this.callId}`);
      const unsubAnswer = onValue(
        callRef,
        async (snap) => {
          const data = snap.val();
          if (data?.answer && this.pc.signalingState !== 'stable') {
            await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
          if (data?.status === 'ended' || data?.status === 'declined') {
            this.onStateChange?.('ended');
          }
        },
        (err) => console.error('Call answer listener error:', err)
      );
      this.unsubscribers.push(unsubAnswer);
    } else {
      // Callee: read the offer that's already there, create an answer
      const snap = await get(ref(db, `calls/${this.callId}`));
      const data = snap.val();
      if (data?.offer) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await update(ref(db, `calls/${this.callId}`), {
          answer: { type: answer.type, sdp: answer.sdp },
        });
      }

      const callRef = ref(db, `calls/${this.callId}`);
      const unsubStatus = onValue(
        callRef,
        (snap) => {
          const data = snap.val();
          if (data?.status === 'ended') {
            this.onStateChange?.('ended');
          }
        },
        (err) => console.error('Call status listener error:', err)
      );
      this.unsubscribers.push(unsubStatus);
    }
  }

  toggleMute(muted) {
    this.localStream?.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }

  async hangUp() {
    await update(ref(db, `calls/${this.callId}`), { status: 'ended', endedAt: serverTimestamp() });
    this.cleanup();
  }

  cleanup() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.localStream?.getTracks().forEach(track => track.stop());
    this.pc?.close();
    this.pc = null;
  }
}

/**
 * Caller side: creates a new call record and notifies the callee
 * via their `incomingCalls/{uid}` pointer.
 */
export async function initiateCall(callerId, callerName, callerPhoto, calleeId) {
  const callRef = push(ref(db, 'calls'));
  const callId = callRef.key;

  await set(callRef, {
    callId,
    callerId,
    calleeId,
    callerName,
    callerPhoto: callerPhoto || null,
    status: 'ringing',
    createdAt: serverTimestamp(),
  });

  await set(ref(db, `incomingCalls/${calleeId}`), { callId });

  return callId;
}

/**
 * Callee side: accepts the call, clears their incoming-call pointer.
 */
export async function acceptCall(callId, calleeId) {
  await update(ref(db, `calls/${callId}`), { status: 'accepted' });
  await remove(ref(db, `incomingCalls/${calleeId}`));
}

/**
 * Callee side: declines the call.
 */
export async function declineCall(callId, calleeId) {
  await update(ref(db, `calls/${callId}`), { status: 'declined' });
  await remove(ref(db, `incomingCalls/${calleeId}`));
  scheduleCallCleanup(callId);
}

/**
 * Either side: ends an active call.
 */
export async function endCall(callId, uid) {
  await update(ref(db, `calls/${callId}`), { status: 'ended', endedAt: serverTimestamp() });
  await remove(ref(db, `incomingCalls/${uid}`)).catch(() => {});
  scheduleCallCleanup(callId);
}

/**
 * Cancels a call before it's answered (caller gave up / no answer).
 */
export async function cancelCall(callId, calleeId) {
  await update(ref(db, `calls/${callId}`), { status: 'cancelled' });
  await remove(ref(db, `incomingCalls/${calleeId}`));
  scheduleCallCleanup(callId);
}

/**
 * Deletes the call record (including signaling data/ICE candidates)
 * a short while after it ends, so Firebase doesn't accumulate stale
 * call history indefinitely. The delay gives the other peer's
 * listener time to observe the final status before data disappears.
 */
function scheduleCallCleanup(callId) {
  setTimeout(() => {
    remove(ref(db, `calls/${callId}`)).catch(() => {});
  }, 10000);
}
