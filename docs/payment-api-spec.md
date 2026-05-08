# Payment API Documentation

## Overview
This API handles payment processing using Yoco payment gateway.

## Base URL
`https://api.yourdomain.com/api/payments`

## Authentication
All endpoints (except webhook) require Bearer token authentication:
`Authorization: Bearer <firebase-id-token>`

## Endpoints

### 1. Initiate Payment
**POST** `/initiate`

Creates a new payment session and processes the charge.

**Request Body:**
```json
{
  "amount": 99.99,
  "currency": "ZAR",
  "token": "yoco_payment_token",
  "contributionId": "optional_contribution_id",
  "metadata": {
    "description": "Optional metadata",
    "customerEmail": "user@example.com"
  }
}