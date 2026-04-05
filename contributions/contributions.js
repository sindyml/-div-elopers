// contributions/contributions.js
import { auth, db } from '../js/firebase-config.js';

// ============================================================
// HELPER FUNCTIONS (using P1/P2's users table)
// ============================================================

// Get currently logged-in user's ID
// Uses: auth.currentUser.uid from Firebase Auth
function getCurrentUserId() {
    const currentUser = auth.currentUser;
    return currentUser ? currentUser.uid : null;
}

// Get currently logged-in user's role (Member/Treasurer/Admin)
// Reads from: users table (created by P1/P2)
// Expects: users table has a field called 'role'
async function getCurrentUserRole() {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return null;
    
    // Reading from P1/P2's 'users' table using the 'uid' field they created
    const userDocument = await db.collection('users').doc(currentUserId).get();
    if (!userDocument.exists) return null;
    
    // Returns the 'role' field from users table
    return userDocument.data().role;
}

// ============================================================
// CONTRIBUTIONS TABLE FUNCTIONS (YOU CREATE THIS TABLE)
// ============================================================
// TABLE NAME: 'contributions'
// FIELDS YOU NEED TO CREATE:
//   - userId (string) - the user's uid from auth
//   - groupId (string) - which stokvel group this payment belongs to
//   - amount (number) - how much was paid in Rands
//   - date (string) - when the payment was made (YYYY-MM-DD)
//   - status (string) - 'confirmed' or 'missed'
//   - confirmedAt (timestamp) - when treasurer confirmed it (optional)
//   - confirmedBy (string) - treasurer's uid who confirmed it (optional)
// ============================================================

// Get all contributions for a specific member (for Member view)
// Uses YOUR 'contributions' table
// Expects: contributions table has fields: userId, amount, date, status
async function getContributionsByMember(userId) {
    const contributionsSnapshot = await db.collection('contributions')
        .where('userId', '==', userId)  // 'userId' is YOUR field name
        .orderBy('date', 'desc')
        .get();
    
    return contributionsSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));
}

// Get all contributions for a group (for Treasurer view)
// Uses YOUR 'contributions' table
// Expects: contributions table has fields: groupId, userId, amount, date, status
async function getContributionsByGroup(groupId) {
    const contributionsSnapshot = await db.collection('contributions')
        .where('groupId', '==', groupId)  // 'groupId' is YOUR field name
        .orderBy('date', 'desc')
        .get();
    
    return contributionsSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));
}

// Update a contribution's status (Treasurer confirms or marks missed)
// Updates YOUR 'contributions' table
// Expects: contributions table has a field called 'status'
async function updateContributionStatus(contributionId, newStatus) {
    await db.collection('contributions').doc(contributionId).update({
        status: newStatus,  // 'status' is YOUR field name
        confirmedAt: new Date()  // optional field you can add
    });
}

// ============================================================
// === NEW: REAL-TIME LISTENER FUNCTIONS (added for live updates without page refresh) ===
// ============================================================

// Real-time listener for Member view (updates automatically when data changes)
// Uses YOUR 'contributions' table
// Parameters:
//   - userId: the member's uid
//   - onUpdateCallback: function that runs every time data changes (receives contributions array)
// Returns: unsubscribe function (call this to stop listening when page closes)
function listenToMemberContributions(userId, onUpdateCallback) {
    const unsubscribe = db.collection('contributions')
        .where('userId', '==', userId)  // 'userId' is YOUR field name
        .orderBy('date', 'desc')
        .onSnapshot((snapshot) => {
            const contributions = snapshot.docs.map(document => ({
                id: document.id,
                ...document.data()
            }));
            onUpdateCallback(contributions);
        });
    
    return unsubscribe; // Call this to stop listening when page closes
}

// Real-time listener for Treasurer view (updates when status changes)
// Uses YOUR 'contributions' table
// Parameters:
//   - groupId: the stokvel group ID
//   - onUpdateCallback: function that runs every time data changes (receives contributions array)
// Returns: unsubscribe function (call this to stop listening when page closes)
function listenToGroupContributions(groupId, onUpdateCallback) {
    const unsubscribe = db.collection('contributions')
        .where('groupId', '==', groupId)  // 'groupId' is YOUR field name
        .orderBy('date', 'desc')
        .onSnapshot((snapshot) => {
            const contributions = snapshot.docs.map(document => ({
                id: document.id,
                ...document.data()
            }));
            onUpdateCallback(contributions);
        });
    
    return unsubscribe;
}

// ============================================================
// PAYOUTS TABLE FUNCTIONS (YOU CREATE THIS TABLE)
// ============================================================
// TABLE NAME: 'payouts'
// FIELDS YOU NEED TO CREATE:
//   - groupId (string) - which stokvel group this payout belongs to
//   - userId (string) - the user's uid who gets paid
//   - userDisplayName (string) - member's name for display
//   - payoutDate (string) - when they get paid (YYYY-MM-DD)
//   - order (number) - position in line (1, 2, 3...)
//   - amount (number) - how much they get paid
// ============================================================

// Get payout schedule for a group
// Uses YOUR 'payouts' table
// Expects: payouts table has fields: groupId, order, userDisplayName, payoutDate, amount
async function getPayoutSchedule(groupId) {
    const payoutsSnapshot = await db.collection('payouts')
        .where('groupId', '==', groupId)  // 'groupId' is YOUR field name
        .orderBy('order', 'asc')  // 'order' is YOUR field name
        .get();
    
    return payoutsSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));
}

// ============================================================
// EXPORTS
// ============================================================

export {
    getCurrentUserId,
    getCurrentUserRole,
    getContributionsByMember,
    getContributionsByGroup,
    updateContributionStatus,
    getPayoutSchedule,
    // === NEW: real-time listener exports ===
    listenToMemberContributions,
    listenToGroupContributions
};