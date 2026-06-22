import { useState, useEffect, useCallback } from 'react';
import { ref, push, onValue, update, set, remove, get } from 'firebase/database';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

// Fetches ALL registered users. Used internally for username search and
// the admin panel — NOT for the sidebar contact list, which only shows
// people the current user follows (see useFollowing below).
export function useAllUsers() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentUser) return;

    let unsub;
    let retried = false;

    function subscribe() {
      const usersRef = ref(db, 'users');
      unsub = onValue(
        usersRef,
        (snap) => {
          setError(null);
          const list = [];
          snap.forEach((child) => {
            const data = child.val();
            if (data.uid !== currentUser.uid) {
              list.push(data);
            }
          });
          setUsers(list);
          setLoading(false);
        },
        (err) => {
          // Firebase's RTDB SDK has a known issue where the very first
          // onValue call after a fresh sign-in can fail once with
          // permission_denied even when rules are correct, then succeed
          // immediately on retry. We retry exactly once automatically;
          // if it fails again, we surface the real error instead of
          // spinning forever.
          console.error('useAllUsers onValue error code:', err?.code, 'message:', err?.message);
          if (!retried) {
            retried = true;
            setTimeout(subscribe, 400);
          } else {
            setError(err);
            setLoading(false);
          }
        }
      );
    }

    subscribe();
    return () => unsub && unsub();
  }, [currentUser]);

  return { users, loading, error };
}

// ── Following / Followers ──
export function useFollowing() {
  const { currentUser } = useAuth();
  const [followingIds, setFollowingIds] = useState(new Set());
  const [contacts, setContacts] = useState([]); // full user profiles for who I follow
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentUser) return;

    let unsub;
    let retried = false;

    function subscribe() {
      const followingRef = ref(db, `follows/${currentUser.uid}/following`);
      unsub = onValue(
        followingRef,
        async (snap) => {
          setError(null);
          const ids = [];
          snap.forEach(child => { if (child.val()) ids.push(child.key); });
          setFollowingIds(new Set(ids));

          if (ids.length === 0) {
            setContacts([]);
            setLoading(false);
            return;
          }

          const profileSnaps = await Promise.all(
            ids.map(uid => get(ref(db, `users/${uid}`)))
          );
          const profiles = profileSnaps
            .filter(s => s.exists())
            .map(s => s.val());
          setContacts(profiles);
          setLoading(false);
        },
        (err) => {
          console.error('useFollowing onValue error code:', err?.code, 'message:', err?.message);
          if (!retried) {
            retried = true;
            setTimeout(subscribe, 400);
          } else {
            setError(err);
            setLoading(false);
          }
        }
      );
    }

    subscribe();
    return () => unsub && unsub();
  }, [currentUser]);

  const followUser = useCallback(async (targetUid) => {
    if (!currentUser || targetUid === currentUser.uid) return;
    await set(ref(db, `follows/${currentUser.uid}/following/${targetUid}`), true);
    await set(ref(db, `follows/${targetUid}/followers/${currentUser.uid}`), true);
  }, [currentUser]);

  const unfollowUser = useCallback(async (targetUid) => {
    if (!currentUser) return;
    await remove(ref(db, `follows/${currentUser.uid}/following/${targetUid}`));
    await remove(ref(db, `follows/${targetUid}/followers/${currentUser.uid}`));
  }, [currentUser]);

  return { followingIds, contacts, loading, error, followUser, unfollowUser };
}

// Search across ALL registered users by username prefix. Used to find
// people who aren't in your contacts yet, so you can follow them.
export function useUserSearch(query) {
  const { users, loading } = useAllUsers();

  const results = query.trim()
    ? users.filter(u => u.username?.toLowerCase().startsWith(query.trim().toLowerCase()))
    : [];

  return { results, loading };
}

