const db = require('../db');

const HOLD_DURATION_MINUTES = 5;

const createHold = async (req, res) => {
  const userId = req.user.id;
  const { eventId } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Lock the event row to prevent concurrent overbooking
    const evRes = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [eventId]);
    if (evRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = evRes.rows[0];
    if (!event.is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Event not active' });
    }

    // Count existing holds + confirmed
    const countRes = await client.query(
      `SELECT COUNT(*)::int as cnt FROM reservations WHERE event_id = $1 AND state IN ('HOLD','CONFIRMED')`,
      [eventId]
    );
    const currentReserved = parseInt(countRes.rows[0].cnt, 10);

    if (currentReserved >= event.capacity) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No capacity' });
    }

    const expiresAt = new Date(Date.now() + HOLD_DURATION_MINUTES * 60 * 1000).toISOString();

    const insertRes = await client.query(
      `INSERT INTO reservations (user_id, event_id, state, expires_at) 
       VALUES ($1,$2,'HOLD',$3) RETURNING *`,
      [userId, eventId, expiresAt]
    );

    await client.query('COMMIT');
    res.status(201).json({ reservation: insertRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('createHold error', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const confirmReservation = async (req, res) => {
  const userId = req.user.id;
  const { reservationId } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Lock the reservation row
    const rRes = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [reservationId]);
    if (rRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found' });
    }
    const reservation = rRes.rows[0];
    if (reservation.user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not owner' });
    }
    if (reservation.state !== 'HOLD') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Reservation not in HOLD state' });
    }
    if (reservation.expires_at && new Date(reservation.expires_at) <= new Date()) {
      // Already expired
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Hold expired' });
    }

    // Lock the event row as well before confirming
    const evRes = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [reservation.event_id]);
    if (evRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = evRes.rows[0];
    // Re-count to be safe
    const countRes = await client.query(
      `SELECT COUNT(*)::int as cnt FROM reservations WHERE event_id = $1 AND state IN ('HOLD','CONFIRMED')`,
      [reservation.event_id]
    );
    const currentReserved = parseInt(countRes.rows[0].cnt, 10);

    if (currentReserved > event.capacity) {
      // Defensive: should not happen if holds were counted earlier.
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Overbooked' });
    }

    // Update to CONFIRMED
    const updateRes = await client.query(
      `UPDATE reservations SET state='CONFIRMED', expires_at = NULL, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [reservationId]
    );

    await client.query('COMMIT');
    res.json({ reservation: updateRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('confirmReservation error', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const cancelReservation = async (req, res) => {
  const userId = req.user.id;
  const { reservationId } = req.body;
  try {
    const { rows } = await db.query('SELECT * FROM reservations WHERE id = $1', [reservationId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const reservation = rows[0];
    if (reservation.user_id !== userId) return res.status(403).json({ error: 'Not owner' });

    await db.query('DELETE FROM reservations WHERE id = $1', [reservationId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { createHold, confirmReservation, cancelReservation };