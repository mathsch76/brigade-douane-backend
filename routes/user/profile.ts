   
// auth-backend/routes/user/profile.ts
import { validate, sanitize } from '../../middlewares/validate';
import { updateProfileSchema, changePasswordSchema } from '../../schemas/profile.schema';
import { supabase } from '../../utils/supabase';
import express from "express";
import { legacyAuthGuard, AuthenticatedRequest } from "../../middlewares/authguard";
import bcrypt from "bcryptjs";
import logger from "../../utils/logger";
import { getUserById, getLicenseCount } from "./helpers/userHelpers";

const router = express.Router();

// ✅ GET /user/me - Récupération des informations de l'utilisateur connecté
router.get("/me", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      logger.error("❌ ID utilisateur non trouvé dans le token");
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const user = await getUserById(userId);
    if (!user) {
      logger.warn("❌ Utilisateur non trouvé en base", { userId });
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    logger.info("✅ Données utilisateur récupérées", { userId });
    return res.json(user);
  } catch (err) {
    logger.error("❌ Erreur lors de la récupération des informations utilisateur", { 
      error: (err as Error).message 
    });
    res.status(500).json({ error: "Erreur lors de la récupération des informations utilisateur." });
  }
});

// ✅ PUT /user/update-profile - Mise à jour du surnom de l'utilisateur
router.put("/update-profile", legacyAuthGuard, sanitize, validate(updateProfileSchema), async (req: AuthenticatedRequest, res) => {

  try {
    const userId = req.user?.sub || req.user?.id;
    const { nickname } = req.body;

    if (!userId) {
      logger.error("❌ ID utilisateur non trouvé dans le token");
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    if (!nickname || nickname.trim() === '') {
      logger.warn("❌ Tentative de mise à jour avec un surnom vide", { userId });
      return res.status(400).json({ error: "Le surnom ne peut pas être vide." });
    }

    const { data, error } = await supabase
      .from("users")
      .update({ nickname: nickname.trim() })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      logger.error("❌ Erreur lors de la mise à jour du surnom", {
        error: error.message,
        userId
      });
      return res.status(500).json({ error: "Erreur lors de la mise à jour du profil." });
    }

    logger.info("✅ Surnom mis à jour avec succès", { userId, nickname });
    return res.status(200).json({ 
      success: true, 
      message: "Profil mis à jour avec succès",
      user: data
    });
  } catch (err) {
    logger.error("❌ Exception lors de la mise à jour du profil", {
      error: (err as Error).message,
      stack: (err as Error).stack
    });
    return res.status(500).json({ error: "Erreur serveur lors de la mise à jour du profil." });
  }
});

// ✅ PUT /user/change-password - Changement du mot de passe
router.put("/change-password", legacyAuthGuard, sanitize, validate(changePasswordSchema), async (req: AuthenticatedRequest, res) => {

  try {
    const userId = req.user?.sub || req.user?.id;
    const { oldPassword, newPassword } = req.body;

    if (!userId) {
      logger.error("❌ ID utilisateur non trouvé dans le token");
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Validation des entrées
    if (!oldPassword) {
      return res.status(400).json({ error: "L'ancien mot de passe est requis." });
    }

    if (!newPassword) {
      return res.status(400).json({ error: "Le nouveau mot de passe est requis." });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 8 caractères." });
    }

    // Récupération du mot de passe actuel
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("password_hash")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      logger.error("❌ Erreur lors de la récupération du mot de passe actuel", {
        error: userError?.message,
        userId
      });
      return res.status(500).json({ error: "Erreur lors de la vérification du mot de passe." });
    }

    // Vérification de l'ancien mot de passe
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isPasswordValid) {
      logger.warn("❌ Tentative de changement de mot de passe avec mot de passe incorrect", { userId });
      return res.status(401).json({ error: "Ancien mot de passe incorrect." });
    }

    // Hachage du nouveau mot de passe
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Mise à jour du mot de passe
    const { error: updateError } = await supabase
      .from("users")
      .update({ password_hash: newPasswordHash })
      .eq("id", userId);

    if (updateError) {
      logger.error("❌ Erreur lors de la mise à jour du mot de passe", {
        error: updateError.message,
        userId
      });
      return res.status(500).json({ error: "Erreur lors de la mise à jour du mot de passe." });
    }

    logger.info("✅ Mot de passe mis à jour avec succès", { userId });
    return res.status(200).json({
      success: true,
      message: "Mot de passe mis à jour avec succès"
    });
  } catch (err) {
    logger.error("❌ Exception lors du changement de mot de passe", {
      error: (err as Error).message,
      stack: (err as Error).stack
    });
    return res.status(500).json({ error: "Erreur serveur lors du changement de mot de passe." });
  }
});

export default router;