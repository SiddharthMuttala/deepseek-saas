// ========== MEMORY OPTIMIZATION ==========
console.log('🔧 Starting with memory optimization for Render...');

// Set memory limit for Render free tier (256MB safety margin)
if (!process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = '--max-old-space-size=256';
}

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Disable mongoose buffering to save memory
mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', 30000);

const app = express();

// Render-specific configuration
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// ========== OPTIMIZED MIDDLEWARE ==========
// Limit CORS to essential origins only
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  'http://localhost:5173',
  'https://codeforcesai.onrender.com',
  process.env.RENDER_EXTERNAL_URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
  credentials: true,
  // Minimize headers to save memory
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization']
}));

// Limit request body size
app.use(express.json({ limit: '512kb' }));  // Reduced from default 1mb
app.use(express.urlencoded({ extended: true, limit: '512kb' }));

// ========== DATABASE CONNECTION (MEMORY EFFICIENT) ==========
let isDBConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 2;

async function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    console.log('⚠️  MONGODB_URI not set. Running without database.');
    return null;
  }

  if (isDBConnected) {
    return mongoose.connection;
  }

  connectionAttempts++;
  if (connectionAttempts > MAX_CONNECTION_ATTEMPTS) {
    console.log('⚠️  Max connection attempts reached. Running in mock mode.');
    return null;
  }

  console.log(`🔗 Attempting MongoDB connection (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})...`);
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 3,           // REDUCED from default 5-10
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,   // REDUCED from 45000
      connectTimeoutMS: 10000,
      maxIdleTimeMS: 10000,
      retryWrites: true,
      w: 'majority',
      // Disable unnecessary features
      autoIndex: false,         // Don't auto-create indexes
      // Optimize for memory
      maxStalenessSeconds: 90,
      heartbeatFrequencyMS: 10000
    });
    
    isDBConnected = true;
    console.log('✅ MongoDB connected (memory optimized)');
    console.log(`📊 Connection pool: ${mongoose.connection.poolSize} connections`);
    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
      console.log('⚠️  Running in mock mode to save memory');
      // Don't throw error, just return null
    }
    return null;
  }
}

// Connection events with memory cleanup
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
  // Clean up connection pool
  if (mongoose.connection.readyState === 0) {
    mongoose.connection.close();
  }
});

// ========== MEMORY MONITORING MIDDLEWARE ==========
let requestCount = 0;

app.use((req, res, next) => {
  requestCount++;
  if (requestCount % 50 === 0) { // Log every 50 requests
    const used = process.memoryUsage();
    console.log(`📊 Memory usage (request ${requestCount}):`);
    console.log(`   RSS: ${Math.round(used.rss / 1024 / 1024)} MB`);
    console.log(`   Heap Used: ${Math.round(used.heapUsed / 1024 / 1024)} MB`);
  }
  
  // Add timeout to prevent hanging requests
  req.setTimeout(30000, () => {
    console.log('⏰ Request timeout');
  });
  
  next();
});

// ========== OPTIMIZED ROUTES ==========

// 1. Health check (minimal response)
app.get('/api/health', (req, res) => {
  const used = process.memoryUsage();
  
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: {
      heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
      rss: `${Math.round(used.rss / 1024 / 1024)} MB`
    },
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    requestCount: requestCount
  });
});

// 2. Root route (minimal)
app.get('/', (req, res) => {
  res.json({
    message: 'Codeforces AI API',
    version: '1.0.0',
    status: 'running',
    memory: `Optimized for Render (${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used)`,
    endpoints: ['/', '/api/health', '/api/test', '/api']
  });
});

// 3. Test endpoint
app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});

// 4. API Root (streamlined)
app.get('/api', (req, res) => {
  res.json({
    service: 'Codeforces AI API',
    endpoints: {
      health: 'GET /api/health',
      test: 'GET /test',
      root: 'GET /'
    }
  });
});

