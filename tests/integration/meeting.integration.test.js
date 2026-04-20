// tests/integration/meeting.integration.test.js
import { initFirebaseClient } from './helpers/firebase.js';
import { collection, addDoc, updateDoc, doc, getDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { describe, it, expect, beforeAll } from 'vitest';

let auth, db;
let testUser;

beforeAll(async () => {
  const client = initFirebaseClient();
  auth = client.auth;
  db = client.db;
  const userCred = await createUserWithEmailAndPassword(auth, 'meetuser@example.com', 'test123');
  testUser = userCred.user;
});

it('should schedule a meeting', async () => {
  const meetingData = {
    groupId: 'test-group-id',
    title: 'Weekly Sync',
    date: '2026-05-01',
    time: '14:00',
    location: 'Online',
    agenda: 'Discuss budget',
    minutes: '',
    createdBy: testUser.uid,
    createdAt: new Date(),
  };
  const docRef = await addDoc(collection(db, 'meetings'), meetingData);
  const docSnap = await getDoc(docRef);
  expect(docSnap.exists()).toBe(true);
  expect(docSnap.data().title).toBe('Weekly Sync');
});

it('should record minutes for a meeting', async () => {
  const meetingRef = await addDoc(collection(db, 'meetings'), {
    groupId: 'test-group',
    title: 'Minutes Test',
    minutes: '',
  });
  await updateDoc(meetingRef, { minutes: 'Decided to increase savings.' });
  const updated = await getDoc(meetingRef);
  expect(updated.data().minutes).toContain('increase savings');
});