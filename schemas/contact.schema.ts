// auth-backend/schemas/contact.schema.ts
import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string()
    .min(1, 'Le nom est requis')
    .max(100, 'Le nom est trop long')
    .trim(),
  email: z.string()
    .email('Adresse email invalide')
    .max(255, 'Email trop long'),
  messageType: z.enum(['ergonomie', 'technique', 'idees', 'autre'], {
    errorMap: () => ({ message: 'Type de message invalide' })
  }),
  message: z.string()
    .min(10, 'Le message doit contenir au moins 10 caractères')
    .max(2000, 'Le message est trop long (max 2000 caractères)')
    .trim(),
  userId: z.string().uuid('ID utilisateur invalide').optional(),
});