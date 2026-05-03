const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const paymentService = require('../../services/paymentService');
const { authenticateUser } = require('../../middleware/auth');

// Initialize Firestore
const db = admin.firestore();

// POST /api/payments/initiate - Create payment session
router.post('/initiate', authenticateUser, async (req, res) => {
  try {
    const { amount, currency, token, contributionId, metadata } = req.body;
    const userId = req.user.uid;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!token) {
      return res.status(400).json({ error: 'Payment token required' });
    }

    // Create payment record in Firestore
    const paymentRef = db.collection('transactions').doc();
    const paymentData = {
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
    };

    await paymentRef.set(paymentData);

    // Process payment with Yoco
    const paymentResult = await paymentService.createChargeWithRetry(
      amount,
      currency || 'ZAR',
      token,
      {
        paymentId: paymentRef.id,
        userId: userId,
        ...metadata
      }
    );

    if (!paymentResult.success) {
      // Update payment status to failed
      await paymentRef.update({
        status: 'failed',
        errorMessage: paymentResult.error,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(400).json({
        success: false,
        error: paymentResult.error,
        paymentId: paymentRef.id
      });
    }

    // Update payment record with charge details
    await paymentRef.update({
      chargeId: paymentResult.data.id,
      status: paymentResult.data.status,
      yocoResponse: {
        id: paymentResult.data.id,
        status: paymentResult.data.status,
        amount: paymentResult.data.amount,
        currency: paymentResult.data.currency
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // If payment was successful immediately (rare with card payments)
    if (paymentResult.data.status === 'successful') {
      await handleSuccessfulPayment(paymentRef.id, paymentResult.data);
    }

    res.status(200).json({
      success: true,
      paymentId: paymentRef.id,
      chargeId: paymentResult.data.id,
      status: paymentResult.data.status,
      redirectUrl: paymentResult.data.redirectUrl || null
    });

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/payments/webhook - Handle Yoco webhooks
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['yoco-signature'];
    const timestamp = req.headers['yoco-timestamp'];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    const isValid = paymentService.verifyWebhookSignature(payload, signature, timestamp);
    
    if (!isValid) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    const eventType = event.type;
    const chargeData = event.data;

    // Log webhook event
    await db.collection('webhookEvents').add({
      type: eventType,
      chargeId: chargeData?.id,
      data: event,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      processed: false
    });

    // Process based on event type
    if (eventType === 'charge.succeeded') {
      await handleChargeSucceeded(chargeData);
    } else if (eventType === 'charge.failed') {
      await handleChargeFailed(chargeData);
    } else if (eventType === 'charge.refunded') {
      await handleChargeRefunded(chargeData);
    }

    // Mark webhook as processed
    const webhookQuery = await db.collection('webhookEvents')
      .where('chargeId', '==', chargeData?.id)
      .where('type', '==', eventType)
      .orderBy('receivedAt', 'desc')
      .limit(1)
      .get();

    if (!webhookQuery.empty) {
      await webhookQuery.docs[0].ref.update({
        processed: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// GET /api/payments/status/:paymentId - Check payment status
router.get('/status/:paymentId', authenticateUser, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.uid;

    const paymentDoc = await db.collection('transactions').doc(paymentId).get();

    if (!paymentDoc.exists) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentDoc.data();

    // Check authorization
    if (payment.userId !== userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // If payment has chargeId, get latest status from Yoco
    if (payment.chargeId && payment.status === 'pending') {
      const chargeStatus = await paymentService.getChargeStatus(payment.chargeId);
      
      if (chargeStatus.success && chargeStatus.data.status !== payment.status) {
        await paymentDoc.ref.update({
          status: chargeStatus.data.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        payment.status = chargeStatus.data.status;
      }
    }

    res.status(200).json({
      paymentId: paymentId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      createdAt: payment.createdAt,
      chargeId: payment.chargeId
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/payments/verify - Verify payment completion
router.post('/verify', authenticateUser, async (req, res) => {
  try {
    const { paymentId, chargeId } = req.body;
    const userId = req.user.uid;

    if (!paymentId && !chargeId) {
      return res.status(400).json({ error: 'Payment ID or Charge ID required' });
    }

    let payment;
    let paymentRef;

    if (paymentId) {
      const paymentDoc = await db.collection('transactions').doc(paymentId).get();
      if (!paymentDoc.exists) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      payment = paymentDoc.data();
      paymentRef = paymentDoc.ref;

      // Check authorization
      if (payment.userId !== userId && !req.user.isAdmin) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    } else if (chargeId) {
      // Find payment by charge ID
      const paymentQuery = await db.collection('transactions')
        .where('chargeId', '==', chargeId)
        .limit(1)
        .get();

      if (paymentQuery.empty) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      
      payment = paymentQuery.docs[0].data();
      paymentRef = paymentQuery.docs[0].ref;
    }

    // Verify with Yoco
    if (payment.chargeId) {
      const chargeStatus = await paymentService.getChargeStatus(payment.chargeId);
      
      if (chargeStatus.success) {
        const isSuccessful = chargeStatus.data.status === 'successful';
        
        if (isSuccessful && payment.status !== 'successful') {
          await paymentRef.update({
            status: 'successful',
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          await handleSuccessfulPayment(paymentRef.id, chargeStatus.data);
        }

        res.status(200).json({
          success: isSuccessful,
          status: chargeStatus.data.status,
          paymentId: paymentRef.id,
          chargeId: payment.chargeId
        });
      } else {
        res.status(500).json({ error: 'Failed to verify payment status' });
      }
    } else {
      res.status(400).json({ error: 'No charge ID associated with payment' });
    }

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/payments/history/:userId - Get user payment history
router.get('/history/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.uid;
    const { limit = 50, startAfter, status } = req.query;

    // Check authorization
    if (userId !== requestingUserId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    let query = db.collection('transactions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));

    if (status) {
      query = query.where('status', '==', status);
    }

    if (startAfter) {
      const startAfterDoc = await db.collection('transactions').doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
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
        type: data.type,
        contributionId: data.contributionId,
        createdAt: data.createdAt,
        chargeId: data.chargeId,
        metadata: data.metadata
      });
    });

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const nextStartAfter = lastDoc ? lastDoc.id : null;

    res.status(200).json({
      payments,
      pagination: {
        limit: parseInt(limit),
        nextStartAfter,
        hasMore: snapshot.docs.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper Functions
async function handleChargeSucceeded(chargeData) {
  const paymentQuery = await db.collection('transactions')
    .where('chargeId', '==', chargeData.id)
    .limit(1)
    .get();

  if (!paymentQuery.empty) {
    const paymentDoc = paymentQuery.docs[0];
    await paymentDoc.ref.update({
      status: 'successful',
      yocoResponse: chargeData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await handleSuccessfulPayment(paymentDoc.id, chargeData);
  }
}

async function handleChargeFailed(chargeData) {
  const paymentQuery = await db.collection('transactions')
    .where('chargeId', '==', chargeData.id)
    .limit(1)
    .get();

  if (!paymentQuery.empty) {
    const paymentDoc = paymentQuery.docs[0];
    await paymentDoc.ref.update({
      status: 'failed',
      failureReason: chargeData.failure_reason,
      yocoResponse: chargeData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

async function handleChargeRefunded(chargeData) {
  const paymentQuery = await db.collection('transactions')
    .where('chargeId', '==', chargeData.id)
    .limit(1)
    .get();

  if (!paymentQuery.empty) {
    const paymentDoc = paymentQuery.docs[0];
    await paymentDoc.ref.update({
      status: 'refunded',
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      yocoResponse: chargeData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

async function handleSuccessfulPayment(paymentId, chargeData) {
  const paymentDoc = await db.collection('transactions').doc(paymentId).get();
  const payment = paymentDoc.data();

  // Update contribution if exists
  if (payment.contributionId) {
    const contributionRef = db.collection('contributions').doc(payment.contributionId);
    await contributionRef.update({
      status: 'paid',
      paidAmount: admin.firestore.FieldValue.increment(payment.amount),
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentId: paymentId,
      chargeId: chargeData.id
    });
  }

  // Create payment proof record
  await db.collection('transactions').doc(paymentId).collection('paymentProofs').add({
    chargeId: chargeData.id,
    status: 'successful',
    amount: chargeData.amount / 100,
    currency: chargeData.currency,
    receiptUrl: chargeData.receipt_url || null,
    paymentMethod: chargeData.payment_method,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Trigger any post-payment actions (send email, update stats, etc.)
  await triggerPostPaymentActions(paymentId, payment);
}

async function triggerPostPaymentActions(paymentId, payment) {
  // Add to queue for async processing
  const queueRef = db.collection('paymentQueues').doc(paymentId);
  await queueRef.set({
    paymentId: paymentId,
    userId: payment.userId,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    retryCount: 0
  });
}

// For use as Express middleware
function paymentHandler(req, res) {
  // This is a simple router that matches the request to the right handler
  const method = req.method;
  const url = req.url;
  
  // Extract path without query parameters
  const path = url.split('?')[0];
  
  // Helper to send response
  const sendResponse = (statusCode, data) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  
  // Mock the Express response object methods that our handlers expect
  res.status = function(code) {
    this.statusCode = code;
    return this;
  };
  
  res.json = function(data) {
    this.setHeader('Content-Type', 'application/json');
    this.end(JSON.stringify(data));
  };
  
  // Route matching
  if (method === 'POST' && path === '/initiate') {
    // Call initiatePayment handler
    initiatePayment(req, res);
  } 
  else if (method === 'POST' && path === '/webhook') {
    handleWebhook(req, res);
  }
  else if (method === 'GET' && path.match(/^\/status\/.+/)) {
    const paymentId = path.split('/')[2];
    req.params = { paymentId };
    getPaymentStatus(req, res);
  }
  else if (method === 'POST' && path === '/verify') {
    verifyPayment(req, res);
  }
  else if (method === 'GET' && path.match(/^\/history\/.+/)) {
    const userId = path.split('/')[2];
    req.params = { userId };
    getPaymentHistory(req, res);
  }
  else {
    sendResponse(404, { error: 'Payment endpoint not found' });
  }
}



module.exports = paymentHandler;