// ── 1-on-1 messages ──
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
    const unsub = onValue(
      msgsRef,
      (snap) => {
        const list = [];
        snap.forEach((child) => {
          list.push({ id: child.key, ...child.val() });
        });
        setMessages(list);
        setLoading(false);
      },
      (err) => {
        console.error('useMessages onValue error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [chatId]);

  const sendMessage = useCallback(async (text) => {
    if (!chatId || !text.trim()) return;
    const msg = {
      text: text.trim(),
      senderId: currentUser.uid,
      timestamp: Date.now(),
      status: 'sent',
    };
    await push(ref(db, `chats/${chatId}/messages`), msg);

    const lastMsgData = {
      lastMessage: text.trim(),
      lastMessageTime: Date.now(),
      lastMessageSender: currentUser.uid,
    };
    await update(ref(db, `users/${currentUser.uid}/chats/${chatPartnerId}`), lastMsgData);
    await update(ref(db, `users/${chatPartnerId}/chats/${currentUser.uid}`), {
      ...lastMsgData,
      unread: true,
    });
  }, [chatId, currentUser, chatPartnerId]);

  const sendMediaMessage = useCallback(async (mediaUrl, mediaType) => {
    if (!chatId || !mediaUrl) return;
    const msg = {
      type: mediaType, // 'image' | 'video'
      mediaUrl,
      senderId: currentUser.uid,
      timestamp: Date.now(),
      status: 'sent',
    };
    await push(ref(db, `chats/${chatId}/messages`), msg);

    const previewText = mediaType === 'image' ? '📷 Photo' : '🎥 Video';
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

  const toggleStar = useCallback(async (message, isStarred) => {
    const starRef = ref(db, `starred/${currentUser.uid}/${message.id}`);
    if (isStarred) {
      await remove(starRef);
    } else {
      await set(starRef, {
        text: message.text,
        senderId: message.senderId,
        timestamp: message.timestamp,
        sourceType: 'direct',
        sourceId: chatPartnerId,
        originalId: message.id,
      });
    }
  }, [currentUser, chatPartnerId]);

  return { messages, loading, sendMessage, sendMediaMessage, toggleStar, chatId };
}

export function useLastMessages(users) {
  const { currentUser } = useAuth();
  const [lastMessages, setLastMessages] = useState({});

  useEffect(() => {
    if (!currentUser || !users.length) return;
    const unsubs = users.map(user => {
      const chatId = [currentUser.uid, user.uid].sort().join('_');
      const msgsRef = ref(db, `chats/${chatId}/messages`);
      return onValue(
        msgsRef,
        (snap) => {
          let last = null;
          snap.forEach((child) => { last = child.val(); });
          setLastMessages(prev => ({ ...prev, [user.uid]: last }));
        },
        (err) => console.error('useLastMessages onValue error:', err)
      );
    });
    return () => unsubs.forEach(u => u());
  }, [currentUser, users]);

  return lastMessages;
}

// ── Groups ──
export function useGroups() {
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentUser) return;

    let unsub;
    let retried = false;

    function subscribe() {
      const myGroupsRef = ref(db, `users/${currentUser.uid}/groups`);
      unsub = onValue(
        myGroupsRef,
        async (snap) => {
          setError(null);
          const groupIds = [];
          snap.forEach(child => { if (child.val()) groupIds.push(child.key); });

          if (groupIds.length === 0) {
            setGroups([]);
            setLoading(false);
            return;
          }

          const groupSnaps = await Promise.all(
            groupIds.map(id => get(ref(db, `groups/${id}`)))
          );

          const list = groupSnaps
            .filter(s => s.exists())
            .map(s => ({ id: s.key, ...s.val() }));

          setGroups(list);
          setLoading(false);
        },
        (err) => {
          console.error('useGroups onValue error code:', err?.code, 'message:', err?.message);
          if (!retried) {
            retried = true;
            setTimeout(subscribe, 400);
          } else {
            setError(err);
            setLoading(false);
          }
        }
      );
    }

    subscribe();
    return () => unsub && unsub();
  }, [currentUser]);

  return { groups, loading, error };
}

export function useCreateGroup() {
  const { currentUser, userProfile } = useAuth();

  const createGroup = useCallback(async (name, memberUids, photoURL) => {
    if (!name.trim() || memberUids.length === 0) throw new Error('Group needs a name and at least one member');

    const newGroupRef = push(ref(db, 'groups'));
    const groupId = newGroupRef.key;

    const allMembers = [...new Set([currentUser.uid, ...memberUids])];
    const membersObj = {};
    allMembers.forEach(uid => { membersObj[uid] = true; });

    await set(newGroupRef, {
      name: name.trim(),
      photoURL: photoURL || null,
      createdBy: currentUser.uid,
      createdAt: Date.now(),
      members: membersObj,
      admins: { [currentUser.uid]: true },
    });

    // Add group reference under each member's profile for fast lookup
    await Promise.all(
      allMembers.map(uid => set(ref(db, `users/${uid}/groups/${groupId}`), true))
    );

    // System message announcing group creation
    await push(ref(db, `groupMessages/${groupId}/messages`), {
      text: `${userProfile?.username || 'Someone'} created the group "${name.trim()}"`,
      senderId: 'system',
      timestamp: Date.now(),
      system: true,
    });

    return groupId;
  }, [currentUser, userProfile]);

  return { createGroup };
}

// ── Group messages ──
export function useGroupMessages(groupId) {
  const { currentUser, userProfile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) { setMessages([]); setLoading(false); return; }

    const groupRef = ref(db, `groups/${groupId}`);
    const unsubGroup = onValue(
      groupRef,
      (snap) => {
        setGroup(snap.exists() ? { id: groupId, ...snap.val() } : null);
      },
      (err) => console.error('useGroupMessages group listener error:', err)
    );

    const msgsRef = ref(db, `groupMessages/${groupId}/messages`);
    const unsubMsgs = onValue(
      msgsRef,
      (snap) => {
        const list = [];
        snap.forEach((child) => {
          list.push({ id: child.key, ...child.val() });
        });
        setMessages(list);
        setLoading(false);
      },
      (err) => {
        console.error('useGroupMessages messages listener error:', err);
        setLoading(false);
      }
    );

    return () => { unsubGroup(); unsubMsgs(); };
  }, [groupId]);

  const sendMessage = useCallback(async (text) => {
    if (!groupId || !text.trim()) return;
    await push(ref(db, `groupMessages/${groupId}/messages`), {
      text: text.trim(),
      senderId: currentUser.uid,
      senderName: userProfile?.username || 'Unknown',
      timestamp: Date.now(),
    });
    await update(ref(db, `groups/${groupId}`), {
      lastMessage: text.trim(),
      lastMessageTime: Date.now(),
      lastMessageSender: userProfile?.username || 'Unknown',
    });
  }, [groupId, currentUser, userProfile]);

  const sendMediaMessage = useCallback(async (mediaUrl, mediaType) => {
    if (!groupId || !mediaUrl) return;
    await push(ref(db, `groupMessages/${groupId}/messages`), {
      type: mediaType,
      mediaUrl,
      senderId: currentUser.uid,
      senderName: userProfile?.username || 'Unknown',
      timestamp: Date.now(),
    });
    const previewText = mediaType === 'image' ? '📷 Photo' : '🎥 Video';
    await update(ref(db, `groups/${groupId}`), {
      lastMessage: previewText,
      lastMessageTime: Date.now(),
      lastMessageSender: userProfile?.username || 'Unknown',
    });
  }, [groupId, currentUser, userProfile]);

  const toggleStar = useCallback(async (message, isStarred) => {
    const starRef = ref(db, `starred/${currentUser.uid}/${message.id}`);
    if (isStarred) {
      await remove(starRef);
    } else {
      await set(starRef, {
        text: message.text,
        senderId: message.senderId,
        senderName: message.senderName,
        timestamp: message.timestamp,
        sourceType: 'group',
        sourceId: groupId,
        originalId: message.id,
      });
    }
  }, [currentUser, groupId]);

  return { messages, group, loading, sendMessage, sendMediaMessage, toggleStar };
}

// ── Starred messages ──
export function useStarredMessages() {
  const { currentUser } = useAuth();
  const [starred, setStarred] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    const starredRef = ref(db, `starred/${currentUser.uid}`);
    const unsub = onValue(
      starredRef,
      (snap) => {
        const list = [];
        snap.forEach(child => {
          list.push({ id: child.key, ...child.val() });
        });
        list.sort((a, b) => b.timestamp - a.timestamp);
        setStarred(list);
        setLoading(false);
      },
      (err) => {
        console.error('useStarredMessages onValue error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [currentUser]);

  const unstar = useCallback(async (messageId) => {
    await remove(ref(db, `starred/${currentUser.uid}/${messageId}`));
  }, [currentUser]);

  return { starred, loading, unstar };
}
