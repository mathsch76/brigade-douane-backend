/**
 * 🎛️ SERVICE DE GESTION DES PRÉFÉRENCES UTILISATEUR
 * Gestion centralisée des préférences et personnalisation
 */

const { supabase } = require('../utils/supabase');
import logger from '../utils/logger';
import { 
  enterpriseCache, 
  generateCacheKey, 
  botIdCache, 
  getCachedBotId, 
  cacheBotId 
} from '../utils/assistantCache';

// 🎯 TYPES DE PRÉFÉRENCES
export interface UserPreferences {
  contentLevel: string;
  communicationStyle: string;
}

export interface CachedThreadData {
  threadId: string;
  preferences: UserPreferences;
}

// 🔧 GESTION DES BOTS

/**
 * Récupère bot_id avec cache optimisé
 */
export async function getBotId(botName: string): Promise<string | null> {
  // Vérifier cache d'abord
  const cached = getCachedBotId(botName);
  if (cached) {
    return cached;
  }

  try {
    const { data: botData, error } = await supabase
      .from('bots')
      .select('id')
      .eq('name', botName)
      .single();

    if (!error && botData) {
      cacheBotId(botName, botData.id);
      return botData.id;
    }

    logger.warn(`Bot ${botName} non trouvé en base`);
    return null;
  } catch (err) {
    logger.error('Erreur getBotId', { botName, error: (err as Error).message });
    return null;
  }
}

// 🎨 GESTION DES PRÉFÉRENCES

/**
 * Récupère le style de communication global (tous bots)
 */
export async function getUserGlobalStyle(userId: string): Promise<string> {
  try {
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .select('communication_style')
      .eq('user_id', userId)
      .single();

    if (error || !preferences) {
      logger.debug('Style par défaut utilisé', { userId });
      return 'professional'; // Style par défaut
    }

    return preferences.communication_style || 'professional';
  } catch (err) {
    logger.error('Erreur getUserGlobalStyle', { userId, error: (err as Error).message });
    return 'professional';
  }
}

/**
 * Récupère le niveau de contenu spécifique au bot
 */
export async function getUserBotLevel(userId: string, botName: string): Promise<string> {
  try {
    if (!botName) {
  throw new Error("botName est requis mais est vide !");
}
const botId = await getBotId(botName);

    if (!botId) {
      return 'intermediate';
    }

    const { data: preferences, error } = await supabase
      .from('user_bot_preferences')
      .select('content_orientation')
      .eq('user_id', userId)
      .eq('bot_id', botId)
      .single();

    if (error || !preferences) {
      // Créer niveau par défaut pour ce bot
      await createDefaultUserBotLevel(userId, botId);
      return 'intermediate';
    }

    return preferences.content_orientation || 'intermediate';
  } catch (err) {
    logger.error('Erreur getUserBotLevel', { userId, botName, error: (err as Error).message });
    return 'intermediate';
  }
}

/**
 * Crée un niveau par défaut pour un bot spécifique
 */
export async function createDefaultUserBotLevel(userId: string, botId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_bot_preferences')
      .insert({
        user_id: userId,
        bot_id: botId,
        content_orientation: 'intermediate'
        // Pas de communication_style ici car c'est global
      });

    if (error && error.code !== '23505') {
      logger.warn('Erreur création niveau par défaut', { error: error.message });
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Erreur createDefaultUserBotLevel', { error: (err as Error).message });
    return false;
  }
}

/**
 * FONCTION PRINCIPALE - Récupère les préférences utilisateur
 */
export async function getUserPreferences(userId: string, botName?: string): Promise<UserPreferences> {
  try {
    // 1. Récupérer STYLE global (même pour tous les bots)
    const communicationStyle = await getUserGlobalStyle(userId);

    // 2. Récupérer NIVEAU spécifique au bot
    let contentLevel = 'intermediate';
    if (botName) {
      contentLevel = await getUserBotLevel(userId, botName);
    }

    return {
      contentLevel,
      communicationStyle
    };
  } catch (err) {
    logger.error('Erreur getUserPreferences', { userId, botName, error: (err as Error).message });
    return {
      contentLevel: 'intermediate',
      communicationStyle: 'professional'
    };
  }
}

// 🧠 CONSTRUCTION DES INSTRUCTIONS PERSONNALISÉES

/**
 * Construit les instructions personnalisées selon les préférences
 */
