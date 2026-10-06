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
    console.warn('MONGODB_URI is not configured. Falling back to persistent local storage.');
    return null;
  }
  if (diagnostics.hasWhitespace || diagnostics.hasQuotes) {
    console.warn('MONGODB_URI contains whitespace or quote characters. Check .env. Falling back to local storage.');
    return null;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log('Connected to MongoDB successfully.');
    return mongoose.connection;
  } catch (error) {
    console.warn('MongoDB connection could not be established:', error.message);
    console.warn('Operating in resilient local-persistent mode using db.json.');
    return null;
  }
}

mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection runtime event:', error.code || error.name || error.message);
});

