const axios = require('axios');
const crypto = require('crypto');
const admin = require('firebase-admin');

class PaymentService {
  constructor() {
    this.apiKey = process.env.YOCO_SECRET_KEY;
    this.apiUrl = process.env.NODE_ENV === 'production' 
      ? 'https://online.yoco.com/v1' 
      : 'https://sandbox.yoco.com/v1';
    this.webhookSecret = process.env.YOCO_WEBHOOK_SECRET;
  }

  // Create payment charge
  async createCharge(amount, currency, token, metadata = {}) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/charges/`,
        {
          amount: Math.round(amount * 100), // Convert to cents
          currency: currency || 'ZAR',
          token: token,
          metadata: metadata
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Yoco charge creation error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Payment processing failed',
        code: error.response?.data?.code
      };
    }
  }

  // Get charge status
  async getChargeStatus(chargeId) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/charges/${chargeId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error fetching charge status:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch payment status'
      };
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload, signature, timestamp) {
    if (!this.webhookSecret) {
      console.warn('Webhook secret not configured');
      return true; // Skip verification in development
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  // Refund a payment
  async refundCharge(chargeId, amount = null) {
    try {
      const refundData = amount ? { amount: Math.round(amount * 100) } : {};
      
      const response = await axios.post(
        `${this.apiUrl}/charges/${chargeId}/refunds`,
        refundData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Refund error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Refund processing failed'
      };
    }
  }

  // With retry logic
  async createChargeWithRetry(amount, currency, token, metadata, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.createCharge(amount, currency, token, metadata);
      
      if (result.success) {
        return result;
      }
      
      lastError = result.error;
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return {
      success: false,
      error: `Failed after ${maxRetries} attempts: ${lastError}`
    };
  }

  // Generate payment intent response for frontend
  generatePaymentIntent(chargeId, amount, currency = 'ZAR') {
    return {
      chargeId: chargeId,
      amount: amount,
      currency: currency,
      status: 'pending',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new PaymentService();