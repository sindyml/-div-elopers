# Payment API Documentation

## Overview
This API handles payment processing using PayFast payment gateway for South African Rand (ZAR) transactions.

## Base URL
`https://api.yourdomain.com/api/payments`

## Authentication
All endpoints (except webhook/ITN) require Bearer token authentication:
`Authorization: Bearer <firebase-id-token>`

## Payment Flow

### PayFast Integration Flow
1. **Frontend** calls `POST /initiate` to create a payment
2. **Backend** generates PayFast payment data with MD5 signature
3. **Frontend** receives payment data and redirects user to PayFast
4. **User** completes payment on PayFast website
5. **PayFast** sends ITN (Instant Transaction Notification) to `POST /notify`
6. **PayFast** redirects user back to return URL or cancel URL
7. **Frontend** polls `GET /status/:paymentId` to verify payment status

## Endpoints

### 1. Initiate Payment
**POST** `/initiate`

Creates a new payment session and generates PayFast payment data for redirect.

**Request Body:**
```json
{
  "amount": 99.99,
  "contributionId": "optional_contribution_id",
  "groupId": "group_id",
  "groupName": "Evergreen Stokvel",
  "userEmail": "user@example.com",
  "userName": "John Doe",
  "metadata": {
    "paymentMethod": "card",
    "description": "Optional metadata"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "paymentId": "abc123",
  "paymentData": {
    "merchant_id": "10000100",
    "merchant_key": "46f0cd694581a",
    "return_url": "https://yourdomain.com/payment-return.html?paymentId=abc123",
    "cancel_url": "https://yourdomain.com/payment-cancel.html?paymentId=abc123",
    "notify_url": "https://yourdomain.com/api/payments/notify",
    "name_first": "John",
    "name_last": "Doe",
    "email_address": "user@example.com",
    "m_payment_id": "abc123",
    "amount": "99.99",
    "item_name": "Evergreen Stokvel - Contribution",
    "item_description": "Contribution ID: contrib123",
    "custom_str1": "user_id",
    "signature": "a1b2c3d4e5f6...",
    "paymentUrl": "https://sandbox.payfast.co.za/eng/process"
  },
  "message": "Payment initiated. Redirect user to PayFast."
}
```

**Frontend Implementation:**
```javascript
// Redirect to PayFast by submitting a form
const form = document.createElement('form');
form.method = 'POST';
form.action = paymentData.paymentUrl;

for (let key in paymentData) {
  if (key !== 'paymentUrl') {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = paymentData[key];
    form.appendChild(input);
  }
}

document.body.appendChild(form);
form.submit();
```

---

### 2. ITN Webhook (Instant Transaction Notification)
**POST** `/notify`

Receives payment status updates from PayFast. This endpoint is called by PayFast servers.

**Request Body (from PayFast):**
```
m_payment_id=abc123
pf_payment_id=1234567
payment_status=COMPLETE
item_name=Evergreen+Stokvel+-+Contribution
amount_gross=99.99
amount_fee=2.30
amount_net=97.69
custom_str1=user_id
signature=a1b2c3d4e5f6...
```

**Response:**
```json
{
  "received": true
}
```

**Important Notes:**
- This endpoint must be publicly accessible (no localhost)
- Must return 200 OK response
- PayFast will retry if response is not 200
- Backend verifies signature and validates with PayFast server
- Updates payment status in Firestore automatically

---

### 3. Get Payment Status
**GET** `/status/:paymentId`

Check the current status of a payment.

**Response:**
```json
{
  "paymentId": "abc123",
  "status": "completed",
  "amount": 99.99,
  "currency": "ZAR",
  "createdAt": "2026-05-09T10:00:00Z",
  "payfastPaymentId": "1234567",
  "transactionId": "1234567"
}
```

**Payment Statuses:**
- `pending` - Payment initiated but not yet completed
- `completed` - Payment successful
- `failed` - Payment failed
- `cancelled` - User cancelled payment

---

### 4. Verify Payment
**POST** `/verify`

Verify payment completion status.

**Request Body:**
```json
{
  "paymentId": "abc123"
}
```

**Response:**
```json
{
  "success": true,
  "status": "completed",
  "paymentId": "abc123",
  "payfastPaymentId": "1234567"
}
```

---

### 5. Payment History
**GET** `/history/:userId?limit=50&status=completed`

