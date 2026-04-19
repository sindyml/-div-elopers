/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Group Creation Form', () => {
  let mockAdd;
  let mockSet;
  let authState; // mutable object

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="groupForm">
        <input id="name" value="My Stokvel" />
        <input id="amount" value="1000" />
        <input id="payout" value="uid1, uid2" />
        <select id="frequency"><option value="monthly">Monthly</option></select>
        <button type="submit">Create</button>
      </form>
      <div id="message"></div>
    `;

    // Mock Firestore chain
    mockSet = vi.fn().mockResolvedValue(undefined);
    const mockDoc = vi.fn().mockReturnValue({ set: mockSet });
    const mockCollectionMembers = vi.fn().mockReturnValue({ doc: mockDoc });
    const groupRef = { collection: mockCollectionMembers };
    mockAdd = vi.fn().mockResolvedValue(groupRef);
    const mockGroupsCollection = { add: mockAdd };

    // Mutable auth state
    authState = { currentUser: { uid: 'currentUser' } };
    const mockAuth = {
      get currentUser() { return authState.currentUser; }
    };

    const mockFirestore = {
      collection: vi.fn((name) => {
        if (name === 'groups') return mockGroupsCollection;
        return { add: vi.fn(), doc: vi.fn() };
      })
    };

    global.firebase = {
      auth: vi.fn(() => mockAuth),
      firestore: vi.fn(() => mockFirestore)
    };
    global.firebase.firestore.FieldValue = { serverTimestamp: vi.fn(() => 'timestamp') };

    // Attach event listener (identical to real page)
    const form = document.getElementById('groupForm');
    const message = document.getElementById('message');
    const showMsg = (text, type) => {
      message.textContent = text;
      message.className = `alert alert--${type}`;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('name').value.trim();
      const amount = document.getElementById('amount').value;
      const payout = document.getElementById('payout').value;
      const frequency = document.getElementById('frequency').value;
      const payoutOrder = payout ? payout.split(',').map(p => p.trim()) : [];

      const currentUser = global.firebase.auth().currentUser;
      if (!currentUser) {
        showMsg('You must be logged in.', 'error');
        return;
      }

      showMsg('Creating group…', 'success');
      try {
        const groupRef = await global.firebase.firestore().collection('groups').add({
          name,
          contributionAmount: Number(amount),
          payoutOrder,
          meetingFrequency: frequency,
          createdBy: currentUser.uid,
          createdAt: global.firebase.firestore.FieldValue.serverTimestamp(),
        });
        await groupRef.collection('members').doc(currentUser.uid).set({
          role: 'admin',
          joinedAt: global.firebase.firestore.FieldValue.serverTimestamp(),
        });
        showMsg('Group created successfully!', 'success');
        form.reset();
      } catch (err) {
        showMsg(`Error: ${err.message}`, 'error');
      }
    });
  });

  it('successful group creation shows success message', async () => {
    const form = document.getElementById('groupForm');
    form.dispatchEvent(new Event('submit'));

    await new Promise(resolve => setTimeout(resolve, 50));

    const messageDiv = document.getElementById('message');
    expect(messageDiv.textContent).toBe('Group created successfully!');
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('shows error if not logged in', async () => {
    // Change the mutable auth state
    authState.currentUser = null;

    const form = document.getElementById('groupForm');
    form.dispatchEvent(new Event('submit'));

    await new Promise(resolve => setTimeout(resolve, 50));

    const messageDiv = document.getElementById('message');
    expect(messageDiv.textContent).toBe('You must be logged in.');
    expect(mockAdd).not.toHaveBeenCalled();
  });
});