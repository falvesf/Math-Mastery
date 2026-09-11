import React, { useState, useEffect } from 'react';
import { Trophy, Swords, X, Crown, Calendar, Eye, EyeOff, Sparkles, Shield, Award } from 'lucide-react';
import LazyAnimatedAvatar from './LazyAnimatedAvatar';
import CachedImage from './CachedImage';
import { type EquippedItem } from './AvatarCharacter';
import { getRankForXp } from '../lib/ranks';
import { supabase } from '../lib/supabase';
import { orderEffectFirst } from '../lib/damageEffects';
import { 
  fetchQuestDamageRanking, 
  getMonthCycleName, 
  getRankDamagePrizeCoins,
  REWARD_PERCENTAGES,
  type QuestDamageRankingData,
  type QuestDamageRankingEntry
} from '../lib/combatDamage';

// @ts-ignore - referências mantidas para preservar imports
void [Sparkles, Shield, Award];

export interface QuestDamageRankingModalProps {
  isOpen?: boolean;
  onClose: () => void;
  questId: string;
  questTitle?: string;
  monsterName?: string;
  tenantId?: string | null;
  currentUserId?: string;
  currentSessionDamage?: number;
  currentEquippedItems?: EquippedItem[];
}

export const QuestDamageRankingModal: React.FC<QuestDamageRankingModalProps> = ({
  isOpen = true,
  onClose,
  questId,
  questTitle = 'Missão',
  monsterName,
  tenantId,
  currentUserId,
  currentSessionDamage,
  currentEquippedItems,
}) => {
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<QuestDamageRankingData | null>(null);
  const [showAvatars, setShowAvatars] = useState(true);
  const [rankingEquippedItems, setRankingEquippedItems] = useState<Record<string, EquippedItem[]>>({});

  useEffect(() => {
    if (!isOpen || !questId) return;

    let active = true;
    setLoading(true);

    fetchQuestDamageRanking(questId, tenantId).then(data => {
      if (active) {
        setRanking(data);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [isOpen, questId, tenantId]);

  // Carrega itens equipados dos alunos no ranking caso não estejam no documento salvo
  useEffect(() => {
    if (!ranking?.entries || ranking.entries.length === 0) return;

    const studentIds = ranking.entries.map(e => e.studentId).filter(Boolean);
    if (studentIds.length === 0) return;

    const fetchEquipped = async () => {
      try {
        const { data: snap } = await supabase
          .from('user_items')
          .select('*')
          .eq('equipped', true)
          .in('student_id', studentIds);

        if (!snap) return;
        const missingTransformIds: string[] = [];
        const rawMap: Record<string, EquippedItem[]> = {};

        snap.forEach((d: any) => {
          const data = d.data || {};
          if (data && data.avatarPart && (data.itemImageUrl || data.imageUrl || data.minecraftHeadValue || data.gameModelUrl)) {
            if (!rawMap[d.student_id]) rawMap[d.student_id] = [];
            let parsedAdds: any[] = [];
            if (data.adds) {
              try { parsedAdds = typeof data.adds === 'string' ? JSON.parse(data.adds) : data.adds; } catch (e) {}
            }
            parsedAdds = orderEffectFirst(parsedAdds);

            const eqItem: EquippedItem = {
              docId: d.id,
              itemId: d.item_id,
              imageUrl: data.itemImageUrl || data.imageUrl || '',
              avatarPart: data.avatarPart as any,
              itemTitle: data.itemTitle,
              itemCategory: data.itemCategory,
              baseAttributeType: data.baseAttributeType,
              baseAttributeValue: data.baseAttributeValue,
              adds: parsedAdds,
              gameModelUrl: data.gameModelUrl,
              modelTextureUrl: data.modelTextureUrl,
              minecraftHeadValue: data.minecraftHeadValue,
              modelTransforms: data.modelTransforms,
              backColor: data.backColor || '',
              rarity: data.rarity,
              customAnimation: data.customAnimation,
              battleSoundUrl: data.battleSoundUrl,
              criticalSoundUrl: data.criticalSoundUrl || '',
              damageEffect: data.damageEffect || 'none',
              forgeLevel: data.forgeLevel || 0,
              forgeConfig: data.forgeConfig || null,
            };

            rawMap[d.student_id].push(eqItem);

            if (!data.modelTransforms && d.item_id) {
              missingTransformIds.push(d.item_id);
            }
          }
        });

        // Se algum item não tiver modelTransforms ou gameModelUrl, busca de store_items para completar
        if (missingTransformIds.length > 0) {
          const uniqueIds = [...new Set(missingTransformIds)];
          const { data: storeSnap } = await supabase.from('store_items').select('id, data').in('id', uniqueIds);
          if (storeSnap) {
            const storeMap = new Map<string, any>();
            storeSnap.forEach((s: any) => {
              if (s.data) storeMap.set(s.id, s.data);
            });
            Object.values(rawMap).forEach(list => {
              list.forEach(eq => {
                if (eq.itemId && storeMap.has(eq.itemId)) {
                  const sData = storeMap.get(eq.itemId);
                  if (!eq.modelTransforms && sData.modelTransforms) eq.modelTransforms = sData.modelTransforms;
                  if (!eq.gameModelUrl && sData.gameModelUrl) eq.gameModelUrl = sData.gameModelUrl;
                  if (!eq.modelTextureUrl && sData.modelTextureUrl) eq.modelTextureUrl = sData.modelTextureUrl;
                }
              });
            });
          }
        }

        setRankingEquippedItems(rawMap);
      } catch (err) {
        console.error('Erro ao buscar itens equipados para o ranking de dano:', err);
      }
    };

    fetchEquipped();
  }, [ranking]);

  if (!isOpen) return null;

  const entries = ranking?.entries || [];

  const renderMovementIndicator = (entry: QuestDamageRankingEntry, currentPos: number) => {
    const prev = entry.previousRank;
    if (prev === undefined || prev === null) {
      return (
        <span
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.72rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            padding: '1px 6px',
            fontWeight: 'bold',
            opacity: 0.85
          }}
          title="Posição estável neste ciclo"
        >
          ―
        </span>
      );
    }

    const diff = prev - currentPos;
    if (diff === 0) {
      return (
        <span
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.72rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            padding: '1px 6px',
            fontWeight: 'bold',
            opacity: 0.85
          }}
          title="Manteve esta posição"
        >
          ―
        </span>
      );
    }

    const isUp = diff > 0;
    const color = isUp ? '#4ade80' : '#f87171';
    const bgColor = isUp ? 'rgba(74, 222, 128, 0.12)' : 'rgba(248, 113, 113, 0.12)';
    const borderColor = isUp ? 'rgba(74, 222, 128, 0.25)' : 'rgba(248, 113, 113, 0.25)';
    const arrow = isUp ? '▲' : '▼';
    const titleText = isUp
      ? `Subiu ${diff} ${diff === 1 ? 'posição' : 'posições'} no ranking!`
      : `Caiu ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'posição' : 'posições'} no ranking!`;

    return (
      <span
        style={{
          color,
          fontSize: '0.72rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: '4px',
          padding: '1px 6px',
          fontWeight: 'bold',
          cursor: 'help'
        }}
        title={titleText}
      >
        {arrow} {Math.abs(diff)}
      </span>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        padding: '1rem',
        boxSizing: 'border-box'
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel hide-scrollbar"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(15, 17, 23, 0.98)',
          border: '1px solid rgba(245, 158, 11, 0.45)',
          borderRadius: '18px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(245, 158, 11, 0.18)',
          overflowY: 'auto',
          position: 'relative'
        }}
      >
        {/* Cabeçalho */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'radial-gradient(circle at 50% 0%, rgba(245, 158, 11, 0.16), transparent 70%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backdropFilter: 'blur(12px)',
          gap: '0.8rem',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.28), rgba(239, 68, 68, 0.25))',
              border: '1px solid rgba(245, 158, 11, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gold-primary)',
              boxShadow: '0 0 15px rgba(245, 158, 11, 0.25)'
            }}>
              <Trophy size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800 }}>
                Ranking dos 10 Maiores Danos
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
                <Calendar size={13} color="var(--gold-primary)" />
                Ciclo: <strong style={{ color: 'var(--gold-primary)' }}>{getMonthCycleName(ranking?.monthCycle)}</strong> (reinicia a cada mês)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Botão de Alternar Visualização do Avatar / Patente */}
            <button
              type="button"
              onClick={() => setShowAvatars(!showAvatars)}
              style={{
                background: showAvatars ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                border: showAvatars ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: showAvatars ? 'var(--gold-primary)' : 'var(--text-primary)',
                cursor: 'pointer',
                padding: '0.45rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                transition: 'all 0.2s ease'
              }}
              title={showAvatars ? "Ocultar Avatares (Exibir apenas Patentes)" : "Mostrar Avatares 3D com Equipamentos"}
            >
              {showAvatars ? <EyeOff size={15} /> : <Eye size={15} />}
              <span>{showAvatars ? 'Ocultar Avatares' : 'Exibir Avatares'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '0.45rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Subtítulo / Info do Monstro */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.6rem',
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid var(--border-glass)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Swords size={18} color="#ef4444" />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                Alvo: <strong style={{ color: '#f87171' }}>{monsterName || questTitle}</strong>
              </span>
            </div>
            {currentSessionDamage !== undefined && currentSessionDamage > 0 && (
              <span style={{ fontSize: '0.82rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>
                Seu Maior Dano nesta partida: {currentSessionDamage}
              </span>
            )}
          </div>

          {/* Banner de Premiação */}
          <div style={{
            padding: '0.85rem 1rem',
            borderRadius: '12px',
            background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.12), rgba(0, 0, 0, 0.25))',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            fontSize: '0.76rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.45
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <strong style={{ color: 'var(--gold-primary)', fontSize: '0.82rem' }}>
                🎁 Premiação em Moedas por Ciclo (Top 10):
              </strong>
              <span style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>
                Liberado no final do ciclo mensal (ao logar)
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.72rem' }}>
              <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>1º: 100% (200 moedas)</span> ·
              <span style={{ color: '#cbd5e1', fontWeight: 'bold' }}>2º: 75% (150 moedas)</span> ·
              <span style={{ color: '#cd7f32', fontWeight: 'bold' }}>3º: 50% (100 moedas)</span> ·
              <span>4º: 40%</span> · <span>5º: 35%</span> · <span>6º: 30%</span> ·
              <span>7º: 25%</span> · <span>8º: 20%</span> · <span>9º: 15%</span> · <span>10º: 10%</span>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Carregando ranking de dano...
            </div>
          ) : entries.length === 0 ? (
            <div style={{
              padding: '3.5rem 1.5rem',
              textAlign: 'center',
              background: 'rgba(0,0,0,0.25)',
              borderRadius: '14px',
              border: '1px dashed rgba(255,255,255,0.12)'
            }}>
              <Swords size={44} color="var(--text-secondary)" style={{ opacity: 0.4, marginBottom: '0.8rem' }} />
              <h4 style={{ margin: '0 0 0.4rem 0', color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                Nenhum golpe registrado ainda neste mês!
              </h4>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                Desfira o maior dano nesta missão para assumir o 1º lugar do pódio e garantir as 200 moedas!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {entries.slice(0, 10).map((entry, idx) => {
                const rankPos = idx + 1;
                const rewardPct = REWARD_PERCENTAGES[rankPos] || 10;
                const prizeCoins = getRankDamagePrizeCoins(rankPos);

                const sRank = getRankForXp(entry.studentXp || 0, entry.studentClassId);
                const isSelf = Boolean(currentUserId && entry.studentId === currentUserId);
                const userLiveItems = (isSelf && currentEquippedItems && currentEquippedItems.length > 0) ? currentEquippedItems : null;
                const equipped = userLiveItems || rankingEquippedItems[entry.studentId] || entry.equippedItems || [];
                const itemsKey = (equipped || []).map(i => `${i.itemId || i.docId || ''}_${i.avatarPart}`).join(':');
                const avatarKey = `quest-damage-ranking-${entry.studentId}-${questId}-${itemsKey}`;

                // Cores e tamanhos por colocação
                let medalColor = '#64748b';
                let bgStyle = isSelf ? 'rgba(245, 158, 11, 0.14)' : 'rgba(0, 0, 0, 0.3)';
                let borderStyle = isSelf ? '1px solid var(--gold-primary)' : '1px solid rgba(255, 255, 255, 0.06)';
                let avatarSize = 46;
                let cardBoxShadow = 'none';

                if (rankPos === 1) {
                  medalColor = '#fbbf24';
                  avatarSize = 54;
                  bgStyle = isSelf ? 'linear-gradient(90deg, rgba(245, 158, 11, 0.25), rgba(0,0,0,0.4))' : 'linear-gradient(90deg, rgba(245, 158, 11, 0.15), rgba(0,0,0,0.3))';
                  borderStyle = '1px solid rgba(245, 158, 11, 0.7)';
                  cardBoxShadow = '0 0 20px rgba(245, 158, 11, 0.18)';
                } else if (rankPos === 2) {
                  medalColor = '#cbd5e1';
                  avatarSize = 50;
                  bgStyle = isSelf ? 'linear-gradient(90deg, rgba(203, 213, 225, 0.2), rgba(0,0,0,0.4))' : 'linear-gradient(90deg, rgba(203, 213, 225, 0.1), rgba(0,0,0,0.3))';
                  borderStyle = '1px solid rgba(203, 213, 225, 0.5)';
                } else if (rankPos === 3) {
                  medalColor = '#cd7f32';
                  avatarSize = 48;
                  bgStyle = isSelf ? 'linear-gradient(90deg, rgba(205, 127, 50, 0.2), rgba(0,0,0,0.4))' : 'linear-gradient(90deg, rgba(205, 127, 50, 0.1), rgba(0,0,0,0.3))';
                  borderStyle = '1px solid rgba(205, 127, 50, 0.5)';
                }

                // Nome do personagem prevalece
                const charName = entry.characterName || entry.studentName || 'Guerreiro';
                const showRealNameSub = entry.characterName && entry.characterName !== entry.studentName;

                return (
                  <div
                    key={entry.studentId}
                    className="glass-panel"
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 1rem',
                      background: bgStyle,
                      border: borderStyle,
                      boxShadow: cardBoxShadow,
                      borderRadius: '14px',
                      gap: '0.85rem'
                    }}
                  >
                    {/* ESQUERDA: Classificação (Posição) */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.85rem',
                      flexShrink: 0
                    }}>
                      <div style={{
                        width: '36px',
                        textAlign: 'center',
                        fontSize: rankPos <= 3 ? '1.25rem' : '1.05rem',
                        fontWeight: 900,
                        color: medalColor,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textShadow: rankPos === 1 ? '0 0 10px rgba(245, 158, 11, 0.5)' : 'none'
                      }}>
                        {rankPos === 1 && (
                          <Crown size={18} color="#fbbf24" fill="#fbbf24" style={{ marginBottom: 2 }} />
                        )}
                        <span>{rankPos}º</span>
                      </div>

                      {/* CÍRCULO DO BONECO / PATENTE (DESACOPLADO, SEM OVERFLOW HIDDEN) */}
                      <div
                        style={{
                          position: 'relative',
                          width: avatarSize,
                          height: avatarSize,
                          borderRadius: '50%',
                          border: `2px solid ${medalColor}`,
                          boxShadow: rankPos === 1 ? '0 0 12px rgba(251, 191, 36, 0.45)' : 'none',
                          background: 'radial-gradient(circle, rgba(255,255,255,0.08), rgba(0,0,0,0.6))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'visible', // Desacoplado: permite que o personagem e armas extrapolem o círculo naturalmente
                          flexShrink: 0
                        }}
                      >
                        {/* Imagem da Patente no fundo do círculo */}
                        {sRank.imageUrl ? (
                          <CachedImage
                            src={sRank.imageUrl}
                            alt={sRank.name}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              borderRadius: '50%',
                              filter: `drop-shadow(0 0 8px ${sRank.color}80)`,
                              opacity: showAvatars ? 0.35 : 1,
                              zIndex: 0,
                              transition: 'opacity 0.2s ease'
                            }}
                          />
                        ) : (
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            color: sRank.color,
                            textAlign: 'center',
                            fontSize: avatarSize > 46 ? '0.75rem' : '0.65rem',
                            zIndex: 0,
                            opacity: showAvatars ? 0.4 : 1,
                            textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
                          }}>
                            {sRank.name}
                          </div>
                        )}

                        {/* Boneco / Avatar 3D Desacoplado com Itens Equipados */}
                        {showAvatars && (
                          <div style={{
                            position: 'relative',
                            zIndex: 1,
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'visible'
                          }}>
                            {entry.avatarConfig ? (
                              <LazyAnimatedAvatar
                                key={avatarKey}
                                id={avatarKey}
                                config={entry.avatarConfig}
                                equippedItems={equipped}
                                size={avatarSize}
                                animation={rankPos === 1 ? 'cheer' : 'idle'}
                                faceCamera={true}
                                alwaysAnimate={rankPos <= 3}
                              />
                            ) : (
                              <div style={{
                                width: avatarSize * 0.75,
                                height: avatarSize * 0.75,
                                borderRadius: '50%',
                                background: 'rgba(255,255,255,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-secondary)',
                                fontSize: '0.8rem',
                                fontWeight: 'bold'
                              }}>
                                ⚔️
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CENTRO: Nome do Personagem, Patente, Oscilador e Premiação */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: rankPos === 1 ? '1.05rem' : '0.96rem',
                            fontWeight: 800,
                            color: isSelf ? 'var(--gold-primary)' : (rankPos === 1 ? '#fbbf24' : '#fff'),
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={charName}
                        >
                          {charName}
                        </span>

                        {isSelf && (
                          <span style={{
                            fontSize: '0.65rem',
                            background: 'var(--gold-primary)',
                            color: '#000',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            flexShrink: 0
                          }}>
                            Você
                          </span>
                        )}
                      </div>

                      {/* Subtítulo: Jogador Real + Patente */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', fontSize: '0.74rem' }}>
                        {showRealNameSub && (
                          <span style={{ color: 'var(--text-secondary)' }}>
                            ({entry.studentName})
                          </span>
                        )}
                        <span style={{ color: sRank.color, fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                          {sRank.name}
                        </span>
                        {entry.studentClassId && (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                            • {entry.studentClassId}
                          </span>
                        )}
                      </div>

                      {/* Linha Inferior: Indicador de Posição Subiu/Desceu + Tag do Prêmio */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                        {renderMovementIndicator(entry, rankPos)}

                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            color: rankPos === 1 ? '#fbbf24' : '#cbd5e1',
                            background: rankPos === 1 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.06)',
                            border: rankPos === 1 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                            padding: '1px 7px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                          title="Prêmio creditado automaticamente ao logar após o encerramento do ciclo mensal"
                        >
                          🎁 Prêmio: {rewardPct}% ({prizeCoins} moedas)
                        </span>
                      </div>
                    </div>

                    {/* DIREITA: Dano Máximo Desferido */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      flexShrink: 0,
                      paddingLeft: '0.4rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Swords size={17} color="#ef4444" />
                        <span style={{
                          fontSize: rankPos === 1 ? '1.45rem' : '1.25rem',
                          fontWeight: 900,
                          color: rankPos === 1 ? 'var(--gold-primary)' : '#fff',
                          textShadow: rankPos === 1 ? '0 0 12px rgba(245, 158, 11, 0.6)' : 'none'
                        }}>
                          {entry.maxDamage}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '0.62rem',
                        fontWeight: 'bold',
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Maior Dano
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuestDamageRankingModal;
