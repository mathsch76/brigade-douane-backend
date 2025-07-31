// auth-backend/routes/user/preferences.ts
const { supabase } = require('../../utils/supabase');
import { validate, sanitize } from '../../middlewares/validate';
import { userPreferencesSchema, themeSchema, botPreferencesSchema, avatarPreferencesSchema } from '../../schemas/preferences.schema';
import express from "express";
import { legacyAuthGuard, AuthenticatedRequest } from "../../middlewares/authguard";
import logger from "../../utils/logger";

const router = express.Router();

// ===============================================
// ROUTE /me POUR LE PROFIL UTILISATEUR
// ===============================================

// ✅ GET /user/me - Récupération du profil utilisateur complet
router.get("/me", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      logger.error("❌ ID utilisateur non trouvé dans le token");
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    console.log('👤 Récupération profil pour userId:', userId);

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

    // Récupérer les licences de l'entreprise si elle existe
    let companyLicenses = [];
    if (user.company_id) {
      const { data: licenses, error: licensesError } = await supabase
        .from('licenses')
        .select('*')
        .eq('company_id', user.company_id);

      if (!licensesError && licenses) {
        companyLicenses = licenses;
      }
    }

    // Déterminer les bots accessibles
    let accessibleBots: string[] = [];
    if (user.role === "admin") {
      // Admin : accès à tous les bots
      const { data: allBots, error: botError } = await supabase
        .from("bots")
        .select("name");

      if (!botError && allBots) {
        accessibleBots = allBots.map((bot: any) => bot.name);
      }
    } else {
      // Utilisateur normal : bots selon licences
      accessibleBots = companyLicenses
        .map(license => license.bot_name)
        .filter(name => name !== undefined && name !== null);
    }

    const responseData = {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        nickname: user.nickname,
        first_login: user.first_login,
        company_id: user.company_id
      },
      company: user.companies || null,
      licenses: companyLicenses,
      accessible_bots: accessibleBots
    };

    console.log('✅ Profil récupéré avec succès');
    return res.json(responseData);

  } catch (error) {
    logger.error("❌ Exception route /me", {
      error: (error as Error).message,
      userId: req.user?.sub || req.user?.id
    });
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// ✅ PUT /user/update-profile - Mise à jour du profil utilisateur
router.put("/update-profile", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const { nickname } = req.body;

    console.log('📝 Mise à jour profil:', { userId, nickname });

    // Mise à jour du nickname dans Supabase
    const { data, error } = await supabase
      .from('users')
      .update({ 
        nickname: nickname,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      logger.error('❌ Erreur mise à jour profil:', error);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' });
    }

    console.log('✅ Profil mis à jour avec succès');
    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      data: { nickname }
    });

  } catch (error) {
    logger.error('❌ Exception mise à jour profil:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ PUT /user/change-password - Changement de mot de passe
router.put("/change-password", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const { oldPassword, newPassword } = req.body;

    console.log('🔑 Changement mot de passe pour:', userId);

    // Validation
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Ancien et nouveau mot de passe requis' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
    }

    // Récupérer l'utilisateur avec son mot de passe actuel
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérifier l'ancien mot de passe
    const bcrypt = require('bcrypt');
    const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
    
    if (!validPassword) {
      return res.status(400).json({ error: 'Ancien mot de passe incorrect' });
    }

    // Hasher le nouveau mot de passe
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Mettre à jour le mot de passe
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      logger.error('❌ Erreur mise à jour mot de passe:', updateError);
      return res.status(500).json({ error: 'Erreur lors de la mise à jour du mot de passe' });
    }

    console.log('✅ Mot de passe mis à jour avec succès');
    res.json({
      success: true,
      message: 'Mot de passe mis à jour avec succès'
    });

  } catch (error) {
    logger.error('❌ Exception changement mot de passe:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== GESTION DES PRÉFÉRENCES UTILISATEUR =====

// Interface pour les préférences utilisateur
interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  communication_style: 'casual' | 'professional' | 'technical';
  content_orientation: 'beginner' | 'intermediate' | 'advanced';
}

// Préférences par défaut
const defaultUserPreferences: UserPreferences = {
  theme: 'system',
  communication_style: 'casual',
  content_orientation: 'intermediate'
};

// ✅ GET /user/preferences - Récupération des préférences utilisateur
router.get("/preferences", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      logger.error("❌ ID utilisateur non trouvé dans le token");
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

  const { data, error } = await supabase
  .from("user_preferences")
  .select("*")
  .eq("user_id", userId);

    if (error && error.code !== 'PGRST116') { // PGRST116 = pas de résultat trouvé
      logger.error("❌ Erreur lors de la récupération des préférences", {
        error: error.message,
        userId
      });
      return res.status(500).json({ error: "Erreur lors de la récupération des préférences." });
    }

    // Si aucune préférence trouvée, créer les préférences par défaut
    if (!data || data.length === 0) {
      const { data: newPrefs, error: createError } = await supabase
        .from("user_preferences")
        .insert({
          user_id: userId,
          ...defaultUserPreferences,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        logger.error("❌ Erreur lors de la création des préférences par défaut", {
          error: createError.message,
          userId
        });
        return res.status(500).json({ error: "Erreur lors de l'initialisation des préférences." });
      }

      logger.info("✅ Préférences par défaut créées", { userId });
      return res.json(newPrefs);
    }

    logger.info("✅ Préférences récupérées", { userId });
    return res.json(data[0]); // Premier élément du tableau

  } catch (err) {
    logger.error("❌ Exception lors de la récupération des préférences", {
      error: (err as Error).message,
      userId: req.user?.sub || req.user?.id
    });
    res.status(500).json({ error: "Erreur serveur lors de la récupération des préférences." });
  }
});

