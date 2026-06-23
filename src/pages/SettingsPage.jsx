import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useUsers, checkUsernameAvailable, normalizeUsername } from '../hooks/useChat';
import { useDebounce } from '../hooks/useDebounce';
import toast from 'react-hot-toast';

const errStyle = { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } };
const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,20}$/;

function AvatarFallback({ name, size = 80 }) {
  const colors = ['#128C7E', '#075E54', '#25D366', '#0080A0', '#6B46C1'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.4, flexShrink: 0,
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

// Sections: 'main' | 'account' | 'privacy' | 'chats' | 'appearance' | 'notifications'
export default function SettingsPage() {
  const navigate = useNavigate();
  const {
    currentUser, userProfile, updateUserProfile, logout,
    blockUser, unblockUser, clearAllChatHistory, setNotificationsEnabled,
  } = useAuth();
  const { mode, setThemeMode } = useTheme();
  const { users } = useUsers();
  const fileRef = useRef();

  const [section, setSection] = useState('main');

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [form, setForm] = useState({
    username: userProfile?.username || currentUser?.displayName || '',
    status: userProfile?.status || "Hey, I'm using VartaLap!",
  });
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [saving, setSaving] = useState(false);

  // ── Username availability state (for editing) ───────────
  // status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'unchanged'
  const [usernameStatus, setUsernameStatus] = useState('unchanged');
  const debouncedUsername = useDebounce(form.username, 450);
  const originalUsernameKey = normalizeUsername(userProfile?.username || '');

  useEffect(() => {
    const raw = debouncedUsername.trim();
    if (!raw) { setUsernameStatus('idle'); return; }
    if (normalizeUsername(raw) === originalUsernameKey) { setUsernameStatus('unchanged'); return; }
    if (!USERNAME_REGEX.test(raw)) { setUsernameStatus('invalid'); return; }

    let cancelled = false;
    setUsernameStatus('checking');
    checkUsernameAvailable(raw).then(isAvailable => {
      if (cancelled) return;
      setUsernameStatus(isAvailable ? 'available' : 'taken');
    }).catch(() => {
      if (!cancelled) setUsernameStatus('idle');
    });

    return () => { cancelled = true; };
  }, [debouncedUsername, originalUsernameKey]);

  // Notifications local toggle (also synced to DB)
  const [notifEnabled, setNotifEnabled] = useState(
    userProfile?.settings?.notificationsEnabled !== false
  );

  const blockedList = users.filter(u => userProfile?.blocked?.[u.uid]);
  const myPhoto = avatarPreview || userProfile?.photoURL || currentUser?.photoURL;
  const myName = userProfile?.username || currentUser?.displayName || 'Me';

  function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB', errStyle); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSaveProfile() {
    if (!form.username.trim()) { toast.error('Username cannot be empty', errStyle); return; }
    if (!USERNAME_REGEX.test(form.username.trim())) { toast.error('Invalid username format', errStyle); return; }
    if (usernameStatus === 'taken') { toast.error('That username is already taken', errStyle); return; }
    if (usernameStatus === 'checking') { toast.error('Still checking username availability…', errStyle); return; }

    setSaving(true);
    try {
      await updateUserProfile({ username: form.username.trim(), status: form.status, avatarFile });
      toast.success('Profile updated!');
      setEditingProfile(false);
      setAvatarFile(null);
    } catch (err) {
      if (err.code === 'auth/username-taken') {
        toast.error('Username was just taken — try another.', errStyle);
        setUsernameStatus('taken');
      } else {
        toast.error('Failed to update profile.', errStyle);
      }
    } finally { setSaving(false); }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  async function handleUnblock(uid, name) {
    await unblockUser(uid);
    toast.success(`Unblocked ${name}`);
  }

  async function handleNotifToggle() {
    const next = !notifEnabled;
    setNotifEnabled(next);
    try {
      await setNotificationsEnabled(next);
      toast.success(next ? 'Notifications enabled' : 'Notifications muted');
    } catch {
      setNotifEnabled(!next); // revert on failure
      toast.error('Failed to update setting', errStyle);
    }
  }

  async function handleClearHistory() {
    if (!window.confirm('Delete all chat history from your view? This cannot be undone.')) return;
    try {
      await clearAllChatHistory();
      toast.success('Chat history cleared');
    } catch {
      toast.error('Failed to clear history', errStyle);
    }
  }

  // ── Settings list items for main menu ───────────────────
  const menuItems = [
    { id: 'account', icon: '🔑', title: 'Account', subtitle: 'Security, email, password' },
    { id: 'privacy', icon: '🔒', title: 'Privacy', subtitle: 'Blocked contacts' },
    { id: 'chats', icon: '💬', title: 'Chats', subtitle: 'Chat history, wallpaper' },
    { id: 'appearance', icon: '🎨', title: 'Appearance', subtitle: 'Theme, dark mode' },
    { id: 'notifications', icon: '🔔', title: 'Notifications', subtitle: 'Message notifications' },
  ];

  return (
    <div className="settings-page">
      {/* ════════════ HEADER ════════════ */}
      <div className="settings-header">
        <button className="icon-btn" onClick={() => section === 'main' ? navigate('/') : setSection('main')}>←</button>
        <h2>{section === 'main' ? 'Settings' : menuItems.find(m => m.id === section)?.title || 'Settings'}</h2>
      </div>

      <div className="settings-body">

        {/* ════════════ MAIN MENU ════════════ */}
        {section === 'main' && (
          <>
            {/* Profile card */}
            <div className="settings-profile-card" onClick={() => setSection('account')}>
              {myPhoto
                ? <img className="settings-profile-avatar" src={myPhoto} alt="me" />
                : <AvatarFallback name={myName} />}
              <div className="settings-profile-info">
                <span className="settings-profile-name">{myName}</span>
                <span className="settings-profile-status">{userProfile?.status || "Hey, I'm using VartaLap!"}</span>
              </div>
              <span className="settings-chevron">›</span>
            </div>

            <div className="settings-menu-list">
              {menuItems.map(item => (
                <div key={item.id} className="settings-menu-item" onClick={() => setSection(item.id)}>
                  <span className="settings-menu-icon">{item.icon}</span>
                  <div className="settings-menu-text">
                    <span className="settings-menu-title">{item.title}</span>
                    <span className="settings-menu-subtitle">{item.subtitle}</span>
                  </div>
                  <span className="settings-chevron">›</span>
                </div>
              ))}
            </div>

            <button className="settings-logout-btn" onClick={handleLogout}>
              🚪 Sign out
            </button>

            {userProfile?.role === 'admin' && (
              <button className="settings-admin-btn" onClick={() => navigate('/admin')}>
                ⚙️ Admin Panel
              </button>
            )}

            <p className="settings-version">VartaLap · v1.0.0</p>
          </>
        )}

        {/* ════════════ ACCOUNT / PROFILE ════════════ */}
        {section === 'account' && (
          <div className="settings-section">
            <div className="drawer-avatar-section">
              {myPhoto
                ? <img className="drawer-avatar" src={myPhoto} alt="Profile" onClick={() => fileRef.current.click()} />
                : <AvatarFallback name={myName} size={120} />}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
              <button className="avatar-upload-btn" onClick={() => fileRef.current.click()} style={{ padding: '6px 16px', borderRadius: 8, marginTop: 8 }}>
                📷 Change photo
              </button>
            </div>

            <div className="profile-field">
              <label>Username</label>
              <div className={`username-input-wrapper ${usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'has-error' : ''} ${usernameStatus === 'available' ? 'has-success' : ''}`}>
                <span className="username-at-prefix">@</span>
                <input
                  className={`username-input ${usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'error' : ''} ${usernameStatus === 'available' ? 'success' : ''}`}
                  type="text"
                  value={form.username}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value.replace(/\s/g, '') }))}
                  placeholder="yourname"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </div>
              {usernameStatus === 'checking' && <span className="username-indicator checking">Checking…</span>}
              {usernameStatus === 'available' && <span className="username-indicator available">✅ Available</span>}
              {usernameStatus === 'taken' && <span className="username-indicator taken">❌ Taken</span>}
              {usernameStatus === 'invalid' && <span className="username-indicator invalid">⚠️ 3-20 chars: letters, numbers, _ or .</span>}
            </div>

            <div className="profile-field">
              <label>About / Status</label>
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

            <button className="save-btn" onClick={handleSaveProfile} disabled={saving || usernameStatus === 'checking' || usernameStatus === 'taken'}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}

        {/* ════════════ PRIVACY / BLOCKED ════════════ */}
        {section === 'privacy' && (
          <div className="settings-section">
            <h3 className="settings-subheading">Blocked contacts</h3>
            {blockedList.length === 0 ? (
              <p className="settings-empty-text">No blocked contacts. Open a chat → menu → Block to block someone.</p>
            ) : (
              <div className="settings-menu-list">
                {blockedList.map(u => (
                  <div key={u.uid} className="settings-menu-item">
                    {u.photoURL ? <img src={u.photoURL} className="chat-item-avatar" style={{ width: 40, height: 40, borderRadius: '50%' }} alt={u.username} /> : <AvatarFallback name={u.username} size={40} />}
                    <div className="settings-menu-text">
                      <span className="settings-menu-title">{u.username}</span>
                    </div>
                    <button className="settings-unblock-btn" onClick={() => handleUnblock(u.uid, u.username)}>
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════ CHATS ════════════ */}
        {section === 'chats' && (
          <div className="settings-section">
            <h3 className="settings-subheading">Chat history</h3>
            <button className="settings-danger-btn" onClick={handleClearHistory}>
              🗑️ Clear all chat history
            </button>
            <p className="settings-helper-text">This removes chats from your list. The other person's copy is not affected.</p>
          </div>
        )}

        {/* ════════════ APPEARANCE / THEME ════════════ */}
        {section === 'appearance' && (
          <div className="settings-section">
            <h3 className="settings-subheading">Theme</h3>
            <div className="theme-options">
              {[
                { key: 'light', label: '☀️ Light' },
                { key: 'dark', label: '🌙 Dark' },
                { key: 'system', label: '🖥️ System default' },
              ].map(opt => (
                <button
                  key={opt.key}
                  className={`theme-option-btn ${mode === opt.key ? 'active' : ''}`}
                  onClick={() => setThemeMode(opt.key)}
                >
                  <span>{opt.label}</span>
                  {mode === opt.key && <span className="theme-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ════════════ NOTIFICATIONS ════════════ */}
        {section === 'notifications' && (
          <div className="settings-section">
            <div className="settings-toggle-row">
              <div>
                <span className="settings-menu-title">Message notifications</span>
                <p className="settings-helper-text" style={{ margin: 0 }}>Show alerts for new messages</p>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={notifEnabled} onChange={handleNotifToggle} />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
