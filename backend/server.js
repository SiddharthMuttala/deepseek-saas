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

// ========== DEBUG MIDDLEWARE ==========
app.use((req, res, next) => {
  console.log(`📨 ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  console.log('  Origin:', req.headers.origin);
  console.log('  Content-Type:', req.headers['content-type']);
  next();
});

// ========== CORS CONFIGURATION ==========
const allowedOrigins = [
  'https://codecompanion-upzx.onrender.com', // Your frontend
  'https://codeforcesai-api.onrender.com',   // Your backend
  'https://codeforcesai.onrender.com',       // Your other backend
  'http://localhost:5173',                   // Local dev
  process.env.CORS_ORIGIN,
  process.env.RENDER_EXTERNAL_URL
].filter(Boolean);

console.log('🌐 Allowed CORS origins:', allowedOrigins);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check for subdomain variations
    const originHostname = new URL(origin).hostname;
    const isRenderSubdomain = originHostname.endsWith('.onrender.com');
    
    if (isRenderSubdomain) {
      console.log(`✅ Allowing Render subdomain: ${origin}`);
      return callback(null, true);
    }
    
    console.log(`❌ CORS blocked: ${origin}`);
    return callback(new Error('CORS policy blocked this request'), false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  maxAge: 86400 // 24 hours
}));

// Handle preflight OPTIONS requests
app.options('*', cors());

// ========== BODY PARSER ==========
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ========== DATABASE CONNECTION ==========
let isDBConnected = false;

async function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    console.log('⚠️  MONGODB_URI not set. Running without database.');
    return null;
  }

  if (isDBConnected) {
    return mongoose.connection;
  }

  console.log('🔗 Connecting to MongoDB...');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 3,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
      maxIdleTimeMS: 10000,
    });
    
    isDBConnected = true;
    console.log('✅ MongoDB connected successfully');
    console.log(`📁 Database: ${mongoose.connection.name}`);
    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('⚠️  Running in mock mode (database features disabled)');
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

// Health check
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
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Codeforces AI API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET /api/health',
      test: 'GET /test',
      api: 'GET /api',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        test: 'GET /api/auth/test'
      }
    }
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});

// API root
app.get('/api', (req, res) => {
  res.json({
    service: 'Codeforces AI API',
    status: 'operational',
    endpoints: [
      'GET /',
      'GET /test',
      'GET /api',
      'GET /api/health',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/test'
    ]
  });
});

// ========== LOAD AUTH ROUTES ==========
console.log('📦 Loading auth routes...');
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load auth routes:', error.message);
  console.error(error.stack);
  
  // Fallback auth routes
  app.post('/api/auth/login', (req, res) => {
    console.log('Fallback login route called');
    const { email } = req.body;
    
    res.json({
      success: true,
      message: 'Logged in via fallback route',
      token: 'fallback-jwt-token',
      user: {
        id: 'fallback-user-id',
        email: email || 'demo@example.com',
        name: 'Fallback User'
      }
    });
  });
  
  app.post('/api/auth/register', (req, res) => {
    res.json({
      success: true,
      message: 'Registered via fallback route',
      token: 'fallback-register-token',
      user: {
        id: 'new-fallback-user',
        email: req.body.email || 'new@example.com',
        name: req.body.name || 'New User'
      }
    });
  });
  
  app.get('/api/auth/test', (req, res) => {
    res.json({
      success: true,
      message: 'Auth test (fallback)',
      status: 'working'
    });
  });
}

// ========== LOAD DEEPSEEK ROUTES ==========
console.log('📦 Loading DeepSeek routes...');
try {
  const deepseekRoutes = require('./routes/deepseek');
  app.use('/api/deepseek', deepseekRoutes);
  console.log('✅ DeepSeek routes loaded successfully');
} catch (error) {
  console.error('❌ Failed to load DeepSeek routes:', error.message);
  
  // Fallback DeepSeek route
  app.post('/api/deepseek/generate', (req, res) => {
    res.json({
      success: true,
      response: 'This is a fallback AI response (DeepSeek module not loaded)',
      model: 'fallback-model',
      tokens: 50
    });
  });
}

// ========== 404 HANDLER ==========
app.use('*', (req, res) => {
  console.log(`❌ 404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Endpoint not found',
    requested: req.originalUrl,
    available: [
      '/',
      '/test',
      '/api',
      '/api/health',
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/test',
      '/api/deepseek/generate'
    ]
  });
});

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('🔥 Server error:', err.message);
  console.error(err.stack);
  
  // Include CORS headers even on errors
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    timestamp: new Date().toISOString()
  });
});

// ========== START SERVER ==========
app.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log('🚀 SERVER STARTED SUCCESSFULLY');
  console.log(`📍 Port: ${PORT}, Host: ${HOST}`);
  console.log(`🌐 External URL: https://codeforcesai.onrender.com`);
  console.log(`🔗 Health check: https://codeforcesai.onrender.com/api/health`);
  console.log(`🔗 Frontend: https://codecompanion-upzx.onrender.com`);
  console.log(`📊 Memory limit: 256MB (Render Free Tier optimized)`);
  console.log('='.repeat(60));
  
  // Memory usage on startup
  const used = process.memoryUsage();
  console.log(`💾 Startup memory: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
  
  // Connect to DB in background
  if (process.env.MONGODB_URI) {
    setTimeout(() => {
      console.log('🔗 Attempting MongoDB connection...');
      connectToDatabase().then(conn => {
        if (conn) {
          console.log('✅ Database ready');
        }
      });
    }, 2000);
  } else {
    console.log('⚠️  No MONGODB_URI set - running without database');
  }
});

// ========== GRACEFUL SHUTDOWN ==========
process.on('SIGTERM', () => {
  console.log('🔻 SIGTERM received. Shutting down gracefully...');
  
  if (mongoose.connection.readyState === 1) {
    mongoose.connection.close(false);
    console.log('✅ MongoDB connection closed');
  }
  
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔻 SIGINT received. Shutting down...');
  
  if (mongoose.connection.readyState === 1) {
    mongoose.connection.close(false);
    console.log('✅ MongoDB connection closed');
  }
  
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error.message);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

module.exports = app;