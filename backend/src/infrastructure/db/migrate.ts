import { readdir, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { getPool } from './pool';

/**
 * Simple migration runner that applies SQL files from supabase/migrations in order.
 * For production use, prefer running migrations via Supabase SQL editor or dedicated migration tool.
 */
async function migrate() {
  const pool = getPool();
  const migrationsDir = resolve(__dirname, '../../../supabase/migrations');
  
  try {
    console.log('🔍 Looking for migrations in:', migrationsDir);
    
    const files = await readdir(migrationsDir);
    const sqlFiles = files
      .filter((f) => f.endsWith('.sql'))
      .sort();
    
    if (sqlFiles.length === 0) {
      console.log('⚠️  No migration files found');
      return;
    }
    
    console.log(`📝 Found ${sqlFiles.length} migration file(s)`);
    
    for (const file of sqlFiles) {
      const filePath = join(migrationsDir, file);
      console.log(`  ⏳ Applying: ${file}`);
      
      const sql = await readFile(filePath, 'utf-8');
      await pool.query(sql);
      
      console.log(`  ✅ Applied: ${file}`);
    }
    
    console.log('✅ All migrations applied successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate();
