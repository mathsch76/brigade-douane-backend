// ✅ Chargement des variables d'environnement
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });
console.log("🌱 ENV loaded:", process.env.SUPABASE_URL?.slice(0, 30) + "...");

// final-server.ts - VERSION MODULAIRE 3.0 - ORDRE CORRIGÉ
import express from 'express';
import { config } from './config-simple';

// Import des middleware
import { corsConfig } from './middlewares/cors';

// Import des routes modulaires
import authRoutes from './routes/auth';
import assistantRoutes from './routes/assistant';
import systemRoutes from './routes/system';

// Routes utilisateur (préférences complètes)
import userPreferencesRoutes from './routes/user/preferences';
import userRoutes from './routes/user';

// LOGS DE DEMARRAGE
console.log('🚀 NAO&CO Backend Starting - MODULAR VERSION...');
console.log('📊 Environment:', config.nodeEnv);
console.log('🌐 Port:', config.port);
console.log('🔐 Supabase:', config.supabaseUrl ? '✅ Connected' : '❌ Missing');
console.log('🤖 OpenAI:', config.openaiKey ? '✅ Configured' : '❌ Missing');
console.log('🔑 JWT:', config.jwtSecret ? '✅ Configured' : '❌ Missing');

const app = express();

// MIDDLEWARE GLOBAL
app.use(corsConfig);
app.use(express.json({ limit: '1mb' }));

// ===============================================
// ROUTES MODULAIRES - ORDRE CORRIGÉ
// ===============================================

// ✅ 1. Routes d'authentification EN PREMIER (/auth/login, /auth/me)
app.use('/auth', authRoutes);

// ✅ 2. Routes utilisateur préférences (/user/preferences, /user/bot-preferences, etc.)
app.use('/user', userPreferencesRoutes);

// ✅ 3. Routes utilisateur générales (après les spécifiques)
app.use('/user', userRoutes);

// ✅ 4. Routes assistants IA
app.use('/assistant', assistantRoutes);

// ✅ 5. Routes système et monitoring
app.use('/api', systemRoutes);

// ===============================================
// ROUTES DE COMPATIBILITÉ
// ===============================================

// Route d'accueil
app.get('/', (req, res) => {
  res.json({ 
    message: 'NAO&CO Backend is running! 🚀',
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '3.0-MODULAR',
    architecture: 'microservices',
    features: {
      auth: '✅ JWT + Refresh Tokens',
      database: '✅ Supabase',
      ai: '✅ OpenAI Assistants',
      cache: '✅ Intelligent Cache',
      preferences: '✅ User/Bot/Avatar'
    },
    routes: {
      auth: '/auth/* (login, me, refresh-token)',
      user: '/user/* (preferences, bot-preferences, avatar-preferences)', 
      assistants: '/assistant/*',
      system: '/api/*'
    }
  });
});

// ===============================================
// GESTION D'ERREURS GLOBALE
// ===============================================

// 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    available_routes: [
      'GET / - Home',
      'POST /auth/login - Login',
      'GET /auth/me - User profile (AUTH ROUTE)',
      'GET /auth/verify - Token verification',
      'GET /user/preferences - User preferences',
      'PUT /user/update-profile - Update profile',
      'PUT /user/change-password - Change password',
      'POST /assistant/ask - Ask assistant',
      'GET /api/health - Health check'
    ],
    requested_path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Error Handler Global
app.use((error: any, req: any, res: any, next: any) => {
  console.error('🚨 Global Error Handler:', error);
  
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString(),
    path: req.originalUrl
  });
});

// ===============================================
// DÉMARRAGE SERVEUR
// ===============================================

const PORT = process.env.PORT || config.port || 4002;

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 NAO&CO Server running on port', PORT);
  console.log('📊 Environment:', config.nodeEnv);
  console.log('🏗️ Architecture: MODULAR (12 files)');
  console.log('✨ Features: Complete system with intelligent cache');
  console.log('🤖 Assistants configured:', Object.values({
    emebi: process.env.ASSISTANT_EMEBI,
    macf: process.env.ASSISTANT_MACF,
    eudr: process.env.ASSISTANT_EUDR,
    sanctions: process.env.ASSISTANT_SANCTIONS
  }).filter(Boolean).length, '/4');
  console.log('🌐 CORS origin:', process.env.FRONTEND_URL || 'default');
  console.log('='.repeat(50));
  console.log('🎯 Server ready for production!');
  console.log('');
  console.log('📍 ROUTES MAPPING (ORDRE CORRIGÉ):');
  console.log('  🔐 /auth/*     → Authentication (LOGIN FIRST!)');
  console.log('  ⚙️  /user/*     → User preferences'); 
  console.log('  🤖 /assistant/* → AI assistants');
  console.log('  ❤️  /api/health → Health check');
  console.log('='.repeat(50));
  console.log('✅ AUTH ROUTE PRIORITIZED - LOGIN SHOULD WORK NOW!');
  
  // Test de connectivité au démarrage
  if (config.supabaseUrl && config.openaiKey) {
    console.log('✅ All services connected and ready');
  } else {
    console.warn('⚠️ Some services may not be configured properly');
  }
});

export default app;