// utils/config.ts - Configuration unifiée
import 'dotenv/config';
import path from 'path';

// Vérification des variables obligatoires
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY', 
  'JWT_SECRET',
  'OPENAI_API_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Variables d'environnement manquantes: ${missingVars.join(', ')}`);
}

const isProd = process.env.NODE_ENV === 'production';

const config = {
  // Serveur
  port: process.env.PORT || 4002,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: isProd,

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!
  },

  // Auth
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },

  // Sessions
  session: {
    secret: process.env.SESSION_SECRET || 'default-session-secret',
    cookie: {
      secure: isProd,
      httpOnly: true,
      sameSite: isProd ? 'strict' as const : 'lax' as const,
      maxAge: 24 * 60 * 60 * 1000 // 24 heures
    }
  },

  // CORS
  cors: {
    origin: isProd ? process.env.FRONTEND_URL || 'https://votre-domaine.fr' : 'http://localhost:5173',
    credentials: true
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    assistantId: process.env.OPENAI_ASSISTANT_ID,
    timeout: parseInt(process.env.OPENAI_TIMEOUT || '30000', 10)
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
    directory: path.join(__dirname, '..', 'logs')
  }
};

export default config;