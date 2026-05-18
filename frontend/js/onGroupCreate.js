// frontend/js/onGroupCreate.js
import { db } from './firebase-config.js';
import {
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    orderBy,
    writeBatch,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getDeadlineDate(baseDate, monthsToAdd) {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth() + monthsToAdd;
    const targetDay = baseDate.getDate();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const actualDay = Math.min(targetDay, lastDayOfMonth);
    return new Date(year, month, actualDay);
}

function getPayoutDate(deadlineDate) {
    const payoutDate = new Date(deadlineDate);
    payoutDate.setDate(deadlineDate.getDate() + 1);
    if (payoutDate.getMonth() !== deadlineDate.getMonth()) {
        return new Date(deadlineDate.getFullYear(), deadlineDate.getMonth() + 2, 1);
    }
    return payoutDate;
}

async function getMemberName(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            return userDoc.data().displayName || userDoc.data().name || userDoc.data().email || userId;
        }
    } catch (e) {}
    return userId;
}

/**
 * Get the group creation date from the group document
 * @param {Object} groupData - The group document data
 * @returns {Date} The group creation date
 */
function getGroupCreationDate(groupData) {
    if (!groupData.createdAt) {
        console.warn('No createdAt field in group document, using current date');
        return new Date();
    }
    
    // Handle Firestore Timestamp or ISO string
    if (typeof groupData.createdAt.toDate === 'function') {
        return groupData.createdAt.toDate();
    }
    return new Date(groupData.createdAt);
}

// ============================================================
// HANDLE GROUP CREATION (admin only at group creation)
// Called by Person 3 after group is created
// ============================================================
export async function handleGroupCreation(groupId) {
    console.log(`handleGroupCreation called for group ${groupId}`);
    
    // Get group details
    const groupDoc = await getDoc(doc(db, 'groups', groupId));
    if (!groupDoc.exists()) {
        console.error(`Group ${groupId} not found`);
        return;
    }
    
    const groupData = groupDoc.data();
    const contributionAmount = groupData.contributionAmount;
    const groupCreatedAt = getGroupCreationDate(groupData);
    
    // Get members from members subcollection (only admin at this point)
    const membersSnapshot = await getDocs(collection(db, 'groups', groupId, 'members'));
    
    const members = membersSnapshot.docs.map(doc => ({
        uid: doc.data().uid,
        role: doc.data().role,
        joinedAt: doc.data().joinedAt
    }));
    
    if (members.length === 0) {
        console.error(`No members found for group ${groupId}`);
        return;
    }
    
    const memberCount = members.length;
    const payoutAmount = contributionAmount * (memberCount - 1);
    
    console.log(`Group ${groupId}: ${memberCount} members, Contribution: ${contributionAmount}, Payout: ${payoutAmount}`);
    
    const batch = writeBatch(db);

    // ============================================================
    // CREATE CONTRIBUTIONS for all members (12 months)
    // ============================================================
    for (const member of members) {
        for (let i = 0; i < 12; i++) {
            const monthsToAdd = i + 1;
            const deadlineDate = getDeadlineDate(groupCreatedAt, monthsToAdd);
            const dateStr = deadlineDate.toISOString().split('T')[0];
            
            const contribRef = doc(collection(db, 'contributions'));
            batch.set(contribRef, {
                userId: member.uid,
                groupId: groupId,
                amount: contributionAmount,
                date: dateStr,
                status: 'pending',
                paymentEvidence: null,
                evidenceUrl: null,
                createdAt: Timestamp.now()
            });
        }
    }
    
    // ============================================================
    // CREATE PAYOUTS for all members
    // ============================================================
    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        const order = i + 1;
        const userDisplayName = await getMemberName(member.uid);
        
        const monthsToAdd = order;
        const deadlineForPayout = getDeadlineDate(groupCreatedAt, monthsToAdd);
        const payoutDate = getPayoutDate(deadlineForPayout);
        const payoutDateStr = payoutDate.toISOString().split('T')[0];
        
        const payoutRef = doc(collection(db, 'payouts'));
        batch.set(payoutRef, {
            groupId: groupId,
            userId: member.uid,
            userDisplayName: userDisplayName,
            payoutDate: payoutDateStr,
            order: order,
            amount: payoutAmount,
            createdAt: Timestamp.now()
        });
    }
    
    await batch.commit();
    console.log(`Initialized group ${groupId} with contributions and payouts.`);
}

// ============================================================
// HANDLE MEMBER JOIN (called when user accepts invite)
// Called by Person 3 after adding member to members subcollection
// ============================================================
export async function handleMemberJoin(groupId, userId) {
    console.log(`handleMemberJoin called for group ${groupId}, user ${userId}`);
    
    // Get group details
    const groupDoc = await getDoc(doc(db, 'groups', groupId));
    if (!groupDoc.exists()) {
        console.error(`Group ${groupId} not found`);
        return;
    }
    
    const groupData = groupDoc.data();
    const contributionAmount = groupData.contributionAmount;
    const groupCreatedAt = getGroupCreationDate(groupData);
    
    // Get all members from members subcollection (sorted by join order)
    const membersSnapshot = await getDocs(
        query(collection(db, 'groups', groupId, 'members'), orderBy('joinedAt', 'asc'))
    );
    
    const members = membersSnapshot.docs.map(doc => ({
        uid: doc.data().uid,
        role: doc.data().role,
        joinedAt: doc.data().joinedAt
    }));
    
    const memberCount = members.length;
    const payoutAmount = contributionAmount * (memberCount - 1);
    
    console.log(`Group ${groupId}: Now ${memberCount} members, Payout amount: ${payoutAmount}`);
    
    const batch = writeBatch(db);

    // ============================================================
    // CREATE CONTRIBUTIONS for the new member (12 months)
    // ============================================================
    const newMember = members.find(m => m.uid === userId);
    if (newMember) {
        for (let i = 0; i < 12; i++) {
            const monthsToAdd = i + 1;
            const deadlineDate = getDeadlineDate(groupCreatedAt, monthsToAdd);
            const dateStr = deadlineDate.toISOString().split('T')[0];
            
            const contribRef = doc(collection(db, 'contributions'));
            batch.set(contribRef, {
                userId: newMember.uid,
                groupId: groupId,
                amount: contributionAmount,
                date: dateStr,
                status: 'pending',
                paymentEvidence: null,
                evidenceUrl: null,
                createdAt: Timestamp.now()
            });
        }
    }
    
    // ============================================================
    // RECALCULATE ALL PAYOUTS (delete existing and recreate with correct order and amount)
    // ============================================================
    // Delete existing payouts for this group
    const existingPayouts = await getDocs(
        query(collection(db, 'payouts'), where('groupId', '==', groupId))
    );
    
    existingPayouts.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    
    // Create new payouts for all members with correct order and amount
    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        const order = i + 1;
        const userDisplayName = await getMemberName(member.uid);
        
        const monthsToAdd = order;
        const deadlineForPayout = getDeadlineDate(groupCreatedAt, monthsToAdd);
        const payoutDate = getPayoutDate(deadlineForPayout);
        const payoutDateStr = payoutDate.toISOString().split('T')[0];
        
        const payoutRef = doc(collection(db, 'payouts'));
        batch.set(payoutRef, {
            groupId: groupId,
            userId: member.uid,
            userDisplayName: userDisplayName,
            payoutDate: payoutDateStr,
            order: order,
            amount: payoutAmount,
            createdAt: Timestamp.now()
        });
    }
    
    await batch.commit();
    console.log(`Re-synced payouts and contributions for group ${groupId} after member join.`);
}
