// tests/integration/groupService.integration.test.js
import { initFirebaseClient } from './helpers/firebase.js';
import { collection, addDoc, doc, setDoc, updateDoc, getDoc,getDocs, query, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { describe, it, expect, beforeAll } from 'vitest';

let auth, db;
let testUser;

beforeAll(async () => {
  const client = initFirebaseClient();
  auth = client.auth;
  db = client.db;
  
  // Create a test user
  const userCred = await createUserWithEmailAndPassword(auth, 'groupuser@example.com', 'test123');
  testUser = userCred.user;
  await setDoc(doc(db, 'users', testUser.uid), { role: 'Admin' });
});

it('should create a group and add admin member', async () => {
  const groupData = {
    name: 'Integration Group',
    contributionAmount: 100,
    payoutOrder: [],
    meetingFrequency: 'monthly',
    createdBy: testUser.uid,
    createdAt: new Date(),
  };
  
  const groupRef = await addDoc(collection(db, 'groups'), groupData);
  expect(groupRef.id).toBeDefined();
  
  // Add member as admin
  const memberRef = doc(db, `groups/${groupRef.id}/members/${testUser.uid}`);
  await setDoc(memberRef, { uid: testUser.uid, role: 'admin', joinedAt: new Date() });
  
  const memberSnap = await getDoc(memberRef);
  expect(memberSnap.exists()).toBe(true);
  expect(memberSnap.data().role).toBe('admin');
});

it('should assign treasurer (only one treasurer per group)', async () => {
  // Create group
  const groupRef = await addDoc(collection(db, 'groups'), { name: 'Treasurer Test' });
  // Add member1 as admin
  await setDoc(doc(db, `groups/${groupRef.id}/members/user1`), { uid: 'user1', role: 'member' });
  await setDoc(doc(db, `groups/${groupRef.id}/members/user2`), { uid: 'user2', role: 'member' });
  
  // Assign treasurer to user1
  // First, find existing treasurer (none)
  const q = query(collection(db, `groups/${groupRef.id}/members`), where('role', '==', 'treasurer'));
  const snapshot = await getDocs(q);
  for (const docSnap of snapshot.docs) {
    await updateDoc(docSnap.ref, { role: 'member' });
  }
  await updateDoc(doc(db, `groups/${groupRef.id}/members/user1`), { role: 'treasurer' });
  
  const updated = await getDoc(doc(db, `groups/${groupRef.id}/members/user1`));
  expect(updated.data().role).toBe('treasurer');
});