# VartaLap — WhatsApp-style Chat App

A full-stack real-time chat web application built with **React + Firebase**, redesigned with a clean WhatsApp-inspired UI. Includes user-to-user messaging, online presence, and an admin panel.

---

## 🔥 Firebase Setup (Required First)

### 1. Create a Firebase Project
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → give it a name (e.g. `vartalap-web`)
3. Disable Google Analytics (optional) → **Create project**

### 2. Enable Authentication
1. Left sidebar → **Build → Authentication**
2. Click **Get started**
3. Click **Email/Password** → Toggle **Enable** → Save

### 3. Enable Realtime Database
1. Left sidebar → **Build → Realtime Database**
2. Click **Create database**
3. Choose a region (closest to you)
4. Start in **test mode** (you'll add rules below)

### 4. Enable Firebase Storage
1. Left sidebar → **Build → Storage**
2. Click **Get started** → **Next → Done**

### 5. Get Your Config Keys
1. Left sidebar → ⚙️ **Project Settings** → **General** tab
2. Scroll to **"Your apps"** → Click **</>** (web)
3. App nickname: `VartaLap Web` → Register app
4. Copy the `firebaseConfig` object — you'll need this next

---

## ⚙️ Project Setup

### Step 1: Add Firebase Config
Open `src/firebase/config.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",                         // ← paste yours
  authDomain: "vartalap-xxx.firebaseapp.com",
  databaseURL: "https://vartalap-xxx-default-rtdb.firebaseio.com",
  projectId: "vartalap-xxx",
  storageBucket: "vartalap-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### Step 2: Set Database Rules
In Firebase Console → Realtime Database → **Rules** tab, paste:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "chats": {
      "$chatId": {
        ".read": "auth != null && ($chatId.contains(auth.uid))",
        ".write": "auth != null && ($chatId.contains(auth.uid))"
      }
    }
  }
}
```
Click **Publish**.

### Step 3: Set Storage Rules
In Firebase Console → Storage → **Rules** tab:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 🚀 Running the App

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🛡️ Making Yourself an Admin

1. Register an account in the app
2. In Firebase Console → Realtime Database, navigate to:
   `users → [your-uid] → role`
3. Change the value from `"user"` to `"admin"`
4. Refresh the app → open your Profile → you'll see "Admin Panel" button

Or set it programmatically:
```js
// In Firebase Console → Realtime Database → click the "+" button
// Path: users/YOUR_UID/role
// Value: admin
```

---

## 📁 Project Structure

```
src/
├── firebase/
│   └── config.js          ← Firebase initialization
├── context/
│   └── AuthContext.jsx    ← Auth state & user management
├── hooks/
│   └── useChat.js         ← Real-time chat hooks
├── components/
│   ├── Sidebar.jsx        ← User list + search
│   ├── ChatWindow.jsx     ← Message bubbles + input
│   └── ProfileDrawer.jsx  ← Edit profile + logout
├── pages/
│   ├── LoginPage.jsx
│   ├── RegisterPage.jsx
│   ├── ChatPage.jsx       ← Main chat layout
│   └── AdminPage.jsx      ← Admin dashboard
├── index.css              ← Complete design system
└── App.jsx                ← Router + providers
```

---

## ✨ Features

| Feature | Status |
|---|---|
| Email/Password auth | ✅ |
| Register with avatar | ✅ |
| Real-time 1-on-1 messaging | ✅ |
| Online/Offline presence | ✅ |
| Message timestamps | ✅ |
| Date dividers | ✅ |
| User search | ✅ |
| Edit profile & status | ✅ |
| Admin panel (users, stats) | ✅ |
| Promote/demote admins | ✅ |
| Mobile responsive | ✅ |
| WhatsApp-style UI | ✅ |

---

## 🎨 Design

- **Color palette:** WhatsApp teal (`#075E54`, `#128C7E`, `#25D366`)
- **Font:** Inter (Google Fonts)
- **Chat background:** Classic WhatsApp pattern with `#E5DDD5`
- **Message bubbles:** Green for sent (`#D9FDD3`), white for received

---

## 🔗 Deployment

### Firebase Hosting (recommended)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting  # select "dist" as public folder
npm run build
firebase deploy
```

### Vercel
```bash
npm install -g vercel
vercel
```

---

## 🐛 Bugs Fixed from Original Android App

| Original Bug | Fix Applied |
|---|---|
| `msgModelclass.java` was entirely commented out | Replaced with proper message model |
| Password stored in plaintext in database | Removed password from DB, use Firebase Auth only |
| `progressDialog.show()` called after success (wrong order) | Fixed sequence |
| All users shown including self | Filter current user from list |
| No error handling on Firebase calls | Added `.catch()` & toast notifications |
| `startActivityForResult` deprecated | Replaced with modern file picker |
| Missing null checks on snapshot values | Added null safety throughout |
| Chat duplicated messages (both rooms) | Unified chat using sorted UID pair as roomId |
| `GAuthToken` import (unused, error-prone) | Removed |
| No online/offline status tracking | Added with `onDisconnect` pattern |
