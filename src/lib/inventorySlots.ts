import { RANKS, getRankForXp } from './ranks';
import { supabase } from './supabase';
import type { UserData } from '../contexts/AuthContext';

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
  const buff = Number(userData.inventorySpaceBuff) || 0;
  const until = userData.inventorySpaceBuffUntil;
  if (buff <= 0) return 0;
  if (typeof until === 'number' && until > 0 && until <= Date.now()) return 0; // expirado
  return buff;
}

/** Capacidade BASE da mochila (sem slots extras de fortitude). */
export function computeBaseInventorySpace(userData?: Partial<UserData> | null): number {
  if (!userData) return 12;
  const currentRank = getRankForXp(userData.xp || 0, (userData as any).classId);
  const rankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
  return 12 + rankIndex + (userData.extraInventorySpace || 0) + getActiveInventorySpaceBuff(userData);
}

/** Capacidade TOTAL (base + slots de fortitude dos itens equipados). */
export function computeMaxInventorySpace(userData?: Partial<UserData> | null, fortitudeSlots = 0): number {
  return computeBaseInventorySpace(userData) + Math.max(0, Math.floor(fortitudeSlots || 0));
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
export function filterAvailableRows(rows: any[], userData?: Partial<UserData> | null, slotMap?: Record<string, number>, fortitudeSlots = 0): any[] {
  if (!rows || !rows.length) return rows;
  const maxSpace = computeMaxInventorySpace(userData, fortitudeSlots);
  const locked = getLockedItemIds(rows, slotMap || {}, maxSpace);
  if (locked.size === 0) return rows;
  return rows.filter(r => !locked.has(r.id));
}

/** Quantos slots LIVRES existem (capacidade − itens não equipados atuais). */
export function getAvailableInventorySpace(userData?: Partial<UserData> | null, totalBagCount = 0): number {
  return Math.max(0, computeMaxInventorySpace(userData) - (totalBagCount || 0));
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