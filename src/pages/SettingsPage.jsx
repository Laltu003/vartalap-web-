import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { updatePassword, deleteUser } from 'firebase/auth';
import { ref, update, remove, get, onValue } from 'firebase/database';
import { db } from '../firebase/config';
import toast from 'react-hot-toast';

const errorToast = { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } };

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 26, borderRadius: 13, border: 'none',
        background: checked ? 'var(--teal-700)' : 'var(--border)',
        position: 'relative', cursor: 'pointer', flexShrink: 0,
        transition: 'background 150ms ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        transition: 'left 150ms ease', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

export default function SettingsPage() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState('main'); // 'main' | 'account' | 'privacy' | 'notifications'

  // Account state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Privacy state
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [blockedUsers, setBlockedUsers] = useState([]);

  // Notifications state (stored in localStorage — no backend needed)
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [previewEnabled, setPreviewEnabled] = useState(true);

  useEffect(() => {
    setShowOnlineStatus(userProfile?.showOnlineStatus !== false);
  }, [userProfile]);

  useEffect(() => {
    const sound = localStorage.getItem('vartalap_sound');
    const preview = localStorage.getItem('vartalap_preview');
    setSoundEnabled(sound !== 'off');
    setPreviewEnabled(preview !== 'off');
  }, []);

  // Load blocked users list
  useEffect(() => {
    if (!currentUser) return;
    const blockedRef = ref(db, `users/${currentUser.uid}/blocked`);
    const unsub = onValue(
      blockedRef,
      async (snap) => {
        if (!snap.exists()) { setBlockedUsers([]); return; }
        const uids = Object.keys(snap.val());
        const profiles = await Promise.all(uids.map(uid => get(ref(db, `users/${uid}`))));
        setBlockedUsers(profiles.filter(p => p.exists()).map(p => p.val()));
      },
      (err) => console.error('SettingsPage blocked listener error:', err)
    );
    return unsub;
  }, [currentUser]);

  async function handleChangePassword() {
    if (newPassword.length < 6) { toast.error('Password must be 6+ characters'); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords don't match"); return; }
    setSavingPassword(true);
    try {
      await updatePassword(currentUser, newPassword);
      toast.success('Password updated!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const msg = err.code === 'auth/requires-recent-login'
        ? 'Please sign out and sign in again before changing your password.'
        : 'Failed to update password.';
      toast.error(msg, errorToast);
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Delete your account permanently? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const username = userProfile?.username;
      await remove(ref(db, `users/${currentUser.uid}`));
      if (username) await remove(ref(db, `usernames/${username.toLowerCase()}`));
      await remove(ref(db, `starred/${currentUser.uid}`));
      await deleteUser(currentUser);
      toast.success('Account deleted');
      navigate('/login');
    } catch (err) {
      const msg = err.code === 'auth/requires-recent-login'
        ? 'Please sign out and sign in again before deleting your account.'
        : 'Failed to delete account.';
      toast.error(msg, errorToast);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleOnlineStatus(value) {
    setShowOnlineStatus(value);
    await update(ref(db, `users/${currentUser.uid}`), { showOnlineStatus: value });
  }

  async function unblockUser(uid) {
    await remove(ref(db, `users/${currentUser.uid}/blocked/${uid}`));
    toast.success('Unblocked');
  }

  function toggleSound(value) {
    setSoundEnabled(value);
    localStorage.setItem('vartalap_sound', value ? 'on' : 'off');
  }

  function togglePreview(value) {
    setPreviewEnabled(value);
    localStorage.setItem('vartalap_preview', value ? 'on' : 'off');
  }

  const menuItems = [
    { id: 'account', icon: '🔑', label: 'Account', sub: 'Password, delete account' },
    { id: 'privacy', icon: '🔒', label: 'Privacy', sub: 'Blocked contacts, online status' },
    { id: 'notifications', icon: '🔔', label: 'Notifications', sub: 'Sound, message previews' },
  ];

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="chat-header-back" style={{ display: 'flex' }} onClick={() => section === 'main' ? navigate('/') : setSection('main')}>←</button>
          <span style={{ fontWeight: 600, fontSize: 17 }}>
            {section === 'main' ? 'Settings'
              : section === 'account' ? 'Account'
              : section === 'privacy' ? 'Privacy'
              : 'Notifications'}
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {section === 'main' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 16px', borderBottom: '1px solid var(--border-light)' }}>
                {userProfile?.photoURL
                  ? <img src={userProfile.photoURL} alt="" style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--teal-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 700 }}>{(userProfile?.username || '?')[0].toUpperCase()}</div>}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{userProfile?.username}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{userProfile?.status}</div>
                </div>
              </div>

              {menuItems.map(item => (
                <div key={item.id} className="chat-item" onClick={() => setSection(item.id)} style={{ cursor: 'pointer' }}>
                  <div style={{ fontSize: 22, width: 40, textAlign: 'center' }}>{item.icon}</div>
                  <div className="chat-item-content">
                    <div className="chat-item-name">{item.label}</div>
                    <div className="chat-item-preview">{item.sub}</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {section === 'account' && (
            <div style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>Change password</h3>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <input
                  className="form-input"
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
              <button className="btn-primary" onClick={handleChangePassword} disabled={savingPassword}>
                {savingPassword ? 'Updating…' : 'Update password'}
              </button>

              <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 14, color: '#E53935', marginBottom: 10 }}>Danger zone</h3>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  style={{
                    width: '100%', padding: 12, background: 'none',
                    border: '1.5px solid #FFCDD2', borderRadius: 8,
                    color: '#E53935', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  {deleting ? 'Deleting…' : '🗑 Delete my account'}
                </button>
              </div>
            </div>
          )}

          {section === 'privacy' && (
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>Show online status</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Let others see when you're online</div>
                </div>
                <Toggle checked={showOnlineStatus} onChange={toggleOnlineStatus} />
              </div>

              <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '24px 0 10px' }}>Blocked contacts</h3>
              {blockedUsers.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>You haven't blocked anyone</p>
              )}
              {blockedUsers.map(u => (
                <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                  {u.photoURL
                    ? <img src={u.photoURL} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                    : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--teal-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>{(u.username || '?')[0].toUpperCase()}</div>}
                  <span style={{ flex: 1, fontSize: 14 }}>{u.username}</span>
                  <button className="action-btn" onClick={() => unblockUser(u.uid)}>Unblock</button>
                </div>
              ))}
            </div>
          )}

          {section === 'notifications' && (
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>Message sound</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Play a sound for new messages</div>
                </div>
                <Toggle checked={soundEnabled} onChange={toggleSound} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>Message previews</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Show message text in chat list</div>
                </div>
                <Toggle checked={previewEnabled} onChange={togglePreview} />
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="chat-empty" style={{ flex: 1 }}>
        <div className="chat-empty-icon">⚙️</div>
        <div className="chat-empty-title">Settings</div>
        <div className="chat-empty-sub">Manage your account and preferences</div>
      </div>
    </div>
  );
}
