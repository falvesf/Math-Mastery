import { supabase } from './supabase';

// Registro GLOBAL de transforms de itens (Debug 3D), compartilhado entre TODOS os
// tenants. A chave é a identidade visual do item (título + parte do corpo + modelo),
// então um item igual vendido em escolas diferentes usa a MESMA configuração.
// Ex: item "voando" corrigido em uma escola vale para a mesma arma/armadura em outra.

let cache: Record<string, any> | null = null;
let loadPromise: Promise<Record<string, any>> | null = null;

function normalizeKey(str?: string | null): string {
  return (str || '').trim().toLowerCase().replace(/\\/g, '/');
}

export function computeItemTransformKey(item: any): string {
  const title = item?.itemTitle || item?.title || item?.name || '';
  return [title, item?.avatarPart, item?.gameModelUrl]
    .map(v => (v || ''))
    .join('|');
}

export function registerTransformInMap(map: Record<string, any>, item: any, id?: string): void {
  const mt = item?.modelTransforms;
  if (!mt || Object.keys(mt).length === 0) return;

  const title = normalizeKey(item.itemTitle || item.title || item.name);
  const part = normalizeKey(item.avatarPart);
  const modelUrl = normalizeKey(item.gameModelUrl);
  const itemId = id || item.itemId || item.id || item.docId;

  if (itemId) map[`id:${itemId}`] = mt;
  if (title && part && modelUrl) map[`full:${title}|${part}|${modelUrl}`] = mt;
  if (title && part) map[`title_part:${title}|${part}`] = mt;
  if (title) map[`title:${title}`] = mt;
  
  // Legacy key compatibility
  const legacyKey = computeItemTransformKey(item);
  if (legacyKey) map[legacyKey] = mt;
}

export async function loadGlobalItemTransforms(force = false): Promise<Record<string, any>> {
  if (cache && !force) return cache;
  if (loadPromise && !force) return loadPromise;

  loadPromise = (async () => {
    const map: Record<string, any> = {};

    try {
      // 1. Fonte primária: store_items (catálogo geral de itens)
      const { data: storeRows } = await supabase
        .from('store_items')
        .select('id, data');

      if (storeRows) {
        storeRows.forEach(row => {
          const d = row.data || {};
          if (d.modelTransforms && Object.keys(d.modelTransforms).length > 0) {
            registerTransformInMap(map, d, row.id);
          }
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar transforms de store_items:', e);
    }

    try {
      // 2. Fonte secundária: item_transforms (se houver tabela dedicada)
      const { data: tRows } = await supabase
        .from('item_transforms')
        .select('item_key, model_transforms');

      if (tRows) {
        tRows.forEach(r => {
          if (r.item_key && r.model_transforms) {
            map[r.item_key] = { ...(map[r.item_key] || {}), ...r.model_transforms };
          }
        });
      }
    } catch {
      // Tabela item_transforms pode ter restrições de permissão, ignorar
    }

    cache = map;
    loadPromise = null;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('avatar-transforms-updated'));
    }

    return map;
  })();

  return loadPromise;
}

export function getGlobalModelTransforms(item: any): any {
  if (!cache) {
    // Dispara carregamento em background caso ainda não tenha sido iniciado
    loadGlobalItemTransforms().catch(() => {});
    return undefined;
  }

  const title = normalizeKey(item?.itemTitle || item?.title || item?.name);
  const part = normalizeKey(item?.avatarPart);
  const modelUrl = normalizeKey(item?.gameModelUrl);
  const itemId = item?.itemId || item?.id || item?.docId;

  // 1. Por ID exato do item
  if (itemId && cache[`id:${itemId}`]) return cache[`id:${itemId}`];

  // 2. Por chave completa (título + parte + modelo)
  if (title && part && modelUrl && cache[`full:${title}|${part}|${modelUrl}`]) {
    return cache[`full:${title}|${part}|${modelUrl}`];
  }

  // 3. Por chave antiga computeItemTransformKey
  const legacyKey = computeItemTransformKey(item);
  if (legacyKey && cache[legacyKey]) return cache[legacyKey];

  // 4. Por título + parte do corpo (ex: "armadura de couro|body")
  if (title && part && cache[`title_part:${title}|${part}`]) {
    return cache[`title_part:${title}|${part}`];
  }

  // 5. Por título
  if (title && cache[`title:${title}`]) {
    return cache[`title:${title}`];
  }

  return undefined;
}

export function setGlobalItemTransform(item: any, transforms: any): void {
  if (!cache) cache = {};
  registerTransformInMap(cache, { ...item, modelTransforms: transforms });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('avatar-transforms-updated'));
  }
}

export function invalidateGlobalItemTransforms(): void {
  cache = null;
  loadGlobalItemTransforms(true).catch(() => {});
}

// Auto-carrega no primeiro import para estar pronto imediatamente
if (typeof window !== 'undefined') {
  loadGlobalItemTransforms().catch(() => {});
}