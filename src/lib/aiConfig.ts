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

// Modelos válidos e suportados nativamente pelo Groq (api.groq.com)
const VALID_MODELS = [
  'qwen/qwen3.8-27b',
  'groq/compound-mini',
  'groq/compound',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
];
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';

let cache: GrokConfig | null = null;

const LS_KEY_API = 'math_mastery_groq_api_key';
const LS_KEY_MODEL = 'math_mastery_groq_model';

export async function getGrokConfig(): Promise<GrokConfig | null> {
  if (cache) return cache;

  // 1. Tentar ler do Supabase
  try {
    const { data, error } = await supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', DOC)
      .limit(1);
      
    if (error) console.error("Erro ao buscar IA Config no Supabase:", error);
      
    if (data && data.length > 0 && data[0]?.data?.apiKey) {
      const savedModel = data[0].data.model || DEFAULT_MODEL;
      const model = VALID_MODELS.includes(savedModel) ? savedModel : DEFAULT_MODEL;
      cache = { apiKey: data[0].data.apiKey.trim(), model };
      try {
        localStorage.setItem(LS_KEY_API, cache.apiKey);
        localStorage.setItem(LS_KEY_MODEL, cache.model);
      } catch (_) {}
      return cache;
    }
  } catch (e) {
    console.error("Exception fetching IA config from Supabase:", e);
  }

  // 2. Fallback local: se o Supabase falhar ou estiver vazio, tentar localStorage
  try {
    const localKey = localStorage.getItem(LS_KEY_API)?.trim();
    const localModel = localStorage.getItem(LS_KEY_MODEL)?.trim();
    if (localKey) {
      const model = VALID_MODELS.includes(localModel || '') ? localModel! : DEFAULT_MODEL;
      cache = { apiKey: localKey, model };
      return cache;
    }
  } catch (_) {}

  return null;
}

export async function saveGrokConfig(apiKey: string, model?: string): Promise<boolean> {
  const cleanKey = apiKey.trim();
  if (!cleanKey || cleanKey.length < 10) {
    console.warn("Tentativa de salvar chave vazia ou inválida ignorada.");
    return false;
  }
  const cleanModel = VALID_MODELS.includes(model || '') ? model! : DEFAULT_MODEL;
  const payloadData = { apiKey: cleanKey, model: cleanModel };

  // 1. Salva em cache e localStorage imediatamente (garantia de nunca se perder localmente)
  try {
    localStorage.setItem(LS_KEY_API, cleanKey);
    localStorage.setItem(LS_KEY_MODEL, cleanModel);
  } catch (_) {}
  cache = payloadData;

  // 2. Salva no Supabase
  try {
    const payload = { collection_name: COLLECTION, doc_id: DOC, tenant_id: null, data: payloadData };
    const { data: existing, error: existError } = await supabase
      .from('system_collections')
      .select('id')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', DOC)
      .limit(1);
      
    if (existError) console.error("Erro ao verificar IA Config existente:", existError);
      
    if (existing && existing.length > 0) {
      const { error } = await supabase.from('system_collections').update({ data: payload.data }).eq('id', existing[0].id);
      if (error) { console.error("Erro no update IA:", error); return false; }
    } else {
      const { error } = await supabase.from('system_collections').insert(payload);
      if (error) { console.error("Erro no insert IA:", error); return false; }
    }
    return true;
  } catch (e) {
    console.error("Exceção ao persistir chave no Supabase:", e);
    return false;
  }
}

export function clearGrokConfigCache() {
  cache = null;
}