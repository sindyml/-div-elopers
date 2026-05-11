import { db, auth } from "./firebase-config.js";

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

} from "firebase/firestore";

/* =========================================================
COLLECTIONS
========================================================= */

export const COLLECTIONS = {

GROUPS: "groups",

MEMBERSHIPS: "memberships",

INVITES: "invites"
};

/* =========================================================
CREATE GROUP
========================================================= */

export async function createGroup({

name,
contributionAmount,
payoutOrder,
meetingFrequency

}) {

const user = auth.currentUser;

if (!user) {
throw new Error("User not authenticated");
}

const groupRef = await addDoc(

collection(db, COLLECTIONS.GROUPS),

{
name,
contributionAmount: Number(contributionAmount),
payoutOrder,
meetingFrequency,
creatorUid: user.uid,
createdAt: serverTimestamp()
}
);

// Add creator as admin
await setDoc(

doc(
db,
COLLECTIONS.GROUPS,
groupRef.id,
"members",
user.uid
),

{
uid: user.uid,
role: "admin",
joinedAt: serverTimestamp()
}
);

// Membership record
await setDoc(

doc(
db,
COLLECTIONS.MEMBERSHIPS,
`${user.uid}_${groupRef.id}`
),

{
uid: user.uid,
groupId: groupRef.id
}
);

return groupRef.id;
}

/* =========================================================
USER GROUPS
========================================================= */

export async function getUserGroups(
uid = auth.currentUser?.uid
) {

if (!uid) return [];

const q = query(

collection(db, COLLECTIONS.MEMBERSHIPS),

where("uid", "==", uid)
);

const snapshot = await getDocs(q);

const groups = await Promise.all(

snapshot.docs.map(async membershipDoc => {

const { groupId } = membershipDoc.data();

const groupDoc = await getDoc(
doc(db, COLLECTIONS.GROUPS, groupId)
);

if (!groupDoc.exists()) {
return null;
}

return {
id: groupId,
...groupDoc.data()
};
})
);

return groups.filter(Boolean);
}

/* =========================================================
GROUP DETAILS
========================================================= */

export async function getGroupDetails(groupId) {

const groupDoc = await getDoc(
doc(db, COLLECTIONS.GROUPS, groupId)
);

if (!groupDoc.exists()) {
return null;
}

return {
id: groupId,
...groupDoc.data()
};
}

/* =========================================================
GROUP MEMBERS
========================================================= */

export async function getGroupMembers(groupId) {

const snapshot = await getDocs(
collection(db, COLLECTIONS.GROUPS, groupId, "members")
);

return snapshot.docs.map(doc => ({
id: doc.id,
...doc.data()
}));
}

/* =========================================================
ACCEPT INVITE
========================================================= */

export async function acceptInvite(invite, user) {

// Add member
await setDoc(

doc(
db,
COLLECTIONS.GROUPS,
invite.groupId,
"members",
user.uid
),

{
uid: user.uid,
role: "member",
joinedAt: serverTimestamp()
}
);

// Membership
await setDoc(

doc(
db,
COLLECTIONS.MEMBERSHIPS,
`${user.uid}_${invite.groupId}`
),

{
uid: user.uid,
groupId: invite.groupId
}
);

// Update invite
await updateDoc(

doc(db, COLLECTIONS.INVITES, invite.id),

{
status: "accepted"
}
);
}

/* =========================================================
DECLINE INVITE
========================================================= */

export async function declineInvite(inviteId) {

await updateDoc(

doc(db, COLLECTIONS.INVITES, inviteId),

{
status: "declined"
}
);
}

/* =========================================================
SEND INVITE
========================================================= */

export async function sendInvite(email, groupId) {

const user = auth.currentUser;

if (!user) {
throw new Error("User not authenticated");
}

// Expiration = 7 days
const expiryDate = Timestamp.fromDate(

new Date(
Date.now() +
7 * 24 * 60 * 60 * 1000
)
);

await addDoc(

collection(db, COLLECTIONS.INVITES),

{
email,
groupId,
invitedBy: user.uid,
status: "pending",
createdAt: serverTimestamp(),
expiresAt: expiryDate
}
);
}

/* =========================================================
RESEND INVITE
========================================================= */

