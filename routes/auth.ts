import { supabase } from '../utils/supabase';
// auth-backend/routes/auth.ts - Version vraiment refactorisée
import express from "express";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";

import { v4 as uuidv4 } from 'uuid';
import logger from "../utils/logger";
import config from "../utils/config";
import { legacyAuthGuard, AuthenticatedRequest } from "../middlewares/authguard";
import { validate, sanitize } from '../middlewares/validate';
import { loginSchema, refreshTokenSchema, logoutSchema } from '../schemas/auth.schema';
import registerRouter from './register';
import { getCompanyLicenses } from '../services/licenseService';

const router = express.Router();



// 📝 Fonction pour récupérer les bots accessibles via logique BtoB
async function getAccessibleBots(userId: string): Promise<string[]> {
  try {
    // 1. Récupérer l'entreprise de l'utilisateur
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (userError || !userData?.company_id) {
      logger.error("❌ Utilisateur sans entreprise", { 
        error: userError?.message,
        userId
      });
      return [];
    }

    // 2. Récupérer les licences de l'entreprise (nouvelle logique BtoB)
    const licenses = await getCompanyLicenses(userData.company_id);
    
    if (!licenses || licenses.length === 0) {
      logger.warn("⚠️ Aucune licence trouvée pour l'entreprise", { 
        userId, 
        companyId: userData.company_id 
      });
      return [];
    }

    // 3. Extraire les noms des bots
    const botNames = licenses
      .map(license => license.bot_name)
      .filter(name => name !== undefined && name !== null);

    logger.info("✅ Bots accessibles récupérés (logique BtoB)", { 
      userId, 
      companyId: userData.company_id,
      botCount: botNames.length 
    });
    
    return botNames;
  } catch (err) {
    logger.error("❌ Erreur interne lors de la récupération des bots", { 
      error: (err as Error).message,
      userId
    });
    return [];
  }
}

// 🔑 Connexion
router.post("/login", sanitize, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || 'unknown';

  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("id, email, role, password_hash, first_name, last_name, first_login, company_id")
      .eq("email", email)
      .limit(1);

    if (error) {
      logger.error("❌ Erreur lors de la recherche de l'utilisateur", { 
        error: error.message 
      });
      return res.status(500).json({ error: "Erreur serveur." });
    }

    if (!users || users.length === 0) {
      logger.warn("❌ Utilisateur non trouvé", { email });
      return res.status(401).json({ error: "Identifiants invalides." });
    }

    const user = users[0];
    
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      logger.warn("❌ Mot de passe incorrect", { email });
      return res.status(401).json({ error: "Identifiants invalides." });
    }

    // Récupération des bots accessibles
    let accessibleBots: string[] = [];
    if (user.role === "admin") {
      logger.info("👑 Utilisateur admin connecté", { userId: user.id });
      const { data: allBots, error: botError } = await supabase
        .from("bots")
        .select("name");

      if (botError) {
        logger.error("❌ Erreur lors de la récupération des bots", { 
          error: botError.message 
        });
        return res.status(500).json({ error: "Erreur serveur lors de la récupération des bots." });
      }

      accessibleBots = allBots.map((bot: any) => bot.name);
    } else {
      // Nouvelle logique BtoB
      accessibleBots = await getAccessibleBots(user.id);
      if (accessibleBots.length === 0) {
        return res.status(403).json({ error: "Aucun bot accessible avec votre licence d'entreprise." });
      }
    }

    // Générer les tokens
const jwtPayload = { id: user.id, email: user.email, role: user.role };
    const jwtSecret = config.jwt.secret;
    const jwtOptions: jwt.SignOptions = { expiresIn: config.jwt.expiresIn as string || "2h" };
    const accessToken = jwt.sign(jwtPayload, jwtSecret, jwtOptions);
    
    // Générer un refresh token
    const refreshTokenId = uuidv4();
