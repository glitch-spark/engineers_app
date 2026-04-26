const { MongoClient } = require('mongodb');

async function migrateRoles() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const collection = db.collection('userextras');
    
    // Check current roles in the database
    const roles = await collection.distinct('role');
    console.log('Current roles in database:', roles);
    
    // Update any users with invalid roles to 'staff'
    const result = await collection.updateMany(
      { role: { $nin: ['admin', 'staff', 'accountant'] } },
      { $set: { role: 'staff' } }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`Updated ${result.modifiedCount} users with invalid roles to 'staff'`);
    }
    
    // Verify the update
    const updatedRoles = await collection.distinct('role');
    console.log('Roles after migration:', updatedRoles);
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

migrateRoles();
