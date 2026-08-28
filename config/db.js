import { MongoClient } from 'mongodb'

let client, db

export async function connectDB() {
  client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017')
  await client.connect()
  db = client.db(process.env.DB_NAME || 'coed')
  await db.collection('users').createIndex({ username: 1 }, { unique: true })
  await db.collection('users').createIndex({ email: 1 }, { unique: true })
  console.log('Connected to MongoDB')
}

export function getDB() {
  if (!db) throw new Error('DB not connected')
  return db
}
