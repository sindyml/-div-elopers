/**
 * frontend/js/disputeService.js
 *
 * Service for interacting with the backend dispute API.
 */

import { auth } from './firebase-config.js';

/**
 * Get Firebase ID token for the current user.
 */
async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) return '';
  try {
    return await user.getIdToken();
  } catch (err) {
    console.error('[disputeService] Error getting auth token:', err);
    return '';
  }
}

/**
 * Approve a member's dispute.
 *
 * @param {string} disputeId
 * @param {string} contributionId
 * @returns {Promise<Object>} The approval result
 */
export async function approveDispute(disputeId, contributionId) {
  const token = await getAuthToken();

  const response = await fetch('/api/disputes/approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ disputeId, contributionId })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to approve dispute');
  }

  return await response.json();
}