export async function resendInvite(
email,
groupId
) {

const q = query(

collection(db, COLLECTIONS.INVITES),

where("email", "==", email),
where("groupId", "==", groupId)
);

const snapshot = await getDocs(q);

if (snapshot.empty) {
throw new Error("Invite not found");
}

const inviteDoc = snapshot.docs[0];

const newExpiry = Timestamp.fromDate(

new Date(
Date.now() +
7 * 24 * 60 * 60 * 1000
)
);

await updateDoc(

inviteDoc.ref,

{
status: "pending",
expiresAt: newExpiry
}
);
}

/* =========================================================
UPDATE GROUP
========================================================= */

export async function updateGroup(
groupId,
data
) {

await updateDoc(
doc(db, COLLECTIONS.GROUPS, groupId),
data
);
}

/* =========================================================
DELETE GROUP
========================================================= */

export async function deleteGroup(groupId) {

await deleteDoc(
doc(db, COLLECTIONS.GROUPS, groupId)
);
}


On Mon, 11 May 2026 at 12:03, owen govender <odg.govender@gmail.com> wrote:
import { db, auth } from "./firebase";

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
} from "firebase/firestore";

/* =========================================================
COLLECTION NAMES
========================================================= */

export const COLLECTIONS = {
GROUPS: "groups",
MEMBERSHIPS: "memberships",
INVITES: "invites"
};

/* =========================================================
CREATE GROUP
========================================================= */

export const createGroup = async ({
name,
contributionAmount,
payoutOrder,
meetingFrequency
}) => {

const user = auth.currentUser;

if (!user) {
throw new Error("User not authenticated");
}

// Create group
const groupRef = await addDoc(
collection(db, COLLECTIONS.GROUPS),
{
name,
contributionAmount: Number(contributionAmount),
payoutOrder,
meetingFrequency,
creatorUid: user.uid,
createdAt: serverTimestamp()
}
);

// Add creator as admin
await setDoc(
doc(
db,
COLLECTIONS.GROUPS,
groupRef.id,
"members",
user.uid
),
{
uid: user.uid,
role: "admin",
joinedAt: serverTimestamp()
}
);

// Membership record
await setDoc(
doc(
db,
COLLECTIONS.MEMBERSHIPS,
`${user.uid}_${groupRef.id}`
),
{
uid: user.uid,
groupId: groupRef.id
}
);

return groupRef.id;
};

/* =========================================================
USER GROUPS
========================================================= */

export async function getUserGroups(uid = auth.currentUser?.uid) {

if (!uid) return [];

const q = query(
collection(db, COLLECTIONS.MEMBERSHIPS),
where("uid", "==", uid)
);

const snapshot = await getDocs(q);

const groups = await Promise.all(

snapshot.docs.map(async (membershipDoc) => {

const { groupId } = membershipDoc.data();

const groupDoc = await getDoc(
doc(db, COLLECTIONS.GROUPS, groupId)
);

if (!groupDoc.exists()) {
return null;
}

return {
id: groupId,
...groupDoc.data()
};
})
);

return groups.filter(group => group !== null);
}

/* =========================================================
GROUP DETAILS
========================================================= */

export async function getGroupDetails(groupId) {

const groupDoc = await getDoc(
doc(db, COLLECTIONS.GROUPS, groupId)
);

if (!groupDoc.exists()) {
return null;
}

return {
id: groupId,
...groupDoc.data()
};
}

/* =========================================================
GROUP MEMBERS
========================================================= */

export const getGroupMembers = async (groupId) => {

const snapshot = await getDocs(
collection(db, COLLECTIONS.GROUPS, groupId, "members")
);

return snapshot.docs.map(doc => ({
id: doc.id,
...doc.data()
}));
};

/* =========================================================
USER ROLE IN GROUP
========================================================= */

export async function getUserRoleInGroup(groupId, uid) {

const memberDoc = await getDoc(
doc(
db,
COLLECTIONS.GROUPS,
groupId,
"members",
uid
)
);

return memberDoc.exists()
? memberDoc.data().role
: null;
}

/* =========================================================
ACCEPT INVITE
========================================================= */

