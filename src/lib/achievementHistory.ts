import { supabase } from './supabase';
import { fetchBlacksmithMilestones, recordForgeMilestone, recordTransmuteMilestone } from './blacksmithAchievements';

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
  type: 'rank_up' | 'quest' | 'item' | 'teacher_xp' | 'pvp' | 'forge';
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
}

/**
 * Busca e unifica todo o Histórico de Conquistas de um aluno:
 * 1. Subidas de Patente (Alcançou a patente X - sem XP na frente)
 * 2. Missões Concluídas (Solo e Ao Vivo com o XP ganho)
 * 3. Itens e Equipamentos adquiridos / comprados na loja
 * 4. XP Atribuído ou Retirado pelo Professor
 */
export async function fetchStudentAchievementHistory(studentUid: string, _tenantId?: string): Promise<AchievementItem[]> {
  const achievements: AchievementItem[] = [];

  try {
    // 1. Busca dados do usuário (XP, patentes, etc.)
    const { data: user } = await supabase.from('users').select('*').eq('id', studentUid).single();

    // 2. Busca tentativas de missões (quest_attempts)
    const { data: attempts } = await supabase
      .from('quest_attempts')
      .select('*')
      .eq('student_id', studentUid)
      .order('created_at', { ascending: false });

    // 3. Busca itens do inventário (user_items)
    const { data: userItems } = await supabase
      .from('user_items')
      .select('*')
      .eq('student_id', studentUid)
      .order('created_at', { ascending: false });

    // 4. Busca lançamentos manuais do professor (xp_logs)
    const { data: teacherLogs } = await supabase
      .from('xp_logs')
      .select('*')
      .eq('student_id', studentUid)
      .order('created_at', { ascending: false });

    // Mapeamento dos títulos das missões
    const questIds = Array.from(new Set((attempts || []).map((a: any) => a.quest_id).filter(Boolean)));
    const questMap = new Map<string, { title: string; coverImageUrl?: string }>();

    if (questIds.length > 0) {
      // select('*') evita erro quando alguma coluna (ex: cover_image_url) não existe no banco
      const { data: questsData } = await supabase.from('quests').select('*').in('id', questIds);
      if (questsData) {
        questsData.forEach((q: any) => {
          questMap.set(q.id, {
            title: q.title || 'Missão',
            coverImageUrl: q.cover_image_url || q.coverImageUrl || ''
          });
        });
      }
    }

    // --- PROCESSAR MISSÕES CONCLUÍDAS ---
    (attempts || []).forEach((att: any) => {
      const qInfo = questMap.get(att.quest_id);
      // Título real da missão (catálogo > dados da tentativa > genérico)
      const questTitle = qInfo?.title || att.data?.questTitle || att.data?.title || att.quest_title || 'Missão';
      const isCompleted = att.status === 'completed';
      const earnedXp = att.data?.earned_xp ?? att.data?.earnedXp ?? att.xp_earned ?? 0;
      const isLive = att.data?.isLiveQuest || att.data?.is_live_quest;
      const dateStr = att.created_at || att.completed_at || new Date().toISOString();
      const timeMs = new Date(dateStr).getTime();

      if (isCompleted) {
        achievements.push({
          id: `quest-${att.id || timeMs}`,
          type: 'quest',
          title: `Completou a Missão: ${questTitle}`,
          subtitle: isLive ? 'Modo Arena Ao Vivo' : 'Missão Individual',
          imageUrl: qInfo?.coverImageUrl || '',
          badgeText: `+${earnedXp} XP`,
          badgeType: 'xp_positive',
          timestamp: timeMs,
          rawDate: dateStr
        });
      }
    });

    // --- PROCESSAR ITENS E EQUIPAMENTOS ---
    (userItems || []).forEach((itemDoc: any) => {
      const data = itemDoc.data || {};
      const itemTitle = data.itemTitle || itemDoc.item_title || 'Item';
      const itemImage = data.itemImageUrl || data.imageUrl || itemDoc.item_image_url || '';
      const giftedBy = data.giftedBy || itemDoc.gifted_by;
      const dateStr = data.purchasedAt || itemDoc.created_at || new Date().toISOString();
      const timeMs = new Date(dateStr).getTime();

      achievements.push({
        id: `item-${itemDoc.id || timeMs}`,
        type: 'item',
        title: giftedBy ? `Recebeu de presente: ${itemTitle}` : `Adquiriu o item: ${itemTitle}`,
        subtitle: giftedBy
          ? `Presenteado por ${giftedBy}`
          : (data.itemCategory && data.itemCategory !== 'none' && data.itemCategory !== 'null'
              ? `Categoria: ${data.itemCategory}`
              : 'Item do Inventário'),
        imageUrl: itemImage,
        badgeText: 'Item Adquirido',
        badgeType: 'item_received',
        timestamp: timeMs,
        rawDate: dateStr
      });
    });

    // --- PROCESSAR LANÇAMENTOS DO PROFESSOR (XP_LOGS) ---
    (teacherLogs || []).forEach((log: any) => {
      // Ignora registros legados automatizados se houver
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

    // --- PROCESSAR PATENTES ALCANÇADAS ---
    if (user) {
      // Busca as patentes da escola DO ALUNO direto do banco, para respeitar
      // a configuração "omitir do histórico" de cada patente. NÃO depende do
      // array global RANKS (que pode estar vazio ou refletir outra escola).
      let schoolRanks: any[] = [];
      if (user.tenant_id) {
        const { data: rankRows } = await supabase
          .from('custom_ranks')
          .select('*')
          .eq('tenant_id', user.tenant_id)
          .eq('is_global', false)
          .order('minXp', { ascending: true });
        schoolRanks = (rankRows || []).map((d: any) => {
          const { id, ...rest } = d;
          return {
            ...rest,
            hideFromHistory: d.hide_from_history ?? d.hideFromHistory ?? (d.minXp === 0),
          };
        });
      }
      // Fallback: sem patentes locais, usa o banco de patentes globais
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
      // Patente atual pelo XP (usando a lista da escola)
      let currentRankIdx = 0;
      for (let i = 0; i < schoolRanks.length; i++) {
        if (userXp >= (schoolRanks[i].minXp || 0)) currentRankIdx = i;
        else break;
      }
      const highestIdx = Math.max(currentRankIdx, user.inventoryPreferences?.highestRankIndex || 0);

      // Adiciona as patentes alcançadas na linha do tempo (omitindo patentes marcadas como hideFromHistory ou patente inicial)
      for (let i = 0; i <= highestIdx; i++) {
        const rank = schoolRanks[i];
        if (!rank) continue;
        if (rank.hideFromHistory || (rank.minXp === 0 && rank.hideFromHistory !== false)) continue;

        // Estima timestamp de patente ou usa data de criação da conta
        const userCreatedMs = user.created_at ? new Date(user.created_at).getTime() : Date.now() - 86400000;
        const rankTimestamp = userCreatedMs + (i * 1000); // leve offset para ordenar corretamente

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

    // --- PROCESSAR PVP (duelos finalizados) ---
    try {
      const { data: pvpMatches } = await supabase
        .from('pvp_matches')
        .select('*')
        .or(`challenger_id.eq.${studentUid},opponent_id.eq.${studentUid}`)
        .eq('status', 'finished')
        .order('finished_at', { ascending: false });

      const pvpEntries: PvpHistoryEntry[] = (pvpMatches || []).map((m: any) => {
        const role = m.challenger_id === studentUid ? 'challenger' : 'opponent';
        const myBet = m.bet?.[role];
        const oppBet = m.bet?.[role === 'challenger' ? 'opponent' : 'challenger'];
        const won = !!m.winner_id && m.winner_id === studentUid;
        const draw = !m.winner_id;
        const oppName = role === 'challenger' ? m.opponent_name || 'Oponente' : m.challenger_name || 'Oponente';
        const myScore = role === 'challenger' ? m.player1?.score : m.player2?.score;
        const oppScore = role === 'challenger' ? m.player2?.score : m.player1?.score;

        let prizeText: string | undefined;
        let prizeType: PvpHistoryEntry['prizeType'] = 'none';
        if (draw) {
          prizeText = 'Empate — apostas devolvidas';
          prizeType = 'refund';
        } else if (won) {
          const gains: string[] = [];
          if (oppBet?.type === 'coins') { gains.push(`+${oppBet.coins} moedas`); prizeType = 'coins_win'; }
          if (oppBet?.type === 'item') {
            gains.push(`ganhou o item ${oppBet.item?.itemTitle || 'apostado'}`);
            if (prizeType !== 'coins_win') prizeType = 'item_win';
          }
          if (gains.length > 0) prizeText = gains.join(' · ');
        } else {
          const losses: string[] = [];
          if (myBet?.type === 'coins') { losses.push(`-${myBet.coins} moedas`); prizeType = 'coins_lose'; }
          if (myBet?.type === 'item') {
            losses.push(`perdeu o item ${myBet.item?.itemTitle || 'apostado'}`);
            if (prizeType !== 'coins_lose') prizeType = 'item_lose';
          }
          if (losses.length > 0) prizeText = losses.join(' · ');
        }

        const dateStr = m.finished_at || m.created_at || new Date().toISOString();
        return {
          id: `pvp-${m.id || dateStr}`,
          won,
          draw,
          opponentName: oppName,
          dateStr,
          timestamp: new Date(dateStr).getTime(),
          score: `${myScore ?? 0} × ${oppScore ?? 0}`,
          prizeText,
          prizeType,
        } as PvpHistoryEntry;
      });

      // Ordena cronologicamente (do mais antigo para o mais recente) para identificar a 1ª vitória
      const chronological = [...pvpEntries].sort((a, b) => a.timestamp - b.timestamp);
      const firstWinIndex = chronological.findIndex(e => e.won);

      chronological.forEach((entry, idx) => {
        if (idx === firstWinIndex) {
          // MARCO ESPECIAL E ÚNICO: Primeira Vitória em PvP
          achievements.push({
            id: 'pvp-first-win',
            type: 'pvp',
            isSpecialMilestone: true,
            title: 'Primeira Vitória em PvP',
            subtitle: `Vitória histórica contra ${entry.opponentName} · Placar: ${entry.score}${entry.prizeText ? ` · ${entry.prizeText}` : ''}`,
            badgeText: '🏆 1ª Vitória',
            badgeType: 'xp_positive',
            timestamp: entry.timestamp,
            rawDate: entry.dateStr,
          });
        } else {
          // Demais duelos (aparecem individualmente na timeline conforme acontecem)
          let title = `Duelo PvP: vs ${entry.opponentName}`;
          let badgeText = 'Duelo PvP';
          let badgeType: AchievementItem['badgeType'] = 'rank';

          if (entry.won) {
            title = `Vitória em PvP: vs ${entry.opponentName}`;
            badgeText = entry.prizeType === 'coins_win' && entry.prizeText ? entry.prizeText.split(' · ')[0] : 'Vitória PvP';
            badgeType = 'xp_positive';
          } else if (entry.draw) {
            title = `Empate em PvP: vs ${entry.opponentName}`;
            badgeText = 'Empate';
            badgeType = 'rank';
          } else {
            title = `Duelo PvP: vs ${entry.opponentName}`;
            badgeText = entry.prizeType === 'coins_lose' && entry.prizeText ? entry.prizeText.split(' · ')[0] : 'Duelo PvP';
            badgeType = entry.prizeType === 'coins_lose' ? 'xp_negative' : 'item_spent';
          }

          const subtitle = `Placar: ${entry.score}${entry.prizeText ? ` · ${entry.prizeText}` : ''}`;

          achievements.push({
            id: entry.id,
            type: 'pvp',
            title,
            subtitle,
            badgeText,
            badgeType,
            timestamp: entry.timestamp,
            rawDate: entry.dateStr,
          });
        }
      });
    } catch (e) {
      console.error('Erro ao buscar histórico de PvP:', e);
    }

    // --- RECOMPENSAS DE ESPECTADOR PVP (primeira batalha assistida) ---
    let spectateRewards: any[] = [];
    const legacySpectate = (user as any)?.inventory_preferences?.spectateRewards;
    if (Array.isArray(legacySpectate)) spectateRewards = legacySpectate;
    try {
      const { data: specDocs } = await supabase
        .from('system_collections')
        .select('data')
        .eq('collection_name', 'spectate_rewards')
        .eq('doc_id', studentUid)
        .limit(1);
      const d = specDocs?.[0]?.data;
      if (d && Array.isArray(d.rewards)) spectateRewards = d.rewards;
    } catch (e) { /* ignore */ }
    if (spectateRewards.length > 0) {
      spectateRewards.forEach((r: any, i: number) => {
        const dateStr = r.date || new Date().toISOString();
        // 'share' (0,25% da aposta) não é a primeira vez — título próprio.
        // Fallback por texto para registros antigos.
        const isShare = r.kind === 'share' || (typeof r.prize === 'string' && r.prize.includes('0,25%'));
        achievements.push({
          id: `spectate-${r.matchId || i}`,
          type: 'pvp',
          title: isShare ? 'Recompensa de Torcida Vencedora' : 'Primeira Batalha Assistida (Espectador)',
          subtitle: r.score ? `Placar: ${r.score}` : undefined,
          badgeText: r.prize || '+100 moedas',
          badgeType: 'xp_positive',
          timestamp: new Date(dateStr).getTime(),
          rawDate: dateStr,
        });
      });
    }

    // --- CONQUISTAS DO FERREIRO (Primeira Forja, Primeiro +9, Primeira Transmutação) ---
    try {
      const milestones = await fetchBlacksmithMilestones(studentUid);

      // 1. PRIMEIRA FORJA COM SUCESSO
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
        // Retroativo: verifica se o aluno já possui itens com forja concluída
        const forgedItems = (userItems || []).filter((i: any) => (i.data?.forgeLevel || 0) > 0);
        if (forgedItems.length > 0) {
          const oldest = [...forgedItems].sort((a: any, b: any) => {
            const tA = new Date(a.data?.purchasedAt || a.created_at || 0).getTime();
            const tB = new Date(b.data?.purchasedAt || b.created_at || 0).getTime();
            return tA - tB;
          })[0];
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

      // 2. PRIMEIRO ITEM +9 NA FORJA
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
        // Retroativo: verifica se o aluno possui algum item no nível máximo (+9)
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

      // 3. PRIMEIRA TRANSMUTAÇÃO COM SUCESSO (arma X em arma Y)
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
        // Retroativo: verifica se possui item transmutado
        const transmutedItems = (userItems || []).filter((i: any) => i.data?.isTransmuted);
        if (transmutedItems.length > 0) {
          const oldestT = transmutedItems[0];
          const dateStr = oldestT.data?.purchasedAt || oldestT.created_at || new Date().toISOString();
          const timeMs = new Date(dateStr).getTime();
          const resTitle = oldestT.data?.itemTitle || oldestT.item_title || 'Item Transmutado';
          
          let srcTitle = 'Arma +9';
          try {
            const { data: storeSources } = await supabase
              .from('store_items')
              .select('id, name, data');
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
