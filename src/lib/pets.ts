import { supabase } from './supabase';

export interface PetStats {
  hp?: number;
  attack?: number;
  defense?: number;
  evasion?: number;
  critChance?: number;
  speed?: number;
  attackSpeed?: number;
}

export interface PetHistoryEntry {
  at: string;
  type: 'achievement' | 'record';
  text: string;
}

export interface Pet {
  id: string;
  student_id: string;
  tenant_id?: string | null;
  animal_model_id?: string | null;
  species_name?: string | null;
  name?: string | null;
  level: number;
  xp: number;
  relationship: number; // 1..5
  hunger: number;
  thirst: number;
  interaction: number;
  training: number;
  hunger_updated_at: string;
  thirst_updated_at: string;
  interaction_updated_at: string;
  state: 'ranch' | 'equipped' | 'ran_away' | 'dead';
  equipped: boolean;
  stats?: PetStats;
  history?: PetHistoryEntry[];
  created_at?: string;
}

/** Configuração de cada NÍVEL de relacionamento. */
export const RELATIONSHIP_LEVELS: Record<number, {
  name: string;
  /** Horas que a barra dura de 100% → 0%. */
  barHours: number;
  /** Horas "aguardando comida/água" após esvaziar antes de fugir/morrer. */
  waitHours: number;
  /** O que acontece se a espera expirar: foge ou morre. */
  onStarve: 'flee' | 'die';
  /** O que acontece se a INTERAÇÃO esvaziar: foge, fica irritado ou triste. */
  onInteraction: 'flee' | 'angry' | 'sad';
  /** Bloqueio (horas) ao ficar irritado/triste [min, max]. */
  blockHours?: [number, number];
}> = {
  1: { name: 'Selvagem', barHours: 12, waitHours: 12, onStarve: 'flee', onInteraction: 'flee' },
  2: { name: 'Doméstico', barHours: 15, waitHours: 12, onStarve: 'flee', onInteraction: 'flee' },
  3: { name: 'Companheiro', barHours: 18, waitHours: 15, onStarve: 'die', onInteraction: 'angry', blockHours: [3, 6] },
  4: { name: 'Aliado Fiel', barHours: 21, waitHours: 18, onStarve: 'die', onInteraction: 'angry', blockHours: [1, 2] },
  5: { name: 'Alma Gêmea', barHours: 24, waitHours: 24, onStarve: 'die', onInteraction: 'sad', blockHours: [1 / 6, 1] },
};

export function relationshipName(level: number): string {
  return RELATIONSHIP_LEVELS[Math.max(1, Math.min(5, level))]?.name || 'Selvagem';
}

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const hoursSince = (iso: string, now: number) => Math.max(0, (now - new Date(iso).getTime()) / 3600000);

/** Decai UMA barra (0..100) em tempo real, conforme as horas do nível. */
function decayBar(value: number, updatedAt: string, barHours: number, now: number) {
  const hrs = hoursSince(updatedAt, now);
  const perHour = 100 / Math.max(0.1, barHours);
  const decayed = clamp(value - perHour * hrs);
  // Horas que a barra já passou em ZERO (para a janela de espera).
  const hoursAtZero = hrs - (value / perHour);
  return { value: decayed, hoursAtZero: Math.max(0, hoursAtZero) };
}

export interface PetComputed {
  hunger: number; thirst: number; interaction: number;
  /** Horas em que a barra está zerada (janela de espera). */
  hungerZeroH: number; thirstZeroH: number; interactionZeroH: number;
  hungry: boolean; thirsty: boolean; lonely: boolean;
  /** Situação sugerida a aplicar (fuga/morte/irritado/triste). */
  suggested: 'none' | 'flee' | 'die' | 'angry' | 'sad';
}

/**
 * Calcula o estado ATUAL do pet considerando o tempo decorrido (mesmo offline).
 * Se o pet estiver EQUIPADO (em batalha/ativo), as barras NÃO caem.
 */
