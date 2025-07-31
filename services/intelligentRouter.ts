// auth-backend/services/intelligentRouter.ts - VERSION CORRIGÉE AVEC PRÉFÉRENCES
import { OpenAI } from 'openai';
import { ContextualMemoryService } from './contextualMemory';
import logger from '../utils/logger';
import config from '../utils/config';

interface BotResponse {
  message: string;
  tier: 'RELATIONAL' | 'CONTEXTUAL' | 'EXPERT';
  responseTime: number;
  cost: number;
}

// 🆕 INTERFACE POUR LES PRÉFÉRENCES
interface UserPreferences {
  communication_style?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  language?: string;
  preferred_tone?: string;
}

export class IntelligentRouter {
  private openai: OpenAI;
  private contextService: ContextualMemoryService;
  private assistantId: string;

  constructor() {
    console.log('🚀 IntelligentRouter - Construction...');
    
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      defaultHeaders: {
        "OpenAI-Beta": "assistants=v2",
      },
    });
    
    this.contextService = new ContextualMemoryService();
    this.assistantId = config.openai.assistantId;
    
    console.log('✅ Assistant ID configuré:', this.assistantId);
    this.testAssistantAccess();
  }

  private async testAssistantAccess() {
    try {
      logger.info('🔍 Test accès Assistant...');
      const assistant = await this.openai.beta.assistants.retrieve(this.assistantId);
      logger.info('✅ Assistant accessible:', assistant.name);
    } catch (err: any) {
      logger.error('❌ Erreur accès Assistant:', (err as Error).message);
    }
  }

  // 🆕 RÉCUPÉRATION DES PRÉFÉRENCES UTILISATEUR (RENOMMÉE POUR ÉVITER CONFLIT)
  private async getIntelligentUserPreferences(userId: string, botName: string): Promise<UserPreferences> {
    try {
      const { supabase } = require('../utils/supabase');
      
      // Récupération des préférences globales
      const { data: globalPrefs } = await supabase
        .from('user_preferences')
        .select('communication_style, language, preferred_tone')
        .eq('user_id', userId)
        .single();

      // Récupération des préférences par bot
      const { data: botPrefs } = await supabase
        .from('user_bot_preferences')
        .select('level')
        .eq('user_id', userId)
        .eq('bot_name', botName)
        .single();

      logger.info('✅ Préférences récupérées', { 
        userId, 
        botName, 
        globalPrefs: globalPrefs || 'aucune',
        botLevel: botPrefs?.level || 'défaut'
      });

      return {
        communication_style: globalPrefs?.communication_style || 'professionnel',
        level: botPrefs?.level || 'intermediate',
        language: globalPrefs?.language || 'français',
        preferred_tone: globalPrefs?.preferred_tone || 'neutre'
      };

    } catch (err: anyor) {
      logger.warn('⚠️ Erreur récupération préférences, utilisation valeurs par défaut', { 
        error: (err: anyor as Error).message 
      });
      
      return {
        communication_style: 'professionnel',
        level: 'intermediate',
        language: 'français',
        preferred_tone: 'neutre'
      };
    }
  }

  /**
   * 🧠 ROUTAGE INTELLIGENT
   */
  async route(question: string, userId: string, botName: string): Promise<BotResponse> {
    const startTime = Date.now();
    
    logger.info('🔀 Routage intelligent', { 
      userId, 
      botName, 
      questionLength: question.length,
      preview: question.substring(0, 50) + '...'
    });

    // ⚡ TIER 1 : Salutations simples
    if (this.isSimpleGreeting(question)) {
      return await this.handleRelational(question, userId, botName, startTime);
    }

    // 🧠 TIER 2 : Questions contextuelles
    if (this.needsContext(question)) {
      return await this.handleContextual(question, userId, botName, startTime);
    }

    // 🎓 TIER 3 : Questions techniques (PRIORITÉ ASSISTANT)
    return await this.handleExpert(question, userId, botName, startTime);
  }

  /**
   * ⚡ TIER 1 : Relationnel rapide - AVEC PRÉFÉRENCES
   */
  private async handleRelational(question: string, userId: string, botName: string, startTime: number): Promise<BotResponse> {
    try {
      // 🆕 RÉCUPÉRATION DES PRÉFÉRENCES
      const userPrefs = await this.getIntelligentUserPreferences(userId, botName);
      const personalizedInstructions = await this.getBotInstructionsWithPreferences(botName, userPrefs);

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{
          role: "user", 
          content: `${personalizedInstructions}\n\nQuestion simple: ${question}`
        }],
        max_tokens: 150,
        temperature: 0.7
      });

      const response = completion.choices[0].message.content || "Désolé, je ne peux pas répondre.";
      
      this.saveToContext(userId, botName, question, response).catch(err: any => 
        logger.warn('⚠️ Sauvegarde async failed', { error: err.message })
      );

      logger.info('⚡ TIER: RELATIONAL SUCCESS (avec préférences)', { 
        responseTime: Date.now() - startTime,
        preferences: userPrefs
      });

      return {
        message: response,
        tier: 'RELATIONAL',
        responseTime: Date.now() - startTime,
        cost: this.calculateGPT35Cost(completion.usage?.total_tokens || 0)
      };

    } catch (err: anyor) {
      logger.error('❌ Erreur RELATIONAL', { error: (err: anyor as Error).message });
      return await this.handleExpert(question, userId, botName, startTime);
    }
  }

  /**
   * 🧠 TIER 2 : Contextuel - AVEC PRÉFÉRENCES
   */
  private async handleContextual(question: string, userId: string, botName: string, startTime: number): Promise<BotResponse> {
    try {
      logger.info('🧠 Mode CONTEXTUEL activé');
      
      // 🆕 RÉCUPÉRATION DES PRÉFÉRENCES
      const userPrefs = await this.getIntelligentUserPreferences(userId, botName);
      const personalizedInstructions = await this.getBotInstructionsWithPreferences(botName, userPrefs);
      
      const [contextSummary, thread] = await Promise.all([
        this.contextService.summarizeRecentHistory(userId, botName),
        this.openai.beta.threads.create()
      ]);

      const enhancedMessage = `${personalizedInstructions}\n\nCONTEXTE RÉCENT : ${contextSummary}\n\nQUESTION : "${question}"`;

     // 🆕 MESSAGE STRUCTURÉ AVEC PRÉFÉRENCES COMPLÈTES
const structuredMessage = `${personalizedInstructions}

CONTEXTE: Tu réponds à un utilisateur avec les préférences suivantes:
- Style: ${userPrefs.communication_style}
- Niveau: ${userPrefs.level}
- Langue: ${userPrefs.language}

QUESTION: ${question}

IMPORTANT: Respecte absolument le style de communication et le niveau d'expertise demandés.`;

await this.openai.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: structuredMessage
});

      const run = await this.openai.beta.threads.runs.create(thread.id, {
        assistant_id: this.assistantId
      });

      const runStatus = await this.waitForRunCompletion(thread.id, run.id);
      
      if (runStatus.status !== 'completed') {
        logger.warn(`⚠️ Contextual failed: ${runStatus.status}, fallback`);
        return await this.handleExpertFallback(question, userId, botName, startTime, userPrefs);
      }

      const response = await this.extractAssistantResponse(thread.id);
      
      this.saveToContext(userId, botName, question, response).catch(err: any => 
        logger.warn('⚠️ Sauvegarde async failed', { error: err.message })
      );

      logger.info('🧠 TIER: CONTEXTUAL SUCCESS (avec préférences)', { 
        responseTime: Date.now() - startTime,
        preferences: userPrefs
      });

      return {
        message: response,
        tier: 'CONTEXTUAL',
        responseTime: Date.now() - startTime,
        cost: 0.018
      };

    } catch (err: anyor) {
      logger.error('❌ Erreur CONTEXTUAL', { error: (err: anyor as Error).message });
      const userPrefs = await this.getUserPreferences(userId, botName);
      return await this.handleExpertFallback(question, userId, botName, startTime, userPrefs);
    }
  }

  /**
   * 🎓 TIER 3 : Expert - AVEC PRÉFÉRENCES
   */
  private async handleExpert(question: string, userId: string, botName: string, startTime: number): Promise<BotResponse> {
    try {
      logger.info('🎓 Mode EXPERT activé - avec préférences utilisateur');
      
      // 🆕 RÉCUPÉRATION DES PRÉFÉRENCES
      const userPrefs = await this.getIntelligentUserPreferences(userId, botName);
      const personalizedInstructions = await this.getBotInstructionsWithPreferences(botName, userPrefs);
      
      try {
        logger.info('📝 Création thread...');
        const thread = await this.openai.beta.threads.create();
        logger.info('✅ Thread créé:', thread.id);
        
        logger.info('💬 Ajout message avec préférences...');
        const messageContent = `${personalizedInstructions}\n\nQuestion: ${question}`;
        
        await this.openai.beta.threads.messages.create(thread.id, {
          role: 'user',
          content: messageContent
        });
        logger.info('✅ Message ajouté avec préférences');

        logger.info('🚀 Création run...');
        const run = await this.openai.beta.threads.runs.create(thread.id, {
          assistant_id: this.assistantId
        });
        
        logger.info('✅ Run créé:', run.id, 'Status initial:', run.status);

        logger.info('⏳ Attente completion...');
        const runStatus = await this.waitForRunCompletion(thread.id, run.id);
        
        if (runStatus.status === 'completed') {
          logger.info('✅ Assistant run COMPLETED avec préférences !');
          
          const response = await this.extractAssistantResponse(thread.id);
          
          this.saveToContext(userId, botName, question, response).catch(err: any => 
            logger.warn('⚠️ Sauvegarde async failed', { error: err.message })
          );

          logger.info('🎓 TIER: EXPERT SUCCESS via Assistant (avec préférences)', { 
            responseTime: Date.now() - startTime,
            responseLength: response.length,
            preferences: userPrefs
          });

          return {
            message: response,
            tier: 'EXPERT',
            responseTime: Date.now() - startTime,
            cost: 0.012
          };
        }
        
        logger.error(`❌ Assistant run failed with status: ${runStatus.status}`);
        throw new Error(`Run status: ${runStatus.status}`);
        
      } catch (assistantError) {
        logger.warn('⚠️ Assistant failed, utilisation fallback intelligent', { 
          error: (assistantError as Error).message 
        });
        
        return await this.handleExpertFallback(question, userId, botName, startTime, userPrefs);
      }

    } catch (err: anyor) {
      logger.error('❌ Erreur EXPERT TOTALE', { error: (err: anyor as Error).message });
      
      return {
        message: "Désolé, une erreur technique est survenue. Veuillez réessayer dans quelques instants.",
        tier: 'EXPERT',
        responseTime: Date.now() - startTime,
        cost: 0
      };
    }
  }

  /**
   * 🔄 FALLBACK INTELLIGENT - AVEC PRÉFÉRENCES
   */
  private async handleExpertFallback(
    question: string, 
    userId: string, 
    botName: string, 
    startTime: number, 
    userPrefs?: UserPreferences
  ): Promise<BotResponse> {
    try {
      logger.info('🔄 Tentative fallback Assistant simplifié avec préférences...');
      
      // Si préférences pas encore récupérées
      if (!userPrefs) {
        userPrefs = await this.getIntelligentUserPreferences(userId, botName);
      }
      
      const personalizedInstructions = await this.getBotInstructionsWithPreferences(botName, userPrefs);
      
      const thread = await this.openai.beta.threads.create();
      
      await this.openai.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: `${personalizedInstructions}\n\nQuestion précise : ${question}`
      });
      
      const run = await this.openai.beta.threads.runs.create(thread.id, {
        assistant_id: this.assistantId
      });
      
      const runStatus = await this.waitForRunCompletion(thread.id, run.id, 20);
      
      if (runStatus.status === 'completed') {
        const response = await this.extractAssistantResponse(thread.id);
        
        this.saveToContext(userId, botName, question, response).catch(err: any => 
          logger.warn('⚠️ Sauvegarde async failed', { error: err.message })
        );

        logger.info('🔄 FALLBACK SUCCESS via Assistant (avec préférences)', { 
          responseTime: Date.now() - startTime,
          preferences: userPrefs
        });

        return {
          message: response,
          tier: 'EXPERT',
          responseTime: Date.now() - startTime,
          cost: 0.015
        };
      }
      
      throw new Error('Fallback failed');
      
    } catch (fallbackError) {
      logger.error('❌ Fallback échoué aussi', { error: (fallbackError as Error).message });
      
      return {
        message: `Désolé, je rencontre des difficultés techniques pour accéder à ma base de connaissances ${botName}. Pouvez-vous reformuler votre question ou réessayer dans quelques instants ?`,
        tier: 'EXPERT',
        responseTime: Date.now() - startTime,
        cost: 0
      };
    }
  }

  /**
   * ⚡ ATTENTE RUN - VERSION PLAYGROUND
   */
  private async waitForRunCompletion(threadId: string, runId: string, maxSeconds: number = 60) {
    const maxAttempts = maxSeconds;
    let attempts = 0;
    
    let runStatus = await this.openai.beta.threads.runs.retrieve(runId, threadId);

    
    while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await this.openai.beta.threads.runs.retrieve(runId, threadId);
      attempts++;
      
      if (attempts % 10 === 0) {
        logger.debug(`🔄 Attente run: ${runStatus.status} (${attempts}s)`, { threadId, runId });
      }
    }
    
    if (attempts >= maxAttempts) {
      logger.warn(`⏰ Timeout run après ${maxSeconds}s`, { threadId, runId, finalStatus: runStatus.status });
    }
    
    return runStatus;
  }

  /**
   * 📝 EXTRACTION RÉPONSE ASSISTANT
   */
  private async extractAssistantResponse(threadId: string): Promise<string> {
    const messages = await this.openai.beta.threads.messages.list(threadId);
    const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
    
    if (assistantMessages.length === 0) {
      return "Désolé, je n'ai pas pu générer une réponse.";
    }
    
    const latestMessage = assistantMessages[0];
    
    if (latestMessage?.content && latestMessage.content.length > 0) {
      const content = latestMessage.content[0];
      if (content.type === 'text' && 'text' in content && 'value' in content.text) {
        return content.text.value;
      }
    }
    
    return "Désolé, impossible d'extraire la réponse.";
  }

  /**
  /**
 * 🔍 DÉTECTION SALUTATIONS
 */
