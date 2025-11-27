require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

let dbcheck = false;
// Database
const { initDb } = require('./db');
const { runMigrations } = require('./migrations');

// Routes
const authRouter = require('./routes/auth');
const eventsRouter = require('./routes/events');
const reservationsRouter = require('./routes/reservations');

// Cron
const { startPurgeJob } = require('./jobs/purgeExpiredHolds');

const app = express();
app.use(bodyParser.json());

// Routers
app.use('/auth', authRouter);
app.use('/events', eventsRouter);
app.use('/reservations', reservationsRouter);

const PORT = process.env.PORT || 8000;

(async () => {
	console.log('🔧 Initializing database...');
	await initDb();

	console.log('📦 Running migrations...');
	await runMigrations();

	console.log('⏱ Starting background jobs...');
	startPurgeJob();

	app.listen(PORT, () => {
		console.log(`🔥 Server listening on port ${PORT}`);
	});
})();
