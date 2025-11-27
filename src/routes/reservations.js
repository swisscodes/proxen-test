const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { createHold, confirmReservation, cancelReservation } = require('../controllers/reservationsController');

router.post('/hold', auth, createHold);
router.post('/confirm', auth, confirmReservation);
router.post('/cancel', auth, cancelReservation);

module.exports = router;