export function computePet(pet: Pet, now = Date.now()): PetComputed {
  const lvl = RELATIONSHIP_LEVELS[Math.max(1, Math.min(5, pet.relationship))];
  if (pet.equipped || pet.state === 'dead' || pet.state === 'ran_away') {
    return {
      hunger: pet.hunger, thirst: pet.thirst, interaction: pet.interaction,
      hungerZeroH: 0, thirstZeroH: 0, interactionZeroH: 0,
      hungry: false, thirsty: false, lonely: false, suggested: 'none',
    };
  }
  const h = decayBar(pet.hunger, pet.hunger_updated_at, lvl.barHours, now);
  const t = decayBar(pet.thirst, pet.thirst_updated_at, lvl.barHours, now);
  const i = decayBar(pet.interaction, pet.interaction_updated_at, lvl.barHours, now);
  const hungry = h.value <= 0.01, thirsty = t.value <= 0.01, lonely = i.value <= 0.01;

  let suggested: PetComputed['suggested'] = 'none';
  // Fome/Sede zeradas além da janela de espera → foge ou morre.
  if (hungry && h.hoursAtZero >= lvl.waitHours) suggested = lvl.onStarve;
  else if (thirsty && t.hoursAtZero >= lvl.waitHours) suggested = lvl.onStarve;
  // Interação zerada → foge/irritado/triste.
  else if (lonely && i.hoursAtZero >= 0 && i.hoursAtZero >= 0) suggested = lvl.onInteraction === 'flee' ? 'flee' : (lvl.onInteraction === 'angry' ? 'angry' : 'sad');

  return { hunger: h.value, thirst: t.value, interaction: i.value, hungerZeroH: h.hoursAtZero, thirstZeroH: t.hoursAtZero, interactionZeroH: i.hoursAtZero, hungry, thirsty, lonely, suggested };
}

/** Carrega os pets do aluno. */
export async function fetchPets(studentId: string): Promise<Pet[]> {
  if (!studentId) return [];
  const { data } = await supabase.from('pets').select('*').eq('student_id', studentId).order('created_at', { ascending: true });
  return (data as Pet[]) || [];
}

/** Salva um pet. */
export async function savePet(pet: Pet): Promise<void> {
  const { error } = await supabase.from('pets').update({
    name: pet.name, level: pet.level, xp: pet.xp, relationship: pet.relationship,
    hunger: pet.hunger, thirst: pet.thirst, interaction: pet.interaction, training: pet.training,
    hunger_updated_at: pet.hunger_updated_at, thirst_updated_at: pet.thirst_updated_at, interaction_updated_at: pet.interaction_updated_at,
    state: pet.state, equipped: pet.equipped, stats: pet.stats, history: pet.history,
  }).eq('id', pet.id);
  if (error) throw error;
}

/** Adiciona uma entrada no histórico (conquista ou registro). */
export function withHistory(pet: Pet, type: PetHistoryEntry['type'], text: string): Pet {
  const history = [...(pet.history || []), { at: new Date().toISOString(), type, text }];
  return { ...pet, history };
}

/** Alimenta o pet: adiciona `feedHours` horas de saciedade (1 barra cheia = barHours). */
export function feedPet(pet: Pet, feedHours: number, now = Date.now()): Pet {
  const lvl = RELATIONSHIP_LEVELS[Math.max(1, Math.min(5, pet.relationship))];
  const add = (feedHours / lvl.barHours) * 100;
  const c = computePet(pet, now);
  // Se estava na janela de fome, alimentar reduz o relacionamento em 1 nível.
  let relationship = pet.relationship;
  if (c.hungry && pet.relationship >= 2) relationship = Math.max(1, pet.relationship - 1);
  const iso = new Date(now).toISOString();
  return { ...pet, hunger: clamp(c.hunger + add), relationship, hunger_updated_at: iso, state: 'ranch' };
}

/** Estado do rancho (nível de água do bebedouro, etc.). */
export async function fetchRanch(studentId: string): Promise<{ water_level: number; water_updated_at: string } | null> {
  if (!studentId) return null;
  const { data } = await supabase.from('ranches').select('*').eq('student_id', studentId).maybeSingle();
  return (data as any) || null;
}

export async function upsertRanch(studentId: string, tenantId: string | null, patch: { water_level?: number; water_updated_at?: string }): Promise<void> {
  await supabase.from('ranches').upsert({ student_id: studentId, tenant_id: tenantId, ...patch }, { onConflict: 'student_id' });
}

