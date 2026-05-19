// frontend/js/onGroupCreate.js
import { db } from './firebase-config.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    
    writeBatch,
    query,
    where,
    orderBy,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            return userDoc.data().displayName || userDoc.data().name || userDoc.data().email || userId;
        }
    } catch (e) {}
    return userId;
}

function getGroupCreationDate(groupData) {
    console.log('[DEBUG] getGroupCreationDate - groupData.createdAt:', groupData.createdAt);
    if (!groupData.createdAt) {
        console.warn('[DEBUG] No createdAt field, using current date');
        return new Date();
    }
    
    if (typeof groupData.createdAt.toDate === 'function') {
        const date = groupData.createdAt.toDate();
        console.log('[DEBUG] Converted Firestore timestamp to Date:', date);
        return date;
    }
    const date = new Date(groupData.createdAt);
    console.log('[DEBUG] Converted ISO string to Date:', date);
    return date;
}

// ============================================================
// HANDLE GROUP CREATION
// ============================================================
export async function handleGroupCreation(groupId) {
    console.log('========== [DEBUG] handleGroupCreation START ==========');
    console.log('[DEBUG] groupId:', groupId);
    
    // Step 1: Get group details
    console.log('[DEBUG] Step 1: Fetching group document...');
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    console.log('[DEBUG] groupDoc.exists:', groupDoc.exists());
    
    if (!groupDoc.exists()) {
        console.error('[ERROR] Group not found:', groupId);
        return;
    }
    
    const groupData = groupDoc.data();
    console.log('[DEBUG] groupData:', JSON.stringify(groupData, null, 2));
    
    const contributionAmount = groupData.contributionAmount;
    console.log('[DEBUG] contributionAmount:', contributionAmount);
    
    const groupCreatedAt = getGroupCreationDate(groupData);
    console.log('[DEBUG] groupCreatedAt:', groupCreatedAt.toISOString());
    
    // Step 2: Get members from members subcollection
    console.log('[DEBUG] Step 2: Fetching members from subcollection...');
    const membersRef = collection(db, 'groups', groupId, 'members');
    const membersSnapshot = await getDocs(membersRef);
    
    console.log('[DEBUG] membersSnapshot.size:', membersSnapshot.size);
    
    const members = membersSnapshot.docs.map(doc => ({
        uid: doc.data().uid,
        role: doc.data().role,
        joinedAt: doc.data().joinedAt
    }));
    console.log('[DEBUG] members:', JSON.stringify(members, null, 2));
    
    if (members.length === 0) {
        console.error('[ERROR] No members found for group', groupId);
        return;
    }
    
   // ======================================
// INITIALIZE ADMIN MEMBER
// ======================================

const adminMember =
    members[0];

if (adminMember) {

    await handleMemberJoin(
        groupId,
        adminMember.uid
    );
}
    
   
    console.log('========== [DEBUG] handleGroupCreation COMPLETE ==========');
}

// ============================================================
// HANDLE MEMBER JOIN
// ============================================================
export async function handleMemberJoin(groupId, userId) {
    console.log('========== [DEBUG] handleMemberJoin START ==========');
    console.log('[DEBUG] groupId:', groupId);
    console.log('[DEBUG] userId:', userId);
    
    // Get group details
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);
    if (!groupDoc.exists()) {
        console.error(`[ERROR] Group ${groupId} not found`);
        return;
    }
    
    const groupData = groupDoc.data();
    const contributionAmount = groupData.contributionAmount;
    const groupCreatedAt = getGroupCreationDate(groupData);
    
    console.log('[DEBUG] contributionAmount:', contributionAmount);
    console.log('[DEBUG] groupCreatedAt:', groupCreatedAt);
    
    // Get all members sorted by join order
    const membersRef = collection(db, 'groups', groupId, 'members');
    const q = query(membersRef, orderBy('joinedAt', 'asc'));
    const membersSnapshot = await getDocs(q);
    
    const members = membersSnapshot.docs.map(doc => ({
        uid: doc.data().uid,
        role: doc.data().role,
        joinedAt: doc.data().joinedAt
    }));
    
    const memberCount = members.length;
    const payoutAmount = contributionAmount * (memberCount - 1);
    
    console.log('[DEBUG] memberCount:', memberCount);
    console.log('[DEBUG] payoutAmount:', payoutAmount);
    
    // Create contributions for new member
    const newMember = members.find(m => m.uid === userId);
    if (newMember) {
        console.log(`[DEBUG] Creating 12 contributions for new member ${userId}`);
        // Prevent duplicate contributions

const existingContributionQuery =
    query(
        collection(db, 'contributions'),
        where('groupId', '==', groupId),
        where('userId', '==', userId)
    );

const existingContributions =
    await getDocs(existingContributionQuery);

if (!existingContributions.empty) {

    console.log(
        `[DEBUG] Contributions already exist for ${userId}`
    );

} else {
        const contributionsRef = collection(db, 'contributions');
        for (let i = 0; i < 12; i++) {
            const monthsToAdd = i + 1;
            const deadlineDate = getDeadlineDate(groupCreatedAt, monthsToAdd);
            const dateStr = deadlineDate.toISOString().split('T')[0];
            
            await addDoc(contributionsRef, {
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
        console.log(`[DEBUG] Created contributions for new member ${userId}`);}
    }

    
    // Recalculate payouts
    console.log('[DEBUG] Recalculating payouts...');
    const payoutsRef = collection(db, 'payouts');
    const payoutsQuery = query(payoutsRef, where('groupId', '==', groupId));
    const existingPayouts = await getDocs(payoutsQuery);
    
    console.log(`[DEBUG] Found ${existingPayouts.size} existing payouts to delete`);
    
    const batch = writeBatch(db);
    existingPayouts.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    
    console.log('[DEBUG] Deleted existing payouts');
    
    // Create new payouts
    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        const order = i + 1;
        const userDisplayName = await getMemberName(member.uid);
        
        const monthsToAdd = order;
        const deadlineForPayout = getDeadlineDate(groupCreatedAt, monthsToAdd);
        const payoutDate = getPayoutDate(deadlineForPayout);
        const payoutDateStr = payoutDate.toISOString().split('T')[0];
        
        await addDoc(payoutsRef, {
            groupId: groupId,
            userId: member.uid,
            userDisplayName: userDisplayName,
            payoutDate: payoutDateStr,
            order: order,
            amount: payoutAmount,
            createdAt: Timestamp.now()
        });
        console.log(`[DEBUG] Created payout for ${member.uid}, order ${order}, amount ${payoutAmount}`);
    }
    
    console.log(`[DEBUG] Recreated ${members.length} payouts for group ${groupId}`);
    console.log('========== [DEBUG] handleMemberJoin COMPLETE ==========');
}
