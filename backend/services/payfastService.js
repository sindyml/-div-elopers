// Add this at the very top of payfastService.js
require('dotenv').config();
// Debug: Show what's being loaded
console.log('🔧 PayFast Service Initializing...');
console.log('   Merchant ID:', process.env.PAYFAST_MERCHANT_ID || '❌ NOT FOUND');
console.log('   Merchant Key:', process.env.PAYFAST_MERCHANT_KEY ? '✅ Found' : '❌ NOT FOUND');
console.log('   Passphrase:', process.env.PAYFAST_PASSPHRASE || '❌ NOT FOUND');

const crypto = require('crypto');
const axios = require('axios');

class PayFastService {
  constructor() {
  // TEMPORARY: Hardcode sandbox credentials for testing
  // TODO: Remove this and use env variables once Render is fixed
  this.merchantId = '10000100';
  this.merchantKey = '46f0cd694581a';
  this.passphrase = '';
  
  console.log('🔧 PayFast Service Initializing with HARDCODED sandbox credentials');
  console.log('   Merchant ID:', this.merchantId);
  console.log('   Merchant Key:', this.merchantKey ? '✅ Set' : '❌ NOT FOUND');

  // TEMP: Force Sandbox URL for testing
  this.baseUrl = 'https://sandbox.payfast.co.za/eng/process';
  this.validateUrl = 'https://sandbox.payfast.co.za/eng/query/validate';
  
}

