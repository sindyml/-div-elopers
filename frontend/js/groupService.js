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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { COLLECTIONS } from './constants.js';

export async function getUserGroups(uid) {
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

  return groups.filter((group) => group !== null);
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

// Only auto-accepts invites that came in before the user registered
// (i.e. invited by email before they had an account).
// Manual invites shown as notifications are handled by acceptInvite().
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

    await setDoc(doc(db, COLLECTIONS.GROUPS, groupId, 'members', user.uid), {
      uid: user.uid,
      displayName: user.displayName || user.email,
      role: 'Member',
      joinedAt: serverTimestamp()
    });

    await setDoc(doc(db, COLLECTIONS.MEMBERSHIPS, user.uid + '_' + groupId), {
      uid: user.uid,
      groupId: groupId,
      role: 'Member'
    });

    await updateDoc(docSnap.ref, { status: 'invite accepted' });
  }
}

// Returns pending invites for a user — used to show Accept/Decline notifications
export async function checkPendingInvites(user) {
  const q = query(
    collection(db, COLLECTIONS.INVITES),
    where('email', '==', user.email),
    where('status', '==', 'pending')
  );

  const snapshot = await getDocs(q);

  // Enrich each invite with group name
  const invites = await Promise.all(
    snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      let groupName = data.groupName || null;

      if (!groupName && data.groupId) {
        const groupDoc = await getDoc(doc(db, COLLECTIONS.GROUPS, data.groupId));
        if (groupDoc.exists()) {
          groupName = groupDoc.data().name;
        }
      }

      return { id: docSnap.id, ...data, groupName };
    })
  );

  return invites;
}

// Sends an invite and returns inviteId + targetUserId (if the invitee already has an account)
export async function sendInvite(groupId, inviteeEmail, invitedByUid) {
  // Check if a user with this email already exists
  let targetUserId = null;

  const usersSnap = await getDocs(
    query(collection(db, COLLECTIONS.USERS || 'users'), where('email', '==', inviteeEmail))
  );

  if (!usersSnap.empty) {
    targetUserId = usersSnap.docs[0].id;
  }

  const inviteRef = await addDoc(collection(db, COLLECTIONS.INVITES), {
    email: inviteeEmail,
    groupId: groupId,
    invitedBy: invitedByUid,
    status: 'pending',
    createdAt: serverTimestamp()
  });

  return {
    inviteId: inviteRef.id,
    targetUserId // null if user doesn't have an account yet
  };
}

// Accepts a specific invite by ID — called when user clicks Accept on a notification
export async function acceptInvite(inviteId, user) {
  const inviteRef = doc(db, COLLECTIONS.INVITES, inviteId);
  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) throw new Error('Invite not found');

  const invite = inviteSnap.data();

  if (invite.status !== 'pending') throw new Error('Invite is no longer pending');

  const groupId = invite.groupId;

  await setDoc(doc(db, COLLECTIONS.GROUPS, groupId, 'members', user.uid), {
    uid: user.uid,
    displayName: user.displayName || user.email,
    role: 'Member',
    joinedAt: serverTimestamp()
  });

  await setDoc(doc(db, COLLECTIONS.MEMBERSHIPS, user.uid + '_' + groupId), {
    uid: user.uid,
    groupId: groupId,
    role: 'Member'
  });

  await updateDoc(inviteRef, { status: 'invite accepted' });
}

// Declines a specific invite by ID — called when user clicks Decline on a notification
export async function declineInvite(inviteId) {
  const inviteRef = doc(db, COLLECTIONS.INVITES, inviteId);
  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) throw new Error('Invite not found');

  const invite = inviteSnap.data();

  if (invite.status !== 'pending') throw new Error('Invite is no longer pending');

  await updateDoc(inviteRef, { status: 'declined' });
}
