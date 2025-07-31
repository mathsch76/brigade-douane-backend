// auth-backend/schemas/auth.schema.ts
import { z } from 'zod';

/**
 * Schéma de validation pour la connexion
 */
export const loginSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
});

/**
 * Schéma de validation pour le rafraîchissement de token
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token invalide'),
});

/**
 * Schéma de validation pour la déconnexion
 */
export const logoutSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token invalide'),
});

/**
 * Schéma de validation pour le changement de mot de passe
 * (à implémenter ultérieurement)
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, 'Le mot de passe actuel doit contenir au moins 8 caractères'),
  newPassword: z.string()
    .min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères')
    .max(100, 'Le mot de passe est trop long')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une lettre majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une lettre minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^a-zA-Z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});