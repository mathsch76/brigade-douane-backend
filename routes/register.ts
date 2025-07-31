// auth-backend/routes/register.ts
import express from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import config from '../utils/config';
import { sanitize } from '../middlewares/validate';
import { createUserWithLicenses, CreateUserData } from '../services/userService';

const router = express.Router();

/**
 * 🆕 Route d'inscription avec logique BtoB automatique
 */
router.post("/", sanitize, async (req, res) => {
  try {
    const {
      email,
      password,
      first_name,
      last_name,
      company_name,
      company_siren,
      job_title,
      selected_bot_ids = [],
      license_type = 'standard'
    } = req.body;

    logger.info('🚀 Nouvelle inscription utilisateur', {
      email,
      company_name,
      botCount: selected_bot_ids.length,
      license_type
    });

    // Validation des champs obligatoires
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ 
        error: "Email, mot de passe, prénom et nom sont requis." 
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        error: "Le mot de passe doit contenir au moins 8 caractères." 
      });
    }

    if (!Array.isArray(selected_bot_ids) || selected_bot_ids.length === 0) {
      return res.status(400).json({ 
        error: "Vous devez sélectionner au moins un bot." 
      });
    }

    // Préparer les données utilisateur
    const userData: CreateUserData = {
      email,
      password,
      first_name,
      last_name,
      company_name,
      company_siren,
      job_title,
      selected_bot_ids,
      license_type: license_type as 'trial' | 'standard' | 'premium'
    };

    // Créer l'utilisateur avec attribution automatique de licences BtoB
    const createdUser = await createUserWithLicenses(userData);

    if (!createdUser) {
      logger.error('❌ Échec création utilisateur', { email });
      return res.status(500).json({
        error: "Impossible de créer le compte. Vérifiez vos données ou contactez le support."
      });
    }

    // Générer le token de connexion automatique
    const accessToken = jwt.sign(
      { 
        id: createdUser.id, 
        email: createdUser.email, 
        role: createdUser.role 
      }, 
      config.jwt.secret, 
      { expiresIn: config.jwt.expiresIn || "2h" }
    );

    // Calculer les statistiques d'accès
    const totalLicenses = createdUser.licenses_assigned;
    const botList = createdUser.bot_access;

    logger.info('🎉 Inscription réussie', {
      userId: createdUser.id,
      email: createdUser.email,
      companyName: createdUser.company_name,
      licenseCount: totalLicenses,
      botCount: botList.length
    });

    // Retourner la réponse de succès
    return res.status(201).json({
      success: true,
      message: `Compte créé avec succès ! ${totalLicenses} licence(s) activée(s) pour ${botList.length} bot(s).`,
      token: accessToken,
      user: {
        id: createdUser.id,
        email: createdUser.email,
        first_name: createdUser.first_name,
        last_name: createdUser.last_name,
        role: createdUser.role,
        company_id: createdUser.company_id,
        company_name: createdUser.company_name
      },
      access: {
        licenses_count: totalLicenses,
        bot_access: botList,
        company_based: true, // Indique que c'est une logique entreprise
        license_type: license_type
      }
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : '';

    logger.error('❌ Exception route inscription', {
      error: errorMessage,
      stack: errorStack,
      email: req.body.email
    });
    
    return res.status(500).json({ 
      error: "Erreur serveur lors de la création du compte." 
    });
  }
});

export default router;