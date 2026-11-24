import { RANKS, getRankForXp } from './ranks';
import { supabase } from './supabase';
import type { UserData } from '../contexts/AuthContext';
import { calculateTotalStats } from './gacha';

/**
 * Espaço da mochila + itens BLOQUEADOS (excedente).
 *
 * "Itens bloqueados" = itens que estão além da capacidade da mochila. O jogador
 * não pode USAR/equipar/vender um item bloqueado — é como se não existisse até
 * que a mochila tenha espaço (venda/uso/consumo libera o slot).
 *
 * A posição de cada item é determinada pelo slotMap (users.inventory_preferences)
 * e pela MESMA lógica da mochila ("Todos"), para que qualquer tela chegue ao
 * MESMO resultado: um item bloqueado na mochila é bloqueado em todo o sistema.
 */

export const INVENTORY_SPACE_EFFECT = 'inventory_space';
export const INVENTORY_SPACE_DURATIONS = [3, 5, 7, 10, 12, 15, 30, 60] as const;

/** Bônus temporário ATIVO (0 se expirado). */
export function getActiveInventorySpaceBuff(userData?: Partial<UserData> | null): number {
  if (!userData) return 0;
  const buff = Number(userData.inventorySpaceBuff ?? (userData as any).inventory_space_buff) || 0;
  const until = userData.inventorySpaceBuffUntil ?? (userData as any).inventory_space_buff_until;
  if (buff <= 0) return 0;
  if (typeof until === 'number' && until > 0 && until <= Date.now()) return 0; // expirado
  if (typeof until === 'string' && new Date(until).getTime() <= Date.now()) return 0;
  return buff;
}

/** Capacidade BASE da mochila (sem slots extras de fortitude). */
export function computeBaseInventorySpace(userData?: Partial<UserData> | null): number {
  if (!userData) return 12;
  const currentRank = getRankForXp(userData.xp || 0, (userData as any).classId || (userData as any).class_id);
  const rankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
  const extra = Number(userData.extraInventorySpace ?? (userData as any).extra_inventory_space) || 0;
  return 12 + rankIndex + extra + getActiveInventorySpaceBuff(userData);
}

function parseJsonSafe<T>(val: any, fallback: T): T {
  if (val == null) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val;
}

/** Calcula quantos slots extras de Fortitude o usuário ganha (itens equipados + atributos distribuídos). */
export function computeFortitudeSlots(userData?: Partial<UserData> | null, rows: any[] = []): number {
  const distStats = parseJsonSafe<Record<string, number>>(
    userData?.distributedStats ?? (userData as any)?.distributed_stats,
    {}
  );
  const equippedItems = (rows || [])
    .filter((r: any) => Boolean(r?.equipped))
    .map((r: any) => {
      const d = r?.data || r || {};
      return {
        ...r,
        ...d,
        adds: parseJsonSafe(d.adds ?? r?.adds, []),
        fixedAttributes: parseJsonSafe(d.fixedAttributes ?? r?.fixedAttributes, []),
      };
    });
  const stats = calculateTotalStats(equippedItems, distStats);
  return Math.max(0, Math.floor((stats?.fortitude || 0) / 1));
}

/** Conta quantos slots da mochila estão realmente ocupados (ignora equipados, à venda no bazar e dropados). */
export function countOccupiedBagSlots(rows: any[] = []): number {
  return (rows || []).filter((r: any) => {
    if (!r || r.equipped) return false;
    const d = r.data || {};
    if (d.forSale || r.forSale || d.isDropped || r.isDropped) return false;
    if (r.student_id === 'dropped' || d.studentId === 'dropped') return false;
    return true;
  }).length;
}

/** Capacidade TOTAL (base + bônus/buff + fortitude dos itens equipados e atributos distribuídos). */
export function computeMaxInventorySpace(userData?: Partial<UserData> | null, fortitudeSlots = 0): number {
  return computeBaseInventorySpace(userData) + Math.max(0, Math.floor(fortitudeSlots || 0));
}

/** Capacidade TOTAL calculada diretamente a partir do usuário + linhas de `user_items`. */
export function computeMaxInventorySpaceFromRows(userData?: Partial<UserData> | null, rows: any[] = []): number {
  return computeMaxInventorySpace(userData, computeFortitudeSlots(userData, rows));
}

/**
 * Calcula quais `user_item.id` estão BLOQUEADOS (além da capacidade).
 * Replica a lógica da mochila: posiciona por slotMap e o excedente vira bloqueado.
 */
export function getLockedItemIds(rows: any[], slotMap: Record<string, number>, maxInventorySpace: number): Set<string> {
  const locked = new Set<string>();
  try {
    const total = Math.max(maxInventorySpace, rows.length);
    const slots: (any | null)[] = Array(total).fill(null);
    const unplaced: any[] = [];
    rows.forEach(r => {
      const idx = slotMap[r.id];
      if (idx !== undefined && idx >= 0 && idx < total && slots[idx] === null) slots[idx] = r;
      else unplaced.push(r);
    });
    unplaced.forEach(r => { const ei = slots.indexOf(null); if (ei !== -1) slots[ei] = r; else slots.push(r); });
    slots.forEach((r, i) => { if (r && i >= maxInventorySpace) locked.add(r.id); });
  } catch { /* mantém tudo disponível em caso de erro */ }
  return locked;
}

