import React, { useEffect, useState, useMemo, useRef } from 'react';
import { X, Swords, Sparkles, HelpCircle, Award, Lock, BookOpen, ChevronRight, ArrowLeft, ShieldAlert, RotateCcw } from 'lucide-react';
import { SkinViewer, IdleAnimation } from 'skinview3d';
import { supabase } from '../lib/supabase';
import AvatarCharacter from './AvatarCharacter';
import CustomModelViewer from './CustomModelViewer';
import { buildDynamicStudentBiography } from '../lib/monsterAiBiography';
import { fetchStudentBestiaryCompendium, type BestiaryCompendiumEntry, type StudentBestiaryCompendium } from '../lib/achievementHistory';

interface BlockMonsterViewerProps {
  skinUrl: string;
  gender?: string;
}

const BlockMonsterViewer: React.FC<BlockMonsterViewerProps> = React.memo(({
  skinUrl,
  gender = 'male'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth || 380;
    const h = container.clientHeight || 410;

    let viewer: SkinViewer;
    try {
      viewer = new SkinViewer({
        canvas: canvasRef.current,
        width: w,
        height: h,
        model: gender === 'female' ? 'slim' : 'default'
      });

      viewer.animation = new IdleAnimation();
      viewer.controls.enableZoom = true;
      viewer.controls.enableRotate = true;
      viewer.controls.enablePan = false;
      viewer.zoom = 1.0;
      viewer.camera.position.set(0, 0, 48);

      viewer.loadSkin(skinUrl).catch(err => {
        console.error('Erro ao carregar skin do monstro:', err);
      });

      viewerRef.current = viewer;

      const handleResize = () => {
        if (!containerRef.current || !viewerRef.current) return;
        const newW = containerRef.current.clientWidth;
        const newH = containerRef.current.clientHeight;
        if (newW > 0 && newH > 0) {
          viewerRef.current.width = newW;
          viewerRef.current.height = newH;
        }
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        try { viewer.dispose(); } catch {}
        viewerRef.current = null;
      };
    } catch (e) {
      console.error('Falha ao inicializar BlockMonsterViewer:', e);
    }
  }, [skinUrl, gender]);

  const zoomIn = () => {
    if (viewerRef.current) {
      viewerRef.current.zoom = Math.min(viewerRef.current.zoom + 0.15, 2.2);
    }
  };

  const zoomOut = () => {
    if (viewerRef.current) {
      viewerRef.current.zoom = Math.max(viewerRef.current.zoom - 0.15, 0.5);
    }
  };

  const resetView = () => {
    if (viewerRef.current) {
      viewerRef.current.zoom = 1.0;
      viewerRef.current.camera.position.set(0, 0, 48);
      viewerRef.current.controls.reset();
    }
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }} />
      {/* Controles de Zoom rápidos no canto do palco */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        right: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        padding: '3px 8px',
        borderRadius: '8px',
        border: '1px solid rgba(168, 85, 247, 0.35)',
        zIndex: 10
      }}>
        <button
          type="button"
          onClick={zoomIn}
          title="Aproximar Zoom (+)"
          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px 6px', fontSize: '1rem', fontWeight: 'bold' }}
        >
          +
        </button>
        <button
          type="button"
          onClick={zoomOut}
          title="Afastar Zoom (-)"
          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px 6px', fontSize: '1rem', fontWeight: 'bold' }}
        >
          -
        </button>
        <button
          type="button"
          onClick={resetView}
          title="Redefinir Câmera"
          style={{ background: 'transparent', border: 'none', color: '#c084fc', cursor: 'pointer', padding: '2px 6px', fontSize: '0.85rem' }}
        >
          ↺
        </button>
      </div>
    </div>
  );
});

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

export interface MonsterBestiaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentUid?: string;
  initialMonsterName?: string;
  /** Compatibilidade com chamadas diretas que fornecem monsterData */
  monsterData?: BestiaryMonsterData | null;
}

