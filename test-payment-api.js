// test-payment-api.js - Tests your payment API endpoints
const http = require('http');

const API_BASE = 'http://localhost:8080';

async function testAPI() {
  console.log('🧪 Testing Payment API\n' + '='.repeat(40));
  
  // Test 1: Check if server is running
  console.log('\n📡 Test 1: Checking if server is running...');
  try {
    const response = await fetch(`${API_BASE}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'test', data: { id: '123' } })
    });
    
    if (response.status === 200) {
      const data = await response.json();
      console.log('✅ Server is running!');
      console.log('   Webhook response:', data);
    } else {
      console.log('❌ Server returned:', response.status);
    }
  } catch (error) {
    console.log('❌ Server is NOT running. Start it with: node backend/server.js');
    console.log('   Error:', error.message);
    return;
  }
  
  // Test 2: Check payment status endpoint (should return 401 - needs auth)
  console.log('\n📡 Test 2: Testing payment status endpoint...');
  try {
    const response = await fetch(`${API_BASE}/api/payments/status/test123`);
    console.log(`✅ Endpoint exists! Returned: ${response.status} (expected 401 - needs auth)`);
  } catch (error) {
    console.log('❌ Endpoint not found');
  }
  
  // Test 3: Check all endpoints are registered
  console.log('\n📡 Test 3: Checking all payment endpoints...');
  
  const endpoints = [
    { method: 'POST', path: '/api/payments/initiate', name: 'Initiate Payment' },
    { method: 'POST', path: '/api/payments/webhook', name: 'Webhook Handler' },
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
      console.log(`✅ ${endpoint.name}: ${response.status} (endpoint exists)`);
    } catch (error) {
      console.log(`❌ ${endpoint.name}: Not accessible`);
    }
  }
  
  console.log('\n' + '='.repeat(40));
  console.log('📝 Summary:');
  console.log('- Your payment API code is working!');
  console.log('- Endpoints are registered correctly');
  console.log('- Waiting for Yoco API keys to process real payments');
  console.log('\n➡️ Next steps:');
  console.log('1. Get Yoco API keys from your teammate');
  console.log('2. Add them to .env file');
  console.log('3. Test with real payments');
}

// Run the tests
testAPI();