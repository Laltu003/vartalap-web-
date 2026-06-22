import { useStarredMessages } from '../hooks/useChat';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function StarredMessagesDrawer({ onClose }) {
  const { starred, loading, unstar } = useStarredMessages();

  async function handleUnstar(id) {
    await unstar(id);
    toast.success('Removed from starred');
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header" style={{ position: 'relative' }}>
          <button className="drawer-close" onClick={onClose}>✕</button>
          <h2>⭐ Starred messages</h2>
        </div>

        <div className="drawer-body" style={{ padding: 0 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          )}

          {!loading && starred.length === 0 && (
            <div style={{ textAlign: 'center', padding: '50px 24px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
              <p style={{ fontSize: 14 }}>No starred messages yet</p>
              <p style={{ fontSize: 12, marginTop: 6 }}>Tap and hold any message to star it</p>
            </div>
          )}

          {starred.map(msg => (
            <div key={msg.id} style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--teal-700)', fontWeight: 600, marginBottom: 4 }}>
                    {msg.sourceType === 'group' ? `Group · ${msg.senderName || 'Member'}` : 'Direct message'}
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {msg.text}
                  </p>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {msg.timestamp ? format(new Date(msg.timestamp), 'MMM d, yyyy · HH:mm') : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleUnstar(msg.id)}
                  title="Remove from starred"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 18, color: '#F5A623', flexShrink: 0,
                  }}
                >
                  ⭐
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
