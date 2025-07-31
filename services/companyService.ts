const { supabase } = require('../utils/supabase');
import config from '../utils/config';
import logger from '../utils/logger';

export interface Company {
  id: string;
  name: string;
  siren?: string;
  created_at: string;
  user_count?: number;
  license_count?: number;
  active_license_count?: number;
}

export async function findCompanyById(companyId: string): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('❌ Erreur recherche entreprise par ID', { error: error.message, companyId });
      return null;
    }

    logger.info('✅ Entreprise trouvée par ID', { companyId, companyName: data.name });
    return data;

  } catch (err) {
    logger.error('❌ Exception recherche entreprise', { error: (err as Error).message, companyId });
    return null;
  }
}

export async function findCompanyByName(name: string): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .ilike('name', name.trim())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('❌ Erreur recherche entreprise par nom', { error: error.message, name });
      return null;
    }

    logger.info('✅ Entreprise trouvée par nom', { companyId: data.id, companyName: data.name });
    return data;

  } catch (err) {
    logger.error('❌ Exception recherche entreprise par nom', { error: (err as Error).message, name });
    return null;
  }
}

export async function createCompany(name: string, siren?: string): Promise<Company | null> {
  try {
    const existing = await findCompanyByName(name);
    if (existing) {
      logger.warn('⚠️ Entreprise existe déjà', { name, existingId: existing.id });
      return existing;
    }

    logger.info('🏭 Création nouvelle entreprise', { name, siren });

    const { data, error } = await supabase
      .from('companies')
      .insert({
        name: name.trim(),
        siren: siren?.trim() || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('❌ Erreur création entreprise', { error: error.message, name, siren });
      return null;
    }

    logger.info('✅ Entreprise créée avec succès', { companyId: data.id, companyName: data.name });
    return data;

  } catch (err) {
    logger.error('❌ Exception création entreprise', { error: (err as Error).message, name, siren });
    return null;
  }
}

export async function getOrCreateCompany(name: string, siren?: string): Promise<Company | null> {
  try {
    let company = await findCompanyByName(name);
    if (company) {
      logger.info('♻️ Réutilisation entreprise existante', { companyId: company.id, companyName: company.name });
      return company;
    }

    logger.info('🆕 Création entreprise requise', { name, siren });
    return await createCompany(name, siren);

  } catch (err) {
    logger.error('❌ Exception getOrCreateCompany', { error: (err as Error).message, name, siren });
    return null;
  }
}

export async function getCompanyStats(companyId: string): Promise<{
  userCount: number;
  licenseCount: number;
  activeLicenseCount: number;
} | null> {
  try {
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('company_id', companyId);

    if (userError) {
      logger.error('❌ Erreur comptage utilisateurs', { error: userError.message, companyId });
      return null;
    }

    const { data: licenses, error: licenseError } = await supabase
      .from('licenses')
      .select('id, status')
      .eq('company_id', companyId);

    if (licenseError) {
      logger.error('❌ Erreur comptage licences', { error: licenseError.message, companyId });
      return null;
    }

    return {
      userCount: users?.length || 0,
      licenseCount: licenses?.length || 0,
      activeLicenseCount: licenses?.filter(l => l.status === 'active').length || 0
    };

  } catch (err) {
    logger.error('❌ Exception statistiques entreprise', { error: (err as Error).message, companyId });
    return null;
  }
}

// CORRECTION FINALE - Remplace listCompaniesWithStats() dans ton companyService.ts

export async function listCompaniesWithStats(): Promise<(Company & {
  users_count: number;
  total_licenses: number;
  active_licenses: number;
  expired_licenses: number;
  total_usage: number;
  total_quota: number;
  utilization_rate: number;
})[]> {
  try {
    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');

    if (error) {
      logger.error('❌ Erreur récupération entreprises', { error: error.message });
      return [];
    }

    const companiesWithStats = await Promise.all(
      (companies || []).map(async (company) => {
        // Récupérer les stats de base (ça marche déjà)
        const stats = await getCompanyStats(company.id);
        
        // ✅ SIMPLIFICATION: Calculer l'usage directement
        let totalUsage = 0;
        let totalQuota = 0;
        
        try {
          // Requête simple pour l'usage
          const { data: usageData, error: usageError } = await supabase
            .from('user_licenses')
            .select('requests_used, license_id')
            .not('license_id', 'is', null);

          if (!usageError && usageData) {
            // Obtenir les licences de cette entreprise
            const { data: companyLicenses } = await supabase
              .from('licenses')
              .select('id, max_requests_per_month')
              .eq('company_id', company.id)
              .eq('status', 'active');

            if (companyLicenses) {
              // Calculer usage et quota pour cette entreprise
              const companyLicenseIds = companyLicenses.map(l => l.id);
              
              totalUsage = usageData
                .filter(usage => companyLicenseIds.includes(usage.license_id))
                .reduce((sum, usage) => sum + (usage.requests_used || 0), 0);
              
              totalQuota = companyLicenses
                .reduce((sum, license) => sum + (license.max_requests_per_month || 0), 0);
            }
          }
        } catch (usageErr) {
          logger.error('❌ Erreur calcul usage', { error: (usageErr as Error).message, companyId: company.id });
        }

        const utilizationRate = totalQuota > 0 ? Math.round((totalUsage / totalQuota) * 100) : 0;
        
        return {
          ...company,
          // ✅ Noms corrects pour le frontend
          users_count: stats?.userCount || 0,
          total_licenses: stats?.licenseCount || 0,
          active_licenses: stats?.activeLicenseCount || 0,
          expired_licenses: 0, // À implémenter si nécessaire
          total_usage: totalUsage,
          total_quota: totalQuota,
          utilization_rate: utilizationRate
        };
      })
    );

    logger.info('✅ Entreprises avec statistiques récupérées', {
      companyCount: companiesWithStats.length,
      totalLicenses: companiesWithStats.reduce((sum, c) => sum + c.total_licenses, 0),
      totalUsage: companiesWithStats.reduce((sum, c) => sum + c.total_usage, 0)
    });

    return companiesWithStats;

  } catch (err) {
    logger.error('❌ Exception liste entreprises', { error: (err as Error).message });
    return [];
  }
}