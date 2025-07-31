const { supabase } = require('../utils/supabase');
// auth-backend/services/licenseService.ts - Version corrigée

import config from '../utils/config';
import logger from '../utils/logger';



export interface CompanyLicense {
  id: string;
  readable_id: string;
  company_id: string;
  bot_id: string;
  bot_name: string;
  status: string;
  license_type: string;
  max_requests_per_month: number;
  start_date: string;
  end_date: string;
  is_valid: boolean;
}

/**
 * 🏢 Vérifier si une licence existe déjà pour une entreprise + bot
 */
export async function findCompanyLicense(
  companyId: string, 
  botId: string
): Promise<CompanyLicense | null> {
  try {
    const { data, error } = await supabase
      .from('licenses')
      .select(`
        id,
        company_id,
        bot_id,
        status,
        max_requests_per_month,
        start_date,
        end_date,
        bots (
          id,
          name
        )
      `)
      .eq('company_id', companyId)
      .eq('bot_id', botId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('❌ Erreur recherche licence entreprise', {
        error: error.message,
        companyId,
        botId
      });
      return null;
    }

    if (!data) return null;

    const license: CompanyLicense = {
      id: data.id,
      readable_id: data.id, // Utiliser l'ID comme readable_id
      company_id: data.company_id,
      bot_id: data.bot_id,
      bot_name: data.bots?.name || 'Unknown',
      status: data.status,
      license_type: 'standard', // Valeur par défaut
      max_requests_per_month: data.max_requests_per_month,
      start_date: data.start_date,
      end_date: data.end_date,
      is_valid: data.status === 'active' && new Date(data.end_date) > new Date()
    };

    logger.info('✅ Licence entreprise trouvée', {
      licenseId: license.id,
      companyId,
      botName: license.bot_name,
      isValid: license.is_valid
    });

    return license;

  } catch (err) {
    logger.error('❌ Exception recherche licence entreprise', {
      error: (err as Error).message,
      companyId,
      botId
    });
    return null;
  }
}

/**
 * 🎫 Créer une nouvelle licence pour une entreprise + bot
 */
export async function createCompanyLicense(
  companyId: string,
  botId: string,
  licenseType: 'trial' | 'standard' | 'premium' = 'standard'
): Promise<CompanyLicense | null> {
  try {
    logger.info('🏭 Création nouvelle licence entreprise', {
      companyId,
      botId,
      licenseType
    });

    // Données à insérer (colonnes qui existent vraiment)
    const newLicenseData = {
      company_id: companyId,
      bot_id: botId,
      status: 'active',
      max_requests_per_month: licenseType === 'trial' ? 100 : licenseType === 'premium' ? 2000 : 500,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // +1 an
      created_at: new Date().toISOString()
    };

    // Insérer en base
    const { data, error } = await supabase
      .from('licenses')
      .insert(newLicenseData)
      .select(`
        id,
        company_id,
        bot_id,
        status,
        max_requests_per_month,
        start_date,
        end_date,
        bots (
          id,
          name
        )
      `)
      .single();

    if (error) {
      logger.error('❌ Erreur création licence entreprise', {
        error: error.message,
        companyId,
        botId
      });
      return null;
    }

    const createdLicense: CompanyLicense = {
      id: data.id,
      readable_id: data.id,
      company_id: data.company_id,
      bot_id: data.bot_id,
      bot_name: data.bots?.name || 'Unknown',
      status: data.status,
      license_type: licenseType,
      max_requests_per_month: data.max_requests_per_month,
      start_date: data.start_date,
      end_date: data.end_date,
      is_valid: true
    };

    logger.info('✅ Licence entreprise créée avec succès', {
      licenseId: createdLicense.id,
      companyId,
      botName: createdLicense.bot_name,
      maxRequests: createdLicense.max_requests_per_month
    });

    return createdLicense;

  } catch (err) {
    logger.error('❌ Exception création licence entreprise', {
      error: (err as Error).message,
      companyId,
      botId
    });
    return null;
  }
}

