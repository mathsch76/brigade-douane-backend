// auth-backend/routes/admin/user-management.ts
const { supabase } = require('../../utils/supabase');
import express from "express";
import { adminGuard, AuthenticatedRequest } from "../../middlewares/authguard";

const router = express.Router();

/**
 * 🏢 GET /admin/user-management/companies
 * Récupère toutes les entreprises avec le nombre d'utilisateurs
 */
router.get("/companies", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    console.log("🏢 [USER-MGMT] Récupération de toutes les entreprises");

    // Récupérer toutes les entreprises
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name, siren, created_at')
      .order('name', { ascending: true });

    if (companiesError) {
      console.error("❌ [USER-MGMT] Erreur récupération entreprises:", companiesError);
      return res.status(500).json({ error: "Erreur lors de la récupération des entreprises." });
    }

    // Pour chaque entreprise, récupérer le nombre d'utilisateurs
    const companiesWithStats = await Promise.all(
      (companies || []).map(async (company) => {
        const { count: usersCount } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id);

 // Compter les accès utilisateurs actifs pour cette entreprise
const { data: activeBotAccess, error: accessError } = await supabase
  .from('user_bot_access')
  .select(`
    id,
    users!inner(company_id)
  `)
  .eq('users.company_id', company.id)
  .eq('status', 'active');

const botCount = activeBotAccess?.length || 0;

        return {
          ...company,
          users_count: usersCount || 0,
total_licenses: botCount
        };
      })
    );

    console.log("✅ [USER-MGMT] Entreprises récupérées:", companiesWithStats.length);

    return res.json(companiesWithStats);

  } catch (err) {
console.error("❌ [USER-MGMT] Exception:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Erreur serveur lors de la récupération des entreprises." });
  }
});

/**
 * 📊 GET /admin/user-management/companies/:companyId/users/detailed
 */
