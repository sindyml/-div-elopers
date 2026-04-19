// tests/integration/auth.integration.test.js
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

let app;
let auth;
let db;

beforeAll(() => {
  app = initializeApp({ projectId: 'demo-stokpal' });
  auth = getAuth(app);
  db = getFirestore(app);
});

afterAll(async () => {
  try {
    await auth.deleteUser('user123');
  } catch (e) {}
  await deleteApp(app);
});

it('should create a user in Auth emulator and write to Firestore', async () => {
  const userRecord = await auth.createUser({
    uid: 'user123',
    email: 'test@stokpal.com',
    password: 'password123',
  });
  expect(userRecord.uid).toBe('user123');

  const docRef = db.collection('users').doc('user123');
  await docRef.set({ role: 'Member', email: 'test@stokpal.com' });
  const doc = await docRef.get();
  expect(doc.exists).toBe(true);
  expect(doc.data().role).toBe('Member');
});