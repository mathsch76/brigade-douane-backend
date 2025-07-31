 
// auth-backend/routes/user/index.ts
import express from "express";
import profileRoutes from "./profile";
import preferencesRoutes from "./preferences";
import adminRoutes from "./admin";

const router = express.Router();

// 📋 Assemblage des sous-modules de routes utilisateur

// 👤 Routes de profil utilisateur (/user/me, /user/update-profile, /user/change-password)
router.use("/", profileRoutes);

// ⚙️ Routes de préférences (/user/preferences/*, /user/bot-preferences/*, /user/all-preferences)
router.use("/", preferencesRoutes);

// 🔐 Routes administrateur (/user/, /user/:userId/details, /user/:userId/revoke-license, /user/:userId/usage-analytics)
router.use("/", adminRoutes);

export default router;