// services/openai.ts
import { config } from '../config-simple';
import { SimpleCache } from './cache';

const cache = new SimpleCache();

export async function askCachedAssistant(message: string, assistantId: string) {
  try {
    if (!config.openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    if (!assistantId) {
      throw new Error('Assistant ID not provided');
    }

    const cacheKey = `assistant:${assistantId}:${Buffer.from(message).toString('base64').slice(0, 32)}`;
    
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log('Cache hit for assistant:', assistantId);
      return {
        success: true,
        response: cached.response,
        fromCache: true,
        cacheKey: cacheKey
      };
    }

    console.log('Calling OpenAI Assistant:', assistantId);

    const headers = {
      'Authorization': `Bearer ${config.openaiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    };

    // 1. Créer un thread
    const threadResponse = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });

    if (!threadResponse.ok) {
      const errorText = await threadResponse.text();
      throw new Error(`Thread creation failed: ${threadResponse.status} - ${errorText}`);
    }

    const thread = await threadResponse.json();

    // 2. Ajouter le message
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        role: 'user',
        content: message
      })
    });

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      throw new Error(`Message creation failed: ${messageResponse.status} - ${errorText}`);
    }

    // 3. Lancer l'assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        assistant_id: assistantId
      })
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      throw new Error(`Run creation failed: ${runResponse.status} - ${errorText}`);
    }

    const run = await runResponse.json();

    // 4. Attendre la completion
    let runStatus = run;
    let attempts = 0;
    const maxAttempts = 30;

    while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
      if (attempts >= maxAttempts) {
        throw new Error('Assistant response timeout (30s)');
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers
      });

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(`Status check failed: ${statusResponse.status} - ${errorText}`);
      }

      runStatus = await statusResponse.json();
      attempts++;
    }

    if (runStatus.status !== 'completed') {
      throw new Error(`Assistant failed with status: ${runStatus.status}`);
    }

    // 5. Récupérer la réponse
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      headers
    });

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text();
      throw new Error(`Messages retrieval failed: ${messagesResponse.status} - ${errorText}`);
    }

    const messages = await messagesResponse.json();
    const assistantMessage = messages.data.find((msg: any) => msg.role === 'assistant');

    if (!assistantMessage) {
      throw new Error('No assistant response found');
    }

    const response = assistantMessage.content[0].text.value;

    const isPersonalized = message.toLowerCase().includes('mon') || message.toLowerCase().includes('ma') || message.toLowerCase().includes('je');
    const ttl = isPersonalized ? 600 : 3600;

    await cache.set(cacheKey, { response }, ttl);

    console.log('Assistant response generated successfully');

    return {
      success: true,
      response: response,
      fromCache: false,
      threadId: thread.id,
      runId: run.id,
      processingTime: attempts,
      cacheKey: cacheKey,
      cacheTtl: ttl
    };

  } catch (error) {
    console.error('Assistant error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export { cache as assistantCache };