private isSimpleGreeting(question: string): boolean {
  const lower = question.toLowerCase().trim();
  
  // Salutations exactes
  const exactGreetings = [
    'bonjour', 'salut', 'hello', 'hey', 'coucou', 'bonsoir',
    'merci', 'merci beaucoup', 'ok merci', 'parfait merci',
    'ça va', 'comment ça va', 'au revoir', 'à bientôt', 'bonne journée'
  ];
  
  // Vérification exacte
  if (exactGreetings.includes(lower)) {
    return true;
  }
  
  // 🆕 PATTERNS POUR PHRASES COMPLEXES
  const greetingPatterns = [
    /^bonjour/i,
    /^salut/i,
    /comment.*ça.*va/i,
    /comment.*allez.*vous/i,
    /comment.*puis.*je.*vous.*aider/i,  // ← VOTRE QUESTION ICI !
    /^merci/i,
    /^hello/i,
    /^hey/i,
    /^coucou/i
  ];
  
  return greetingPatterns.some(pattern => pattern.test(question));
}

  /**
   * 🎯 INSTRUCTIONS PERSONNALISÉES PAR BOT + PRÉFÉRENCES
   */
  private async getBotInstructionsWithPreferences(botName: string, userPrefs: UserPreferences): Promise<string> {
    // Instructions de base du bot
    const baseInstructions = this.getBotBaseInstructions(botName);
    
    // Construction des instructions personnalisées
    let personalizedInstructions = baseInstructions;
    
    // Ajout du style de communication
    personalizedInstructions += `\n\nSTYLE DE COMMUNICATION: ${userPrefs.communication_style}`;
    
    // Ajout du niveau d'expertise
    const levelDescriptions = {
      'beginner': 'Explique de manière simple et accessible, évite le jargon technique, donne des exemples concrets.',
      'intermediate': 'Utilise un niveau de détail équilibré avec quelques termes techniques expliqués.',
      'advanced': 'Utilise un vocabulaire technique précis, va dans le détail, suppose une connaissance de base du domaine.'
    };
    
    personalizedInstructions += `\n\nNIVEAU D'EXPERTISE: ${userPrefs.level} - ${levelDescriptions[userPrefs.level]}`;
    
    // Ajout du ton préféré
    if (userPrefs.preferred_tone !== 'neutre') {
      personalizedInstructions += `\n\nTON: Adopte un ton ${userPrefs.preferred_tone} dans tes réponses.`;
    }
    
    // Ajout de la langue
    personalizedInstructions += `\n\nLANGUE: Réponds exclusivement en ${userPrefs.language}.`;
    
    logger.debug('🎯 Instructions personnalisées générées', { 
      botName, 
      userPrefs,
      instructionsLength: personalizedInstructions.length 
    });
    
    return personalizedInstructions;
  }

  /**
   * 🎯 INSTRUCTIONS DE BASE PAR BOT
   */
  private getBotBaseInstructions(botName: string): string {
    const instructions = {
      "EMEBI ET TVA UE": "Tu es un expert en réglementation douanière européenne, spécialisé dans la TVA intracommunautaire et les procédures EMEBI.",
      "CODE DES DOUANES UE": "Tu es un expert du Code des Douanes de l'Union Européenne.",
      "MACF": "Tu es un spécialiste du Mécanisme d'Ajustement Carbone aux Frontières (MACF).",
      "SANCTIONS RUSSES": "Tu es un expert en sanctions internationales, particulièrement les sanctions contre la Russie.",
      "USA": "Tu es un expert en réglementation douanière américaine (CBP, ITAR, etc.)."
    };
    
    return instructions[botName] || "Tu es un assistant spécialisé en réglementation douanière et commerciale.";
  }

  /**
   * 💾 SAUVEGARDE CONTEXTE
   */
  private async saveToContext(userId: string, botName: string, question: string, response: string): Promise<void> {
    try {
      const { supabase } = require('../utils/supabase');
      
      await supabase
        .from('chat_context')
        .insert([
          { user_id: userId, chatbot_id: botName, message: question, role: "user" },
          { user_id: userId, chatbot_id: botName, message: response, role: "bot" }
        ]);
    } catch (err: any) {
      logger.warn('⚠️ Erreur sauvegarde contexte', { error: (err as Error).message });
    }
  }

  /**
   * 💰 CALCUL COÛTS
   */
  private calculateGPT35Cost(tokens: number): number {
    return tokens * 0.000002;
  }
}