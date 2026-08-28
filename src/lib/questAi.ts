import { supabase } from './supabase';
import { getGrokConfig } from './aiConfig';

/**
 * Gera a descrição da missão usando a IA (Groq). Regras:
 *  - SÓ entra em cena se o campo "Descrição (Lore da Missão)" estiver vazio.
 *  - O texto gerado é PERSISTIDO (system_collections: ai_quest_flavors/<questId>),
 *    para não ser regenerado/sobrescrito a cada carregamento.
 *  - Sem IA disponível/falha → retorna vazio (nada de texto de fallback).
 */

const STORE = 'ai_quest_flavors';

const cache = new Map<string, string>();

export async function getStoredFlavor(questId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', STORE)
      .eq('doc_id', questId)
      .limit(1);
    return data?.[0]?.data?.text || null;
  } catch (e) { return null; }
}

async function saveStoredFlavor(questId: string, text: string) {
  try {
    // Garante uma única linha (remove duplicatas antigas) e grava
    await supabase.from('system_collections').delete().eq('collection_name', STORE).eq('doc_id', questId);
    await supabase.from('system_collections').insert({ collection_name: STORE, doc_id: questId, tenant_id: null, data: { text } });
  } catch (e) { /* ignore */ }
}

export async function fetchAiQuestFlavor(questId: string, title: string, description?: string): Promise<string> {
  // Se o professor preencheu a descrição, ela prevalece — a IA não entra em cena.
  if (description && description.trim()) return description.trim();

  if (cache.has(questId)) return cache.get(questId)!;

  // Texto já gerado anteriormente? Reutiliza (não regenera).
  const stored = await getStoredFlavor(questId);
  if (stored) {
    cache.set(questId, stored);
    return stored;
  }

  const cfg = await getGrokConfig();
  console.log('[questAi]', title, '| chave?', !!cfg?.apiKey, '| modelo:', cfg?.model);
  if (cfg?.apiKey) {
    const userPrompt = `Escreva UMA frase curta (máximo 15 palavras), épica de RPG e pedagógica, sobre a missão de matemática "${title}". Não use aspas nem emojis.`;

    // Tenta o modelo configurado; se vier vazio, tenta um modelo confiável (Llama)
    for (const model of [cfg.model || 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile']) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'Você escreve frases curtas e épicas de RPG educacional para missões de matemática escolares, em português brasileiro.' },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 200,
            temperature: 0.8,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const msg = json?.choices?.[0]?.message || {};
          const text = (msg.content || '').trim();
          console.log('[questAi] Groq OK (', model, '):', JSON.stringify(text).slice(0, 200));
          if (text) {
            cache.set(questId, text);
            await saveStoredFlavor(questId, text); // persiste para não regenerar
            return text;
          }
        } else {
          const errBody = await res.text().catch(() => '');
          console.log('[questAi] erro Groq (', model, '):', res.status, errBody.slice(0, 200));
        }
      } catch (e) { console.log('[questAi] exceção (', model, '):', e); }
    }
  }

  // Sem IA disponível/falhou: retorna vazio (sem fallback)
  cache.set(questId, '');
  return '';
}