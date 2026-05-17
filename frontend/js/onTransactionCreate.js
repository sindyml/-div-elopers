// frontend/js/onTransactionCreate.js
import { db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export async function onTransactionCreate(userId, groupId) {
    if (!userId || !groupId) {
        console.log('Missing userId or groupId, skipping');
        return;
    }
    
    const contributionsQuery = query(
      collection(db, 'contributions'),
      where('userId', '==', userId),
      where('groupId', '==', groupId),
      where('status', '==', 'pending'),
      limit(1)
    );

    const querySnapshot = await getDocs(contributionsQuery);
    if (querySnapshot.empty) {
        console.log(`No pending contribution found for user ${userId} in group ${groupId}`);
        return;
    }

    const contributionDoc = querySnapshot.docs[0];
    await updateDoc(contributionDoc.ref, {
        paymentEvidence: 'online',
    });
    
    console.log(`Updated contribution ${contributionDoc.id} with online payment evidence for user ${userId} in group ${groupId}`);
}