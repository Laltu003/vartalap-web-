import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUsers, createGroup } from '../hooks/useChat';
import toast from 'react-hot-toast';

function AvatarFallback({ name, size = 40 }) {
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

export default function NewGroupModal({ onClose, onGroupCreated }) {
  const { currentUser } = useAuth();
  const { users, loading } = useUsers();
  const fileRef = useRef();

  const [groupName, setGroupName] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState('');

  const filtered = users.filter(u =>
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function toggleMember(uid) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function handleCreate() {
    if (!groupName.trim()) { setNameError('Group name is required'); return; }
    if (selected.size < 1) { toast.error('Select at least 1 member'); return; }
    setNameError('');
    setCreating(true);
    try {
      const group = await createGroup({
        name: groupName.trim(),
        photoFile,
        memberUids: Array.from(selected),
        currentUserUid: currentUser.uid,
      });
      toast.success(`Group "${groupName}" created! 🎉`);
      onGroupCreated?.(group);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create group. Try again.');
    } finally { setCreating(false); }
  }

  const selectedUsers = users.filter(u => selected.has(u.uid));

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer new-group-drawer">
        <div className="drawer-header">
          <button className="drawer-close" onClick={onClose}>✕</button>
          <h2>New Group</h2>
        </div>

        <div className="drawer-body">
          {/* Group photo + name */}
          <div className="new-group-header-row">
            <div className="new-group-photo-upload" onClick={() => fileRef.current.click()}>
              {photoPreview
                ? <img src={photoPreview} alt="group" />
                : <div className="new-group-photo-placeholder">📷</div>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            <input
              className={`form-input new-group-name-input ${nameError ? 'error' : ''}`}
              type="text"
              placeholder="Group name"
              value={groupName}
              onChange={e => { setGroupName(e.target.value); setNameError(''); }}
              maxLength={50}
            />
          </div>
          {nameError && <span className="form-error" style={{ display: 'block', marginBottom: 12 }}>{nameError}</span>}

          {/* Selected members chips */}
          {selectedUsers.length > 0 && (
            <div className="selected-members-row">
              {selectedUsers.map(u => (
                <div key={u.uid} className="selected-member-chip">
                  {u.photoURL ? <img src={u.photoURL} alt={u.username} /> : <AvatarFallback name={u.username} size={28} />}
                  <span>{u.username}</span>
                  <button onClick={() => toggleMember(u.uid)}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="search-box" style={{ marginBottom: 12 }}>
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              type="text"
              placeholder="Search contacts"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* User list */}
          <p className="settings-subheading" style={{ marginBottom: 8 }}>
            Add members ({selected.size} selected)
          </p>

          {loading && (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <p className="settings-empty-text">No contacts found</p>
          )}

          <div className="member-select-list">
            {filtered.map(u => {
              const isSelected = selected.has(u.uid);
              return (
                <div
                  key={u.uid}
                  className={`member-select-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleMember(u.uid)}
                >
                  {u.photoURL ? <img src={u.photoURL} className="chat-item-avatar" style={{ width: 40, height: 40, borderRadius: '50%' }} alt={u.username} /> : <AvatarFallback name={u.username} />}
                  <span className="member-select-name">{u.username}</span>
                  <span className={`member-select-checkbox ${isSelected ? 'checked' : ''}`}>
                    {isSelected && '✓'}
                  </span>
                </div>
              );
            })}
          </div>

          <button className="save-btn" onClick={handleCreate} disabled={creating} style={{ marginTop: 16 }}>
            {creating ? 'Creating group…' : 'Create Group'}
          </button>
        </div>
      </div>
    </>
  );
}
