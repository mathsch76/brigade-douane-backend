const { supabase } = require('./supabase');

export class UsageTracker {
  static async getEmebiBotId(): Promise<string> {
    return '6ae94745-664c-46ff-b6aa-fa2330ee59b5';
  }

  static async wrapApiCall<T>(
    userId: string,
    botId: string,
    threadId: string | undefined,
    apiCall: () => Promise<T>,
    options: any = {}
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      console.log('📊 Début tracking pour:', { userId, botId });
      
      const result = await apiCall();
      const responseTime = Date.now() - startTime;
      
      console.log('✅ Appel réussi en', responseTime, 'ms');
      
      // Tracking simple en arrière-plan
      setImmediate(async () => {
        try {
          console.log('🔍 Tentative insertion avec:', {
            user_id: userId,
            bot_id: botId,
            total_tokens: 150
          });
          
          const testInsert = await supabase.from('usage_tracking').insert({
            user_id: userId,
            bot_id: botId,
            total_tokens: 150,
            created_at: new Date().toISOString()
          });
          
          if (testInsert.error) {
            console.log('⚠️ ERREUR SUPABASE DÉTAILLÉE:', {
              message: testInsert.error.message,
              code: testInsert.error.code,
              details: testInsert.error.details,
              hint: testInsert.error.hint
            });
          } else {
            console.log('✅ Usage tracké avec succès dans Supabase !');
          }
        } catch (err: any) {
          console.log('⚠️ ERREUR JAVASCRIPT DÉTAILLÉE:', {
            name: err.name,
            message: err.message,
            stack: err.stack
          });
        }
      });
      
      return result;
    } catch (error) {
      console.log('❌ Erreur dans wrapApiCall:', error);
      throw error;
    }
  }
}