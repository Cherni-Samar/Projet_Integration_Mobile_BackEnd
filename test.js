const bcrypt = require('bcryptjs');
bcrypt.hash('azerty', 10).then(hash => {
  console.log('Hash:', hash);
  bcrypt.compare('azerty', hash).then(r => console.log('Match:', r));
});
