// auth-backend/schemas/admin.schema.ts
import { z } from 'zod';

export const userIdParamSchema = z.object({
  userId: z.string().uuid('ID utilisateur invalide'),
});

export const revokeLicenseSchema = z.object({
  licenseId: z.string().uuid('ID licence invalide'),
});

export const tokensQuerySchema = z.object({
  bot_id: z.string().optional(),
});

export const analyticsQuerySchema = z.object({
  period: z.string()
    .optional()
    .transform(val => val ? parseInt(val) : 30)
    .refine(val => val >= 1 && val <= 365, {
      message: 'Période invalide (1-365 jours)'
    }),
});