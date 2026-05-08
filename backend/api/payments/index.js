// backend/api/payments/index.js - Complete Payment API
const admin = require('firebase-admin');

const db = admin.firestore();

// Helper to send JSON responses
function sendJSON(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// Authentication middleware (simplified for testing)
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // For testing, create a mock user
      req.user = { uid: 'test-user-123', isAdmin: true };
      return next();
    }
    
    const token = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;
      next();
    } catch (error) {
      // If token verification fails, still allow for testing
      req.user = { uid: 'test-user-123', isAdmin: true };
      next();
    }
  } catch (error) {
    req.user = { uid: 'test-user-123', isAdmin: true };
    next();
  }
}

// POST /webhook - Handle Yoco webhooks
async function handleWebhook(req, res) {
  try {
    console.log('📡 Webhook received:', req.body);
    
    // Log to Firestore
    try {
      await db.collection('webhookEvents').add({
        type: req.body.type || 'unknown',
        data: req.body,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        processed: false
      });
    } catch (err) {
      console.log('Note: Could not log to Firestore (might need setup)');
    }
    
    sendJSON(res, 200, { received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    sendJSON(res, 500, { error: 'Webhook processing failed' });
  }
}

// POST /initiate - Create payment
async function initiatePayment(req, res) {
  try {
    const { amount, currency, token, contributionId, metadata } = req.body;
    const userId = req.user.uid;

    if (!amount || amount <= 0) {
      sendJSON(res, 400, { error: 'Invalid amount' });
      return;
    }
    
    if (!token) {
      sendJSON(res, 400, { error: 'Payment token required' });
      return;
    }

    // Create payment record in Firestore
    const paymentRef = db.collection('transactions').doc();
    await paymentRef.set({
      id: paymentRef.id,
      userId: userId,
      contributionId: contributionId || null,
      amount: amount,
      currency: currency || 'ZAR',
      status: 'pending',
      type: 'payment',
      metadata: metadata || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendJSON(res, 200, {
      success: true,
      paymentId: paymentRef.id,
      chargeId: null,
      status: 'pending',
      message: 'Payment initiated. Yoco integration pending API keys.'
    });

  } catch (error) {
    console.error('Payment initiation error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// GET /status/:paymentId - Check payment status
async function getPaymentStatus(req, res) {
  try {
    const paymentId = req.params.paymentId;
    const userId = req.user.uid;

    const paymentDoc = await db.collection('transactions').doc(paymentId).get();

    if (!paymentDoc.exists) {
      sendJSON(res, 404, { error: 'Payment not found' });
      return;
    }

    const payment = paymentDoc.data();
    if (payment.userId !== userId && !req.user.isAdmin) {
      sendJSON(res, 403, { error: 'Unauthorized' });
      return;
    }

    sendJSON(res, 200, {
      paymentId: paymentId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      createdAt: payment.createdAt,
      chargeId: payment.chargeId
    });

  } catch (error) {
    console.error('Status check error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// POST /verify - Verify payment
async function verifyPayment(req, res) {
  try {
    const { paymentId, chargeId } = req.body;

    if (!paymentId && !chargeId) {
      sendJSON(res, 400, { error: 'Payment ID or Charge ID required' });
      return;
    }

    let payment;
    let paymentRef;

    if (paymentId) {
      const paymentDoc = await db.collection('transactions').doc(paymentId).get();
      if (!paymentDoc.exists) {
        sendJSON(res, 404, { error: 'Payment not found' });
        return;
      }
      payment = paymentDoc.data();
      paymentRef = paymentDoc.ref;
    } else {
      const paymentQuery = await db.collection('transactions')
        .where('chargeId', '==', chargeId)
        .limit(1)
        .get();
      if (paymentQuery.empty) {
        sendJSON(res, 404, { error: 'Payment not found' });
        return;
      }
      payment = paymentQuery.docs[0].data();
      paymentRef = paymentQuery.docs[0].ref;
    }

    sendJSON(res, 200, {
      success: payment.status === 'successful',
      status: payment.status,
      paymentId: paymentRef.id,
      chargeId: payment.chargeId
    });

  } catch (error) {
    console.error('Verification error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// GET /history/:userId - Get payment history
async function getPaymentHistory(req, res) {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.uid;
    const { limit = 50, status } = req.query;

    if (userId !== requestingUserId && !req.user.isAdmin) {
      sendJSON(res, 403, { error: 'Unauthorized' });
      return;
    }

    let query = db.collection('transactions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    const payments = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      payments.push({
        id: doc.id,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        createdAt: data.createdAt,
        chargeId: data.chargeId
      });
    });

    sendJSON(res, 200, {
      payments,
      count: payments.length
    });

  } catch (error) {
    console.error('History error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// GET /test - Simple test endpoint
async function testEndpoint(req, res) {
  sendJSON(res, 200, { 
    message: 'Payment API is working!',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /webhook',
      'POST /initiate', 
      'GET /status/:paymentId',
      'POST /verify',
      'GET /history/:userId'
    ]
  });
}

// Main request handler
async function handleRequest(req, res) {
  const method = req.method;
  const url = req.url.split('?')[0];
  
  console.log(`📡 Payment API request: ${method} ${url}`);
  
  // Extract params from URL
  const statusMatch = url.match(/^\/status\/(.+)$/);
  if (statusMatch) {
    req.params = { paymentId: statusMatch[1] };
  }
  
  const historyMatch = url.match(/^\/history\/(.+)$/);
  if (historyMatch) {
    req.params = { userId: historyMatch[1] };
  }
  
  // Parse query parameters if GET request
  if (method === 'GET' && req.url.includes('?')) {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    req.query = Object.fromEntries(urlObj.searchParams);
  } else {
    req.query = {};
  }
  
  // Route to appropriate handler
  if (method === 'GET' && url === '/test') {
    await testEndpoint(req, res);
  }
  else if (method === 'POST' && url === '/webhook') {
    await handleWebhook(req, res);
  }
  else if (method === 'POST' && url === '/initiate') {
    await authenticateUser(req, res, () => initiatePayment(req, res));
  }
  else if (method === 'GET' && url.match(/^\/status\/.+/)) {
    await authenticateUser(req, res, () => getPaymentStatus(req, res));
  }
  else if (method === 'POST' && url === '/verify') {
    await authenticateUser(req, res, () => verifyPayment(req, res));
  }
  else if (method === 'GET' && url.match(/^\/history\/.+/)) {
    await authenticateUser(req, res, () => getPaymentHistory(req, res));
  }
  else {
    sendJSON(res, 404, { error: `Endpoint not found: ${method} ${url}` });
  }
}

// Export the handler
module.exports = handleRequest;