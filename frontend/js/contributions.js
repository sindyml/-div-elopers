// contributions/contributions.js
import { auth, db } from './firebase-config.js';
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
    updateDoc,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
// MOCK MODE SWITCH
// ============================================================
const USE_MOCK = false;

import { mockData } from './mock-data.js';

// Store active callbacks for mock mode to trigger re-renders
let mockMemberCallbacks = [];
let mockGroupCallbacks = [];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getCurrentUserId() {
    // Hardcoded for testing 
    //return "5SNBHi5mFqOtAZZKC8st15sKZd62";
    //return "qCHCRZa8l2TQegqztNlSGSY5cD32";
    //return "vZhTbL2mrWU5RGUeGMLj6Mbn1kp2";
    //return "zlBV3VCnFIa7bOdmIbmhxBNr90F2";
    
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

async function getUserGroups(userId) {
    if (USE_MOCK) {
        const memberRecords = mockData.members.filter(m => m.uid === userId);
        const groupIds = memberRecords.map(m => m.groupId);
        return mockData.groups.filter(group => groupIds.includes(group.id));
    }

    const membersSnapshot = await getDocs(
        query(collectionGroup(db, 'members'), where('uid', '==', userId))
    );

    const groupIds = [...new Set(membersSnapshot.docs.map(d => d.ref.parent.parent.id))];

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

async function getTreasurerGroups(userId) {
    if (USE_MOCK) {
        const memberRecords = mockData.members.filter(m =>
            m.uid === userId && (m.role === 'treasurer' || m.role === 'admin')
        );
        const groupIds = memberRecords.map(m => m.groupId);
        return mockData.groups.filter(group => groupIds.includes(group.id));
    }

    const membersSnapshot = await getDocs(
        query(
            collectionGroup(db, 'members'),
            where('uid', '==', userId),
            where('role', 'in', ['treasurer', 'admin'])
        )
    );

    const groupIds = [...new Set(membersSnapshot.docs.map(d => d.ref.parent.parent.id))];

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

async function getMemberName(userId) {
    if (USE_MOCK) {
        return mockData.memberNames[userId] || userId;
    }
    const userDocument = await getDoc(doc(db, 'users', userId));
    if (!userDocument.exists()) return userId;
    return userDocument.data().name || userDocument.data().displayName || userDocument.data().email || userId;
}

// ============================================================
// USER DISPLAY NAME
// ============================================================

async function getUserDisplayName(userId) {
    if (USE_MOCK) {
        return mockData.memberNames[userId] || 'Member';
    }
    const userDocument = await getDoc(doc(db, 'users', userId));
    if (!userDocument.exists()) return 'Member';
    return userDocument.data().displayName || userDocument.data().name || userDocument.data().email || 'Member';
}

// ============================================================
// DISPUTES FUNCTIONS
// ============================================================

async function getMemberDisputes(userId) {
    const q = query(
        collection(db, 'disputes'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : data.createdAt
        };
    });
}

async function createDispute(contributionId, userId, groupId, groupName, amount, deadlineDate, reason) {
    await addDoc(collection(db, 'disputes'), {
        contributionId: contributionId,
        userId: userId,
        groupId: groupId,
        groupName: groupName,
        amount: amount,
        deadlineDate: deadlineDate,
        reason: reason,
        status: 'pending',
        rejectionReason: null,
        createdAt: new Date(),
        resolvedAt: null,
        resolvedBy: null
    });
}

async function getPendingDisputes() {
    const q = query(
        collection(db, 'disputes'),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

async function approveDispute(disputeId, contributionId) {
    await updateDoc(doc(db, 'disputes', disputeId), {
        status: 'approved',
        resolvedAt: new Date(),
        resolvedBy: getCurrentUserId()
    });
    
    await updateDoc(doc(db, 'contributions', contributionId), {
        status: 'confirmed',
        confirmedAt: new Date()
    });
}

async function rejectDispute(disputeId, rejectionReason) {
    await updateDoc(doc(db, 'disputes', disputeId), {
        status: 'rejected',
        rejectionReason: rejectionReason,
        resolvedAt: new Date(),
        resolvedBy: getCurrentUserId()
    });
}

// ============================================================
// NOTIFICATIONS
// ============================================================

function listenToNotifications(userId, onNotificationCallback) {
    const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        where('read', '==', false),
        orderBy('createdAt', 'desc')
    );
    
    return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const notification = change.doc.data();
                const notificationId = change.doc.id;
                onNotificationCallback(notification.message, notificationId);
            }
        });
    });
}

// ============================================================
// CONTRIBUTIONS FUNCTIONS
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
    getUserDisplayName,
    getMemberDisputes,
    createDispute,
    getPendingDisputes,
    approveDispute,
    rejectDispute,
    listenToNotifications,
    getContributionsByMember,
    getContributionsByGroup,
    updateContributionStatus,
    getPayoutSchedule,
    listenToMemberContributions,
    listenToGroupContributions
};