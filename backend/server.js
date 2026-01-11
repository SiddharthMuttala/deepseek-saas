const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization']
}));
app.use(express.json());

// Track connection state
let isDBConnected = false;
let dbConnectionPromise = null;

// Enhanced MongoDB Connection Function
async function connectToDatabase() {
  if (isDBConnected) {
    console.log('✅ Using existing MongoDB connection');
    return mongoose.connection;
  }

  if (dbConnectionPromise) {
    console.log('⏳ MongoDB connection already in progress...');
    return dbConnectionPromise;
  }

  console.log('Attempting to connect to MongoDB...');
  console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Set (hidden for security)' : 'Not set');

  const connectionOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 50000,    // Increased to 10 seconds
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    maxPoolSize: 10,
    minPoolSize: 1,
    retryWrites: true,
    w: 'majority',
    // For MongoDB Atlas (auto-detected from connection string)
  };

  // Add TLS/SSL options for Atlas
  if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('mongodb+srv://')) {
    connectionOptions.ssl = true;
    connectionOptions.tls = true;
    connectionOptions.tlsAllowInvalidCertificates = false;
  }

  dbConnectionPromise = mongoose.connect(
    process.env.MONGODB_URI || 'mongodb://localhost:27017/deepseek-saas',
    connectionOptions
  )
    .then(() => {
      console.log('✅ MongoDB connected successfully');
      console.log(`📁 Database: ${mongoose.connection.name}`);
      console.log(`🎯 Host: ${mongoose.connection.host}`);
      isDBConnected = true;
      return mongoose.connection;
    })
    .catch((err) => {
      console.error('❌ MongoDB connection error:', err.message);
      console.log('\n💡 Troubleshooting:');
      console.log('1. Check if MongoDB is running locally: mongod');
      console.log('2. For Atlas: Check connection string in .env');
      console.log('3. Check network access/whitelist');
      console.log('4. Using mock mode for now - app will still run');
      
      // Reset promise to allow retry
      dbConnectionPromise = null;
      throw err;
    });

  return dbConnectionPromise;
}

// Connection events
mongoose.connection.on('connected', () => {
  console.log('🔄 Mongoose connected to DB');
  isDBConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err.message);
  isDBConnected = false;
  dbConnectionPromise = null;
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  Mongoose disconnected from DB');
  isDBConnected = false;
  dbConnectionPromise = null;
});

// Database connection middleware - ENSURES DB IS CONNECTED BEFORE QUERIES
const ensureDBConnection = async (req, res, next) => {
  try {
    if (!isDBConnected) {
      console.log('🔄 Ensuring database connection before processing request...');
      await connectToDatabase();
    }
    next();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    res.status(503).json({
      error: 'Database service unavailable',
      message: 'Please try again later',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Apply middleware to all API routes that need DB access
const dbDependentRoutes = ['/api/auth', '/api/deepseek', '/api/test-db'];

// Health check route - NO DB dependency
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  let dbStatusText = 'unknown';
  
  switch(dbStatus) {
    case 0: dbStatusText = 'disconnected'; break;
    case 1: dbStatusText = 'connected'; break;
    case 2: dbStatusText = 'connecting'; break;
    case 3: dbStatusText = 'disconnecting'; break;
  }
  
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: dbStatusText,
    uptime: process.uptime(),
    port: process.env.PORT || 5001,
    node_version: process.version
  });
});

// Basic route - NO DB dependency
app.get('/api', (req, res) => {
  res.json({
    message: 'DeepSeek SaaS API',
    version: '1.0.0',
    status: 'running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    endpoints: {
      health: '/api/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        test: 'GET /api/auth/test'
      },
      deepseek: {
        generate: 'POST /api/deekseek/generate',
        prompts: 'GET /api/deepseek/prompts',
        test: 'GET /api/deepseek/test'
      }
    }
  });
});

// Test MongoDB route - WITH DB connection check
app.get('/api/test-db', ensureDBConnection, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'Database not connected',
        readyState: mongoose.connection.readyState
      });
    }
    
    // Test a simple query
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    res.json({
      success: true,
      message: 'Database is working!',
      database: mongoose.connection.name,
      collections: collections.map(c => c.name),
      readyState: mongoose.connection.readyState,
      isDBConnected: isDBConnected
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      readyState: mongoose.connection.readyState,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Import routes
const authRoutes = require('./routes/auth');
const deepseekRoutes = require('./routes/deepseek');

// Use routes with DB connection middleware
app.use('/api/auth', ensureDBConnection, authRoutes);
app.use('/api/deepseek', ensureDBConnection, deepseekRoutes);

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API endpoint not found',
    requested: req.originalUrl,
    available_endpoints: ['/api/health', '/api/auth/*', '/api/deepseek/*']
  });
});

// Root 404
app.use((req, res) => {
  if (req.path !== '/') {
    res.status(404).json({ error: 'Route not found' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server with DB connection
async function startServer() {
  try {
    // Connect to MongoDB before starting server
    await connectToDatabase();
    
    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
      console.log(`✅ Database: ${isDBConnected ? 'Connected' : 'Disconnected'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔗 Home page: http://localhost:${PORT}/`);
      console.log(`🔗 Test DB: http://localhost:${PORT}/api/test-db`);
      console.log(`🔗 Auth test: http://localhost:${PORT}/api/auth/test`);
    });
  } catch (error) {
    console.error('❌ Failed to start server due to database connection error:', error.message);
    
    // Start server anyway (mock mode)
    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
      console.log(`⚠️  Server running in MOCK MODE (no database) on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log('Note: Database-dependent routes will return 503 errors');
    });
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔻 Gracefully shutting down...');
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
  process.exit(0);
});

// Start the server
startServer();