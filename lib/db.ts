import mongoose from 'mongoose';
const MONGODB_URI = process.env.MONGODB_URI!;
if (!MONGODB_URI) throw new Error('MONGODB_URI is not set');
let cached = (global as any).mongoose as { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
if (!cached) cached = (global as any).mongoose = { conn: null, promise: null };
const clientOptions:mongoose.ConnectOptions = { serverApi: { version: '1', strict: true, deprecationErrors: true } };

export async function dbConnect() {
  try {
    if (cached.conn) return cached.conn;
    if (!cached.promise) {
      cached.promise = mongoose.connect(MONGODB_URI, clientOptions).then(m => m);
    }
    cached.conn = await cached.promise;
    console.log('MongoDB connected successfully');
    return cached.conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}
