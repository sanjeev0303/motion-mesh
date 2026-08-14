const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function validateData() {
  const dataPath = path.join(__dirname, '../../tests/load/k6/data.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error("data.json not found. Run the generate-load-data command first.");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log("Validating JSON counts...");

  const requiredCount = 100000;
  
  if (!data.account_ids || data.account_ids.length < requiredCount) {
    console.error(`Insufficient accounts: ${data.account_ids ? data.account_ids.length : 0} < ${requiredCount}`);
    process.exit(1);
  }
  if (!data.api_keys || data.api_keys.length < requiredCount) {
    console.error(`Insufficient api_keys: ${data.api_keys ? data.api_keys.length : 0} < ${requiredCount}`);
    process.exit(1);
  }
  if (!data.bucket_ids || data.bucket_ids.length < requiredCount) {
    console.error(`Insufficient bucket_ids: ${data.bucket_ids ? data.bucket_ids.length : 0} < ${requiredCount}`);
    process.exit(1);
  }
  if (!data.video_ids || data.video_ids.length < requiredCount) {
    console.error(`Insufficient video_ids: ${data.video_ids ? data.video_ids.length : 0} < ${requiredCount}`);
    process.exit(1);
  }
  
  console.log(`JSON counts valid (Accounts: ${data.account_ids.length}, Videos: ${data.video_ids.length})`);

  console.log("\nConnecting to database for integrity verification...");
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/motionmesh?sslmode=disable'
  });
  
  await client.connect();

  console.log("Selecting 100 random samples for relationship validation...");
  const samples = 100;
  let successfulValidations = 0;

  for (let i = 0; i < samples; i++) {
    const idx = Math.floor(Math.random() * data.account_ids.length);
    const accId = data.account_ids[idx];
    const bktId = data.bucket_ids[idx];
    const apiKeyRaw = data.api_keys[idx];
    const prefix = apiKeyRaw.split('.')[0];
    
    // Check account
    const accRes = await client.query('SELECT id FROM accounts WHERE id = $1', [accId]);
    if (accRes.rowCount === 0) {
      console.error(`[ERROR] Account ${accId} not found in database!`);
      continue;
    }
    
    // Check bucket matches account
    const bktRes = await client.query('SELECT id, account_id FROM buckets WHERE id = $1', [bktId]);
    if (bktRes.rowCount === 0 || bktRes.rows[0].account_id !== accId) {
      console.error(`[ERROR] Bucket ${bktId} does not belong to Account ${accId}!`);
      continue;
    }

    // Check API Key matches account
    const keyRes = await client.query('SELECT id, account_id FROM api_keys WHERE prefix = $1', [prefix]);
    if (keyRes.rowCount === 0 || keyRes.rows[0].account_id !== accId) {
      console.error(`[ERROR] API Key prefix ${prefix} does not belong to Account ${accId}!`);
      continue;
    }
    
    successfulValidations++;
  }
  
  await client.end();

  if (successfulValidations === samples) {
    console.log(`\n✅ Database validation passed: 100/100 random samples strictly matched Account -> Bucket -> API Key ownership.`);
  } else {
    console.error(`\n❌ Database validation failed: Only ${successfulValidations}/${samples} random samples were valid.`);
    process.exit(1);
  }
}

validateData().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
