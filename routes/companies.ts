// auth-backend/routes/companies.ts - VERSION ANALYTICS DÉFINITIVE
const { supabase } = require('../utils/supabase');
import express from "express";
import { legacyAuthGuard, adminGuard, AuthenticatedRequest } from "../middlewares/authguard";
import logger from "../utils/logger";

const router = express.Router();

interface CompanyWithStats {
  id: string;
  name: string;
  siren: string | null;
  users_count: number;
  total_licenses: number;
  active_licenses: number;
  total_assignments: number;
  active_users: number;
  total_usage: number;
  utilization_rate: number;
  created_at: string;
}

interface CompanyUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  role: string;
  created_at: string;
  assigned_bots: number;
  total_usage: number;
  last_activity: string | null;
  bot_details?: BotAccess[];
}

interface BotAccess {
  bot_id: string;
  bot_name: string;
  bot_description: string;
  assigned_at: string;
  requests_used: number;
  last_used: string | null;
  status: string;
}

/**
 * 🏢 GET /companies/with-stats - Liste des entreprises avec analytics complètes
 */
router.get("/with-stats", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    logger.info("📊 Récupération entreprises avec analytics", { 
      adminId: req.user?.id 
    });

    // Requête optimisée avec toutes les données en une fois
    const { data: companiesData, error: companiesError } = await supabase
      .from('companies')
      .select(`
        id,
        name,
        siren,
        created_at,
        users!inner (
          id,
          email,
          first_name,
          last_name
        ),
        licenses!inner (
          id,
          status,
          user_bot_access (
            id,
            requests_used,
            status,
            user_id
          )
        )
      `);

    if (companiesError) {
      logger.error("❌ Erreur récupération entreprises", { 
        error: companiesError.message 
      });
      return res.status(500).json({ 
        error: "Erreur lors de la récupération des entreprises." 
      });
    }

    // D'abord, récupérer TOUTES les interactions pour TOUTES les entreprises
    const allUserIds = (companiesData || []).flatMap(company => 
      (company.users || []).map(u => u.id)
    );

    let allInteractions = [];
    if (allUserIds.length > 0) {
      try {
        const { data: interactionsData, error: interactionsError } = await supabase
          .from('openai_token_usage') 
          .select('user_id, input_tokens, output_tokens')
          .in('user_id', allUserIds);

logger.info('🔍 userIds recherchés:', allUserIds);
logger.info('🔍 Interactions trouvées:', interactionsData);
logger.error('❌ Erreur interactions:', interactionsError);

if (interactionsError) {
  logger.error('Erreur récupération interactions:', interactionsError);
}

        
        if (!interactionsError && interactionsData) {
          allInteractions = interactionsData;
          logger.info("✅ Interactions récupérées", { count: interactionsData.length });
        }
console.log('🔍 Données interactions reçues:', JSON.stringify(interactionsData, null, 2));
      } catch (err) {
        logger.warn("Erreur récupération interactions globales", { error: err });
      }
    }

    // Transformer et calculer les analytics
    const companiesWithStats: CompanyWithStats[] = (companiesData || []).map(company => {
      const users = company.users || [];
      const licenses = company.licenses || [];
      
      // Calculer les assignations actives
      const allAssignments = licenses.flatMap(license => 
        (license.user_bot_access || []).filter((access: any) => access.status === 'active')
      );
      
      // Utilisateurs ayant au moins un accès
      const uniqueActiveUsers = new Set(allAssignments.map((access: any) => access.user_id));
      
      // Calculs statistiques
      const totalLicenses = licenses.length;
      const activeLicenses = licenses.filter(l => l.status === 'active').length;
      const totalAssignments = allAssignments.length;
      const activeUsers = uniqueActiveUsers.size;
      
     
      // Calcul du VRAI usage depuis openai_token_usage
const userIds = users.map(u => u.id);
const companyInteractions = allInteractions.filter(interaction => 
  userIds.includes(interaction.user_id)
);

let totalUsage = 0;
if (companyInteractions.length > 0) {
  totalUsage = companyInteractions.reduce((sum, interaction) => 
    sum + (interaction.input_tokens || 0) + (interaction.output_tokens || 0), 0
  );
} else {
  // VRAIE valeur : 0 tokens si aucune interaction dans openai_token_usage
  totalUsage = 0;
}   
   
      const utilizationRate = totalAssignments > 0 
        ? Math.round((activeUsers / users.length) * 100) 
        : 0;

console.log(`🏢 [${company.name}] Stats détaillées:`, JSON.stringify({
  users: users.length,
  licenses: totalLicenses,
  assignments: totalAssignments,
  activeUsers,
  usage: totalUsage,
  interactions: companyInteractions.length
}, null, 2));

logger.info("🔍 Debug interactions", { 
  allUserIds: allUserIds.length, 
  interactionsCount: allInteractions.length 
});

      return {
        id: company.id,
        name: company.name,
        siren: company.siren,
        users_count: users.length,
        total_licenses: totalLicenses,
        active_licenses: activeLicenses,
        total_assignments: totalAssignments,
        active_users: activeUsers,
        total_usage: totalUsage,
        utilization_rate: utilizationRate,
        created_at: company.created_at
      };
    });

    // Trier par usage décroissant
    companiesWithStats.sort((a, b) => b.total_usage - a.total_usage);

    logger.info("✅ Entreprises avec analytics récupérées", { 
      count: companiesWithStats.length,
      totalAssignments: companiesWithStats.reduce((sum, c) => sum + c.total_assignments, 0),
      totalUsage: companiesWithStats.reduce((sum, c) => sum + c.total_usage, 0)
    });

    return res.json({
      success: true,
      companies: companiesWithStats,
      summary: {
        total_companies: companiesWithStats.length,
        total_users: companiesWithStats.reduce((sum, c) => sum + c.users_count, 0),
        total_licenses: companiesWithStats.reduce((sum, c) => sum + c.total_licenses, 0),
        total_assignments: companiesWithStats.reduce((sum, c) => sum + c.total_assignments, 0),
        total_active_users: companiesWithStats.reduce((sum, c) => sum + c.active_users, 0),
        total_usage: companiesWithStats.reduce((sum, c) => sum + c.total_usage, 0)
      }
    });

  } catch (err) {
    logger.error("❌ Exception récupération entreprises", {
      error: (err as Error).message,
      stack: (err as Error).stack
    });
    res.status(500).json({ error: "Erreur serveur." });
  }
});

