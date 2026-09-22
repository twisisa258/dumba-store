// Uso local: npm run db:setup  (executa schema.sql e seed.sql no Neon)
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
for (const file of ['schema.sql', 'seed.sql', '002_payments_admin_notifications.sql']) {
  const sql = await readFile(new URL(`../../database/${file}`, import.meta.url), 'utf8');
  await client.query(sql);
  console.log('OK:', file);
}
await client.end();
