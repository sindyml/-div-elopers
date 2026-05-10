# PayFast Integration Guide

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Detailed Setup](#detailed-setup)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)
8. [FAQ](#faq)

---

## Overview

This guide will help you integrate PayFast payment gateway into the Stockpal stokvel management platform. PayFast is a South African payment gateway that supports card payments, instant EFT, and other payment methods.

### What Changed from Yoco?

| Feature | Yoco | PayFast |
|---------|------|---------|
| **Integration Method** | Token-based API | Redirect-based form POST |
| **Payment Flow** | In-page payment | Redirect to PayFast, then return |
| **Webhooks** | Yoco webhooks | ITN (Instant Transaction Notification) |
| **Signature** | HMAC-SHA256 | MD5 hash |
| **Test Environment** | Sandbox API | Sandbox website |

---

## Prerequisites

### 1. PayFast Account
- Sign up at [https://www.payfast.co.za/](https://www.payfast.co.za/)
- Verify your account (may take 1-2 business days)
- For testing, you can use the sandbox immediately

### 2. Get Your Credentials

**Sandbox (Testing):**
- Merchant ID: `10000100`
- Merchant Key: `46f0cd694581a`
- Passphrase: Create your own (any string)
- Available immediately, no sign-up needed

**Production:**
1. Log in to [PayFast Dashboard](https://www.payfast.co.za/login)
2. Go to **Settings** → **Integration**
3. Copy your Merchant ID and Merchant Key
4. Set a Passphrase (remember this!)

### 3. Technical Requirements
- Node.js >= 18.0.0
- Firebase project with Firestore
- Public URL for webhooks (in production)

---

## Quick Start

### Step 1: Update Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` and add your PayFast credentials:

```env
# PayFast Configuration
PAYFAST_MERCHANT_ID=10000100
PAYFAST_MERCHANT_KEY=46f0cd694581a
PAYFAST_PASSPHRASE=MySecretPassphrase123

# Server Configuration
NODE_ENV=development
BASE_URL=http://localhost:8080
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Start the Server

```bash
npm start
```

The server will start at `http://localhost:8080`

### Step 4: Test a Payment

1. Open `http://localhost:8080/frontend/dashboard.html`
2. Log in to your account
3. Navigate to a contribution that needs payment
4. Click "Pay Now"
5. You'll be redirected to PayFast sandbox
6. Use test card: **4000 0000 0000 0002**
7. Complete the payment
8. You'll be redirected back to the success page

---

## Detailed Setup

### Backend Configuration

The PayFast integration consists of three main components:

#### 1. PayFast Service (`backend/services/payfastService.js`)

This service handles:
- Generating payment data with MD5 signatures
- Verifying ITN (webhook) signatures
- Validating ITN with PayFast server
- Parsing payment statuses

Key methods:
- `generatePaymentData()` - Creates payment data for redirect
- `verifyITNSignature()` - Verifies webhook authenticity
- `validateITN()` - Validates with PayFast server
- `processITN()` - Complete ITN processing

#### 2. Payment API (`backend/api/payments/index.js`)

Endpoints:
- `POST /api/payments/initiate` - Create payment
- `POST /api/payments/notify` - Receive ITN from PayFast
- `GET /api/payments/status/:paymentId` - Check status
- `GET /api/payments/return` - Handle user return
- `GET /api/payments/cancel` - Handle cancellation

#### 3. Return Pages

- `frontend/payment-return.html` - Success/verification page
- `frontend/payment-cancel.html` - Cancellation page

### Frontend Integration

The payment modal (`frontend/components/payment-modal.js`) has been updated to:

1. **Collect Payment Information**
   - Amount, group name, user details
   - Calculate fees (1.5% for card payments)

2. **Initiate Payment**
   - Call `/api/payments/initiate`
   - Receive PayFast payment data

3. **Redirect to PayFast**
   - Create hidden form with payment data
   - Auto-submit to PayFast URL

4. **Handle Return**
   - Poll payment status
   - Display success/failure message

### Payment Flow Diagram

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ 1. Click "Pay Now"
       ▼
┌─────────────────────┐
│  Payment Modal      │
│  (Frontend)         │
└──────┬──────────────┘
       │ 2. POST /initiate
       ▼
┌─────────────────────┐
│  Backend API        │
│  Generate PayFast   │
│  payment data       │
└──────┬──────────────┘
       │ 3. Return payment data
       ▼
┌─────────────────────┐
│  Payment Modal      │
│  Creates form       │
│  & redirects        │
└──────┬──────────────┘
       │ 4. Redirect to PayFast
       ▼
┌─────────────────────┐
│  PayFast Website    │
│  User pays          │
└──────┬──────────────┘
       │ 5. ITN (webhook)    │ 6. User redirect
       ▼                     ▼
┌─────────────────┐   ┌──────────────────┐
│  POST /notify   │   │ payment-return   │
│  Update status  │   │ Poll status      │
└─────────────────┘   └──────────────────┘
```

---

## Testing

### Test Environment Setup

PayFast sandbox is available at:
- **Payment URL**: `https://sandbox.payfast.co.za/eng/process`
- **Validation URL**: `https://sandbox.payfast.co.za/eng/query/validate`

### Test Cards

**Successful Payment:**
- Card Number: `4000 0000 0000 0002`
- CVV: Any 3 digits
- Expiry: Any future date

**Declined Payment:**
- Card Number: `4000 0000 0000 0010`
- CVV: Any 3 digits
- Expiry: Any future date

### Testing ITN (Webhooks) Locally

PayFast needs to send ITN to your server, but localhost is not publicly accessible. Solutions:

#### Option 1: ngrok (Recommended for Local Testing)

```bash
# Install ngrok
npm install -g ngrok

# Start your server
npm start

# In another terminal, start ngrok
ngrok http 8080
```

You'll get a public URL like: `https://abc123.ngrok.io`

Update your `.env`:
```env
BASE_URL=https://abc123.ngrok.io
```

Restart your server. PayFast will now be able to send ITN to your webhook.

#### Option 2: Deploy to a Test Server

Deploy to Azure, Heroku, or similar service with a public URL.

### Manual Testing Checklist

- [ ] Start server with sandbox credentials
- [ ] Initiate payment from frontend
- [ ] Verify redirect to PayFast sandbox
- [ ] Complete payment with test card
- [ ] Verify ITN received (check server logs)
- [ ] Verify payment status updated in Firestore
- [ ] Verify user redirected to success page
- [ ] Check contribution status updated (if applicable)

### Automated Testing

Run the test suite:

```bash
npm test
```

Tests cover:
- Payment initiation
- Signature generation
- ITN verification
- Status checking
- Error handling

---

## Production Deployment

### Prerequisites

1. **PayFast Production Account**
   - Verified PayFast account
   - Production Merchant ID and Key
   - Passphrase configured

2. **HTTPS Domain**
   - ITN webhook requires HTTPS
   - Return/Cancel URLs should use HTTPS

3. **Environment Configuration**

Update production `.env`:

```env
NODE_ENV=production
BASE_URL=https://yourdomain.com

PAYFAST_MERCHANT_ID=your_production_merchant_id
PAYFAST_MERCHANT_KEY=your_production_merchant_key
PAYFAST_PASSPHRASE=your_production_passphrase
```

### Deployment Steps

#### 1. Update Environment Variables

On your hosting platform (Azure, Heroku, etc.), set:
- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE`
- `NODE_ENV=production`
- `BASE_URL=https://yourdomain.com`

#### 2. Deploy Application

```bash
# Build and deploy (Azure example)
git push azure main

# Or manual deployment
npm install --production
npm start
```

#### 3. Configure PayFast Dashboard

1. Log in to [PayFast Dashboard](https://www.payfast.co.za/login)
2. Go to **Settings** → **Integration**
3. Set these URLs:
   - **Notify URL**: `https://yourdomain.com/api/payments/notify`
   - **Return URL**: `https://yourdomain.com/payment-return.html`
   - **Cancel URL**: `https://yourdomain.com/payment-cancel.html`

#### 4. Test in Production

1. Make a small real payment (R1.00)
2. Verify ITN received
3. Verify payment status updated
4. Verify user redirected correctly

### Security Checklist

- [ ] HTTPS enabled on all pages
- [ ] Passphrase stored securely (environment variable, not in code)
- [ ] ITN signature verification enabled
- [ ] Amount verification enabled
- [ ] PayFast server validation enabled
- [ ] Firestore security rules properly configured
- [ ] Error messages don't expose sensitive data

---

## Troubleshooting

### Common Issues

#### 1. "Signature Invalid" Error

**Cause**: Passphrase mismatch or incorrect signature generation

**Solution**:
- Verify passphrase in `.env` matches PayFast dashboard
- Check that all payment data fields are included in signature
- Ensure no extra spaces or encoding issues

#### 2. ITN Not Received

**Cause**: PayFast can't reach your webhook URL

**Solution**:
- Verify `BASE_URL` is correct in `.env`
- Ensure URL is publicly accessible (use ngrok for local testing)
- Check firewall rules
- View PayFast ITN logs in dashboard

#### 3. Payment Stuck in "Pending"

**Cause**: ITN not processed correctly

**Solution**:
- Check server logs for ITN processing errors
- Verify Firestore write permissions
- Check if signature verification passed
- Look for amount mismatch errors

#### 4. User Not Redirected After Payment

**Cause**: Return URL incorrect or not accessible

**Solution**:
- Verify return URLs in payment data
- Check that return pages exist
- Ensure HTTPS in production

### Debugging Tips

#### Enable Detailed Logging

Edit `backend/api/payments/index.js`:

```javascript
// Add detailed logging in handleNotify
console.log('📡 ITN Data:', JSON.stringify(req.body, null, 2));
console.log('✅ Signature valid:', isValid);
console.log('💾 Payment updated:', paymentId);
```

#### Check PayFast Dashboard

1. Log in to PayFast dashboard
2. Go to **Transactions** → **History**
3. Find your transaction
4. Click to view ITN logs
5. Check for delivery errors

#### Verify Firestore Data

```javascript
// In browser console (when logged in)
const db = firebase.firestore();
db.collection('transactions').doc('PAYMENT_ID').get()
  .then(doc => console.log(doc.data()));
```

---

## FAQ

### Q: Can I use PayFast outside South Africa?

A: PayFast primarily serves South African merchants and customers. International transactions may have limitations.

### Q: What currencies does PayFast support?

A: PayFast only supports South African Rand (ZAR).

### Q: How long does it take for payments to reflect?

A: Card payments are instant. EFT payments can take 1-3 business days.

### Q: Are there transaction fees?

A: Yes, PayFast charges:
- 2.9% + R2.00 for South African cards
- 4.9% for international cards
- EFT fees vary

### Q: Can I test without a PayFast account?

A: Yes! Use the sandbox credentials provided in this guide.

### Q: How do I handle refunds?

A: Refunds must be processed manually through the PayFast dashboard. There's no API for refunds.

### Q: Can users pay without leaving my site?

A: No, PayFast requires redirect to their payment page. This is a PCI compliance requirement.

### Q: How secure is PayFast?

A: PayFast is PCI DSS Level 1 compliant, the highest security standard for payment processors.

### Q: What happens if the user closes the browser during payment?

A: The ITN will still be sent to your server when payment completes. The user can check their payment status in their account.

### Q: Can I customize the PayFast payment page?

A: Limited customization is available through the PayFast dashboard. You can add your logo and choose colors.

---

## Additional Resources

### Official Documentation
- [PayFast Developer Docs](https://developers.payfast.co.za/)
- [PayFast Integration Guide](https://developers.payfast.co.za/docs#checkout_page)
- [PayFast API Reference](https://developers.payfast.co.za/docs#api)

### Support
- **PayFast Support**: support@payfast.co.za
- **PayFast Phone**: 087 820 7019
- **Application Issues**: [GitHub Issues](https://github.com/SindyMl/-div-elopers/issues)

### Helpful Links
- [PayFast Sandbox](https://sandbox.payfast.co.za/)
- [PayFast Dashboard](https://www.payfast.co.za/login)
- [PayFast Status Page](https://status.payfast.co.za/)

---

## Migration Checklist

If migrating from Yoco to PayFast:

- [ ] Create PayFast account
- [ ] Get PayFast credentials
- [ ] Update `.env` file with PayFast credentials
- [ ] Test in sandbox environment
- [ ] Update webhook URLs
- [ ] Create return/cancel pages
- [ ] Test full payment flow
- [ ] Update documentation
- [ ] Train support team on new flow
- [ ] Deploy to production
- [ ] Test production payment
- [ ] Monitor for issues
- [ ] Remove Yoco integration (when ready)

---

**Last Updated**: May 9, 2026
**Version**: 1.0.0
