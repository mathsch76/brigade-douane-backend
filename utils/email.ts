import { Resend } from "resend"
import dotenv from "dotenv"
dotenv.config()

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendWelcomeEmail(to: string, tempPassword: string) {
  const appUrl = process.env.FRONTEND_URL || "http://localhost:5173"

  const subject = "🔐 Vos identifiants NAO&CO"
  const html = `
    <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6;">
      <h2>Bienvenue chez NAO&CO !</h2>
      <p>Votre compte utilisateur a été créé avec succès.</p>
      <p><strong>Email :</strong> ${to}</p>
      <p><strong>Mot de passe temporaire :</strong> ${tempPassword}</p>
      <p>Veuillez vous connecter à l'adresse suivante :</p>
      <a href="${appUrl}" style="color: #2563eb;">${appUrl}</a>
      <p>Lors de votre première connexion, vous devrez changer votre mot de passe.</p>
      <br />
      <p>À bientôt !</p>
    </div>
  `

  try {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to,
      subject,
      html
    })

    console.log("📨 Résultat envoi email Resend:", JSON.stringify(result, null, 2))
    return result
  } catch (err) {
    console.error("❌ Erreur lors de l'envoi avec Resend:", JSON.stringify(err, null, 2))
    throw err
  }
}

// Ajouter cette fonction dans auth-backend/utils/email.ts
export async function sendContactMessage(
  name: string, 
  email: string, 
  messageType: string, 
  message: string, 
  userId?: string
) {
  // Emoji selon le type
  const getTypeEmoji = (type: string) => {
    switch (type) {
      case 'Ergonomie': return '🎨';
      case 'Problème technique': return '⚙️';
      case 'Boîte à idées': return '💡';
      case 'Autre': return '📝';
      default: return '📧';
    }
  };

  const subject = `[NAO&CO Contact] ${messageType} - ${name}`;
  const html = `
    <div style="font-family: sans-serif; font-size: 16px; line-height: 1.6;">
      <h2>${getTypeEmoji(messageType)} Nouveau message de contact NAO&CO</h2>
      
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3>Informations utilisateur:</h3>
        <p><strong>👤 Nom:</strong> ${name}</p>
        <p><strong>📧 Email:</strong> ${email}</p>
        ${userId ? `<p><strong>🔑 ID:</strong> ${userId}</p>` : ''}
        <p><strong>📅 Date:</strong> ${new Date().toLocaleString('fr-FR')}</p>
      </div>
      
      <div style="background: white; padding: 20px; border-left: 4px solid #2563eb; margin: 15px 0;">
        <h3>${getTypeEmoji(messageType)} ${messageType}</h3>
        <div style="white-space: pre-wrap; background: #f8f9fa; padding: 15px; border-radius: 4px;">
${message}
        </div>
      </div>
      
      <p style="color: #666; font-size: 14px;">📨 Pour répondre, utilisez: ${email}</p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: process.env.EMAIL_FROM!, // Reçu sur contact@naoandco.com
      replyTo: email, // Répondre à l'utilisateur
      subject,
      html
    });

    console.log("📨 Message de contact envoyé:", JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    console.error("❌ Erreur envoi message contact:", JSON.stringify(err, null, 2));
    throw err;
  }
}