/**
 * 🎯 Obtenir ou créer une licence pour une entreprise + bot
 */
export async function getOrCreateCompanyLicense(
  companyId: string,
  botId: string,
  licenseType: 'trial' | 'standard' | 'premium' = 'standard'
): Promise<CompanyLicense | null> {
  try {
    // 1. Chercher licence existante
    let license = await findCompanyLicense(companyId, botId);

    // 2. Si trouvée et valide, la retourner
    if (license && license.is_valid) {
      logger.info('♻️ Réutilisation licence entreprise existante', {
        licenseId: license.id
      });
      return license;
    }

    // 3. Si pas trouvée ou expirée, en créer une nouvelle
    logger.info('🆕 Création nouvelle licence requise', {
      companyId,
      botId,
      existingLicense: !!license,
      isValid: license?.is_valid || false
    });

    license = await createCompanyLicense(companyId, botId, licenseType);
    return license;

  } catch (err) {
    logger.error('❌ Exception getOrCreateCompanyLicense', {
      error: (err as Error).message,
      companyId,
      botId
    });
    return null;
  }
}

/**
 * 🔗 Attribuer une licence à un utilisateur
 */
export async function assignLicenseToUser(
  userId: string,
  licenseId: string
): Promise<boolean> {
  try {
    // Vérifier si l'attribution existe déjà
    const { data: existing, error: checkError } = await supabase
      .from('user_licenses')
      .select('id')
      .eq('user_id', userId)
      .eq('license_id', licenseId)
      .single();

    if (existing) {
      logger.info('ℹ️ Attribution licence déjà existante', {
        userId,
        licenseId,
        userLicenseId: existing.id
      });
      return true;
    }

    // Créer l'attribution
    const { error } = await supabase
      .from('user_licenses')
      .insert({
        user_id: userId,
        license_id: licenseId,
        assigned_at: new Date().toISOString(),
        requests_used: 0
      });

    if (error) {
      logger.error('❌ Erreur attribution licence utilisateur', {
        error: error.message,
        userId,
        licenseId
      });
      return false;
    }

    logger.info('✅ Licence attribuée à l\'utilisateur', {
      userId,
      licenseId
    });

    return true;

  } catch (err) {
    logger.error('❌ Exception attribution licence', {
      error: (err as Error).message,
      userId,
      licenseId
    });
    return false;
  }
}

/**
 * 📊 Récupérer toutes les licences d'une entreprise
 */
export async function getCompanyLicenses(companyId: string): Promise<CompanyLicense[]> {
  try {
    console.log('🔍 DEBUG: Recherche licences pour company =', companyId);
    
    const { data, error } = await supabase
      .from('licenses')
      .select(`
        id,
        company_id,
        bot_id,
        status,
        max_requests_per_month,
        start_date,
        end_date,
        bots (
          id,
          name
        )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erreur SQL:', error);
      logger.error('❌ Erreur récupération licences entreprise', {
        error: error.message,
        companyId
      });
      return [];
    }

    console.log('✅ Licences trouvées:', data);

    const licenses: CompanyLicense[] = (data || []).map(item => ({
      id: item.id,
      readable_id: item.id,
      company_id: item.company_id,
      bot_id: item.bot_id,
      bot_name: item.bots?.name || 'Unknown',
      status: item.status,
      license_type: 'standard',
      max_requests_per_month: item.max_requests_per_month,
      start_date: item.start_date,
      end_date: item.end_date,
      is_valid: item.status === 'active' && new Date(item.end_date) > new Date()
    }));

    logger.info('✅ Licences entreprise récupérées', {
      companyId,
      licenseCount: licenses.length,
      validCount: licenses.filter(l => l.is_valid).length
    });

    console.log('📊 Licences formatées:', licenses);

    return licenses;

  } catch (err) {
    console.error('❌ Exception:', err);
    logger.error('❌ Exception récupération licences entreprise', {
      error: (err as Error).message,
      companyId
    });
    return [];
  }
}