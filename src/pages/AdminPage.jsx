import { useState, useEffect } from 'react';
import { ref, onValue, update, remove, get } from 'firebase/database';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

function formatDate(ts) {
  if (!ts) return '—';
  try { return format(new Date(ts), 'dd MMM yyyy, HH:mm'); } catch { return '—'; }
}

export default function AdminPage() {
  const { currentUser, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, online: 0, admins: 0, messages: 0 });
  const [search, setSearch] = useState('');
  const [msgCount, setMsgCount] = useState(0);

  // Load all users
  useEffect(() => {
    const usersRef = ref(db, 'users');
    const unsub = onValue(usersRef, (snap) => {
      const list = [];
      let onlineCount = 0, adminCount = 0;
      snap.forEach((child) => {
        const u = child.val();
        list.push(u);
        if (u.online) onlineCount++;
        if (u.role === 'admin') adminCount++;
      });
      setUsers(list);
      setStats(prev => ({ ...prev, total: list.length, online: onlineCount, admins: adminCount }));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Count total messages across all chats
  useEffect(() => {
    const chatsRef = ref(db, 'chats');
    const unsub = onValue(chatsRef, (snap) => {
      let count = 0;
      snap.forEach((chatSnap) => {
        const msgs = chatSnap.child('messages');
        count += msgs.size || 0;
      });
      setStats(prev => ({ ...prev, messages: count }));
    });
    return unsub;
  }, []);

  async function toggleRole(user) {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await update(ref(db, `users/${user.uid}`), { role: newRole });
      toast.success(`${user.username} is now ${newRole}`);
    } catch {
      toast.error('Failed to update role', { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } });
    }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Delete ${user.username}? This cannot be undone.`)) return;
    try {
      await remove(ref(db, `users/${user.uid}`));
      toast.success(`${user.username} removed`);
    } catch {
      toast.error('Failed to delete user', { style: { background: '#c0392b', color: '#fff', fontSize: '14px', borderRadius: '10px' } });
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const filteredUsers = users.filter(u =>
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const navItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'users', icon: '👥', label: 'Users' },
    { id: 'messages', icon: '💬', label: 'Messages' },
  ];

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <nav className="admin-sidebar">
        <div className="admin-sidebar-logo">
          <h2>💬 VartaLap</h2>
          <p>Admin Panel</p>
        </div>
        <div className="admin-nav">
          {navItems.map(item => (
            <div
              key={item.id}
              className={`admin-nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
          <div className="admin-nav-item" onClick={() => navigate('/')}>
            <span>💬</span>
            <span>Back to Chat</span>
          </div>
        </div>
        <button className="admin-logout-btn" onClick={handleLogout}>
          🚪 <span>Sign out</span>
        </button>
      </nav>

      {/* Content */}
      <main className="admin-content">
        {/* Dashboard */}
        {tab === 'dashboard' && (
          <>
            <h1 className="admin-page-title">Dashboard</h1>
            <p className="admin-page-sub">Welcome back, {userProfile?.username || 'Admin'}</p>

            <div className="stat-cards">
              <div className="stat-card">
                <div className="stat-card-icon">👥</div>
                <div className="stat-card-value">{stats.total}</div>
                <div className="stat-card-label">Total Users</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon">🟢</div>
                <div className="stat-card-value">{stats.online}</div>
                <div className="stat-card-label">Online Now</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon">💬</div>
                <div className="stat-card-value">{stats.messages}</div>
                <div className="stat-card-label">Messages Sent</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon">⚙️</div>
                <div className="stat-card-value">{stats.admins}</div>
                <div className="stat-card-label">Admins</div>
              </div>
            </div>

            {/* Recent users table */}
            <div className="admin-table-card">
              <div className="admin-table-header">
                <span className="admin-table-title">Recent Users</span>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Role</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.slice(0, 8).map(u => (
                    <tr key={u.uid}>
                      <td>
                        <div className="user-cell">
                          {u.photoURL
                            ? <img src={u.photoURL} alt={u.username} />
                            : <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'var(--teal-700)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 700, fontSize: 14,
                              }}>{(u.username || '?')[0].toUpperCase()}</div>}
                          {u.username}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td>
                        <span className={`badge ${u.online ? 'badge-online' : 'badge-offline'}`}>
                          {u.online ? '● Online' : '○ Offline'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}`}>
                          {u.role === 'admin' ? '⚙ Admin' : '👤 User'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {formatDate(u.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Users tab */}
        {tab === 'users' && (
          <>
            <h1 className="admin-page-title">User Management</h1>
            <p className="admin-page-sub">{users.length} registered users</p>

            {/* Search */}
            <div style={{ marginBottom: 18 }}>
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  padding: '9px 14px', border: '1.5px solid var(--border)',
                  borderRadius: 8, fontSize: 14, width: '100%',
                  maxWidth: 320, outline: 'none', fontFamily: 'var(--font)',
                }}
              />
            </div>

            <div className="admin-table-card">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Role</th>
                    <th>Last Seen</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.uid}>
                      <td>
                        <div className="user-cell">
                          {u.photoURL
                            ? <img src={u.photoURL} alt={u.username} />
                            : <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'var(--teal-700)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 700, fontSize: 13,
                              }}>{(u.username || '?')[0].toUpperCase()}</div>}
                          <div>
                            <div style={{ fontWeight: 500 }}>{u.username}</div>
                            {u.uid === currentUser.uid && (
                              <div style={{ fontSize: 11, color: 'var(--teal-700)' }}>You</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{u.email}</td>
                      <td>
                        <span className={`badge ${u.online ? 'badge-online' : 'badge-offline'}`}>
                          {u.online ? '● Online' : '○ Offline'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}`}>
                          {u.role === 'admin' ? '⚙ Admin' : '👤 User'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {u.online ? 'Now' : formatDate(u.lastSeen)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {u.uid !== currentUser.uid && (
                            <>
                              <button
                                className="action-btn"
                                onClick={() => toggleRole(u)}
                                title={u.role === 'admin' ? 'Remove admin' : 'Make admin'}
                              >
                                {u.role === 'admin' ? '⬇ Demote' : '⬆ Promote'}
                              </button>
                              <button
                                className="action-btn danger"
                                onClick={() => deleteUser(u)}
                                title="Remove user"
                              >
                                🗑 Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredUsers.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No users found
                </div>
              )}
            </div>
          </>
        )}

        {/* Messages tab */}
        {tab === 'messages' && (
          <>
            <h1 className="admin-page-title">Messages Overview</h1>
            <p className="admin-page-sub">Overview of chat activity</p>

            <div className="stat-cards" style={{ marginBottom: 24 }}>
              <div className="stat-card">
                <div className="stat-card-icon">💬</div>
                <div className="stat-card-value">{stats.messages}</div>
                <div className="stat-card-label">Total Messages</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon">👥</div>
                <div className="stat-card-value">{Math.floor(stats.total * (stats.total - 1) / 2)}</div>
                <div className="stat-card-label">Possible Chat Rooms</div>
              </div>
            </div>

            <div className="admin-table-card">
              <div className="admin-table-header">
                <span className="admin-table-title">Active Users</span>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Status</th>
                    <th>Bio</th>
                  </tr>
                </thead>
                <tbody>
                  {users.filter(u => u.online).map(u => (
                    <tr key={u.uid}>
                      <td>
                        <div className="user-cell">
                          {u.photoURL
                            ? <img src={u.photoURL} alt={u.username} />
                            : <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'var(--teal-700)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 700, fontSize: 13,
                              }}>{(u.username || '?')[0].toUpperCase()}</div>}
                          {u.username}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-online">● Online</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        {u.status || '—'}
                      </td>
                    </tr>
                  ))}
                  {users.filter(u => u.online).length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                        No users online right now
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
