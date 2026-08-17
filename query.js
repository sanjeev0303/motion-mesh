const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: 'postgres://root:kJ%5B7MaA13~rNJT%21C%5D%3FwgkKeq%3AmB%28@localhost:15432/motionmesh',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  // Add missing column aliases that Go code expects
  await client.query(`
    ALTER TABLE buckets ADD COLUMN IF NOT EXISTS total_bytes BIGINT GENERATED ALWAYS AS (storage_used_bytes) STORED;
  `);
  await client.query(`
    ALTER TABLE buckets ADD COLUMN IF NOT EXISTS total_objects INTEGER GENERATED ALWAYS AS (object_count) STORED;
  `);
  console.log('Migration applied: added total_bytes and total_objects virtual columns');

  // Verify
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'buckets' ORDER BY ordinal_position;
  `);
  console.table(res.rows);

  await client.end();
}

check().catch(console.error);