// 5. Lightweight database test
app.get('/api/test-db', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    // Try to connect
    const connection = await connectToDatabase();
    if (!connection || connection.readyState !== 1) {
      return res.json({
        success: false,
        message: 'Database not available',
        mode: 'mock',
        suggestion: 'Check MONGODB_URI environment variable'
      });
    }
  }
  
  try {
    // Simple ping instead of listing collections (saves memory)
    await mongoose.connection.db.admin().ping();
    
    res.json({
      success: true,
      message: 'Database is responsive',
      database: mongoose.connection.name,
      readyState: mongoose.connection.readyState
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Database ping failed',
      error: error.message
    });
  }
});

// Database connection middleware (lightweight)
const ensureDBConnection = async (req, res, next) => {
  if (mongoose.connection.readyState !== 1 && process.env.MONGODB_URI) {
    try {
      await connectToDatabase();
    } catch (error) {
      // Silent fail - continue without DB
    }
  }
  next();
};

// ========== LAZY LOAD HEAVY ROUTES ==========
let routesLoaded = false;

const loadRoutesLazily = () => {
  if (!routesLoaded) {
    try {
      // Auth routes
      const authRoutes = require('./routes/auth');
      app.use('/api/auth', ensureDBConnection, authRoutes);
      console.log('✅ Auth routes loaded (lazy)');
    } catch (error) {
      console.log('⚠️  Auth routes not available');
      app.post('/api/auth/login', (req, res) => {
        res.json({ error: 'Auth module not loaded' });
      });
    }
    
    try {
      // DeepSeek routes
      const deepseekRoutes = require('./routes/deepseek');
      app.use('/api/deepseek', ensureDBConnection, deepseekRoutes);
      console.log('✅ DeepSeek routes loaded (lazy)');
    } catch (error) {
      console.log('⚠️  DeepSeek routes not available');
      app.post('/api/deepseek/generate', (req, res) => {
        res.json({ error: 'DeepSeek module not loaded' });
      });
    }
    
    routesLoaded = true;
  }
};

// Trigger lazy loading on first API call
app.use('/api/auth', (req, res, next) => {
  loadRoutesLazily();
  next();
});

app.use('/api/deepseek', (req, res, next) => {
  loadRoutesLazily();
  next();
});

// ========== MEMORY CLEANUP ==========
setInterval(() => {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  
  if (heapUsedMB > 200) { // Warning at 200MB
    console.log(`⚠️  High memory usage: ${heapUsedMB}MB`);
    
    // Force garbage collection if available
    if (global.gc) {
      console.log('🗑️  Running garbage collection...');
      global.gc();
    }
    
    // Reset connection if memory is high
    if (heapUsedMB > 250 && mongoose.connection.readyState === 1) {
      console.log('🔄 Recycling MongoDB connection to free memory...');
      mongoose.connection.close();
      isDBConnected = false;
    }
  }
}, 30000); // Check every 30 seconds

// ========== ERROR HANDLERS ==========
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    available: ['/', '/api/health', '/test', '/api']
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  
  // Don't send stack trace in production to save memory
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// ========== START SERVER ==========
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server started with memory optimization`);
  console.log(`📍 Port: ${PORT}, Host: ${HOST}`);
  console.log(`📊 Memory limit: 256MB (Render Free Tier optimized)`);
  console.log(`🌐 URL: https://codeforcesai.onrender.com`);
  
  // Memory usage on startup
  const used = process.memoryUsage();
  console.log(`💾 Startup memory: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
  
  // Connect to DB after delay (non-blocking)
  setTimeout(() => {
    if (process.env.MONGODB_URI) {
      console.log('🔗 Starting background database connection...');
      connectToDatabase().then(conn => {
        if (conn) {
          console.log('✅ Database ready');
        }
      });
    }
  }, 3000);
});

// ========== GRACEFUL SHUTDOWN ==========
const shutdown = async () => {
  console.log('🔻 Shutting down gracefully...');
  
  // Close MongoDB connection
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close(false);
    console.log('✅ MongoDB connection closed');
  }
  
  // Give time for cleanup
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 1000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors (memory leak prevention)
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  // Don't crash, log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise);
  // Log and continue
});

module.exports = app;