/**
 * 👥 GET /companies/:companyId/users - Utilisateurs d'une entreprise avec VRAIES STATS
 */
router.get("/:companyId/users", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { companyId } = req.params;

    logger.info("👥 [ADMIN] Récupération utilisateurs entreprise", { 
      companyId,
      adminId: req.user?.id 
    });

    // Récupérer l'entreprise
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return res.status(404).json({ error: "Entreprise non trouvée." });
    }

    // Récupérer les utilisateurs de l'entreprise
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, job_title, role, created_at, last_login_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (usersError) {
      logger.error("❌ [ADMIN] Erreur récupération utilisateurs", { 
        error: usersError.message,
        companyId
      });
      return res.status(500).json({ 
        error: "Erreur lors de la récupération des utilisateurs." 
      });
    }

    // Pour chaque utilisateur, récupérer ses stats complètes
    const usersWithStats = await Promise.all(
      (users || []).map(async (user) => {
        
        // 1. Compter les bots assignés (= licences)
         const { data: userBots, error: botsError } = await supabase
          .from('user_bot_access')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'active');

        const licenses_count = userBots?.length || 0;
        
        // 2. Calculer l'usage total  
        const { data: tokenUsage, error: usageError } = await supabase
          .from('openai_token_usage')
          .select('total_tokens')
          .eq('user_id', user.id);

        const total_usage = tokenUsage?.reduce((sum, usage) => {
          return sum + (usage.total_tokens || 0);
        }, 0) || 0;

        // 3. Calculer le quota (10k tokens par bot)
        const quota_per_bot = 10000;
        const total_quota = licenses_count * quota_per_bot;

        // 4. Récupérer la dernière activité
        const { data: lastActivity } = await supabase
          .from('openai_token_usage')
          .select('timestamp')
          .eq('user_id', user.id)
          .order('timestamp', { ascending: false })
          .limit(1);

        const last_activity = lastActivity?.[0]?.timestamp || null;

        return {
          ...user,
          licenses_count,
          total_usage,
          total_quota,
          last_activity
        };
      })
    );

    logger.info("✅ [ADMIN] Utilisateurs entreprise récupérés", { 
      companyId,
      userCount: usersWithStats?.length || 0
    });

    return res.json({
      success: true,
      company,
      users: usersWithStats || []
    });

  } catch (err) {
    logger.error("❌ [ADMIN] Exception récupération utilisateurs entreprise", {
      error: (err as Error).message,
      companyId: req.params.companyId
    });
    res.status(500).json({ error: "Erreur serveur." });
  }
});
/**
 * ➕ POST /companies/:companyId/assign-bot - Assigner un bot à un utilisateur
 */
