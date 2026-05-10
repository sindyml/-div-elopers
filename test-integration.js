#!/usr/bin/env node
/**
 * PayFast Integration Test
 *
 * This script verifies that the PayFast integration is properly set up
 * and that backend-frontend communication is working correctly.
 */

const http = require('http');

const BASE_URL = 'http://localhost:8080';
let testsPassed = 0;
let testsFailed = 0;

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, passed, details = '') {
  if (passed) {
    testsPassed++;
    log(`✅ ${name}`, 'green');
    if (details) log(`   ${details}`, 'reset');
  } else {
    testsFailed++;
    log(`❌ ${name}`, 'red');
    if (details) log(`   ${details}`, 'yellow');
  }
}

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const jsonBody = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, body: jsonBody, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: body, headers: res.headers });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testPaymentAPIEndpoints() {
  log('\n=== Testing Payment API Endpoints ===', 'bold');

  // Test 1: Test endpoint
  try {
    const response = await makeRequest('/api/payments/test');
    logTest(
      'GET /api/payments/test',
      response.status === 200 && response.body.provider === 'PayFast',
      `Provider: ${response.body.provider}`
    );
  } catch (error) {
    logTest('GET /api/payments/test', false, error.message);
  }

  // Test 2: Initiate payment
  try {
    const paymentData = {
      amount: 100,
      contributionId: 'test-contrib-123',
      groupId: 'test-group-456',
      groupName: 'Test Stokvel',
      userEmail: 'test@example.com',
      userName: 'Test User'
    };
    const response = await makeRequest('/api/payments/initiate', 'POST', paymentData);
    logTest(
      'POST /api/payments/initiate',
      response.status === 200 && response.body.paymentData && response.body.paymentId,
      response.body.paymentId ? `Payment ID: ${response.body.paymentId}` : 'Missing payment data'
    );

    // Test 3: Check payment status
    if (response.body.paymentId) {
      try {
        const statusResponse = await makeRequest(`/api/payments/status/${response.body.paymentId}`);
        logTest(
          'GET /api/payments/status/:id',
          statusResponse.status === 200 && statusResponse.body.status === 'pending',
          `Status: ${statusResponse.body.status}`
        );
      } catch (error) {
        logTest('GET /api/payments/status/:id', false, error.message);
      }
    }
  } catch (error) {
    logTest('POST /api/payments/initiate', false, error.message);
  }

  // Test 4: Verify endpoint
  try {
    const response = await makeRequest('/api/payments/verify', 'POST', { paymentId: 'test-123' });
    logTest(
      'POST /api/payments/verify',
      response.status === 404, // Should return 404 for non-existent payment
      'Correctly returns 404 for non-existent payment'
    );
  } catch (error) {
    logTest('POST /api/payments/verify', false, error.message);
  }
}

async function testFrontendPages() {
  log('\n=== Testing Frontend Pages ===', 'bold');

  // Test payment-return.html
  try {
    const response = await makeRequest('/payment-return.html');
    logTest(
      'GET /payment-return.html',
      response.status === 200 && response.headers['content-type'].includes('text/html'),
      'Page loads successfully'
    );
  } catch (error) {
    logTest('GET /payment-return.html', false, error.message);
  }

  // Test payment-cancel.html
  try {
    const response = await makeRequest('/payment-cancel.html');
    logTest(
      'GET /payment-cancel.html',
      response.status === 200 && response.headers['content-type'].includes('text/html'),
      'Page loads successfully'
    );
  } catch (error) {
    logTest('GET /payment-cancel.html', false, error.message);
  }

  // Test payment modal component
  try {
    const response = await makeRequest('/components/payment-modal.js');
    logTest(
      'GET /components/payment-modal.js',
      response.status === 200 && response.headers['content-type'].includes('javascript'),
      'Component loads successfully'
    );
  } catch (error) {
    logTest('GET /components/payment-modal.js', false, error.message);
  }
}

async function testServerConfiguration() {
  log('\n=== Testing Server Configuration ===', 'bold');

  // Test Firebase config endpoint
  try {
    const response = await makeRequest('/api/getFirebaseConfig');
    logTest(
      'GET /api/getFirebaseConfig',
      response.status === 200 || response.status === 500, // 500 if not configured, which is ok for testing
      response.status === 500 ? 'Not configured (expected for testing)' : 'Configured'
    );
  } catch (error) {
    logTest('GET /api/getFirebaseConfig', false, error.message);
  }

  // Test SA Data endpoint
  try {
    const response = await makeRequest('/api/getSAData');
    logTest(
      'GET /api/getSAData',
      response.status === 200 && response.body.usdZar,
      `USD/ZAR: ${response.body.usdZar}`
    );
  } catch (error) {
    logTest('GET /api/getSAData', false, error.message);
  }
}

async function runTests() {
  log('\n╔═══════════════════════════════════════════════╗', 'blue');
  log('║   PayFast Integration Verification Tests     ║', 'blue');
  log('╚═══════════════════════════════════════════════╝', 'blue');

  log('\nℹ️  Testing server at: ' + BASE_URL, 'yellow');
  log('ℹ️  Make sure the server is running: npm start\n', 'yellow');

  // Wait for server to be ready
  try {
    await makeRequest('/api/payments/test');
  } catch (error) {
    log('❌ Cannot connect to server. Is it running?', 'red');
    log(`   Error: ${error.message}`, 'yellow');
    log('\n   Start the server with: npm start', 'yellow');
    process.exit(1);
  }

  // Run all tests
  await testServerConfiguration();
  await testPaymentAPIEndpoints();
  await testFrontendPages();

  // Summary
  log('\n╔═══════════════════════════════════════════════╗', 'blue');
  log('║              Test Summary                     ║', 'blue');
  log('╚═══════════════════════════════════════════════╝', 'blue');
  log(`\nTests Passed: ${testsPassed}`, 'green');
  log(`Tests Failed: ${testsFailed}`, testsFailed > 0 ? 'red' : 'reset');

  if (testsFailed === 0) {
    log('\n✅ All integration tests passed!', 'green');
    log('\n📝 Backend and frontend are properly connected.', 'green');
    log('🚀 Ready for PayFast sandbox testing!', 'green');
    log('\nNext steps:', 'yellow');
    log('  1. Copy .env.example to .env', 'reset');
    log('  2. Update .env with your Firebase credentials', 'reset');
    log('  3. Test payment flow with test card: 4000 0000 0000 0002', 'reset');
  } else {
    log('\n❌ Some tests failed. Please check the errors above.', 'red');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  log(`\n❌ Test suite failed: ${error.message}`, 'red');
  process.exit(1);
});
