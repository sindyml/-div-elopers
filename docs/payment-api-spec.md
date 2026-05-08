# Payment API Specification

Backend payment API powered by the Yoco payment gateway.

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Firestore Schema](#firestore-schema)
4. [Endpoints](#endpoints)
   - [POST /api/payments/initiate](#post-apipaymentsintiate)
   - [POST /api/payments/webhook](#post-apipaymentswebhook)
   - [GET /api/payments/status/:paymentId](#get-apipaymentsstatuspaymentid)
   - [POST /api/payments/verify](#post-apipaymentsverify)
   - [GET /api/payments/history/:userId](#get-apipaymentshistoryuserid)
5. [Error Codes](#error-codes)
6. [Webhook Events](#webhook-events)
7. [Environment Variables](#environment-variables)

---

## Overview

All payment processing is handled server-side via the Yoco API. The client collects a payment token using the Yoco.js SDK and passes it to the backend, which creates the charge and records the transaction in Firestore.

**Base URL:** `/api/payments`

**Content-Type:** `application/json`

---

## Authentication

All endpoints except `/webhook` require a valid Firebase ID token in the `Authorization` header:

```
Authorization: Bearer <firebase-id-token>
```

The webhook endpoint uses HMAC-SHA256 signature verification via the `yoco-signature` and `yoco-timestamp` headers.

---

## Firestore Schema

### `transactions` collection

| Field | Type | Description |
|---|---|---|
| `id` | string | Document ID (auto-generated) |
| `userId` | string | Firebase UID of the paying user |
| `contributionId` | string \| null | Linked contribution document ID |
| `amount` | number | Payment amount in ZAR (rands) |
| `currency` | string | Currency code (default: `ZAR`) |
| `status` | string | `pending` \| `successful` \| `failed` \| `refunded` |
| `type` | string | Transaction type (e.g. `payment`) |
| `chargeId` | string | Yoco charge ID |
| `yocoResponse` | object | Raw Yoco API response |
| `errorMessage` | string | Error message if failed |
| `failureReason` | string | Yoco failure reason code |
| `metadata` | object | Additional key-value metadata |
| `createdAt` | Timestamp | Server timestamp when created |
| `updatedAt` | Timestamp | Server timestamp when last updated |
| `verifiedAt` | Timestamp | Timestamp when verified |
| `refundedAt` | Timestamp | Timestamp when refunded |

### `transactions/{transactionId}/paymentProofs` subcollection

| Field | Type | Description |
|---|---|---|
| `chargeId` | string | Yoco charge ID |
| `status` | string | `successful` |
| `amount` | number | Amount in ZAR |
| `currency` | string | Currency code |
| `receiptUrl` | string \| null | Yoco receipt URL |
| `paymentMethod` | object | Payment method details from Yoco |
| `createdAt` | Timestamp | Server timestamp |

### `webhookEvents` collection

| Field | Type | Description |
|---|---|---|
| `type` | string | Yoco event type (e.g. `charge.succeeded`) |
| `chargeId` | string | Yoco charge ID |
| `data` | object | Full raw webhook payload |
| `receivedAt` | Timestamp | When the webhook was received |
| `processed` | boolean | Whether the event was processed |
| `processedAt` | Timestamp | When the event was processed |

### Compound Indexes Required

The following composite indexes are needed for the `transactions` collection:

| Collection | Fields | Order |
|---|---|---|
| `transactions` | `userId` ASC, `createdAt` DESC | For history queries |
| `transactions` | `userId` ASC, `status` ASC, `createdAt` DESC | For filtered history |
| `transactions` | `chargeId` ASC | For webhook lookups |
| `webhookEvents` | `chargeId` ASC, `type` ASC, `receivedAt` DESC | For deduplication |

---

## Endpoints

### POST /api/payments/initiate

Creates a Yoco charge and records a pending transaction in Firestore.

**Authentication:** Required

**Request Body:**

```json
{
  "amount": 300,
  "currency": "ZAR",
  "token": "tok_XXXXXXXX",
  "contributionId": "abc123",
  "metadata": {
    "groupId": "group_xyz"
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | number | Yes | Amount in ZAR (e.g. `300` for R300) |
| `currency` | string | No | Currency code, defaults to `ZAR` |
| `token` | string | Yes | Yoco payment token from Yoco.js popup |
| `contributionId` | string | No | ID of the contribution being paid |
| `metadata` | object | No | Additional metadata to store |

**Success Response (200):**

```json
{
  "success": true,
  "paymentId": "firestoreDocId",
  "chargeId": "charge_XXXXXXXX",
  "status": "successful",
  "redirectUrl": null
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": "Card declined",
  "paymentId": "firestoreDocId"
}
```

---

### POST /api/payments/webhook

Receives and processes Yoco webhook events.

**Authentication:** HMAC-SHA256 signature verification (no Firebase token required)

**Headers:**

| Header | Description |
|---|---|
| `yoco-signature` | HMAC-SHA256 signature of the payload |
| `yoco-timestamp` | Unix timestamp when the event was sent |

**Handled Event Types:**

| Event | Action |
|---|---|
| `charge.succeeded` | Updates transaction to `successful`, creates paymentProof, updates linked contribution |
| `charge.failed` | Updates transaction to `failed`, records failure reason |
| `charge.refunded` | Updates transaction to `refunded` |

**Success Response (200):**

```json
{ "received": true }
```

**Error Response (401):**

```json
{ "error": "Invalid signature" }
```

---

### GET /api/payments/status/:paymentId

Returns the current status of a payment. If the transaction is still `pending`, the latest status is fetched live from Yoco.

**Authentication:** Required (user can only query their own payments; Admins can query any)

**URL Parameters:**

| Parameter | Description |
|---|---|
| `paymentId` | The Firestore transaction document ID |

**Success Response (200):**

```json
{
  "paymentId": "firestoreDocId",
  "status": "successful",
  "amount": 300,
  "currency": "ZAR",
  "createdAt": "...",
  "chargeId": "charge_XXXXXXXX"
}
```

**Error Responses:**

- `404` – Payment not found
- `403` – Unauthorized (not the owner and not Admin)

---

### POST /api/payments/verify

Verifies a payment's completion by confirming the status with Yoco. If the charge is successful but the local record still shows pending, the record is updated and post-payment actions are triggered.

**Authentication:** Required

**Request Body:**

```json
{
  "paymentId": "firestoreDocId",
  "chargeId": "charge_XXXXXXXX"
}
```

Either `paymentId` or `chargeId` must be provided.

**Success Response (200):**

```json
{
  "success": true,
  "status": "successful",
  "paymentId": "firestoreDocId",
  "chargeId": "charge_XXXXXXXX"
}
```

**Error Responses:**

- `400` – Neither `paymentId` nor `chargeId` provided
- `404` – Payment not found
- `403` – Unauthorized
- `500` – Yoco status check failed

---

### GET /api/payments/history/:userId

Returns a paginated list of a user's transactions.

**Authentication:** Required (user can only query their own history; Admins can query any)

**URL Parameters:**

| Parameter | Description |
|---|---|
| `userId` | Firebase UID of the user |

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | number | `50` | Maximum results per page |
| `startAfter` | string | — | Firestore document ID to paginate from |
| `status` | string | — | Filter by status (`pending`, `successful`, `failed`, `refunded`) |

**Success Response (200):**

```json
{
  "payments": [
    {
      "id": "firestoreDocId",
      "amount": 300,
      "currency": "ZAR",
      "status": "successful",
      "type": "payment",
      "contributionId": "abc123",
      "createdAt": "...",
      "chargeId": "charge_XXXXXXXX",
      "metadata": {}
    }
  ],
  "pagination": {
    "limit": 50,
    "nextStartAfter": "nextDocId",
    "hasMore": false
  }
}
```

**Error Responses:**

- `403` – Unauthorized

---

## Error Codes

| HTTP Status | Meaning |
|---|---|
| `400` | Bad request – invalid or missing parameters |
| `401` | Unauthorized – invalid webhook signature |
| `403` | Forbidden – authenticated but not authorised to access this resource |
| `404` | Not found – payment or resource does not exist |
| `500` | Internal server error |

---

## Webhook Events

Configure Yoco to send webhook events to:

```
POST https://<your-domain>/api/payments/webhook
```

Set the webhook secret in your Yoco dashboard and export it as `YOCO_WEBHOOK_SECRET`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `YOCO_SECRET_KEY` | Yoco secret API key (use `sk_test_...` for sandbox) |
| `YOCO_WEBHOOK_SECRET` | Yoco webhook signing secret |
| `NODE_ENV` | `production` uses live Yoco endpoint; anything else uses sandbox |

See `.env.example` for a full list of required environment variables.
