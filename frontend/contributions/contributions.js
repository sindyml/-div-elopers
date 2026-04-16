// contributions/contributions.js
import { auth, db } from '../js/firebase-config.js';
import {
    collection,
    collectionGroup,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    onSnapshot,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
// MOCK MODE SWITCH
// ============================================================
const USE_MOCK = true;

import { mockData } from './mock-data.js';

// Store active callbacks for mock mode to trigger re-renders
let mockMemberCallbacks = [];
let mockGroupCallbacks = [];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getCurrentUserId() {
    if (USE_MOCK) {
        return mockData.currentUserId;
    }
    const currentUser = auth.currentUser;
    return currentUser ? currentUser.uid : null;
}

async function getCurrentUserRole() {
    if (USE_MOCK) {
        return mockData.currentUserRole;
    }
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return null;
    const userDocument = await getDoc(doc(db, 'users', currentUserId));
    if (!userDocument.exists()) return null;
    return userDocument.data().role;
}

// ============================================================
// GROUPS FUNCTIONS (using Person 3's schema)
// ============================================================

// Get groups where user is a member (for Member view)
// Queries members subcollection, then fetches group details
async function getUserGroups(userId) {
    if (USE_MOCK) {
        // Find member records where uid matches
        const memberRecords = mockData.members.filter(m => m.uid === userId);
        const groupIds = memberRecords.map(m => m.groupId);
        return mockData.groups.filter(group => groupIds.includes(group.id));
    }

    // REAL MODE: Query members subcollection across all groups
    const membersSnapshot = await getDocs(
        query(collectionGroup(db, 'members'), where('uid', '==', userId))
    );

    // Extract unique group IDs from document paths
    const groupIds = [...new Set(membersSnapshot.docs.map(d => d.ref.parent.parent.id))];

    // Fetch each group's details in parallel
    const groupDocs = await Promise.all(
        groupIds.map(groupId => getDoc(doc(db, 'groups', groupId)))
    );
    return groupDocs
        .filter(groupDoc => groupDoc.exists())
        .map(groupDoc => ({
            id: groupDoc.id,
            name: groupDoc.data().name,
            ...groupDoc.data()
        }));
}

// Get groups where user is a treasurer or admin (for Treasurer view)
async function getTreasurerGroups(userId) {
    if (USE_MOCK) {
        // Find member records where uid matches and role is treasurer or admin
        const memberRecords = mockData.members.filter(m =>
            m.uid === userId && (m.role === 'treasurer' || m.role === 'admin')
        );
        const groupIds = memberRecords.map(m => m.groupId);
        return mockData.groups.filter(group => groupIds.includes(group.id));
    }

    // REAL MODE: Query members subcollection for treasurer/admin role
    const membersSnapshot = await getDocs(
        query(
            collectionGroup(db, 'members'),
            where('uid', '==', userId),
            where('role', 'in', ['treasurer', 'admin'])
        )
    );

    const groupIds = [...new Set(membersSnapshot.docs.map(d => d.ref.parent.parent.id))];

    // Fetch each group's details in parallel
    const groupDocs = await Promise.all(
        groupIds.map(groupId => getDoc(doc(db, 'groups', groupId)))
    );
    return groupDocs
        .filter(groupDoc => groupDoc.exists())
        .map(groupDoc => ({
            id: groupDoc.id,
            name: groupDoc.data().name,
            ...groupDoc.data()
        }));
}

// Get single group by ID
async function getGroupById(groupId) {
    if (USE_MOCK) {
        const group = mockData.groups.find(g => g.id === groupId);
        return group || null;
    }
    const groupDocument = await getDoc(doc(db, 'groups', groupId));
    if (!groupDocument.exists()) return null;
    return {
        id: groupDocument.id,
        name: groupDocument.data().name,
        ...groupDocument.data()
    };
}

// ============================================================
// MEMBER NAME FUNCTION (from Person 1/2's users collection)
// ============================================================

async function getMemberName(userId) {
    if (USE_MOCK) {
        return mockData.memberNames[userId] || userId;
    }
    const userDocument = await getDoc(doc(db, 'users', userId));
    if (!userDocument.exists()) return userId;
    return userDocument.data().name || userId;
}

// ============================================================
// CONTRIBUTIONS FUNCTIONS (Query from my table TABLE)
// ============================================================

async function getContributionsByMember(userId) {
    if (USE_MOCK) {
        return mockData.contributions.filter(c => c.userId === userId);
    }
    const contributionsSnapshot = await getDocs(
        query(collection(db, 'contributions'), where('userId', '==', userId), orderBy('date', 'desc'))
    );
    return contributionsSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));
}

