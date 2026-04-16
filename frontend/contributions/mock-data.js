// contributions/mock-data.js
// Mock data for testing without Firebase

export const mockData = {
    // Current logged-in user (change these to test different scenarios)
    currentUserId: "user_123",
    currentUserRole: "Member",  // Change to "Member" or "Admin" to test different roles
    
    // Mapping from userId to display name
    memberNames: {
        "user_123": "Thabo",
        "user_106": "Amina",
        "user_345": "Belinda",
        "treasurer_001": "Treasurer One",
        "treasurer_002": "Treasurer Two"
    },
    
    // Mock groups (what Person 3 would provide)
    groups: [
        { id: "group_123", name: "Maponya Stokvel", members: ["user_123", "user_106"], treasurerId: "treasurer_001" },
        { id: "group_345", name: "Rise & Save", members: ["user_123", "user_345"], treasurerId: "treasurer_002" },
        { id: "group_456", name: "Unity Fund", members: ["user_123"], treasurerId: "treasurer_001" }
    ],
    
    // ============================================================
    // NEW: Members subcollection (for collectionGroup queries)
    // This matches Person 3's schema and works with the new contributions.js
    // ============================================================
    members: [
        { groupId: "group_123", uid: "user_123", role: "member", joinedAt: "2026-01-01" },
        { groupId: "group_123", uid: "user_106", role: "member", joinedAt: "2026-01-01" },
        { groupId: "group_123", uid: "treasurer_001", role: "treasurer", joinedAt: "2026-01-01" },
        { groupId: "group_345", uid: "user_123", role: "member", joinedAt: "2026-01-15" },
        { groupId: "group_345", uid: "user_345", role: "member", joinedAt: "2026-01-15" },
        { groupId: "group_345", uid: "treasurer_002", role: "treasurer", joinedAt: "2026-01-15" },
        { groupId: "group_456", uid: "user_123", role: "member", joinedAt: "2026-02-01" },
        { groupId: "group_456", uid: "treasurer_001", role: "treasurer", joinedAt: "2026-02-01" }
    ],
    
    // Mock contributions (your table)
    contributions: [
        { id: "contr_001", userId: "user_123", groupId: "group_123", amount: 200, date: "2026-04-01", status: "confirmed" },
        { id: "contr_002", userId: "user_123", groupId: "group_123", amount: 200, date: "2026-03-01", status: "confirmed" },
        { id: "contr_003", userId: "user_123", groupId: "group_123", amount: 200, date: "2026-02-01", status: "missed" },
        { id: "contr_004", userId: "user_123", groupId: "group_345", amount: 200, date: "2026-04-01", status: "pending" },
        { id: "contr_005", userId: "user_123", groupId: "group_456", amount: 200, date: "2026-04-01", status: "pending" },
        { id: "contr_006", userId: "user_106", groupId: "group_123", amount: 200, date: "2026-04-01", status: "pending" },
        { id: "contr_007", userId: "user_345", groupId: "group_345", amount: 200, date: "2026-04-01", status: "pending" }
    ],
    
    // Mock payouts (your table)
    payouts: [
        { id: "payout_001", groupId: "group_123", userId: "user_123", userDisplayName: "Thabo", payoutDate: "2026-05-01", order: 1, amount: 2400 },
        { id: "payout_002", groupId: "group_123", userId: "user_106", userDisplayName: "Amina", payoutDate: "2026-06-01", order: 2, amount: 2400 },
        { id: "payout_003", groupId: "group_345", userId: "user_123", userDisplayName: "Thabo", payoutDate: "2026-05-15", order: 1, amount: 2400 },
        { id: "payout_004", groupId: "group_345", userId: "user_345", userDisplayName: "Belinda", payoutDate: "2026-06-15", order: 2, amount: 2400 },
        { id: "payout_005", groupId: "group_456", userId: "user_123", userDisplayName: "Thabo", payoutDate: "2026-05-30", order: 1, amount: 2400 }
    ]
};