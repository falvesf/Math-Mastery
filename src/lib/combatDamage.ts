import { supabase } from './supabase';
import { RANKS, DEFAULT_RANKS } from './ranks';
import { safeParseAvatarConfig } from '../components/AvatarCharacter';

export interface MonsterCombatStats {
  level: number;
  attack: number;
  defense: number;
  evasion: number;     // %
  critChance: number;  // %
  xp?: number;
}

export type MonsterStatsConfig = MonsterCombatStats;

export const DEFAULT_MONSTER_STATS: MonsterCombatStats = {
  level: 1,
  attack: 1,
  defense: 1,
  evasion: 1,
  critChance: 1,
  xp: 0
};

/**
 * Calcula o dano do ataque do jogador contra o monstro.
 * O poder de ataque do jogador é absorvido pela defesa do monstro.
 * Danos críticos causam o dobro de dano (2x).
 */
export function calculatePlayerHitDamage(
  playerAttack: number,
  monsterDefense: number,
  monsterEvasion: number = 0,
  isCritical: boolean = false
): { damage: number; isCritical: boolean; isCrit: boolean; isEvasion: boolean } {
  const atk = Math.max(1, Number(playerAttack) || 1);
  const def = Math.max(0, Number(monsterDefense) || 0);
  const eva = Math.max(0, Number(monsterEvasion) || 0);

  // Chance de esquiva do monstro
  if (eva > 0 && Math.random() * 100 < eva) {
    return {
      damage: 0,
      isCritical: false,
      isCrit: false,
      isEvasion: true,
    };
  }

  // Fórmula RPG balanceada de absorção: dano diminui gradualmente com a defesa
  const absorptionFactor = 100 / (100 + def * 1.5);
  let baseDamage = Math.max(1, Math.round(atk * absorptionFactor));

  if (isCritical) {
    baseDamage = baseDamage * 2;
  }

  return {
    damage: baseDamage,
    isCritical: isCritical,
    isCrit: isCritical,
    isEvasion: false,
  };
}

/**
 * Calcula o dano do ataque do monstro contra o jogador.
 * O poder de ataque do monstro é absorvido pela defesa do jogador.
 * Danos críticos causam o dobro de dano (2x).
 */
export function calculateMonsterHitDamage(
  monsterAttack: number,
  playerDefense: number,
  isCritical: boolean = false
): { damage: number; isCritical: boolean; isCrit: boolean; isEvasion: boolean } {
  const atk = Math.max(1, Number(monsterAttack) || 1);
  const def = Math.max(0, Number(playerDefense) || 0);

  const absorptionFactor = 100 / (100 + def * 1.5);
  let baseDamage = Math.max(1, Math.round(atk * absorptionFactor));

  if (isCritical) {
    baseDamage = baseDamage * 2;
  }

  return {
    damage: baseDamage,
    isCritical: isCritical,
    isCrit: isCritical,
    isEvasion: false,
  };
}

/**
 * Calcula a quantidade e a porcentagem de cura do monstro quando ele possui atributo de cura/dreno.
 * A recuperação é uma porcentagem do dano causado ao jogador e escala progressivamente com o nível do monstro.
 */
export function calculateMonsterHealFromDamage(
  damageInflicted: number,
  monsterLevel: number = 1
): { healAmount: number; healPercent: number } {
  const dmg = Math.max(1, Number(damageInflicted) || 1);
  const lvl = Math.max(1, Number(monsterLevel) || 1);

  // Nível 1: 25%, subindo 5% a cada nível (ex: Nível 5: 45%, Nível 10: 70%, Nível 16+: 100%)
  const healPercent = Math.min(100, Math.round(20 + lvl * 5));
  const rawHeal = (dmg * healPercent) / 100;
  const healAmount = Math.max(1, Math.round(rawHeal));

  return { healAmount, healPercent };
}

/**
 * Evolui o monstro quando o jogador é totalmente derrotado em missões normais.
 * - Monstro ganha 5% do XP base da missão.
 * - Compara com os limites de patentes para subir de nível.
 * - A cada nível ganho, recebe 6 pontos de estatísticas sorteados aleatoriamente entre
 *   Ataque, Defesa, Evasão e Chance de Crítico.
 */
