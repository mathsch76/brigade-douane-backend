// auth-backend/quickTest.ts
// 🧪 Test rapide pour vérifier vos assistant_id
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testAssistantIds() {
  console.log('🔍 TEST RAPIDE DES ASSISTANT IDs');
  console.log('═══════════════════════════════════════════════════════════');
  
  const assistants = {
    'EMEBI': process.env.ASSISTANT_EMEBI,
    'MACF': process.env.ASSISTANT_MACF,
    'EUDR': process.env.ASSISTANT_EUDR,
  };

  console.log('📋 Variables d\'environnement chargées:');
  Object.entries(assistants).forEach(([name, id]) => {
    console.log(`   ${name}: ${id || 'NON DÉFINI'}`);
  });

  console.log('\n🧪 Vérification sur OpenAI...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const results = [];

  for (const [name, assistantId] of Object.entries(assistants)) {
    if (!assistantId) {
      console.log(`❌ ${name}: Variable d'environnement manquante`);
      results.push({ name, valid: false, error: 'Variable manquante' });
      continue;
    }

    try {
      const assistant = await openai.beta.assistants.retrieve(assistantId);
      console.log(`✅ ${name}: Assistant valide`);
      console.log(`   📝 Nom: ${assistant.name || 'Sans nom'}`);
      console.log(`   📄 Description: ${assistant.description?.substring(0, 100) || 'Aucune'}...`);
      results.push({ name, valid: true, assistant });
    } catch (error: any) {
      console.log(`❌ ${name}: ${error.message}`);
      results.push({ name, valid: false, error: error.message });
    }
  }

  // Résumé
  console.log('\n🎯 RÉSUMÉ:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);

  console.log(`✅ Assistants valides: ${valid.length}`);
  console.log(`❌ Assistants invalides: ${invalid.length}`);

  if (invalid.length > 0) {
    console.log('\n🚨 ACTIONS REQUISES:');
    invalid.forEach(result => {
      console.log(`   • ${result.name}: ${result.error}`);
    });
  }

  return results;
}

// Test simple d'un bot spécifique
async function testSpecificBot(botName: string, assistantId: string) {
  console.log(`\n🎯 TEST COMPLET DU BOT: ${botName}`);
  console.log('═══════════════════════════════════════════════════════════');

  try {
    // 1. Vérifier l'assistant
    const assistant = await openai.beta.assistants.retrieve(assistantId);
    console.log(`✅ Assistant trouvé: ${assistant.name}`);

    // 2. Créer un thread
    const thread = await openai.beta.threads.create({
      messages: [
        { role: 'user', content: 'Bonjour, peux-tu te présenter brièvement ?' }
      ]
    });
    console.log(`📝 Thread créé: ${thread.id}`);

    // 3. Lancer le run
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
    });
    console.log(`🚀 Run lancé: ${run.id} (status: ${run.status})`);

    // 4. Attendre la completion
    let attempts = 0;
    while (attempts < 20) {
      const updatedRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log(`   Status: ${updatedRun.status} (tentative ${attempts + 1})`);

      if (updatedRun.status === 'completed') {
        // Récupérer la réponse
        const messages = await openai.beta.threads.messages.list(thread.id);
        const lastMessage = messages.data[0];
        
        if (lastMessage.content[0].type === 'text') {
          const response = lastMessage.content[0].text.value;
          console.log(`💬 Réponse reçue: ${response.substring(0, 200)}...`);
          console.log(`✅ ${botName} fonctionne parfaitement !`);
          return true;
        }
      } else if (updatedRun.status === 'failed') {
        console.log(`❌ Run échoué: ${updatedRun.last_error?.message}`);
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    console.log('⚠️ Timeout atteint');
    return false;

  } catch (error: any) {
    console.log(`❌ Erreur: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    // Test des assistant_id
    const results = await testAssistantIds();
    
    // Test complet du premier bot valide
    const validBot = results.find(r => r.valid);
    if (validBot) {
      const assistantId = process.env[`ASSISTANT_${validBot.name}`];
      if (assistantId) {
        await testSpecificBot(validBot.name, assistantId);
      }
    }

  } catch (error) {
    console.error('❌ Erreur fatale:', error);
  }
}

main();