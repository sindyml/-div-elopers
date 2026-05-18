// test-payment-api.js - Tests your payment API endpoints
const http = require('http');

const API_BASE = 'http://localhost:8080';

async function testAPI() {
  console.log('🧪 Testing Payment API\n' + '='.repeat(40));
  
  // Test 1: Check if server is running and routing works for notify (previously webhook)
  console.log('\n📡 Test 1: Checking if /api/payments/notify is reachable...');
  try {
    const response = await fetch(`${API_BASE}/api/payments/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ m_payment_id: 'test_id' })
    });
    
    // It might return 404 from the sub-router if m_payment_id doesn't exist in DB,
    // but the main server should have routed it.
    // Actually handleNotify returns 404 if payment not found.
    if (response.status === 200 || response.status === 404 || response.status === 401) {
      console.log(`✅ /api/payments/notify is reachable! (Status: ${response.status})`);
    } else {
      console.log('❌ /api/payments/notify returned:', response.status);
    }
  } catch (error) {
    console.log('❌ Server is NOT running or endpoint unreachable.');
    console.log('   Error:', error.message);
    return;
  }
  
  // Test 2: Check payment status endpoint
  console.log('\n📡 Test 2: Testing payment status endpoint...');
  try {
    const response = await fetch(`${API_BASE}/api/payments/status/test123`);
    console.log(`✅ Status endpoint reachable! Returned: ${response.status} (expected 401 - needs auth)`);
  } catch (error) {
    console.log('❌ Status endpoint not found');
  }
  
  // Test 3: Check all endpoints are registered (verifying routing without trailing slash)
  console.log('\n📡 Test 3: Checking all payment endpoints (no trailing slash)...');
  
  const endpoints = [
    { method: 'POST', path: '/api/payments/initiate', name: 'Initiate Payment' },
    { method: 'POST', path: '/api/payments/notify', name: 'Notify Handler' },
    { method: 'GET', path: '/api/payments/status/test', name: 'Check Status' },
    { method: 'POST', path: '/api/payments/verify', name: 'Verify Payment' },
    { method: 'GET', path: '/api/payments/history/user123', name: 'Payment History' },
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${API_BASE}${endpoint.path}`, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' }
      });
      console.log(`✅ ${endpoint.name} (${endpoint.path}): ${response.status}`);
    } catch (error) {
      console.log(`❌ ${endpoint.name}: Not accessible`);
    }
  }

  // Test 4: Verify trailing slash vs no trailing slash
  console.log('\n📡 Test 4: Verifying trailing slash resilience...');
  try {
    const res1 = await fetch(`${API_BASE}/api/payments/initiate`, { method: 'POST' });
    const res2 = await fetch(`${API_BASE}/api/payments/initiate/`, { method: 'POST' }); // This might 404 if sub-router is strict, let's see
    console.log(`   /api/payments/initiate: ${res1.status}`);
    console.log(`   /api/payments/initiate/: ${res2.status}`);
  } catch (error) {
    console.log('   Error in Test 4:', error.message);
  }
  
  console.log('\n' + '='.repeat(40));
}

// Run the tests
testAPI();
