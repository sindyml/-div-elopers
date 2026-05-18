// backend/services/payfastService.js
require('dotenv').config();

const crypto = require('crypto');
const axios = require('axios');

class PayFastService {
  constructor() {
    // Hardcoded sandbox credentials for testing
    this.merchantId = '10000100';
    this.merchantKey = '46f0cd694581a';
    this.passphrase = '';
    
    console.log('🔧 PayFast Service Initializing with HARDCODED sandbox credentials');
    console.log('   Merchant ID:', this.merchantId);
    console.log('   Merchant Key:', this.merchantKey ? '✅ Set' : '❌ NOT FOUND');

    // Force Sandbox URLs for testing
    this.baseUrl = 'https://sandbox.payfast.co.za/eng/process';
    this.validateUrl = 'https://sandbox.payfast.co.za/eng/query/validate';
  }

  /**
   * Generate MD5 signature for PayFast request
   */
  generateSignature(data, passphrase = null) {
    const pfPassphrase = passphrase || this.passphrase;
    
    // Sort the array alphabetically by key
    const sortedKeys = Object.keys(data).sort();
    let pfParamString = '';

    for (const key of sortedKeys) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
        const value = data[key].toString().trim();
        pfParamString += `${key}=${encodeURIComponent(value).replace(/%20/g, '+')}&`;
      }
    }

    pfParamString = pfParamString.slice(0, -1);

    if (pfPassphrase) {
      pfParamString += `&passphrase=${encodeURIComponent(pfPassphrase.trim()).replace(/%20/g, '+')}`;
    }

    // DEBUG: Log the exact string being hashed
    console.log('🔐 SIGNATURE STRING:', pfParamString);
    const signature = crypto.createHash('md5').update(pfParamString).digest('hex');
    console.log('🔐 SIGNATURE OUTPUT:', signature);

    return signature;
  }

  /**
   * Generate PayFast payment data for a transaction
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

    // Build payment data object
    const paymentData = {
      merchant_id: this.merchantId,
      merchant_key: this.merchantKey,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      name_first: firstName || 'StokPal',
      name_last: lastName || 'User',
      email_address: email || 'test@stokpal.co.za',
      m_payment_id: paymentId,
      amount: parseFloat(amount).toFixed(2),
      item_name: itemName,
      item_description: itemDescription || 'Stokvel Contribution',
      custom_str1: userId || ''
    };

    // Remove empty fields before generating signature
    const cleanedData = {};
    for (let key in paymentData) {
      if (paymentData[key] !== '' && paymentData[key] !== undefined && paymentData[key] !== null) {
        cleanedData[key] = paymentData[key];
      }
    }

    console.log('📦 Payment Data (cleaned):', JSON.stringify(cleanedData, null, 2));

    // Generate signature
    const signature = this.generateSignature(cleanedData);

    const result = {
      ...cleanedData,
      signature: signature,
      paymentUrl: this.baseUrl
    };

    console.log('✅ Final payment data ready, signature length:', signature.length);
    
    return result;
  }

  /**
   * Verify PayFast ITN (Instant Transaction Notification) signature
   */
  verifyITNSignature(postData) {
    if (!postData || !postData.signature) {
      console.error('❌ ITN missing signature');
      return false;
    }

    const receivedSignature = postData.signature;

    // Create a copy without the signature
    const data = { ...postData };
    delete data.signature;

    // Generate expected signature
    const expectedSignature = this.generateSignature(data);

    console.log('🔐 ITN Signature Check:');
    console.log('   Received:', receivedSignature);
    console.log('   Expected:', expectedSignature);

    const isValid = receivedSignature === expectedSignature;
    
    if (!isValid) {
      console.error('❌ Signature mismatch!');
    } else {
      console.log('✅ Signature valid');
    }
    
    return isValid;
  }

  /**
   * Validate ITN request with PayFast server
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

      console.log('📡 Validating ITN with PayFast...');

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

      console.log('📡 ITN Validation response:', response.data);
      return response.data === 'VALID';
    } catch (error) {
      console.error('ITN validation error:', error.message);
      return false;
    }
  }

  /**
   * Verify payment amount matches expected amount
   */
  verifyAmount(receivedAmount, expectedAmount) {
    const received = parseFloat(receivedAmount).toFixed(2);
    const expected = parseFloat(expectedAmount).toFixed(2);
    const isValid = received === expected;
    
    if (!isValid) {
      console.error(`❌ Amount mismatch: received=${received}, expected=${expected}`);
    }
    
    return isValid;
  }

  /**
   * Parse PayFast payment status
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
   */
  async processITN(itnData) {
    try {
      console.log('🔄 Processing ITN...');
      
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

      console.log('✅ ITN processed successfully:', paymentInfo);

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
   */
  generatePaymentForm(paymentData) {
    let form = `<form action="${this.baseUrl}" method="POST" id="payfast-form">\n`;

    for (let key in paymentData) {
      if (key !== 'paymentUrl') {
        form += `  <input type="hidden" name="${key}" value="${paymentData[key]}" />\n`;
      }
    }

    form += `  <button type="submit">Pay Now</button>\n`;
    form += `</form>\n`;
    form += `<script>document.getElementById('payfast-form').submit();</script>`;

    return form;
  }
}

module.exports = new PayFastService();
