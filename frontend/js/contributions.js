// contributions/contributions.js
import { auth, db } from '../js/firebase-config.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    onSnapshot,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getUserGroups as fetchUserGroups } from '../js/groupService.js';
import { getUserProfile } from '../js/userService.js';
import { COLLECTIONS } from '../js/constants.js';

function getCurrentUserId() {
    return auth.currentUser ? auth.currentUser.uid : null;
}

async function getCurrentUserRole() {
    const uid = getCurrentUserId();
    if (!uid) return null;
    const profile = await getUserProfile(uid);
    return profile ? profile.role : null;
}

async function getUserGroups(userId) {
    return await fetchUserGroups(userId);
}

async function getTreasurerGroups(userId) {
    const groups = await fetchUserGroups(userId);
    const result = [];
    for (const group of groups) {
      const memberDoc = await getDoc(doc(db, COLLECTIONS.GROUPS, group.id, 'members', userId));
      if (memberDoc.exists()) {
        const role = memberDoc.data().role;
        if (role === 'treasurer' || role === 'admin') {
          result.push(group);
        }
      }
    }
    return result;
}

async function getGroupById(groupId) {
    const groupDoc = await getDoc(doc(db, COLLECTIONS.GROUPS, groupId));
    return groupDoc.exists() ? { id: groupDoc.id, ...groupDoc.data() } : null;
}

async function getMemberName(userId) {
    const profile = await getUserProfile(userId);
    return profile ? (profile.displayName || profile.email) : userId;
}

async function getContributionsByMember(userId) {
    const q = query(collection(db, COLLECTIONS.CONTRIBUTIONS), where('userId', '==', userId), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getContributionsByGroup(groupId) {
    const q = query(collection(db, COLLECTIONS.CONTRIBUTIONS), where('groupId', '==', groupId), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateContributionStatus(contributionId, newStatus) {
    await updateDoc(doc(db, COLLECTIONS.CONTRIBUTIONS, contributionId), {
        status: newStatus,
        confirmedAt: new Date()
    });
}

function listenToMemberContributions(userId, onUpdateCallback) {
    return onSnapshot(
        query(collection(db, COLLECTIONS.CONTRIBUTIONS), where('userId', '==', userId), orderBy('date', 'desc')),
        (snapshot) => {
            const contributions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            onUpdateCallback(contributions);
        }
    );
}

function listenToGroupContributions(groupId, onUpdateCallback) {
    return onSnapshot(
        query(collection(db, COLLECTIONS.CONTRIBUTIONS), where('groupId', '==', groupId), orderBy('date', 'desc')),
        (snapshot) => {
            const contributions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            onUpdateCallback(contributions);
        }
    );
}

async function getPayoutSchedule(groupId) {
    const q = query(collection(db, COLLECTIONS.PAYOUTS), where('groupId', '==', groupId), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
        const data = d.data();
        // Convert Firestore Timestamp to ISO date string for display and comparison
        if (data.payoutDate && typeof data.payoutDate.toDate === 'function') {
            data.payoutDate = data.payoutDate.toDate().toISOString().slice(0, 10);
        }
        return { id: d.id, ...data };
    });
}

export {
    getCurrentUserId,
    getCurrentUserRole,
    getUserGroups,
    getTreasurerGroups,
    getGroupById,
    getMemberName,
    getContributionsByMember,
    getContributionsByGroup,
    updateContributionStatus,
    getPayoutSchedule,
    listenToMemberContributions,
    listenToGroupContributions
};
