// services/jwt.ts
import { config } from '../config-simple';

function base64UrlDecode(str: string): string {
  str = (str + '===').slice(0, str.length + (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

export function createSimpleJWT(payload: any): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signature = Buffer.from(`${encodedHeader}.${encodedPayload}.${config.jwtSecret}`).toString('base64url').slice(0, 43);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifySimpleJWT(token: string): any {
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