import React, { useEffect, useState } from 'react';
import { X, Trophy, Swords, Sparkles, HelpCircle, ShieldAlert, Award } from 'lucide-react';
import { supabase } from '../lib/supabase';
import AvatarCharacter from './AvatarCharacter';
import { buildDynamicStudentBiography } from '../lib/monsterAiBiography';

export interface BestiaryMonsterData {
  monsterName: string;
  coverImageUrl?: string;
  avatarConfig?: any;
  modelUrl?: string;
  possibleDrops?: Array<{ itemId: string; itemTitle?: string; itemImageUrl?: string; rarity?: string }>;
  biography?: string;
  firstDefeatedAt?: string;
  winsCount: number;
  defeatsCount: number;
  discoveredDropItemIds: string[];
}

interface MonsterBestiaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  monsterData: BestiaryMonsterData | null;
}

export const MonsterBestiaryModal: React.FC<MonsterBestiaryModalProps> = ({
  isOpen,
  onClose,
  monsterData
}) => {
  const [storeItemsMap, setStoreItemsMap] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    if (!isOpen || !monsterData) return;
    let active = true;

    async function loadItemDetails() {
      try {
        const { data } = await supabase.from('store_items').select('*');
        if (active && data) {
          const m = new Map<string, any>();
          data.forEach(d => m.set(d.id, { ...(d.data || {}), title: d.title || d.name, imageUrl: d.image_url || d.data?.imageUrl }));
          setStoreItemsMap(m);
        }
      } catch (e) {
        console.error('Erro ao carregar itens para o bestiário:', e);
      }
    }

    loadItemDetails();
    return () => { active = false; };
  }, [isOpen, monsterData]);

  if (!isOpen || !monsterData) return null;

  const dynamicBio = buildDynamicStudentBiography(monsterData.biography || '', {
    monsterName: monsterData.monsterName,
    drops: monsterData.possibleDrops,
    studentEncounters: {
      wins: monsterData.winsCount,
      defeats: monsterData.defeatsCount,
      discoveredDropTitles: monsterData.possibleDrops
        ?.filter(d => monsterData.discoveredDropItemIds.includes(d.itemId))
        .map(d => d.itemTitle || storeItemsMap.get(d.itemId)?.title || 'Item') || []
    }
  });

  return (
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div 
        className="glass-panel modal-content" 
        style={{
          width: '95%',
          maxWidth: '850px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: '16px',
          border: '2px solid rgba(168, 85, 247, 0.4)',
          boxShadow: '0 0 35px rgba(168, 85, 247, 0.25)',
          background: 'linear-gradient(135deg, #120d1f 0%, #0d0914 100%)'
        }}
      >
        {/* Cabeçalho */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.1rem 1.5rem',
          borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
          background: 'rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '8px',
              background: 'rgba(168, 85, 247, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.4)'
            }}>
              👾
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#f3e8ff', letterSpacing: '0.5px' }}>
                Bestiário do Reino: <span style={{ color: '#c084fc' }}>{monsterData.monsterName}</span>
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#a855f7', marginTop: '2px' }}>
                Entidade Catalogada · Registro Oficial de Combate
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Corpo com Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 320px) 1fr',
          gap: '1.5rem',
          padding: '1.5rem',
          overflowY: 'auto',
          flex: 1
        }}>
          {/* Coluna Esquerda: Aparência e Estatísticas de Encontro */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              height: '280px',
              width: '100%',
              borderRadius: '12px',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {monsterData.avatarConfig ? (
                <AvatarCharacter config={monsterData.avatarConfig} size={220} animation="idle" />
              ) : monsterData.coverImageUrl ? (
                <img 
                  src={monsterData.coverImageUrl} 
                  alt={monsterData.monsterName} 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                />
              ) : (
                <div style={{ fontSize: '4rem' }}>👾</div>
              )}
            </div>

            {/* Painel de Estatísticas de Combate */}
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '1rem',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.06)'
            }}>
              <h5 style={{ margin: '0 0 0.6rem 0', color: 'var(--gold-primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Swords size={14} /> Histórico de Encontros
              </h5>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Vitórias conquistadas:</span>
                <strong style={{ color: 'var(--accent-green, #10b981)' }}>{monsterData.winsCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Derrotas sofridas:</span>
                <strong style={{ color: monsterData.defeatsCount > 0 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                  {monsterData.defeatsCount}
                </strong>
              </div>
              {monsterData.firstDefeatedAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.5rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>1º Desbloqueio:</span>
                  <span style={{ color: '#c084fc' }}>
                    {new Date(monsterData.firstDefeatedAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita: Biografia Dinâmica e Espólios (Drops) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Seção Biografia Dinâmica */}
            <div style={{
              background: 'rgba(0,0,0,0.25)',
              padding: '1.2rem',
              borderRadius: '12px',
              border: '1px solid rgba(168, 85, 247, 0.2)',
            }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#c084fc', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={16} /> Alma & Lenda da Criatura
              </h4>
              <div style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: '0.88rem',
                lineHeight: 1.6,
                whiteSpace: 'pre-line'
              }}>
                {dynamicBio}
              </div>
            </div>

            {/* Seção Espólios & Drops Possíveis */}
            <div style={{
              background: 'rgba(0,0,0,0.25)',
              padding: '1.2rem',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <h4 style={{ margin: 0, color: 'var(--gold-primary)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Award size={16} /> Espólios & Drops Possíveis
                </h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Descobertos: {monsterData.possibleDrops?.filter(d => monsterData.discoveredDropItemIds.includes(d.itemId)).length || 0} / {monsterData.possibleDrops?.length || 0}
                </span>
              </div>

              {(!monsterData.possibleDrops || monsterData.possibleDrops.length === 0) ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
                  Nenhum espólio raro conhecido para este monstro.
                </p>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '0.75rem'
                }}>
                  {monsterData.possibleDrops.map((drop, idx) => {
                    const isDiscovered = monsterData.discoveredDropItemIds.includes(drop.itemId);
                    const itemDetails = storeItemsMap.get(drop.itemId) || {};
                    const title = drop.itemTitle || itemDetails.title || 'Item Secreto';
                    const image = drop.itemImageUrl || itemDetails.imageUrl || '';

                    if (isDiscovered) {
                      return (
                        <div
                          key={drop.itemId || idx}
                          style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            borderRadius: '8px',
                            padding: '0.75rem 0.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            gap: '0.4rem'
                          }}
                        >
                          <div style={{ width: 42, height: 42, borderRadius: '6px', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {image ? (
                              <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <span>🎁</span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 'bold', lineHeight: 1.2 }}>
                            {title}
                          </span>
                          <span style={{ fontSize: '0.65rem', color: 'rgba(16, 185, 129, 0.8)', background: 'rgba(16, 185, 129, 0.2)', padding: '1px 6px', borderRadius: '4px' }}>
                            Descoberto ✓
                          </span>
                        </div>
                      );
                    }

                    // Item Não Descoberto (com interrogação ?)
                    return (
                      <div
                        key={drop.itemId || idx}
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px dashed rgba(255,255,255,0.2)',
                          borderRadius: '8px',
                          padding: '0.75rem 0.5rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          gap: '0.4rem',
                          opacity: 0.85
                        }}
                      >
                        <div style={{
                          width: 42,
                          height: 42,
                          borderRadius: '6px',
                          background: 'rgba(0,0,0,0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#f59e0b',
                          fontSize: '1.2rem',
                          fontWeight: 'bold'
                        }}>
                          <HelpCircle size={24} color="#f59e0b" />
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          Drop Desconhecido
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                          Oculto ?
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonsterBestiaryModal;