Get payment history for a user.

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 50, max: 100)
- `status` (optional): Filter by status (pending, completed, failed, cancelled)

**Response:**
```json
{
  "payments": [
    {
      "id": "abc123",
      "amount": 99.99,
      "currency": "ZAR",
      "status": "completed",
      "createdAt": "2026-05-09T10:00:00Z",
      "payfastPaymentId": "1234567"
    }
  ],
  "count": 1
}
```

---

### 6. Return Handler
**GET** `/return?paymentId=abc123`

Handles user return from PayFast after payment completion.

**Response:**
```json
{
  "message": "Payment return acknowledged. Check payment status.",
  "note": "Frontend should poll /status endpoint to verify payment"
}
```

---

### 7. Cancel Handler
**GET** `/cancel?paymentId=abc123`

Handles payment cancellation.

**Response:**
```json
{
  "message": "Payment cancelled",
  "paymentId": "abc123"
}
```

---

### 8. Test Endpoint
**GET** `/test`

Check if the API is running.

**Response:**
```json
{
  "message": "PayFast Payment API is working!",
  "timestamp": "2026-05-09T10:00:00Z",
  "provider": "PayFast",
  "endpoints": [
    "POST /initiate",
    "POST /notify (ITN)",
    "GET /return",
    "GET /cancel",
    "GET /status/:paymentId",
    "POST /verify",
    "GET /history/:userId"
  ]
}
```

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": "Error message description"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (missing or invalid auth token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

---

## PayFast Configuration

### Environment Variables
```env
PAYFAST_MERCHANT_ID=10000100
PAYFAST_MERCHANT_KEY=46f0cd694581a
PAYFAST_PASSPHRASE=your_passphrase
NODE_ENV=development  # or 'production'
BASE_URL=https://yourdomain.com
```

### Sandbox vs Production

**Sandbox (Testing):**
- Merchant ID: `10000100`
- Merchant Key: `46f0cd694581a`
- URL: `https://sandbox.payfast.co.za/eng/process`
- Use test card: 4000 0000 0000 0002

**Production:**
- Get credentials from PayFast dashboard
- URL: `https://www.payfast.co.za/eng/process`
- Set `NODE_ENV=production`

### Required URLs
All URLs must be publicly accessible (HTTPS in production):
- **Return URL**: Where user returns after successful payment
- **Cancel URL**: Where user returns after cancelling
- **Notify URL**: Where PayFast sends ITN (webhook)

---

## Security

### Signature Verification
All PayFast requests include an MD5 signature that must be verified:

1. Concatenate all parameters (except signature) in alphabetical order
2. Add passphrase to the end
3. Generate MD5 hash
4. Compare with received signature using timing-safe comparison

### ITN Validation
1. Verify signature
2. Validate with PayFast server
3. Verify amount matches expected amount
4. Check payment status

### Best Practices
- Always use HTTPS in production
- Never expose passphrase to frontend
- Store passphrase securely in environment variables
- Validate all incoming webhook data
- Use timing-safe comparison for signatures
- Log all ITN notifications for auditing

---

## Testing

### Test Card Numbers (Sandbox)
- **Success**: 4000 0000 0000 0002
- **Decline**: 4000 0000 0000 0010

### Manual Testing
1. Set `NODE_ENV=development`
2. Use sandbox credentials
3. Initiate payment from frontend
4. Complete payment on PayFast sandbox
5. Verify ITN received and processed
6. Check payment status updated

### Automated Testing
See `tests/payment.test.js` for integration tests.

---

## Migration from Yoco

### Key Differences
1. **Flow**: Token-based (Yoco) → Redirect-based (PayFast)
2. **Integration**: Direct API → Form POST redirect
3. **Webhooks**: Yoco webhooks → PayFast ITN
4. **Signature**: HMAC-SHA256 → MD5

### Migration Steps
1. Update environment variables (`.env`)
2. Replace `paymentService.js` with `payfastService.js`
3. Update frontend to redirect to PayFast
4. Create return/cancel pages
5. Update webhook handler for ITN
6. Test thoroughly in sandbox

---

## Support

For PayFast-specific issues:
- Documentation: https://developers.payfast.co.za/
- Support: https://www.payfast.co.za/contact

For application issues:
- GitHub Issues: https://github.com/SindyMl/-div-elopers/issues
