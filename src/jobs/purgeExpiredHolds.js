const cron = require('node-cron');
const db = require('../db');

function startPurgeJob() {
  // Runs every 30 seconds. Adjust as needed.
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const { rows } = await db.query(
        `DELETE FROM reservations
         WHERE state='HOLD' AND expires_at <= now()
         RETURNING id, event_id, user_id`
      );

      if (rows.length > 0) {
        console.log('Purged expired holds:', rows.length);
        // Optionally: notify users, write audit logs, increment counters, etc.
      }
    } catch (err) {
      console.error('Error purging holds', err);
    }
  });
}

module.exports = { startPurgeJob };