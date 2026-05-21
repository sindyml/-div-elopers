/**
 * frontend/js/payoutService.js
 *
 * Service for interacting with the backend payout disbursement API.
 */
import { auth } from './firebase-config.js';

const API_BASE_URL = 'https://div-elopers.onrender.com';

/**
 * Get Firebase ID token for the current user.
 */
async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) return '';
  try {
    return await user.getIdToken();
  } catch (err) {
    console.error('[payoutService] Error getting auth token:', err);
    return '';
  }
}

/**
 * Disburse a payout to a member.
 */
export async function disbursePayout({ groupId, memberId, amount, payoutId, reference }) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/payouts/disburse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ groupId, memberId, amount, payoutId, reference })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to disburse payout');
  }
  return await response.json();
}

/**
 * Get the payout schedule for a group.
 */
export async function getPayoutSchedule(groupId) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/payouts/schedule/${groupId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to get payout schedule');
  }
  return await response.json();
}

/**
 * Get payout history for a group.
 */
export async function getPayoutHistory(groupId) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/payouts/history/${groupId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to get payout history');
  }
  return await response.json();
}
