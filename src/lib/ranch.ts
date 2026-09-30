import type { UserData } from '../contexts/AuthContext';

/**
 * Sistema de LICENÇA DO RANCHO.
 *
 * O rancho só fica disponível quando o aluno usa a LICENÇA DO RANCHO
 * (item consumível com `gameEffect = 'ranch_license'`), que marca
 * `users.ranch_unlocked = true` na conta.
 *
 * Enquanto o rancho estiver bloqueado:
 *  - os itens de rancho (`type = 'ranch'`) ficam OCULTOS na loja e na mochila;
 *  - a guia de filtragem "Rancho" não é exibida.
 * A própria licença continua visível para poder ser comprada/usada.
 */

export const RANCH_LICENSE_EFFECT = 'ranch_license';

/** O rancho está desbloqueado na conta? */
export function isRanchUnlocked(userData?: Partial<UserData> | null): boolean {
  if (!userData) return false;
  return !!(userData.ranchUnlocked || (userData as any).ranch_unlocked);
}

/** O item é um item de rancho (tipo 'ranch') ou a própria licença? */
export function isRanchItem(item: any): boolean {
  if (!item) return false;
  return item.type === 'ranch' || item.itemType === 'ranch' || item.gameEffect === RANCH_LICENSE_EFFECT;
}

/** O item é a licença do rancho? */
export function isRanchLicense(item: any): boolean {
  return item?.gameEffect === RANCH_LICENSE_EFFECT;
}

/**
 * Deve OCULTAR este item do jogador (loja/mochila) enquanto o filtro de rancho
 * não está liberado? Regra: itens de rancho somem quando bloqueado, exceto a licença.
 */
export function isHiddenByRanchLock(item: any, unlocked: boolean): boolean {
  if (unlocked) return false;
  return isRanchItem(item) && !isRanchLicense(item);
}
