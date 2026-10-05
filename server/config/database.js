import mongoose from 'mongoose';

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  let hostname = null;
  if (uri) {
    try {
      hostname = new URL(uri).hostname;
    } catch {
      hostname = 'unparseable';
    }
  }
  const diagnostics = {
    configured: Boolean(uri),
    srvScheme: Boolean(uri?.startsWith('mongodb+srv://')),
    hostname,
    hasWhitespace: Boolean(uri && /\s/.test(uri)),
    hasQuotes: Boolean(uri && /["']/.test(uri)),
  };
  console.info('MongoDB URI diagnostics:', diagnostics);

  if (!uri) {
    throw new Error('MONGODB_URI is not configured. Add your MongoDB Atlas URI to the local .env file.');
  }
  if (diagnostics.hasWhitespace || diagnostics.hasQuotes) {
    throw new Error('MONGODB_URI contains whitespace or quote characters. Check the value in .env; the value was not modified.');
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('Connected to MongoDB.');
    return mongoose.connection;
  } catch (error) {
    throw new Error('MongoDB connection failed. Check MongoDB DNS resolution and Atlas network access.', { cause: error });
  }
}

mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error code:', error.code || error.name);
});
