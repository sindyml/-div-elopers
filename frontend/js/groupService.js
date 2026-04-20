// js/groupService.js
import { db } from './firebase-config.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  collectionGroup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { COLLECTIONS } from './constants.js';

export async function getUserGroups(uid) {
  const q = query(collection(db, COLLECTIONS.MEMBERSHIPS), where('uid', '==', uid));
  const snapshot = await getDocs(q);
  const groups = [];
  for (const membershipDoc of snapshot.docs) {
    const { groupId } = membershipDoc.data();
    const groupDoc = await getDoc(doc(db, COLLECTIONS.GROUPS, groupId));
    if (groupDoc.exists()) {
      groups.push({ id: groupId, ...groupDoc.data() });
    }
  }
  return groups;
}

export async function getGroupDetails(groupId) {
  const groupDoc = await getDoc(doc(db, COLLECTIONS.GROUPS, groupId));
  if (groupDoc.exists()) {
    return { id: groupId, ...groupDoc.data() };
  }
  return null;
}

export async function getUserRoleInGroup(groupId, uid) {
  const memberDoc = await getDoc(doc(db, COLLECTIONS.GROUPS, groupId, 'members', uid));
  return memberDoc.exists() ? memberDoc.data().role : null;
}

export async function checkAndAcceptInvites(user) {
  const q = query(
    collection(db, COLLECTIONS.INVITES),
    where('email', '==', user.email),
    where('status', '==', 'pending')
  );
  const snapshot = await getDocs(q);

  for (const docSnap of snapshot.docs) {
    const invite = docSnap.data();
    const groupId = invite.groupId;

    // Add user to the group members sub-collection
    await setDoc(doc(db, COLLECTIONS.GROUPS, groupId, 'members', user.uid), {
      uid: user.uid,
      role: 'member',
      joinedAt: serverTimestamp()
    });

    // Create a membership record for quick dashboard lookups
    await setDoc(doc(db, COLLECTIONS.MEMBERSHIPS, user.uid + '_' + groupId), {
      uid: user.uid,
      groupId: groupId
    });

    // Mark the invite as accepted
    await updateDoc(docSnap.ref, { status: 'invite accepted' });
  }
}

export async function sendInvite(groupId, inviteeEmail, invitedByUid) {
  await addDoc(collection(db, COLLECTIONS.INVITES), {
    email: inviteeEmail,
    groupId: groupId,
    invitedBy: invitedByUid,
    status: 'pending',
    createdAt: serverTimestamp()
  });
}
