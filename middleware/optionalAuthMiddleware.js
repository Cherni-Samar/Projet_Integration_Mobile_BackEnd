const jwt = require('jsonwebtoken');

/**
 * Si le header x-auth-token est présent, vérifie le JWT (même logique que authMiddleware).
 * Si absent, continue sans req.user (routes utilisables sans auth).
 */
module.exports = function optionalAuthMiddleware(req, res, next) {
  const token = req.header('x-auth-token');
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token manquant ou invalide',
      error: error.message,
    });
  }
};
