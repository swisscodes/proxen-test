const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigrations() {
  console.log("🚀 Running migrations...");

  // Ensure migrations table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT now()
    );
  `);

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
                  .filter(f => f.endsWith('.sql'))
                  .sort(); // ensure correct order: 001, 002...

  for (const file of files) {
    const alreadyApplied = await db.query(
      "SELECT 1 FROM migrations WHERE name = $1",
      [file]
    );

    if (alreadyApplied.rows.length > 0) {
      console.log(`✔ Migration already applied: ${file}`);
      continue;
    }

    console.log(`📄 Applying migration: ${file}`);

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    try {
      await db.query(sql);
      await db.query(
        "INSERT INTO migrations (name) VALUES ($1)",
        [file]
      );
      console.log(`✔ Successfully applied: ${file}`);
    } catch (err) {
      console.error(`❌ Migration failed: ${file}`);
      console.error(err);
      process.exit(1); // stop app if migration fails
    }
  }

  console.log("🎉 All migrations applied.");
}

module.exports = { runMigrations };
