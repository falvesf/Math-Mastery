/**
 * Utilitário para resolver, traduzir e sincronizar referências cruzadas entre itens
 * (materiais de forja, transmutação, quebra e fusão) entre o Banco de Itens Global
 * e os diferentes tenants (escolas).
 */

export interface ItemReferenceMapTarget {
  id: string;
  name?: string;
  title?: string;
  importedFromId?: string;
  data?: any;
}

const norm = (s?: any) => String(s ?? '').trim().toLowerCase();

/**
 * Localiza no catálogo de destino o item equivalente ao `sourceId`.
 * Tenta:
 * 1. Match exato por `id`
 * 2. Match por `importedFromId === sourceId` (quando sourceId é o ID do Banco Global)
 * 3. Match através do item de origem: se conhecemos o item de origem (por sourceAllItemsMap):
 *    a. Match por `importedFromId === sourceItem.importedFromId` (mesmo template base)
 *    b. Match por nome/título normalizado (`item.name === sourceItem.name`)
 */
export function resolveTargetItemId(
  sourceId: string | undefined | null,
  targetItems: ItemReferenceMapTarget[],
  sourceAllItemsMap?: Map<string, ItemReferenceMapTarget> | Record<string, ItemReferenceMapTarget>
): string | null {
  if (!sourceId) return null;
  const sId = String(sourceId).trim();
  if (!sId) return null;

  // 1. Já existe item com o mesmo ID no catálogo de destino?
  const directMatch = targetItems.find(t => t.id === sId);
  if (directMatch) return directMatch.id;

  // 2. Algum item do destino foi importado deste sourceId?
  const importedMatch = targetItems.find(t => {
    const imp = t.importedFromId || t.data?.importedFromId;
    return imp && imp === sId;
  });
  if (importedMatch) return importedMatch.id;

  // 3. Se temos o mapa de todos os itens conhecidos, inspeciona o item de origem
  let sourceItem: ItemReferenceMapTarget | undefined;
  if (sourceAllItemsMap) {
    if (sourceAllItemsMap instanceof Map) {
      sourceItem = sourceAllItemsMap.get(sId);
    } else {
      sourceItem = sourceAllItemsMap[sId];
    }
  }

  if (sourceItem) {
    const srcGlobalId = sourceItem.importedFromId || sourceItem.data?.importedFromId || ((sourceItem as any).is_global ? sourceItem.id : null);
    const srcTitle = norm(sourceItem.title || sourceItem.name || sourceItem.data?.title || sourceItem.data?.name);

    // 3a. Match por mesmo template global
    if (srcGlobalId) {
      const globalMatch = targetItems.find(t => {
        const imp = t.importedFromId || t.data?.importedFromId;
        return (imp && imp === srcGlobalId) || t.id === srcGlobalId;
      });
      if (globalMatch) return globalMatch.id;
    }

    // 3b. Match por nome/título normalizado
    if (srcTitle) {
      const titleMatch = targetItems.find(t => {
        const tTitle = norm(t.title || t.name || t.data?.title || t.data?.name);
        return tTitle && tTitle === srcTitle;
      });
      if (titleMatch) return titleMatch.id;
    }
  }

  // Não encontrou correspondência no destino
  return null;
}

/**
 * Remapeia todas as referências internas de um item (forgeConfig, transmuteConfig, etc.)
 * para que apontem para os IDs corretos no catálogo de destino.
 */
export function remapItemReferences<T extends Record<string, any>>(
  itemData: T,
  targetCatalog: ItemReferenceMapTarget[],
  knownItemsMap?: Map<string, ItemReferenceMapTarget> | Record<string, ItemReferenceMapTarget>
): T {
  if (!itemData || typeof itemData !== 'object') return itemData;

  const cloned: any = JSON.parse(JSON.stringify(itemData));

  const remapId = (oldId?: string | null): string => {
    if (!oldId) return '';
    const resolved = resolveTargetItemId(oldId, targetCatalog, knownItemsMap);
    return resolved || oldId;
  };

  // 1. forgeConfig.materialsPerLevel
  if (cloned.forgeConfig && cloned.forgeConfig.materialsPerLevel) {
    const mats = cloned.forgeConfig.materialsPerLevel;
    const newMats: Record<string, string[]> = {};
    for (const lvl of Object.keys(mats)) {
      if (Array.isArray(mats[lvl])) {
        newMats[lvl] = mats[lvl].map((m: any) => remapId(m)).filter(Boolean);
      } else {
        newMats[lvl] = mats[lvl];
      }
    }
    cloned.forgeConfig.materialsPerLevel = newMats;
  }

  // 2. transmuteConfig
  if (cloned.transmuteConfig) {
    if (Array.isArray(cloned.transmuteConfig.materials)) {
      cloned.transmuteConfig.materials = cloned.transmuteConfig.materials.map((m: any) => remapId(m));
    }
    if (cloned.transmuteConfig.targetItemId) {
      cloned.transmuteConfig.targetItemId = remapId(cloned.transmuteConfig.targetItemId);
    }
  }

  // 3. quebra / fusão
  if (cloned.breakTargetItemId) {
    cloned.breakTargetItemId = remapId(cloned.breakTargetItemId);
  }
  if (cloned.fuseTargetItemId) {
    cloned.fuseTargetItemId = remapId(cloned.fuseTargetItemId);
  }

  return cloned as T;
}

/**
 * Converte referências de itens locais de uma escola para os IDs do Banco de Itens Global.
 * Usado ao sincronizar/exportar itens da escola para o Banco Global.
 */
export function convertLocalReferencesToGlobal<T extends Record<string, any>>(
  itemData: T,
  globalCatalog: ItemReferenceMapTarget[],
  localCatalog: ItemReferenceMapTarget[]
): T {
  const localMap = new Map<string, ItemReferenceMapTarget>();
  localCatalog.forEach(i => localMap.set(i.id, i));
  globalCatalog.forEach(i => localMap.set(i.id, i));
  return remapItemReferences(itemData, globalCatalog, localMap);
}

/**
 * Converte referências de itens globais do Banco para os IDs locais de uma escola.
 * Usado ao importar/sincronizar itens do Banco Global para a escola.
 */
export function convertGlobalReferencesToLocal<T extends Record<string, any>>(
  itemData: T,
  localCatalog: ItemReferenceMapTarget[],
  globalCatalog: ItemReferenceMapTarget[]
): T {
  const globalMap = new Map<string, ItemReferenceMapTarget>();
  globalCatalog.forEach(i => globalMap.set(i.id, i));
  localCatalog.forEach(i => globalMap.set(i.id, i));
  return remapItemReferences(itemData, localCatalog, globalMap);
}
