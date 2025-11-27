const db = require('../db');

const createEvent = async (req, res) => {
  const { title, capacity, startDate, endDate, isActive } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO events (title, capacity, start_date, end_date, is_active) 
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
       [title, capacity, startDate, endDate, isActive ?? true]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getEventDetails = async (req, res) => {
  const eventId = req.params.id;
  try {
    const eventQ = await db.query('SELECT * FROM events WHERE id = $1', [eventId]);
    if (eventQ.rowCount === 0) return res.status(404).json({ error: 'Event not found' });

    const countsQ = await db.query(
      `SELECT
         SUM(CASE WHEN state='HOLD' THEN 1 ELSE 0 END) as hold_count,
         SUM(CASE WHEN state='CONFIRMED' THEN 1 ELSE 0 END) as confirmed_count
       FROM reservations
       WHERE event_id = $1`, [eventId]
    );

    const holdCount = parseInt(countsQ.rows[0].hold_count || 0, 10);
    const confirmedCount = parseInt(countsQ.rows[0].confirmed_count || 0, 10);
    const remaining = eventQ.rows[0].capacity - (holdCount + confirmedCount);

    res.json({
      event: eventQ.rows[0],
      holdCount,
      confirmedCount,
      remainingCapacity: Math.max(0, remaining)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { createEvent, getEventDetails };
