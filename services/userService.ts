const { supabase } = require('../utils/supabase');
 
// auth-backend/services/userService.ts
import bcrypt from 'bcrypt';

import config from '../utils/config';
import logger from '../utils/logger';
import { getOrCreateCompany } from './companyService';
import { getOrCreateCompanyLicense, assignLicenseToUser } from './licenseService';



export interface CreateUserData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  company_name?: string;
  company_siren?: string;
  job_title?: string;
  selected_bot_ids: string[]; // IDs des bots sélectionnés
  license_type?: 'trial' | 'standard' | 'premium';
}

export interface CreatedUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  company_id?: string;
  company_name?: string;
  licenses_assigned: number;
  bot_access: string[];
}

/**
 * 👤 Vérifier si un email existe déjà
 */
export async function emailExists(email: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('❌ Erreur vérification email', {
        error: error.message,
        email
      });
      return false; // En cas d'erreur, on assume qu'il n'existe pas
    }

    const exists = !!data;
    if (exists) {
      logger.warn('⚠️ Email déjà utilisé', { email });
    }

    return exists;

  } catch (err) {
    logger.error('❌ Exception vérification email', {
      error: (err as Error).message,
      email
    });
    return false;
  }
}

/**
 * 🤖 Vérifier que tous les bots existent
 */
export async function validateBots(botIds: string[]): Promise<{
  valid: boolean;
  validBots: Array<{ id: string; name: string }>;
  invalidBots: string[];
}> {
  try {
    const { data: bots, error } = await supabase
      .from('bots')
      .select('id, name')
      .in('id', botIds);

    if (error) {
      logger.error('❌ Erreur validation bots', {
        error: error.message,
        botIds
      });
      return { valid: false, validBots: [], invalidBots: botIds };
    }

    const validBots = bots || [];
    const validBotIds = validBots.map(b => b.id);
    const invalidBots = botIds.filter(id => !validBotIds.includes(id));

    const isValid = invalidBots.length === 0;

    logger.info('🤖 Validation bots terminée', {
      botIds,
      validCount: validBots.length,
      invalidCount: invalidBots.length,
      isValid
    });

    return {
      valid: isValid,
      validBots,
      invalidBots
    };

  } catch (err) {
    logger.error('❌ Exception validation bots', {
      error: (err as Error).message,
      botIds
    });
    return { valid: false, validBots: [], invalidBots: botIds };
  }
}

/**
 * 🏭 Créer un utilisateur avec attribution automatique de licences BtoB
 */