const refreshPayload = { id: user.id, tokenId: refreshTokenId };
    const refreshSecret = config.jwt.secret;
    const refreshOptions: jwt.SignOptions = { expiresIn: config.jwt.refreshExpiresIn as string || "7d" };
    const refreshToken = jwt.sign(refreshPayload, refreshSecret, refreshOptions);
    
    // Sauvegarder le refresh token
    const tokenHash = await bcrypt.hash((refreshToken as string).split('.')[2], 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    const { error: tokenError } = await supabase
      .from('refresh_tokens')
      .insert([
        { 
          user_id: user.id, 
          token_hash: tokenHash,
          expires_at: expiresAt,
          user_agent: userAgent,
          ip_address: ip,
          is_revoked: false
        }
      ]);
      
    if (tokenError) {
      logger.error("❌ Erreur lors de la sauvegarde du refresh token", { 
        error: tokenError.message,
        userId: user.id
      });
    }

    logger.info("🔑 Utilisateur connecté avec succès", { 
      userId: user.id, 
      role: user.role,
      companyId: user.company_id
    });

    return res.json({
      token: accessToken,
      refreshToken,
      role: user.role,
      firstLogin: user.first_login,
      bots: accessibleBots
    });
  } catch (err) {
    logger.error("❌ Erreur dans le processus de connexion", { 
      error: (err as Error).message
    });
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// 🔄 Rafraîchir le token
router.post("/refresh-token", sanitize, validate(refreshTokenSchema), async (req, res) => {
  const { refreshToken } = req.body;
  
  try {
    const decoded = jwt.decode(refreshToken) as { id: string, tokenId: string };
    if (!decoded || !decoded.id) {
      logger.warn("❌ Refresh token invalide (décodage)");
      return res.status(401).json({ error: "Refresh token invalide ou expiré." });
    }
    
    const userId = decoded.id;
    
    try {
      jwt.verify(refreshToken, config.jwt.secret);
    } catch (err) {
      logger.warn("❌ Refresh token invalide (signature)", { 
        error: (err as Error).message,
        userId
      });
      return res.status(401).json({ error: "Refresh token invalide ou expiré." });
    }
    
    const tokenSignature = refreshToken.split('.')[2];
    
    const { data: tokens, error } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('is_revoked', false)
      .gt('expires_at', new Date());
      
    if (error || !tokens || tokens.length === 0) {
      logger.warn("❌ Aucun refresh token valide trouvé en base", { userId });
      return res.status(401).json({ error: "Refresh token invalide ou expiré." });
    }
    
    let validToken = null;
    for (const token of tokens) {
      const isMatch = await bcrypt.compare(tokenSignature, token.token_hash);
      if (isMatch) {
        validToken = token;
        break;
      }
    }
    
    if (!validToken) {
      logger.warn("❌ Hash du refresh token non trouvé", { userId });
      return res.status(401).json({ error: "Refresh token invalide ou expiré." });
    }
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, role, first_name, last_name')
      .eq('id', userId)
      .single();
      
    if (userError || !user) {
      logger.warn("❌ Utilisateur non trouvé pour le refresh token", { userId });
      return res.status(401).json({ error: "Utilisateur non trouvé." });
    }
    
const refreshJwtPayload = { id: user.id, email: user.email, role: user.role };
    const refreshJwtSecret = config.jwt.secret;
    const refreshJwtOptions: jwt.SignOptions = { expiresIn: config.jwt.expiresIn as string || "2h" };
    const accessToken = jwt.sign(refreshJwtPayload, refreshJwtSecret, refreshJwtOptions);
    
    logger.info("🔄 Token rafraîchi avec succès", { userId: user.id });
    
    return res.json({
      token: accessToken,
      refreshToken: refreshToken
    });
  } catch (err) {
    logger.error("❌ Erreur lors du rafraîchissement du token", { 
      error: (err as Error).message
    });
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// 🚪 Déconnexion
router.post("/logout", sanitize, validate(logoutSchema), async (req, res) => {
  const { refreshToken } = req.body;
  
  try {
    const decoded = jwt.decode(refreshToken) as { id: string, tokenId: string };
    
    if (!decoded || !decoded.id) {
      logger.warn("❌ Token de déconnexion invalide");
      return res.status(401).json({ error: "Token non valide." });
    }
    
    const userId = decoded.id;
    const tokenSignature = refreshToken.split('.')[2];
    
    const { data: tokens, error } = await supabase
      .from('refresh_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('is_revoked', false);
      
    if (error) {
      logger.error("❌ Erreur lors de la recherche des tokens", { 
        error: error.message,
        userId
      });
      return res.status(500).json({ error: "Erreur serveur." });
    }
    
    let tokenRevoked = false;
    
    for (const token of tokens) {
      try {
        const isMatch = await bcrypt.compare(tokenSignature, token.token_hash);
        
        if (isMatch) {
          const { error: updateError } = await supabase
            .from('refresh_tokens')
            .update({ is_revoked: true })
            .eq('id', token.id);
            
          if (!updateError) {
            tokenRevoked = true;
            break;
          }
        }
      } catch (err) {
        logger.warn("❌ Erreur lors de la comparaison du hash", { 
          tokenId: token.id,
          error: (err as Error).message
        });
      }
    }
    
    if (!tokenRevoked) {
      await supabase
        .from('refresh_tokens')
        .update({ is_revoked: true })
        .eq('user_id', userId);
    }
    
    logger.info("🚪 Utilisateur déconnecté", { userId });
    
    return res.json({ message: "Déconnexion réussie." });
  } catch (err) {
    logger.error("❌ Erreur lors de la déconnexion", { 
      error: (err as Error).message
    });
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// 🔄 Route pour le changement de mot de passe lors du premier login
router.post("/first-login", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { newPassword, nickname } = req.body;
    const userId = req.user?.id;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const { error: updateError } = await supabase
      .from("users")
      .update({
        password_hash: hashedPassword,
        nickname: nickname || null,
        first_login: false
      })
      .eq("id", userId);

    if (updateError) {
      logger.error("❌ Erreur mise à jour first-login", {
        error: updateError.message,
        userId
      });
      return res.status(500).json({ error: "Erreur lors de la mise à jour." });
    }

    logger.info("✅ First-login complété", { userId, nickname });

    return res.json({ 
      success: true, 
      message: "Mot de passe mis à jour avec succès." 
    });

  } catch (err) {
    logger.error("❌ Erreur first-login", {
      error: (err as Error).message,
      userId: req.user?.id
    });
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// 🆕 Nouvelle route register avec logique BtoB
router.use('/register', registerRouter);

// 👤 Route /me pour récupérer les infos utilisateur + entreprise + licences
router.get("/me", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Utilisateur non authentifié." });
    }

    // Récupérer les infos utilisateur + entreprise
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(`
        id, email, first_name, last_name, role, company_id, nickname, first_login,
        companies (
          id, name, siren
        )
      `)
      .eq('id', userId)
      .single();

    if (userError || !user) {
      logger.error("❌ Erreur récupération utilisateur /me", { 
        error: userError?.message,
        userId 
      });
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Récupérer les bots accessibles (logique BtoB)
    const accessibleBots = await getAccessibleBots(userId);

    // Récupérer les licences de l'entreprise si elle existe
    let companyLicenses = [];
    if (user.company_id) {
      companyLicenses = await getCompanyLicenses(user.company_id);
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        nickname: user.nickname,
        first_login: user.first_login
      },
      company: user.companies || null,
      licenses: companyLicenses,
      accessible_bots: accessibleBots
    });

  } catch (err) {
    logger.error("❌ Erreur route /me", {
      error: (err as Error).message,
      userId: req.user?.id
    });
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

export default router;