const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  console.log('==========================================');
  console.log('📬 TOUS LES HEADERS REÇUS:');
  console.log(JSON.stringify(req.headers, null, 2));
  console.log('==========================================');
  
  const token = req.header('x-auth-token');

  console.log('🔐 Token extrait de x-auth-token:', token ? token.substring(0, 30) + '...' : '❌ AUCUN');

  if (!token) {
    console.log('❌ Token manquant - Envoi 401');
    return res.status(401).json({ 
      success: false,
      message: 'Token manquant ou invalide' 
    });
  }

  try {
    console.log('🔑 JWT_SECRET existe:', !!process.env.JWT_SECRET);
    console.log('🔑 JWT_SECRET longueur:', process.env.JWT_SECRET?.length || 0);
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token décodé avec succès:', decoded);
    
    req.user = decoded;
    next();
  } catch (error) {
    console.error('❌ Erreur vérification token:', error.message);
    res.status(401).json({ 
      success: false,
      message: 'Token manquant ou invalide',
      error: error.message
    });
  }
};