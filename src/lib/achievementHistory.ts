import { supabase } from './supabase';
import { fetchBlacksmithMilestones, recordForgeMilestone, recordTransmuteMilestone } from './blacksmithAchievements';
import type { BestiaryMonsterData } from '../components/MonsterBestiaryModal';

export interface PvpHistoryEntry {
  id: string;
  won: boolean;
  draw: boolean;
  opponentName: string;
  dateStr: string;
  timestamp: number;
  score: string;
  prizeText?: string;
  prizeType: 'coins_win' | 'coins_lose' | 'item_win' | 'item_lose' | 'refund' | 'none';
}

export interface AchievementItem {
  id: string;
  type: 'rank_up' | 'quest' | 'item' | 'teacher_xp' | 'pvp' | 'forge' | 'bestiary';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badgeText: string;
  badgeType: 'rank' | 'xp_positive' | 'xp_negative' | 'item_spent' | 'item_received';
  timestamp: number; // in milliseconds
  rawDate: string;
  /** Histórico completo de PvP (se houver, para compatibilidade) */
  pvpDetails?: PvpHistoryEntry[];
  /** Indica se é uma conquista de marco histórico único (ex: Primeira Vitória em PvP, Primeira Forja, etc.) */
  isSpecialMilestone?: boolean;
  /** Dados completos para exibição no modal do Bestiário */
  bestiaryData?: BestiaryMonsterData;
  /** Quantidade agrupada para o log de atividades */
  count?: number;
}

/**
 * Busca o Histórico de CONQUISTAS REAIS do aluno.
 * Regras Estritas:
 * 1. Patentes: subidas de patente válidas.
 * 2. Missões: apenas a 1ª conclusão com sucesso e ganho real de XP (earned_xp > 0). Repetições e +0 XP descartados.
 * 3. Bestiário: 1ª vitória contra cada monstro único, desbloqueando a criatura no Bestiário.
 * 4. Drops de Monstros: 1º drop de cada item por monstros ("Em batalha contra X, obteve pela primeira vez Y").
 * 5. Loja Oficial: apenas o 1º item adquirido na loja.
 * 6. Bazar: 1º anúncio colocado e 1ª venda realizada.
 * 7. Presentes: 1º presente recebido e 1º presente enviado.
 * 8. Ferreiro: 1ª Forja com Sucesso, 1º Item +9, 1ª Transmutação.
 * 9. PvP: 1ª Vitória em PvP.
 */
