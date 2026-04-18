import { db, auth } from "./firebase";
import {
  collection,
  addDoc,
  setDoc,
  doc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where
} from "firebase/firestore";

//create group
export const createGroup = async ({
  name,
  contributionAmount,
  payoutOrder,
  meetingFrequency
}) => {
  const user = auth.currentUser;

  if (!user) throw new Error("User not authenticated");

  const groupRef = await addDoc(collection(db, "groups"), {
    name,
    contributionAmount: Number(contributionAmount),
    payoutOrder,
    meetingFrequency,
    creatorUid: user.uid, 
    createdAt: serverTimestamp()
  });

  // Add creator as admin
  await setDoc(doc(db, "groups", groupRef.id, "members", user.uid), {
    uid: user.uid,
    role: "admin",
    joinedAt: serverTimestamp()
  });

  // Membership record
  await setDoc(doc(db, "memberships", `${user.uid}_${groupRef.id}`), {
    uid: user.uid,
    groupId: groupRef.id
  });

  return groupRef.id;
};

//accept invite
export const acceptInvite = async (invite, user) => {
  await setDoc(doc(db, "groups", invite.groupId, "members", user.uid), {
    uid: user.uid,
    role: "member",
    joinedAt: serverTimestamp()
  });

  await setDoc(doc(db, "memberships", `${user.uid}_${invite.groupId}`), {
    uid: user.uid,
    groupId: invite.groupId
  });

  await updateDoc(doc(db, "invites", invite.id), {
    status: "accepted"
  });
};

//decline invite
export const declineInvite = async (inviteId) => {
  await updateDoc(doc(db, "invites", inviteId), {
    status: "declined"
  });
};

//update group (admin only)
export const updateGroup = async (groupId, data) => {
  await updateDoc(doc(db, "groups", groupId), data);
};

//delete group (admin only)
export const deleteGroup = async (groupId) => {
  await deleteDoc(doc(db, "groups", groupId));
};

//get group members
export const getGroupMembers = async (groupId) => {
  const snapshot = await getDocs(
    collection(db, "groups", groupId, "members")
  );

  return snapshot.docs.map(doc => doc.data());
};

//assign treasurer (only one allowed)
export const assignTreasurer = async (groupId, newUserId) => {
  const q = query(
    collection(db, "groups", groupId, "members"),
    where("role", "==", "treasurer")
  );

  const snapshot = await getDocs(q);

  // Remove existing treasurer
  for (const docSnap of snapshot.docs) {
    await updateDoc(docSnap.ref, { role: "member" });
  }

  // Assign new treasurer
  await updateDoc(
    doc(db, "groups", groupId, "members", newUserId),
    { role: "treasurer" }
  );
};

//assign admin (only one allowed)
export const assignAdmin = async (groupId, newUserId) => {
  const q = query(
    collection(db, "groups", groupId, "members"),
    where("role", "==", "admin")
  );

  const snapshot = await getDocs(q);

  // Remove existing admin
  for (const docSnap of snapshot.docs) {
    await updateDoc(docSnap.ref, { role: "member" });
  }

  // Assign new admin
  await updateDoc(
    doc(db, "groups", groupId, "members", newUserId),
    { role: "admin" }
  );
};

//send invite
export const sendInvite = async (email, groupId) => {
  const user = auth.currentUser;

  if (!user) throw new Error("User not authenticated");

  await addDoc(collection(db, "invites"), {
    email,
    groupId,
    invitedBy: user.uid,
    status: "pending",
    createdAt: serverTimestamp()
  });
};

//ensuring functionality is allowed only to certain user roles
export const canInvite = (role) => role === "admin";
export const canAssignTreasurer = (role) => role === "admin";
export const canEditGroup = (role) => role === "admin";
export const canDeleteGroup = (role) => role === "admin";
export const canViewDashboard = (role) =>
  ["admin", "treasurer", "member"].includes(role);