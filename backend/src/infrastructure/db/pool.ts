import { Pool, types } from 'pg';
import { loadConfig } from '../config/env';

let pool: Pool | null = null;

// O driver devolve BIGINT (int8) e NUMERIC como texto para não perder precisão.
// Views e scores cabem com folga em Number, então convertemos na borda do banco
// para a API nunca entregar "291505" em vez de 291505.
const INT8_OID = 20;
const NUMERIC_OID = 1700;
types.setTypeParser(INT8_OID, (value) => (value === null ? null : Number.parseInt(value, 10)));
types.setTypeParser(NUMERIC_OID, (value) => (value === null ? null : Number.parseFloat(value)));

export function getPool(): Pool {
  if (!pool) {
    const config = loadConfig();
    pool = new Pool({
      connectionString: config.database.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
