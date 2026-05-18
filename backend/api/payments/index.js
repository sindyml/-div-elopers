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

// ✅ FIXED: uses %20 not + so it matches what browser sends to PayFast
function generateSignature(data) {
  const paramString = Object.keys(data)
    .map(key => `${key}=${encodeURIComponent(String(data[key]).trim())}`)
    .join('&');

  console.log('🔐 SIGNATURE PARAM STRING:', paramString);
  return {
    paramString,
    signature: crypto.createHash('md5').update(paramString).digest('hex')
  };
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

    const rawName = groupName ? `${groupName} - Contribution` : 'Stokvel Contribution';
    const itemName = rawName.replace(/[^a-zA-Z0-9 .,_-]/g, '').trim().substring(0, 100);

    const paymentData = {
      merchant_id:  '10000100',
      merchant_key: '46f0cd694581a',
      return_url:   `https://div-elopers.onrender.com/payment-return.html?paymentId=${paymentId}`,
      cancel_url:   `https://div-elopers.onrender.com/payment-cancel.html?paymentId=${paymentId}`,
      notify_url:   'https://div-elopers.onrender.com/api/payments/notify',
      m_payment_id: paymentId,
      amount:       parseFloat(amount).toFixed(2),
      item_name:    itemName,
    };

    const { signature } = generateSignature(paymentData);
    paymentData.signature = signature;

    console.log('🔐 SIGNATURE:', signature);
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
      currency:  payment.currency
    });
  } catch (error) {
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

  if (method === 'GET' && url === '/test') {
    await testEndpoint(req, res);
  } else if (method === 'POST' && url === '/notify') {
    await handleNotify(req, res);
  } else if (method === 'POST' && url === '/initiate') {
    await authenticateUser(req, res, () => initiatePayment(req, res));
  } else if (method === 'GET' && url === '/return') {
    await handleReturn(req, res);
  } else if (method === 'GET' && url === '/cancel') {
    await handleCancel(req, res);
  } else if (method === 'GET' && statusMatch) {
    await authenticateUser(req, res, () => getPaymentStatus(req, res));
  } else {
    sendJSON(res, 404, { error: `Endpoint not found: ${method} ${url}` });
  }
}

module.exports = handleRequest;
