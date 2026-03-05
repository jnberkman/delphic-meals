const { Router } = require('express');
const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Delphic Meals API running.' });
});

module.exports = router;