export async function evolveMonsterOnPlayerDefeat(
  monsterPresetId?: string,
  monsterNameOrXp: string | number = 100,
  questBaseXpOrStats?: number | any,
  tenantId?: string | null
): Promise<MonsterCombatStats | null> {
  try {
    let q = supabase.from('preset_skins').select('id, name, config, tenant_id').eq('type', 'monster');
    if (monsterPresetId) {
      q = q.eq('id', monsterPresetId);
    } else if (typeof monsterNameOrXp === 'string') {
      q = q.ilike('name', monsterNameOrXp);
    } else {
      return null;
    }

    if (tenantId) {
      q = q.eq('tenant_id', tenantId);
    }

    const { data: rows, error } = await q.limit(1);
    if (error || !rows || rows.length === 0) return null;

    const monsterRow = rows[0];
    const parsedConfig = safeParseAvatarConfig(monsterRow.config) || {};
    const rawStats = (parsedConfig as any).stats || {};

    const currentStats: MonsterCombatStats = {
      level: Math.max(1, Number(rawStats.level) || 1),
      attack: Math.max(1, Number(rawStats.attack) || 1),
      defense: Math.max(1, Number(rawStats.defense) || 1),
      evasion: Math.max(0, Number(rawStats.evasion) || 1),
      critChance: Math.max(0, Number(rawStats.critChance) || 1),
      xp: Math.max(0, Number(rawStats.xp) || 0),
    };

    const questBaseXp = typeof monsterNameOrXp === 'number'
      ? monsterNameOrXp
      : (typeof questBaseXpOrStats === 'number' ? questBaseXpOrStats : 100);

    // Monstro ganha 5% da experiência definida na missão
    const gainedXp = Math.max(1, Math.round(questBaseXp * 0.05));
    const newTotalXp = (currentStats.xp ?? 0) + gainedXp;

    // Patentes de referência
    const rankList = (RANKS.length > 0 ? RANKS : DEFAULT_RANKS)
      .filter(r => r.minXp > 0)
      .sort((a, b) => a.minXp - b.minXp);

    let calculatedLevel = 1;
    for (let i = 0; i < rankList.length; i++) {
      if (newTotalXp >= rankList[i].minXp) {
        calculatedLevel = i + 2;
      } else {
        break;
      }
    }

    const levelsGained = Math.max(0, calculatedLevel - currentStats.level);
    const updatedStats: MonsterCombatStats = {
      ...currentStats,
      xp: newTotalXp,
      level: Math.max(currentStats.level, calculatedLevel),
    };

    if (levelsGained > 0) {
      const pointsToDistribute = levelsGained * 6;
      const statKeys: (keyof Pick<MonsterCombatStats, 'attack' | 'defense' | 'evasion' | 'critChance'>)[] = [
        'attack',
        'defense',
        'evasion',
        'critChance'
      ];

      for (let p = 0; p < pointsToDistribute; p++) {
        const picked = statKeys[Math.floor(Math.random() * statKeys.length)];
        updatedStats[picked] = (updatedStats[picked] || 1) + 1;
      }
    }

    (parsedConfig as any).stats = updatedStats;

    await supabase
      .from('preset_skins')
      .update({ config: JSON.stringify(parsedConfig) })
      .eq('id', monsterRow.id);

    return updatedStats;
  } catch (err) {
    console.error('Erro ao evoluir monstro:', err);
    return null;
  }
}

export interface QuestDamageRankingEntry {
  studentId: string;
  studentName: string;
  characterName?: string;
  avatarConfig?: any;
  equippedItems?: any[];
  studentXp?: number;
  studentClassId?: string;
  maxDamage: number;   // Maior golpe único desferido
  totalDamage: number; // Dano total acumulado na sessão
  previousRank?: number; // Posição anterior no ranking (para cálculo de oscilação ▲/▼)
  claimed?: boolean;   // Se a premiação deste ciclo foi resgatada
  timestamp: number;
}

export interface QuestDamageRankingData {
  monthCycle: string; // Ex: "2026-09"
  questId: string;
  entries: QuestDamageRankingEntry[];
}

