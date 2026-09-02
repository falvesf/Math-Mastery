import { supabase } from './supabase';

// Registro GLOBAL de transforms de itens (Debug 3D), compartilhado entre TODOS os
// tenants. A chave é a identidade visual do item (título + parte do corpo + modelo),
// então um item igual vendido em escolas diferentes usa a MESMA configuração.
// Ex: item "voando" corrigido em uma escola vale para a mesma arma/armadura em outra.

let cache: Record<string, any> | null = null;

export function computeItemTransformKey(item: any): string {
  return [item?.itemTitle, item?.avatarPart, item?.gameModelUrl]
    .map(v => (v || ''))
    .join('|');
}

export async function loadGlobalItemTransforms(force = false): Promise<void> {
  if (cache && !force) return;
  const { data } = await supabase.from('item_transforms').select('item_key, model_transforms');
  const map: Record<string, any> = {};
  (data || []).forEach(r => {
    map[r.item_key] = r.model_transforms;
  });
  cache = map;
}

export function getGlobalModelTransforms(item: any): any {
  if (!cache) return undefined;
  return cache[computeItemTransformKey(item)];
}

export function invalidateGlobalItemTransforms(): void {
  cache = null;
}