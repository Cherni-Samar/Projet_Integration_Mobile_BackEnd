const User = require('../models/User');
const bcrypt = require('bcryptjs');

// ✅ Update user (seulement son propre profil)
exports.updateUser = async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const userId = req.user.id; // Toujours l'utilisateur connecté

    console.log('🔍 Update request:', {
      userId,
      body: req.body
    });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Mettre à jour le nom
    if (name !== undefined) {
      user.name = name;
      console.log('✅ Name updated to:', name);
    }

    // Mettre à jour l'email
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
      user.email = email;
      user.isEmailVerified = false; // Marquer comme non vérifié
      console.log('✅ Email updated to:', email);
    }

    // Changement de mot de passe
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required' });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      console.log('✅ Password updated');
    }

    await user.save();
    console.log('✅ User saved successfully');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }
      }
    });

  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};