router.get("/companies/:companyId/users/detailed", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { companyId } = req.params;
    console.log("👥 [USER-MGMT] Récupération utilisateurs détaillés", companyId);

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, job_title, role, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error("❌ [USER-MGMT] Erreur Supabase:", JSON.stringify(usersError, null, 2));
      return res.status(500).json({ error: "Erreur lors de la récupération des utilisateurs." });
    }

    // ✅ VERSION AVEC LOGIQUE ADMIN vs USER
    const usersWithStats = await Promise.all((users || []).map(async (user) => {
      // Récupérer les bots assignés à cet utilisateur AVEC filtre sur l'entreprise
      const { data: userBotAccess, error: accessError } = await supabase
        .from('user_bot_access')
        .select(`
          license_id,
          status,
          assigned_at,
          licenses!inner(
            id,
            bot_id,
            company_id,
            bots!inner(
              id,
              name,
              description,
              code
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('licenses.company_id', companyId); // ✅ FILTRE CRUCIAL

   const assignedBots = (userBotAccess || []).map(access => ({
  bot_id: access.licenses.bot_id,
  bot_name: access.licenses.bots.name,
  bot_description: access.licenses.bots.description,
  bot_code: access.licenses.bots.code,
  license_id: access.license_id,
  access_status: access.status,
  assigned_at: access.assigned_at,
  expiration_date: (() => {
    const assignedDate = new Date(access.assigned_at);
    assignedDate.setFullYear(assignedDate.getFullYear() + 1);
    return assignedDate.toISOString();
  })(),
bot_icon: (() => {
  // Mapping des codes vers les vrais noms de fichiers
  const iconMap = {
    'emebi': '/bot5.png',
    'macf': '/bot6.png', 
    'eudr': '/bot9.png',
    'brexit': '/bot1.png',
    'douanes_ue': '/bot2.png',
    'credits': '/bot3.png',
    'incoterms': '/bot4.png',
    'nao': '/bot7.png',
    'sanctions': '/bot10.png',
    'usa': '/bot12.png'
  };
  return iconMap[access.licenses.bots.code] || '/default-bot.png';
})()
}));

      return {
        ...user,
        assigned_bots: assignedBots,
        active_bots: assignedBots.length,
        total_bots_assigned: assignedBots.length,
        status: 'active'
      };
    }));

    console.log("✅ [USER-MGMT] Utilisateurs récupérés:", usersWithStats.length);

    return res.json({
      success: true,
      users: usersWithStats
    });

  } catch (err: any) {
    console.error("❌ [USER-MGMT] Exception:", err);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

/**
 * 🤖 GET /admin/user-management/companies/:companyId/available-bots
 */
router.get("/companies/:companyId/available-bots", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { companyId } = req.params;
    console.log("🤖 [USER-MGMT] Récupération bots disponibles pour", companyId);

    // ✅ LOGIQUE ADMIN : Si c'est NAO&CO, voir tous les bots
const isNaoAdmin = companyId === 'e38a3744-9be7-4481-b118-c84f18b37389';
console.log("🔍 [DEBUG] companyId reçu:", companyId);
console.log("🔍 [DEBUG] isNaoAdmin:", isNaoAdmin);
    
    let availableBots = [];

    if (isNaoAdmin) {
      // 🔥 ADMIN NAO&CO : Voir TOUS les bots existants
      console.log("👑 [ADMIN] Récupération de TOUS les bots pour admin NAO&CO");
      
      const { data: allBots, error: allBotsError } = await supabase
        .from('bots')
        .select('id, name, description, code')
        .order('name');

      if (allBotsError) {
        console.error("❌ [ADMIN] Erreur récupération tous les bots:", allBotsError);
        return res.status(500).json({ error: "Erreur lors de la récupération des bots." });
      }

   availableBots = (allBots || []).map((bot, index) => ({
  bot_id: bot.id,
  bot_name: bot.name,
  bot_description: bot.description,
  bot_icon: (() => {
    // Attribution aléatoire basée sur l'ID du bot pour être cohérent
    const avatars = ['/bot1.png', '/bot2.png', '/bot3.png', '/bot4.png', '/bot5.png', 
                    '/bot6.png', '/bot7.png', '/bot8.png', '/bot9.png', '/bot10.png', '/bot11.png', '/bot12.png'];
    const hash = bot.id.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
    return avatars[Math.abs(hash) % avatars.length];
  })(),
  license_id: null
}));

    } else {
      // 👤 UTILISATEUR NORMAL : Voir seulement les bots de ses licences
      console.log("👤 [USER] Récupération bots des licences pour entreprise:", companyId);
      
      const { data: licenses, error: licensesError } = await supabase
        .from('licenses')
        .select('id, bot_id, status, created_at')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .not('bot_id', 'is', null);

      if (licensesError) {
        console.error("❌ [USER] Erreur licences:", licensesError);
        return res.status(500).json({ error: "Erreur lors de la récupération des licences." });
      }

      if (!licenses || licenses.length === 0) {
        return res.json({ 
          success: true, 
          bots: [],
          data: [],
          message: "Aucune licence active"
        });
      }

      const botIds = licenses.map(license => license.bot_id).filter(Boolean);
      
      const { data: bots, error: botsError } = await supabase
        .from('bots')
        .select('id, name, description, code')
        .in('id', botIds);

      if (botsError) {
        console.error("❌ [USER] Erreur bots:", botsError);
        return res.status(500).json({ error: "Erreur lors de la récupération des bots." });
      }

   availableBots = (bots || []).map(bot => ({
  bot_id: bot.id,
  bot_name: bot.name,
  bot_description: bot.description,
  bot_icon: (() => {
    const avatars = ['/bot1.png', '/bot2.png', '/bot3.png', '/bot4.png', '/bot5.png', 
                    '/bot6.png', '/bot7.png', '/bot8.png', '/bot9.png', '/bot10.png', '/bot11.png', '/bot12.png'];
    const hash = bot.id.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
    return avatars[Math.abs(hash) % avatars.length];
  })(),
  license_id: licenses.find(l => l.bot_id === bot.id)?.id
}));

    }

    console.log(`✅ [${isNaoAdmin ? 'ADMIN' : 'USER'}] ${availableBots.length} bots disponibles`);

    return res.json({
      success: true,
      bots: availableBots,
      data: availableBots,
      total_available: availableBots.length,
      is_admin: isNaoAdmin
    });

  } catch (err: any) {
    console.error("❌ [USER-MGMT] Exception:", (err: any as Error).message);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

/**
 * ✏️ PUT /admin/user-management/users/:userId
 * ROUTE POUR LE FRONTEND
 */
router.put("/users/:userId", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    console.log("🔍 [UPDATE USER] req.body COMPLET:", JSON.stringify(req.body, null, 2));
    console.log("🔍 [UPDATE USER] Object.keys(req.body):", Object.keys(req.body));

    const { first_name, last_name, email, job_title, role, status } = req.body;

    console.log("🔍 [UPDATE USER] Données reçues:", JSON.stringify({ 
      userId, 
      first_name, 
      last_name, 
      email, 
      job_title, 
      role, 
      status 
    }, null, 2));

    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: "Champs obligatoires manquants." });
    }

   const { data: updatedUser, error: updateError } = await supabase
  .from('users')
  .update({
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    email: email.trim().toLowerCase(),
    job_title: job_title?.trim() || null,
    role,
    status
  })
  .eq('id', userId)
  .select()
  .single();

    console.log("🔍 [UPDATE USER] Résultat Supabase:", { updatedUser, updateError });
    
    if (updateError) {
      console.error("❌ [USER-MGMT] Erreur mise à jour DÉTAILLÉE:", JSON.stringify(updateError, null, 2));
      console.error("❌ [USER-MGMT] Code erreur:", updateError.code);
      console.error("❌ [USER-MGMT] Message erreur:", updateError.message);
      return res.status(500).json({ success: false, error: "Erreur lors de la mise à jour." });
    }

    console.log("✅ [UPDATE USER] Utilisateur mis à jour:", updatedUser);

    return res.json({
      success: true,
      message: "Profil mis à jour avec succès",
      user: updatedUser
    });

  } catch (err: any) {
    console.error("❌ [USER-MGMT] Exception:", (err: any as Error).message);
    res.status(500).json({ success: false, error: "Erreur serveur." });
  }
});

/**
 * 🤖 POST /admin/user-management/users/:userId/bots/:botId
 */
router.post("/users/:userId/bots/:botId", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId, botId } = req.params;
    console.log("🤖 [ASSIGN] Assignation bot:", botId, "à user:", userId);

    // Récupérer l'utilisateur et sa company
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, company_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ success: false, error: "Utilisateur non trouvé." });
    }

// ✅ Logique admin : Si c'est NAO&CO admin, créer une licence si elle n'existe pas
const isNaoAdmin = user.company_id === 'e38a3744-9be7-4481-b118-c84f18b37389';
console.log("🔍 [ASSIGN] user.company_id:", user.company_id);
console.log("🔍 [ASSIGN] isNaoAdmin:", isNaoAdmin);
  
    let licenseId;
    
    if (isNaoAdmin) {
      // 👑 ADMIN : Créer une licence si elle n'existe pas
      const { data: existingLicense } = await supabase
        .from('licenses')
        .select('id')
        .eq('bot_id', botId)
        .eq('company_id', user.company_id)
        .limit(1)
        .single();
        
      if (existingLicense) {
        licenseId = existingLicense.id;
      } else {
        // Créer une nouvelle licence pour l'admin
        const { data: newLicense, error: createError } = await supabase
          .from('licenses')
          .insert({
            bot_id: botId,
            company_id: user.company_id,
            status: 'active'
          })
          .select('id')
          .single();
          
        if (createError) {
          console.error("❌ [ADMIN] Erreur création licence:", createError);
          return res.status(500).json({ success: false, error: "Erreur lors de la création de licence." });
        }
        
        licenseId = newLicense.id;
      }
    } else {
      // 👤 USER : Licence doit exister
      const { data: license, error: licenseError } = await supabase
        .from('licenses')
        .select('id')
        .eq('bot_id', botId)
        .eq('company_id', user.company_id)
        .eq('status', 'active')
        .limit(1)
        .single();

      if (licenseError || !license) {
        return res.status(400).json({ success: false, error: "Aucune licence active trouvée pour ce bot." });
      }
      
      licenseId = license.id;
    }

// Vérifier si déjà assigné (actif ou révoqué) - RECHERCHE PAR BOT_ID au lieu de LICENSE_ID
const { data: existing, error: existingError } = await supabase
  .from('user_bot_access')
  .select(`
    id, 
    status, 
    license_id,
    licenses!inner(bot_id)
  `)
  .eq('user_id', userId)
  .eq('licenses.bot_id', botId)
  .maybeSingle();

console.log("🔍 [ASSIGN] Existing access:", existing);

if (existing) {
  if (existing.status === 'active') {
    return res.status(400).json({ success: false, error: "Bot déjà assigné à cet utilisateur." });
  } else {
    // Réactiver l'assignation existante ET changer la licence
    console.log("🔄 [ASSIGN] Réactivation de l'accès existant avec nouvelle licence");
    const { error: updateError } = await supabase
      .from('user_bot_access')
      .update({
        status: 'active',
        license_id: licenseId, // ✅ AJOUT : Nouvelle licence
        assigned_at: new Date().toISOString()
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error("❌ [ASSIGN] Erreur réactivation:", updateError);
      return res.status(500).json({ success: false, error: "Erreur lors de la réactivation." });
    }

    console.log("✅ [ASSIGN] Bot réactivé avec succès");
    return res.json({
      success: true,
      message: "Bot réactivé avec succès"
    });
  }
}

// Créer 1 assignation
const { error: insertError } = await supabase
  .from('user_bot_access')
  .insert({
    user_id: userId,
    license_id: licenseId,
    status: 'active',
    assigned_at: new Date().toISOString(),
    max_tokens: 50000, // Valeur par défaut
    quota_used: 0
  });

    if (insertError) {
  console.error("❌ [ASSIGN] Erreur insertion DÉTAILLÉE:", JSON.stringify(insertError, null, 2));
  return res.status(500).json({ success: false, error: "Erreur lors de l'assignation." });
}

    return res.json({
      success: true,
      message: "Bot assigné avec succès"
    });

  } catch (err: any) {
    console.error("❌ [ASSIGN] Exception:", (err: any as Error).message);
    res.status(500).json({ success: false, error: "Erreur serveur." });
  }
});

/**
 * 🗑️ DELETE /admin/user-management/users/:userId/bots/:botId
 */
router.delete("/users/:userId/bots/:botId", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId, botId } = req.params;
    console.log("🗑️ [REVOKE] Révocation bot:", botId, "pour user:", userId);

    // Récupérer l'utilisateur
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, company_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ success: false, error: "Utilisateur non trouvé." });
    }

   // Trouver la licence (avec ou sans restriction company)
const { data: license, error: licenseError } = await supabase
  .from('licenses')
  .select('id')
  .eq('bot_id', botId)
  .eq('company_id', user.company_id);

console.log("🔍 [REVOKE] Licences trouvées:", license);

if (licenseError || !license || license.length === 0) {
  console.error("❌ [REVOKE] Erreur licence:", licenseError);
  return res.status(404).json({ success: false, error: "Licence non trouvée." });
}

const licenseId = Array.isArray(license) ? license[0].id : license.id;

    // Révoquer l'accès
    const { error: revokeError } = await supabase
      .from('user_bot_access')
      .update({
        status: 'revoked'
      })
      .eq('user_id', userId)
.eq('license_id', licenseId)
      .eq('status', 'active');

    if (revokeError) {
      console.error("❌ [REVOKE] Erreur:", revokeError);
      return res.status(500).json({ success: false, error: "Erreur lors de la révocation." });
    }

    return res.json({
      success: true,
      message: "Bot révoqué avec succès"
    });

  } catch (err: any) {
    console.error("❌ [REVOKE] Exception:", (err: any as Error).message);
    res.status(500).json({ success: false, error: "Erreur serveur." });
  }
});

// ✅ Route ajoutée pour la liste des bots disponibles
router.get('/bots/available', adminGuard, async (req, res) => {
  try {
    const { data, error } = await supabase.from('bots').select('*');
    if (err: anyor) throw error;
    res.json(data);
  } catch (err: any) {
    console.error("Erreur récupération bots:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📊 GET /admin/dashboard/bot-stats
 * UNE SEULE ROUTE QUI MARCHE !
 */
router.get("/dashboard/bot-stats", adminGuard, async (req: AuthenticatedRequest, res) => {
  try {
    console.log("📊 [DASHBOARD] Récupération statistiques bots actifs");

    const { data: botStats, error: statsError } = await supabase
      .from('openai_token_usage')
      .select('*')
      .not('bot_id', 'is', null);

    if (statsError) {
      console.error("❌ [DASHBOARD] Erreur:", statsError);
      return res.status(500).json({ 
        success: false, 
        error: "Erreur lors de la récupération des statistiques." 
      });
    }

    // 🔥 DEBUG HARDCORE
    console.log("🔥 TOTAL LIGNES:", botStats?.length || 0);
    if (botStats && botStats[0]) {
      console.log("🔥 PREMIÈRE LIGNE:", botStats[0]);
      console.log("🔥 TYPES:", {
        total_tokens: typeof botStats[0].total_tokens,
        input_tokens: typeof botStats[0].input_tokens
      });
      console.log("🔥 VALEURS:", {
        total_tokens: botStats[0].total_tokens,
        input_tokens: botStats[0].input_tokens
      });
    }

    if (!botStats || botStats.length === 0) {
      return res.json({
        success: true,
        active_bots: [],
        global_stats: {
          total_active_bots: 0,
          total_tokens: 0,
          total_cost_eur: 0,
          total_requests: 0
        }
      });
    }

    console.log("📊 [DASHBOARD] Données trouvées:", botStats.length, "lignes");

    // Grouper par bot_id directement
    const botGroups = {};
    botStats.forEach(stat => {
      const botId = stat.bot_id;
      
      if (!botGroups[botId]) {
        botGroups[botId] = {
          bot_id: botId,
          bot_name: `🤖 ${botId}`,
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_requests: 0,
          response_times: [],
          unique_users: new Set(),
          unique_companies: new Set()
        };
      }

      // 🔥 CONVERSION FORCÉE EN NOMBRES
      const totalTokens = parseInt(stat.total_tokens) || 0;
      const inputTokens = parseInt(stat.input_tokens) || 0;
      const outputTokens = parseInt(stat.output_tokens) || 0;

      botGroups[botId].total_tokens += totalTokens;
      botGroups[botId].input_tokens += inputTokens;
      botGroups[botId].output_tokens += outputTokens;
      botGroups[botId].total_requests += 1;
      
      if (stat.response_time_ms) {
        botGroups[botId].response_times.push(stat.response_time_ms);
      }
      
      if (stat.user_id) {
        botGroups[botId].unique_users.add(stat.user_id);
      }
      
      if (stat.company_id) {
        botGroups[botId].unique_companies.add(stat.company_id);
      }
    });

    console.log("🔥 BOT GROUPS:", Object.keys(botGroups));
    console.log("🔥 EXEMPLE GROUP:", Object.values(botGroups)[0]);

    // Calculer les statistiques finales
    const activeBots = Object.values(botGroups)
      .filter(bot => bot.total_tokens > 0)
      .map(bot => {
        const avgResponseTime = bot.response_times.length > 0
          ? Math.round(bot.response_times.reduce((sum, time) => sum + time, 0) / bot.response_times.length)
          : 0;

        const inputCostUSD = (bot.input_tokens / 1000) * 0.002;
        const outputCostUSD = (bot.output_tokens / 1000) * 0.006;
        const totalCostUSD = inputCostUSD + outputCostUSD;
        const estimatedCostEUR = totalCostUSD * 0.92;

        return {
          bot_id: bot.bot_id,
          bot_name: bot.bot_name,
          total_tokens: bot.total_tokens,
          input_tokens: bot.input_tokens,
          output_tokens: bot.output_tokens,
          total_requests: bot.total_requests,
          estimated_cost_eur: Math.round(estimatedCostEUR * 10000) / 10000,
          active_users: bot.unique_users.size,
          companies_using: bot.unique_companies.size,
          avg_response_time_ms: avgResponseTime
        };
      })
      .sort((a, b) => b.total_tokens - a.total_tokens);

    console.log("🔥 ACTIVE BOTS:", activeBots.length);
    console.log("🔥 PREMIER BOT:", activeBots[0]);

    // Statistiques globales
    const globalStats = {
      total_active_bots: activeBots.length,
      total_tokens: activeBots.reduce((sum, bot) => sum + bot.total_tokens, 0),
      total_cost_eur: activeBots.reduce((sum, bot) => sum + bot.estimated_cost_eur, 0),
      total_requests: activeBots.reduce((sum, bot) => sum + bot.total_requests, 0),
      avg_response_time_ms: activeBots.length > 0
        ? Math.round(activeBots.reduce((sum, bot) => sum + bot.avg_response_time_ms, 0) / activeBots.length)
        : 0
    };

    console.log("✅ [DASHBOARD] Résultat:", {
      active_bots: activeBots.length,
      total_tokens: globalStats.total_tokens,
      total_cost: globalStats.total_cost_eur.toFixed(4) + "€"
    });

    return res.json({
      success: true,
      active_bots: activeBots,
      global_stats: globalStats,
      last_updated: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("❌ [DASHBOARD] Exception:", (err: any as Error).message);
    res.status(500).json({ 
      success: false, 
      error: "Erreur serveur." 
    });
  }
});

export default router;