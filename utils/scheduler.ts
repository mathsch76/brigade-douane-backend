// utils/scheduler.ts
import { supabase } from './supabase';
import logger from './logger';

export const resetMonthlyQuotas = async (): Promise<void> => {
  logger.info('🔄 Début du reset mensuel des quotas...');

  try {
    const { count: totalUsers, error: countError } = await supabase
      .from('user_licenses')
      .select('id', { count: 'exact' })
      .gt('requests_used', 0);

    if (countError) {
      logger.error('❌ Échec lors du comptage des utilisateurs :', countError);
      return;
    }

    logger.info(`👥 Utilisateurs à réinitialiser : ${totalUsers}`);

    const { error: resetError } = await supabase
      .from('user_licenses')
      .update({ requests_used: 0 })
      .gt('requests_used', 0);

    if (resetError) {
      logger.error('❌ Échec lors de la réinitialisation des quotas :', resetError);
      return;
    }

    logger.info('✅ Réinitialisation des quotas terminée avec succès.');
  } catch (err) {
    logger.error('🔥 Exception inattendue durant le reset des quotas :', err);
  }
};

export const scheduleMonthlyReset = () => {
  const MAX_TIMEOUT = 2147483647;
  const fullDelay = 30 * 24 * 60 * 60 * 1000;

  const planifier = () => {
    if (fullDelay > MAX_TIMEOUT) {
      setTimeout(() => {
        planifier();
      }, MAX_TIMEOUT);
    } else {
      setTimeout(async () => {
        await resetMonthlyQuotas();
        planifier();
      }, fullDelay);
    }
  };

  planifier();
};
