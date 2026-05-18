// backend/api/payouts/index.js
const admin = require('firebase-admin');
const paymentService = require('../../services/paymentService');
const { authenticateUser } = require('../../middleware/auth');

const db = admin.firestore();

function sendJSON(res, statusCode, data) {
  // Prevent multiple responses
  if (res.headersSent) return;
  
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// POST /api/payouts/disburse - Treasurer releases payout
async function disbursePayout(req, res) {
  try {
    const { groupId, memberId, amount, reference } = req.body;
    const userId = req.user.uid;

    // Process payout
    const result = await paymentService.processPayout({
      groupId,
      memberId,
      amount: parseFloat(amount),
      reference,
      processedBy: userId
    });

    if (!result.success) {
      sendJSON(res, 400, { error: result.error });
      return;
    }

    sendJSON(res, 200, {
      success: true,
      payoutId: result.data.payoutId,
      amount: result.data.amount,
      newBalance: result.data.newBalance,
      message: 'Payout disbursed successfully'
    });

  } catch (error) {
    console.error('Payout disbursement error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// GET /api/payouts/schedule/:groupId - View payout schedule
async function getSchedule(req, res) {
  try {
    const { groupId } = req.params;

    const result = await paymentService.getPayoutSchedule(groupId);

    if (!result.success) {
      sendJSON(res, 404, { error: result.error });
      return;
    }

    sendJSON(res, 200, {
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('Schedule error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// GET /api/payouts/history/:groupId - View payout history
async function getHistory(req, res) {
  try {
    const { groupId } = req.params;
    const { limit = 50 } = req.query;

    // Use the service method
    const result = await paymentService.getPayoutHistory(groupId, parseInt(limit));

    if (!result.success) {
      sendJSON(res, 404, { error: result.error });
      return;
    }

    sendJSON(res, 200, {
      success: true,
      payouts: result.data,
      count: result.data.length
    });

  } catch (error) {
    console.error('History error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// Main handler
async function handleRequest(req, res) {
  const method = req.method;
  const url = req.url.split('?')[0];

  // Extract params
  const scheduleMatch = url.match(/^\/schedule\/(.+)$/);
  const historyMatch = url.match(/^\/history\/(.+)$/);

  // Set params if matches
  if (scheduleMatch) req.params = { groupId: scheduleMatch[1] };
  if (historyMatch) req.params = { groupId: historyMatch[1] };

  // Route handling
  if (method === 'POST' && url === '/disburse') {
    await authenticateUser(req, res, () => disbursePayout(req, res));
  }
  else if (method === 'GET' && scheduleMatch) {
    await authenticateUser(req, res, () => getSchedule(req, res));
  }
  else if (method === 'GET' && historyMatch) {
    await authenticateUser(req, res, () => getHistory(req, res));
  }
  else {
    sendJSON(res, 404, { error: `Endpoint not found: ${method} ${url}` });
  }
}

module.exports = handleRequest;
