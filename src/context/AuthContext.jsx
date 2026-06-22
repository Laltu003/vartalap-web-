import { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { ref, set, get, update, onValue } from 'firebase/database';
import { auth, db } from '../firebase/config';
import { uploadAvatar } from '../utils/cloudinary';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

// Default avatar generator — no Storage needed, just a URL
function defaultAvatar(username) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=128C7E&color=fff&size=200`;
}

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  /**
   * Checks whether a username is already taken.
   * @returns {Promise<boolean>} true if available
   */
  async function isUsernameAvailable(username) {
    const key = normalizeUsername(username);
    const snap = await get(ref(db, `usernames/${key}`));
    return !snap.exists();
  }

  /**
   * Finishes registration AFTER OTP has been verified.
   * Creates the Firebase Auth user, reserves the username, uploads avatar,
   * and writes the user profile to the database.
   */
  async function completeRegistration({ email, password, username, avatarFile }) {
    const key = normalizeUsername(username);

    // Double-check username didn't get taken between OTP-send and now
    const available = await isUsernameAvailable(username);
    if (!available) {
      throw new Error('username-taken');
    }

    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;

    let photoURL = defaultAvatar(username);
    if (avatarFile) {
      try {
        photoURL = await uploadAvatar(avatarFile);
      } catch (err) {
        console.error('Avatar upload failed, using default avatar:', err);
      }
    }

    await updateProfile(user, { displayName: username, photoURL });

    // Reserve the username -> uid/email mapping
    await set(ref(db, `usernames/${key}`), {
      uid: user.uid,
      email,
    });

    // Save full user profile
    await set(ref(db, `users/${user.uid}`), {
      uid: user.uid,
      username,
      email,
      photoURL,
      status: "Hey, I'm using VartaLap!",
      role: 'user',
      online: true,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    });

    return user;
  }

  // Login using USERNAME + password (no email field shown to user)
  async function login(username, password) {
    const key = normalizeUsername(username);
    const snap = await get(ref(db, `usernames/${key}`));

    if (!snap.exists()) {
      const err = new Error('Username not found');
      err.code = 'auth/user-not-found';
      throw err;
    }

    const { email } = snap.val();
    const result = await signInWithEmailAndPassword(auth, email, password);

    await update(ref(db, `users/${result.user.uid}`), {
      online: true,
      lastSeen: Date.now(),
    });
    return result;
  }

  /**
   * Resolves a "username or email" identifier into an actual email address.
   * Used by the forgot-password flow, where the user might type either.
   */
  async function resolveEmailFromIdentifier(identifier) {
    const trimmed = identifier.trim();
    if (!trimmed) return null;

    // Looks like an email already
    if (trimmed.includes('@')) return trimmed;

    // Otherwise treat it as a username and look it up
    const key = normalizeUsername(trimmed);
    const snap = await get(ref(db, `usernames/${key}`));
    if (!snap.exists()) return null;
    return snap.val().email;
  }

  /**
   * Sends Firebase's official password reset email. This is the only
   * mechanism that can actually let a signed-out user set a new password
   * without a backend (Admin SDK), since Firebase's own servers verify
   * the reset link, not our client code.
   */
  async function sendPasswordReset(email) {
    await sendPasswordResetEmail(auth, email);
  }

  // Logout
  async function logout() {
    if (currentUser) {
      await update(ref(db, `users/${currentUser.uid}`), {
        online: false,
        lastSeen: Date.now(),
      });
    }
    return signOut(auth);
  }

  // Update profile. avatarFile is an optional File object from a file picker.
  async function updateUserProfile(data) {
    if (!currentUser) return;

    let photoURL = userProfile?.photoURL || defaultAvatar(data.username || userProfile?.username);
    if (data.avatarFile) {
      try {
        photoURL = await uploadAvatar(data.avatarFile);
      } catch (err) {
        console.error('Avatar upload failed, keeping previous photo:', err);
        throw err;
      }
    }

    const updates = {
      username: data.username || userProfile?.username,
      status: data.status || userProfile?.status,
      photoURL,
    };

    await update(ref(db, `users/${currentUser.uid}`), updates);
    await updateProfile(currentUser, {
      displayName: updates.username,
      photoURL,
    });
  }

  // Listen to auth state
  useEffect(() => {
    let profileUnsub;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        const profileRef = ref(db, `users/${user.uid}`);
        let retried = false;
        function subscribeProfile() {
          profileUnsub = onValue(
            profileRef,
            (snapshot) => {
              setUserProfile(snapshot.val());
            },
            (err) => {
              // Known Firebase RTDB quirk: the first onValue right after
              // sign-in can fail once with permission_denied even with
              // correct rules. Retry once before giving up.
              console.error('Profile listener error code:', err?.code, 'message:', err?.message);
              if (!retried) {
                retried = true;
                setTimeout(subscribeProfile, 400);
              }
            }
          );
        }
        subscribeProfile();

        await update(ref(db, `users/${user.uid}`), {
          online: true,
          lastSeen: Date.now(),
        });
      } else {
        setUserProfile(null);
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

    return () => {
      unsubscribe();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const value = {
    currentUser,
    userProfile,
    isUsernameAvailable,
    completeRegistration,
    login,
    logout,
    updateUserProfile,
    resolveEmailFromIdentifier,
    sendPasswordReset,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
