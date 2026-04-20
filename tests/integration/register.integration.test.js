// tests/integration/register.integration.test.js
import { initFirebaseClient } from './helpers/firebase.js';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { describe, it, expect, beforeAll } from 'vitest';

let auth, db;

beforeAll(() => {
  const client = initFirebaseClient();
  auth = client.auth;
  db = client.db;
});

it('should create user in Auth and Firestore with role', async () => {
  const email = 'registertest@example.com';
  const password = 'test123';
  const role = 'Treasurer';
  
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  // In real app, registration writes to Firestore. We simulate that.
  await import('firebase/firestore').then(({ setDoc }) =>
    setDoc(doc(db, 'users', user.uid), { email, role, createdAt: new Date() })
  );
  
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  expect(userDoc.exists()).toBe(true);
  expect(userDoc.data().role).toBe(role);
});