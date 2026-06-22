import { useState } from 'react';
import { useFollowing, useCreateGroup } from '../hooks/useChat';
import toast from 'react-hot-toast';

function AvatarFallback({ name, size = 40 }) {
  const colors = ['#5B3FE0', '#241456', '#7C5CFC', '#9B59F6', '#3D2A8C'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.4,
      flexShrink: 0,
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

export default function NewGroupModal({ onClose, onCreated }) {
  const { contacts: users, loading } = useFollowing();
  const { createGroup } = useCreateGroup();
  const [step, setStep] = useState('members'); // 'members' | 'details'
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = users.filter(u =>
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  function toggleMember(user) {
    setSelected(prev =>
      prev.some(u => u.uid === user.uid)
        ? prev.filter(u => u.uid !== user.uid)
        : [...prev, user]
    );
  }

  async function handleCreate() {
    if (!groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }
    setCreating(true);
    try {
      const groupId = await createGroup(groupName, selected.map(u => u.uid));
      toast.success('Group created! 🎉');
      onCreated?.(groupId);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create group');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer" style={{ left: 0 }}>
        <div className="drawer-header" style={{ position: 'relative' }}>
          <button className="drawer-close" onClick={onClose}>✕</button>
          <h2>{step === 'members' ? 'Add group members' : 'New group'}</h2>
          {step === 'members' && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
              {selected.length} of {users.length} selected
            </p>
          )}
        </div>

        <div className="drawer-body" style={{ padding: step === 'members' ? '12px 0' : 20 }}>
          {step === 'members' && (
            <>
              <div style={{ padding: '0 16px 12px' }}>
                <div className="search-box">
                  <span className="search-icon">🔍</span>
                  <input
                    className="search-input"
                    placeholder="Search contacts"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {loading && (
                <div style={{ textAlign: 'center', padding: 30 }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </div>
              )}

              {!loading && filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                  No contacts found
                </div>
              )}

              {filtered.map(user => {
                const isSelected = selected.some(u => u.uid === user.uid);
                return (
                  <div
                    key={user.uid}
                    className="chat-item"
                    onClick={() => toggleMember(user)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="chat-item-avatar">
                      {user.photoURL
                        ? <img src={user.photoURL} alt={user.username} />
                        : <AvatarFallback name={user.username} size={46} />}
                    </div>
                    <div className="chat-item-content">
                      <div className="chat-item-name">{user.username}</div>
                    </div>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      border: isSelected ? 'none' : '2px solid var(--border)',
                      background: isSelected ? 'var(--teal-500)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 13, flexShrink: 0,
                    }}>
                      {isSelected && '✓'}
                    </div>
                  </div>
                );
              })}

              <div style={{ padding: '16px' }}>
                <button
                  className="btn-primary"
                  disabled={selected.length === 0}
                  onClick={() => setStep('details')}
                >
                  Next ({selected.length} selected)
                </button>
              </div>
            </>
          )}

          {step === 'details' && (
            <>
              <div className="avatar-upload" style={{ justifyContent: 'center', marginBottom: 20 }}>
                <div className="avatar-preview" style={{ width: 80, height: 80 }}>
                  <div className="avatar-placeholder" style={{ fontSize: 32 }}>👥</div>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">Group name</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. Project Squad"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  autoFocus
                />
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Members ({selected.length})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {selected.map(u => (
                  <div key={u.uid} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--bg-main)', borderRadius: 20,
                    padding: '5px 10px 5px 5px', fontSize: 13,
                  }}>
                    {u.photoURL
                      ? <img src={u.photoURL} alt={u.username} style={{ width: 22, height: 22, borderRadius: '50%' }} />
                      : <AvatarFallback name={u.username} size={22} />}
                    {u.username}
                  </div>
                ))}
              </div>

              <button className="btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create group'}
              </button>
              <button
                onClick={() => setStep('members')}
                style={{
                  marginTop: 10, width: '100%', padding: 10,
                  background: 'none', border: 'none',
                  color: 'var(--teal-700)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                ← Back to members
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
