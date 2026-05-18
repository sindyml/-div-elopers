// backend/api/payments/index.js - PayFast Payment API
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = admin.firestore();

function sendJSON(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendJSON(res, 401, { error: 'Authentication required' });
      return;
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      isAdmin: decodedToken.isAdmin === true || decodedToken.admin === true
    };
    next();
  } catch (error) {
    sendJSON(res, 401, { error: 'Invalid authentication token' });
  }
}

// ✅ CORRECT: Sort keys alphabetically as PayFast requires
function generateSignature(data) {
  const paramString = Object.keys(data)
    .sort() // alphabetical order required by PayFast
    .filter(key => data[key] !== '' && data[key] != null)
    .map(key => `${key}=${encodeURIComponent(String(data[key]).trim())}`)
    .join('&');

  console.log('🔐 SIGNATURE PARAM STRING:', paramString);
  const signature = crypto.createHash('md5').update(paramString).digest('hex');
  console.log('🔐 SIGNATURE:', signature);
  return { paramString, signature };
}

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

    const paymentRef = db.collection('transactions').doc();
    const paymentId = paymentRef.id;

    // Simple clean item name - no special characters
    const itemName = 'Stokvel Contribution';

    // PayFast will sort these alphabetically when verifying
    const paymentData = {
      amount:       parseFloat(amount).toFixed(2),
      cancel_url:   `https://div-elopers.onrender.com/payment-cancel.html?paymentId=${paymentId}`,
      item_name:    itemName,
      m_payment_id: paymentId,
      merchant_id:  '10000100',
      merchant_key: '46f0cd694581a',
      notify_url:   'https://div-elopers.onrender.com/api/payments/notify',
      return_url:   `https://div-elopers.onrender.com/payment-return.html?paymentId=${paymentId}`,
    };

    const { signature } = generateSignature(paymentData);
    paymentData.signature = signature;

    console.log('📦 PAYMENT DATA:', paymentData);

    await paymentRef.set({
      id:             paymentId,
      userId:         userId,
      contributionId: contributionId || null,
      groupId:        groupId || null,
      amount:         amount,
      currency:       'ZAR',
      status:         'pending',
      type:           'payment',
      provider:       'payfast',
      metadata:       metadata || {},
      createdAt:      admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:      admin.firestore.FieldValue.serverTimestamp()
    });

    sendJSON(res, 200, {
      success:     true,
      paymentId:   paymentId,
      paymentData: {
        ...paymentData,
        paymentUrl: 'https://sandbox.payfast.co.za/eng/process'
      },
      message: 'Payment initiated. Redirect user to PayFast.'
    });

  } catch (error) {
    console.error('Payment initiation error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

async function handleNotify(req, res) {
  try {
    console.log('📡 PayFast ITN received:', req.body);
    const { m_payment_id, payment_status, amount_gross, pf_payment_id } = req.body;

    if (!m_payment_id) {
      sendJSON(res, 400, { error: 'No payment ID received' });
      return;
    }

    const paymentRef = db.collection('transactions').doc(m_payment_id);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      console.error('Payment not found:', m_payment_id);
      sendJSON(res, 404, { error: 'Payment not found' });
      return;
    }

    const status = payment_status === 'COMPLETE' ? 'completed' : 'failed';

    await paymentRef.update({
      status:           status,
      payfastPaymentId: pf_payment_id,
      amountGross:      amount_gross,
      updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
      completedAt:      status === 'completed'
                          ? admin.firestore.FieldValue.serverTimestamp()
                          : null
    });

    sendJSON(res, 200, { received: true });

  } catch (error) {
    console.error('ITN processing error:', error);
    sendJSON(res, 500, { error: 'ITN processing failed' });
  }
}

async function handleReturn(req, res) {
  sendJSON(res, 200, { message: 'Payment return acknowledged' });
}

async function handleCancel(req, res) {
  const paymentId = req.query.paymentId;
  if (paymentId) {
    try {
      await db.collection('transactions').doc(paymentId).update({
        status:    'cancelled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.warn('Could not cancel payment:', err.message);
    }
  }
  sendJSON(res, 200, { message: 'Payment cancelled' });
}

async function getPaymentStatus(req, res) {
  try {
    const paymentId = req.params.paymentId;
    const paymentDoc = await db.collection('transactions').doc(paymentId).get();

    if (!paymentDoc.exists) {
      sendJSON(res, 404, { error: 'Payment not found' });
      return;
    }

    const payment = paymentDoc.data();
    sendJSON(res, 200, {
      paymentId: paymentId,
      status:    payment.status,
      amount:    payment.amount,
      currency:  payment.currency,
      payfastPaymentId: payment.payfastPaymentId || null,
      transactionId: payment.payfastPaymentId || null
    });
  } catch (error) {
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

async function verifyPayment(req, res) {
  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      sendJSON(res, 400, { error: 'Payment ID is required' });
      return;
    }

    const paymentDoc = await db.collection('transactions').doc(paymentId).get();

    if (!paymentDoc.exists) {
      sendJSON(res, 404, { error: 'Payment not found' });
      return;
    }

    const payment = paymentDoc.data();
    sendJSON(res, 200, {
      success: true,
      status: payment.status,
      paymentId: paymentId,
      payfastPaymentId: payment.payfastPaymentId || null
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

async function getPaymentHistory(req, res) {
  try {
    const userId = req.params.userId;
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;

    let query = db.collection('transactions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(Math.min(limit, 100));

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    const payments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    sendJSON(res, 200, {
      payments,
      count: payments.length
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

async function testEndpoint(req, res) {
  sendJSON(res, 200, {
    message:   'PayFast Payment API is working!',
    timestamp: new Date().toISOString(),
    provider:  'PayFast'
  });
}

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
    const queryStr = req.url.split('?')[1];
    if (queryStr) {
      req.query = Object.fromEntries(new URLSearchParams(queryStr));
    }
  }

  if (method === 'GET' && url === '/test') {
    await testEndpoint(req, res);
  } else if (method === 'POST' && url === '/notify') {
    await handleNotify(req, res);
  } else if (method === 'POST' && url === '/initiate') {
    await authenticateUser(req, res, () => initiatePayment(req, res));
  } else if (method === 'POST' && url === '/verify') {
    await authenticateUser(req, res, () => verifyPayment(req, res));
  } else if (method === 'GET' && url === '/return') {
    await handleReturn(req, res);
  } else if (method === 'GET' && url === '/cancel') {
    await handleCancel(req, res);
  } else if (method === 'GET' && statusMatch) {
    await authenticateUser(req, res, () => getPaymentStatus(req, res));
  } else if (method === 'GET' && historyMatch) {
    await authenticateUser(req, res, () => getPaymentHistory(req, res));
  } else {
    sendJSON(res, 404, { error: `Endpoint not found: ${method} ${url}` });
  }
}

module.exports = handleRequest;
