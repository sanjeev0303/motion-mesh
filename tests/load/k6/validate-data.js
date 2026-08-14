const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function validateData() {
  const dataPath = path.join(__dirname, 'data.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`Data file not found at ${dataPath}. Please run generate-data.js first.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const { account_ids, api_keys, bucket_ids, video_ids } = data;

  // Basic schema validation
  if (!Array.isArray(account_ids) || !Array.isArray(api_keys) || !Array.isArray(bucket_ids) || !Array.isArray(video_ids)) {
    console.error("Schema Error: account_ids, api_keys, bucket_ids, or video_ids is missing or not an array");
    process.exit(1);
  }

  if (account_ids.length < 100000 || api_keys.length < 100000 || bucket_ids.length < 100000 || video_ids.length < 100000) {
    console.error(`Schema Error: Minimum requirement is 100,000 records. Found ${account_ids.length} accounts, ${api_keys.length} keys, ${bucket_ids.length} buckets, ${video_ids.length} videos.`);
    process.exit(1);
  }

  const accountRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const apiKeyRegex = /^mot_test_[0-9a-f]{16}\.[0-9a-f]{64}$/;

  // Check first few elements for performance
  for (let i = 0; i < 10; i++) {
    if (!accountRegex.test(account_ids[i]) || !accountRegex.test(bucket_ids[i]) || !accountRegex.test(video_ids[i])) {
      console.error(`Schema Error: Invalid UUID format at index ${i}`);
      process.exit(1);
    }
    if (!apiKeyRegex.test(api_keys[i])) {
      console.error(`Schema Error: Invalid API Key format at index ${i}`);
      process.exit(1);
    }
  }

  console.log(`Validating data.json with ${account_ids.length} accounts...`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/motionmesh?sslmode=disable'
  });

  const client = await pool.connect();
  try {
    const { rows: accountRows } = await client.query('SELECT COUNT(*) FROM accounts');
    const dbAccountCount = parseInt(accountRows[0].count, 10);
    console.log(`Database has ${dbAccountCount} total accounts.`);

    if (dbAccountCount < account_ids.length) {
      console.warn(`WARNING: Database account count (${dbAccountCount}) is less than data.json count (${account_ids.length}).`);
    }

    const { rows: keyRows } = await client.query('SELECT COUNT(*) FROM api_keys');
    const dbKeyCount = parseInt(keyRows[0].count, 10);
    console.log(`Database has ${dbKeyCount} total API keys.`);

    // Random sampling
    const sampleSize = Math.min(parseInt(process.env.VALIDATION_SAMPLE_SIZE || "100", 10), account_ids.length);
    console.log(`\nRandomly verifying ${sampleSize} samples...`);
    
    const validationErrors = [];

    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor(Math.random() * account_ids.length);
      const accId = account_ids[idx];
      const apiKey = api_keys[idx];
      const bucketId = bucket_ids[idx];
      const videoId = video_ids[idx];
      const prefix = apiKey.split('.')[0];
      
      const { rows: checkRows } = await client.query('SELECT * FROM api_keys WHERE account_id = $1 AND prefix = $2', [accId, prefix]);
      if (checkRows.length !== 1) {
        validationErrors.push(`Account ${accId} missing or mismatch for API Key prefix ${prefix}`);
      }

      const { rows: bucketRows } = await client.query('SELECT * FROM buckets WHERE id = $1 AND account_id = $2', [bucketId, accId]);
      if (bucketRows.length !== 1) {
        validationErrors.push(`Account ${accId} missing or mismatch for bucket ${bucketId}`);
      }

      const { rows: videoRows } = await client.query('SELECT * FROM videos WHERE id = $1 AND account_id = $2 AND bucket_id = $3', [videoId, accId, bucketId]);
      if (videoRows.length !== 1) {
        validationErrors.push(`Account ${accId} missing or mismatch for video ${videoId} in bucket ${bucketId}`);
      }
    }
    
    if (validationErrors.length > 0) {
      console.error("\n[CRITICAL] Data validation failed with the following relational errors:");
      validationErrors.forEach(err => console.error(` - ${err}`));
      process.exit(1);
    }

    console.log(`\nValidation complete. 0 relational errors across ${sampleSize} samples.`);
  } catch (e) {
    console.error(e);
  } finally {
    client.release();
    await pool.end();
  }
}

validateData().catch(console.error);