// ✅ PUT /user/preferences - Mise à jour des préférences utilisateur
router.put("/preferences", legacyAuthGuard, sanitize, validate(userPreferencesSchema), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      logger.error("❌ ID utilisateur non trouvé dans le token");
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const { theme, communication_style, content_orientation } = req.body;

    // Validation des données
    const validThemes = ['light', 'dark', 'system'];
    const validCommStyles = ['casual', 'professional', 'technical'];
    const validContentOrientations = ['beginner', 'intermediate', 'advanced'];

    if (theme && !validThemes.includes(theme)) {
      return res.status(400).json({ 
        error: "Thème invalide. Valeurs acceptées: light, dark, system" 
      });
    }

    if (communication_style && !validCommStyles.includes(communication_style)) {
      return res.status(400).json({ 
        error: "Style de communication invalide. Valeurs acceptées: formal, casual, technical" 
      });
    }

    if (content_orientation && !validContentOrientations.includes(content_orientation)) {
      return res.status(400).json({ 
        error: "Orientation contenu invalide. Valeurs acceptées: beginner, intermediate, advanced" 
      });
    }

    // Construire l'objet de mise à jour (seulement les champs fournis)
    const updateData: Partial<UserPreferences> = {};
    if (theme !== undefined) updateData.theme = theme;
    if (communication_style !== undefined) updateData.communication_style = communication_style;
    if (content_orientation !== undefined) updateData.content_orientation = content_orientation;

    // Vérifier qu'au moins un champ est fourni
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "Aucune préférence à mettre à jour." });
    }

    // Ajouter la date de mise à jour
    const finalUpdateData = {
      ...updateData,
      updated_at: new Date().toISOString()
    };

    // Mise à jour en base
    const { data, error } = await supabase
      .from("user_preferences")
      .update(finalUpdateData)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      // Si l'utilisateur n'a pas encore de préférences, les créer
      if (error.code === 'PGRST116') {
        const { data: newData, error: insertError } = await supabase
          .from("user_preferences")
          .insert({
            user_id: userId,
            ...defaultUserPreferences,
            ...updateData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (insertError) {
          logger.error("❌ Erreur lors de la création des préférences", {
            error: insertError.message,
            userId
          });
          return res.status(500).json({ error: "Erreur lors de la création des préférences." });
        }

        logger.info("✅ Préférences créées avec succès", { 
          userId, 
          preferences: updateData 
        });
        return res.json({
          success: true,
          message: "Préférences créées avec succès",
          preferences: newData
        });
      }

      logger.error("❌ Erreur lors de la mise à jour des préférences", {
        error: error.message,
        userId
      });
      return res.status(500).json({ error: "Erreur lors de la mise à jour des préférences." });
    }

    logger.info("✅ Préférences mises à jour avec succès", { 
      userId, 
      preferences: updateData 
    });
    return res.json({
      success: true,
      message: "Préférences mises à jour avec succès",
      preferences: data
    });
  } catch (err) {
    logger.error("❌ Exception lors de la mise à jour des préférences", {
      error: (err as Error).message,
      userId: req.user?.sub || req.user?.id
    });
    res.status(500).json({ error: "Erreur serveur lors de la mise à jour des préférences." });
  }
});

