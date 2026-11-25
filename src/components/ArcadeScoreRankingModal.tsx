import React, { useEffect, useState } from 'react';
import { Trophy, Swords, X, Crown, Calendar, Eye, EyeOff, Flame } from 'lucide-react';
import LazyAnimatedAvatar from './LazyAnimatedAvatar';
import CachedImage from './CachedImage';
import { type EquippedItem } from './AvatarCharacter';
import { getRankForXp } from '../lib/ranks';
import { supabase } from '../lib/supabase';
import { orderEffectFirst } from '../lib/damageEffects';
import {
  fetchArcadeScoreRanking,
  getMonthCycleName,
  type ArcadeScoreRankingData,
  type ArcadeScoreRankingEntry,
} from '../lib/arcadeRanking';

export interface ArcadeScoreRankingModalProps {
  isOpen?: boolean;
  onClose: () => void;
  tenantId?: string | null;
  currentUserId?: string;
  currentSessionScore?: number;
  currentEquippedItems?: EquippedItem[];
}

export const ArcadeScoreRankingModal: React.FC<ArcadeScoreRankingModalProps> = ({
  isOpen = true,
  onClose,
  tenantId,
  currentUserId,
  currentSessionScore,
  currentEquippedItems,
}) => {
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<ArcadeScoreRankingData | null>(null);
  const [showAvatars, setShowAvatars] = useState(true);
  const [rankingEquippedItems, setRankingEquippedItems] = useState<Record<string, EquippedItem[]>>({});

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    fetchArcadeScoreRanking(tenantId).then(data => {
      if (active) {
        setRanking(data);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [isOpen, tenantId]);

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
              try { parsedAdds = typeof data.adds === 'string' ? JSON.parse(data.adds) : data.adds; } catch { /* noop */ }
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
              itemAnimations: data.itemAnimations,
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
        console.error('Erro ao buscar itens equipados para o ranking Arcade:', err);
      }
    };

    fetchEquipped();
  }, [ranking]);

  if (!isOpen) return null;

  const entries = ranking?.entries || [];

  const renderMovementIndicator = (entry: ArcadeScoreRankingEntry, currentPos: number) => {
    const prev = entry.previousRank;
    if (prev === undefined || prev === null || prev === currentPos) {
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
            opacity: 0.85,
          }}
          title="Posição estável neste ciclo"
        >
          ―
        </span>
      );
    }
    const diff = prev - currentPos;
    const isUp = diff > 0;
    const color = isUp ? '#4ade80' : '#f87171';
    const bgColor = isUp ? 'rgba(74, 222, 128, 0.12)' : 'rgba(248, 113, 113, 0.12)';
    const borderColor = isUp ? 'rgba(74, 222, 128, 0.25)' : 'rgba(248, 113, 113, 0.25)';
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
        }}
      >
        {isUp ? '▲' : '▼'} {Math.abs(diff)}
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
        background: 'rgba(0, 0, 0, 0.86)',
        backdropFilter: 'blur(10px)',
        padding: '1rem',
        boxSizing: 'border-box',
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
          border: '1px solid rgba(245, 158, 11, 0.5)',
          borderRadius: '18px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(245, 158, 11, 0.2)',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* Cabeçalho */}
        <div style={{
          padding: '1.2rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'radial-gradient(circle at 50% 0%, rgba(245, 158, 11, 0.18), transparent 70%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backdropFilter: 'blur(12px)',
          gap: '0.8rem',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(239, 68, 68, 0.25))',
              border: '1px solid rgba(245, 158, 11, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gold-primary)',
              boxShadow: '0 0 15px rgba(245, 158, 11, 0.25)',
            }}>
              <Trophy size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.22rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 900, letterSpacing: '0.5px' }}>
                HIGH SCORES — RANKING ARCADE
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
                <Calendar size={13} color="var(--gold-primary)" />
                Ciclo: <strong style={{ color: 'var(--gold-primary)' }}>{getMonthCycleName(ranking?.monthCycle)}</strong>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
              }}
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
                justifyContent: 'center',
              }}
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '1.2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.6rem',
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            background: 'rgba(0, 0, 0, 0.45)',
            border: '1px solid rgba(251, 191, 36, 0.28)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Flame size={18} color="#fb923c" />
              <span style={{ fontSize: '0.84rem', color: '#e2e8f0' }}>
                Cada <strong style={{ color: '#facc15' }}>100.000 PTS</strong> concede <strong style={{ color: '#4ade80' }}>+1 Vida Extra (1UP)</strong>!
              </span>
            </div>
            {currentSessionScore !== undefined && currentSessionScore > 0 && (
              <span style={{ fontSize: '0.85rem', color: '#facc15', fontWeight: 900, fontFamily: 'monospace' }}>
                SUA PONTUAÇÃO: {currentSessionScore.toLocaleString('pt-BR')} PTS
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Carregando ranking de pontos do Arcade...
            </div>
          ) : entries.length === 0 ? (
            <div style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              background: 'rgba(0,0,0,0.25)',
              borderRadius: '14px',
              border: '1px dashed rgba(255,255,255,0.12)',
            }}>
              <Swords size={44} color="var(--text-secondary)" style={{ opacity: 0.4, marginBottom: '0.8rem' }} />
              <h4 style={{ margin: '0 0 0.4rem 0', color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                Nenhuma pontuação registrada ainda neste ciclo!
              </h4>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                Derrote inimigos, sub-chefes e chefes no Modo Arcade para cravar seu nome no topo!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {entries.slice(0, 10).map((entry, idx) => {
                const rankPos = idx + 1;
                const sRank = getRankForXp(entry.studentXp || 0, entry.studentClassId);
                const isSelf = Boolean(currentUserId && entry.studentId === currentUserId);
                const userLiveItems = (isSelf && currentEquippedItems && currentEquippedItems.length > 0) ? currentEquippedItems : null;
                const equipped = userLiveItems || rankingEquippedItems[entry.studentId] || entry.equippedItems || [];
                const itemsKey = (equipped || []).map((i: any) => `${i.itemId || i.docId || ''}_${i.avatarPart}`).join(':');
                const avatarKey = `arcade-score-ranking-${entry.studentId}-${itemsKey}`;

                let medalColor = '#64748b';
                let bgStyle = isSelf ? 'rgba(245, 158, 11, 0.14)' : 'rgba(0, 0, 0, 0.32)';
                let borderStyle = isSelf ? '1px solid var(--gold-primary)' : '1px solid rgba(255, 255, 255, 0.08)';
                let avatarSize = 46;
                let cardBoxShadow = 'none';

                if (rankPos === 1) {
                  medalColor = '#fbbf24';
                  avatarSize = 54;
                  bgStyle = isSelf
                    ? 'linear-gradient(90deg, rgba(245, 158, 11, 0.25), rgba(0,0,0,0.4))'
                    : 'linear-gradient(90deg, rgba(245, 158, 11, 0.15), rgba(0,0,0,0.3))';
                  borderStyle = '1px solid rgba(245, 158, 11, 0.7)';
                  cardBoxShadow = '0 0 20px rgba(245, 158, 11, 0.18)';
                } else if (rankPos === 2) {
                  medalColor = '#cbd5e1';
                  avatarSize = 50;
                  bgStyle = 'linear-gradient(90deg, rgba(203, 213, 225, 0.14), rgba(0,0,0,0.34))';
                  borderStyle = '1px solid rgba(203, 213, 225, 0.5)';
                } else if (rankPos === 3) {
                  medalColor = '#cd7f32';
                  avatarSize = 48;
                  bgStyle = 'linear-gradient(90deg, rgba(205, 127, 50, 0.15), rgba(0,0,0,0.34))';
                  borderStyle = '1px solid rgba(205, 127, 50, 0.5)';
                }

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
                      gap: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: '36px',
                        textAlign: 'center',
                        fontSize: rankPos <= 3 ? '1.22rem' : '1.02rem',
                        fontWeight: 900,
                        color: medalColor,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {rankPos === 1 && <Crown size={18} color="#fbbf24" fill="#fbbf24" style={{ marginBottom: 2 }} />}
                        <span>{rankPos}º</span>
                      </div>

                      <div
                        style={{
                          position: 'relative',
                          width: avatarSize,
                          height: avatarSize,
                          borderRadius: '50%',
                          border: `2px solid ${medalColor}`,
                          background: 'radial-gradient(circle, rgba(255,255,255,0.08), rgba(0,0,0,0.6))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'visible',
                          flexShrink: 0,
                        }}
                      >
                        {sRank.imageUrl ? (
                          <CachedImage
                            src={sRank.imageUrl}
                            alt={sRank.name}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              borderRadius: '50%',
                              opacity: showAvatars ? 0.35 : 1,
                              zIndex: 0,
                            }}
                          />
                        ) : null}

                        {showAvatars && entry.avatarConfig && (
                          <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
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
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '0.15rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: isSelf ? '#fbbf24' : '#f8fafc', fontSize: '0.96rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {charName}
                          </span>
                          {isSelf && (
                            <span style={{ fontSize: '0.65rem', background: 'rgba(251, 191, 36, 0.2)', border: '1px solid rgba(251, 191, 36, 0.5)', color: '#fbbf24', padding: '1px 6px', borderRadius: '999px', fontWeight: 'bold' }}>
                              VOCÊ
                            </span>
                          )}
                          {entry.completedCampaign && (
                            <span style={{ fontSize: '0.65rem', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid rgba(34, 197, 94, 0.45)', color: '#4ade80', padding: '1px 6px', borderRadius: '999px', fontWeight: 'bold' }}>
                              🏆 ZEROU!
                            </span>
                          )}
                          {renderMovementIndicator(entry, rankPos)}
                        </div>
                        {showRealNameSub && (
                          <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.studentName}
                          </span>
                        )}
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          {entry.stageReachedLabel || 'Estágio 1'} · Abates: <strong style={{ color: '#cbd5e1' }}>{entry.kills || 0}</strong>
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: rankPos === 1 ? '1.22rem' : '1.08rem', fontWeight: 900, color: '#facc15', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                        {(entry.bestScore || 0).toLocaleString('pt-BR')}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700 }}>
                        PONTOS
                      </div>
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

export default ArcadeScoreRankingModal;
