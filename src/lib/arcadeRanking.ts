import { supabase } from './supabase';
import { getCurrentMonthCycle, getMonthCycleName } from './combatDamage';

export { getCurrentMonthCycle, getMonthCycleName };

export interface ArcadeScoreRankingEntry {
  studentId: string;
  studentName: string;
  characterName?: string;
  avatarConfig?: any;
  equippedItems?: any[];
  studentXp?: number;
  studentClassId?: string;
  bestScore: number;
  kills: number;
  stageReachedId?: string;
  stageReachedLabel?: string;
  completedCampaign?: boolean;
  previousRank?: number;
  timestamp: number;
}

export interface ArcadeScoreRankingData {
  monthCycle: string;
  entries: ArcadeScoreRankingEntry[];
}

export interface SaveArcadeScoreParams {
  studentId: string;
  studentName: string;
  characterName?: string;
  avatarConfig?: any;
  equippedItems?: any[];
  studentXp?: number;
  studentClassId?: string;
  score: number;
  kills: number;
  stageReachedId?: string;
  stageReachedLabel?: string;
  completedCampaign?: boolean;
  tenantId?: string | null;
}

const COLLECTION_NAME = 'arcade_score_rankings';
const DOC_ID = 'arcade_campaign_top';

export async function saveArcadeScoreRecord(params: SaveArcadeScoreParams): Promise<void> {
  if (!params.studentId || params.score <= 0) return;

  try {
    const currentCycle = getCurrentMonthCycle();
    let q = supabase
      .from('system_collections')
      .select('id, data')
      .eq('collection_name', COLLECTION_NAME)
      .eq('doc_id', DOC_ID);

    if (params.tenantId) {
      q = q.eq('tenant_id', params.tenantId);
    }

    const { data: rows } = await q.limit(1);
    let rankingData: ArcadeScoreRankingData = {
      monthCycle: currentCycle,
      entries: [],
    };
    let existingRowId: string | null = null;

    if (rows && rows.length > 0) {
      existingRowId = rows[0].id;
      const rawData = rows[0].data as ArcadeScoreRankingData;
      if (rawData?.monthCycle === currentCycle && Array.isArray(rawData.entries)) {
        rankingData = rawData;
      }
    }

    const existingIndex = rankingData.entries.findIndex(e => e.studentId === params.studentId);
    const oldRankPos = existingIndex >= 0 ? existingIndex + 1 : undefined;

    if (existingIndex >= 0) {
      const prev = rankingData.entries[existingIndex];
      const isNewRecord = params.score >= (prev.bestScore || 0);
      rankingData.entries[existingIndex] = {
        studentId: params.studentId,
        studentName: params.studentName || prev.studentName,
        characterName: params.characterName || prev.characterName || prev.studentName,
        avatarConfig: params.avatarConfig || prev.avatarConfig,
        equippedItems: (params.equippedItems && params.equippedItems.length > 0) ? params.equippedItems : (prev.equippedItems || []),
        studentXp: params.studentXp ?? prev.studentXp ?? 0,
        studentClassId: params.studentClassId || prev.studentClassId || '',
        bestScore: Math.max(prev.bestScore || 0, params.score),
        kills: isNewRecord ? Math.max(prev.kills || 0, params.kills) : (prev.kills || params.kills),
        stageReachedId: isNewRecord ? (params.stageReachedId || prev.stageReachedId) : (prev.stageReachedId || params.stageReachedId),
        stageReachedLabel: isNewRecord ? (params.stageReachedLabel || prev.stageReachedLabel) : (prev.stageReachedLabel || params.stageReachedLabel),
        completedCampaign: Boolean(prev.completedCampaign || params.completedCampaign),
        previousRank: oldRankPos ?? prev.previousRank,
        timestamp: Date.now(),
      };
    } else {
      rankingData.entries.push({
        studentId: params.studentId,
        studentName: params.studentName || 'Guerreiro',
        characterName: params.characterName || params.studentName || 'Guerreiro',
        avatarConfig: params.avatarConfig,
        equippedItems: params.equippedItems || [],
        studentXp: params.studentXp || 0,
        studentClassId: params.studentClassId || '',
        bestScore: params.score,
        kills: params.kills,
        stageReachedId: params.stageReachedId,
        stageReachedLabel: params.stageReachedLabel,
        completedCampaign: Boolean(params.completedCampaign),
        previousRank: undefined,
        timestamp: Date.now(),
      });
    }

    rankingData.entries.sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      return (b.kills || 0) - (a.kills || 0);
    });
    rankingData.entries = rankingData.entries.slice(0, 15);

    const updatedEntry = rankingData.entries.find(e => e.studentId === params.studentId);
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
          collection_name: COLLECTION_NAME,
          doc_id: DOC_ID,
          tenant_id: params.tenantId || null,
          data: rankingData,
        });
    }
  } catch (err) {
    console.error('Erro ao salvar pontuação no ranking do Arcade:', err);
  }
}

export async function fetchArcadeScoreRanking(tenantId?: string | null): Promise<ArcadeScoreRankingData> {
  const currentCycle = getCurrentMonthCycle();
  try {
    let q = supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', COLLECTION_NAME)
      .eq('doc_id', DOC_ID);

    if (tenantId) {
      q = q.eq('tenant_id', tenantId);
    }

    const { data: rows } = await q.limit(1);
    if (rows && rows.length > 0) {
      const parsed = rows[0].data as ArcadeScoreRankingData;
      if (parsed?.monthCycle === currentCycle && Array.isArray(parsed.entries)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Erro ao buscar ranking de pontuação do Arcade:', err);
  }

  return {
    monthCycle: currentCycle,
    entries: [],
  };
}
