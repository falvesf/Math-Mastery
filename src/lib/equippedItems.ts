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
      resolve(data || []);
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