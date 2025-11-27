require('dotenv').config();
const { Pool } = require('pg');
const { URL } = require('url');

let pool = null;
let initializing = false;

async function ensureDatabaseExists() {
	const dbUrl = new URL(process.env.DATABASE_URL);
	const targetDbName = dbUrl.pathname.replace('/', '');

	const username = dbUrl.username;
	const password = dbUrl.password;
	const host = dbUrl.hostname;
	const port = dbUrl.port || 5432;

	console.log(
		`🔧 Attempting to connect to 'postgres' DB on ${host}:${port} as user '${username}' to check for database existence...`
	);

	const defaultDbPool = new Pool({
		user: username,
		password: password,
		host: host,
		port: port,
		database: 'postgres', // Connect to default maintenance db
	});

	try {
		// Test connection first to catch auth errors early
		await defaultDbPool.query('SELECT NOW()');

		const result = await defaultDbPool.query(
			`SELECT 1 FROM pg_database WHERE datname = $1`,
			[targetDbName]
		);

		if (result.rows.length === 0) {
			console.log(`➡ Database "${targetDbName}" not found. Creating...`);
			// Wrap db name in double quotes for safety
			await defaultDbPool.query(`CREATE DATABASE "${targetDbName}"`);
			console.log(`✔ Created database "${targetDbName}"`);
		} else {
			console.log(`✔ Database "${targetDbName}" exists.`);
		}
	} catch (error) {
		// Log specific error if the initial connection fails
		console.error(
			'❌ Error checking/creating database. Check your credentials.'
		);
		throw error;
	} finally {
		await defaultDbPool.end();
	}
}

async function initDb() {
	if (initializing) return;
	initializing = true;

	try {
		await ensureDatabaseExists();

		pool = new Pool({
			connectionString: process.env.DATABASE_URL,
		});

		pool.on('error', (err) => {
			console.error('Unexpected DB error:', err);
		});

		// Test final connection
		await pool.query('SELECT NOW()');
		console.log('✔ Connected to target database successfully.');
	} catch (err) {
		console.error('🔥 Fatal Error during DB initialization:');
		console.error(err.message);
		// It's usually best to kill the process if DB init fails
		process.exit(1);
	}
}

// SAFE query function: waits until pool exists
async function safeQuery(text, params) {
	if (!pool) {
		console.log('⏳ Waiting for DB pool...');
		// wait until pool is ready
		while (!pool) {
			await new Promise((res) => setTimeout(res, 100));
			// Add a safety valve so it doesn't spin forever if init failed silently
			if (!initializing && !pool) {
				throw new Error('DB pool failed to initialize.');
			}
		}
	}
	return pool.query(text, params);
}

module.exports = {
	initDb,
	query: safeQuery,
	getClient: () => (pool ? pool.connect() : null),
};
