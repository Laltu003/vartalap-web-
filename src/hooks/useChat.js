import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, push, onValue, serverTimestamp, update, get, set } from 'firebase/database';
import { db } from '../firebase/config';
import { uploadToCloudinary } from '../utils/cloudinaryService';
import { useAuth } from '../context/AuthContext';

// ════════════════════════════════════════════════════════════
// USERNAME AVAILABILITY
// ════════════════════════════════════════════════════════════

// Normalizes a username for case-insensitive lookups (Instagram-style)
export function normalizeUsername(raw) {
  return raw.trim().toLowerCase();
}

// Checks /usernames/{normalized} → if it exists, taken; else available
export async function checkUsernameAvailable(rawUsername) {
  const key = normalizeUsername(rawUsername);
  if (!key) return false;
  const snap = await get(ref(db, `usernames/${key}`));
  return !snap.exists();
}

export async function getUidFromUsername(rawUsername) {
  const key = normalizeUsername(rawUsername);
  const snap = await get(ref(db, `usernames/${key}`));
  return snap.exists() ? snap.val().uid : null;
}

export function useUsers() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    const usersRef = ref(db, 'users');
    const unsub = onValue(usersRef, (snap) => {
      const list = [];
      snap.forEach((child) => {
        const data = child.val();
        if (data.uid !== currentUser.uid) {
          // Strip email before it ever reaches component state — other
          // users' emails must never be visible client-side, even via
          // DevTools inspection. Email is only readable for one's own
          // account through Firebase Auth's currentUser.email.
          const { email, ...publicData } = data;
          list.push(publicData);
        }
      });
      setUsers(list);
      setLoading(false);
    });
    return unsub;
  }, [currentUser]);

  return { users, loading };
}

export function useMessages(chatPartnerId) {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const chatId = currentUser && chatPartnerId
    ? [currentUser.uid, chatPartnerId].sort().join('_')
    : null;

  useEffect(() => {
    if (!chatId) { setMessages([]); setLoading(false); return; }
    const msgsRef = ref(db, `chats/${chatId}/messages`);
    const unsub = onValue(msgsRef, (snap) => {
      const list = [];
      snap.forEach((child) => {
        list.push({ id: child.key, ...child.val() });
      });
      setMessages(list);
      setLoading(false);
    });
    return unsub;
  }, [chatId]);

  // Sends a text message, or a media message (image/video/document) with
  // an optional caption. `media` is { file, type } where type is
  // 'image' | 'video' | 'file'.
  const sendMessage = useCallback(async (text, media = null) => {
    if (!chatId) return;
    const trimmedText = (text || '').trim();
    if (!trimmedText && !media) return;

    const msg = {
      text: trimmedText,
      senderId: currentUser.uid,
      timestamp: Date.now(),
      status: 'sent',
    };

    if (media) {
      const { url } = await uploadToCloudinary(media.file);
      msg.mediaUrl = url;
      msg.mediaType = media.type; // 'image' | 'video' | 'file'
      msg.fileName = media.file.name;
      msg.fileSize = media.file.size;
    }

    // Push to the shared chatId room (sorted so both users share same room)
    await push(ref(db, `chats/${chatId}/messages`), msg);

    // Update last message preview for both users' chat lists
    const previewText = media
      ? (media.type === 'image' ? '📷 Photo' : media.type === 'video' ? '🎥 Video' : `📄 ${media.file.name}`)
      : trimmedText;

    const lastMsgData = {
      lastMessage: previewText,
      lastMessageTime: Date.now(),
      lastMessageSender: currentUser.uid,
    };
    await update(ref(db, `users/${currentUser.uid}/chats/${chatPartnerId}`), lastMsgData);
    await update(ref(db, `users/${chatPartnerId}/chats/${currentUser.uid}`), {
      ...lastMsgData,
      unread: true,
    });
  }, [chatId, currentUser, chatPartnerId]);

  return { messages, loading, sendMessage };
}

export function useLastMessages(users) {
  const { currentUser } = useAuth();
  const [lastMessages, setLastMessages] = useState({});

  useEffect(() => {
    if (!currentUser || !users.length) return;
    const unsubs = users.map(user => {
      const chatId = [currentUser.uid, user.uid].sort().join('_');
      const msgsRef = ref(db, `chats/${chatId}/messages`);
      return onValue(msgsRef, (snap) => {
        let last = null;
        snap.forEach((child) => { last = child.val(); });
        setLastMessages(prev => ({ ...prev, [user.uid]: last }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [currentUser, users]);

  return lastMessages;
}

// ════════════════════════════════════════════════════════════
// GROUPS
// ════════════════════════════════════════════════════════════

export function useGroups() {
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    const groupsRef = ref(db, 'groups');
    const unsub = onValue(groupsRef, (snap) => {
      const list = [];
      snap.forEach((child) => {
        const data = child.val();
        if (data.members && data.members[currentUser.uid]) {
          list.push({ id: child.key, ...data });
        }
      });
      setGroups(list);
      setLoading(false);
    });
    return unsub;
  }, [currentUser]);

  return { groups, loading };
}

export async function createGroup({ name, photoFile, memberUids, currentUserUid }) {
  const newGroupRef = push(ref(db, 'groups'));
  const groupId = newGroupRef.key;

  let photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4C1D95&color=fff&size=200`;
  if (photoFile) {
    const { url } = await uploadToCloudinary(photoFile);
    photoURL = url;
  }

  // Build members map: { uid: true, ... } including creator
  const membersMap = { [currentUserUid]: true };
  memberUids.forEach(uid => { membersMap[uid] = true; });

  const groupData = {
    name,
    photoURL,
    members: membersMap,
    admins: { [currentUserUid]: true },
    createdBy: currentUserUid,
    createdAt: Date.now(),
  };

  await set(newGroupRef, groupData);
  return { id: groupId, ...groupData };
}

export function useGroupMessages(groupId) {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) { setMessages([]); setLoading(false); return; }
    const msgsRef = ref(db, `groups/${groupId}/messages`);
    const unsub = onValue(msgsRef, (snap) => {
      const list = [];
      snap.forEach((child) => { list.push({ id: child.key, ...child.val() }); });
      setMessages(list);
      setLoading(false);
    });
    return unsub;
  }, [groupId]);

  const sendGroupMessage = useCallback(async (text) => {
    if (!groupId || !text.trim()) return;
    const msg = {
      text: text.trim(),
      senderId: currentUser.uid,
      timestamp: Date.now(),
    };
    await push(ref(db, `groups/${groupId}/messages`), msg);
    await update(ref(db, `groups/${groupId}`), {
      lastMessage: text.trim(),
      lastMessageTime: Date.now(),
      lastMessageSender: currentUser.uid,
    });
  }, [groupId, currentUser]);

  return { messages, loading, sendGroupMessage };
}