export const MonsterBestiaryModal: React.FC<MonsterBestiaryModalProps> = ({
  isOpen,
  onClose,
  studentUid,
  initialMonsterName,
  monsterData
}) => {
  const [compendium, setCompendium] = useState<StudentBestiaryCompendium | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMonsterId, setSelectedMonsterId] = useState<string | null>(null);
  const [storeItemsMap, setStoreItemsMap] = useState<Map<string, any>>(new Map());
  const [glbCameraDist, setGlbCameraDist] = useState<number>(8.8);

  useEffect(() => {
    setGlbCameraDist(8.8);
  }, [selectedMonsterId]);

  // Responsividade mobile
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpenMobile(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Carrega itens da loja para enriquecer espólios (drops)
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  // Carrega o compêndio do bestiário do aluno
  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    async function loadCompendium() {
      setLoading(true);

      // Se foi passado studentUid, busca compêndio do banco
      if (studentUid) {
        try {
          const result = await fetchStudentBestiaryCompendium(studentUid);
          if (!active) return;
          setCompendium(result);

          // Seleciona o monstro inicial se especificado
          if (initialMonsterName) {
            const match = result.entries.find(
              e => (e.monsterName && e.monsterName.trim().toLowerCase() === initialMonsterName.trim().toLowerCase()) ||
                   (e.name && e.name !== '???' && e.name.trim().toLowerCase() === initialMonsterName.trim().toLowerCase())
            );
            if (match) {
              setSelectedMonsterId(match.id);
              setIsSidebarOpenMobile(false);
              setLoading(false);
              return;
            }
          }

          // Caso contrário, seleciona o primeiro desbloqueado
          const firstUnlocked = result.entries.find(e => e.isUnlocked);
          if (firstUnlocked) {
            setSelectedMonsterId(firstUnlocked.id);
          } else if (result.entries.length > 0) {
            setSelectedMonsterId(result.entries[0].id);
          }
        } catch (err) {
          console.error('Erro ao carregar compêndio:', err);
        } finally {
          if (active) setLoading(false);
        }
        return;
      }

      // Se for passado monsterData único diretamente (modo legado)
      if (monsterData) {
        const singleEntry: BestiaryCompendiumEntry = {
          id: `single-${monsterData.monsterName}`,
          name: monsterData.monsterName,
          isUnlocked: true,
          coverImageUrl: monsterData.coverImageUrl,
          avatarConfig: monsterData.avatarConfig,
          modelUrl: monsterData.modelUrl,
          possibleDrops: monsterData.possibleDrops,
          biography: monsterData.biography,
          firstDefeatedAt: monsterData.firstDefeatedAt,
          winsCount: monsterData.winsCount,
          defeatsCount: monsterData.defeatsCount,
          discoveredDropItemIds: monsterData.discoveredDropItemIds
        };

        setCompendium({
          entries: [singleEntry],
          totalMonsters: 1,
          unlockedCount: 1,
          hasUnlockedBestiary: true
        });
        setSelectedMonsterId(singleEntry.id);
        setIsSidebarOpenMobile(false);
        setLoading(false);
      }
    }

    loadCompendium();
    return () => { active = false; };
  }, [isOpen, studentUid, initialMonsterName, monsterData]);

  // Monstro atualmente selecionado
  const selectedMonster = useMemo(() => {
    if (!compendium || !selectedMonsterId) return null;
    return compendium.entries.find(e => e.id === selectedMonsterId) || null;
  }, [compendium, selectedMonsterId]);

  if (!isOpen) return null;

  const unlockedCount = compendium?.unlockedCount || 0;
  const totalCount = compendium?.totalMonsters || 0;

  // Monta a biografia dinâmica da IA para a criatura selecionada
  const dynamicBio = selectedMonster && selectedMonster.isUnlocked ? buildDynamicStudentBiography(selectedMonster.biography || '', {
    monsterName: selectedMonster.name,
    drops: selectedMonster.possibleDrops,
    studentEncounters: {
      wins: selectedMonster.winsCount,
      defeats: selectedMonster.defeatsCount,
      discoveredDropTitles: selectedMonster.possibleDrops
        ?.filter(d => selectedMonster.discoveredDropItemIds.includes(d.itemId))
        .map(d => d.itemTitle || storeItemsMap.get(d.itemId)?.title || 'Item') || []
    }
  }) : '';

  return (
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div 
        className="glass-panel modal-content" 
        style={{
          width: '95%',
          maxWidth: '1020px',
          height: '88vh',
          maxHeight: '820px',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: '16px',
          border: '2px solid rgba(168, 85, 247, 0.4)',
          boxShadow: '0 0 40px rgba(168, 85, 247, 0.25)',
          background: 'linear-gradient(135deg, #100a1c 0%, #0a0612 100%)'
        }}
      >
        {/* Cabeçalho do Bestiário */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: isMobile ? '0.85rem 1rem' : '1.1rem 1.6rem',
          borderBottom: '1px solid rgba(168, 85, 247, 0.22)',
          background: 'rgba(0,0,0,0.4)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(126, 34, 206, 0.2) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              boxShadow: '0 0 12px rgba(168, 85, 247, 0.3)',
              fontSize: '1.25rem'
            }}>
              👾
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: isMobile ? '1.05rem' : '1.25rem', color: '#f3e8ff', letterSpacing: '0.5px' }}>
                  Bestiário do Reino
                </h3>
                <span style={{
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(168, 85, 247, 0.2)',
                  color: '#d8b4fe',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  fontWeight: 600
                }}>
                  {unlockedCount} / {totalCount} Descobertos
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#a855f7', marginTop: '2px' }}>
                Compêndio Ancestral de Criaturas Enfrentadas
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {/* Botão de Alternar Menu no Celular */}
            {isMobile && (
              <button
                type="button"
                onClick={() => setIsSidebarOpenMobile(prev => !prev)}
                style={{
                  background: isSidebarOpenMobile ? 'var(--gold-primary)' : 'rgba(168, 85, 247, 0.25)',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  color: isSidebarOpenMobile ? '#000' : '#e9d5ff',
                  borderRadius: '8px',
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer'
                }}
              >
                {isSidebarOpenMobile ? <Swords size={14} /> : <BookOpen size={14} />}
                {isSidebarOpenMobile ? 'Ver Monstro' : 'Lista'}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Fechar"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Corpo do Compêndio (2 Colunas no Desktop / Alternável no Mobile) */}
        <div style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          position: 'relative'
        }}>
          {/* Coluna Esquerda: Menu de Seleção de Monstros */}
          <div 
            style={{
              width: isMobile ? '100%' : '270px',
              borderRight: isMobile ? 'none' : '1px solid rgba(168, 85, 247, 0.2)',
              background: 'rgba(0,0,0,0.35)',
              display: isMobile ? (isSidebarOpenMobile ? 'flex' : 'none') : 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              overflowY: 'auto'
            }}
          >
            <div style={{
              padding: '0.9rem 1rem',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <BookOpen size={14} color="#c084fc" /> Catálogo ({compendium?.entries.length || 0})
              </span>
              <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                {unlockedCount} Conhecidos
              </span>
            </div>

            {/* Lista dos Monstros */}
            <div style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {loading ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Carregando compêndio...
                </div>
              ) : compendium?.entries.map((entry) => {
                const isSelected = selectedMonsterId === entry.id;

                if (entry.isUnlocked) {
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setSelectedMonsterId(entry.id);
                        if (isMobile) setIsSidebarOpenMobile(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '10px',
                        background: isSelected 
                          ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(126, 34, 206, 0.4) 100%)'
                          : 'rgba(255,255,255,0.04)',
                        border: isSelected 
                          ? '1.5px solid #a855f7' 
                          : '1px solid rgba(255,255,255,0.08)',
                        boxShadow: isSelected ? '0 0 14px rgba(168, 85, 247, 0.3)' : 'none',
                        color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.85)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: '8px',
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(168, 85, 247, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1rem',
                          overflow: 'hidden',
                          flexShrink: 0
                        }}>
                          {entry.avatarConfig ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                              <AvatarCharacter
                                key={`sidebar-avatar-${entry.id}`}
                                config={{
                                  ...entry.avatarConfig,
                                  customSkinUrl: entry.avatarConfig.customSkinUrl || entry.coverImageUrl,
                                  customZoom: entry.avatarConfig.customModelUrl ? 0.95 : (entry.avatarConfig.customZoom || 1)
                                }}
                                size={entry.avatarConfig.customModelUrl ? 32 : 18}
                                animation="idle"
                                interactive={false}
                                role="monster"
                              />
                            </div>
                          ) : entry.coverImageUrl ? (
                            <img src={entry.coverImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : (
                            <span>👾</span>
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '0.88rem',
                            fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? '#f5d0fe' : '#ffffff',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {entry.name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#10b981' }}>
                            {entry.winsCount} vitórias
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={16} color={isSelected ? '#c084fc' : 'rgba(255,255,255,0.3)'} />
                    </button>
                  );
                }

                // Monstro Bloqueado (??? / Desconhecido)
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '10px',
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px dashed rgba(255,255,255,0.1)',
                      opacity: 0.45,
                      cursor: 'not-allowed',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: '8px',
                        background: 'rgba(0,0,0,0.6)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#6b7280'
                      }}>
                        <Lock size={15} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '2px' }}>
                          ???
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)' }}>
                          Não descoberto
                        </div>
                      </div>
                    </div>
                    <HelpCircle size={15} color="rgba(255,255,255,0.2)" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coluna Direita: Detalhes do Monstro Selecionado */}
          <div 
            style={{
              flex: 1,
              display: isMobile ? (isSidebarOpenMobile ? 'none' : 'flex') : 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              padding: isMobile ? '1rem' : '1.5rem',
              gap: '1.25rem'
            }}
          >
            {/* Botão de Retornar à Lista no Celular */}
            {isMobile && (
              <button
                type="button"
                onClick={() => setIsSidebarOpenMobile(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: 'rgba(168, 85, 247, 0.2)',
                  border: '1px solid rgba(168, 85, 247, 0.35)',
                  color: '#e9d5ff',
                  borderRadius: '8px',
                  padding: '0.45rem 0.8rem',
                  fontSize: '0.82rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  alignSelf: 'flex-start'
                }}
              >
                <ArrowLeft size={16} /> Ver Lista de Monstros
              </button>
            )}

            {!selectedMonster ? (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '3rem 1.5rem',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📖</div>
                <h4 style={{ color: '#f3e8ff', margin: '0 0 0.5rem 0' }}>Selecione uma criatura</h4>
                <p style={{ maxWidth: '400px', fontSize: '0.88rem' }}>
                  Explore os monstros desbloqueados no menu para visualizar seus modelos 3D, estatísticas de combate e espólios conquistados.
                </p>
              </div>
            ) : !selectedMonster.isUnlocked ? (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '3rem 1.5rem',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ fontSize: '3.5rem', marginBottom: '1rem', opacity: 0.4 }}>🔒</div>
                <h4 style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 0.5rem 0', letterSpacing: '1px' }}>Entidade Oculta (???)</h4>
                <p style={{ maxWidth: '420px', fontSize: '0.88rem', lineHeight: 1.5 }}>
                  Esta criatura ainda não foi enfrentada e derrotada por você. Avance nas missões do Reino para descobrir sua lenda e fraquezas!
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Banner do Título do Monstro */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
                  paddingBottom: '0.75rem'
                }}>
                  <div>
                    <h2 style={{
                      margin: 0,
                      fontSize: isMobile ? '1.3rem' : '1.65rem',
                      color: '#f5d0fe',
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      {selectedMonster.name}
                    </h2>
                    <div style={{ fontSize: '0.8rem', color: '#c084fc', marginTop: '3px' }}>
                      {selectedMonster.firstQuestTitle ? `1ª Aparição na missão "${selectedMonster.firstQuestTitle}"` : 'Entidade Catalogada no Bestiário'}
                    </div>
                  </div>

                  <span style={{
                    fontSize: '0.78rem',
                    color: '#10b981',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontWeight: 600
                  }}>
                    ✓ Desbloqueado
                  </span>
                </div>

                {/* Grid Superior: Palco 3D + Painéis de Informações Rápidas */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'minmax(340px, 420px) 1fr',
                  gap: '1.25rem',
                  alignItems: 'start'
                }}>
                  {/* Palco 3D da Criatura */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div style={{
                      height: isMobile ? '350px' : '410px',
                      width: '100%',
                      borderRadius: '16px',
                      background: 'radial-gradient(circle at 50% 40%, rgba(168, 85, 247, 0.22) 0%, rgba(10, 5, 20, 0.95) 75%)',
                      border: '1.5px solid rgba(168, 85, 247, 0.35)',
                      boxShadow: 'inset 0 0 35px rgba(168, 85, 247, 0.2), 0 0 20px rgba(0,0,0,0.6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {(() => {
                        const isCustomModel = !!(selectedMonster.avatarConfig?.customModelUrl || (selectedMonster.modelUrl && selectedMonster.modelUrl.endsWith('.glb')));
                        const modelUrl = selectedMonster.avatarConfig?.customModelUrl || (selectedMonster.modelUrl && selectedMonster.modelUrl.endsWith('.glb') ? selectedMonster.modelUrl : undefined);
                        const skinUrl = selectedMonster.avatarConfig?.customSkinUrl || selectedMonster.coverImageUrl;

                        const effectiveConfig = {
                          ...(selectedMonster.avatarConfig || {}),
                          customModelUrl: modelUrl,
                          customSkinUrl: skinUrl,
                          customZoom: isCustomModel 
                            ? Math.min(selectedMonster.avatarConfig?.customZoom || 1, 1.1) 
                            : (selectedMonster.avatarConfig?.customZoom || 1)
                        };

                        if (isCustomModel && modelUrl) {
                          return (
                            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                              <CustomModelViewer
                                key={`custom-stage-${selectedMonster.id}`}
                                modelUrl={modelUrl}
                                textureUrl={skinUrl}
                                animation="idle"
                                width="100%"
                                height="100%"
                                size={isMobile ? 350 : 410}
                                interactive={true}
                                role="monster"
                                zoom={effectiveConfig.customZoom || 1}
                                configRotY={effectiveConfig.customRotY}
                                cameraDistance={glbCameraDist}
                              />
                              {/* Botões de Zoom rápidos no palco GLB */}
                              <div style={{
                                position: 'absolute',
                                bottom: '10px',
                                right: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(0,0,0,0.7)',
                                backdropFilter: 'blur(8px)',
                                padding: '3px 8px',
                                borderRadius: '8px',
                                border: '1px solid rgba(168, 85, 247, 0.35)',
                                zIndex: 10
                              }}>
                                <button
                                  type="button"
                                  onClick={() => setGlbCameraDist(prev => Math.max(4.5, prev - 1.2))}
                                  title="Aproximar Zoom (+)"
                                  style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px 6px', fontSize: '1rem', fontWeight: 'bold' }}
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setGlbCameraDist(prev => Math.min(15.0, prev + 1.2))}
                                  title="Afastar Zoom (-)"
                                  style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px 6px', fontSize: '1rem', fontWeight: 'bold' }}
                                >
                                  -
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setGlbCameraDist(8.8)}
                                  title="Redefinir Câmera"
                                  style={{ background: 'transparent', border: 'none', color: '#c084fc', cursor: 'pointer', padding: '2px 6px', fontSize: '0.85rem' }}
                                >
                                  ↺
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (skinUrl) {
                          return (
                            <BlockMonsterViewer
                              key={`block-stage-${selectedMonster.id}`}
                              skinUrl={skinUrl}
                              gender={effectiveConfig.gender}
                            />
                          );
                        }

                        if (selectedMonster.coverImageUrl) {
                          return (
                            <img 
                              src={selectedMonster.coverImageUrl} 
                              alt={selectedMonster.name} 
                              style={{ width: '80%', height: '80%', objectFit: 'contain' }} 
                            />
                          );
                        }

                        return <div style={{ fontSize: '5rem' }}>👾</div>;
                      })()}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.5)',
                      textAlign: 'center',
                      fontStyle: 'italic',
                      padding: '2px 0'
                    }}>
                      ↻ Arraste com o mouse ou toque para girar em 3D • Use o scroll ou [+] [-] para zoom
                    </div>
                  </div>

                  {/* Painel Direito Superior: Estatísticas do Aluno + Poder de Combate */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{
                      background: 'rgba(0,0,0,0.35)',
                      padding: '1.1rem',
                      borderRadius: '12px',
                      border: '1px solid rgba(168, 85, 247, 0.25)'
                    }}>
                      <h5 style={{
                        margin: '0 0 0.8rem 0',
                        color: 'var(--gold-primary)',
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        letterSpacing: '0.3px'
                      }}>
                        <Swords size={16} /> Histórico de Batalhas do Aluno
                      </h5>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Vitórias conquistadas:</span>
                          <strong style={{ color: 'var(--accent-green, #10b981)', fontWeight: 'bold' }}>
                            {selectedMonster.winsCount}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Derrotas sofridas:</span>
                          <strong style={{ color: selectedMonster.defeatsCount > 0 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                            {selectedMonster.defeatsCount}
                          </strong>
                        </div>
                        {selectedMonster.firstDefeatedAt && (
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.8rem',
                            marginTop: '0.4rem',
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            paddingTop: '0.5rem'
                          }}>
                            <span style={{ color: 'var(--text-secondary)' }}>1º Registro no Tomo:</span>
                            <span style={{ color: '#c084fc', fontWeight: 600 }}>
                              {new Date(selectedMonster.firstDefeatedAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        )}
                        {selectedMonster.firstQuestTitle && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Missão de Origem:</span>
                            <span style={{ color: '#e9d5ff', fontWeight: 500 }}>
                              {selectedMonster.firstQuestTitle}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Poder & Informações de Combate */}
                    <div style={{
                      background: 'rgba(0,0,0,0.35)',
                      padding: '1.1rem',
                      borderRadius: '12px',
                      border: '1px solid rgba(168, 85, 247, 0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem'
                    }}>
                      <h5 style={{
                        margin: 0,
                        color: 'var(--gold-primary)',
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        letterSpacing: '0.3px'
                      }}>
                        <ShieldAlert size={16} /> Poder & Informações de Combate
                      </h5>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>Nível de Ameaça</span>
                          <strong style={{ color: '#f5d0fe' }}>Nv. {selectedMonster.avatarConfig?.stats?.level || 1}</strong>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>Poder de Ataque</span>
                          <strong style={{ color: '#f87171' }}>⚔ {selectedMonster.avatarConfig?.stats?.attack || '—'}</strong>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>Defesa Base</span>
                          <strong style={{ color: '#60a5fa' }}>🛡 {selectedMonster.avatarConfig?.stats?.defense || '—'}</strong>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.72rem' }}>Comportamento</span>
                          <strong style={{ color: '#34d399', textTransform: 'capitalize' }}>
                            {selectedMonster.avatarConfig?.attacks?.primaryAttack === 'ranged' ? 'À Distância' : 'Corpo a Corpo'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção Central: Biografia Dinâmica e Lenda Ancestral */}
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '1.25rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  marginTop: '0.25rem'
                }}>
                  <h4 style={{
                    margin: '0 0 0.8rem 0',
                    color: '#c084fc',
                    fontSize: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    letterSpacing: '0.3px'
                  }}>
                    <Sparkles size={18} /> Alma & Lenda da Criatura
                  </h4>
                  <div style={{
                    color: 'rgba(255,255,255,0.88)',
                    fontSize: '0.88rem',
                    lineHeight: 1.65,
                    whiteSpace: 'pre-line'
                  }}>
                    {dynamicBio}
                  </div>
                </div>

                {/* Seção Inferior: Espólios & Drops Possíveis */}
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '1.2rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  marginTop: '0.5rem'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.85rem',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    <h4 style={{ margin: 0, color: 'var(--gold-primary)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Award size={16} /> Espólios & Drops Possíveis
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Descobertos: {selectedMonster.possibleDrops?.filter(d => selectedMonster.discoveredDropItemIds.includes(d.itemId)).length || 0} / {selectedMonster.possibleDrops?.length || 0}
                    </span>
                  </div>

                  {(!selectedMonster.possibleDrops || selectedMonster.possibleDrops.length === 0) ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
                      Nenhum espólio raro conhecido para este monstro.
                    </p>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                      gap: '0.75rem'
                    }}>
                      {selectedMonster.possibleDrops.map((drop, idx) => {
                        const isDiscovered = selectedMonster.discoveredDropItemIds.includes(drop.itemId);
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonsterBestiaryModal;
