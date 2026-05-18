/**
 * frontend/js/paymentService.js
 *
 * Unified service for interacting with the backend PayFast payment API.
 * Replaces the mock implementation.
 */

import { auth } from './firebase-config.js';

// ✅ ADD THIS LINE - Your Render backend URL
const API_BASE_URL = 'https://div-elopers.onrender.com';

/**
 * Get Firebase ID token for the current user.
 * @returns {Promise<string>}
 */
async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) return '';
  try {
    return await user.getIdToken();
  } catch (err) {
    console.error('[paymentService] Error getting auth token:', err);
    return '';
  }
}

/**
 * Initiate a payment with the backend.
 *
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} params.contributionId
 * @param {string} params.groupId
 * @param {string} params.groupName
 * @param {string} [params.userEmail]
 * @param {string} [params.userName]
 * @param {Object} [params.metadata]
 * @returns {Promise<Object>} The payment initiation result including paymentData and paymentId
 */
export async function initiatePayment({
  amount,
  contributionId,
  groupId,
  groupName,
  userEmail,
  userName,
  metadata = {}
}) {
  const token = await getAuthToken();

  // ✅ CHANGE THIS: Add API_BASE_URL
  const response = await fetch(`${API_BASE_URL}/api/payments/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      amount,
      contributionId,
      groupId,
      groupName,
      userEmail,
      userName,
      metadata
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to initiate payment');
  }

  return await response.json();
}

/**
 * Disburse a payout to a member (Treasurer/Admin only).
 *
 * @param {Object} params
 * @param {string} params.groupId
 * @param {string} params.memberId
 * @param {number} params.amount
 * @param {string} params.reference
 * @returns {Promise<Object>} The disbursement result
 */
export async function disbursePayout({
  groupId,
  memberId,
  amount,
  reference
}) {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/api/payouts/disburse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      groupId,
      memberId,
      amount,
      reference
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to disburse payout');
  }

  return await response.json();
}

/**
 * Get the status of a payment.
 *
 * @param {string} paymentId
 * @returns {Promise<Object>} The payment status data
 */
export async function getPaymentStatus(paymentId) {
  const token = await getAuthToken();

  // ✅ CHANGE THIS: Add API_BASE_URL
  const response = await fetch(`${API_BASE_URL}/api/payments/status/${paymentId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to get payment status');
  }

  return await response.json();
}

/**
 * Verify a payment (usually called on the return page).
 *
 * @param {string} paymentId
 * @returns {Promise<Object>} Verification result
 */
export async function verifyPayment(paymentId) {
  const token = await getAuthToken();

  // ✅ CHANGE THIS: Add API_BASE_URL
  const response = await fetch(`${API_BASE_URL}/api/payments/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ paymentId })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to verify payment');
  }

  return await response.json();
}
