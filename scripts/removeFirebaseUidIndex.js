// Run this script once to remove the unique index on firebaseUid
// Save as: scripts/removeFirebaseUidIndex.js

require('dotenv').config(); // Load .env file
const { MongoClient } = require('mongodb');

async function removeUniqueIndex() {
  const client = new MongoClient(process.env.DATABASE_URL);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const collection = db.collection('User');
    
    // List all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);
    
    // Drop the firebaseUid unique index
    try {
      await collection.dropIndex('firebaseUid_1');
      console.log('✅ Successfully dropped firebaseUid_1 index');
    } catch (err) {
      if (err.code === 27) {
        console.log('Index does not exist');
      } else {
        throw err;
      }
    }
    
    // Alternative: try dropping by key pattern
    try {
      await collection.dropIndex({ firebaseUid: 1 });
      console.log('✅ Successfully dropped firebaseUid index');
    } catch (err) {
      if (err.code === 27) {
        console.log('Index does not exist (by key pattern)');
      } else {
        console.log('Could not drop by key pattern:', err.message);
      }
    }
    
    // Verify indexes after removal
    const updatedIndexes = await collection.indexes();
    console.log('Indexes after removal:', updatedIndexes);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

removeUniqueIndex();