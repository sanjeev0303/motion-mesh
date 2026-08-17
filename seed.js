const fs = require('fs');
const { Pool } = require('pg');

async function seed() {
  const data = JSON.parse(fs.readFileSync('./tests/load/k6/data.json', 'utf8'));
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    console.log("Seeding started...");
    await client.query('BEGIN');
    
    // Check if data already exists
    const { rows: accountRows } = await client.query('SELECT COUNT(*) FROM accounts');
    const count = parseInt(accountRows[0].count, 10);
    if (count > 0) {
      console.log(`Database already has ${count} accounts. Skipping seed.`);
      return;
    }

    const { account_ids, api_keys, bucket_ids, video_ids } = data;
    
    console.log("Inserting accounts...");
    for (let i = 0; i < account_ids.length; i += 1000) {
      const chunk = account_ids.slice(i, i + 1000);
      const values = chunk.map((id) => `('${id}', 'bench_${id}@test.com', 'pro', 'active', NOW(), NOW())`).join(',');
      await client.query(`INSERT INTO accounts (id, email, plan, status, created_at, updated_at) VALUES ${values}`);
    }

    console.log("Inserting api_keys...");
    const crypto = require('crypto');
    for (let i = 0; i < api_keys.length; i += 1000) {
      const chunk = api_keys.slice(i, i + 1000);
      const accChunk = account_ids.slice(i, i + 1000);
      const values = chunk.map((key, idx) => {
        const parts = key.split('.');
        const id = crypto.randomUUID();
        const hash = crypto.createHash('sha256').update(parts[1]).digest('hex');
        return `('${id}', '${accChunk[idx]}', 'key_${idx}', '${parts[0]}', '${hash}', '{"video:read","video:write"}', NOW())`;
      }).join(',');
      await client.query(`INSERT INTO api_keys (id, account_id, name, prefix, hash, scopes, created_at) VALUES ${values}`);
    }

    console.log("Inserting buckets...");
    for (let i = 0; i < bucket_ids.length; i += 1000) {
      const chunk = bucket_ids.slice(i, i + 1000);
      const accChunk = account_ids.slice(i, i + 1000);
      const values = chunk.map((id, idx) => `('${id}', '${accChunk[idx]}', 'bucket_${idx}', 'ap-south-1', NOW())`).join(',');
      await client.query(`INSERT INTO buckets (id, account_id, name, region, created_at) VALUES ${values}`);
    }

    console.log("Inserting videos...");
    for (let i = 0; i < video_ids.length; i += 1000) {
      const chunk = video_ids.slice(i, i + 1000);
      const accChunk = account_ids.slice(i, i + 1000);
      const buckChunk = bucket_ids.slice(i, i + 1000);
      const values = chunk.map((id, idx) => `('${id}', '${accChunk[idx]}', '${buckChunk[idx]}', 'video_${idx}', 'obj_${idx}', 'ready', NOW(), NOW())`).join(',');
      await client.query(`INSERT INTO videos (id, account_id, bucket_id, title, object_key, status, created_at, updated_at) VALUES ${values}`);
    }

    await client.query('COMMIT');
    console.log("Seeding complete!");
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("Error during seeding:", e);
  } finally {
    client.release();
    pool.end();
  }
}

seed().catch(console.error);
