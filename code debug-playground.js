// debug-playground.js - TEST PLAYGROUND vs APP (VERSION CORRIGÉE)
const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  defaultHeaders: {
    "OpenAI-Beta": "assistants=v2",
  },
});

async function testPlaygroundBehavior() {
  try {
    console.log('🚀 DÉMARRAGE TEST PLAYGROUND');
    
    const assistantId = process.env.OPENAI_ASSISTANT_ID;
    console.log('🔍 Assistant ID:', assistantId);
    
    if (!assistantId) {
      console.error('❌ OPENAI_ASSISTANT_ID manquant dans .env');
      return;
    }
    
    // 1. VÉRIFIER ASSISTANT
    console.log('\n📋 VÉRIFICATION ASSISTANT...');
    const assistant = await openai.beta.assistants.retrieve(assistantId);
    console.log('✅ Assistant trouvé:', assistant.name);
    console.log('📦 Modèle:', assistant.model);
    console.log('🛠️ Outils:', assistant.tools.map(t => t.type).join(', '));
    
    // 2. VÉRIFIER VECTOR STORES (VERSION CORRIGÉE)
    console.log('\n📁 VÉRIFICATION FICHIERS...');
    if (assistant.tool_resources?.file_search?.vector_store_ids) {
      const vectorStoreId = assistant.tool_resources.file_search.vector_store_ids[0];
      console.log('📦 Vector Store ID:', vectorStoreId);
      
      try {
        const vectorStore = await openai.beta.vectorStores.retrieve(vectorStoreId);
        console.log('📊 Vector Store Status:', vectorStore.status);
        console.log('📄 Nombre total de fichiers:', vectorStore.file_counts?.total || 0);
        
        // Lister quelques fichiers
        const files = await openai.beta.vectorStores.files.list(vectorStoreId);
        console.log('📋 Fichiers listés:', files.data.length);
        
        if (files.data.length > 0) {
          console.log('🔍 Premiers fichiers:');
          for (let i = 0; i < Math.min(3, files.data.length); i++) {
            const file = files.data[i];
            try {
              const fileDetails = await openai.files.retrieve(file.id);
              console.log(`  • ${fileDetails.filename} (${Math.round(fileDetails.bytes/1024)}KB)`);
            } catch (fileError) {
              console.log(`  • ${file.id} (détails non disponibles)`);
            }
          }
        } else {
          console.log('⚠️ Aucun fichier trouvé dans le Vector Store !');
        }
        
      } catch (vsError) {
        console.log('❌ Erreur Vector Store:', vsError.message);
      }
    } else {
      console.log('❌ AUCUN VECTOR STORE CONFIGURÉ !');
    }
    
    // 3. TEST QUESTION EXACTE
    console.log('\n🧪 TEST QUESTION EXACTE...');
    const testQuestion = "quel est le code régime pour une vente définitive ?";
    console.log(`Question: "${testQuestion}"`);
    
    // Créer thread
    const thread = await openai.beta.threads.create();
    console.log('✅ Thread créé:', thread.id);
    
    // Ajouter message
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: testQuestion
    });
    console.log('✅ Message ajouté');
    
    // Créer run (EXACTEMENT comme playground)
    console.log('\n🚀 CRÉATION RUN...');
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId
      // ✅ AUCUN paramètre supplémentaire (comme playground)
    });
    
    console.log('✅ Run créé:', run.id);
    console.log('⏳ Status initial:', run.status);
    
    // Attendre completion avec logs détaillés
    console.log('\n⏳ ATTENTE COMPLETION...');
    let runStatus = run;
    let attempts = 0;
    
    while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      attempts++;
      
      console.log(`[${attempts * 2}s] Status: ${runStatus.status}`);
      
      // Logs détaillés des steps
      if (runStatus.status === 'in_progress') {
        try {
          const runSteps = await openai.beta.threads.runs.steps.list(thread.id, run.id);
          if (runSteps.data.length > 0) {
            const latestStep = runSteps.data[0];
            console.log(`    └─ Step: ${latestStep.type} (${latestStep.status})`);
          }
        } catch (stepError) {
          // Pas grave si on ne peut pas lire les steps
        }
      }
      
      if (attempts > 30) { // Max 60s
        console.log('⏰ TIMEOUT après 60s');
        break;
      }
    }
    
    // Analyser résultat
    console.log('\n🏁 RÉSULTAT FINAL...');
    console.log('Status final:', runStatus.status);
    
    if (runStatus.status === 'completed') {
      console.log('✅ RUN COMPLETED AVEC SUCCÈS !');
      
      // Récupérer réponse
      const messages = await openai.beta.threads.messages.list(thread.id);
      const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
      
      if (assistantMessages.length > 0) {
        const response = assistantMessages[0].content[0];
        if (response.type === 'text') {
          console.log('\n💬 RÉPONSE ASSISTANT:');
          console.log('=' .repeat(60));
          console.log(response.text.value);
          console.log('=' .repeat(60));
          
          // Analyser la réponse
          const responseText = response.text.value.toLowerCase();
          console.log('\n🔍 ANALYSE:');
          
          if (responseText.includes('40') && (responseText.includes('vente définitive') || responseText.includes('vente definitive'))) {
            console.log('✅ SUCCÈS COMPLET: Code 40 pour vente définitive trouvé !');
            console.log('📊 CONCLUSION: Assistant fonctionne parfaitement');
            console.log('🎯 ACTION: Le problème est dans intelligentRouter.ts');
          } else if (responseText.includes('40')) {
            console.log('⚠️ SUCCÈS PARTIEL: Code 40 mentionné mais contexte pas clair');
            console.log('📊 CONCLUSION: Assistant fonctionne mais réponse imprécise');
          } else {
            console.log('❌ ÉCHEC: Pas de code 40 pour vente définitive');
            console.log('📊 CONCLUSION: Problème avec Assistant ou Vector Store');
          }
          
          console.log('\n🔍 Mots-clés détectés:');
          if (responseText.includes('40')) console.log('  ✓ Code 40');
          if (responseText.includes('vente définitive') || responseText.includes('vente definitive')) console.log('  ✓ Vente définitive');
          if (responseText.includes('21')) console.log('  ⚠ Code 21 (intracommunautaire)');
          if (responseText.includes('29')) console.log('  ⚠ Code 29 (exportation)');
          
        }
      } else {
        console.log('❌ Aucune réponse d\'assistant trouvée');
      }
      
    } else if (runStatus.status === 'failed') {
      console.log('❌ RUN FAILED');
      if (runStatus.last_error) {
        console.log('💥 Erreur:', runStatus.last_error.message);
        console.log('🔧 Code:', runStatus.last_error.code);
      }
      console.log('📊 CONCLUSION: Problème technique avec l\'API OpenAI');
      
    } else {
      console.log(`❓ Status inattendu: ${runStatus.status}`);
      if (runStatus.last_error) {
        console.log('Erreur:', runStatus.last_error);
      }
    }
    
    console.log('\n🎯 ÉTAPES SUIVANTES:');
    console.log('1. Comparer cette réponse avec le Playground OpenAI');
    console.log('2. Si différente → Problème de configuration');  
    console.log('3. Si identique → Problème dans intelligentRouter.ts');
    
  } catch (error) {
    console.error('\n💥 ERREUR FATALE:', error.message);
    if (error.code) {
      console.error('Code erreur:', error.code);
    }
  }
}

// Exécution
console.log('🔧 DIAGNOSTIC ASSISTANT OPENAI');
console.log('Test du comportement exact...\n');

testPlaygroundBehavior()
  .then(() => {
    console.log('\n🏁 DIAGNOSTIC TERMINÉ');
  })
  .catch(error => {
    console.error('💥 ERREUR:', error.message);
  });