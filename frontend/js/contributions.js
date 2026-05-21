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
// HELPER FUNCTIONS
// ============================================================

function getCurrentUserId() {

     const currentUser = auth.currentUser;
     return currentUser ? currentUser.uid : null;
}

async function getCurrentUserRole() {

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

    const groupDocument = await getDoc(doc(db, 'groups', groupId));
    if (!groupDocument.exists()) return null;
    return {
        id: groupDocument.id,
        name: groupDocument.data().name,
        ...groupDocument.data()
    };
}

async function getUserDisplayName(userId) {
    
    const userDocument = await getDoc(doc(db, 'users', userId));
    if (!userDocument.exists()) return 'Member';
    
    return userDocument.data().displayName || userDocument.data().email || 'Member';
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

    const contributionsSnapshot = await getDocs(
        query(collection(db, 'contributions'), where('userId', '==', userId), orderBy('date', 'asc'))
    );
    return contributionsSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));
}

async function getContributionsByGroup(groupId) {

    const contributionsSnapshot = await getDocs(
        query(collection(db, 'contributions'), where('groupId', '==', groupId), orderBy('date', 'asc'))
    );
    return contributionsSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));
}

async function updateContributionStatus(contributionId, newStatus) {

    await updateDoc(doc(db, 'contributions', contributionId), {
        status: newStatus,
        confirmedAt: new Date()
    });
}

function listenToMemberContributions(userId, onUpdateCallback) {

    const unsubscribe = onSnapshot(
        query(collection(db, 'contributions'), where('userId', '==', userId), orderBy('date', 'asc')),
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

    const unsubscribe = onSnapshot(
        query(collection(db, 'contributions'), where('groupId', '==', groupId), orderBy('date', 'asc')),
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