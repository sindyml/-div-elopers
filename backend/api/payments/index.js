// backend/api/payments/index.js - PayFast Payment API
const admin = require('firebase-admin');
const payfastService = require('../../services/payfastService');

const db = admin.firestore();

// Helper to send JSON responses
function sendJSON(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// Authentication middleware
async function authenticateUser(req, res, next) {
  const isTestEnv = process.env.NODE_ENV === 'test';
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (isTestEnv) {
        req.user = { uid: 'test-user-123', isAdmin: false };
        return next();
      }
      sendJSON(res, 401, { error: 'Authentication required' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        isAdmin: decodedToken.isAdmin === true || decodedToken.admin === true
      };
      next();
    } catch (error) {
      if (isTestEnv) {
        req.user = { uid: 'test-user-123', isAdmin: false };
        next();
        return;
      }
      sendJSON(res, 401, { error: 'Invalid authentication token' });
    }
  } catch (error) {
    if (isTestEnv) {
      req.user = { uid: 'test-user-123', isAdmin: false };
      next();
      return;
    }
    sendJSON(res, 401, { error: 'Authentication failed' });
  }
}

// POST /initiate - Create PayFast payment
async function initiatePayment(req, res) {
  try {
    const { amount, contributionId, groupId, groupName, metadata } = req.body;
    const userId = req.user ? req.user.uid : null;

    if (!userId) {
      sendJSON(res, 401, { error: 'Unauthorized' });
      return;
    }

    if (!amount || amount <= 0) {
      sendJSON(res, 400, { error: 'Invalid amount' });
      return;
    }

    // Create payment record in Firestore
    const paymentRef = db.collection('transactions').doc();
    const paymentId = paymentRef.id;

    // Build URLs for PayFast
    const baseUrl = 'https://div-elopers.onrender.com';
    const returnUrl = `${baseUrl}/payment-return.html?paymentId=${paymentId}`;
    const cancelUrl = `${baseUrl}/payment-cancel.html?paymentId=${paymentId}`;
    const notifyUrl = `${baseUrl}/api/payments/notify`;

    console.log('🔍 USING URLs:', { returnUrl, cancelUrl, notifyUrl });

    const itemName = groupName
      ? `${groupName} - Contribution`
      : 'Stokvel Contribution';

    // Use the ultra-minimal payfastService (no name/email fields)
    const paymentData = payfastService.generatePaymentData({
      amount: amount,
      itemName: itemName,
      paymentId: paymentId,
      returnUrl: returnUrl,
      cancelUrl: cancelUrl,
      notifyUrl: notifyUrl
    });

    console.log('📦 Payment Data from service:', JSON.stringify(paymentData, null, 2));

    // Store payment in Firestore
    await paymentRef.set({
      id: paymentId,
      userId: userId,
      contributionId: contributionId || null,
      groupId: groupId || null,
      amount: amount,
      currency: 'ZAR',
      status: 'pending',
      type: 'payment',
      provider: 'payfast',
      metadata: metadata || {},
      paymentData: {
        itemName: itemName
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendJSON(res, 200, {
      success: true,
      paymentId: paymentId,
      paymentData: paymentData,
      message: 'Payment initiated. Redirect user to PayFast.'
    });

  } catch (error) {
    console.error('Payment initiation error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// POST /notify - Handle PayFast ITN (Instant Transaction Notification)
async function handleNotify(req, res) {
  try {
    console.log('📡 PayFast ITN received:', req.body);

    const result = await payfastService.processITN(req.body);

    if (!result.success) {
      console.error('ITN verification failed:', result.error);
      sendJSON(res, 400, { error: result.error });
      return;
    }

    const paymentInfo = result.data;
    const paymentId = paymentInfo.paymentId;

    const paymentRef = db.collection('transactions').doc(paymentId);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      console.error('Payment not found:', paymentId);
      sendJSON(res, 404, { error: 'Payment not found' });
      return;
    }

    const payment = paymentDoc.data();

    if (!payfastService.verifyAmount(paymentInfo.amount, payment.amount)) {
      console.error('Amount mismatch:', {
        received: paymentInfo.amount,
        expected: payment.amount
      });
      sendJSON(res, 400, { error: 'Amount mismatch' });
      return;
    }

    await paymentRef.update({
      status: paymentInfo.paymentStatus,
      payfastPaymentId: paymentInfo.payfastPaymentId,
      amountGross: paymentInfo.amount,
      amountFee: paymentInfo.amountFee,
      amountNet: paymentInfo.amountNet,
      signature: paymentInfo.signature,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: paymentInfo.paymentStatus === 'completed'
        ? admin.firestore.FieldValue.serverTimestamp()
        : null
    });

    if (paymentInfo.paymentStatus === 'completed' && payment.contributionId) {
      try {
        await db.collection('contributions').doc(payment.contributionId).update({
          status: 'confirmed',
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          transactionId: paymentId
        });
      } catch (err) {
        console.error('Failed to update contribution:', err);
      }
    }

    try {
      await db.collection('webhookEvents').add({
        type: 'payfast_itn',
        paymentId: paymentId,
        status: paymentInfo.paymentStatus,
        data: req.body,
        processedData: paymentInfo,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        processed: true
      });
    } catch (err) {
      console.log('Note: Could not log webhook to Firestore');
    }

    sendJSON(res, 200, { received: true });

  } catch (error) {
    console.error('ITN processing error:', error);
    sendJSON(res, 500, { error: 'ITN processing failed' });
  }
}

// GET /return - Handle user return from PayFast (success page)
async function handleReturn(req, res) {
  try {
    sendJSON(res, 200, {
      message: 'Payment return acknowledged. Check payment status.',
      note: 'Frontend should poll /status endpoint to verify payment'
    });
  } catch (error) {
    console.error('Return handler error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// GET /cancel - Handle payment cancellation
async function handleCancel(req, res) {
  try {
    const paymentId = req.query.paymentId;

    if (!paymentId) {
      sendJSON(res, 400, { error: 'paymentId query parameter is required' });
      return;
    }

    const paymentRef = db.collection('transactions').doc(paymentId);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      sendJSON(res, 404, { error: 'Payment not found' });
      return;
    }

    const payment = paymentDoc.data();
    if (payment.userId !== req.user.uid && !req.user.isAdmin) {
      sendJSON(res, 403, { error: 'Unauthorized' });
      return;
    }

    if (payment.status !== 'pending') {
      sendJSON(res, 409, { error: 'Only pending payments can be cancelled' });
      return;
    }

    await paymentRef.update({
      status: 'cancelled',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendJSON(res, 200, {
      message: 'Payment cancelled',
      paymentId: paymentId
    });

  } catch (error) {
    console.error('Cancel handler error:', error);
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
      payfastPaymentId: payment.payfastPaymentId,
      transactionId: payment.payfastPaymentId
    });

  } catch (error) {
    console.error('Status check error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// POST /verify - Verify payment
async function verifyPayment(req, res) {
  try {
    const { paymentId, payfastPaymentId } = req.body;

    if (!paymentId && !payfastPaymentId) {
      sendJSON(res, 400, { error: 'Payment ID or PayFast Payment ID required' });
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
        .where('payfastPaymentId', '==', payfastPaymentId)
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
      success: payment.status === 'completed',
      status: payment.status,
      paymentId: paymentRef.id,
      payfastPaymentId: payment.payfastPaymentId
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
        payfastPaymentId: data.payfastPaymentId
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
    message: 'PayFast Payment API is working!',
    timestamp: new Date().toISOString(),
    provider: 'PayFast',
    endpoints: [
      'POST /initiate',
      'POST /notify (ITN)',
      'GET /return',
      'GET /cancel',
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

  const statusMatch = url.match(/^\/status\/(.+)$/);
  if (statusMatch) {
    req.params = { paymentId: statusMatch[1] };
  }

  const historyMatch = url.match(/^\/history\/(.+)$/);
  if (historyMatch) {
    req.params = { userId: historyMatch[1] };
  }

  console.log(`[Payment API] Request details: method=${method}, url=${url}, params=${JSON.stringify(req.params)}`);

  if (req.url.includes('?')) {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    req.query = Object.fromEntries(urlObj.searchParams);
  } else {
    req.query = {};
  }

  if (method === 'GET' && url === '/test') {
    await testEndpoint(req, res);
  }
  else if (method === 'POST' && url === '/notify') {
    await handleNotify(req, res);
  }
  else if (method === 'POST' && url === '/initiate') {
    await authenticateUser(req, res, () => initiatePayment(req, res));
  }
  else if (method === 'GET' && url === '/return') {
    await handleReturn(req, res);
  }
  else if (method === 'GET' && url === '/cancel') {
    await authenticateUser(req, res, () => handleCancel(req, res));
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

module.exports = handleRequest;
