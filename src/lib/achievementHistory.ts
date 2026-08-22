import { supabase } from './supabase';
import { RANKS, getRankForXp } from './ranks';

export interface AchievementItem {
  id: string;
  type: 'rank_up' | 'quest' | 'item' | 'teacher_xp';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badgeText: string;
  badgeType: 'rank' | 'xp_positive' | 'xp_negative' | 'item_spent' | 'item_received';
  timestamp: number; // in milliseconds
  rawDate: string;
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
      const { data: questsData } = await supabase.from('quests').select('id, title, cover_image_url, coverImageUrl').in('id', questIds);
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
      const questTitle = qInfo?.title || 'Missão';
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
        subtitle: giftedBy ? `Presenteado por ${giftedBy}` : (data.itemCategory ? `Categoria: ${data.itemCategory}` : 'Item do Inventário'),
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
      const userXp = user.xp || 0;
      const currentRank = getRankForXp(userXp);
      const currentRankIdx = RANKS.findIndex(r => r.name === currentRank.name);
      const highestIdx = Math.max(currentRankIdx, user.inventoryPreferences?.highestRankIndex || 0);

      // Adiciona as patentes alcançadas na linha do tempo (omitindo patentes marcadas como hideFromHistory ou patente inicial)
      for (let i = 0; i <= highestIdx; i++) {
        const rank = RANKS[i];
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

    // Ordenar todas as conquistas em ordem cronológica decrescente (mais recente primeiro)
    achievements.sort((a, b) => b.timestamp - a.timestamp);

  } catch (err) {
    console.error("Erro ao buscar histórico de conquistas do aluno:", err);
  }

  return achievements;
}
