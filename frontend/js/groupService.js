import { db, auth } from './firebase-config.js';
import {
  collection,
  addDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { COLLECTIONS } from './constants.js';
import { handleMemberJoin } from './onGroupCreate.js';

export async function createGroup({
  name,
  contributionAmount,
  payoutOrder,
  meetingFrequency
}) {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const groupRef = await addDoc(collection(db, COLLECTIONS.GROUPS), {
    name,
    contributionAmount: Number(contributionAmount),
    payoutOrder,
    meetingFrequency,
    creatorUid: user.uid,
    createdAt: serverTimestamp()
  });

  await setDoc(doc(db, COLLECTIONS.GROUPS, groupRef.id, 'members', user.uid), {
    uid: user.uid,
    role: 'admin',
    joinedAt: serverTimestamp()
  });

  await setDoc(doc(db, COLLECTIONS.MEMBERSHIPS, `${user.uid}_${groupRef.id}`), {
    uid: user.uid,
    groupId: groupRef.id
  });

  return groupRef.id;
}

export async function getUserGroups(uid = auth.currentUser?.uid) {
  if (!uid) return [];

  const q = query(collection(db, COLLECTIONS.MEMBERSHIPS), where('uid', '==', uid));
  const snapshot = await getDocs(q);

  const groups = await Promise.all(
    snapshot.docs.map(async (membershipDoc) => {
      const { groupId } = membershipDoc.data();
      const groupDoc = await getDoc(doc(db, COLLECTIONS.GROUPS, groupId));
      if (!groupDoc.exists()) return null;
      return { id: groupId, ...groupDoc.data() };
    })
  );

  return groups.filter(Boolean);
}

export async function getGroupDetails(groupId) {
  const groupDoc = await getDoc(doc(db, COLLECTIONS.GROUPS, groupId));
  if (!groupDoc.exists()) return null;
  return { id: groupId, ...groupDoc.data() };
}

export async function getGroupMembers(groupId) {
  const snapshot = await getDocs(collection(db, COLLECTIONS.GROUPS, groupId, 'members'));
  return snapshot.docs.map((memberDoc) => ({ id: memberDoc.id, ...memberDoc.data() }));
}

export async function getUserRoleInGroup(groupId, uid) {
  const memberDoc = await getDoc(doc(db, COLLECTIONS.GROUPS, groupId, 'members', uid));
  return memberDoc.exists() ? memberDoc.data().role : null;
}

export async function acceptInvite(invite, user) {
  await setDoc(doc(db, COLLECTIONS.GROUPS, invite.groupId, 'members', user.uid), {
    uid: user.uid,
    role: 'member',
    joinedAt: serverTimestamp()
  });

  await setDoc(doc(db, COLLECTIONS.MEMBERSHIPS, `${user.uid}_${invite.groupId}`), {
    uid: user.uid,
    groupId: invite.groupId
  });

  await updateDoc(doc(db, COLLECTIONS.INVITES, invite.id), { status: 'accepted' });
}

export async function declineInvite(inviteId) {
  await updateDoc(doc(db, COLLECTIONS.INVITES, inviteId), { status: 'declined' });
}

export async function checkAndAcceptInvites(user) {
  const q = query(
    collection(db, COLLECTIONS.INVITES),
    where('email', '==', user.email),
    where('status', '==', 'pending')
  );
  const snapshot = await getDocs(q);

  for (const inviteDoc of snapshot.docs) {
    const invite = { id: inviteDoc.id, ...inviteDoc.data() };
    await acceptInvite(invite, user);
    await handleMemberJoin(invite.groupId, user.uid);
  }
}

export async function sendInvite(a, b, c) {
  const user = auth.currentUser;

  const usingLegacySignature = typeof c === 'undefined';
  const groupId = usingLegacySignature ? b : a;
  const email = usingLegacySignature ? a : b;
  const invitedBy = usingLegacySignature ? user?.uid : c;

  if (!groupId || !email || !invitedBy) {
    throw new Error('User not authenticated');
  }

  const expiryDate = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  await addDoc(collection(db, COLLECTIONS.INVITES), {
    email,
    groupId,
    invitedBy,
    status: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: expiryDate
  });
}

export async function resendInvite(email, groupId) {
  const q = query(
    collection(db, COLLECTIONS.INVITES),
    where('email', '==', email),
    where('groupId', '==', groupId)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) throw new Error('Invite not found');

  const inviteDoc = snapshot.docs[0];
  const newExpiry = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  await updateDoc(inviteDoc.ref, {
    status: 'pending',
    expiresAt: newExpiry
  });
}

export async function updateGroup(groupId, data) {
  await updateDoc(doc(db, COLLECTIONS.GROUPS, groupId), data);
}

export async function deleteGroup(groupId) {
  await deleteDoc(doc(db, COLLECTIONS.GROUPS, groupId));
}
