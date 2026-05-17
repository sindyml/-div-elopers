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
    updateDoc,
    serverTimestamp,
    addDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getUserGroups as fetchUserGroups } from '../js/groupService.js';
import { getUserProfile } from '../js/userService.js';
import { COLLECTIONS } from '../js/constants.js';

function getCurrentUserId() {
    // Hardcoded for testing 
    //return "5SNBHi5mFqOtAZZKC8st15sKZd62";
    //return "qCHCRZa8l2TQegqztNlSGSY5cD32";
    //return "vZhTbL2mrWU5RGUeGMLj6Mbn1kp2";
    //return "zlBV3VCnFIa7bOdmIbmhxBNr90F2";
    //return "RUlvGEMQy3ZkChhISVYgdXZnFV72"; //Member
    return "0gZ8YLt9G2OUmkTnM7KIpc8Gcih2"; //Treasurer
    
    /* if (USE_MOCK) {
         return mockData.currentUserId;
     }
     const currentUser = auth.currentUser;
     return currentUser ? currentUser.uid : null;*/
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

// ============================================================
// NEW: Get user's display name for greeting
// ============================================================
async function getUserDisplayName(userId) {
    const profile = await getUserProfile(userId);
    return profile ? (profile.displayName || profile.email || 'Member') : 'Member';
}

// ============================================================
// NEW: Get disputes for a specific member
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

// ============================================================
// NEW: Create a dispute for a missed payment
// ============================================================
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

// ============================================================
// NEW: Real-time listener for member notifications
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
// NEW: Get all pending disputes (for treasurer)
// ============================================================
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

// ============================================================
// NEW: Approve a dispute and update contribution status
// ============================================================
async function approveDispute(disputeId, contributionId) {
    // Update dispute status
    await updateDoc(doc(db, 'disputes', disputeId), {
        status: 'approved',
        resolvedAt: new Date(),
        resolvedBy: getCurrentUserId()
    });
    
    // Update contribution status to confirmed
    await updateDoc(doc(db, COLLECTIONS.CONTRIBUTIONS, contributionId), {
        status: 'confirmed',
        confirmedAt: new Date()
    });
}

// ============================================================
// NEW: Reject a dispute with reason
// ============================================================
async function rejectDispute(disputeId, rejectionReason) {
    await updateDoc(doc(db, 'disputes', disputeId), {
        status: 'rejected',
        rejectionReason: rejectionReason,
        resolvedAt: new Date(),
        resolvedBy: getCurrentUserId()
    });
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
    getUserDisplayName,
    getMemberDisputes,
    createDispute,
    listenToNotifications,
    getPendingDisputes,
    approveDispute,
    rejectDispute,
    getContributionsByMember,
    getContributionsByGroup,
    updateContributionStatus,
    getPayoutSchedule,
    listenToMemberContributions,
    listenToGroupContributions
};