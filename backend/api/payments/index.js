// backend/api/payments/index.js - Payment API (Stripe + PayFast)
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

// Generate signature for PayFast
function generateSignature(data) {
  const paramString = Object.keys(data)
    .sort()
    .filter(key => data[key] !== '' && data[key] != null)
    .map(key => `${key}=${encodeURIComponent(String(data[key]).trim())}`)
    .join('&');

  console.log('🔐 SIGNATURE PARAM STRING:', paramString);
  const signature = crypto.createHash('md5').update(paramString).digest('hex');
  console.log('🔐 SIGNATURE:', signature);
  return { paramString, signature };
}

// POST /initiate - Create payment (PayFast version - kept for reference)
async function initiatePaymentPayFast(req, res) {
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
    const itemName = groupName ? `${groupName} - Contribution` : 'Stokvel Contribution';

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

// POST /create-checkout-session - Stripe Checkout
async function createStripeCheckoutSession(req, res) {
  try {
    const { amount, groupName, contributionId, groupId, returnUrl, cancelUrl } = req.body;
    const userId = req.user ? req.user.uid : null;

    if (!userId) {
      sendJSON(res, 401, { error: 'Unauthorized' });
      return;
    }

    if (!amount || amount <= 0) {
      sendJSON(res, 400, { error: 'Invalid amount' });
      return;
    }

    // Create a payment document FIRST to get a valid ID
    const paymentRef = db.collection('transactions').doc();
    const paymentId = paymentRef.id;

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'zar',
          product_data: { name: `${groupName || 'Stokvel'} - Contribution` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: returnUrl,
      cancel_url: cancelUrl,
      metadata: { paymentId, userId, contributionId, groupId }
    });

    // Save the transaction with the payment ID
    await paymentRef.set({
      id: paymentId,
      userId: userId,
      contributionId: contributionId || null,
      groupId: groupId || null,
      amount: amount,
      currency: 'ZAR',
      status: 'pending',
      type: 'payment',
      provider: 'stripe',
      stripeSessionId: session.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    sendJSON(res, 200, {
      success: true,
      paymentId: paymentId,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Stripe checkout error:', error);
    sendJSON(res, 500, { error: error.message });
  }
}
// POST /verify - Verify payment (for Stripe return)
async function verifyPayment(req, res) {
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      sendJSON(res, 400, { error: 'Payment ID required' });
      return;
    }

    const paymentDoc = await db.collection('transactions').doc(paymentId).get();

    if (!paymentDoc.exists) {
      sendJSON(res, 404, { error: 'Payment not found' });
      return;
    }

    const payment = paymentDoc.data();

    sendJSON(res, 200, {
      success: payment.status === 'completed',
      status: payment.status,
      paymentId: paymentId,
      amount: payment.amount
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// GET /status/:paymentId - Check payment status
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
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency
    });
  } catch (error) {
    sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// GET /test - Test endpoint
async function testEndpoint(req, res) {
  sendJSON(res, 200, {
    message: 'Payment API is working!',
    timestamp: new Date().toISOString(),
    provider: 'stripe'
  });
}

// POST /webhook - Stripe webhook (for future use)
async function handleWebhook(req, res) {
  // TODO: Implement Stripe webhook to update payment status
  sendJSON(res, 200, { received: true });
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

  // Route handlers
  if (method === 'GET' && url === '/test') {
    await testEndpoint(req, res);
  }
  else if (method === 'POST' && url === '/initiate') {
    await authenticateUser(req, res, () => initiatePaymentPayFast(req, res));
  }
  else if (method === 'POST' && url === '/create-checkout-session') {
    await authenticateUser(req, res, () => createStripeCheckoutSession(req, res));
  }
  else if (method === 'POST' && url === '/verify') {
    await authenticateUser(req, res, () => verifyPayment(req, res));
  }
  else if (method === 'POST' && url === '/webhook') {
    await handleWebhook(req, res);
  }
  else if (method === 'POST' && url === '/notify') {
    await authenticateUser(req, res, () => handleNotify(req, res));
  }
  else if (method === 'GET' && url === '/return') {
    await handleReturn(req, res);
  }
  else if (method === 'GET' && url === '/cancel') {
    await authenticateUser(req, res, () => handleCancel(req, res));
  }
  else if (method === 'GET' && statusMatch) {
    await authenticateUser(req, res, () => getPaymentStatus(req, res));
  }
  else {
    sendJSON(res, 404, { error: `Endpoint not found: ${method} ${url}` });
  }
}

// Keep existing handlers for reference
async function handleNotify(req, res) {
  sendJSON(res, 200, { received: true });
}

async function handleReturn(req, res) {
  sendJSON(res, 200, { message: 'Payment return acknowledged' });
}

async function handleCancel(req, res) {
  const paymentId = req.query.paymentId;
  if (paymentId) {
    try {
      await db.collection('transactions').doc(paymentId).update({
        status: 'cancelled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.warn('Could not cancel payment:', err.message);
    }
  }
  sendJSON(res, 200, { message: 'Payment cancelled' });
}

module.exports = handleRequest;
