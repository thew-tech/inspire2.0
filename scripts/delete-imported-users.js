/**
 * SAFE USER CLEANUP SCRIPT
 * Deletes ALL user accounts (imported from nspireinspection.ai)
 * Keeps: Inspections, Buildings, Properties, Units, Orders, Reports etc.
 * 
 * Run with: node scripts/delete-imported-users.js
 * Add --confirm flag to actually delete: node scripts/delete-imported-users.js --confirm
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = !process.argv.includes('--confirm');

async function deleteImportedUsers() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in .env');
    process.exit(1);
  }

  console.log('\n🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected!\n');

  const db = mongoose.connection.db;

  // Count users before
  const userCollection = db.collection('users');
  const pendingCollection = db.collection('pendingusers');

  const userCount = await userCollection.countDocuments();
  const pendingCount = await pendingCollection.countDocuments();

  console.log('📊 CURRENT DATABASE STATE:');
  console.log(`   Users:        ${userCount}`);
  console.log(`   PendingUsers: ${pendingCount}`);

  // Show sample of users that will be deleted
  const sampleUsers = await userCollection.find({}, { 
    projection: { email: 1, fullName: 1, role: 1, createdAt: 1 } 
  }).limit(10).toArray();

  console.log('\n👥 SAMPLE USERS THAT WILL BE DELETED:');
  sampleUsers.forEach(u => {
    console.log(`   - ${u.email} (${u.role}) | ${u.fullName}`);
  });
  if (userCount > 10) console.log(`   ... and ${userCount - 10} more`);

  // Count other collections (these will NOT be touched)
  const collections = ['inspections', 'buildings', 'properties', 'units', 'orders', 'assets'];
  console.log('\n📦 DATA THAT WILL BE KEPT (not touched):');
  for (const col of collections) {
    try {
      const count = await db.collection(col).countDocuments();
      console.log(`   ${col}: ${count} records`);
    } catch (e) { /* collection may not exist */ }
  }

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — No data was deleted.');
    console.log('   To actually delete users, run:');
    console.log('   node scripts/delete-imported-users.js --confirm\n');
  } else {
    console.log('\n🗑️  DELETING all users and pending users...');
    
    const userResult = await userCollection.deleteMany({});
    const pendingResult = await pendingCollection.deleteMany({});

    console.log(`✅ Deleted ${userResult.deletedCount} users`);
    console.log(`✅ Deleted ${pendingResult.deletedCount} pending users`);
    console.log('\n🎉 Done! Your database is clean.');
    console.log('   All inspections, buildings, properties etc. are still intact.');
    console.log('\n   You can now register fresh accounts on your new site.\n');
  }

  await mongoose.disconnect();
}

deleteImportedUsers().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