export function buildCustomInstructions(contentLevel: string, communicationStyle: string, chatbotId: string, nickname?: string): string {

  let instructions = "";
  
  // Instructions de base selon le bot
  switch (chatbotId) {
    case "EMEBI ET TVA UE":
      instructions = "Tu es un expert en réglementation douanière européenne, spécialisé dans la TVA intracommunautaire et les procédures EMEBI. ";
      break;
    case "CODE DES DOUANES UE":
      instructions = "Tu es un expert du Code des Douanes de l'Union Européenne. ";
      break;
    case "MACF":
      instructions = "Tu es un spécialiste du Mécanisme d'Ajustement Carbone aux Frontières (MACF). ";
      break;
    case "SANCTIONS RUSSES":
      instructions = "Tu es un expert en sanctions internationales, particulièrement les sanctions contre la Russie. ";
      break;
    case "USA":
      instructions = "Tu es un expert en réglementation douanière américaine (CBP, ITAR, etc.). ";
      break;
    case "EUDR":
      instructions = "Tu es un expert en réglementation EUDR (European Union Deforestation Regulation). ";
      break;
    default:
      instructions = "Tu es un assistant spécialisé en réglementation douanière et commerciale. ";
  }
  
  // ✅ ADAPTATION SELON LE NIVEAU DE CONTENU
  switch (contentLevel) {
    case 'beginner':
      instructions += "NIVEAU DÉBUTANT: Explique de façon très simple et accessible. Utilise des exemples concrets du quotidien. Évite le jargon technique. Structure tes réponses avec des points clairs et courts. Propose toujours des exemples pratiques. ";
      break;
    case 'intermediate':
      instructions += "NIVEAU INTERMÉDIAIRE: Équilibre entre simplicité et précision technique. Utilise le vocabulaire professionnel en l'expliquant. Donne des exemples concrets et des références réglementaires essentielles. ";
      break;
    case 'advanced':
      instructions += "NIVEAU AVANCÉ: Sois technique et approfondi. Utilise le vocabulaire expert. Cite les références réglementaires précises, les articles de loi, les jurisprudences. Analyse les nuances et cas particuliers. ";
      break;
    default:
      instructions += "NIVEAU INTERMÉDIAIRE: Équilibre entre simplicité et précision technique. ";
  }
  
  // ✅ ADAPTATION SELON LE STYLE DE COMMUNICATION
  switch (communicationStyle) {
    case 'casual':
      instructions += "STYLE DÉCONTRACTÉ: Tutoie l'utilisateur. Utilise un ton amical et détendu. N'hésite pas à faire des blagues appropriées ou utiliser des expressions familières. Sois chaleureux dans tes interactions. ";
      break;
    case 'professional':
      instructions += "STYLE PROFESSIONNEL: Vouvoie l'utilisateur. Utilise un ton formel et respectueux. Reste courtois et professionnel dans toutes tes réponses. Adopte le registre du conseil expert. ";
      break;
    case 'technical':
      instructions += "STYLE TECHNIQUE: Sois précis et factuel. Utilise un langage expert sans fioritures. Concentre-toi sur les aspects techniques et réglementaires. Privilégie la précision à la convivialité. ";
      break;
    default:
      instructions += "STYLE PROFESSIONNEL: Vouvoie l'utilisateur et reste courtois. ";
  }
  
// ✅ PERSONNALISATION AVEC NICKNAME
if (nickname) {
  instructions += `L'utilisateur s'appelle ${nickname}. Utilise son prénom dans tes réponses quand c'est approprié (ex: "Bonjour ${nickname}", "Comme tu le sais ${nickname}..."). `;
}

  // Instructions finales communes
  instructions += "Réponds toujours en français. Si tu ne connais pas la réponse, dis-le clairement et propose des pistes de recherche. ";
  
  return instructions;
}


// 🚀 RÉPONSES RAPIDES PERSONNALISÉES

/**
 * Vérifie si c'est un salut simple
 */
export function isGreeting(question: string): boolean {
  return /^(bonjour|salut|hello|hey|coucou)$/i.test(question.trim());
}

/**
 * Génère une réponse rapide selon le style
 */
export function getQuickReply(question: string, communicationStyle: string): string {
  const lowerQuestion = question.toLowerCase().trim();
  
  // Adapter selon le style de communication
  const casual = communicationStyle === 'casual';
  const technical = communicationStyle === 'technical';
  
  if (isGreeting(lowerQuestion)) {
    if (casual) {
      return "🤖 Salut ! Comment ça va ? Dis-moi ce que tu veux savoir !";
    } else if (technical) {
      return "🤖 Bonjour. Système opérationnel. Quel est votre besoin d'assistance ?";
    } else {
      return "🤖 Bonjour ! Comment puis-je vous aider aujourd'hui ?";
    }
  }
  
  if (/^merci/.test(lowerQuestion)) {
    if (casual) {
      return "🤖 De rien ! C'était un plaisir de t'aider !";
    } else if (technical) {
      return "🤖 Requête traitée avec succès.";
    } else {
      return "🤖 Je vous en prie ! C'est avec plaisir.";
    }
  }
  
  if (/^ça va/.test(lowerQuestion)) {
    if (casual) {
      return "🤖 Ça roule ! Et toi, tout va bien ?";
    } else if (technical) {
      return "🤖 Tous les systèmes fonctionnent normalement.";
    } else {
      return "🤖 Tout va bien, merci ! Et vous ?";
    }
  }
  
  if (/^au revoir|à plus|bonne journée/.test(lowerQuestion)) {
    if (casual) {
      return "🤖 À plus ! Passe une super journée !";
    } else if (technical) {
      return "🤖 Session terminée. Fin de communication.";
    } else {
      return "🤖 Au revoir ! Passez une excellente journée !";
    }
  }
  
  // Réponse par défaut
  if (casual) {
    return "🤖 Hey ! Je suis là pour t'aider, dis-moi tout !";
  } else if (technical) {
    return "🤖 Système prêt. Formulez votre requête.";
  } else {
    return "🤖 Je suis à votre disposition pour vous aider !";
  }
}

/**
 * Réponse rapide personnalisée avec fallback BDD
 */
export async function getPersonalizedQuickReply(
  question: string, 
  userId: string, 
  chatbotId: string,
  providedStyle?: string
): Promise<string> {
  try {
    // Récupérer le style depuis les paramètres ou la BDD
    let communicationStyle = providedStyle;
    
    if (!communicationStyle) {
      const { data: preferences } = await supabase
        .from('user_preferences')
        .select('communication_style')
        .eq('user_id', userId)
        .single();
      
      communicationStyle = preferences?.communication_style || 'professional';
    }
    
    // Générer la réponse adaptée
    return getQuickReply(question, communicationStyle);
    
  } catch (error) {
    // Fallback en cas d'erreur
    return getQuickReply(question, 'professional');
  }
}