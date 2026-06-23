import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUsers, useLastMessages } from '../hooks/useChat';
import ProfileDrawer from './ProfileDrawer';
import NewGroupModal from './NewGroupModal';
import toast from 'react-hot-toast';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'dd/MM/yy');
}

function AvatarFallback({ name, size = 46 }) {
  const colors = ['#6D28D9', '#4C1D95', '#8B5CF6', '#9333EA', '#A855F7'];
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

export default function Sidebar({ selectedUser, onSelectUser, isMobileVisible }) {
  const { currentUser, userProfile, markAllAsRead, followUser, unfollowUser, isFollowing, myFollowing } = useAuth();
  const navigate = useNavigate();
  const { users, loading } = useUsers();
  const lastMessages = useLastMessages(users);
  const [search, setSearch] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const menuRef = useRef(null);
  const menuBtnRef = useRef(null);

  // Close 3-dot menu on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        showMenu &&
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        !menuBtnRef.current.contains(e.target)
      ) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showMenu]);

  async function handleMarkAllRead() {
    setShowMenu(false);
    try {
      await markAllAsRead();
      toast.success('All chats marked as read');
    } catch {
      toast.error('Failed to mark as read');
    }
  }

  const isSearching = search.trim().length > 0;

  const filtered = users.filter(u =>
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  // Chat list (no search) only shows people I follow
  const followedUsers = users.filter(u => isFollowing(u.uid));

  const baseList = isSearching ? filtered : followedUsers;

  // Sort: users with recent messages first
  const sorted = [...baseList].sort((a, b) => {
    const ta = lastMessages[a.uid]?.timestamp || 0;
    const tb = lastMessages[b.uid]?.timestamp || 0;
    return tb - ta;
  });

  async function handleFollowToggle(e, targetUid, username) {
    e.stopPropagation(); // don't trigger chat open when tapping the follow button
    try {
      if (isFollowing(targetUid)) {
        await unfollowUser(targetUid);
        toast.success(`Unfollowed ${username}`);
      } else {
        await followUser(targetUid);
        toast.success(`Following ${username}`);
      }
    } catch {
      toast.error('Action failed. Try again.');
    }
  }

  const myPhoto = userProfile?.photoURL || currentUser?.photoURL;
  const myName = userProfile?.username || currentUser?.displayName || 'Me';

  return (
    <>
      <aside className={`sidebar ${!isMobileVisible ? 'hidden' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-header-user" onClick={() => setShowProfile(true)}>
            {myPhoto
              ? <img className="sidebar-avatar" src={myPhoto} alt="me" />
              : <AvatarFallback name={myName} size={38} />}
          </div>
          <div className="sidebar-actions">
            <button className="icon-btn" title="Search" onClick={() => {}}>🔍</button>
            <div className="sidebar-menu-wrapper">
              <button
                ref={menuBtnRef}
                className="icon-btn"
                title="Menu"
                onClick={() => setShowMenu(v => !v)}
              >
                ⋮
              </button>
              {showMenu && (
                <div className="sidebar-menu-dropdown" ref={menuRef}>
                  <button className="chat-menu-item" onClick={() => { setShowMenu(false); setShowNewGroup(true); }}>
                    👥 New group
                  </button>
                  <button className="chat-menu-item" onClick={handleMarkAllRead}>
                    ✓✓ Read all
                  </button>
                  <button className="chat-menu-item" onClick={() => { setShowMenu(false); navigate('/settings'); }}>
                    ⚙️ Settings
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              type="text"
              placeholder="Search by username to find someone"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="chat-list">
          {loading && (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          )}

          {!loading && sorted.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              {isSearching
                ? <>No one found with that username.<br/>Ask them to register on VartaLap first.</>
                : <>You're not following anyone yet.<br/>Search by username above to find someone.</>}
            </div>
          )}

          {!loading && isSearching && sorted.length > 0 && (
            <div className="search-result-hint">
              Follow someone to start chatting with them
            </div>
          )}

          {sorted.map(user => {
            const lastMsg = lastMessages[user.uid];
            const isActive = selectedUser?.uid === user.uid;
            const following = isFollowing(user.uid);
            return (
              <div
                key={user.uid}
                className={`chat-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (!following) return; // must follow before opening a chat
                  onSelectUser(user);
                  setSearch('');
                }}
              >
                <div className="chat-item-avatar">
                  {user.photoURL
                    ? <img src={user.photoURL} alt={user.username} />
                    : <AvatarFallback name={user.username} />}
                  {user.online && <span className="online-dot" />}
                </div>
                <div className="chat-item-content">
                  <div className="chat-item-top">
                    <span className="chat-item-name">{user.username}</span>
                    {lastMsg && (
                      <span className="chat-item-time">
                        {formatTime(lastMsg.timestamp)}
                      </span>
                    )}
                  </div>
                  <div className="chat-item-preview">
                    {following
                      ? (lastMsg
                          ? lastMsg.senderId === currentUser.uid
                            ? `You: ${lastMsg.text}`
                            : lastMsg.text
                          : user.status || 'Start a conversation')
                      : (user.status || 'Follow to start chatting')}
                  </div>
                </div>
                <button
                  className={`follow-btn ${following ? 'following' : ''}`}
                  onClick={(e) => handleFollowToggle(e, user.uid, user.username)}
                >
                  {following ? 'Following' : 'Follow'}
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {showProfile && <ProfileDrawer onClose={() => setShowProfile(false)} />}
      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onGroupCreated={() => {}}
        />
      )}
    </>
  );
}
