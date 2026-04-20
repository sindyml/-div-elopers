// tests/integration/login.integration.test.js
import { initFirebaseClient } from './helpers/firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

let auth, db;

beforeAll(() => {
  const client = initFirebaseClient();
  auth = client.auth;
  db = client.db;
});

afterAll(async () => {
  // Clean up: delete test user via Admin SDK (or leave for next run)
  // For simplicity, we don't delete; emulator resets each run.
});

it('should allow email login with correct credentials', async () => {
  // Create a test user
  const email = 'logintest@example.com';
  const password = 'test123';
  await createUserWithEmailAndPassword(auth, email, password);
  
  // Store user role in Firestore (simulate registration)
  const user = auth.currentUser;
  await setDoc(doc(db, 'users', user.uid), {
    email,
    role: 'Member',
    createdAt: new Date(),
  });
  await auth.signOut();

  // Now login
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  expect(userCredential.user.email).toBe(email);
  
  // Verify Firestore doc exists
  const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
  expect(userDoc.exists()).toBe(true);
  expect(userDoc.data().role).toBe('Member');
});

it('should reject login with wrong password', async () => {
  await expect(signInWithEmailAndPassword(auth, 'nonexistent@example.com', 'wrong'))
    .rejects.toThrow();
});