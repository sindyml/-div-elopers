const admin = require('firebase-admin');
const { authenticateUser } = require('../../middleware/auth');

const db = admin.firestore();

function sendJSON(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function approveDispute(req, res) {
  try {
    const { disputeId, contributionId } = req.body;
    const userId = req.user.uid;

    if (!disputeId || !contributionId) {
      return sendJSON(res, 400, { error: 'Dispute ID and Contribution ID are required' });
    }

    const disputeRef = db.collection('disputes').doc(disputeId);
    const contributionRef = db.collection('contributions').doc(contributionId);

    await db.runTransaction(async (transaction) => {
      const disputeDoc = await transaction.get(disputeRef);
      const contributionDoc = await transaction.get(contributionRef);

      if (!disputeDoc.exists) throw new Error('Dispute not found');
      if (!contributionDoc.exists) throw new Error('Contribution not found');

      const contributionData = contributionDoc.data();
      const { groupId, amount } = contributionData;
      const groupRef = db.collection('groups').doc(groupId);

      // Update dispute status
      transaction.update(disputeRef, {
        status: 'approved',
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy: userId
      });

      // Update contribution status
      transaction.update(contributionRef, {
        status: 'confirmed',
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmedBy: userId
      });

      // Update group balance
      transaction.update(groupRef, {
        totalBalance: admin.firestore.FieldValue.increment(amount)
      });
    });

    sendJSON(res, 200, { success: true, message: 'Dispute approved, contribution confirmed, and group balance updated' });

  } catch (error) {
    console.error('Dispute approval error:', error);
    sendJSON(res, 400, { error: error.message });
  }
}

async function handleRequest(req, res) {
  const method = req.method;
  const url = req.url.split('?')[0];

  if (method === 'POST' && url === '/approve') {
    await authenticateUser(req, res, () => approveDispute(req, res));
  } else {
    sendJSON(res, 404, { error: `Endpoint not found: ${method} ${url}` });
  }
}

module.exports = handleRequest;
