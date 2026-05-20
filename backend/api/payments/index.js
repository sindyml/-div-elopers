// backend/api/payments/index.js - Stripe Payment API
const admin = require('firebase-admin');

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

    console.log('📝 Creating payment record with ID:', paymentId);

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
    console.error('Status check error:', error);
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
  else if (method === 'POST' && url === '/create-checkout-session') {
    await authenticateUser(req, res, () => createStripeCheckoutSession(req, res));
  }
  else if (method === 'GET' && statusMatch) {
    await authenticateUser(req, res, () => getPaymentStatus(req, res));
  }
  else {
    sendJSON(res, 404, { error: `Endpoint not found: ${method} ${url}` });
  }
}

module.exports = handleRequest;
