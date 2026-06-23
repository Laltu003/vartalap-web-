import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function ProfileDrawer({ onClose }) {
  const { currentUser, userProfile, updateUserProfile, logout } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef();
  const [form, setForm] = useState({
    username: userProfile?.username || currentUser?.displayName || '',
    status: userProfile?.status || "Hey, I'm using VartaLap!",
  });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [saving, setSaving] = useState(false);

  function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!form.username.trim()) { toast.error('Username cannot be empty'); return; }
    setSaving(true);
    try {
      await updateUserProfile({ username: form.username, status: form.status, avatarFile });
      toast.success('Profile updated!');
      onClose();
    } catch {
      toast.error('Failed to update profile.', { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } });
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const avatarSrc = avatarPreview || userProfile?.photoURL || currentUser?.photoURL;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header" style={{ position: 'relative' }}>
          <button className="drawer-close" onClick={onClose}>✕</button>
          <h2>Profile</h2>
        </div>

        <div className="drawer-body">
          {/* Avatar */}
          <div className="drawer-avatar-section">
            {avatarSrc
              ? <img className="drawer-avatar" src={avatarSrc} alt="Profile" onClick={() => fileRef.current.click()} />
              : (
                <div
                  style={{
                    width: 120, height: 120, borderRadius: '50%',
                    background: 'var(--teal-700)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 48, cursor: 'pointer',
                  }}
                  onClick={() => fileRef.current.click()}
                >
                  {(userProfile?.username || '?')[0].toUpperCase()}
                </div>
              )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            <button className="avatar-upload-btn" onClick={() => fileRef.current.click()} style={{ padding: '6px 16px', borderRadius: 8 }}>
              📷 Change photo
            </button>
          </div>

          {/* Fields */}
          <div className="profile-field">
            <label>Your name</label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              placeholder="Your name"
            />
          </div>

          <div className="profile-field">
            <label>Status</label>
            <input
              type="text"
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              placeholder="What's on your mind?"
            />
          </div>

          <div className="profile-field">
            <label>Email</label>
            <input type="email" value={currentUser?.email || ''} readOnly style={{ color: 'var(--text-muted)' }} />
          </div>

          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>

          <button
            onClick={handleLogout}
            style={{
              marginTop: 16, width: '100%', padding: 12,
              background: 'none', border: '1.5px solid #FFE0E0',
              borderRadius: 8, color: '#E53935',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >
            🚪 Sign out
          </button>

          {userProfile?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              style={{
                marginTop: 10, width: '100%', padding: 12,
                background: 'none', border: '1.5px solid var(--border)',
                borderRadius: 8, color: 'var(--teal-700)',
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              ⚙️ Admin Panel
            </button>
          )}
        </div>
      </div>
    </>
  );
}
