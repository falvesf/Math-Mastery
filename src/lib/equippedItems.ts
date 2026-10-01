import { supabase } from './supabase';

// Cache compartilhado dos itens equipados de um usuário.
// - Chamações concorrentes compartilham a MESMA promise (sem refetch duplicado).
// - Chamadas seguintes resolvem instantaneamente (sem o personagem "aparecer sem
//   itens e equipar depois" a cada tela nova: PvP, arena, modal de aposta, cubo).
// - O cache é invalidado quando o jogador equipa/desequipa um item.

const cache = new Map<string, Promise<any[]>>();

export function fetchEquippedItems(uid: string): Promise<any[]> {
  const existing = cache.get(uid);
  if (existing) return existing;
  const p = new Promise<any[]>(async (resolve) => {
    try {
      const { data } = await supabase
        .from('user_items')
        .select('*')
        .eq('student_id', uid)
        .eq('equipped', true);
      const rows: any[] = data || [];
      // Fallback: items comprados às vezes ficam SEM os dados de modelo/imagem (data vazio
      // ou desatualizado). Completa a partir do CATÁLOGO (store_items) por item_id, para o
      // modelo 3D (.glb) e a imagem do item aparecerem no avatar/arena.
      try {
        const ids = Array.from(new Set(rows.map(r => r.item_id).filter(Boolean)));
        if (ids.length) {
          const { data: store } = await supabase.from('store_items').select('*').in('id', ids);
          const byId = new Map<string, any>();
          (store || []).forEach((r: any) => byId.set(String(r.id), r));
          for (const row of rows) {
            const st = byId.get(String(row.item_id));
            if (!st) continue;
            const sd = (typeof st.data === 'string' ? JSON.parse(st.data) : st.data) || {};
            const d = row.data || {};
            row.data = {
              ...sd,
              ...d,
              itemTitle: d.itemTitle || sd.itemTitle || sd.title || st.name || d.title || undefined,
              itemImageUrl: d.itemImageUrl || d.imageUrl || sd.itemImageUrl || sd.imageUrl || '',
              itemType: d.itemType || sd.itemType || sd.type || 'other',
              gameModelUrl: d.gameModelUrl || sd.gameModelUrl || '',
              modelTextureUrl: d.modelTextureUrl || sd.modelTextureUrl || '',
              minecraftHeadValue: d.minecraftHeadValue || sd.minecraftHeadValue || '',
              modelTransforms: d.modelTransforms || sd.modelTransforms || null,
              avatarPart: d.avatarPart || sd.avatarPart || null,
              itemCategory: d.itemCategory || sd.itemCategory || 'none',
              rarity: d.rarity || sd.rarity || 'common',
            };
          }
        }
      } catch { /* catálogo indisponível — mantém os dados do inventário */ }
      resolve(rows);
    } catch {
      resolve([]);
    }
  });
  cache.set(uid, p);
  return p;
}

export function invalidateEquippedItems(uid: string) {
  cache.delete(uid);
}