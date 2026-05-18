const admin = require('firebase-admin');
const { authenticateUser } = require('../../middleware/auth');

const db = admin.firestore();

function sendJSON(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function confirmContribution(req, res) {
  try {
    const { contributionId } = req.body;
    const userId = req.user.uid;

    if (!contributionId) {
      return sendJSON(res, 400, { error: 'Contribution ID is required' });
    }

    const contributionRef = db.collection('contributions').doc(contributionId);

    await db.runTransaction(async (transaction) => {
      const contributionDoc = await transaction.get(contributionRef);

      if (!contributionDoc.exists) {
        throw new Error('Contribution not found');
      }

      const contributionData = contributionDoc.data();

      if (contributionData.status === 'confirmed') {
        throw new Error('Contribution is already confirmed');
      }

      const { groupId, amount } = contributionData;
      const groupRef = db.collection('groups').doc(groupId);

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

    sendJSON(res, 200, { success: true, message: 'Contribution confirmed and group balance updated' });

  } catch (error) {
    console.error('Contribution confirmation error:', error);
    sendJSON(res, 400, { error: error.message });
  }
}

async function handleRequest(req, res) {
  const method = req.method;
  const url = req.url.split('?')[0];

  if (method === 'POST' && url === '/confirm') {
    await authenticateUser(req, res, () => confirmContribution(req, res));
  } else {
    sendJSON(res, 404, { error: `Endpoint not found: ${method} ${url}` });
  }
}

module.exports = handleRequest;
