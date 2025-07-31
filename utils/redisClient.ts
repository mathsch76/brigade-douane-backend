import Redis from 'ioredis';
import config from './config';

const redis = config.isProd && process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : null;

export default redis;
