 
// auth-backend/utils/licenseGenerator.ts
import { v4 as uuidv4 } from 'uuid';

/**
 * 🎫 Générateur de licences avec séquences et algorithmes
 */

export interface LicenseConfig {
  companyId: string;
  botId: string;
  licenseType?: 'trial' | 'standard' | 'premium';
  maxRequests?: number;
  validityMonths?: number;
}

export interface GeneratedLicense {
  id: string;
  readable_id: string; // Format: LIC-COMP123-BOT456-2024001
  company_id: string;
  bot_id: string;
  status: 'active';
  license_type: string;
  max_requests_per_month: number;
  start_date: string;
  end_date: string;
  created_at: string;
}

/**
 * 🔢 Générer un ID lisible pour la licence
 */
export function generateReadableLicenseId(companyId: string, botId: string): string {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
  
  // Extraire les premiers caractères pour lisibilité
  const companyShort = companyId.substring(0, 8).toUpperCase();
  const botShort = botId.substring(0, 8).toUpperCase();
  
  return `LIC-${companyShort}-${botShort}-${year}${month}${random}`;
}

/**
 * 🎫 Créer une configuration de licence par défaut
 */
export function createDefaultLicenseConfig(
  companyId: string, 
  botId: string, 
  licenseType: 'trial' | 'standard' | 'premium' = 'standard'
): LicenseConfig {
  const configs = {
    trial: { maxRequests: 100, validityMonths: 1 },
    standard: { maxRequests: 500, validityMonths: 12 },
    premium: { maxRequests: 2000, validityMonths: 12 }
  };
  
  const config = configs[licenseType];
  
  return {
    companyId,
    botId,
    licenseType,
    maxRequests: config.maxRequests,
    validityMonths: config.validityMonths
  };
}

/**
 * 🏭 Générer une licence complète prête pour insertion en base
 */
export function generateLicense(config: LicenseConfig): GeneratedLicense {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + (config.validityMonths || 12));
  
  const licenseId = uuidv4();
  const readableId = generateReadableLicenseId(config.companyId, config.botId);
  
  return {
    id: licenseId,
    readable_id: readableId,
    company_id: config.companyId,
    bot_id: config.botId,
    status: 'active',
    license_type: config.licenseType || 'standard',
    max_requests_per_month: config.maxRequests || 500,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    created_at: startDate.toISOString()
  };
}

/**
 * 🔍 Valider qu'une licence est encore valide
 */
export function isLicenseValid(license: { end_date: string; status: string }): boolean {
  const now = new Date();
  const endDate = new Date(license.end_date);
  
  return license.status === 'active' && endDate > now;
}

/**
 * 📊 Calculer les statistiques d'usage d'une licence
 */
export function calculateLicenseUsage(
  requestsUsed: number, 
  maxRequests: number
): {
  used: number;
  max: number;
  remaining: number;
  percentage: number;
  isNearLimit: boolean;
} {
  const remaining = Math.max(0, maxRequests - requestsUsed);
  const percentage = maxRequests > 0 ? Math.round((requestsUsed / maxRequests) * 100) : 0;
  const isNearLimit = percentage >= 80; // Alerte à 80%
  
  return {
    used: requestsUsed,
    max: maxRequests,
    remaining,
    percentage,
    isNearLimit
  };
}

/**
 * 🎯 Exemples d'utilisation
 */
export const examples = {
  // Créer une licence standard pour une entreprise
  createStandardLicense: (companyId: string, botId: string) => {
    const config = createDefaultLicenseConfig(companyId, botId, 'standard');
    return generateLicense(config);
  },
  
  // Créer une licence trial
  createTrialLicense: (companyId: string, botId: string) => {
    const config = createDefaultLicenseConfig(companyId, botId, 'trial');
    return generateLicense(config);
  },
  
  // Créer une licence premium
  createPremiumLicense: (companyId: string, botId: string) => {
    const config = createDefaultLicenseConfig(companyId, botId, 'premium');
    return generateLicense(config);
  }
};