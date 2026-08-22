import { supabase } from './supabase';

export interface RankVariant {
  classIds: string[];
  imageUrl: string;
}

export interface RankDef {
  id?: string;
  name: string;
  minXp: number;
  color: string;
  imageUrl?: string;
  audioUrl?: string;
  variants?: RankVariant[];
  rankUpChestItems?: { itemId: string; quantity: number }[];
  rankUpChestModelId?: string;
  hideFromHistory?: boolean;
  hide_from_history?: boolean;
}

export const RANKS: RankDef[] = [
  { name: 'Sem Patente', minXp: 0, color: '#94a3b8', hideFromHistory: true },
  { name: 'Bronze I', minXp: 600, color: '#cd7f32' },
  { name: 'Bronze II', minXp: 1200, color: '#cd7f32' },
  { name: 'Bronze III', minXp: 1800, color: '#cd7f32' },
  { name: 'Bronze IV', minXp: 2400, color: '#cd7f32' },
  { name: 'Prata I', minXp: 3000, color: '#cbd5e1' },
  { name: 'Prata II', minXp: 3600, color: '#cbd5e1' },
  { name: 'Prata III', minXp: 4200, color: '#cbd5e1' },
  { name: 'Ouro I', minXp: 4800, color: '#fbbf24' },
  { name: 'Ouro II', minXp: 5400, color: '#fbbf24' },
  { name: 'Ouro III', minXp: 6000, color: '#fbbf24' },
  { name: 'Diamante I', minXp: 6600, color: '#38bdf8' },
  { name: 'Diamante II', minXp: 7200, color: '#38bdf8' },
  { name: 'Mestre', minXp: 8000, color: '#f43f5e' },
  { name: 'Lendário', minXp: 10000, color: '#a855f7' },
];

// Cópia das patentes padrão (para semear o banco de patentes globais)
export const DEFAULT_RANKS: RankDef[] = RANKS.map(r => ({ ...r }));

export function getRankForXp(xp: number, classId?: string): RankDef {
  let currentRank = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.minXp) {
      currentRank = rank;
    } else {
      break;
    }
  }

  // If a classId is provided, check if the current rank has a specific variant for this class
  if (classId && currentRank.variants && currentRank.variants.length > 0) {
    const variant = currentRank.variants.find(v => v.classIds.includes(classId));
    if (variant && variant.imageUrl) {
      // Return a copy of the rank with the overridden image
      return { ...currentRank, imageUrl: variant.imageUrl };
    }
  }

  return currentRank;
}

export const initRanks = async (tenantId?: string) => {
  try {
    let ranksQuery = supabase.from('custom_ranks').select('*');
    // Buscar ranks globais OU ranks da escola atual
    if (tenantId) {
      ranksQuery = ranksQuery.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
    }
    const { data: snap, error } = await ranksQuery;
    if (error) throw error;
    if (snap && snap.length > 0) {
      const loadedRanks = snap.map(d => {
        const { id, ...rest } = d;
        return { 
          ...rest, 
          hideFromHistory: d.hide_from_history ?? d.hideFromHistory ?? (d.minXp === 0),
          _isGlobal: d.is_global ?? false 
        } as RankDef & { _isGlobal?: boolean };
      }).sort((a,b) => a.minXp - b.minXp);

      // Se a escola tem patentes locais, elas substituem as globais
      const localRanks = loadedRanks.filter(r => !(r as any)._isGlobal);
      const globalRanks = loadedRanks.filter(r => (r as any)._isGlobal);

      RANKS.length = 0; // clear existing
      if (localRanks.length > 0) {
        RANKS.push(...localRanks);
      } else {
        RANKS.push(...globalRanks);
      }
    }
  } catch (e) {
    console.error("Failed to load custom ranks", e);
  }
};

/**
 * Garante que as patentes padrão existam como GLOBAIS no banco (banco de patentes).
 * Assim toda escola tem uma base global para copiar/importar.
 */
export async function ensureGlobalRanks(): Promise<void> {
  try {
    const { data } = await supabase.from('custom_ranks').select('id').eq('is_global', true).limit(1);
    if (data && data.length > 0) return; // já existe base global

    const rows = DEFAULT_RANKS.map((r, i) => ({
      id: `default_global_${i}`,
      name: r.name,
      minXp: r.minXp,
      color: r.color,
      imageUrl: r.imageUrl || '',
      audioUrl: r.audioUrl || '',
      variants: r.variants || [],
      rankUpChestItems: r.rankUpChestItems || [],
      rankUpChestModelId: r.rankUpChestModelId || '',
      hide_from_history: r.hideFromHistory ?? (r.minXp === 0),
      tenant_id: null,
      is_global: true
    }));

    const { error } = await supabase.from('custom_ranks').insert(rows);
    if (error) console.error('Erro ao semear patentes globais padrão:', error);
  } catch (e) {
    console.error('Erro em ensureGlobalRanks:', e);
  }
}
