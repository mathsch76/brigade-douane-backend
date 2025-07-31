import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4002;

// Middleware basique
app.use(cors());
app.use(express.json());

// Routes de base
app.get('/', (req, res) => {
  res.json({ 
    message: 'NAO&CO Backend is running!',
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.0-minimal'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    test: 'API fonctionne !',
    variables: {
      jwt_secret: !!process.env.JWT_SECRET,
      supabase_url: !!process.env.SUPABASE_URL,
      openai_key: !!process.env.OPENAI_API_KEY,
      redis_url: !!process.env.REDIS_URL
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 NAO&CO Server running on port ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health`);
  console.log(`🧪 Test: http://localhost:${PORT}/api/test`);
});

export default app;