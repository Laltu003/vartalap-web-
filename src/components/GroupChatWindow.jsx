import { useState, useEffect, useRef } from 'react';
import { useGroupMessages, useStarredMessages } from '../hooks/useChat';
import { useAuth } from '../context/AuthContext';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';

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

export default function GroupChatWindow({ group, onBack, isMobileVisible, onOpenCamera }) {
  const { currentUser } = useAuth();
  const { messages, group: liveGroup, loading, sendMessage, toggleStar } = useGroupMessages(group?.id);
  const { starred } = useStarredMessages();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeMsgMenu, setActiveMsgMenu] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const starredIds = new Set(starred.map(s => s.originalId));
  const displayGroup = liveGroup || group;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (group) inputRef.current?.focus();
  }, [group]);

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

      if (msg.system) {
        elements.push(
          <div key={msg.id} style={{ textAlign: 'center', margin: '8px 0' }}>
            <span style={{
              background: 'rgba(255,255,255,0.85)', borderRadius: 8,
              padding: '4px 10px', fontSize: 12, color: 'var(--text-secondary)',
            }}>
              {msg.text}
            </span>
          </div>
        );
        return;
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
            {!isSent && (
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal-700)', marginBottom: 2 }}>
                {msg.senderName}
              </p>
            )}
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

  if (!group) {
    return (
      <div className={`chat-window ${!isMobileVisible ? 'hidden' : ''}`}>
        <div className="chat-empty">
          <div className="chat-empty-icon">👥</div>
          <div className="chat-empty-title">VartaLap Groups</div>
          <div className="chat-empty-sub">Select a group to start chatting</div>
        </div>
      </div>
    );
  }

  const memberCount = Object.keys(displayGroup.members || {}).length;

  return (
    <div className={`chat-window ${!isMobileVisible ? 'hidden' : ''}`} onClick={() => setActiveMsgMenu(null)}>
      <div className="chat-header">
        <button className="chat-header-back" onClick={onBack}>←</button>
        {displayGroup.photoURL
          ? <img src={displayGroup.photoURL} alt={displayGroup.name} style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
          : <AvatarFallback name={displayGroup.name} />}
        <div className="chat-header-info">
          <div className="chat-header-name">👥 {displayGroup.name}</div>
          <div className="chat-header-status">{memberCount} members</div>
        </div>
      </div>

      <div className="messages-area">
        {loading && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
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
        <button className="send-btn" onClick={handleSend} disabled={!input.trim() || sending}>
          {sending ? '…' : '➤'}
        </button>
      </div>
    </div>
  );
}
