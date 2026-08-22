import { supabase } from './supabase';
import { sessionCache, CACHE_KEYS, CACHE_TTL } from './sessionCache';

export interface CompanionTip {
  id: string;
  lines: string[];
  seenOnTabs?: string[];
  priority: number;
}

export const COMPANION_TIPS: CompanionTip[] = [
  {
    id: 'intro',
    lines: [
      'Oi! Eu sou o seu personagem!',
      'Clique em mim para me personalizar',
      'e deixar tudo do seu jeito!',
    ],
    priority: 0,
  },
  {
    id: 'quests',
    lines: [
      'Aqui é a Central de Missões.',
      'Enfrente desafios e vença',
      'monstros para ganhar XP!',
    ],
    seenOnTabs: ['quests'],
    priority: 10,
  },
  {
    id: 'inventory',
    lines: [
      'Sua Mochila guarda itens,',
      'poções e equipamentos que',
      'você ganha nas batalhas.',
    ],
    seenOnTabs: ['inventory'],
    priority: 20,
  },
  {
    id: 'pet',
    lines: [
      'Um Pet te acompanha',
      'na jornada. Equipe um',
      'para mais estilo e força!',
    ],
    seenOnTabs: ['inventory', 'store'],
    priority: 30,
  },
  {
    id: 'rankingClass',
    lines: [
      'Veja o ranking da sua turma',
      'e dispute o topo com',
      'os seus colegas!',
    ],
    seenOnTabs: ['ranking_class'],
    priority: 40,
  },
  {
    id: 'rankingGeneral',
    lines: [
      'Este é o ranking geral da',
      'escola. Suba cada vez mais',
      'para virar uma lenda!',
    ],
    seenOnTabs: ['ranking_general'],
    priority: 50,
  },
  {
    id: 'store',
    lines: [
      'Use suas moedas na Loja',
      'para comprar itens, skins',
      'e equipamentos novos!',
    ],
    seenOnTabs: ['store'],
    priority: 60,
  },
];

const SETTINGS_COLLECTION = 'settings';
const SETTINGS_DOC = 'companion_tips';

/**
 * Busca as dicas do companheiro salvas pelo superadmin.
 * Se não houver nada salvo ainda, usa o padrão (COMPANION_TIPS).
 */
export async function fetchCompanionTips(): Promise<CompanionTip[]> {
  try {
    const cacheKey = CACHE_KEYS.companionTips();
    const cached = sessionCache.get<CompanionTip[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
      .from('system_collections')
      .select('*')
      .eq('collection_name', SETTINGS_COLLECTION)
      .eq('doc_id', SETTINGS_DOC)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar dicas do companheiro:', error);
      return COMPANION_TIPS;
    }

    const saved = data?.data?.tips;
    if (Array.isArray(saved) && saved.length > 0) {
      const tips = (saved as CompanionTip[]).map(t => ({
        ...t,
        lines: Array.isArray(t.lines) && t.lines.length > 0 ? t.lines : ['Clique em mim para personalizar!'],
        priority: typeof t.priority === 'number' ? t.priority : 100,
      }));
      sessionCache.set(cacheKey, tips, CACHE_TTL.COMPANION_TIPS);
      return tips;
    }

    return COMPANION_TIPS;
  } catch (e) {
    console.error('Erro ao buscar dicas do companheiro:', e);
    return COMPANION_TIPS;
  }
}

/**
 * Salva as dicas do companheiro (apenas superadmin). Global (vale para todas as escolas).
 */
export async function saveCompanionTips(tips: CompanionTip[]): Promise<boolean> {
  try {
    // Limpar linhas antigas para não acumular duplicatas (upsert simples
    // inseriria uma linha nova a cada salvamento, quebrando o fetch).
    await supabase
      .from('system_collections')
      .delete()
      .eq('collection_name', SETTINGS_COLLECTION)
      .eq('doc_id', SETTINGS_DOC);

    const { error } = await supabase.from('system_collections').insert({
      collection_name: SETTINGS_COLLECTION,
      doc_id: SETTINGS_DOC,
      data: { tips },
    });
    if (error) {
      console.error('Erro ao salvar dicas do companheiro:', error);
      return false;
    }
    sessionCache.invalidate(CACHE_KEYS.companionTips());
    return true;
  } catch (e) {
    console.error('Erro ao salvar dicas do companheiro:', e);
    return false;
  }
}