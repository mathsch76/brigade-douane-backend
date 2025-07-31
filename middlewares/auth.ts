import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface CustomRequest extends Request {
  user?: any;
}

export const verifyToken = (req: CustomRequest, res: Response, next: NextFunction) => {
  let token = req.cookies?.token;

  // ✅ Ajout : vérifie aussi le header Authorization
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Token manquant. Accès refusé.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('❌ Erreur de vérification du token:', err);
    return res.status(403).json({ message: 'Token invalide.' });
  }
};
