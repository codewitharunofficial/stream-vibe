// lib/mongodb.js
import mongoose from 'mongoose';

let isConnected = false;

export const connectToDatabase = async () => {
  if (isConnected) return;

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'stream-vibe',
    });

    isConnected = true;
    console.log('[MongoDB] Connected');
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err);
    throw err;
  }
};
