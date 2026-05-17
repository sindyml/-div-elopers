/**
 * frontend/js/paymentService.js
 *
 * Unified service for interacting with the backend PayFast payment API.
 * Replaces the mock implementation.
 */

import { auth } from './firebase-config.js';

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

  const response = await fetch('/api/payments/initiate', {
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
 * Get the status of a payment.
 *
 * @param {string} paymentId
 * @returns {Promise<Object>} The payment status data
 */
export async function getPaymentStatus(paymentId) {
  const token = await getAuthToken();

  const response = await fetch(`/api/payments/status/${paymentId}`, {
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

  const response = await fetch('/api/payments/verify', {
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
