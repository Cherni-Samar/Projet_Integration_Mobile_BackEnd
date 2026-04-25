module.exports = function (req, res, next) {
  // Ce middleware doit être utilisé APRÈS authMiddleware
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  // Vérifier si l'utilisateur est admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }

  next();
};