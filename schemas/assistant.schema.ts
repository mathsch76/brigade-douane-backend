// auth-backend/schemas/assistant.schema.ts
import { z } from 'zod';

/**
 * Liste des bots autorisés - à maintenir synchronisée avec la base de données
 */
const ALLOWED_BOTS = [
  'EMEBI ET TVA UE',
  'SANCTIONS RUSSES', 
  'MACF',
  'EUDR',
  'CODE DES DOUANES UE',
  'NAO',
  'INCOTERMS',
  'CRÉDITS DOCUMENTAIRES',
  'BREXIT',
  'SOS HOTLINE',
  'USA'
];

/**
 * Schéma de validation pour les requêtes à l'assistant
 * ✅ user_id SUPPRIMÉ - récupéré depuis JWT par jwtAuthGuard
 */
export const askSchema = z.object({
  question: z.string()
    .min(1, 'La question ne peut pas être vide')
    .max(4000, 'La question est trop longue (maximum 4000 caractères)'),
  // ✅ user_id SUPPRIMÉ - vient du JWT !
  chatbot_id: z.string()
    .min(1, 'ID du chatbot requis')
    .refine(
      (val) => ALLOWED_BOTS.includes(val), 
      {
        message: `Bot non autorisé. Bots disponibles: ${ALLOWED_BOTS.join(', ')}`
      }
    ),
  // ✅ AJOUT : Support des préférences optionnelles (cohérent avec preferences.schema)
  preferences: z.object({
    content_orientation: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    communication_style: z.enum(['casual', 'professional', 'technical']).optional(),
    nickname: z.string().max(50, 'Pseudonyme trop long').optional()
  }).optional()
});

/**
 * Schéma de validation pour la récupération des bots
 */
export const botsQuerySchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
  offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
});