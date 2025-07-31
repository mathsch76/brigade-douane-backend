// middleware/cors.ts
import cors from 'cors';

const allowedOrigins = [
  'http://localhost:5173',
  'https://naoandco-frontend-production.up.railway.app',
  'https://la-brigade-de-la-douane-front-production.up.railway.app'
];

export const corsConfig = cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('❌ CORS bloqué pour :', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});
