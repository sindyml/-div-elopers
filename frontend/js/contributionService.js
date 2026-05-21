/**
 * frontend/js/contributionService.js
 *
 * Service for interacting with the backend contribution API.
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
    console.error('[contributionService] Error getting auth token:', err);
    return '';
  }
}

/**
 * Confirm a member's contribution.
 *
 * @param {string} contributionId
 * @returns {Promise<Object>} The confirmation result
 */
export async function confirmContribution(contributionId) {
  const token = await getAuthToken();

  const response = await fetch('/api/contributions/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ contributionId })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to confirm contribution');
  }

  return await response.json();
}
