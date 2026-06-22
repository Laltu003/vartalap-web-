import { useState, useEffect, useRef } from 'react';
import { useMessages, useStarredMessages, useFollowing } from '../hooks/useChat';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import logo from '../assets/logo.svg';
import toast from 'react-hot-toast';

function formatTime(ts) {
  return format(new Date(ts), 'HH:mm');
}

function formatDateDivider(ts) {
  const d = new Date(ts);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

function AvatarFallback({ name, size = 36 }) {
  const colors = ['#5B3FE0', '#241456', '#7C5CFC', '#9B59F6', '#3D2A8C'];
  const color = colors[(name?.charCodeAt(0) || 0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.4,
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

export default function ChatWindow({ selectedUser, onBack, isMobileVisible, onOpenCamera, onContactRemoved }) {
  const { currentUser } = useAuth();
  const { startCall, callStatus } = useCall();
  const { messages, loading, sendMessage, toggleStar } = useMessages(selectedUser?.uid);
  const { starred } = useStarredMessages();
  const { unfollowUser } = useFollowing();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeMsgMenu, setActiveMsgMenu] = useState(null);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [removing, setRemoving] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const starredIds = new Set(starred.map(s => s.originalId));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (selectedUser) inputRef.current?.focus();
  }, [selectedUser]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      await sendMessage(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleToggleStar(msg) {
    await toggleStar(msg, starredIds.has(msg.id));
    setActiveMsgMenu(null);
  }

  async function handleRemoveContact() {
    if (!selectedUser) return;
    if (!window.confirm(`Remove ${selectedUser.username} from your contacts? Your chat history will be kept, but they'll be removed from your contact list.`)) return;
    setRemoving(true);
    try {
      await unfollowUser(selectedUser.uid);
      toast.success(`Removed ${selectedUser.username} from contacts`);
      setShowHeaderMenu(false);
      onContactRemoved?.();
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove contact. Please try again.');
    } finally {
      setRemoving(false);
    }
  }

  function renderMessages() {
    const elements = [];
    let lastDate = null;

    messages.forEach((msg) => {
      const msgDate = new Date(msg.timestamp);
      if (!lastDate || !isSameDay(lastDate, msgDate)) {
        lastDate = msgDate;
        elements.push(
          <div key={`divider-${msg.timestamp}`} className="date-divider">
            <span>{formatDateDivider(msg.timestamp)}</span>
          </div>
        );
      }

      const isSent = msg.senderId === currentUser.uid;
      const isStarred = starredIds.has(msg.id);

      elements.push(
        <div
          key={msg.id}
          className={`message-wrapper ${isSent ? 'sent' : 'received'}`}
          onContextMenu={(e) => { e.preventDefault(); setActiveMsgMenu(msg.id); }}
        >
          <div
            className="message-bubble"
            style={{ position: 'relative' }}
            onDoubleClick={() => handleToggleStar(msg)}
          >
            {msg.type === 'image' && (
              <img
                src={msg.mediaUrl}
                alt="shared"
                style={{ maxWidth: 240, borderRadius: 10, display: 'block', marginBottom: 4 }}
              />
            )}
            {msg.type === 'video' && (
              <video
                src={msg.mediaUrl}
                controls
                style={{ maxWidth: 240, borderRadius: 10, display: 'block', marginBottom: 4 }}
              />
            )}
            {!msg.type && <p className="message-text">{msg.text}</p>}
            <div className="message-meta">
              {isStarred && <span style={{ fontSize: 11 }}>⭐</span>}
              <span className="message-time">{formatTime(msg.timestamp)}</span>
              {isSent && <span className="message-status">✓✓</span>}
            </div>

            {activeMsgMenu === msg.id && (
              <div style={{
                position: 'absolute', top: '100%', right: isSent ? 0 : 'auto', left: isSent ? 'auto' : 0,
                background: 'var(--white)', borderRadius: 8, boxShadow: 'var(--shadow-lg)',
                zIndex: 20, marginTop: 4, overflow: 'hidden', minWidth: 140,
              }}>
                <button
                  onClick={() => handleToggleStar(msg)}
                  style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer' }}
                >
                  {isStarred ? '⭐ Unstar' : '⭐ Star message'}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    });

    return elements;
  }

  if (!selectedUser) {
    return (
      <div className={`chat-window ${!isMobileVisible ? 'hidden' : ''}`}>
        <div className="chat-empty">
          <img src={logo} alt="VartaLap" style={{ width: 80, height: 80, borderRadius: 18, boxShadow: 'var(--shadow-md)' }} />
          <div className="chat-empty-title">VartaLap</div>
          <div className="chat-empty-sub">Select a contact to start chatting</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-window ${!isMobileVisible ? 'hidden' : ''}`} onClick={() => { setActiveMsgMenu(null); setShowHeaderMenu(false); }}>
      <div className="chat-header">
        <button className="chat-header-back" onClick={onBack}>←</button>
        {selectedUser.photoURL
          ? <img src={selectedUser.photoURL} alt={selectedUser.username} style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
          : <AvatarFallback name={selectedUser.username} />}
        <div className="chat-header-info">
          <div className="chat-header-name">{selectedUser.username}</div>
          <div className={`chat-header-status ${selectedUser.online ? 'online' : ''}`}>
            {selectedUser.online ? 'Online' : 'Last seen recently'}
          </div>
        </div>
        <button
          className="icon-btn"
          title="Voice call"
          onClick={() => startCall(selectedUser.uid, selectedUser.username, selectedUser.photoURL)}
          disabled={callStatus !== 'idle'}
        >
          📞
        </button>
        <div style={{ position: 'relative' }}>
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowHeaderMenu(m => !m); }}>⋮</button>
          {showHeaderMenu && (
            <div style={{
              position: 'absolute', top: 42, right: 0,
              background: 'var(--white)', borderRadius: 10,
              boxShadow: 'var(--shadow-lg)', minWidth: 200,
              zIndex: 60, overflow: 'hidden',
            }}>
              <button
                onClick={(e) => { e.stopPropagation(); handleRemoveContact(); }}
                disabled={removing}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 16px', border: 'none', background: 'none',
                  fontSize: 14, color: '#E53935', cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}
              >
                {removing ? 'Removing…' : '🚫 Remove contact'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="messages-area">
        {loading && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '32px 20px',
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            <div style={{
              background: 'rgba(255,255,255,0.85)',
              borderRadius: 12, padding: '10px 20px',
              display: 'inline-block', boxShadow: 'var(--shadow-sm)',
            }}>
              Say hello to {selectedUser.username}! 👋
            </div>
          </div>
        )}
        {!loading && renderMessages()}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <button className="icon-btn">😊</button>
        <button className="icon-btn" title="Camera" onClick={onOpenCamera}>📷</button>
        <div className="chat-input-box">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={1}
            placeholder="Type a message"
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          title="Send message"
        >
          {sending ? '…' : '➤'}
        </button>
      </div>
    </div>
  );
}
