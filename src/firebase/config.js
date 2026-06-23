// ============================================================
// src/firebase/config.js
// Firebase configuration — replace with YOUR Firebase project
// credentials from: Firebase Console → Project Settings → SDK
// ============================================================
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// 🔧 REPLACE THESE WITH YOUR OWN FIREBASE PROJECT CREDENTIALS
const firebaseConfig = {
  apiKey: "AIzaSyBcz3-LKlHSqfLLm5Kd8NHD6RmW8Vh80Zs",
  authDomain: "vartalapchat-5b633.firebaseapp.com",
  databaseURL: "https://vartalapchat-5b633-default-rtdb.firebaseio.com",
  projectId: "vartalapchat-5b633",
  storageBucket: "vartalapchat-5b633.firebasestorage.app",
  messagingSenderId: "250634170645",
  appId: "1:250634170645:web:b1d6db604cb01ed7e4791c",
  measurementId: "G-J34MRPJGT0"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export default app;
