import { supabase } from './supabase';

/**
 * Configuração da IA (chave do Groq/GPT) guardada numa TABELA do Supabase
 * (system_collections: ai_config/grok). Pode ser alterada dinamicamente pelo
 * admin, sem precisar de redeploy.
 *
 * Obs.: a chave é usada no frontend (mesma abordagem do projeto SOSA). Para
 * um ambiente de produção com usuários reais, o ideal é movê-la para um
 * Edge Function/secret — mas aqui mantém-se editável via tabela.
 */

const COLLECTION = 'ai_config';
const DOC = 'grok';

export interface GrokConfig {
  apiKey: string;
  model: string;
}

// Modelos válidos do Groq (api.groq.com). Modelos antigos (grok-*/xAI) NÃO existem aqui.
const VALID_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

let cache: GrokConfig | null = null;

export async function getGrokConfig(): Promise<GrokConfig | null> {
  if (cache) return cache;
  try {
    const { data } = await supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', DOC)
      .maybeSingle();
    if (data?.data?.apiKey) {
      const savedModel = data.data.model || DEFAULT_MODEL;
      // Garante um modelo compatível com o Groq (ignora grok-*/xai-* antigos)
      const model = VALID_MODELS.includes(savedModel) ? savedModel : DEFAULT_MODEL;
      cache = { apiKey: data.data.apiKey, model };
      return cache;
    }
  } catch (e) { /* ignore */ }
  return null;
}

export async function saveGrokConfig(apiKey: string, model?: string): Promise<boolean> {
  try {
    const payload = { collection_name: COLLECTION, doc_id: DOC, tenant_id: null, data: { apiKey, model: model || 'grok-3-mini' } };
    const existing = await supabase
      .from('system_collections')
      .select('id')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', DOC)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase.from('system_collections').update({ data: payload.data }).eq('id', existing.id);
      if (error) return false;
    } else {
      const { error } = await supabase.from('system_collections').insert(payload);
      if (error) return false;
    }
    cache = payload.data;
    return true;
  } catch (e) {
    return false;
  }
}

export function clearGrokConfigCache() {
  cache = null;
}