// auth-backend/routes/contact.ts
import { validate, sanitize } from '../middlewares/validate';
import { contactSchema } from '../schemas/contact.schema';
import { Router, Request, Response } from 'express';
import { sendContactMessage } from '../utils/email';
import logger from '../utils/logger';

const router = Router();

router.post('/send', sanitize, validate(contactSchema), async (req: Request, res: Response) => {
  try {
    const { name, email, messageType, message, userId } = req.body;

    // Validation
    if (!name || !email || !messageType || !message) {
      return res.status(400).json({
        success: false,
        error: 'Tous les champs sont requis'
      });
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Format d\'email invalide'
      });
    }

    // Envoyer via ton service email existant
    const result = await sendContactMessage(name, email, messageType, message, userId);

    logger.info('📧 Message de contact envoyé', { from: email, type: messageType });

    res.status(200).json({
      success: true,
      message: 'Message envoyé avec succès',
      messageId: result.data?.id
    });

  } catch (error: any) {
    logger.error('❌ Erreur envoi contact:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi du message'
    });
  }
});

// Route de test
router.get('/test', (req: Request, res: Response) => {
  res.json({
    message: 'Route contact opérationnelle',
    timestamp: new Date().toISOString()
  });
});

export default router;