export function getCurrentMonthCycle(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getMonthCycleName(cycleStr?: string): string {
  const c = cycleStr || getCurrentMonthCycle();
  const [yearStr, monthStr] = c.split('-');
  const monthIndex = parseInt(monthStr, 10) - 1;
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return `${monthNames[monthIndex] || monthStr} de ${yearStr}`;
}

export const REWARD_PERCENTAGES: Record<number, number> = {
  1: 100,
  2: 75,
  3: 50,
  4: 40,
  5: 35,
  6: 30,
  7: 25,
  8: 20,
  9: 15,
  10: 10
};

export const BASE_DAMAGE_RANKING_PRIZE = 200; // Pote base de 200 moedas por missão

export function getRankDamagePrizeCoins(rankPos: number): number {
  const pct = REWARD_PERCENTAGES[rankPos] || 10;
  return Math.round((pct / 100) * BASE_DAMAGE_RANKING_PRIZE);
}

export interface SaveQuestDamageRecordParams {
  questId: string;
  studentId: string;
  studentName: string;
  characterName?: string;
  studentAvatar?: string;
  avatarConfig?: any;
  equippedItems?: any[];
  studentXp?: number;
  studentClassId?: string;
  maxDamageHit: number;
  totalDamageDealt: number;
  tenantId?: string | null;
  weaponTitle?: string;
  criticalHitsCount?: number;
}

/**
 * Registra o dano alcançado por um aluno nesta missão no ranking Top 10 mensal.
 */
export async function saveQuestDamageRecord(
  questIdOrParams: string | SaveQuestDamageRecordParams,
  student?: { uid: string; name: string; avatarConfig?: any },
  maxHitDamage?: number,
  totalDamage?: number,
  tenantId?: string | null
): Promise<void> {
  let questId = '';
  let studentId = '';
  let studentName = 'Guerreiro';
  let characterName = 'Guerreiro';
  let studentAvatar = '';
  let avatarConfig: any = null;
  let equippedItems: any[] = [];
  let studentXp = 0;
  let studentClassId = '';
  let maxHit = 0;
  let totDamage = 0;
  let tId: string | null = null;

  if (typeof questIdOrParams === 'string') {
    questId = questIdOrParams;
    studentId = student?.uid || '';
    studentName = student?.name || 'Guerreiro';
    characterName = studentName;
    avatarConfig = student?.avatarConfig;
    maxHit = maxHitDamage || 0;
    totDamage = totalDamage || 0;
    tId = tenantId || null;
  } else if (questIdOrParams && typeof questIdOrParams === 'object') {
    questId = questIdOrParams.questId;
    studentId = questIdOrParams.studentId;
    studentName = questIdOrParams.studentName || 'Guerreiro';
    characterName = questIdOrParams.characterName || studentName;
    studentAvatar = questIdOrParams.studentAvatar || '';
    avatarConfig = questIdOrParams.avatarConfig;
    equippedItems = questIdOrParams.equippedItems || [];
    studentXp = questIdOrParams.studentXp || 0;
    studentClassId = questIdOrParams.studentClassId || '';
    maxHit = questIdOrParams.maxDamageHit;
    totDamage = questIdOrParams.totalDamageDealt;
    tId = questIdOrParams.tenantId || null;
  }

  if (!questId || !studentId || maxHit <= 0) return;

  try {
    const currentCycle = getCurrentMonthCycle();
    const docId = `ranking_${questId}`;

    let q = supabase
      .from('system_collections')
      .select('id, data')
      .eq('collection_name', 'quest_damage_rankings')
      .eq('doc_id', docId);

    if (tId) {
      q = q.eq('tenant_id', tId);
    }

    const { data: rows } = await q.limit(1);
    let rankingData: QuestDamageRankingData = {
      monthCycle: currentCycle,
      questId,
      entries: []
    };
    let existingRowId: string | null = null;

    if (rows && rows.length > 0) {
      existingRowId = rows[0].id;
      const rawData = rows[0].data as QuestDamageRankingData;
      if (rawData?.monthCycle === currentCycle && Array.isArray(rawData.entries)) {
        rankingData = rawData;
      }
    }

    // Procura registro prévio do aluno no ciclo atual
    const existingIndex = rankingData.entries.findIndex(e => e.studentId === studentId);
    const oldRankPos = existingIndex >= 0 ? existingIndex + 1 : undefined;

    if (existingIndex >= 0) {
      const prev = rankingData.entries[existingIndex];
      rankingData.entries[existingIndex] = {
        studentId,
        studentName: studentName || prev.studentName,
        characterName: characterName || prev.characterName || prev.studentName,
        avatarConfig: avatarConfig || prev.avatarConfig || (studentAvatar ? { photoURL: studentAvatar } : undefined),
        equippedItems: equippedItems.length > 0 ? equippedItems : (prev.equippedItems || []),
        studentXp: studentXp || prev.studentXp || 0,
        studentClassId: studentClassId || prev.studentClassId || '',
        maxDamage: Math.max(prev.maxDamage || 0, maxHit),
        totalDamage: Math.max(prev.totalDamage || 0, totDamage),
        previousRank: oldRankPos ?? prev.previousRank,
        claimed: prev.claimed || false,
        timestamp: Date.now()
      };
    } else {
      rankingData.entries.push({
        studentId,
        studentName,
        characterName,
        avatarConfig: avatarConfig || (studentAvatar ? { photoURL: studentAvatar } : undefined),
        equippedItems,
        studentXp,
        studentClassId,
        maxDamage: maxHit,
        totalDamage: totDamage,
        previousRank: undefined,
        claimed: false,
        timestamp: Date.now()
      });
    }

    // Ordena do maior dano para o menor e mantém o Top 10
    rankingData.entries.sort((a, b) => {
      if (b.maxDamage !== a.maxDamage) return b.maxDamage - a.maxDamage;
      return b.totalDamage - a.totalDamage;
    });
    rankingData.entries = rankingData.entries.slice(0, 10);

    // Garante que o previousRank esteja registrado caso o aluno tenha subido/descido
    const updatedEntry = rankingData.entries.find(e => e.studentId === studentId);
    if (updatedEntry && oldRankPos !== undefined && updatedEntry.previousRank === undefined) {
      updatedEntry.previousRank = oldRankPos;
    }

    if (existingRowId) {
      await supabase
        .from('system_collections')
        .update({ data: rankingData })
        .eq('id', existingRowId);
    } else {
      await supabase
        .from('system_collections')
        .insert({
          collection_name: 'quest_damage_rankings',
          doc_id: docId,
          tenant_id: tId,
          data: rankingData
        });
    }
  } catch (err) {
    console.error('Erro ao salvar recorde de dano no ranking:', err);
  }
}

/**
 * Busca o Top 10 de danos desferidos no monstro da missão no ciclo mensal atual.
 */
export async function fetchQuestDamageRanking(
  questId: string,
  tenantId?: string | null
): Promise<QuestDamageRankingData> {
  const currentCycle = getCurrentMonthCycle();
  const docId = `ranking_${questId}`;

  try {
    let q = supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', 'quest_damage_rankings')
      .eq('doc_id', docId);

    if (tenantId) {
      q = q.eq('tenant_id', tenantId);
    }

    const { data: rows } = await q.limit(1);
    if (rows && rows.length > 0) {
      const parsed = rows[0].data as QuestDamageRankingData;
      if (parsed?.monthCycle === currentCycle && Array.isArray(parsed.entries)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Erro ao buscar ranking de dano da missão:', err);
  }

  return {
    monthCycle: currentCycle,
    questId,
    entries: []
  };
}

/**
 * Verifica e resgata automaticamente recompensas de ciclos de ranking passados para o aluno.
 * Se o aluno se classificou no Top 10 de dano em um ciclo concluído e ainda não recebeu,
 * credita as moedas diretamente na conta dele.
 */
export async function checkAndClaimMonthlyDamageRewards(
  studentId: string,
  tenantId?: string | null
): Promise<{
  claimed: boolean;
  totalCoins: number;
  items: Array<{ questId: string; rankPos: number; coins: number; monthCycle: string }>;
}> {
  if (!studentId) return { claimed: false, totalCoins: 0, items: [] };

  const currentCycle = getCurrentMonthCycle();
  let totalCoins = 0;
  const items: Array<{ questId: string; rankPos: number; coins: number; monthCycle: string }> = [];

  try {
    let q = supabase
      .from('system_collections')
      .select('id, data')
      .eq('collection_name', 'quest_damage_rankings');

    if (tenantId) {
      q = q.eq('tenant_id', tenantId);
    }

    const { data: rows, error } = await q;
    if (error || !rows) return { claimed: false, totalCoins: 0, items: [] };

    for (const row of rows) {
      const data = row.data as QuestDamageRankingData;
      // Considera apenas ciclos anteriores ao atual
      if (data?.monthCycle && data.monthCycle < currentCycle && Array.isArray(data.entries)) {
        let docModified = false;
        data.entries.slice(0, 10).forEach((entry, idx) => {
          if (entry.studentId === studentId && !entry.claimed) {
            const rankPos = idx + 1;
            const coins = getRankDamagePrizeCoins(rankPos);
            entry.claimed = true;
            docModified = true;
            totalCoins += coins;
            items.push({
              questId: data.questId,
              rankPos,
              coins,
              monthCycle: data.monthCycle
            });
          }
        });

        if (docModified) {
          await supabase
            .from('system_collections')
            .update({ data })
            .eq('id', row.id);
        }
      }
    }

    // Se houve premiação a creditar, atualiza a quantidade de moedas do aluno
    if (totalCoins > 0) {
      const { data: userRow } = await supabase
        .from('users')
        .select('coins')
        .eq('id', studentId)
        .single();
      const currentCoins = userRow?.coins || 0;
      await supabase
        .from('users')
        .update({ coins: currentCoins + totalCoins })
        .eq('id', studentId);

      return { claimed: true, totalCoins, items };
    }
  } catch (err) {
    console.error('Erro ao resgatar recompensas de ciclo de dano:', err);
  }

  return { claimed: false, totalCoins: 0, items: [] };
}