async function getContributionsByGroup(groupId) {
    if (USE_MOCK) {
        return mockData.contributions.filter(c => c.groupId === groupId);
    }
    const contributionsSnapshot = await getDocs(
        query(collection(db, 'contributions'), where('groupId', '==', groupId), orderBy('date', 'desc'))
    );
    return contributionsSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));
}

async function updateContributionStatus(contributionId, newStatus) {
    if (USE_MOCK) {
        const contribution = mockData.contributions.find(c => c.id === contributionId);
        if (contribution) {
            contribution.status = newStatus;
            // Trigger all active callbacks to re-render
            mockGroupCallbacks.forEach(callback => callback());
            mockMemberCallbacks.forEach(callback => callback());
        }
        return;
    }
    await updateDoc(doc(db, 'contributions', contributionId), {
        status: newStatus,
        confirmedAt: new Date()
    });
}

// ============================================================
// REAL-TIME LISTENERS
// ============================================================

function listenToMemberContributions(userId, onUpdateCallback) {
    if (USE_MOCK) {
        const wrappedCallback = () => {
            const filtered = mockData.contributions.filter(c => c.userId === userId);
            onUpdateCallback(filtered);
        };
        mockMemberCallbacks.push(wrappedCallback);
        wrappedCallback();
        return () => {
            const index = mockMemberCallbacks.indexOf(wrappedCallback);
            if (index > -1) mockMemberCallbacks.splice(index, 1);
        };
    }
    const unsubscribe = onSnapshot(
        query(collection(db, 'contributions'), where('userId', '==', userId), orderBy('date', 'desc')),
        (snapshot) => {
            const contributions = snapshot.docs.map(document => ({
                id: document.id,
                ...document.data()
            }));
            onUpdateCallback(contributions);
        }
    );
    return unsubscribe;
}

function listenToGroupContributions(groupId, onUpdateCallback) {
    if (USE_MOCK) {
        const wrappedCallback = () => {
            const filtered = mockData.contributions.filter(c => c.groupId === groupId);
            onUpdateCallback(filtered);
        };
        mockGroupCallbacks.push(wrappedCallback);
        wrappedCallback();
        return () => {
            const index = mockGroupCallbacks.indexOf(wrappedCallback);
            if (index > -1) mockGroupCallbacks.splice(index, 1);
        };
    }
    const unsubscribe = onSnapshot(
        query(collection(db, 'contributions'), where('groupId', '==', groupId), orderBy('date', 'desc')),
        (snapshot) => {
            const contributions = snapshot.docs.map(document => ({
                id: document.id,
                ...document.data()
            }));
            onUpdateCallback(contributions);
        }
    );
    return unsubscribe;
}

// ============================================================
// PAYOUTS FUNCTIONS (YOUR TABLE)
// ============================================================

async function getPayoutSchedule(groupId) {
    if (USE_MOCK) {
        return mockData.payouts.filter(p => p.groupId === groupId);
    }
    const payoutsSnapshot = await getDocs(
        query(collection(db, 'payouts'), where('groupId', '==', groupId), orderBy('order', 'asc'))
    );
    return payoutsSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));
}

// ============================================================
// EXPORTS
// ============================================================

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