router.post("/:companyId/assign-bot", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { companyId } = req.params;
    const { userId, botId } = req.body;

    if (!userId || !botId) {
      return res.status(400).json({ 
        error: "userId et botId sont requis." 
      });
    }

    // Vérifier que l'entreprise a une licence pour ce bot
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('bot_id', botId)
      .eq('status', 'active')
      .single();

    if (licenseError || !license) {
      return res.status(400).json({ 
        error: "Cette entreprise n'a pas de licence active pour ce bot." 
      });
    }

    // Vérifier que l'utilisateur appartient à l'entreprise
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('id', userId)
      .eq('company_id', companyId)
      .single();

    if (userError || !user) {
      return res.status(400).json({ 
        error: "Utilisateur non trouvé dans cette entreprise." 
      });
    }

    // Vérifier si l'assignation existe déjà
    const { data: existingAccess, error: checkError } = await supabase
      .from('user_bot_access')
      .select('id')
      .eq('user_id', userId)
      .eq('license_id', license.id)
      .single();

    if (existingAccess) {
      return res.status(400).json({ 
        error: "Cet utilisateur a déjà accès à ce bot." 
      });
    }

    // Créer l'assignation
    const { data: newAccess, error: assignError } = await supabase
      .from('user_bot_access')
      .insert({
        user_id: userId,
        license_id: license.id,
        assigned_at: new Date().toISOString(),
        status: 'active'
      })
      .select()
      .single();

    if (assignError) {
      logger.error("❌ Erreur assignation bot", {
        error: assignError.message,
        userId,
        botId,
        licenseId: license.id
      });
      return res.status(500).json({ 
        error: "Erreur lors de l'assignation du bot." 
      });
    }

    logger.info("✅ Bot assigné à utilisateur", { 
      userId,
      botId,
      companyId,
      adminId: req.user?.id
    });

    return res.status(201).json({
      success: true,
      message: `Bot assigné avec succès à ${user.first_name} ${user.last_name}`,
      assignment: {
        id: newAccess.id,
        user_id: userId,
        license_id: license.id,
        assigned_at: newAccess.assigned_at
      }
    });

  } catch (err) {
    logger.error("❌ Exception assignation bot", {
      error: (err as Error).message,
      companyId: req.params.companyId
    });
    res.status(500).json({ error: "Erreur serveur." });
  }
});

/**
 * 🗑️ DELETE /companies/:companyId/revoke-bot - Révoquer l'accès d'un utilisateur à un bot
 */
router.delete("/:companyId/revoke-bot", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { companyId } = req.params;
    const { userId, botId } = req.body;

    // Trouver l'assignation à supprimer
    const { data: assignment, error: findError } = await supabase
      .from('user_bot_access')
      .select(`
        id,
        users!inner (first_name, last_name, company_id),
        licenses!inner (bot_id)
      `)
      .eq('user_id', userId)
      .eq('licenses.bot_id', botId)
      .eq('users.company_id', companyId)
      .single();

    if (findError || !assignment) {
      return res.status(404).json({ 
        error: "Assignation non trouvée." 
      });
    }

    // Supprimer l'assignation
    const { error: deleteError } = await supabase
      .from('user_bot_access')
      .delete()
      .eq('id', assignment.id);

    if (deleteError) {
      logger.error("❌ Erreur révocation bot", {
        error: deleteError.message,
        assignmentId: assignment.id
      });
      return res.status(500).json({ 
        error: "Erreur lors de la révocation." 
      });
    }

    logger.info("✅ Accès bot révoqué", { 
      userId,
      botId,
      companyId,
      adminId: req.user?.id
    });

    return res.json({
      success: true,
      message: `Accès révoqué pour ${assignment.users.first_name} ${assignment.users.last_name}`
    });

  } catch (err) {
    logger.error("❌ Exception révocation bot", {
      error: (err as Error).message,
      companyId: req.params.companyId
    });
    res.status(500).json({ error: "Erreur serveur." });
  }
});

export default router;