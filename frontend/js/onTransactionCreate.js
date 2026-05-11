// frontend/js/onTransactionCreate.js
import { db } from './firebase-config.js';

export async function onTransactionCreate(userId, groupId) {
    if (!userId || !groupId) {
        console.log('Missing userId or groupId, skipping');
        return;
    }
    
    // Find the pending contribution for this user and group
    const contributionsRef = db.collection('contributions');
    const query = await contributionsRef
        .where('userId', '==', userId)
        .where('groupId', '==', groupId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
    
    if (query.empty) {
        console.log(`No pending contribution found for user ${userId} in group ${groupId}`);
        return;
    }
    
    const contributionDoc = query.docs[0];
    await contributionDoc.ref.update({
        paymentEvidence: 'online'
    });
    
    console.log(`Updated contribution ${contributionDoc.id} with online payment evidence for user ${userId} in group ${groupId}`);
}