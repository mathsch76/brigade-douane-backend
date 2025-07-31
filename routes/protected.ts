// auth-backend/routes/protected.ts
import express from "express";
import { legacyAuthGuard, adminGuard, AuthenticatedRequest } from "../middlewares/authguard";
import logger from "../utils/logger";

const router = express.Router();

// Route protégée pour vérifier l'accès admin - utilise le middleware admin
router.get("/admin/check", adminGuard, (req: AuthenticatedRequest, res) => {
  logger.info("✅ Accès admin autorisé", { 
    userId: req.user?.id || req.user?.sub,
    role: req.user?.role
  });
  res.status(200).json({ 
    message: "✅ Accès admin autorisé", 
    user: {
      id: req.user?.id || req.user?.sub,
      email: req.user?.email,
      role: req.user?.role
    }
  });
});

// Ajout d'une route test pour l'authentification standard
router.get("/user/check", legacyAuthGuard, (req: AuthenticatedRequest, res) => {
  logger.info("✅ Accès utilisateur autorisé", { 
    userId: req.user?.id || req.user?.sub,
    role: req.user?.role
  });
  res.status(200).json({ 
    message: "✅ Accès utilisateur autorisé", 
    user: {
      id: req.user?.id || req.user?.sub,
      email: req.user?.email,
      role: req.user?.role
    }
  });
});

export default router;