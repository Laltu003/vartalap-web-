import { useState, useEffect, useRef } from 'react';
import { useMessages } from '../hooks/useChat';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import EmojiPicker from 'emoji-picker-react';
import toast from 'react-hot-toast';

function formatTime(ts) {
  return format(new Date(ts), 'HH:mm');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateDivider(ts) {
  const d = new Date(ts);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

function AvatarFallback({ name, size = 36 }) {
  const colors = ['#6D28D9', '#4C1D95', '#8B5CF6', '#9333EA', '#A855F7'];
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

export default function ChatWindow({ selectedUser, onBack, isMobileVisible }) {
  const { currentUser, blockUser, unblockUser, isBlocked } = useAuth();
  const { resolvedTheme } = useTheme();
  const { messages, loading, sendMessage } = useMessages(selectedUser?.uid);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null); // { file, type, previewUrl }
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const emojiBtnRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const chatMenuRef = useRef(null);
  const chatMenuBtnRef = useRef(null);
  const attachMenuRef = useRef(null);
  const attachBtnRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Close emoji picker / chat menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        showEmoji &&
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target) &&
        !emojiBtnRef.current.contains(e.target)
      ) {
        setShowEmoji(false);
      }
      if (
        showChatMenu &&
        chatMenuRef.current &&
        !chatMenuRef.current.contains(e.target) &&
        !chatMenuBtnRef.current.contains(e.target)
      ) {
        setShowChatMenu(false);
      }
      if (
        showAttachMenu &&
        attachMenuRef.current &&
        !attachMenuRef.current.contains(e.target) &&
        !attachBtnRef.current.contains(e.target)
      ) {
        setShowAttachMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showEmoji, showChatMenu, showAttachMenu]);

  // Close popups when switching chats
  useEffect(() => {
    setShowEmoji(false);
    setShowChatMenu(false);
    setShowAttachMenu(false);
    setPendingMedia(null);
  }, [selectedUser]);

  function handleEmojiClick(emojiData) {
    setInput(prev => prev + emojiData.emoji);
    inputRef.current?.focus();
  }

  async function handleBlockToggle() {
    setShowChatMenu(false);
    if (!selectedUser) return;
    const blocked = isBlocked(selectedUser.uid);
    try {
      if (blocked) {
        await unblockUser(selectedUser.uid);
        toast.success(`Unblocked ${selectedUser.username}`);
      } else {
        if (!window.confirm(`Block ${selectedUser.username}? You won't see new messages from them.`)) return;
        await blockUser(selectedUser.uid);
        toast.success(`Blocked ${selectedUser.username}`);
      }
    } catch {
      toast.error('Action failed. Try again.');
    }
  }

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when user selected
  useEffect(() => {
    if (selectedUser) inputRef.current?.focus();
  }, [selectedUser]);

  async function handleSend() {
    const text = input.trim();
    if (!text && !pendingMedia) return;
    if (sending) return;
    if (isBlocked(selectedUser.uid)) {
      toast.error('Unblock this contact to send messages.');
      return;
    }
    setSending(true);
    const mediaToSend = pendingMedia;
    setInput('');
    setPendingMedia(null);
    try {
      await sendMessage(text, mediaToSend ? { file: mediaToSend.file, type: mediaToSend.type } : null);
      if (mediaToSend?.previewUrl) URL.revokeObjectURL(mediaToSend.previewUrl);
    } catch (err) {
      console.error('Send failed:', err);
      toast.error('Failed to send. Try again.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function triggerFileSelect(type) {
    setShowAttachMenu(false);
    if (type === 'image') imageInputRef.current?.click();
    else if (type === 'video') videoInputRef.current?.click();
    else fileInputRef.current?.click();
  }

  function handleFileChosen(e, type) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    const MAX_SIZE = 25 * 1024 * 1024; // 25MB
    if (file.size > MAX_SIZE) {
      toast.error('File too large. Max size is 25MB.');
      return;
    }

    const previewUrl = (type === 'image' || type === 'video') ? URL.createObjectURL(file) : null;
    setPendingMedia({ file, type, previewUrl });
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function cancelPendingMedia() {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Group messages by date for dividers
  function renderMessages() {
    const elements = [];
    let lastDate = null;

    messages.forEach((msg, idx) => {
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
      elements.push(
        <div key={msg.id} className={`message-wrapper ${isSent ? 'sent' : 'received'}`}>
          <div className={`message-bubble ${msg.mediaUrl ? 'has-media' : ''}`}>
            {msg.mediaUrl && msg.mediaType === 'image' && (
              <img
                className="message-media-image"
                src={msg.mediaUrl}
                alt={msg.fileName || 'photo'}
                onClick={() => window.open(msg.mediaUrl, '_blank')}
              />
            )}
            {msg.mediaUrl && msg.mediaType === 'video' && (
              <video className="message-media-video" src={msg.mediaUrl} controls />
            )}
            {msg.mediaUrl && msg.mediaType === 'file' && (
              <a
                className="message-media-file"
                href={msg.mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={msg.fileName}
              >
                <span className="message-media-file-icon">📄</span>
                <span className="message-media-file-info">
                  <span className="message-media-file-name">{msg.fileName}</span>
                  {msg.fileSize != null && (
                    <span className="message-media-file-size">{formatFileSize(msg.fileSize)}</span>
                  )}
                </span>
                <span className="message-media-file-download">⬇</span>
              </a>
            )}
            {msg.text && <p className="message-text">{msg.text}</p>}
            <div className="message-meta">
              <span className="message-time">{formatTime(msg.timestamp)}</span>
              {isSent && <span className="message-status">✓✓</span>}
            </div>
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
          <div className="chat-empty-icon">💬</div>
          <div className="chat-empty-title">VartaLap</div>
          <div className="chat-empty-sub">Select a contact to start chatting</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-window ${!isMobileVisible ? 'hidden' : ''}`}>
      {/* Header */}
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
        <button className="icon-btn" title="Search">🔍</button>
        <div className="chat-menu-wrapper">
          <button
            ref={chatMenuBtnRef}
            className="icon-btn"
            title="Menu"
            onClick={() => setShowChatMenu(v => !v)}
          >
            ⋮
          </button>
          {showChatMenu && (
            <div className="chat-menu-dropdown" ref={chatMenuRef}>
              <button className="chat-menu-item" onClick={handleBlockToggle}>
                {isBlocked(selectedUser.uid) ? '✅ Unblock contact' : '🚫 Block contact'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
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

      {/* Media preview before sending (if a file is staged) */}
      {pendingMedia && (
        <div className="media-preview-bar">
          <div className="media-preview-thumb">
            {pendingMedia.type === 'image' && (
              <img src={pendingMedia.previewUrl} alt="preview" />
            )}
            {pendingMedia.type === 'video' && (
              <video src={pendingMedia.previewUrl} />
            )}
            {pendingMedia.type === 'file' && (
              <div className="media-preview-file-icon">📄</div>
            )}
          </div>
          <div className="media-preview-info">
            <span className="media-preview-name">{pendingMedia.file.name}</span>
            <span className="media-preview-size">{formatFileSize(pendingMedia.file.size)}</span>
          </div>
          <button className="media-preview-cancel" onClick={cancelPendingMedia} title="Remove">✕</button>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-area">
        <div className="emoji-wrapper" ref={emojiPickerRef}>
          {showEmoji && (
            <div className="emoji-picker-popup">
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                autoFocusSearch={false}
                lazyLoadEmojis
                height={350}
                width={300}
                theme={resolvedTheme}
              />
            </div>
          )}
          <button
            ref={emojiBtnRef}
            className="icon-btn"
            type="button"
            onClick={() => setShowEmoji(prev => !prev)}
            title="Emoji"
          >
            😊
          </button>
        </div>

        <div className="attach-wrapper" ref={attachMenuRef}>
          {showAttachMenu && (
            <div className="attach-menu-popup">
              <button className="attach-menu-item" onClick={() => triggerFileSelect('image')}>
                <span className="attach-menu-icon" style={{ background: '#9C27B0' }}>🖼️</span>
                Photo
              </button>
              <button className="attach-menu-item" onClick={() => triggerFileSelect('video')}>
                <span className="attach-menu-icon" style={{ background: '#F44336' }}>🎥</span>
                Video
              </button>
              <button className="attach-menu-item" onClick={() => triggerFileSelect('file')}>
                <span className="attach-menu-icon" style={{ background: '#3F51B5' }}>📄</span>
                Document
              </button>
            </div>
          )}
          <button
            ref={attachBtnRef}
            className="icon-btn"
            type="button"
            onClick={() => setShowAttachMenu(v => !v)}
            title="Attach"
          >
            📎
          </button>
        </div>

        <div className="chat-input-box">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={1}
            placeholder={pendingMedia ? 'Add a caption…' : 'Type a message'}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
          />
        </div>

        {!input.trim() && !pendingMedia && (
          <button
            className="icon-btn"
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            title="Camera"
          >
            📷
          </button>
        )}

        <button
          className="send-btn"
          onClick={handleSend}
          disabled={(!input.trim() && !pendingMedia) || sending}
          title="Send message"
        >
          {sending ? '…' : '➤'}
        </button>

        {/* Hidden file inputs */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => handleFileChosen(e, 'image')}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={e => handleFileChosen(e, 'video')}
        />
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={e => handleFileChosen(e, 'file')}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => handleFileChosen(e, 'image')}
        />
      </div>
    </div>
  );
}
