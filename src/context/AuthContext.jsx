import { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { ref, set, update, onValue, get, remove } from 'firebase/database';
import { auth, db } from '../firebase/config';
import { normalizeUsername } from '../hooks/useChat';
import { uploadToCloudinary } from '../utils/cloudinaryService';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [myFollowing, setMyFollowing] = useState({});

  // Register — username is the public identity; email is required internally for Firebase Auth + OTP
  async function register(username, email, password, avatarFile) {
    const usernameKey = normalizeUsername(username);

    // Final server-side guard: re-check right before claiming (in case of race condition)
    const existingSnap = await get(ref(db, `usernames/${usernameKey}`));
    if (existingSnap.exists()) {
      throw { code: 'auth/username-taken', message: 'Username already taken' };
    }

    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;

    let photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=6D28D9&color=fff&size=200`;

    if (avatarFile) {
      const { url } = await uploadToCloudinary(avatarFile);
      photoURL = url;
    }

    await updateProfile(user, { displayName: username, photoURL });

    // Reserve the username (acts as the unique-index table).
    // Email is duplicated here (not just in users/{uid}) because the
    // login flow needs to resolve username -> email BEFORE the user is
    // authenticated, and users/{uid} requires auth != null to read.
    await set(ref(db, `usernames/${usernameKey}`), {
      uid: user.uid,
      username, // original casing preserved for display
      email,
    });

    await set(ref(db, `users/${user.uid}`), {
      uid: user.uid,
      username,
      usernameKey,
      email, // kept internally for OTP/auth only — never shown on login screen or in user lists (stripped client-side in useUsers())
      photoURL,
      status: "Hey, I'm using VartaLap!",
      role: 'user',
      online: true,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    });

    return user;
  }

  // Login — looks up the email behind a username, then signs in normally
  async function login(username, password) {
    const usernameKey = normalizeUsername(username);
    const indexSnap = await get(ref(db, `usernames/${usernameKey}`));
    if (!indexSnap.exists()) {
      throw { code: 'auth/user-not-found', message: 'No account with that username' };
    }
    const { email } = indexSnap.val();
    if (!email) {
      throw { code: 'auth/user-not-found', message: 'Account data missing' };
    }

    const result = await signInWithEmailAndPassword(auth, email, password);
    await update(ref(db, `users/${result.user.uid}`), {
      online: true,
      lastSeen: Date.now(),
    });
    return result;
  }

  // Verifies username+password are correct WITHOUT leaving the user signed in.
  // Used before OTP is sent on login, so a session only persists once OTP
  // is actually verified (prevents bypassing 2FA by closing the OTP screen).
  //
  // IMPORTANT: this calls Firebase's REST auth endpoint directly instead of
  // signInWithEmailAndPassword() + signOut(). Using the SDK's sign-in method
  // here — even briefly — fires onAuthStateChanged with a real user, which
  // causes PublicRoute to redirect away from /login before the OTP step can
  // render (since currentUser briefly becomes truthy). The REST call checks
  // the password without ever touching the SDK's auth state.
  async function verifyCredentialsOnly(username, password) {
    const usernameKey = normalizeUsername(username);
    const indexSnap = await get(ref(db, `usernames/${usernameKey}`));
    if (!indexSnap.exists()) {
      throw { code: 'auth/user-not-found', message: 'No account with that username' };
    }
    const { email } = indexSnap.val();
    if (!email) {
      throw { code: 'auth/user-not-found', message: 'Account data missing' };
    }

    const apiKey = auth.app.options.apiKey;
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      }
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const reason = errBody?.error?.message || '';
      if (reason.includes('INVALID_PASSWORD') || reason.includes('INVALID_LOGIN_CREDENTIALS') || reason.includes('EMAIL_NOT_FOUND')) {
        throw { code: 'auth/invalid-credential', message: 'Invalid username or password' };
      }
      throw { code: 'auth/unknown', message: reason || 'Login check failed' };
    }

    return { email };
  }

  // Returns the email tied to a username — used to send the login OTP
  // before Firebase sign-in actually happens (so we gate behind OTP first).
  async function getEmailForUsername(username) {
    const usernameKey = normalizeUsername(username);
    const indexSnap = await get(ref(db, `usernames/${usernameKey}`));
    if (!indexSnap.exists()) return null;
    return indexSnap.val().email || null;
  }

  // Logout
  async function logout() {
    try {
      if (auth.currentUser) {
        await update(ref(db, `users/${auth.currentUser.uid}`), {
          online: false,
          lastSeen: Date.now(),
        });
      }
      await signOut(auth);
    } catch (error) {
      console.error(error);
    }
  }

  // Update profile — handles username changes by re-indexing the usernames table
  async function updateUserProfile(data) {
    if (!currentUser) return;

    let photoURL = userProfile?.photoURL;
    if (data.avatarFile) {
      const { url } = await uploadToCloudinary(data.avatarFile);
      photoURL = url;
    }

    const newUsername = data.username || userProfile?.username;
    const oldUsername = userProfile?.username;
    const usernameChanged = newUsername && oldUsername && normalizeUsername(newUsername) !== normalizeUsername(oldUsername);

    if (usernameChanged) {
      const newKey = normalizeUsername(newUsername);
      const existingSnap = await get(ref(db, `usernames/${newKey}`));
      if (existingSnap.exists()) {
        throw { code: 'auth/username-taken', message: 'Username already taken' };
      }
      // Claim new, release old
      await set(ref(db, `usernames/${newKey}`), { uid: currentUser.uid, username: newUsername });
      await remove(ref(db, `usernames/${normalizeUsername(oldUsername)}`));
    }

    const updates = {
      username: newUsername,
      usernameKey: normalizeUsername(newUsername),
      status: data.status || userProfile?.status,
      photoURL,
    };

    await update(ref(db, `users/${currentUser.uid}`), updates);
    await updateProfile(currentUser, {
      displayName: updates.username,
      photoURL,
    });
  }

  // ── Block / Unblock a user ───────────────────────────────
  async function blockUser(targetUid) {
    if (!currentUser) return;
    await set(ref(db, `users/${currentUser.uid}/blocked/${targetUid}`), true);
  }

  async function unblockUser(targetUid) {
    if (!currentUser) return;
    await remove(ref(db, `users/${currentUser.uid}/blocked/${targetUid}`));
  }

  function isBlocked(targetUid) {
    return !!userProfile?.blocked?.[targetUid];
  }

  // ── Follow / Unfollow a user ─────────────────────────────
  // Structure matches deployed Firebase rules:
  //   follows/{myUid}/following/{targetUid} = true
  //   follows/{targetUid}/followers/{myUid} = true
  // Instagram-style — one-directional, no mutual approval needed.
  async function followUser(targetUid) {
    if (!currentUser) return;
    await set(ref(db, `follows/${currentUser.uid}/following/${targetUid}`), true);
    await set(ref(db, `follows/${targetUid}/followers/${currentUser.uid}`), true);
  }

  async function unfollowUser(targetUid) {
    if (!currentUser) return;
    await remove(ref(db, `follows/${currentUser.uid}/following/${targetUid}`));
    await remove(ref(db, `follows/${targetUid}/followers/${currentUser.uid}`));
  }

  function isFollowing(targetUid) {
    return !!myFollowing[targetUid];
  }

  // ── Notification preference ──────────────────────────────
  async function setNotificationsEnabled(enabled) {
    if (!currentUser) return;
    await update(ref(db, `users/${currentUser.uid}/settings`), { notificationsEnabled: enabled });
  }

  // ── Mark all chats as read ───────────────────────────────
  async function markAllAsRead() {
    if (!currentUser) return;
    const snap = await get(ref(db, `users/${currentUser.uid}/chats`));
    if (!snap.exists()) return;
    const updates = {};
    snap.forEach(child => {
      if (child.val().unread) {
        updates[`users/${currentUser.uid}/chats/${child.key}/unread`] = false;
      }
    });
    if (Object.keys(updates).length) {
      await update(ref(db), updates);
    }
  }

  // ── Delete all chat history (local user view only) ──────
  async function clearAllChatHistory() {
    if (!currentUser) return;
    await remove(ref(db, `users/${currentUser.uid}/chats`));
  }


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        const profileRef = ref(db, `users/${user.uid}`);
        onValue(profileRef, (snapshot) => {
          setUserProfile(snapshot.val());
        });

        const followsRef = ref(db, `follows/${user.uid}/following`);
        onValue(followsRef, (snapshot) => {
          setMyFollowing(snapshot.val() || {});
        });

        await update(ref(db, `users/${user.uid}`), {
          online: true,
          lastSeen: Date.now(),
        });
      } else {
        setUserProfile(null);
        setMyFollowing({});
      }

      setLoading(false);
    });

    window.addEventListener('beforeunload', async () => {
      if (auth.currentUser) {
        await update(ref(db, `users/${auth.currentUser.uid}`), {
          online: false,
          lastSeen: Date.now(),
        });
      }
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    register,
    login,
    verifyCredentialsOnly,
    getEmailForUsername,
    logout,
    updateUserProfile,
    blockUser,
    unblockUser,
    isBlocked,
    followUser,
    unfollowUser,
    isFollowing,
    myFollowing,
    setNotificationsEnabled,
    markAllAsRead,
    clearAllChatHistory,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
