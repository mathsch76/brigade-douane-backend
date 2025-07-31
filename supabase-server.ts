import express from 'express';
import cors from 'cors';
import { config } from './config-simple';

const app = express();

app.use(cors());
app.use(express.json());

// ✨ INJECTION 2 : Supabase Client Simple
let supabaseClient: any = null;

// Import dynamique de Supabase
async function initSupabase() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    
    if (!config.supabaseUrl || !config.supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    supabaseClient = createClient(config.supabaseUrl, config.supabaseKey);
    console.log('✅ Supabase client initialized');
    return true;
  } catch (error) {
    console.error('❌ Supabase init failed:', error);
    return false;
  }
}

// ✨ NOUVELLE ROUTE : Test connexion DB
app.get('/api/db-test', async (req, res) => {
  try {
    if (!supabaseClient) {
      const initialized = await initSupabase();
      if (!initialized) {
        return res.status(500).json({
          error: 'Supabase client not initialized',
          details: 'Check environment variables'
        });
      }
    }

    // Test simple : récupérer les infos de la table users
    const { data, error, count } = await supabaseClient
      .from('users')
      .select('id', { count: 'exact' })
      .limit(1);

    if (error) {
      return res.status(500).json({
        error: 'Database query failed',
        details: error.message
      });
    }

    res.json({
      message: 'Database connection successful!',
      supabase_status: 'connected',
      users_table: 'accessible',
      total_users: count || 0,
      test_timestamp: new Date().toISOString(),
      version: '1.2-with-supabase'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Database test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Route config test améliorée
app.get('/api/config-test', (req, res) => {
  res.json({
    message: 'Config test - Enhanced',
    variables_found: {
      supabase_url: !!config.supabaseUrl,
      supabase_key: !!config.supabaseKey,
      jwt_secret: !!config.jwtSecret,
      openai_key: !!config.openaiKey
    },
    supabase_client: !!supabaseClient ? 'initialized' : 'not_initialized'
  });
});

// Routes existantes
app.get('/', (req, res) => {
  res.json({ 
    message: 'NAO&CO Backend is running!',
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.2-with-supabase',
    features: ['config', 'supabase']
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    time: new Date().toISOString(),
    env: config.nodeEnv,
    supabase: !!supabaseClient ? 'ready' : 'pending'
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    test: 'API fonctionne !',
    variables: {
      jwt_secret: !!config.jwtSecret,
      supabase_url: !!config.supabaseUrl,
      openai_key: !!config.openaiKey
    },
    version: '1.2-with-supabase'
  });
});

// Initialiser Supabase au démarrage
initSupabase();

app.listen(config.port, () => {
  console.log(`🚀 NAO&CO Server running on port ${config.port}`);
  console.log(`🔧 Config loaded: ${config.nodeEnv}`);
  console.log(`📊 Features: Config + Supabase`);
});

export default app;