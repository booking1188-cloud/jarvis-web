import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAb-gmKyBvKQEZMVKhbBVLrVUP0MrFraYs",
  authDomain: "jarvis-mobile-ae1ec.firebaseapp.com",
  projectId: "jarvis-mobile-ae1ec",
  storageBucket: "jarvis-mobile-ae1ec.firebasestorage.app",
  messagingSenderId: "455095494021",
  appId: "1:455095494021:web:ec8ca78fb88e05632710ec",
  measurementId: "G-EF72SW53LR"
};

let app, auth, db, provider;

try {
  if (firebaseConfig.apiKey !== "PLACEHOLDER_API_KEY") {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    provider = new GoogleAuthProvider();
  }
} catch (error) {
  console.error("Firebase Initialization Error:", error);
}

export { auth, db, provider, signInWithPopup, signOut, doc, setDoc, getDoc, onSnapshot };