  /**
   * Generate MD5 signature for PayFast request
   * @param {Object} data - Payment data object
   * @param {string} passphrase - PayFast passphrase
   * @returns {string} MD5 signature
   */
  generateSignature(data, passphrase = null) {
    const pfPassphrase = passphrase || this.passphrase;

    // Create parameter string
    let pfParamString = '';

    // PayFast requires parameters to be in the order they are sent,
    // but the API documentation often implies alphabetical sorting for some integrations.
    // Standard PayFast HTML redirect signature requires the exact order of fields.
    // However, common Node.js implementations sort them to ensure consistency.
    const keys = Object.keys(data).sort();

    for (const key of keys) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
        pfParamString += `${key}=${encodeURIComponent(data[key].toString().trim()).replace(/%20/g, '+')}&`;
      }
    }

    // Remove last ampersand
    pfParamString = pfParamString.slice(0, -1);

    // Add passphrase if provided
    if (pfPassphrase) {
      pfParamString += `&passphrase=${encodeURIComponent(pfPassphrase.trim()).replace(/%20/g, '+')}`;
    }

    // Generate MD5 hash
    return crypto.createHash('md5').update(pfParamString).digest('hex');
  }

  /**
   * Generate PayFast payment data for a transaction
   * @param {Object} params - Payment parameters
   * @returns {Object} Payment data with signature
   */
  generatePaymentData({
    amount,
    itemName,
    itemDescription = '',
    userId,
    paymentId,
    returnUrl,
    cancelUrl,
    notifyUrl,
    email = '',
    firstName = '',
    lastName = ''
  }) {
    // Validate required fields
    if (!this.merchantId || !this.merchantKey) {
      throw new Error('PayFast credentials not configured');
    }

    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    if (!itemName) {
      throw new Error('Item name is required');
    }

    // Build payment data object (order matters for signature!)
    const paymentData = {
      merchant_id: this.merchantId,
      merchant_key: this.merchantKey,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      name_first: firstName,
      name_last: lastName,
      email_address: email,
      m_payment_id: paymentId, // Our internal payment ID
      amount: parseFloat(amount).toFixed(2),
      item_name: itemName,
      item_description: itemDescription,
      custom_str1: userId, // Store user ID for reference
      custom_str2: '', // Available for additional data
      custom_str3: '', // Available for additional data
      custom_str4: '', // Available for additional data
      custom_str5: '', // Available for additional data
      custom_int1: '', // Available for additional data
      custom_int2: '', // Available for additional data
      custom_int3: '', // Available for additional data
      custom_int4: '', // Available for additional data
      custom_int5: '', // Available for additional data
    };

    // Remove empty fields before generating signature
    const cleanedData = {};
    for (let key in paymentData) {
      if (paymentData[key] !== '') {
        cleanedData[key] = paymentData[key];
      }
    }

    // Generate signature
    const signature = this.generateSignature(cleanedData);

    return {
      ...cleanedData,
      signature: signature,
      paymentUrl: this.baseUrl
    };
  }

  /**
   * Verify PayFast ITN (Instant Transaction Notification) signature
   * @param {Object} postData - POST data from PayFast ITN
   * @returns {boolean} True if signature is valid
   */
  verifyITNSignature(postData) {
    if (!postData || !postData.signature) {
      return false;
    }

    const receivedSignature = postData.signature;

    // Create a copy without the signature
    const data = { ...postData };
    delete data.signature;

    // Generate expected signature
    const expectedSignature = this.generateSignature(data);

    // Compare signatures using timing-safe comparison
    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedSignature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Signature comparison error:', error);
      return false;
    }
  }

  /**
   * Validate ITN request with PayFast server
   * @param {Object} postData - POST data from PayFast ITN
   * @returns {Promise<boolean>} True if validation succeeds
   */
  async validateITN(postData) {
    try {
      // Build parameter string
      let pfParamString = '';
      for (let key in postData) {
        if (postData.hasOwnProperty(key) && key !== 'signature') {
          pfParamString += `${key}=${encodeURIComponent(postData[key].toString().trim()).replace(/%20/g, '+')}&`;
        }
      }
      pfParamString = pfParamString.slice(0, -1);

      // Send validation request to PayFast
      const response = await axios.post(
        this.validateUrl,
        pfParamString,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      return response.data === 'VALID';
    } catch (error) {
      console.error('ITN validation error:', error.message);
      return false;
    }
  }

  /**
   * Verify payment amount matches expected amount
   * @param {number} receivedAmount - Amount from ITN
   * @param {number} expectedAmount - Expected amount
   * @returns {boolean} True if amounts match
   */
  verifyAmount(receivedAmount, expectedAmount) {
    const received = parseFloat(receivedAmount).toFixed(2);
    const expected = parseFloat(expectedAmount).toFixed(2);
    return received === expected;
  }

  /**
   * Parse PayFast payment status
   * @param {string} paymentStatus - Status from PayFast (COMPLETE, CANCELLED, etc.)
   * @returns {string} Normalized status (completed, failed, cancelled, pending)
   */
  parsePaymentStatus(paymentStatus) {
    const status = (paymentStatus || '').toUpperCase();

    switch (status) {
      case 'COMPLETE':
        return 'completed';
      case 'CANCELLED':
        return 'cancelled';
      case 'FAILED':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Process ITN notification from PayFast
   * @param {Object} itnData - ITN POST data
   * @returns {Promise<Object>} Processed payment result
   */
  async processITN(itnData) {
    try {
      // Step 1: Verify signature
      if (!this.verifyITNSignature(itnData)) {
        return {
          success: false,
          error: 'Invalid signature'
        };
      }

      // Step 2: Validate with PayFast server (optional but recommended)
      const isValid = await this.validateITN(itnData);
      if (!isValid) {
        return {
          success: false,
          error: 'ITN validation failed'
        };
      }

      // Step 3: Extract payment information
      const paymentInfo = {
        paymentId: itnData.m_payment_id,
        payfastPaymentId: itnData.pf_payment_id,
        paymentStatus: this.parsePaymentStatus(itnData.payment_status),
        amount: parseFloat(itnData.amount_gross),
        amountFee: parseFloat(itnData.amount_fee || 0),
        amountNet: parseFloat(itnData.amount_net || 0),
        userId: itnData.custom_str1,
        merchantId: itnData.merchant_id,
        signature: itnData.signature,
        timestamp: new Date().toISOString()
      };

      return {
        success: true,
        data: paymentInfo
      };

    } catch (error) {
      console.error('ITN processing error:', error);
      return {
        success: false,
        error: error.message || 'ITN processing failed'
      };
    }
  }

  /**
   * Generate HTML form for PayFast payment
   * Useful for testing or server-side rendering
   * @param {Object} paymentData - Payment data from generatePaymentData
   * @returns {string} HTML form string
   */
  generatePaymentForm(paymentData) {
    let form = `<form action="${this.baseUrl}" method="POST" id="payfast-form">\n`;

    for (let key in paymentData) {
      if (key !== 'paymentUrl') {
        form += `  <input type="hidden" name="${key}" value="${paymentData[key]}" />\n`;
      }
    }

    form += `  <button type="submit">Pay Now</button>\n`;
    form += `</form>`;

    return form;
  }
}

module.exports = new PayFastService();
