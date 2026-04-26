const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const authHeader = req.header('Authorization') || req.header('authorization');

  let token = req.header('x-auth-token');

  if (!token && authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token manquant ou invalide',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      ...decoded,
      id: decoded.id || decoded._id || decoded.userId,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token manquant ou invalide',
      error: error.message,
    });
  }
};