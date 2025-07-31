// routes/system.ts - Routes système et monitoring
import { Router } from 'express';
import { config } from '../config-simple';
import { assistantCache } from '../services/openai';

const router = Router();

// Test de connexion Supabase
async function testSupabaseConnection() {
  try {
    if (!config.supabaseUrl || !config.supabaseKey) {
      return { 
        success: false, 
        error: 'Missing Supabase credentials' 
      };
    }

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

// Route de santé
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    time: new Date().toISOString(),
    env: config.nodeEnv,
    version: '3.0-MODULAR',
    features: ['auth', 'database', 'ai-assistants', 'cache'],
    cache: assistantCache.getStats(),
    assistants: {
      emebi: !!process.env.ASSISTANT_EMEBI,
      macf: !!process.env.ASSISTANT_MACF,
      eudr: !!process.env.ASSISTANT_EUDR,
      sanctions: !!process.env.ASSISTANT_SANCTIONS
    }
  });
});

// Test des assistants IA
router.get('/assistant-test', (req, res) => {
  res.json({
    message: 'Assistant configuration test',
    openai_key: !!config.openaiKey,
    assistants: {
      colonel_emebi: !!process.env.ASSISTANT_EMEBI,
      capitaine_macf: !!process.env.ASSISTANT_MACF,
      colonel_eudr: !!process.env.ASSISTANT_EUDR,
      capitaine_sanctions: !!process.env.ASSISTANT_SANCTIONS
    },
    available_assistant: process.env.ASSISTANT_EMEBI ? 'EMEBI' : 'none',
    cache_stats: assistantCache.getStats()
  });
});

// Test de base de données
router.get('/db-test', async (req, res) => {
  const result = await testSupabaseConnection();
  
  if (result.success) {
    res.json({
      message: 'Supabase connection successful!',
      status: 'connected',
      url: config.supabaseUrl,
      test_timestamp: new Date().toISOString(),
      version: '3.0-MODULAR'
    });
  } else {
    res.status(500).json({
      error: 'Supabase connection failed',
      details: result.error,
      timestamp: new Date().toISOString()
    });
  }
});

// Test de configuration
router.get('/config-test', async (req, res) => {
  const supabaseTest = await testSupabaseConnection();
  
  res.json({
    message: 'Config test - MODULAR VERSION',
    variables_found: {
      supabase_url: !!config.supabaseUrl,
      supabase_key: !!config.supabaseKey,
      jwt_secret: !!config.jwtSecret,
      openai_key: !!config.openaiKey,
      redis_url: !!process.env.REDIS_URL
    },
    supabase_connection: supabaseTest.success ? 'working' : 'failed',
    auth_system: 'jwt-ready',
    openai_assistant: !!process.env.ASSISTANT_EMEBI ? 'configured' : 'missing',
    cache_system: assistantCache.getStats(),
    assistants_status: {
      emebi: !!process.env.ASSISTANT_EMEBI,
      macf: !!process.env.ASSISTANT_MACF,
      eudr: !!process.env.ASSISTANT_EUDR,
      sanctions: !!process.env.ASSISTANT_SANCTIONS
    }
  });
});

// Statistiques du cache
router.get('/cache-stats', (req, res) => {
  res.json({
    message: 'Cache statistics',
    stats: assistantCache.getStats(),
    timestamp: new Date().toISOString()
  });
});

// Nettoyage du cache
router.delete('/cache/clear', (req, res) => {
  assistantCache.clear();
  res.json({
    message: 'Cache cleared successfully',
    timestamp: new Date().toISOString()
  });
});

export default router;