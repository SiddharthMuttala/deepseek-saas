const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// Render-specific configuration - CRITICAL
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0'; // MUST be 0.0.0.0 for Render

// Middleware
app.use(cors({
  origin: [
    process.env.CORS_ORIGIN,
    'http://localhost:5173',
    'https://codeforcesai.onrender.com', // Your Render URL
    process.env.RENDER_EXTERNAL_URL // Render provides this
  ].filter(Boolean),
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization']
}));

app.use(express.json());

// Track connection state
let isDBConnected = false;

// SIMPLIFIED Database Connection - Non-blocking
async function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    console.log('⚠️  MONGODB_URI not set. Running without database.');
    return null;
  }

  if (isDBConnected) {
    console.log('✅ Using existing MongoDB connection');
    return mongoose.connection;
  }

  console.log('🔗 Connecting to MongoDB...');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Shorter timeout for faster startup
      socketTimeoutMS: 45000,
    });
    
    isDBConnected = true;
    console.log('✅ MongoDB connected successfully');
    console.log(`📁 Database: ${mongoose.connection.name}`);
    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('⚠️  App will run in mock mode (database features disabled)');
    return null;
  }
}

// Connection events
mongoose.connection.on('connected', () => {
  console.log('🔄 Mongoose connected to DB');
  isDBConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err.message);
  isDBConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  Mongoose disconnected from DB');
  isDBConnected = false;
});

// ========== ROUTES ==========

// 1. Health check route - NO DB dependency (Render monitors this)
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
    message: 'Codeforces AI API is running on Render',
    timestamp: new Date().toISOString(),
    database: dbStatusText,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    port: PORT,
    host: HOST,
    node_version: process.version,
    render_url: 'https://codeforcesai.onrender.com',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 2. Root route - Simple welcome
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Codeforces AI API',
    version: '1.0.0',
    status: 'running',
    database: isDBConnected ? 'connected' : 'disconnected/mock',
    endpoints: {
      health: '/api/health',
      test: '/test',
      api_root: '/api',
      auth: '/api/auth/* (if configured)',
      deepseek: '/api/deepseek/* (if configured)'
    },
    documentation: 'Visit /api/health for detailed status'
  });
});

// 3. Test endpoint
app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Server is working!',
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });
});

// 4. API Root
app.get('/api', (req, res) => {
  res.json({
    service: 'Codeforces AI API',
    status: 'operational',
    database: isDBConnected ? 'connected' : 'disconnected',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /',
      'GET /test',
      'GET /api',
      'GET /api/health',
      'GET /api/test-db',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/deepseek/generate'
    ]
  });
});

// 5. Test database endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    if (!isDBConnected) {
      // Try to connect if not connected
      await connectToDatabase();
    }
    
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: false,
        message: 'Database not connected',
        readyState: mongoose.connection.readyState,
        suggestion: 'Check MONGODB_URI environment variable'
      });
    }
    
    // Test a simple query
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    res.json({
      success: true,
      message: 'Database connection successful!',
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      collections: collections.map(c => c.name),
      readyState: mongoose.connection.readyState,
      isDBConnected: isDBConnected
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database test failed',
      error: error.message,
      readyState: mongoose.connection.readyState
    });
  }
});

// Database connection middleware
const ensureDBConnection = async (req, res, next) => {
  if (!isDBConnected && process.env.MONGODB_URI) {
    try {
      await connectToDatabase();
      next();
    } catch (error) {
      return res.status(503).json({
        error: 'Database service unavailable',
        message: 'Database features are currently disabled',
        mode: 'mock',
        timestamp: new Date().toISOString()
      });
    }
  } else {
    next();
  }
};

// ========== DYNAMIC ROUTE LOADING ==========

// Try to load routes if they exist, but don't crash if they don't
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', ensureDBConnection, authRoutes);
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.log('⚠️  Auth routes not found, skipping...');
  // Provide a mock auth endpoint
  app.post('/api/auth/login', (req, res) => {
    res.json({
      success: false,
      message: 'Auth module not loaded',
      error: 'Check server logs'
    });
  });
}

try {
  const deepseekRoutes = require('./routes/deepseek');
  app.use('/api/deepseek', ensureDBConnection, deepseekRoutes);
  console.log('✅ DeepSeek routes loaded');
} catch (error) {
  console.log('⚠️  DeepSeek routes not found, skipping...');
  // Provide a mock endpoint
  app.post('/api/deepseek/generate', (req, res) => {
    res.json({
      success: false,
      message: 'DeepSeek module not loaded',
      error: 'Check server logs'
    });
  });
}

// ========== ERROR HANDLERS ==========

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    requested: req.originalUrl,
    available_endpoints: [
      'GET /',
      'GET /test',
      'GET /api',
      'GET /api/health',
      'GET /api/test-db',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'POST /api/deepseek/generate'
    ],
    tip: 'Check the /api endpoint for all available routes'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Server error:', err.message);
  console.error(err.stack);
  
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// ========== START SERVER ==========

// Start server immediately (don't wait for DB)
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server started successfully!`);
  console.log(`📍 Internal: ${HOST}:${PORT}`);
  console.log(`🌐 External: https://codeforcesai.onrender.com`);
  console.log(`📊 Health check: https://codeforcesai.onrender.com/api/health`);
  console.log(`⚙️  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔄 Node version: ${process.version}`);
  
  // Try to connect to DB in background (non-blocking)
  if (process.env.MONGODB_URI) {
    console.log('🔗 Attempting to connect to MongoDB in background...');
    connectToDatabase().then(() => {
      console.log('✅ Database initialization complete');
    }).catch(() => {
      console.log('⚠️  Database features disabled - running in mock mode');
    });
  } else {
    console.log('⚠️  MONGODB_URI not set - running without database');
  }
});

// ========== GRACEFUL SHUTDOWN ==========

process.on('SIGTERM', () => {
  console.log('🔻 SIGTERM received. Shutting down gracefully...');
  
  if (mongoose.connection.readyState === 1) {
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  console.log('🔻 SIGINT received. Shutting down...');
  
  if (mongoose.connection.readyState === 1) {
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error.message);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

module.exports = app; // For testing