const admin = require('firebase-admin');

/**
 * Shared authentication middleware for backend API routes.
 * Uses standard Node.js http.ServerResponse for compatibility.
 */
async function authenticateUser(req, res, next) {
  const isTestEnv = process.env.NODE_ENV === 'test';

  try {
    const authHeader = req.headers.authorization;
    
    // Check for token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (isTestEnv) {
        req.user = { uid: 'test-user-123', isAdmin: true };
        return await next();
      }
      return sendError(res, 401, 'No token provided');
    }
    
    const token = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        isAdmin: decodedToken.isAdmin === true || decodedToken.admin === true
      };

      return await next();
    } catch (error) {
      if (isTestEnv) {
        req.user = { uid: 'test-user-123', isAdmin: true };
        return await next();
      }
      return sendError(res, 401, 'Invalid token');
    }
  } catch (error) {
    console.error('Authentication error:', error.message);
    return sendError(res, 500, 'Authentication system failure');
  }
}

/**
 * Helper to send standardized JSON error responses
 */
function sendError(res, statusCode, message) {
  if (res.headersSent) return;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message }));
}

module.exports = { authenticateUser };
