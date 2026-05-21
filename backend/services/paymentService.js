// backend/services/paymentService.js - REAL VERSION with Firestore
const admin = require('firebase-admin');

const db = admin.firestore();

class PaymentService {
  constructor() {
    console.log('✅ Payment Service initialized (Firestore mode)');
  }

  // Process payout disbursement
  async processPayout(payoutData) {
    try {
      const {
        groupId,
        memberId,
        amount,
        payoutId,
        payoutMethod = 'bank_transfer',
        reference,
        processedBy
      } = payoutData;

      // Validate payout amount
      if (!amount || amount <= 0) {
        return {
          success: false,
          error: 'Invalid payout amount'
        };
      }

      const groupRef = db.collection('groups').doc(groupId);
      const transactionRecordRef = db.collection('transactions').doc();
      const historyPayoutRef = db.collection('payouts').doc();
      const existingPayoutRef = payoutId ? db.collection('payouts').doc(payoutId) : null;

      const result = await db.runTransaction(async (transaction) => {
        const groupDoc = await transaction.get(groupRef);

        if (!groupDoc.exists) {
          throw new Error('Group not found');
        }

        const groupData = groupDoc.data();
        const currentBalance = groupData.totalBalance || groupData.currentBalance || 0;

        if (currentBalance < amount) {
          throw new Error('Insufficient group balance');
        }

        // 1. Create history payout record
        const payoutRecord = {
          id: historyPayoutRef.id,
          groupId: groupId,
          memberId: memberId,
          amount: amount,
          status: 'completed',
          payoutMethod: payoutMethod,
          reference: reference || `PAYOUT_${Date.now()}`,
          processedBy: processedBy || null,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        transaction.set(historyPayoutRef, payoutRecord);

        // 2. Update existing payout status if payoutId is provided
        if (existingPayoutRef) {
          transaction.update(existingPayoutRef, {
            status: 'completed',
            disbursedAt: admin.firestore.FieldValue.serverTimestamp(),
            disbursedBy: processedBy
          });
        }

        // 3. Update group balance and metadata
        transaction.update(groupRef, {
          totalBalance: admin.firestore.FieldValue.increment(-amount),
          lastPayoutAt: admin.firestore.FieldValue.serverTimestamp(),
          lastPayoutAmount: amount,
          lastPayoutMember: memberId,
          lastPayoutIndex: (groupData.lastPayoutIndex || 0) + 1
        });

        // 4. Record in transactions collection
        transaction.set(transactionRecordRef, {
          id: transactionRecordRef.id,
          groupId: groupId,
          userId: memberId,
          amount: -amount,
          type: 'payout',
          status: 'completed',
          payoutId: historyPayoutRef.id,
          description: `Payout disbursement to ${memberId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
          payoutId: historyPayoutRef.id,
          amount: amount,
          status: 'completed',
          newBalance: currentBalance - amount
        };
      });

      return {
        success: true,
        data: result
      };

    } catch (error) {
      console.error('Payout processing error:', error);
      return {
        success: false,
        error: error.message || 'Payout processing failed'
      };
    }
  }

  // Get group payout schedule
  async getPayoutSchedule(groupId) {
    try {
      const groupDoc = await db.collection('groups').doc(groupId).get();
      
      if (!groupDoc.exists) {
        return {
          success: false,
          error: 'Group not found'
        };
      }

      const groupData = groupDoc.data();
      const payoutOrder = groupData.payoutOrder || [];
      const lastPayoutIndex = groupData.lastPayoutIndex || 0;
      
      // Determine next member to be paid
      const nextPayoutIndex = payoutOrder.length > 0 ? (lastPayoutIndex + 1) % payoutOrder.length : 0;
      const nextMemberId = payoutOrder[nextPayoutIndex] || null;

      // Get member names for the payout order
      const memberNames = [];
      for (const memberUid of payoutOrder) {
        const userDoc = await db.collection('users').doc(memberUid).get();
        memberNames.push({
          uid: memberUid,
          name: userDoc.data()?.name || memberUid,
          position: payoutOrder.indexOf(memberUid) + 1
        });
      }

      return {
        success: true,
        data: {
          payoutOrder: payoutOrder,
          payoutOrderDetails: memberNames,
          totalBalance: groupData.totalBalance || 0,
          contributionAmount: groupData.contributionAmount,
          nextPayoutMember: nextMemberId,
          nextPayoutIndex: nextPayoutIndex,
          lastPayoutAt: groupData.lastPayoutAt || null,
          lastPayoutAmount: groupData.lastPayoutAmount || null,
          totalMembers: payoutOrder.length
        }
      };

    } catch (error) {
      console.error('Get payout schedule error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get payout history for a group
  async getPayoutHistory(groupId, limit = 50) {
    try {
      const snapshot = await db.collection('payouts')
        .where('groupId', '==', groupId)
        .orderBy('processedAt', 'desc')
        .limit(limit)
        .get();

      const payouts = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        // Get member name for each payout
        let memberName = data.memberId;
        try {
          const userDoc = await db.collection('users').doc(data.memberId).get();
          if (userDoc.exists) {
            memberName = userDoc.data().name || data.memberId;
          }
        } catch (e) {
          // Use UID if name not found
        }
        
        payouts.push({
          id: doc.id,
          memberName: memberName,
          amount: data.amount,
          status: data.status,
          payoutMethod: data.payoutMethod,
          reference: data.reference,
          processedAt: data.processedAt,
          createdAt: data.createdAt
        });
      }

      return {
        success: true,
        data: payouts
      };
    } catch (error) {
      console.error('Get payout history error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new PaymentService();