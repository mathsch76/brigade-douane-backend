// auth-backend/routes/admin/exports.ts
// Routes pour l'export des données administratives en CSV/JSON

import express from 'express';
import { legacyAuthGuard, AuthenticatedRequest } from '../../middlewares/authguard';
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

// Fonction utilitaire pour convertir en CSV
const convertToCSV = (data: any[]): string => {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]).join(',');
  const csvRows = data.map((row: any) => {
    return Object.values(row).map((value: any) => {
      // Échapper les guillemets et virgules
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value || '';
    }).join(',');
  });
  
  return [headers, ...csvRows].join('\n');
};

/**
 * 📥 GET /admin/export/:type
 * Export des données en CSV ou JSON
 * Types disponibles: companies, users, alerts, licenses, token-usage
 * Query params: ?format=csv|json (défaut: json)
 */
router.get("/:type", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { type } = req.params;
    const { format = 'json' } = req.query;

    logger.info("📥 [ADMIN] Export de données", { 
      type,
      format,
      adminId: req.user?.id 
    });

    let data: any;
    let fileName: string;
    
    switch (type) {
      case 'companies':
        const { data: companies, error: companiesError } = await supabase
          .from('admin_company_stats')
          .select('*')
          .order('company_name');
        
        if (companiesError) {
          logger.error("❌ [ADMIN] Erreur export companies", { error: companiesError.message });
          throw companiesError;
        }
        
        data = companies;
        fileName = `companies_export_${new Date().toISOString().split('T')[0]}`;
        break;
        
      case 'users':
        const { data: users, error: usersError } = await supabase
          .from('admin_user_stats')
          .select('*')
          .order('company_name', { ascending: true });
        
        if (usersError) {
          logger.error("❌ [ADMIN] Erreur export users", { error: usersError.message });
          throw usersError;
        }
        
        data = users;
        fileName = `users_export_${new Date().toISOString().split('T')[0]}`;
        break;
        
      case 'alerts':
        const { data: alerts, error: alertsError } = await supabase
          .from('admin_quota_alerts')
          .select('*')
          .order('tokens_usage_percent', { ascending: false });
        
        if (alertsError) {
          logger.error("❌ [ADMIN] Erreur export alerts", { error: alertsError.message });
          throw alertsError;
        }
        
        data = alerts;
        fileName = `quota_alerts_export_${new Date().toISOString().split('T')[0]}`;
        break;

      case 'licenses':
        const { data: licenses, error: licensesError } = await supabase
          .from('licenses')
          .select(`
            id,
            status,
            max_tokens_per_month,
            max_requests_per_month,
            created_at,
            companies(name, siren),
            bots(name)
          `)
          .order('created_at', { ascending: false });
        
        if (licensesError) {
          logger.error("❌ [ADMIN] Erreur export licenses", { error: licensesError.message });
          throw licensesError;
        }
        
        // Aplatir les données pour l'export
        data = licenses?.map(license => ({
          license_id: license.id,
          license_status: license.status,
          max_tokens_per_month: license.max_tokens_per_month,
          max_requests_per_month: license.max_requests_per_month,
          created_at: license.created_at,
          company_name: license.companies?.name,
          company_siren: license.companies?.siren,
          bot_name: license.bots?.name
        }));
        
        fileName = `licenses_export_${new Date().toISOString().split('T')[0]}`;
        break;

      case 'usage':
        // Export détaillé de l'usage des tokens
        const { data: usage, error: usageError } = await supabase
          .from('openai_token_usage')
          .select(`
            timestamp,
            input_tokens,
            output_tokens,
            total_tokens,
            users(email, company_id),
            companies(name)
          `)
          .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // 30 derniers jours
          .order('timestamp', { ascending: false })
          .limit(10000); // Limiter à 10k entrées pour éviter les timeouts
        
        if (usageError) {
          logger.error("❌ [ADMIN] Erreur export usage", { error: usageError.message });
          throw usageError;
        }
        
        // Aplatir les données
        data = usage?.map(entry => ({
          timestamp: entry.timestamp,
          input_tokens: entry.input_tokens,
          output_tokens: entry.output_tokens,
          total_tokens: entry.total_tokens,
          user_email: entry.users?.email,
          user_company_id: entry.users?.company_id,
          company_name: entry.companies?.name
        }));
        
        fileName = `token_usage_export_${new Date().toISOString().split('T')[0]}`;
        break;
        
      case 'token-usage':
        console.log("🔥 [DEBUG] Début case token-usage");
        
        // Test simple d'abord
        console.log("🔥 [DEBUG] Test supabase simple...");
        const { data: testBots, error: testError } = await supabase
          .from('bots')
          .select('*')
          .limit(1);
        
        console.log("🔥 [DEBUG] Test bots result:", { data: testBots, error: testError });
        
        // Maintenant la vraie requête
        console.log("🔥 [DEBUG] Requête openai_token_usage...");
        const { data: tokenUsage, error: tokenUsageError } = await supabase
          .from('openai_token_usage')
          .select(`
            user_id,
            bot_id,
            thread_id,
            input_tokens,
            output_tokens,
            total_tokens,
            timestamp      
          `)
	  .order('timestamp', { ascending: false })
          .limit(5000);
        
        console.log("🔥 [DEBUG] Résultat openai_token_usage:", {
          dataLength: tokenUsage?.length || 0,
          error: tokenUsageError,
          firstRecord: tokenUsage?.[0] || null
        });
        
if (tokenUsageError) {
  console.error("❌ [DEBUG] Erreur COMPLÈTE:", JSON.stringify(tokenUsageError, null, 2));
  console.error("❌ [DEBUG] Message:", tokenUsageError.message);
  console.error("❌ [DEBUG] Code:", tokenUsageError.code);
  console.error("❌ [DEBUG] Details:", tokenUsageError.details);
  console.error("❌ [DEBUG] Hint:", tokenUsageError.hint);
  
  logger.error("❌ [ADMIN] Erreur export token-usage", { 
    error: tokenUsageError.message,
    code: tokenUsageError.code,
    details: tokenUsageError.details,
    hint: tokenUsageError.hint
  });
  throw tokenUsageError;
}
        
        data = tokenUsage;
        fileName = `token_usage_dashboard_${new Date().toISOString().split('T')[0]}`;
        console.log("🔥 [DEBUG] Data assignée, length:", data?.length || 0);
        break;

      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Type d\'export invalide. Utilisez: companies, users, alerts, licenses, usage, ou token-usage' 
        });
    }

    // Vérifier qu'on a des données
    if (!data || data.length === 0) {
      logger.warn("⚠️ [ADMIN] Aucune donnée à exporter", { type, adminId: req.user?.id });
      return res.status(404).json({ 
        success: false, 
        error: 'Aucune donnée à exporter' 
      });
    }

    // Export en CSV
    if (format === 'csv') {
      try {
        const csv = convertToCSV(data);
        
        // Headers pour le téléchargement CSV
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
        res.setHeader('Cache-Control', 'no-cache');
        
        logger.info("✅ [ADMIN] Export CSV généré", { 
          type,
          recordCount: data.length,
          fileName: `${fileName}.csv`,
          adminId: req.user?.id
        });
        
        return res.send(csv);
      } catch (csvError) {
        logger.error("❌ [ADMIN] Erreur génération CSV", { 
          error: (csvError as Error).message,
          type 
        });
        return res.status(500).json({ 
          success: false, 
          error: 'Erreur lors de la génération du CSV' 
        });
      }
    }

    // Export en JSON par défaut
    logger.info("✅ [ADMIN] Export JSON généré", { 
      type,
      recordCount: data?.length || 0,
      adminId: req.user?.id
    });

    return res.json({
      success: true,
      data,
      metadata: {
        type,
        format: 'json',
        exportedAt: new Date().toISOString(),
        recordCount: data?.length || 0,
        exportedBy: req.user?.email || req.user?.id,
        fileName: `${fileName}.json`
      }
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception export", {
      error: (err as Error).message,
      type: req.params.type,
      format: req.query.format,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de l'export" 
    });
  }
});

