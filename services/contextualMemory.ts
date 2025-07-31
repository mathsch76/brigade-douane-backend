import { OpenAI } from 'openai';
import logger from '../utils/logger';  // ✅ CORRIGÉ : pas de destructuring
import config from '../utils/config';

interface ChatExchange {
  message: string;
  role: 'user' | 'bot';
  timestamp: Date;  // ✅ CORRIGÉ : Date au lieu de created_at string
}

export class ContextualMemoryService {
  private openai: OpenAI;
  private cache: Map<string, { summary: string; timestamp: number }> = new Map();
  private supabase: any;  // ✅ AJOUTÉ : référence Supabase

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      defaultHeaders: {
        "OpenAI-Beta": "assistants=v2",
      },
    });
    
    // ✅ CORRIGÉ : Import Supabase dans constructor
    const { supabase } = require('../utils/supabase');
    this.supabase = supabase;
  }

  /**
   * 🎯 FONCTION PRINCIPALE - Résumé anti-amnésie (OPTIMISÉE)
   */
  async summarizeRecentHistory(userId: string, botName: string): Promise<string> {
    try {
      // ⚡ Cache check (15min au lieu de 30min pour plus de fraîcheur)
      const cacheKey = `${userId}_${botName}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
        logger.info('⚡ Cache hit résumé');
        return cached.summary;
      }

      // ⚡ TIMEOUT sur récupération historique (max 2s)
      const exchangesPromise = this.getRecentExchanges(userId, botName);
      const timeoutPromise = new Promise<ChatExchange[]>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout historique')), 2000)
      );
      
      const exchanges = await Promise.race([exchangesPromise, timeoutPromise]);
      
      if (exchanges.length === 0) {
        return "Début de conversation - pas de contexte précédent.";
      }

      // ⚡ Résumé GPT-3.5 optimisé
      const summary = await this.generateSummary(exchanges, botName);
      
      // Cache pour 15min
      this.cache.set(cacheKey, { summary, timestamp: Date.now() });
      
      logger.info('✅ Résumé généré', { 
        exchangesCount: exchanges.length,
        summaryLength: summary.length 
      });

      return summary;

    } catch (error) {
      logger.error('❌ Erreur résumé', { error: (error as Error).message });
      // ⚡ FALLBACK rapide
      return "Contexte temporairement indisponible.";
    }
  }

  /**
   * 📚 RÉCUPÉRATION HISTORIQUE (OPTIMISÉE)
   */
  private async getRecentExchanges(userId: string, botName: string): Promise<ChatExchange[]> {
    try {
      const { data, error } = await this.supabase
        .from('chat_context')
        .select('message, role, created_at')
        .eq('user_id', userId)
        .eq('chatbot_id', botName)
        .order('created_at', { ascending: false })
        .limit(20); // ⚡ Plus d'historique pour meilleur contexte

      if (error) {
        logger.error('❌ Erreur Supabase historique', { error: error.message });
        return [];
      }

      if (!data || data.length === 0) {
        logger.info('📭 Aucun historique trouvé', { userId, botName });
        return [];
      }

      // ✅ Inverser pour ordre chronologique + adapter interface
      const exchanges = data.reverse().map(row => ({
        message: row.message,
        role: row.role as 'user' | 'bot',
        timestamp: new Date(row.created_at)  // ✅ CORRIGÉ : conversion Date
      }));

      logger.debug('📚 Historique récupéré', { 
        count: exchanges.length,
        firstMessage: exchanges[0]?.message?.substring(0, 50) + '...',
        lastMessage: exchanges[exchanges.length - 1]?.message?.substring(0, 50) + '...'
      });

      return exchanges;

    } catch (error) {
      logger.error('❌ Erreur récupération historique', { error: (error as Error).message });
      return [];
    }
  }

  /**
   * 🤖 GÉNÉRATION RÉSUMÉ INTELLIGENT (OPTIMISÉE)
   */
  private async generateSummary(exchanges: ChatExchange[], botName: string): Promise<string> {
    const historyText = this.formatHistory(exchanges);

    // ⚡ PROMPT PLUS COURT ET DIRECT
    const prompt = `Résume cette conversation pour que l'assistant ${botName} comprenne le contexte :

${historyText}

Résumé en 2-3 phrases max, focus sur les promesses faites et ce que l'utilisateur attend :`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,        // ⚡ Réduit de 200 → 120
        temperature: 0,         // ⚡ Complètement déterministe
        top_p: 1,              // ⚡ Pas de randomness
      });

      return completion.choices[0].message.content || "Résumé indisponible.";

    } catch (error) {
      logger.error('❌ Erreur résumé GPT-3.5', { error: (error as Error).message });
      return this.generateBasicSummary(exchanges);
    }
  }

  /**
   * 📝 FORMATAGE HISTORIQUE
   */
  private formatHistory(exchanges: ChatExchange[]): string {
    return exchanges.map((ex, i) => {
      const speaker = ex.role === 'user' ? 'USER' : 'ASSISTANT';
      const time = ex.timestamp.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      return `[${time}] ${speaker}: ${ex.message.substring(0, 300)}${ex.message.length > 300 ? '...' : ''}`;
    }).join('\n\n');
  }

  /**
   * 🔍 FILTRE ÉCHANGES TECHNIQUES
   */
  private isTechnicalExchange(message: string): boolean {
    const relationalKeywords = [
      'salut', 'bonjour', 'ça va', 'merci', 'au revoir', 'bonne journée',
      'hello', 'hey', 'super', 'parfait', 'nickel'
    ];

    const lowerMessage = message.toLowerCase();
    const hasRelationalOnly = relationalKeywords.some(keyword => 
      lowerMessage.includes(keyword) && message.length < 50
    );

    return !hasRelationalOnly;
  }

  /**
   * 🔧 RÉSUMÉ BASIQUE (fallback)
   */
  private generateBasicSummary(exchanges: ChatExchange[]): string {
    if (exchanges.length === 0) return "Pas d'historique.";
    
    const lastExchange = exchanges[exchanges.length - 1];
    return `Dernier échange : ${lastExchange.role === 'user' ? 'L\'utilisateur a dit' : 'J\'ai répondu'} "${lastExchange.message.substring(0, 100)}..."`;
  }
}