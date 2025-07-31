// auth-backend/schemas/preferences.schema.ts
import { z } from 'zod';

export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system'], {
    errorMap: () => ({ message: 'Thème invalide' })
  }).optional(),
  communication_style: z.enum(['casual', 'professional', 'technical'], {
    errorMap: () => ({ message: 'Style de communication invalide' })
  }).optional(),
  content_orientation: z.enum(['beginner', 'intermediate', 'advanced'], {
    errorMap: () => ({ message: 'Orientation contenu invalide' })
  }).optional(),
});

export const themeSchema = z.object({
  theme: z.enum(['light', 'dark', 'system'], {
    errorMap: () => ({ message: 'Thème invalide' })
  }),
});

export const botPreferencesSchema = z.object({
  bot_id: z.string()
    .min(1, 'ID bot requis')
    .max(100, 'ID bot trop long'),
  content_orientation: z.enum(['beginner', 'intermediate', 'advanced'], {
    errorMap: () => ({ message: 'Niveau de contenu invalide' })
  }),
});

export const avatarPreferencesSchema = z.object({
  bot_name: z.string()
    .min(1, 'Nom du bot requis')
    .max(100, 'Nom du bot trop long'),
  selected_avatar: z.string()
    .regex(/^bot([1-9]|[12][0-9])\.png$/, 'Avatar invalide (format: bot1.png à bot29.png)'),
});