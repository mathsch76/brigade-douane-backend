// auth-backend/routes/admin/quotas.ts
// Routes pour la gestion des quotas de licences

import express from 'express';
import { legacyAuthGuard, AuthenticatedRequest } from '../../middlewares/authguard';
import { sanitize } from '../../middlewares/validate';
import logger from '../../utils/logger';
const { supabase } = require('../../utils/supabase');

const router = express.Router();

// Middleware admin pour ce module
const adminGuard = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: "Accès refusé. Seuls les admins peuvent accéder à cette ressource." });
  }
  next();
};

/**
 * ⚙️ PUT /admin/quotas/update
 * Mise à jour des quotas d'une licence
 * Body: { licenseId, maxTokensPerMonth, maxRequestsPerMonth }
 */
router.put("/update", legacyAuthGuard, adminGuard, sanitize, async (req: AuthenticatedRequest, res) => {
  try {
    const { licenseId, maxTokensPerMonth, maxRequestsPerMonth } = req.body;

    // Validation des paramètres
    if (!licenseId || !maxTokensPerMonth || !maxRequestsPerMonth) {
      return res.status(400).json({ 
        success: false, 
        error: 'licenseId, maxTokensPerMonth et maxRequestsPerMonth sont requis' 
      });
    }

    // Validation des valeurs numériques
    if (typeof maxTokensPerMonth !== 'number' || typeof maxRequestsPerMonth !== 'number') {
      return res.status(400).json({ 
        success: false, 
        error: 'maxTokensPerMonth et maxRequestsPerMonth doivent être des nombres' 
      });
    }

    if (maxTokensPerMonth < 0 || maxRequestsPerMonth < 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Les quotas ne peuvent pas être négatifs' 
      });
    }

    logger.info("⚙️ [ADMIN] Mise à jour quotas licence", { 
      licenseId,
      maxTokensPerMonth,
      maxRequestsPerMonth,
      adminId: req.user?.id 
    });

    // Vérifier que la licence existe et récupérer les infos
    const { data: existingLicense, error: checkError } = await supabase
      .from('licenses')
      .select(`
        id, 
        company_id, 
        max_tokens_per_month,
        max_requests_per_month,
        bots(name), 
        companies(name)
      `)
      .eq('id', licenseId)
      .single();

    if (checkError || !existingLicense) {
      logger.error("❌ [ADMIN] Licence non trouvée", { 
        licenseId,
        error: checkError?.message 
      });
      return res.status(404).json({ 
        success: false, 
        error: 'Licence non trouvée' 
      });
    }

    // Mise à jour des quotas
    const { data: updatedLicense, error: updateError } = await supabase
      .from('licenses')
      .update({
        max_tokens_per_month: maxTokensPerMonth,
        max_requests_per_month: maxRequestsPerMonth
      })
      .eq('id', licenseId)
      .select()
      .single();

    if (updateError) {
      logger.error("❌ [ADMIN] Erreur mise à jour quotas", { 
        error: updateError.message,
        licenseId 
      });
      return res.status(500).json({ 
        success: false, 
        error: 'Erreur lors de la mise à jour des quotas' 
      });
    }

    // Rafraîchir les vues matérialisées pour refléter les changements
    try {
      await supabase.rpc('refresh_admin_views');
      logger.info("✅ [ADMIN] Vues matérialisées rafraîchies après update quotas");
    } catch (refreshError) {
      logger.warn("⚠️ [ADMIN] Erreur refresh vues matérialisées", { 
        error: refreshError 
      });
      // On continue même si le refresh échoue
    }

    logger.info("✅ [ADMIN] Quotas mis à jour avec succès", { 
      licenseId,
      oldTokenQuota: existingLicense.max_tokens_per_month,
      newTokenQuota: maxTokensPerMonth,
      oldRequestQuota: existingLicense.max_requests_per_month,
      newRequestQuota: maxRequestsPerMonth,
      adminId: req.user?.id
    });

    return res.json({
      success: true,
      message: 'Quotas mis à jour avec succès',
      data: {
        license: {
          id: updatedLicense.id,
          max_tokens_per_month: updatedLicense.max_tokens_per_month,
          max_requests_per_month: updatedLicense.max_requests_per_month
        },
        company: existingLicense.companies?.name,
        bot: existingLicense.bots?.name,
        changes: {
          tokens: {
            old: existingLicense.max_tokens_per_month,
            new: maxTokensPerMonth
          },
          requests: {
            old: existingLicense.max_requests_per_month,
            new: maxRequestsPerMonth
          }
        }
      }
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception mise à jour quotas", {
      error: (err as Error).message,
      licenseId: req.body?.licenseId,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de la mise à jour" 
    });
  }
});