export const acceptInvite = async (invite, user) => {

// Add member
await setDoc(
doc(
db,
COLLECTIONS.GROUPS,
invite.groupId,
"members",
user.uid
),
{
uid: user.uid,
role: "member",
joinedAt: serverTimestamp()
}
);

// Create membership
await setDoc(
doc(
db,
COLLECTIONS.MEMBERSHIPS,
`${user.uid}_${invite.groupId}`
),
{
uid: user.uid,
groupId: invite.groupId
}
);

// Update invite
await updateDoc(
doc(db, COLLECTIONS.INVITES, invite.id),
{
status: "accepted"
}
);
};

/* =========================================================
DECLINE INVITE
========================================================= */

export const declineInvite = async (inviteId) => {

await updateDoc(
doc(db, COLLECTIONS.INVITES, inviteId),
{
status: "declined"
}
);
};

/* =========================================================
CHECK & AUTO-PROCESS INVITES
========================================================= */

export async function checkAndAcceptInvites(user) {

const q = query(
collection(db, COLLECTIONS.INVITES),
where("email", "==", user.email),
where("status", "==", "pending")
);

const snapshot = await getDocs(q);

for (const docSnap of snapshot.docs) {

const invite = {
id: docSnap.id,
...docSnap.data()
};

await acceptInvite(invite, user);
}
}

/* =========================================================
SEND INVITE
========================================================= */

export const sendInvite = async (
email,
groupId
) => {

const user = auth.currentUser;

if (!user) {
throw new Error("User not authenticated");
}

// Expiry = 7 days
const expiryDate = Timestamp.fromDate(
new Date(
Date.now() +
7 * 24 * 60 * 60 * 1000
)
);

await addDoc(
collection(db, COLLECTIONS.INVITES),
{
email,
groupId,
invitedBy: user.uid,
status: "pending",
createdAt: serverTimestamp(),
expiresAt: expiryDate
}
);
};

/* =========================================================
RESEND INVITE
========================================================= */

export const resendInvite = async (
email,
groupId
) => {

const q = query(
collection(db, COLLECTIONS.INVITES),
where("email", "==", email),
where("groupId", "==", groupId)
);

const snapshot = await getDocs(q);

if (snapshot.empty) {
throw new Error("Invite not found");
}

const inviteDoc = snapshot.docs[0];

const newExpiry = Timestamp.fromDate(
new Date(
Date.now() +
7 * 24 * 60 * 60 * 1000
)
);

await updateDoc(
inviteDoc.ref,
{
status: "pending",
expiresAt: newExpiry
}
);
};

/* =========================================================
UPDATE GROUP
========================================================= */

export const updateGroup = async (
groupId,
data
) => {

await updateDoc(
doc(db, COLLECTIONS.GROUPS, groupId),
data
);
};

/* =========================================================
DELETE GROUP
========================================================= */

export const deleteGroup = async (groupId) => {

await deleteDoc(
doc(db, COLLECTIONS.GROUPS, groupId)
);
};

/* =========================================================
ASSIGN TREASURER
========================================================= */

export const assignTreasurer = async (
groupId,
newUserId
) => {

const q = query(
collection(db, COLLECTIONS.GROUPS, groupId, "members"),
where("role", "==", "treasurer")
);

const snapshot = await getDocs(q);

// Remove current treasurer
for (const docSnap of snapshot.docs) {

await updateDoc(docSnap.ref, {
role: "member"
});
}

// Assign new treasurer
await updateDoc(
doc(
db,
COLLECTIONS.GROUPS,
groupId,
"members",
newUserId
),
{
role: "treasurer"
}
);
};

/* =========================================================
ASSIGN ADMIN
========================================================= */

export const assignAdmin = async (
groupId,
newUserId
) => {

const q = query(
collection(db, COLLECTIONS.GROUPS, groupId, "members"),
where("role", "==", "admin")
);

const snapshot = await getDocs(q);

// Remove current admin
for (const docSnap of snapshot.docs) {

await updateDoc(docSnap.ref, {
role: "member"
});
}

// Assign new admin
await updateDoc(
doc(
db,
COLLECTIONS.GROUPS,
groupId,
"members",
newUserId
),
{
role: "admin"
}
);
};

/* =========================================================
ROLE HELPERS
========================================================= */

export const canInvite = role =>
role === "admin";

export const canAssignTreasurer = role =>
role === "admin";

export const canEditGroup = role =>
role === "admin";

export const canDeleteGroup = role =>
role === "admin";

export const canViewDashboard = role =>
["admin", "treasurer", "member"]
.includes(role);
