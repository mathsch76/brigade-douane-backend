// auth-backend/schemas/user.schema.ts
import { z } from 'zod';

/**
 * Schéma de validation pour les requêtes de profil utilisateur
 */
export const userProfileSchema = z.object({
  first_name: z.string().min(1, 'Le prénom est requis').max(100, 'Le prénom est trop long'),
  last_name: z.string().min(1, 'Le nom est requis').max(100, 'Le nom est trop long'),
  nickname: z.string().optional(),
  job_title: z.string().optional(),
  company: z.string().optional(),
});

/**
 * Schéma de validation pour les paramètres de requête d'utilisateurs
 */
export const usersQuerySchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
  role: z.string().optional(),
});

/**
 * Schéma de validation pour la création d'un utilisateur
 */
export const createUserSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une lettre majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une lettre minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
  first_name: z.string().min(1, 'Le prénom est requis'),
  last_name: z.string().min(1, 'Le nom est requis'),
  role: z.enum(['user', 'admin'], {
    errorMap: () => ({ message: 'Le rôle doit être "user" ou "admin"' })
  }),
});