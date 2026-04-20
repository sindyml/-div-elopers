import { initFirebaseClient } from './helpers/firebase.js';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

let auth;

beforeAll(() => {
  const client = initFirebaseClient();
  auth = client.auth;
});

afterAll(async () => {
  await auth.signOut();
});

it('should sign out the current user', async () => {
  // Create a user and sign in
  const email = `logout${Date.now()}@example.com`;
  const password = 'test123';
  await createUserWithEmailAndPassword(auth, email, password);
  expect(auth.currentUser).not.toBeNull();

  // Sign out
  await signOut(auth);
  expect(auth.currentUser).toBeNull();
});