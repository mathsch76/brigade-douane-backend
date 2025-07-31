import express from 'express';
import cors from 'cors';
import { config } from './config-simple';

const app = express();

app.use(cors());
app.use(express.json());

// ✨ INJECTION 4 : OpenAI Assistant Simple (un seul bot)
async function askOpenAIAssistant(message: string, assistantId: string) {
  try {
    if (!config.openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const headers = {
      'Authorization': `Bearer ${config.openaiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    };

    // 1. Créer un thread
    const threadResponse = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    if (!threadResponse.ok) {
      throw new Error(`Thread creation failed: ${threadResponse.status}`);
    }

    const thread = await threadResponse.json();

    // 2. Ajouter le message
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        role: 'user',
        content: message
      })
    });

    if (!messageResponse.ok) {
      throw new Error(`Message creation failed: ${messageResponse.status}`);
    }

    // 3. Lancer l'assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        assistant_id: assistantId
      })
    });

    if (!runResponse.ok) {
      throw new Error(`Run creation failed: ${runResponse.status}`);
    }

    const run = await runResponse.json();

    // 4. Attendre la completion (polling simple)
    let runStatus = run;
    let attempts = 0;
    const maxAttempts = 30;

    while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
      if (attempts >= maxAttempts) {
        throw new Error('Assistant response timeout');
      }

      await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1 seconde

      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers
      });

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }

      runStatus = await statusResponse.json();
      attempts++;
    }

    if (runStatus.status !== 'completed') {
      throw new Error(`Assistant failed with status: ${runStatus.status}`);
    }

    // 5. Récupérer la réponse
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      headers
    });

    if (!messagesResponse.ok) {
      throw new Error(`Messages retrieval failed: ${messagesResponse.status}`);
    }

    const messages = await messagesResponse.json();
    const assistantMessage = messages.data.find((msg: any) => msg.role === 'assistant');

    if (!assistantMessage) {
      throw new Error('No assistant response found');
    }

    return {
      success: true,
      response: assistantMessage.content[0].text.value,
      threadId: thread.id,
      runId: run.id,
      processingTime: attempts
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ✨ NOUVELLE ROUTE : Ask Assistant
app.post('/assistant/ask', async (req, res) => {
  try {
    const { message, assistant } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Message is required'
      });
    }

    // Assistant par défaut : COLONEL EMEBI
    const assistantId = assistant || process.env.ASSISTANT_EMEBI;
    
    if (!assistantId) {
      return res.status(500).json({
        error: 'No assistant configured'
      });
    }

    const result = await askOpenAIAssistant(message, assistantId);

    if (result.success) {
      res.json({
        message: 'Assistant response received',
        response: result.response,
        assistant: assistant || 'COLONEL_EMEBI',
        thread_id: result.threadId,
        processing_time_seconds: result.processingTime
      });
    } else {
      res.status(500).json({
        error: 'Assistant request failed',
        details: result.error
      });
    }

  } catch (error) {
    res.status(500).json({
      error: 'Assistant service error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ✨ NOUVELLE ROUTE : Test Assistant Config
app.get('/api/assistant-test', (req, res) => {
  res.json({
    message: 'Assistant configuration test',
    openai_key: !!config.openaiKey,
    assistants: {
      colonel_emebi: !!process.env.ASSISTANT_EMEBI,
      capitaine_macf: !!process.env.ASSISTANT_MACF,
      colonel_eudr: !!process.env.ASSISTANT_EUDR,
      capitaine_sanctions: !!process.env.ASSISTANT_SANCTIONS
    },
    available_assistant: process.env.ASSISTANT_EMEBI ? 'COLONEL_EMEBI' : 'none'
  });
});

// ✨ JWT Auth (from injection 3)
function base64UrlDecode(str: string): string {
  str = (str + '===').slice(0, str.length + (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

function createSimpleJWT(payload: any): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signature = Buffer.from(`${encodedHeader}.${encodedPayload}.${config.jwtSecret}`).toString('base64url').slice(0, 43);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifySimpleJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

// Routes Auth (from injection 3)
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password required'
      });
    }

    if (email === 'test@naoandco.com' && password === 'test123') {
      const payload = {
        id: 1,
        email: email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
      };
      
      const token = createSimpleJWT(payload);
      
      res.json({
        message: 'Login successful',
        token: token,
        user: {
          id: 1,
          email: email
        },
        expires_in: '24h'
      });
    } else {
      res.status(401).json({
        error: 'Invalid credentials'
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Login failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

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

// ✨ Supabase (from injection 2)
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

// Routes existantes
app.get('/api/db-test', async (req, res) => {
  const result = await testSupabaseConnection();
  
  if (result.success) {
    res.json({
      message: 'Supabase connection successful!',
      status: 'connected',
      url: config.supabaseUrl,
      test_timestamp: new Date().toISOString(),
      version: '1.4-with-openai'
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
    message: 'Config test - Enhanced with OpenAI',
    variables_found: {
      supabase_url: !!config.supabaseUrl,
      supabase_key: !!config.supabaseKey,
      jwt_secret: !!config.jwtSecret,
      openai_key: !!config.openaiKey
    },
    supabase_connection: supabaseTest.success ? 'working' : 'failed',
    auth_system: 'simple-jwt-ready',
    openai_assistant: !!process.env.ASSISTANT_EMEBI ? 'configured' : 'missing'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'NAO&CO Backend is running!',
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.4-with-openai',
    features: ['config', 'supabase-fetch', 'jwt-auth', 'openai-assistant']
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    time: new Date().toISOString(),
    env: config.nodeEnv,
    features: ['auth', 'database', 'ai-assistant']
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
    version: '1.4-with-openai'
  });
});

app.listen(config.port, () => {
  console.log(`🚀 NAO&CO Server running on port ${config.port}`);
  console.log(`🔧 Config loaded: ${config.nodeEnv}`);
  console.log(`📊 Features: Config + Supabase + JWT Auth + OpenAI Assistant`);
});

export default app;