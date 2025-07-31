// config-simple.ts (VERSION AMÉLIORÉE POUR RAILWAY)
import dotenv from "dotenv";

// Ne charger .env que si on est en développement local
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

// Vérification des variables critiques au démarrage
const requiredEnvVars = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
} as const;

// Vérifier que toutes les variables obligatoires sont présentes
const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('❌ Variables d\'environnement manquantes:', missingVars.join(', '));
  throw new Error(`Variables d'environnement manquantes: ${missingVars.join(', ')}`);
}

export const config = {
  // Serveur
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4002', 10),
  
  // Supabase
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  
  // Authentication
  jwtSecret: process.env.JWT_SECRET!,
  
  // OpenAI
  openaiKey: process.env.OPENAI_API_KEY!,
  
  // Email (optionnel)
  resendKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM || 'noreply@naoandco.com',
  
  // Redis (optionnel)
  redisUrl: process.env.REDIS_URL,
  
  // Assistants OpenAI
  assistants: {
    emebi: process.env.ASSISTANT_EMEBI!,
    macf: process.env.ASSISTANT_MACF!,
    eudr: process.env.ASSISTANT_EUDR!,
    sanctions: process.env.ASSISTANT_SANCTIONS!,
  },
  
  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'https://naoandco-frontend-production.up.railway.app',
  
  // Logging
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',
};

// Log de démarrage pour vérifier la configuration
console.log('🔧 Configuration chargée:');
console.log(`📊 Environnement: ${config.nodeEnv}`);
console.log(`🌐 Port: ${config.port}`);
console.log(`🔐 Supabase: ${config.supabaseUrl ? '✅' : '❌'}`);
console.log(`🤖 OpenAI: ${config.openaiKey ? '✅' : '❌'}`);
console.log(`📧 Resend: ${config.resendKey ? '✅' : '❌'}`);
console.log(`🤖 Assistants: ${Object.values(config.assistants).every(Boolean) ? '✅ (4)' : '❌'}`);

export default config;