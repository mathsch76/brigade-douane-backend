import express from 'express';
import cors from 'cors';
import { config } from './config-simple';

const app = express();

app.use(cors());
app.use(express.json());

// ✨ INJECTION 3 : JWT Simple (sans dépendance externe)
function base64UrlDecode(str: string): string {
  str = (str + '===').slice(0, str.length + (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

function createSimpleJWT(payload: any): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  // Simple signature (version simplifiée, à améliorer en production)
  const signature = Buffer.from(`${encodedHeader}.${encodedPayload}.${config.jwtSecret}`).toString('base64url').slice(0, 43);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifySimpleJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    
    // Vérifier l'expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

// ✨ NOUVELLE ROUTE : Authentification simple
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password required'
      });
    }

    return res.status(401).json({
      error: 'Invalid credentials'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Login failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ✨ NOUVELLE ROUTE : Vérification token
app.get('/auth/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided'
      });
    }
    
    const token = authHeader.substring(7);
    const payload = verifySimpleJWT(token);
    
    if (!payload) {
      return res.status(401).json({
        error: 'Invalid or expired token'
      });
    }
    
    res.json({
      message: 'Token valid',
      user: {
        id: payload.id,
        email: payload.email
      },
      expires: new Date(payload.exp * 1000).toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Token verification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ✨ SUPABASE (from injection 2)
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

// Routes Supabase
app.get('/api/db-test', async (req, res) => {
  const result = await testSupabaseConnection();
  
  if (result.success) {
    res.json({
      message: 'Supabase connection successful!',
      status: 'connected',
      url: config.supabaseUrl,
      test_timestamp: new Date().toISOString(),
      version: '1.3-with-auth'
    });
  } else {
    res.status(500).json({
      error: 'Supabase connection failed',
      details: result.error,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/config-test', async (req, res) => {
  const supabaseTest = await testSupabaseConnection();
  
  res.json({
    message: 'Config test - Enhanced with Auth',
    variables_found: {
      supabase_url: !!config.supabaseUrl,
      supabase_key: !!config.supabaseKey,
      jwt_secret: !!config.jwtSecret,
      openai_key: !!config.openaiKey
    },
    supabase_connection: supabaseTest.success ? 'working' : 'failed',
    auth_system: 'simple-jwt-ready'
  });
});

// Routes existantes
app.get('/', (req, res) => {
  res.json({ 
    message: 'NAO&CO Backend is running!',
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.3-with-auth',
    features: ['config', 'supabase-fetch', 'jwt-auth']
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    time: new Date().toISOString(),
    env: config.nodeEnv,
    features: ['auth', 'database']
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
    version: '1.3-with-auth'
  });
});

app.listen(config.port, () => {
  console.log(`🚀 NAO&CO Server running on port ${config.port}`);
  console.log(`🔧 Config loaded: ${config.nodeEnv}`);
  console.log(`📊 Features: Config + Supabase + JWT Auth`);
});

export default app;