// ✅ PATCH /user/preferences/theme - Mise à jour rapide du thème uniquement
router.patch("/preferences/theme", legacyAuthGuard, sanitize, validate(themeSchema), async (req: AuthenticatedRequest, res) => {

  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      logger.error("❌ ID utilisateur non trouvé dans le token");
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const { theme } = req.body;
    const validThemes = ['light', 'dark', 'system'];

    if (!theme || !validThemes.includes(theme)) {
      return res.status(400).json({ 
        error: "Thème requis. Valeurs acceptées: light, dark, system" 
      });
    }

    // Mise à jour rapide du thème uniquement
    const { data, error } = await supabase
      .from("user_preferences")
      .update({ 
        theme: theme,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      // Si pas de préférences existantes, créer avec le thème demandé
      if (error.code === 'PGRST116') {
        const { data: newData, error: insertError } = await supabase
          .from("user_preferences")
          .insert({
            user_id: userId,
            ...defaultUserPreferences,
            theme: theme,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (insertError) {
          logger.error("❌ Erreur lors de la création des préférences avec thème", {
            error: insertError.message,
            userId
          });
          return res.status(500).json({ error: "Erreur lors de la sauvegarde du thème." });
        }

        logger.info("✅ Thème sauvegardé (nouvelles préférences)", { userId, theme });
        return res.json({
          success: true,
          message: "Thème sauvegardé avec succès",
          theme: theme,
          preferences: newData
        });
      }

      logger.error("❌ Erreur lors de la mise à jour du thème", {
        error: error.message,
        userId
      });
      return res.status(500).json({ error: "Erreur lors de la sauvegarde du thème." });
    }

    logger.info("✅ Thème mis à jour avec succès", { userId, theme });
    return res.json({
      success: true,
      message: "Thème mis à jour avec succès",
      theme: theme,
      preferences: data
    });
  } catch (err) {
    logger.error("❌ Exception lors de la mise à jour du thème", {
      error: (err as Error).message,
      userId: req.user?.sub || req.user?.id
    });
    res.status(500).json({ error: "Erreur serveur lors de la sauvegarde du thème." });
  }
});

// ✅ GET /user/bot-preferences - Récupération des préférences par bot
router.get("/bot-preferences", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    console.log('📋 Récupération préférences bot pour userId:', userId);

    const { data, error } = await supabase
      .from('user_bot_preferences')
      .select('bot_id, content_orientation')
      .eq('user_id', userId);

    if (error) {
      logger.error('❌ Erreur récupération préférences bot:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    console.log('✅ Préférences bot récupérées:', data);
    res.json(data || []);

  } catch (error) {
    logger.error('❌ Exception préférences bot:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ PUT /user/bot-preferences - Mise à jour des préférences par bot
router.put("/bot-preferences", legacyAuthGuard, sanitize, validate(botPreferencesSchema), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const { bot_id, content_orientation } = req.body;

    // Validation
    if (!bot_id || !content_orientation) {
      return res.status(400).json({ error: 'bot_id et content_orientation requis' });
    }

    if (!['beginner', 'intermediate', 'advanced'].includes(content_orientation)) {
      return res.status(400).json({ error: 'content_orientation invalide' });
    }

    console.log('💾 Sauvegarde préférence bot:', { userId, bot_id, content_orientation });

    // Upsert
    const { data, error } = await supabase
      .from('user_bot_preferences')
      .upsert({
        user_id: userId,
        bot_id: bot_id,
        content_orientation: content_orientation,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,bot_id'
      })
      .select();

    if (error) {
      logger.error('❌ Erreur sauvegarde bot:', error);
      return res.status(500).json({ error: 'Erreur sauvegarde' });
    }

    console.log('✅ Préférence bot sauvegardée');
    res.json({ 
      success: true, 
      message: 'Préférence sauvegardée',
      data: data?.[0] 
    });

  } catch (error) {
    logger.error('❌ Exception sauvegarde bot:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET /user/all-preferences - Récupération de toutes les préférences (pour intelligentRouter)
router.get("/all-preferences", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    // Récupérer tout en parallèle
    const [generalResult, botResult] = await Promise.all([
      supabase
        .from('user_preferences')
        .select('communication_style')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('user_bot_preferences')
        .select('bot_id, content_orientation')
        .eq('user_id', userId)
    ]);

    // Style communication (avec fallback)
    const communicationStyle = generalResult.data?.communication_style || 'professional';

    // Niveaux bot
    const contentLevels: Record<string, string> = {};
    if (botResult.data) {
      botResult.data.forEach((pref: any) => {
        contentLevels[pref.bot_id] = pref.content_orientation;
      });
    }

    const result = {
      communication_style: communicationStyle,
      content_levels: contentLevels
    };

    console.log('✅ All-preferences:', result);
    res.json(result);

  } catch (error) {
    logger.error('❌ Erreur all-preferences:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== GESTION DES PRÉFÉRENCES D'AVATARS =====

// Interface pour les préférences d'avatars
interface UserAvatarPreference {
  bot_name: string;
  selected_avatar: string;
}

// ✅ GET /user/avatar-preferences - Récupération des préférences d'avatars
router.get("/avatar-preferences", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      logger.error("❌ ID utilisateur non trouvé dans le token");
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    console.log('🎨 Récupération préférences avatar pour userId:', userId);

    const { data, error } = await supabase
      .from('user_avatar_preferences')
      .select('bot_name, selected_avatar')
      .eq('user_id', userId);

    if (error) {
      logger.error('❌ Erreur récupération préférences avatar:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    console.log('✅ Préférences avatar récupérées:', data);
    res.json(data || []);

  } catch (error) {
    logger.error('❌ Exception préférences avatar:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ PUT /user/avatar-preferences - Mise à jour des préférences d'avatars
router.put("/avatar-preferences", legacyAuthGuard, sanitize, validate(avatarPreferencesSchema), async (req: AuthenticatedRequest, res) => {

  try {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      logger.error("❌ ID utilisateur non trouvé dans le token");
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const { bot_name, selected_avatar } = req.body;

    // Validation
    if (!bot_name || !selected_avatar) {
      return res.status(400).json({ 
        error: 'bot_name et selected_avatar requis' 
      });
    }

    // Validation du nom d'avatar (format bot1.png à bot12.png + bot7.png par défaut)
    const validAvatarPattern = /^bot([1-9]|[12][0-9])\.png$/;
    if (!validAvatarPattern.test(selected_avatar)) {
      return res.status(400).json({ 
        error: 'Avatar invalide. Format attendu: bot1.png à bot12.png' 
      });
    }

    console.log('🎨 Sauvegarde préférence avatar:', { 
      userId, 
      bot_name, 
      selected_avatar 
    });

    // Upsert (création ou mise à jour)
    const { data, error } = await supabase
      .from('user_avatar_preferences')
      .upsert({
        user_id: userId,
        bot_name: bot_name,
        selected_avatar: selected_avatar,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,bot_name'
      })
      .select();

    if (error) {
      logger.error('❌ Erreur sauvegarde avatar:', error);
      return res.status(500).json({ error: 'Erreur sauvegarde avatar' });
    }

    console.log('✅ Préférence avatar sauvegardée');
    res.json({ 
      success: true, 
      message: 'Avatar sauvegardé avec succès',
      data: data?.[0] 
    });

  } catch (error) {
    logger.error('❌ Exception sauvegarde avatar:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ GET /user/avatar-preferences/:botName - Récupération avatar d'un bot spécifique
router.get("/avatar-preferences/:botName", legacyAuthGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.sub || req.user?.id;
    const botName = req.params.botName;

    if (!userId) {
      return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    console.log('🎨 Récupération avatar pour bot:', botName);

    const { data, error } = await supabase
      .from('user_avatar_preferences')
      .select('selected_avatar')
      .eq('user_id', userId)
      .eq('bot_name', botName)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Aucune préférence trouvée, retourner avatar par défaut
        const defaultAvatar = botName === 'BRIEFING_GENERAL' ? 'bot7.png' : 'bot7.png';
        console.log('📋 Pas de préférence, avatar par défaut:', defaultAvatar);
        return res.json({ selected_avatar: defaultAvatar });
      }
      
      logger.error('❌ Erreur récupération avatar:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    console.log('✅ Avatar récupéré:', data);
    res.json(data);

  } catch (error) {
    logger.error('❌ Exception récupération avatar:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;