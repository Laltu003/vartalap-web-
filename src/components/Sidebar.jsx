import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFollowing, useLastMessages, useGroups, useUserSearch } from '../hooks/useChat';
import ProfileDrawer from './ProfileDrawer';
import NewGroupModal from './NewGroupModal';
import StarredMessagesDrawer from './StarredMessagesDrawer';
import { format, isToday, isYesterday } from 'date-fns';
import toast from 'react-hot-toast';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'dd/MM/yy');
}

function AvatarFallback({ name, size = 46 }) {
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

export default function Sidebar({ selectedUser, selectedGroup, onSelectUser, onSelectGroup, isMobileVisible, onOpenCamera }) {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const { contacts, followingIds, loading, error: contactsError, followUser } = useFollowing();
  const { groups, loading: groupsLoading, error: groupsError } = useGroups();
  const lastMessages = useLastMessages(contacts);
  const [search, setSearch] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [followingInProgress, setFollowingInProgress] = useState(null);
  const menuRef = useRef(null);

  const { results: searchResults, loading: searchLoading } = useUserSearch(search);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const trimmedSearch = search.trim();
  const isSearching = trimmedSearch.length > 0;

  const filteredContacts = contacts.filter(u =>
    u.username?.toLowerCase().includes(trimmedSearch.toLowerCase())
  );
  const filteredGroups = groups.filter(g =>
    g.name?.toLowerCase().includes(trimmedSearch.toLowerCase())
  );

  // People found in global search who you don't already follow
  const newPeopleToFollow = isSearching
    ? searchResults.filter(u => !followingIds.has(u.uid))
    : [];

  // Merge contacts + groups into one sortable list (only relevant when not searching,
  // or when search matches existing contacts/groups)
  const combined = [
    ...filteredContacts.map(u => ({ type: 'user', data: u, time: lastMessages[u.uid]?.timestamp || 0 })),
    ...filteredGroups.map(g => ({ type: 'group', data: g, time: g.lastMessageTime || g.createdAt || 0 })),
  ].sort((a, b) => b.time - a.time);

  async function handleFollow(user) {
    setFollowingInProgress(user.uid);
    try {
      await followUser(user.uid);
      toast.success(`You're now following ${user.username}`);
      onSelectUser(user);
    } catch (err) {
      console.error(err);
      toast.error('Failed to follow. Please try again.');
    } finally {
      setFollowingInProgress(null);
    }
  }

  const myPhoto = userProfile?.photoURL || currentUser?.photoURL;
  const myName = userProfile?.username || currentUser?.displayName || 'Me';
  const isLoading = loading || groupsLoading;
  const loadError = contactsError || groupsError;

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
          <div className="sidebar-actions" style={{ position: 'relative' }} ref={menuRef}>
            <button className="icon-btn" title="Camera" onClick={onOpenCamera}>📷</button>
            <button className="icon-btn" title="New group" onClick={() => setShowNewGroup(true)}>👥</button>
            <button className="icon-btn" title="Menu" onClick={() => setShowMenu(m => !m)}>⋮</button>

            {showMenu && (
              <div style={{
                position: 'absolute', top: 42, right: 0,
                background: 'var(--white)', borderRadius: 10,
                boxShadow: 'var(--shadow-lg)', minWidth: 200,
                zIndex: 60, overflow: 'hidden',
                animation: 'fadeIn 0.15s ease',
              }}>
                <button
                  onClick={() => { setShowMenu(false); setShowNewGroup(true); }}
                  style={menuItemStyle}
                >
                  👥 New group
                </button>
                <button
                  onClick={() => { setShowMenu(false); setShowStarred(true); }}
                  style={menuItemStyle}
                >
                  ⭐ Starred messages
                </button>
                <button
                  onClick={() => { setShowMenu(false); navigate('/settings'); }}
                  style={menuItemStyle}
                >
                  ⚙️ Settings
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              type="text"
              placeholder="Search contacts or find by username"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="chat-list">
          {loadError && (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Couldn't load your contacts. This can happen right after signing in.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, fontFamily: 'monospace' }}>
                {loadError.code || 'unknown-error'}: {loadError.message || String(loadError)}
              </p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: 'var(--teal-700)', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Reload
              </button>
            </div>
          )}

          {!loadError && isLoading && (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          )}

          {!loadError && !isLoading && !isSearching && combined.length === 0 && (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>👋</div>
              No contacts yet. Search by username above to find people and follow them.
            </div>
          )}

          {/* Existing contacts/groups matching the search (or all, if not searching) */}
          {!loadError && combined.map(item => {
            if (item.type === 'user') {
              const user = item.data;
              const lastMsg = lastMessages[user.uid];
              const isActive = selectedUser?.uid === user.uid;
              return (
                <div
                  key={`u-${user.uid}`}
                  className={`chat-item ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectUser(user)}
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
                      {lastMsg && <span className="chat-item-time">{formatTime(lastMsg.timestamp)}</span>}
                    </div>
                    <div className="chat-item-preview">
                      {lastMsg
                        ? (lastMsg.senderId === currentUser.uid ? `You: ${lastMsg.text}` : lastMsg.text)
                        : (user.status || 'Start a conversation')}
                    </div>
                  </div>
                </div>
              );
            }

            // Group item
            const group = item.data;
            const isActive = selectedGroup?.id === group.id;
            return (
              <div
                key={`g-${group.id}`}
                className={`chat-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectGroup(group)}
              >
                <div className="chat-item-avatar">
                  {group.photoURL
                    ? <img src={group.photoURL} alt={group.name} />
                    : <AvatarFallback name={group.name} />}
                </div>
                <div className="chat-item-content">
                  <div className="chat-item-top">
                    <span className="chat-item-name">👥 {group.name}</span>
                    {group.lastMessageTime && <span className="chat-item-time">{formatTime(group.lastMessageTime)}</span>}
                  </div>
                  <div className="chat-item-preview">
                    {group.lastMessage
                      ? `${group.lastMessageSender ? group.lastMessageSender + ': ' : ''}${group.lastMessage}`
                      : `${Object.keys(group.members || {}).length} members`}
                  </div>
                </div>
              </div>
            );
          })}

          {/* New people found via search, not yet followed */}
          {isSearching && (
            <>
              {combined.length > 0 && newPeopleToFollow.length > 0 && (
                <div style={{ padding: '10px 16px 4px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  New people
                </div>
              )}

              {searchLoading && (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </div>
              )}

              {!searchLoading && newPeopleToFollow.map(user => (
                <div key={`search-${user.uid}`} className="chat-item">
                  <div className="chat-item-avatar">
                    {user.photoURL
                      ? <img src={user.photoURL} alt={user.username} />
                      : <AvatarFallback name={user.username} />}
                  </div>
                  <div className="chat-item-content">
                    <div className="chat-item-name">{user.username}</div>
                    <div className="chat-item-preview">{user.status || 'VartaLap user'}</div>
                  </div>
                  <button
                    onClick={() => handleFollow(user)}
                    disabled={followingInProgress === user.uid}
                    style={{
                      padding: '6px 16px', borderRadius: 20, border: 'none',
                      background: 'var(--teal-700)', color: '#fff',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {followingInProgress === user.uid ? '…' : 'Follow'}
                  </button>
                </div>
              ))}

              {!searchLoading && !isLoading && combined.length === 0 && newPeopleToFollow.length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  No one found with that username
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {showProfile && <ProfileDrawer onClose={() => setShowProfile(false)} />}
      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={(groupId) => {
            // Group list will update via the useGroups subscription automatically
          }}
        />
      )}
      {showStarred && <StarredMessagesDrawer onClose={() => setShowStarred(false)} />}
    </>
  );
}

const menuItemStyle = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '12px 16px', border: 'none', background: 'none',
  fontSize: 14, color: 'var(--text-primary)', cursor: 'pointer',
  fontFamily: 'var(--font)',
};