/**
 * 📊 GET /admin/export/stats/summary
 * Export d'un résumé statistique global
 */
router.get("/stats/summary", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { format = 'json' } = req.query;

    logger.info("📊 [ADMIN] Export résumé statistique", { 
      format,
      adminId: req.user?.id 
    });

    // Récupérer les stats globales
    const { data: companyStats } = await supabase
      .from('admin_company_stats')
      .select('*');

    const { data: alertsStats } = await supabase
      .from('admin_quota_alerts')
      .select('alert_status');

    // Calculer le résumé
    const summary = {
      generated_at: new Date().toISOString(),
      companies: {
        total: companyStats?.length || 0,
        active_seats: companyStats?.reduce((sum, c) => sum + (c.active_seats || 0), 0) || 0,
        total_tokens_used: companyStats?.reduce((sum, c) => sum + (c.tokens_used_month || 0), 0) || 0,
        total_quota: companyStats?.reduce((sum, c) => sum + (c.total_quota_tokens || 0), 0) || 0
      },
      alerts: {
        exceeded: alertsStats?.filter(a => a.alert_status === 'EXCEEDED').length || 0,
        warning: alertsStats?.filter(a => a.alert_status === 'WARNING').length || 0,
        total: alertsStats?.length || 0
      },
      utilization: {
        global_rate: companyStats && companyStats.length > 0 
          ? Math.round((companyStats.reduce((sum, c) => sum + (c.tokens_used_month || 0), 0) / 
              companyStats.reduce((sum, c) => sum + (c.total_quota_tokens || 0), 0)) * 100) || 0
          : 0
      }
    };

    const fileName = `admin_summary_${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      // Pour le CSV, aplatir l'objet
      const flatData = [
        {
          metric: 'Total Companies',
          value: summary.companies.total
        },
        {
          metric: 'Active Seats',
          value: summary.companies.active_seats
        },
        {
          metric: 'Tokens Used This Month',
          value: summary.companies.total_tokens_used
        },
        {
          metric: 'Total Quota',
          value: summary.companies.total_quota
        },
        {
          metric: 'Alerts Exceeded',
          value: summary.alerts.exceeded
        },
        {
          metric: 'Alerts Warning',
          value: summary.alerts.warning
        },
        {
          metric: 'Global Utilization Rate (%)',
          value: summary.utilization.global_rate
        }
      ];

      const csv = convertToCSV(flatData);
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
      
      return res.send(csv);
    }

    return res.json({
      success: true,
      data: summary,
      metadata: {
        type: 'summary',
        exportedAt: new Date().toISOString(),
        exportedBy: req.user?.email || req.user?.id
      }
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception export summary", {
      error: (err as Error).message,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur lors de l'export du résumé" 
    });
  }
});

/**
 * 📋 GET /admin/export/types
 * Liste des types d'export disponibles
 */
router.get("/types", legacyAuthGuard, adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const exportTypes = [
      {
        type: 'companies',
        description: 'Statistiques des entreprises avec quotas et usage',
        formats: ['json', 'csv'],
        fields: ['company_name', 'active_seats', 'tokens_used_month', 'total_quota_tokens', 'utilization_rate']
      },
      {
        type: 'users',
        description: 'Statistiques détaillées par utilisateur',
        formats: ['json', 'csv'],
        fields: ['email', 'company_name', 'tokens_used_month', 'assigned_licenses', 'last_activity']
      },
      {
        type: 'alerts',
        description: 'Alertes de quotas dépassés ou proches',
        formats: ['json', 'csv'],
        fields: ['company_name', 'bot_name', 'tokens_usage_percent', 'alert_status']
      },
      {
        type: 'licenses',
        description: 'Licences avec quotas configurés',
        formats: ['json', 'csv'],
        fields: ['company_name', 'bot_name', 'max_tokens_per_month', 'max_requests_per_month', 'status']
      },
      {
        type: 'usage',
        description: 'Historique d\'usage des tokens (30 derniers jours)',
        formats: ['json', 'csv'],
        fields: ['timestamp', 'user_email', 'company_name', 'total_tokens', 'input_tokens', 'output_tokens']
      },
      {
        type: 'token-usage',
        description: 'Données brutes de consommation pour le dashboard',
        formats: ['json', 'csv'],
        fields: ['user_id', 'bot_id', 'total_tokens', 'input_tokens', 'output_tokens', 'created_at']
      },
      {
        type: 'stats/summary',
        description: 'Résumé statistique global',
        formats: ['json', 'csv'],
        fields: ['companies_total', 'active_seats', 'global_utilization', 'alerts_count']
      }
    ];

    return res.json({
      success: true,
      data: exportTypes,
      usage: {
        endpoint: '/admin/export/:type',
        query_params: {
          format: 'csv ou json (défaut: json)'
        },
        examples: [
          '/admin/export/companies?format=csv',
          '/admin/export/users?format=json',
          '/admin/export/token-usage?format=json',
          '/admin/export/stats/summary?format=csv'
        ]
      }
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception liste types export", {
      error: (err as Error).message,
      adminId: req.user?.id
    });
    return res.status(500).json({ 
      success: false, 
      error: "Erreur serveur" 
    });
  }
});

export default router;