/** Equipamentos do rancho (cochos/palha). */
export async function fetchRanchItems(studentId: string): Promise<{ id: string; kind: string; level: number }[]> {
  if (!studentId) return [];
  const { data } = await supabase.from('ranch_items').select('*').eq('student_id', studentId);
  return (data as any[]) || [];
}

/** Tem os itens BÁSICOS para domesticar? (1 cocho de comida, 1 de água, palha) */
export function hasBasicRanch(kinds: string[]): boolean {
  return kinds.includes('food_trough') && kinds.includes('water_trough') && kinds.includes('hay');
}

// ---- BATALHAS / XP ----
/** XP necessário para o próximo nível do PET (metade da curva dos monstros). */
export function petXpToNext(level: number): number {
  return Math.round(300 * Math.max(1, level));
}

/** Equipa um pet para batalha (só um por vez). */
export async function equipPet(studentId: string, petId: string): Promise<void> {
  if (!studentId) return;
  await supabase.from('pets').update({ equipped: false, state: 'ranch' }).eq('student_id', studentId).eq('equipped', true);
  await supabase.from('pets').update({ equipped: true, state: 'equipped' }).eq('id', petId).eq('student_id', studentId);
}

/**
 * Aplica o resultado de uma batalha ao PET equipado:
 * - monstro derrotado → ganha XP (sobe de nível com curva METADE dos monstros);
 * - monstro da MESMA ESPÉCIE → perde XP; muitos abates da mesma espécie podem fazer o pet IR EMBORA (se relacionamento baixo).
 */
export function applyPetBattleResult(pet: Pet, opts: { monsterXp: number; sameSpecies: boolean }): { pet: Pet; message: string } {
  if (!pet || (pet.state !== 'ranch' && pet.state !== 'equipped')) return { pet, message: '' };
  const xp = Math.max(0, Math.round(opts.monsterXp || 0));

  if (opts.sameSpecies) {
    const stats: any = { ...(pet.stats || {}) };
    stats.sameSpeciesKills = (stats.sameSpeciesKills || 0) + 1;
    const lost = Math.max(1, Math.round(xp * 0.5));
    let newXp = pet.xp - lost; let level = pet.level;
    if (newXp < 0) { if (level > 1) { level -= 1; newXp = petXpToNext(level) + newXp; } else newXp = 0; }
    let p = withHistory({ ...pet, xp: newXp, level, stats }, 'record', `Um ${pet.species_name || 'animal'} da mesma espécie foi abatido — perdeu ${lost} XP.`);
    if (stats.sameSpeciesKills >= 5 && pet.relationship < 3 && Math.random() < (0.05 * (6 - pet.relationship))) {
      p = withHistory({ ...p, state: 'ran_away', equipped: false }, 'achievement', `Foi embora: muitos ${pet.species_name || 'animais'} da sua espécie foram abatidos e o relacionamento estava baixo.`);
      return { pet: p, message: `💔 ${pet.name || 'Seu pet'} foi embora (muitos abates da mesma espécie).` };
    }
    return { pet: p, message: `📉 ${pet.name || 'Pet'} perdeu ${lost} XP.` };
  }

  let xpAcc = pet.xp + xp; let level = pet.level; let leveled = false;
  const stats: any = { ...(pet.stats || {}) };
  while (xpAcc >= petXpToNext(level) && level < 99) {
    xpAcc -= petXpToNext(level); level++; leveled = true;
    if (stats.hp) stats.hp = Math.round(stats.hp * 1.08);
    if (stats.attack) stats.attack = Math.round(stats.attack * 1.08);
    if (stats.defense) stats.defense = Math.round(stats.defense * 1.05 + 1);
    if (stats.speed) stats.speed = Math.round(stats.speed * 1.03 * 100) / 100;
  }
  let p = { ...pet, xp: xpAcc, level, stats };
  if (leveled) p = withHistory(p, 'achievement', `Subiu para o nível ${level}!`);
  p = withHistory(p, 'record', `Ganhou ${xp} XP em batalha.`);
  return { pet: p, message: leveled ? `⬆️ ${pet.name || 'Pet'} subiu para o nível ${level}!` : `✨ ${pet.name || 'Pet'} ganhou ${xp} XP.` };
}
