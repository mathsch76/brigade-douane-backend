import express from 'express';
import cors from 'cors';
import { config } from './config-simple';

const app = express();

app.use(cors());
app.use(express.json());

// ✨ SUPABASE sans dépendance externe (test via fetch)
async function testSupabaseConnection() {
  try {
    if (!config.supabaseUrl || !config.supabaseKey) {
      return { 
        success: false, 
        error: 'Missing Supabase credentials' 
      };
    }

    // Test simple via API REST Supabase
    const response = await fetch(`${config.supabaseUrl}/rest/v1/users?select=count&limit=1`, {
      headers: {
        'Authorization': `Bearer ${config.supabaseKey}`,
        'apikey': config.supabaseKey,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      return { 
        success: true, 
        status: response.status,
        url: config.supabaseUrl 
      };
    } else {
      return { 
        success: false, 
        error: `HTTP ${response.status}`,
        details: await response.text()
      };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ✨ NOUVELLE ROUTE : Test connexion Supabase
app.get('/api/db-test', async (req, res) => {
  const result = await testSupabaseConnection();
  
  if (result.success) {
    res.json({
      message: 'Supabase connection successful!',
      status: 'connected',
      url: config.supabaseUrl,
      test_timestamp: new Date().toISOString(),
      version: '1.2-with-supabase-fetch'
    });
  } else {
    res.status(500).json({
      error: 'Supabase connection failed',
      details: result.error,
      timestamp: new Date().toISOString()
    });
  }
});

// Route config test améliorée
app.get('/api/config-test', async (req, res) => {
  const supabaseTest = await testSupabaseConnection();
  
  res.json({
    message: 'Config test - Enhanced with Supabase',
    variables_found: {
      supabase_url: !!config.supabaseUrl,
      supabase_key: !!config.supabaseKey,
      jwt_secret: !!config.jwtSecret,
      openai_key: !!config.openaiKey
    },
    supabase_connection: supabaseTest.success ? 'working' : 'failed',
    supabase_details: supabaseTest
  });
});

// Routes existantes
app.get('/', (req, res) => {
  res.json({ 
    message: 'NAO&CO Backend is running!',
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.2-with-supabase-fetch',
    features: ['config', 'supabase-fetch']
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    time: new Date().toISOString(),
    env: config.nodeEnv
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
    version: '1.2-with-supabase-fetch'
  });
});

app.listen(config.port, () => {
  console.log(`🚀 NAO&CO Server running on port ${config.port}`);
  console.log(`🔧 Config loaded: ${config.nodeEnv}`);
  console.log(`📊 Features: Config + Supabase (via fetch)`);
});

export default app;