const express = require('express');
const router = express.Router();
const { createEvent, getEventDetails } = require('../controllers/eventsController');
const auth = require('../middlewares/auth');

router.post('/', auth, createEvent); // protected; in real app restrict to admin
router.get('/:id', getEventDetails);

module.exports = router;