export async function createUserWithLicenses(userData: CreateUserData): Promise<CreatedUser | null> {
  try {
    logger.info('🚀 Début création utilisateur avec licences', {
      email: userData.email,
      company: userData.company_name,
      botCount: userData.selected_bot_ids.length
    });

    // 1. Validation préliminaire
    const emailInUse = await emailExists(userData.email);
    if (emailInUse) {
      logger.warn('❌ Email déjà utilisé', { email: userData.email });
      return null;
    }

    const botValidation = await validateBots(userData.selected_bot_ids);
    if (!botValidation.valid) {
      logger.warn('❌ Bots invalides détectés', {
        invalidBots: botValidation.invalidBots
      });
      return null;
    }

    // 2. Créer ou récupérer l'entreprise
    let company = null;
    if (userData.company_name) {
      company = await getOrCreateCompany(userData.company_name, userData.company_siren);
      if (!company) {
        logger.error('❌ Impossible de créer/récupérer l\'entreprise', {
          companyName: userData.company_name
        });
        return null;
      }
    }

    // 3. Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(userData.password, 12);

    // 4. Créer l'utilisateur
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email: userData.email.toLowerCase().trim(),
        first_name: userData.first_name.trim(),
        last_name: userData.last_name.trim(),
        job_title: userData.job_title?.trim() || null,
        company_id: company?.id || null,
        company: company?.name || null,
        nickname: `${userData.first_name}.${userData.last_name}`.toLowerCase().replace(/[^a-z0-9.]/g, ''),
        role: 'user',
        password_hash: hashedPassword,
        first_login: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (userError) {
      logger.error('❌ Erreur création utilisateur', {
        error: userError.message,
        email: userData.email
      });
      return null;
    }

    logger.info('✅ Utilisateur créé', {
      userId: newUser.id,
      email: newUser.email,
      companyId: company?.id
    });

    // 5. Créer/Attribuer les licences pour chaque bot (LOGIQUE BTOB)
    const licenseResults = [];
    const botAccess = [];

    for (const validBot of botValidation.validBots) {
      try {
        // Obtenir ou créer une licence ENTREPRISE pour ce bot
        const companyLicense = await getOrCreateCompanyLicense(
          company?.id || 'no-company', // Si pas d'entreprise, utiliser un ID par défaut
          validBot.id,
          userData.license_type || 'standard'
        );

        if (!companyLicense) {
          logger.error('❌ Impossible de créer licence pour bot', {
            botId: validBot.id,
            botName: validBot.name,
            companyId: company?.id
          });
          continue;
        }

        // Attribuer cette licence à l'utilisateur
        const assigned = await assignLicenseToUser(newUser.id, companyLicense.id);
        if (!assigned) {
          logger.error('❌ Impossible d\'attribuer licence à l\'utilisateur', {
            userId: newUser.id,
            licenseId: companyLicense.id,
            botName: validBot.name
          });
          continue;
        }

        // Donner accès au bot
        const { error: botAccessError } = await supabase
          .from('user_bots')
          .insert({
            user_id: newUser.id,
            bot_id: validBot.id,
            created_at: new Date().toISOString()
          });

        if (botAccessError) {
          logger.error('❌ Erreur attribution accès bot', {
            error: botAccessError.message,
            userId: newUser.id,
            botId: validBot.id
          });
          continue;
        }

        licenseResults.push(companyLicense);
        botAccess.push(validBot.name);

        logger.info('✅ Licence et accès bot attribués', {
          userId: newUser.id,
          botName: validBot.name,
          licenseId: companyLicense.id,
          readableId: companyLicense.readable_id
        });

      } catch (err) {
        logger.error('❌ Exception traitement bot', {
          error: (err as Error).message,
          botId: validBot.id,
          botName: validBot.name
        });
      }
    }

    // 6. Vérifier que au moins une licence a été attribuée
    if (licenseResults.length === 0) {
      logger.error('❌ Aucune licence attribuée - Suppression utilisateur', {
        userId: newUser.id
      });
      
      // Rollback : supprimer l'utilisateur créé
      await supabase.from('users').delete().eq('id', newUser.id);
      return null;
    }

    // 7. Retourner le résultat
    const result: CreatedUser = {
      id: newUser.id,
      email: newUser.email,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      role: newUser.role,
      company_id: company?.id,
      company_name: company?.name,
      licenses_assigned: licenseResults.length,
      bot_access: botAccess
    };

    logger.info('🎉 Utilisateur créé avec succès', {
      userId: result.id,
      email: result.email,
      companyName: result.company_name,
      licenseCount: result.licenses_assigned,
      botAccess: result.bot_access
    });

    return result;

  } catch (err) {
    logger.error('❌ Exception création utilisateur avec licences', {
      error: (err as Error).message,
      email: userData.email
    });
    return null;
  }
}

/**
 * 🔍 Récupérer un utilisateur avec ses licences et accès
 */
export async function getUserWithAccess(userId: string): Promise<{
  user: any;
  licenses: any[];
  botAccess: string[];
} | null> {
  try {
    // Récupérer l'utilisateur
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      logger.error('❌ Utilisateur non trouvé', {
        error: userError?.message,
        userId
      });
      return null;
    }

    // Récupérer ses licences
    const { data: userLicenses, error: licenseError } = await supabase
      .from('user_licenses')
      .select(`
        id,
        requests_used,
        assigned_at,
        licenses (
          id,
          readable_id,
          license_type,
          max_requests_per_month,
          status,
          end_date,
          bots (
            id,
            name
          )
        )
      `)
      .eq('user_id', userId);

    if (licenseError) {
      logger.error('❌ Erreur récupération licences utilisateur', {
        error: licenseError.message,
        userId
      });
      return { user, licenses: [], botAccess: [] };
    }

    const licenses = userLicenses || [];
    const botAccess = licenses
      .map(ul => ul.licenses?.bots?.name)
      .filter(Boolean);

    logger.info('✅ Utilisateur avec accès récupéré', {
      userId,
      email: user.email,
      licenseCount: licenses.length,
      botCount: botAccess.length
    });

    return {
      user,
      licenses,
      botAccess
    };

  } catch (err) {
    logger.error('❌ Exception récupération utilisateur avec accès', {
      error: (err as Error).message,
      userId
    });
    return null;
  }
}