/**
 * 📋 GET /admin/quotas/list
 * Liste de toutes les licences avec leurs quotas actuels
 */
router.get("/list", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    logger.info("📋 [ADMIN] Récupération liste quotas", { 
      adminId: req.user?.id 
    });

    const { data: licenses, error: licensesError } = await supabase
      .from('licenses')
      .select(`
        id,
        max_tokens_per_month,
        max_requests_per_month,
        status,
        created_at,
        companies(id, name),
        bots(id, name)
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (licensesError) {
      logger.error("❌ [ADMIN] Erreur récupération liste quotas", { 
        error: licensesError.message 
      });
      return res.status(500).json({ 
        success: false, 
        error: 'Erreur récupération liste des quotas' 
      });
    }

    // Enrichir avec les stats d'usage actuelles
    const enrichedLicenses = await Promise.all(
      (licenses || []).map(async (license) => {
        // Récupérer l'usage actuel du mois
        const { data: currentUsage } = await supabase
          .from('openai_token_usage')
          .select('total_tokens')
          .gte('timestamp', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
          .eq('company_id', license.companies?.id);

        const tokensUsedThisMonth = currentUsage?.reduce((sum, usage) => sum + (usage.total_tokens || 0), 0) || 0;
        const requestsUsedThisMonth = currentUsage?.length || 0;

        return {
          ...license,
          usage: {
            tokens_used: tokensUsedThisMonth,
            requests_used: requestsUsedThisMonth,
            tokens_utilization_percent: license.max_tokens_per_month > 0 
              ? Math.round((tokensUsedThisMonth / license.max_tokens_per_month) * 100) 
              : 0,
            requests_utilization_percent: license.max_requests_per_month > 0 
              ? Math.round((requestsUsedThisMonth / license.max_requests_per_month) * 100) 
              : 0
          }
        };
      })
    );

    logger.info("✅ [ADMIN] Liste quotas récupérée", { 
      licensesCount: enrichedLicenses.length,
      adminId: req.user?.id
    });

    return res.json({
      success: true,
      data: enrichedLicenses
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception récupération liste quotas", {
      error: (err as Error).message,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de la récupération" 
    });
  }
});

/**
 * 🔍 GET /admin/quotas/license/:licenseId
 * Détails d'une licence spécifique avec historique d'usage
 */
router.get("/license/:licenseId", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { licenseId } = req.params;

    logger.info("🔍 [ADMIN] Récupération détails quota licence", { 
      licenseId,
      adminId: req.user?.id 
    });

    // Récupérer les infos de la licence
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select(`
        id,
        max_tokens_per_month,
        max_requests_per_month,
        status,
        created_at,
        companies(id, name, siren),
        bots(id, name, description)
      `)
      .eq('id', licenseId)
      .single();

    if (licenseError || !license) {
      return res.status(404).json({ 
        success: false, 
        error: 'Licence non trouvée' 
      });
    }

    // Récupérer l'historique d'usage des 6 derniers mois
    const { data: usageHistory, error: usageError } = await supabase
      .rpc('get_company_monthly_evolution', { 
        company_uuid: license.companies?.id 
      });

    return res.json({
      success: true,
      data: {
        license,
        usageHistory: usageHistory || []
      }
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception récupération détails quota", {
      error: (err as Error).message,
      licenseId: req.params.licenseId,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de la récupération" 
    });
  }
});

export default router;