import { getPool, closePool } from './pool';
import { loadConfig } from '../config/env';

/**
 * Seeds demo data for local testing when DEMO_MODE is enabled.
 * Uses fixed UUIDs for reproducible demos.
 */
async function seedDemo() {
  const config = loadConfig();
  
  if (!config.demo.enabled) {
    console.log('⚠️  DEMO_MODE is not enabled. Skipping seed.');
    return;
  }
  
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🌱 Seeding demo data...');
    
    // Demo profiles
    const demoProfiles = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'maria@demo.com',
        full_name: 'Maria Silva',
        public_name: 'Maria',
        role: 'ambassador',
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        email: 'joao@demo.com',
        full_name: 'João Santos',
        public_name: 'João',
        role: 'ambassador',
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        email: 'ana@demo.com',
        full_name: 'Ana Costa',
        public_name: 'Ana',
        role: 'ambassador',
      },
      {
        id: '00000000-0000-0000-0000-000000000099',
        email: 'admin@demo.com',
        full_name: 'Admin Demo',
        public_name: 'Admin',
        role: 'admin',
      },
    ];
    
    for (const profile of demoProfiles) {
      await client.query(
        `INSERT INTO profiles (id, email, full_name, public_name, role, onboarding_completed)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO NOTHING`,
        [profile.id, profile.email, profile.full_name, profile.public_name, profile.role],
      );
    }
    
    // Demo memberships
    for (const profile of demoProfiles.slice(0, 3)) {
      await client.query(
        `INSERT INTO ambassador_memberships (profile_id, status, approved_at, approved_by)
         VALUES ($1, 'approved', NOW() - INTERVAL '30 days', $2)
         ON CONFLICT (profile_id) DO NOTHING`,
        [profile.id, demoProfiles[3].id],
      );
    }
    
    // Demo social accounts (Instagram)
    const demoAccounts = [
      {
        profileId: '00000000-0000-0000-0000-000000000001',
        platformUserId: 'demo_maria_ig',
        username: 'maria_demo',
      },
      {
        profileId: '00000000-0000-0000-0000-000000000002',
        platformUserId: 'demo_joao_ig',
        username: 'joao_demo',
      },
      {
        profileId: '00000000-0000-0000-0000-000000000003',
        platformUserId: 'demo_ana_ig',
        username: 'ana_demo',
      },
    ];
    
    for (const account of demoAccounts) {
      const result = await client.query(
        `INSERT INTO social_accounts (
          profile_id, platform, platform_user_id, username, display_name,
          status, transport, last_synced_at, last_successful_sync_at, sync_coverage_ratio
        )
        VALUES ($1, 'instagram', $2, $3, $3, 'connected', 'demo', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour', 1.0)
        ON CONFLICT (platform, platform_user_id) DO UPDATE SET updated_at = NOW()
        RETURNING id`,
        [account.profileId, account.platformUserId, account.username],
      );
      
      const accountId = result.rows[0].id;
      
      // Demo content items
      const contentItems = [
        { views: 15000, publishedAt: '30 days' },
        { views: 8000, publishedAt: '20 days' },
        { views: 12000, publishedAt: '10 days' },
        { views: 5000, publishedAt: '5 days' },
      ];
      
      for (let i = 0; i < contentItems.length; i++) {
        const item = contentItems[i];
        await client.query(
          `INSERT INTO content_items (
            social_account_id, platform, platform_content_id, title,
            published_at, eligible, latest_views, latest_views_collected_at
          )
          VALUES ($1, 'instagram', $2, $3, NOW() - INTERVAL '${item.publishedAt}', true, $4, NOW() - INTERVAL '1 hour')
          ON CONFLICT (platform, platform_content_id) DO NOTHING`,
          [
            accountId,
            `${account.platformUserId}_${i + 1}`,
            `Demo content ${i + 1}`,
            item.views,
          ],
        );
      }
    }
    
    await client.query('COMMIT');
    console.log('✅ Demo data seeded successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

seedDemo();