/** Filtra as linhas de user_items mantendo apenas as NÃO bloqueadas. */
export function filterAvailableRows(
  rows: any[], 
  userData?: Partial<UserData> | null, 
  slotMap?: Record<string, number>, 
  fortitudeSlots: number | any[] = 0
): any[] {
  if (!rows || !rows.length) return rows;

  let extraSlots = 0;
  if (typeof fortitudeSlots === 'number') {
    extraSlots = fortitudeSlots;
  } else if (Array.isArray(fortitudeSlots)) {
    const stats = calculateTotalStats(fortitudeSlots, userData?.distributedStats || (userData as any)?.distributed_stats);
    extraSlots = Math.floor((stats?.fortitude || 0) / 1);
  }

  // Se extraSlots ainda for 0, deriva de itens equipados em rows + distributedStats
  if (extraSlots <= 0) {
    extraSlots = computeFortitudeSlots(userData, rows);
  }

  const effectiveSlotMap = slotMap || userData?.inventoryPreferences?.slotMap || (userData as any)?.inventory_preferences?.slotMap || {};
  const maxSpace = computeMaxInventorySpace(userData, extraSlots);
  const locked = getLockedItemIds(rows, effectiveSlotMap, maxSpace);
  if (locked.size === 0) return rows;
  return rows.filter(r => !locked.has(r.id));
}

/** Quantos slots LIVRES existem (capacidade − itens não equipados atuais). */
export function getAvailableInventorySpace(userData?: Partial<UserData> | null, totalBagCount = 0, fortitudeSlots = 0): number {
  return Math.max(0, computeMaxInventorySpace(userData, fortitudeSlots) - (totalBagCount || 0));
}

/** Consulta real no banco (user_items + fortitude + bônus/patente) para verificar espaço livre com exatidão. */
export async function fetchUserInventorySpace(
  studentId: string,
  userDataOverride?: Partial<UserData> | any
): Promise<{ occupied: number; maxSpace: number; free: number; fortitudeSlots: number; rows: any[] }> {
  const [{ data: rowsSnap }, userRes] = await Promise.all([
    supabase.from('user_items').select('id, equipped, data').eq('student_id', studentId),
    userDataOverride && (userDataOverride.distributedStats || userDataOverride.distributed_stats)
      ? Promise.resolve({ data: userDataOverride })
      : supabase
          .from('users')
          .select('id, xp, class_id, extra_inventory_space, inventory_space_buff, inventory_space_buff_until, distributed_stats')
          .eq('id', studentId)
          .maybeSingle(),
  ]);

  const rows = rowsSnap || [];
  const mergedUser = userRes?.data
    ? { ...(userRes.data as any), ...(userDataOverride || {}) }
    : userDataOverride;
  const fortitudeSlots = computeFortitudeSlots(mergedUser, rows);
  const maxSpace = computeMaxInventorySpace(mergedUser, fortitudeSlots);
  const occupied = countOccupiedBagSlots(rows);
  return {
    occupied,
    maxSpace,
    free: Math.max(0, maxSpace - occupied),
    fortitudeSlots,
    rows,
  };
}

/** Aplica o effect de aumento de mochila (inventory_space) na conta. */
export async function applyInventorySpaceEffect(
  uid: string,
  userData: Partial<UserData> | null,
  itemData: any
): Promise<{ ok: boolean; message: string; bonus: number; days: number }> {
  const bonus = Math.max(1, Number(itemData?.spaceBonus) || 5);
  const days = Number(itemData?.inventorySpaceDuration) ?? 7;
  const now = Date.now();
  const update: any = {};
  if (days <= 0) {
    update.extra_inventory_space = (Number(userData?.extraInventorySpace) || 0) + bonus;
  } else {
    const curBuff = getActiveInventorySpaceBuff(userData);
    const curUntil = (userData?.inventorySpaceBuffUntil && userData.inventorySpaceBuffUntil > now) ? userData.inventorySpaceBuffUntil : now;
    update.inventory_space_buff = curBuff + bonus;
    update.inventory_space_buff_until = new Date(curUntil + days * 24 * 60 * 60 * 1000).toISOString();
    update.inventory_space_buff_days = days;
  }
  const { error } = await supabase.from('users').update(update).eq('id', uid);
  if (error) return { ok: false, message: error.message, bonus, days };
  return { ok: true, message: days > 0 ? `+${bonus} espaço${bonus > 1 ? 's' : ''} por ${days} dia${days > 1 ? 's' : ''}` : `+${bonus} espaço${bonus > 1 ? 's' : ''} (permanente)`, bonus, days };
}