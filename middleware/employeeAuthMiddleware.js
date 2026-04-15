const jwt = require('jsonwebtoken');

/**
 * Employee Auth Middleware
 * Verifies JWT token from employee portal (stored in 'Authorization: Bearer <token>')
 */
module.exports = function employeeAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token manquant ou format invalide'
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Store employee ID in req.employee instead of req.user
    req.employee = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token invalide ou expiré',
      error: error.message
    });
  }
};
