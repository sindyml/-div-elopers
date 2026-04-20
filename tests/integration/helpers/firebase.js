// tests/integration/helpers/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'fake-api-key',
  projectId: 'demo-stokpal',
  authDomain: 'demo-stokpal.firebaseapp.com',
};

let app;
let auth;
let db;

export function initFirebaseClient() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    // Connect to emulators
    connectAuthEmulator(auth, 'http://127.0.0.1:9099');
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { auth, db };
}