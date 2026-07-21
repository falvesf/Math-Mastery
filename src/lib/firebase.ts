import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyA7vVfSIvCq1DyeeLahIraNJsEqstzjTJM",
  authDomain: "math-mastery-db.firebaseapp.com",
  projectId: "math-mastery-db",
  storageBucket: "math-mastery-db.firebasestorage.app",
  messagingSenderId: "135288354860",
  appId: "1:135288354860:web:bc1dbafd90b94e2254b989",
  measurementId: "G-0VC68ZT0PY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Configure Google Provider
export const googleProvider = new GoogleAuthProvider();
// Suggests the domain to Google login window
googleProvider.setCustomParameters({
  hd: 'eaportal.org', 
});
