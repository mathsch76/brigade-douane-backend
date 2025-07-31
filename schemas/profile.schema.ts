// auth-backend/schemas/profile.schema.ts
import { z } from 'zod';

export const updateProfileSchema = z.object({
  nickname: z.string()
    .min(1, 'Le surnom ne peut pas être vide')
    .max(50, 'Le surnom est trop long')
    .trim()
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Le surnom contient des caractères invalides'),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Ancien mot de passe requis'),
  newPassword: z.string()
    .min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères')
    .max(100, 'Le mot de passe est trop long')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
});