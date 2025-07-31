// auth-backend/routes/admin/index.ts - MISE À JOUR
import express from 'express';
import dashboardRoutes from './dashboard';
import quotasRoutes from './quotas';
import exportsRoutes from './exports';
import metricsRouter from './metrics';
import tokensRoutes from './tokens';
import botStatsRouter from './bot-stats';
import userManagementRoutes from './user-management'; // 🆕 NOUVEAU MODULE

const router = express.Router();

// Assembly de tous les sous-modules admin
router.use('/dashboard', dashboardRoutes);
router.use('/quotas', quotasRoutes);
router.use('/export', exportsRoutes);
router.use('/bot-stats', botStatsRouter); 
router.use('/metrics', metricsRouter);
router.use('/user-management', userManagementRoutes); // 🆕 GESTION DES COMPTES

// 🆕 NOUVELLE ROUTE TOKENS - Mount directement sur /admin
router.use('/', tokensRoutes); // Routes: /admin/users/:userId/tokens

// TODO: Migrer les routes existantes vers des modules séparés
// router.use('/users', usersRoutes);
// router.use('/companies', companiesRoutes); 
// router.use('/licenses', licensesRoutes);

// 🏠 Route de base admin info
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Admin API Routes',
    version: '2.1.0', // 🆕 Version incrémentée
    modules: {
      dashboard: '/admin/dashboard',
      quotas: '/admin/quotas', 
      exports: '/admin/export',
      metrics: '/admin/metrics',
      userManagement: { // 🆕 NOUVEAU MODULE
        detailedUsers: '/admin/user-management/companies/:companyId/users/detailed',
        updateProfile: '/admin/user-management/users/:userId/profile',
        updateStatus: '/admin/user-management/users/:userId/status',
        resetQuotas: '/admin/user-management/users/:userId/quotas/reset',
        availableBots: '/admin/user-management/companies/:companyId/available-bots'
      },
      tokens: {
        userTokens: '/admin/users/:userId/tokens',
        userBots: '/admin/users/:userId/bots',
        summary: '/admin/users/:userId/tokens/summary'
      }
    },
    timestamp: new Date().toISOString()
  });
});

export default router;