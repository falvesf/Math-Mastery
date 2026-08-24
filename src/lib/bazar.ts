import { supabase } from './supabase';
import { RANKS, getRankForXp } from './ranks';
import { calculateTotalStats } from './gacha';

/**
 * Sistema de LICENÇA DE VENDA no Bazar.
 *
 * Para colocar um item à venda é necessário usar um item de efeito
 * `bazar_sale_permit` (Licença de Venda). A licença define a validade
 * do anúncio ("buff"): 1, 3, 5, 10 ou 15 dias (máx. 15).
 *
 * Quando o buff expira:
 *  - Se o vendedor tem espaço na mochila -> o item volta ao inventário.
 *  - Se NÃO tem espaço -> o item é ocultado do bazar (hiddenFromMarket)
 *    e só volta ao inventário quando houver espaço suficiente.
 */

export const BAZAR_LICENSE_EFFECT = 'bazar_sale_permit';
export const MAX_BAZAR_BUFF_DAYS = 15;
export const BAZAR_BUFF_OPTIONS = [1, 3, 5, 10, 15];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calcula o espaço da mochila de um usuário (mesma regra da loja/mochila) */
export async function getSellerSpace(studentId: string): Promise<{ max: number; current: number; available: number }> {
  try {
    const { data: user } = await supabase.from('users').select('*').eq('id', studentId).single();
    if (!user) return { max: 0, current: 0, available: 0 };

    const rankIndex = RANKS.findIndex(r => r.name === getRankForXp(user.xp || 0, user.class_id).name) || 0;
    const extra = user.extra_inventory_space || 0;

    const { data: items } = await supabase.from('user_items').select('*').eq('student_id', studentId);
    let current = 0;
    const equippedStats: any[] = [];
    const consumableCounts: Record<string, number> = {};

    (items || []).forEach(row => {
      const d = row.data as any;
      if (d.forSale || row.student_id === 'dropped') return;
      if (row.equipped) {
        equippedStats.push(d);
        return;
      }
      if (d.itemType === 'consumable') {
        consumableCounts[row.item_id] = (consumableCounts[row.item_id] || 0) + (d.quantity || 1);
      } else {
        current++;
      }
    });
    Object.values(consumableCounts).forEach(qty => { current += Math.ceil(qty / 99); });

    const totalEquippedStats = calculateTotalStats(equippedStats, user.distributed_stats || {});
    const fortitudeSlots = Math.floor(totalEquippedStats.fortitude / 30);
    const max = 6 + rankIndex + extra + fortitudeSlots;
    return { max, current, available: Math.max(0, max - current) };
  } catch (e) {
    return { max: 0, current: 0, available: 0 };
  }
}

/** Quantos slots a mochila precisa para devolver um anúncio */
function slotsNeeded(saleData: any): number {
  if (saleData.itemType === 'consumable') return Math.ceil((saleData.quantity || 1) / 99);
  return 1;
}

/** Remove os campos de venda do data, devolvendo o item ao inventário */
function clearSaleFields(data: any) {
  const next = { ...data };
  delete next.forSale;
  delete next.price;
  delete next.sellerName;
  delete next.sellerClassName;
  delete next.sellerClassColor;
  delete next.sellerPersuasion;
  delete next.preferredCurrency;
  delete next.saleExpiresAt;
  delete next.saleBuffDays;
  delete next.hiddenFromMarket;
  return next;
}

/**
 * Processa anúncios expirados (e ocultos aguardando espaço).
 * Se `studentId` for informado, processa só os anúncios daquele usuário.
 */
export async function processExpiredSales(studentId?: string): Promise<number> {
  let processed = 0;
  try {
    let q = supabase.from('user_items').select('*').eq('data->>forSale', 'true');
    if (studentId) q = q.eq('student_id', studentId);
    const { data: rows } = await q;

    const now = Date.now();
    for (const row of (rows || [])) {
      const data = row.data as any;
      const expired = typeof data.saleExpiresAt === 'number' && data.saleExpiresAt <= now;
      const hidden = data.hiddenFromMarket === true;
      if (!expired && !hidden) continue;

      const space = await getSellerSpace(row.student_id);
      if (space.available >= slotsNeeded(data)) {
        await supabase.from('user_items').update({ data: clearSaleFields(data) }).eq('id', row.id);
        processed++;
      } else if (expired && !hidden) {
        await supabase.from('user_items').update({ data: { ...data, hiddenFromMarket: true } }).eq('id', row.id);
        processed++;
      }
    }
  } catch (e) {
    console.error('Erro ao processar anúncios expirados:', e);
  }
  return processed;
}

/** Processa os anúncios expirados do usuário atual (mochila/bazar) */
export async function processMyExpiredSales(studentId: string): Promise<number> {
  return processExpiredSales(studentId);
}

/** Texto amigável do tempo restante de um anúncio */
export function formatSaleRemaining(saleExpiresAt?: number): string {
  if (!saleExpiresAt) return '';
  const diff = saleExpiresAt - Date.now();
  if (diff <= 0) return 'Expirado';
  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff % DAY_MS) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}