export async function fetchStudentAchievementHistory(studentUid: string, _tenantId?: string): Promise<AchievementItem[]> {
  const achievements: AchievementItem[] = [];

  try {
    // 1. Busca dados do usuário (XP, patentes, etc.)
    const { data: user } = await supabase.from('users').select('*').eq('id', studentUid).single();

    // 2. Busca tentativas de missões (quest_attempts) ordenadas cronologicamente
    const { data: attempts } = await supabase
      .from('quest_attempts')
      .select('*')
      .eq('student_id', studentUid)
      .order('created_at', { ascending: true });

    // 3. Busca itens do inventário (user_items) ordenados cronologicamente
    const { data: userItems } = await supabase
      .from('user_items')
      .select('*')
      .eq('student_id', studentUid)
      .order('created_at', { ascending: true });

    // 4. Busca lançamentos manuais do professor (xp_logs)
    const { data: teacherLogs } = await supabase
      .from('xp_logs')
      .select('*')
      .eq('student_id', studentUid)
      .order('created_at', { ascending: false });

    // 5. Mapeamento dos metadados das missões
    const questIds = Array.from(new Set((attempts || []).map((a: any) => a.quest_id).filter(Boolean)));
    const questMap = new Map<string, any>();

    if (questIds.length > 0) {
      const { data: questsData } = await supabase.from('quests').select('*').in('id', questIds);
      if (questsData) {
        questsData.forEach((q: any) => {
          questMap.set(q.id, q);
        });
      }
    }

    // --- 1. PROCESSAR MISSÕES CONCLUÍDAS (Apenas 1ª Conclusão com XP > 0) ---
    const completedQuestsSet = new Set<string>();
    (attempts || []).forEach((att: any) => {
      const q = questMap.get(att.quest_id);
      const questTitle = q?.title || att.data?.questTitle || att.data?.title || att.quest_title || 'Missão';
      const isCompleted = att.status === 'completed';
      const earnedXp = att.data?.earned_xp ?? att.data?.earnedXp ?? att.xp_earned ?? 0;
      const isLive = att.data?.isLiveQuest || att.data?.is_live_quest;
      const dateStr = att.created_at || att.completed_at || new Date().toISOString();
      const timeMs = new Date(dateStr).getTime();

      // REGRA: Só registra se terminou com sucesso, ganhou XP (> 0) e é a primeira vez desta missão!
      if (isCompleted && earnedXp > 0 && att.quest_id && !completedQuestsSet.has(att.quest_id)) {
        completedQuestsSet.add(att.quest_id);
        achievements.push({
          id: `quest-${att.id || timeMs}`,
          type: 'quest',
          title: `Completou a Missão: ${questTitle}`,
          subtitle: isLive ? 'Modo Arena Ao Vivo' : 'Missão Individual',
          imageUrl: q?.coverImageUrl || '',
          badgeText: `+${earnedXp} XP`,
          badgeType: 'xp_positive',
          timestamp: timeMs,
          rawDate: dateStr
        });
      }
    });

    // --- 2. BESTIÁRIO: 1ª VITÓRIA CONTRA CADA MONSTRO ÚNICO ---
    const defeatedMonstersMap = new Map<string, {
      firstTimeMs: number;
      firstDateStr: string;
      questTitle: string;
      questObj: any;
      wins: number;
      defeats: number;
    }>();

    (attempts || []).forEach((att: any) => {
      const q = questMap.get(att.quest_id);
      const rawMonsterName = q?.monsterName || q?.data?.monsterName || (att.data?.monsterName);
      if (!rawMonsterName || rawMonsterName.trim() === '') return;
      const monsterName = rawMonsterName.trim();

      const existing = defeatedMonstersMap.get(monsterName) || {
        firstTimeMs: 0,
        firstDateStr: '',
        questTitle: q?.title || 'Missão',
        questObj: q,
        wins: 0,
        defeats: 0
      };

      if (att.status === 'completed') {
        existing.wins++;
        const timeMs = new Date(att.created_at || att.completed_at || Date.now()).getTime();
        if (existing.firstTimeMs === 0 || timeMs < existing.firstTimeMs) {
          existing.firstTimeMs = timeMs;
          existing.firstDateStr = att.created_at || att.completed_at || new Date().toISOString();
          existing.questTitle = q?.title || 'Missão';
          existing.questObj = q;
        }
      } else if (att.status === 'failed') {
        existing.defeats++;
      }

      defeatedMonstersMap.set(monsterName, existing);
    });

    // Busca presets de monstros para enriquecer biografia e drops no Bestiário
    let monsterPresets: any[] = [];
    try {
      const { data: mData } = await supabase.from('preset_skins').select('*').eq('type', 'monster');
      if (mData) monsterPresets = mData;
    } catch (_) {}

    // Drops obtidos pelo aluno para cruzar com o Bestiário
    const studentDroppedItemIds = new Set<string>();
    (userItems || []).forEach((itemDoc: any) => {
      const gifted = itemDoc.data?.giftedBy || itemDoc.gifted_by || '';
      if (gifted.includes('Drop de Monstro') && itemDoc.item_id) {
        studentDroppedItemIds.add(itemDoc.item_id);
      }
    });

    defeatedMonstersMap.forEach((data, monsterName) => {
      if (data.firstTimeMs > 0) {
        const preset = monsterPresets.find(p => p.name?.trim().toLowerCase() === monsterName.toLowerCase());
        const presetConfig = preset?.config ? (typeof preset.config === 'string' ? JSON.parse(preset.config) : preset.config) : null;
        
        // Drops possíveis: do preset ou da quest
        const possibleDrops: any[] = presetConfig?.drops || data.questObj?.monsterDrops || [];
        const bio = presetConfig?.biography || data.questObj?.monsterBiography || '';

        achievements.push({
          id: `bestiary-${monsterName}`,
          type: 'bestiary',
          isSpecialMilestone: true,
          title: `Derrotou pela primeira vez: ${monsterName}`,
          subtitle: `Desbloqueou no Bestiário na missão "${data.questTitle}"`,
          imageUrl: preset?.url || data.questObj?.coverImageUrl || '',
          badgeText: '👾 Bestiário',
          badgeType: 'rank',
          timestamp: data.firstTimeMs,
          rawDate: data.firstDateStr,
          bestiaryData: {
            monsterName,
            coverImageUrl: preset?.url || data.questObj?.coverImageUrl || '',
            avatarConfig: data.questObj?.monsterAvatarConfig || presetConfig,
            modelUrl: data.questObj?.monsterModelUrl || preset?.baseModelId,
            possibleDrops,
            biography: bio,
            firstDefeatedAt: data.firstDateStr,
            winsCount: data.wins,
            defeatsCount: data.defeats,
            discoveredDropItemIds: Array.from(studentDroppedItemIds)
          }
        });
      }
    });

    // --- 3. DROPS DE MONSTROS (Apenas 1º drop de cada item em combate) ---
    const discoveredDropsMap = new Map<string, any>();
    (userItems || []).forEach((itemDoc: any) => {
      const data = itemDoc.data || {};
      const gifted = data.giftedBy || itemDoc.gifted_by || '';
      if (gifted.includes('Drop de Monstro')) {
        const itemKey = itemDoc.item_id || data.itemTitle || 'Item';
        if (!discoveredDropsMap.has(itemKey)) {
          discoveredDropsMap.set(itemKey, itemDoc);
        }
      }
    });

    discoveredDropsMap.forEach((itemDoc) => {
      const data = itemDoc.data || {};
      const itemTitle = data.itemTitle || itemDoc.item_title || 'Item';
      const itemImage = data.itemImageUrl || data.imageUrl || itemDoc.item_image_url || '';
      const gifted = data.giftedBy || itemDoc.gifted_by || '';
      const match = gifted.match(/Drop de Monstro \((.+)\)/);
      const monsterName = match ? match[1] : 'Monstro';
      const dateStr = data.purchasedAt ? new Date(data.purchasedAt).toISOString() : (itemDoc.created_at || new Date().toISOString());
      const timeMs = new Date(dateStr).getTime();

      achievements.push({
        id: `drop-${itemDoc.id || timeMs}`,
        type: 'item',
        isSpecialMilestone: true,
        title: `Em batalha contra ${monsterName}, obteve pela primeira vez ${itemTitle}`,
        subtitle: `Espólio de combate conquistado contra ${monsterName}`,
        imageUrl: itemImage,
        badgeText: '⚔️ 1º Drop',
        badgeType: 'item_received',
        timestamp: timeMs,
        rawDate: dateStr
      });
    });

    // --- 4. PRIMEIRO ITEM ADQUIRIDO NA LOJA OFICIAL ---
    const shopItems = (userItems || []).filter((itemDoc: any) => {
      const data = itemDoc.data || {};
      const gifted = data.giftedBy || itemDoc.gifted_by;
      const forSale = data.forSale || itemDoc.for_sale;
      return !gifted && !forSale;
    });

    if (shopItems.length > 0) {
      const firstShopItem = shopItems[0];
      const data = firstShopItem.data || {};
      const itemTitle = data.itemTitle || firstShopItem.item_title || 'Item';
      const itemImage = data.itemImageUrl || data.imageUrl || firstShopItem.item_image_url || '';
      const dateStr = data.purchasedAt ? new Date(data.purchasedAt).toISOString() : (firstShopItem.created_at || new Date().toISOString());
      const timeMs = new Date(dateStr).getTime();

      achievements.push({
        id: `first-shop-item-${firstShopItem.id || timeMs}`,
        type: 'item',
        isSpecialMilestone: true,
        title: 'Primeiro Item Adquirido na Loja',
        subtitle: `Comprou ${itemTitle} na Loja Oficial`,
        imageUrl: itemImage,
        badgeText: '🛒 1ª Compra',
        badgeType: 'item_received',
        timestamp: timeMs,
        rawDate: dateStr
      });
    }

    // --- 5. PRESENTES (1º Recebido e 1º Enviado) ---
    const receivedGifts = (userItems || []).filter((itemDoc: any) => {
      const data = itemDoc.data || {};
      const gifted = data.giftedBy || itemDoc.gifted_by;
      return gifted && !gifted.includes('Drop de Monstro') && !gifted.includes('Baú do Desafio') && !gifted.includes('Recompensa');
    });

    if (receivedGifts.length > 0) {
      const firstGift = receivedGifts[0];
      const data = firstGift.data || {};
      const itemTitle = data.itemTitle || firstGift.item_title || 'Item';
      const itemImage = data.itemImageUrl || data.imageUrl || firstGift.item_image_url || '';
      const senderName = data.giftedBy || firstGift.gifted_by || 'Colega';
      const dateStr = data.purchasedAt ? new Date(data.purchasedAt).toISOString() : (firstGift.created_at || new Date().toISOString());
      const timeMs = new Date(dateStr).getTime();

      achievements.push({
        id: `first-gift-received-${firstGift.id || timeMs}`,
        type: 'item',
        isSpecialMilestone: true,
        title: 'Primeiro Presente Recebido',
        subtitle: `Recebeu ${itemTitle} de presente de ${senderName}`,
        imageUrl: itemImage,
        badgeText: '🎁 1º Presente',
        badgeType: 'item_received',
        timestamp: timeMs,
        rawDate: dateStr
      });
    }

    // Primeiro presente enviado (gravado em preferências ou no perfil)
    const firstGiftSent = user?.inventory_preferences?.firstGiftSent;
    if (firstGiftSent) {
      achievements.push({
        id: 'first-gift-sent',
        type: 'item',
        isSpecialMilestone: true,
        title: 'Primeiro Presente Enviado',
        subtitle: `Presenteou ${firstGiftSent.recipientName || 'um amigo'} com ${firstGiftSent.itemTitle || 'um item'}`,
        imageUrl: firstGiftSent.itemImageUrl || '',
        badgeText: '🎁 Presenteou',
        badgeType: 'item_spent',
        timestamp: firstGiftSent.timestamp || Date.now(),
        rawDate: firstGiftSent.dateStr || new Date().toISOString()
      });
    }

    // --- 6. BAZAR (1º Anúncio e 1ª Venda) ---
    const firstBazarListing = user?.inventory_preferences?.firstBazarListing;
    if (firstBazarListing) {
      achievements.push({
        id: 'first-bazar-listing',
        type: 'item',
        isSpecialMilestone: true,
        title: 'Primeiro Item Anunciado no Bazar',
        subtitle: `Colocou ${firstBazarListing.itemTitle || 'um item'} à venda no Bazar de Jogadores`,
        imageUrl: firstBazarListing.itemImageUrl || '',
        badgeText: '🏷️ 1º Anúncio',
        badgeType: 'rank',
        timestamp: firstBazarListing.timestamp || Date.now(),
        rawDate: firstBazarListing.dateStr || new Date().toISOString()
      });
    } else {
      // Retroativo: verifica se o aluno já colocou algum item à venda
      const forSaleItem = (userItems || []).find((i: any) => i.data?.forSale);
      if (forSaleItem) {
        const data = forSaleItem.data || {};
        const dateStr = forSaleItem.created_at || new Date().toISOString();
        achievements.push({
          id: 'first-bazar-listing',
          type: 'item',
          isSpecialMilestone: true,
          title: 'Primeiro Item Anunciado no Bazar',
          subtitle: `Colocou ${data.itemTitle || 'um item'} à venda no Bazar de Jogadores`,
          imageUrl: data.itemImageUrl || '',
          badgeText: '🏷️ 1º Anúncio',
          badgeType: 'rank',
          timestamp: new Date(dateStr).getTime(),
          rawDate: dateStr
        });
      }
    }

    const firstBazarSale = user?.inventory_preferences?.firstBazarSale;
    if (firstBazarSale) {
      achievements.push({
        id: 'first-bazar-sale',
        type: 'item',
        isSpecialMilestone: true,
        title: 'Primeira Venda no Bazar',
        subtitle: `Vendeu com sucesso ${firstBazarSale.itemTitle || 'um item'} para outro jogador`,
        imageUrl: firstBazarSale.itemImageUrl || '',
        badgeText: '💰 1ª Venda',
        badgeType: 'xp_positive',
        timestamp: firstBazarSale.timestamp || Date.now(),
        rawDate: firstBazarSale.dateStr || new Date().toISOString()
      });
    }

    // --- 7. LANÇAMENTOS DO PROFESSOR (XP_LOGS) ---
    (teacherLogs || []).forEach((log: any) => {
      const evalName = log.eval_name || log.reason || 'Atribuição';
      if (evalName.startsWith('Missão:') || evalName.startsWith('Subiu de Patente:') || evalName.startsWith('Compra na Loja:')) {
        return;
      }

      const xpGained = log.xp_gained !== undefined ? log.xp_gained : (log.amount || 0);
      const justification = log.justification || '';
      const dateStr = log.created_at || new Date().toISOString();
      const timeMs = new Date(dateStr).getTime();

      achievements.push({
        id: `teacher-${log.id || timeMs}`,
        type: 'teacher_xp',
        title: `Lançamento do Professor: ${evalName}`,
        subtitle: justification ? `Justificativa: ${justification}` : undefined,
        imageUrl: log.image_url || log.imageUrl || '',
        badgeText: xpGained >= 0 ? `+${xpGained} XP` : `${xpGained} XP`,
        badgeType: xpGained >= 0 ? 'xp_positive' : 'xp_negative',
        timestamp: timeMs,
        rawDate: dateStr
      });
    });

    // --- 8. SUBIDAS DE PATENTE ---
    if (user) {
      let schoolRanks: any[] = [];
      if (user.tenant_id) {
        const { data: rankRows } = await supabase
          .from('custom_ranks')
          .select('*')
          .eq('tenant_id', user.tenant_id)
          .eq('is_global', false)
          .order('minXp', { ascending: true });
        schoolRanks = (rankRows || []).map((d: any) => ({
          ...d,
          hideFromHistory: d.hide_from_history ?? d.hideFromHistory ?? (d.minXp === 0),
        }));
      }
      if (schoolRanks.length === 0) {
        const { data: gRows } = await supabase
          .from('custom_ranks')
          .select('*')
          .eq('is_global', true)
          .order('minXp', { ascending: true });
        schoolRanks = (gRows || []).map((d: any) => ({
          ...d,
          hideFromHistory: d.hide_from_history ?? d.hideFromHistory ?? (d.minXp === 0),
        }));
      }

      const userXp = user.xp || 0;
      let currentRankIdx = 0;
      for (let i = 0; i < schoolRanks.length; i++) {
        if (userXp >= (schoolRanks[i].minXp || 0)) currentRankIdx = i;
        else break;
      }
      const highestIdx = Math.max(currentRankIdx, user.inventoryPreferences?.highestRankIndex || 0);

      for (let i = 0; i <= highestIdx; i++) {
        const rank = schoolRanks[i];
        if (!rank) continue;
        if (rank.hideFromHistory || (rank.minXp === 0 && rank.hideFromHistory !== false)) continue;

        const userCreatedMs = user.created_at ? new Date(user.created_at).getTime() : Date.now() - 86400000;
        const rankTimestamp = userCreatedMs + (i * 1000);

        achievements.push({
          id: `rank-${rank.name}-${i}`,
          type: 'rank_up',
          title: `Alcançou a patente ${rank.name}`,
          subtitle: `Meta atingida (${rank.minXp} XP)`,
          imageUrl: rank.imageUrl || '',
          badgeText: rank.name,
          badgeType: 'rank',
          timestamp: rankTimestamp,
          rawDate: new Date(rankTimestamp).toISOString()
        });
      }
    }

    // --- 9. PVP: PRIMEIRA VITÓRIA EM PVP ---
    try {
      const { data: pvpMatches } = await supabase
        .from('pvp_matches')
        .select('*')
        .or(`challenger_id.eq.${studentUid},opponent_id.eq.${studentUid}`)
        .eq('status', 'finished')
        .order('finished_at', { ascending: true });

      const firstWin = (pvpMatches || []).find((m: any) => m.winner_id === studentUid);
      if (firstWin) {
        const role = firstWin.challenger_id === studentUid ? 'challenger' : 'opponent';
        const oppName = role === 'challenger' ? firstWin.opponent_name || 'Oponente' : firstWin.challenger_name || 'Oponente';
        const myScore = role === 'challenger' ? firstWin.player1?.score : firstWin.player2?.score;
        const oppScore = role === 'challenger' ? firstWin.player2?.score : firstWin.player1?.score;
        const dateStr = firstWin.finished_at || firstWin.created_at || new Date().toISOString();

        achievements.push({
          id: 'pvp-first-win',
          type: 'pvp',
          isSpecialMilestone: true,
          title: 'Primeira Vitória em PvP',
          subtitle: `Vitória histórica contra ${oppName} · Placar: ${myScore ?? 0} × ${oppScore ?? 0}`,
          badgeText: '🏆 1ª Vitória',
          badgeType: 'xp_positive',
          timestamp: new Date(dateStr).getTime(),
          rawDate: dateStr,
        });
      }
    } catch (e) {
      console.error('Erro ao buscar primeira vitória em PvP:', e);
    }

    // --- 10. FERREIRO: PRIMEIRA FORJA, +9 E TRANSMUTAÇÃO ---
    try {
      const milestones = await fetchBlacksmithMilestones(studentUid);

      if (milestones?.firstForge) {
        achievements.push({
          id: 'forge-first-success',
          type: 'forge',
          isSpecialMilestone: true,
          title: 'Primeira Forja com Sucesso',
          subtitle: `Aprimorou com sucesso ${milestones.firstForge.itemTitle} para +${milestones.firstForge.level}`,
          imageUrl: milestones.firstForge.imageUrl || '',
          badgeText: '🔨 1ª Forja',
          badgeType: 'xp_positive',
          timestamp: milestones.firstForge.timestamp,
          rawDate: milestones.firstForge.dateStr,
        });
      } else {
        const forgedItems = (userItems || []).filter((i: any) => (i.data?.forgeLevel || 0) > 0);
        if (forgedItems.length > 0) {
          const oldest = forgedItems[0];
          const dateStr = oldest.data?.purchasedAt || oldest.created_at || new Date().toISOString();
          const timeMs = new Date(dateStr).getTime();
          const title = oldest.data?.itemTitle || oldest.item_title || 'Equipamento';
          const lvl = oldest.data?.forgeLevel || 1;
          achievements.push({
            id: 'forge-first-success',
            type: 'forge',
            isSpecialMilestone: true,
            title: 'Primeira Forja com Sucesso',
            subtitle: `Aprimorou com sucesso ${title} para +${lvl}`,
            imageUrl: oldest.data?.itemImageUrl || oldest.data?.imageUrl || '',
            badgeText: '🔨 1ª Forja',
            badgeType: 'xp_positive',
            timestamp: timeMs,
            rawDate: dateStr,
          });
          recordForgeMilestone(studentUid, { itemTitle: title, level: lvl, imageUrl: oldest.data?.itemImageUrl }).catch(() => {});
        }
      }

      if (milestones?.firstPlusNine) {
        achievements.push({
          id: 'forge-first-plus-nine',
          type: 'forge',
          isSpecialMilestone: true,
          title: 'Primeiro Item +9 na Forja',
          subtitle: `Alcançou o nível máximo de forja (+9) em ${milestones.firstPlusNine.itemTitle}!`,
          imageUrl: milestones.firstPlusNine.imageUrl || '',
          badgeText: '🔥 Forja +9',
          badgeType: 'xp_positive',
          timestamp: milestones.firstPlusNine.timestamp,
          rawDate: milestones.firstPlusNine.dateStr,
        });
      } else {
        const plusNineItems = (userItems || []).filter((i: any) => (i.data?.forgeLevel || 0) >= 9);
        if (plusNineItems.length > 0) {
          const item9 = plusNineItems[0];
          const dateStr = item9.data?.purchasedAt || item9.created_at || new Date().toISOString();
          const timeMs = new Date(dateStr).getTime();
          const title = item9.data?.itemTitle || item9.item_title || 'Equipamento';
          achievements.push({
            id: 'forge-first-plus-nine',
            type: 'forge',
            isSpecialMilestone: true,
            title: 'Primeiro Item +9 na Forja',
            subtitle: `Alcançou o nível máximo de forja (+9) em ${title}!`,
            imageUrl: item9.data?.itemImageUrl || item9.data?.imageUrl || '',
            badgeText: '🔥 Forja +9',
            badgeType: 'xp_positive',
            timestamp: timeMs,
            rawDate: dateStr,
          });
          recordForgeMilestone(studentUid, { itemTitle: title, level: 9, imageUrl: item9.data?.itemImageUrl }).catch(() => {});
        }
      }

      if (milestones?.firstTransmute) {
        achievements.push({
          id: 'forge-first-transmute',
          type: 'forge',
          isSpecialMilestone: true,
          title: 'Primeira Transmutação com Sucesso',
          subtitle: `Transformou ${milestones.firstTransmute.sourceTitle} em ${milestones.firstTransmute.resultTitle}`,
          imageUrl: milestones.firstTransmute.resultImageUrl || milestones.firstTransmute.sourceImageUrl || '',
          badgeText: '✨ 1ª Transmutação',
          badgeType: 'rank',
          timestamp: milestones.firstTransmute.timestamp,
          rawDate: milestones.firstTransmute.dateStr,
        });
      } else {
        const transmutedItems = (userItems || []).filter((i: any) => i.data?.isTransmuted);
        if (transmutedItems.length > 0) {
          const oldestT = transmutedItems[0];
          const dateStr = oldestT.data?.purchasedAt || oldestT.created_at || new Date().toISOString();
          const timeMs = new Date(dateStr).getTime();
          const resTitle = oldestT.data?.itemTitle || oldestT.item_title || 'Item Transmutado';
          
          let srcTitle = 'Arma +9';
          try {
            const { data: storeSources } = await supabase.from('store_items').select('id, name, data');
            const matchSource = (storeSources || []).find((s: any) => s.data?.transmuteConfig?.resultItemId === oldestT.item_id);
            if (matchSource?.name || matchSource?.data?.title) {
              srcTitle = `${matchSource.name || matchSource.data.title} +9`;
            }
          } catch (_) {}

          achievements.push({
            id: 'forge-first-transmute',
            type: 'forge',
            isSpecialMilestone: true,
            title: 'Primeira Transmutação com Sucesso',
            subtitle: `Transformou ${srcTitle} em ${resTitle}`,
            imageUrl: oldestT.data?.itemImageUrl || oldestT.data?.imageUrl || '',
            badgeText: '✨ 1ª Transmutação',
            badgeType: 'rank',
            timestamp: timeMs,
            rawDate: dateStr,
          });
          recordTransmuteMilestone(studentUid, {
            sourceTitle: srcTitle,
            resultTitle: resTitle,
            sourceImageUrl: '',
            resultImageUrl: oldestT.data?.itemImageUrl,
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('Erro ao processar conquistas do ferreiro:', e);
    }

    // Ordenar todas as conquistas em ordem cronológica decrescente (mais recente primeiro)
    achievements.sort((a, b) => b.timestamp - a.timestamp);

  } catch (err) {
    console.error("Erro ao buscar histórico de conquistas do aluno:", err);
  }

  return achievements;
}

/**
 * Busca o LOG COMPLETO DE ATIVIDADES E PROGRESSÃO do aluno.
 * Aplica o AGRUPAMENTO INTELIGENTE solicitado:
 * - Se comprou/adquiriu 10x Poção da Vida no mesmo minuto/lote, agrupa em um único card:
 *   "Adquiriu 10x Poção da Vida"
 */
export async function fetchStudentActivityLog(studentUid: string): Promise<AchievementItem[]> {
  const logItems: AchievementItem[] = [];

  try {
    const { data: userItems } = await supabase
      .from('user_items')
      .select('*')
      .eq('student_id', studentUid)
      .order('created_at', { ascending: false });

    const { data: attempts } = await supabase
      .from('quest_attempts')
      .select('*')
      .eq('student_id', studentUid)
      .order('created_at', { ascending: false });

    const { data: teacherLogs } = await supabase
      .from('xp_logs')
      .select('*')
      .eq('student_id', studentUid)
      .order('created_at', { ascending: false });

    // --- 1. ITENS COM AGRUPAMENTO INTELIGENTE POR LOTE / MINUTO ---
    // Chave de agrupamento: `${itemTitle}_${minuteStr}_${giftedBy}`
    const groupedItemsMap = new Map<string, {
      id: string;
      itemTitle: string;
      itemImage: string;
      giftedBy?: string;
      count: number;
      timestamp: number;
      dateStr: string;
    }>();

    (userItems || []).forEach((itemDoc: any) => {
      const data = itemDoc.data || {};
      const itemTitle = data.itemTitle || itemDoc.item_title || 'Item';
      const itemImage = data.itemImageUrl || data.imageUrl || itemDoc.item_image_url || '';
      const giftedBy = data.giftedBy || itemDoc.gifted_by;
      const qty = data.quantity || 1;
      const dateStr = data.purchasedAt ? new Date(data.purchasedAt).toISOString() : (itemDoc.created_at || new Date().toISOString());
      const timeMs = new Date(dateStr).getTime();
      
      // Agrupa pelo mesmo minuto (arredonda timeMs para o minuto mais próximo)
      const minuteBucket = Math.floor(timeMs / (60 * 1000));
      const groupKey = `${itemTitle}_${minuteBucket}_${giftedBy || 'store'}`;

      const existing = groupedItemsMap.get(groupKey);
      if (existing) {
        existing.count += qty;
      } else {
        groupedItemsMap.set(groupKey, {
          id: itemDoc.id,
          itemTitle,
          itemImage,
          giftedBy,
          count: qty,
          timestamp: timeMs,
          dateStr
        });
      }
    });

    groupedItemsMap.forEach((entry) => {
      const countLabel = entry.count > 1 ? `${entry.count}x ` : '';
      const title = entry.giftedBy
        ? `Recebeu de presente: ${countLabel}${entry.itemTitle}`
        : `Adquiriu: ${countLabel}${entry.itemTitle}`;

      logItems.push({
        id: `activity-item-${entry.id}`,
        type: 'item',
        title,
        subtitle: entry.giftedBy ? `Presenteado por ${entry.giftedBy}` : 'Item do Inventário',
        imageUrl: entry.itemImage,
        badgeText: entry.count > 1 ? `${entry.count}x Itens` : 'Item Adquirido',
        badgeType: 'item_received',
        timestamp: entry.timestamp,
        rawDate: entry.dateStr,
        count: entry.count
      });
    });

    // --- 2. TODAS AS TENTATIVAS DE MISSÕES ---
    const questIds = Array.from(new Set((attempts || []).map((a: any) => a.quest_id).filter(Boolean)));
    const questMap = new Map<string, any>();
    if (questIds.length > 0) {
      const { data: qData } = await supabase.from('quests').select('id, title, coverImageUrl').in('id', questIds);
      (qData || []).forEach((q: any) => questMap.set(q.id, q));
    }

    (attempts || []).forEach((att: any) => {
      const q = questMap.get(att.quest_id);
      const questTitle = q?.title || att.data?.questTitle || att.data?.title || 'Missão';
      const isCompleted = att.status === 'completed';
      const earnedXp = att.data?.earned_xp ?? att.data?.earnedXp ?? att.xp_earned ?? 0;
      const dateStr = att.created_at || att.completed_at || new Date().toISOString();
      const timeMs = new Date(dateStr).getTime();

      logItems.push({
        id: `activity-quest-${att.id}`,
        type: 'quest',
        title: isCompleted ? `Completou a Missão: ${questTitle}` : `Tentativa na Missão: ${questTitle}`,
        subtitle: isCompleted ? (earnedXp > 0 ? `Ganhou +${earnedXp} XP` : 'Missão repetida (sem novo XP)') : 'Missão não completada',
        imageUrl: q?.coverImageUrl || '',
        badgeText: isCompleted ? `+${earnedXp} XP` : 'Derrota',
        badgeType: isCompleted ? (earnedXp > 0 ? 'xp_positive' : 'rank') : 'xp_negative',
        timestamp: timeMs,
        rawDate: dateStr
      });
    });

    // --- 3. LANÇAMENTOS DO PROFESSOR ---
    (teacherLogs || []).forEach((log: any) => {
      const evalName = log.eval_name || log.reason || 'Atribuição';
      const xpGained = log.xp_gained !== undefined ? log.xp_gained : (log.amount || 0);
      const justification = log.justification || '';
      const dateStr = log.created_at || new Date().toISOString();
      const timeMs = new Date(dateStr).getTime();

      logItems.push({
        id: `activity-teacher-${log.id}`,
        type: 'teacher_xp',
        title: `Lançamento do Professor: ${evalName}`,
        subtitle: justification ? `Justificativa: ${justification}` : undefined,
        imageUrl: log.image_url || log.imageUrl || '',
        badgeText: xpGained >= 0 ? `+${xpGained} XP` : `${xpGained} XP`,
        badgeType: xpGained >= 0 ? 'xp_positive' : 'xp_negative',
        timestamp: timeMs,
        rawDate: dateStr
      });
    });

    logItems.sort((a, b) => b.timestamp - a.timestamp);

  } catch (e) {
    console.error('Erro ao buscar log de atividades:', e);
  }

  return logItems;
}
