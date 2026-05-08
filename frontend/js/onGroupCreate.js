// frontend/js/onGroupCreate.js
import { db } from './firebase-config.js';

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
        const nameDoc = await db.collection('userNames').doc(userId).get();
        if (nameDoc.exists && nameDoc.data().name) {
            return nameDoc.data().name;
        }
    } catch (e) {}
    return userId;
}

export async function onGroupCreate(groupId, members, contributionAmount, payoutOrder) {
    const groupCreatedAt = new Date();
    const memberCount = members.length;
    const payoutAmount = contributionAmount * (memberCount - 1);
    
    console.log(`Initializing group ${groupId}. Members: ${memberCount}, Contribution: ${contributionAmount}, Payout: ${payoutAmount}`);
    
    // Create contributions (12 months)
    for (const member of members) {
        for (let i = 0; i < 12; i++) {
            const monthsToAdd = i + 1;
            const deadlineDate = getDeadlineDate(groupCreatedAt, monthsToAdd);
            const dateStr = deadlineDate.toISOString().split('T')[0];
            
            await db.collection('contributions').add({
                userId: member.uid,
                groupId: groupId,
                amount: contributionAmount,
                date: dateStr,
                status: 'pending',
                paymentEvidence: null,
                evidenceUrl: null,
                createdAt: new Date()
            });
        }
    }
    
    console.log(`Created contributions for group ${groupId}`);
    
    // Create payouts
    for (let i = 0; i < payoutOrder.length; i++) {
        const userId = payoutOrder[i];
        const order = i + 1;
        const userDisplayName = await getMemberName(userId);
        const monthsToAdd = order;
        const deadlineForPayout = getDeadlineDate(groupCreatedAt, monthsToAdd);
        const payoutDate = getPayoutDate(deadlineForPayout);
        const payoutDateStr = payoutDate.toISOString().split('T')[0];
        
        await db.collection('payouts').add({
            groupId: groupId,
            userId: userId,
            userDisplayName: userDisplayName,
            payoutDate: payoutDateStr,
            order: order,
            amount: payoutAmount,
            createdAt: new Date()
        });
    }
    
    console.log(`Created payouts for group ${groupId}`);
}