#!/usr/bin/env node
const { getDb } = require('../src/config/db');

async function run() {
  try {
    const db = getDb();
    if (!db) {
      console.error('DB not available');
      process.exit(2);
    }
    const col = db.collection('marketlists');
    const cursor = col.find({ $or: [{ companyName: { $exists: false } }, { companyName: '' }, { companyName: null }] });
    let updated = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const company = doc.companyName || doc.name || doc.company || doc.company_name || '';
      if (company && String(company).trim()) {
        await col.updateOne({ _id: doc._id }, { $set: { companyName: String(company) } });
        updated += 1;
      }
    }
    console.log(`Backfill complete. Updated ${updated} documents.`);
    process.exit(0);
  } catch (err) {
    console.error('Backfill error:', err);
    process.exit(1);
  }
}

run();
