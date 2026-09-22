import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL não definido.');
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => console.error('[db] erro no pool:', err.message));

export const query = (text, params) => pool.query(text, params);
