import { useCall } from '../context/CallContext';

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function AvatarCircle({ name, photo, size = 120 }) {
  if (photo) {
    return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(255,255,255,0.15)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, color: '#fff', fontWeight: 700,
    }}>
      {(name || '?')[0]?.toUpperCase()}
    </div>
  );
}

export default function CallOverlay() {
  const { callStatus, activeCall, isMuted, callDuration, answerCall, rejectCall, hangUp, toggleMute } = useCall();

  if (callStatus === 'idle' || !activeCall) return null;

  const isRingingOutgoing = callStatus === 'ringing-outgoing';
  const isRingingIncoming = callStatus === 'ringing-incoming';
  const isConnected = callStatus === 'connected';

  return (
    <div style={styles.overlay}>
      <div style={styles.content}>
        <AvatarCircle name={activeCall.peerName} photo={activeCall.peerPhoto} />
        <h2 style={styles.name}>{activeCall.peerName}</h2>
        <p style={styles.status}>
          {isRingingOutgoing && 'Calling…'}
          {isRingingIncoming && 'Incoming voice call'}
          {isConnected && formatDuration(callDuration)}
        </p>
      </div>

      <div style={styles.controls}>
        {isRingingIncoming ? (
          <>
            <button onClick={rejectCall} style={{ ...styles.circleBtn, background: '#E53935' }}>
              ✕
            </button>
            <button onClick={answerCall} style={{ ...styles.circleBtn, background: '#25D366' }}>
              📞
            </button>
          </>
        ) : (
          <>
            {isConnected && (
              <button
                onClick={toggleMute}
                style={{ ...styles.circleBtn, background: isMuted ? '#fff' : 'rgba(255,255,255,0.2)', color: isMuted ? '#241456' : '#fff' }}
              >
                {isMuted ? '🔇' : '🎙️'}
              </button>
            )}
            <button onClick={hangUp} style={{ ...styles.circleBtn, background: '#E53935' }}>
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'linear-gradient(180deg, #241456 0%, #5B3FE0 100%)',
    zIndex: 3000,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'space-between',
    padding: '80px 24px 60px',
  },
  content: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    marginTop: 60,
  },
  name: {
    color: '#fff', fontSize: 24, fontWeight: 600, margin: 0,
  },
  status: {
    color: 'rgba(255,255,255,0.75)', fontSize: 15, margin: 0,
  },
  controls: {
    display: 'flex', gap: 28, alignItems: 'center',
  },
  circleBtn: {
    width: 64, height: 64, borderRadius: '50%',
    border: 'none', color: '#fff', fontSize: 24,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'transform 150ms ease',
  },
};
