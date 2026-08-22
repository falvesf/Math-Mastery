import { useEffect, useState } from 'react';
import { X, Shield, Swords, Trophy, Crosshair, Skull, UserPlus, UserMinus, History, Package, Star } from 'lucide-react';
import AvatarCharacter, { type EquippedItem } from './AvatarCharacter';
import { type UserData } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { calculateTotalStats } from '../lib/gacha';
import { RANKS } from '../lib/ranks';
import { fetchStudentAchievementHistory, type AchievementItem } from '../lib/achievementHistory';
import NintendoHeart from './NintendoHeart';

interface PublicProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserData;
  equippedItems: EquippedItem[];
  rankName: string;
  rankColor: string;
  rankPos?: number;
}

export default function PublicProfileModal({ isOpen, onClose, user, equippedItems, rankName, rankColor, rankPos }: PublicProfileModalProps) {
  const [questStats, setQuestStats] = useState({ participations: 0, wins: 0, defeats: 0 });
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !user.uid) {
      setLoading(false);
      return;
    }
    
    const fetchStats = async () => {
      setLoading(true);
      try {
        const { data: snap } = await supabase.from('quest_attempts').select('*').eq('student_id', user.uid).order('created_at', { ascending: false });
        
        let wins = 0;
        let defeats = 0;
        const uniqueQuests = new Set<string>();

        (snap || []).forEach((row: any) => {
          uniqueQuests.add(row.quest_id);
          if (row.status === 'completed') wins++;
          if (row.status === 'failed') defeats++;
        });

        setQuestStats({
          participations: uniqueQuests.size,
          wins,
          defeats
        });

        // Carrega o Histórico de Conquistas Completo
        const achList = await fetchStudentAchievementHistory(user.uid);
        setAchievements(achList);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [isOpen, user.uid]);

  if (!isOpen) return null;

  // Se for privado, não exibe os detalhes
  const isPrivate = user.isProfilePublic === false;

  const totalDefense = equippedItems.reduce((acc, item) => item.baseAttributeType === 'defense' ? acc + (item.baseAttributeValue || 0) : acc, 0);
  const totalAttack = equippedItems.reduce((acc, item) => item.baseAttributeType === 'attack' ? acc + (item.baseAttributeValue || 0) : acc, 0);

  const petItem = equippedItems.find(i => (i.itemCategory as string) === 'pet');

  const { userData: currentUser } = useAuth();
  const [isContact, setIsContact] = useState(false);

  useEffect(() => {
    if (!isOpen || !user.uid || !currentUser?.uid) return;
    const check = async () => {
      const { data } = await supabase
        .from('user_friends')
        .select('friend_id')
        .eq('user_id', currentUser.uid)
        .eq('friend_id', user.uid)
        .maybeSingle();
      setIsContact(!!data);
    };
    check();
  }, [isOpen, user.uid, currentUser?.uid]);

  const handleAddContact = async () => {
    if (!currentUser?.uid || !user.uid || currentUser.uid === user.uid) return;
    if (isContact) {
      const { error } = await supabase.from('user_friends').delete().eq('user_id', currentUser.uid).eq('friend_id', user.uid);
      if (!error) setIsContact(false);
    } else {
      const { error } = await supabase
        .from('user_friends')
        .upsert({ user_id: currentUser.uid, friend_id: user.uid }, { onConflict: 'user_id,friend_id' });
      if (!error) setIsContact(true);
    }
  };

  const stats = calculateTotalStats(equippedItems, user.distributedStats);
  const maxHearts = 3 + Math.floor((RANKS.findIndex(r => r.name === rankName) || 0) / 2) + Math.floor(stats.vitality / 30);
  
  let visualHp = user.hp !== undefined ? Number(user.hp) : maxHearts;
  if (user.hpRecoveryStartTimestamp && visualHp < maxHearts) {
    const startMs = typeof user.hpRecoveryStartTimestamp === 'string' ? new Date(user.hpRecoveryStartTimestamp).getTime() : Number(user.hpRecoveryStartTimestamp);
    const timePassed = Date.now() - startMs;
    if (timePassed > 0) {
      const recoveredHearts = Math.floor(timePassed / (30 * 60 * 1000));
      visualHp = Math.min(maxHearts, visualHp + recoveredHearts);
    }
  }

  let bgGradient = 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 100%)';
  if (rankPos === 1) bgGradient = 'linear-gradient(180deg, rgba(251, 191, 36, 0.3) 0%, rgba(0,0,0,0.5) 100%)'; // Ouro
  else if (rankPos === 2) bgGradient = 'linear-gradient(180deg, rgba(156, 163, 175, 0.3) 0%, rgba(0,0,0,0.5) 100%)'; // Prata
  else if (rankPos === 3) bgGradient = 'linear-gradient(180deg, rgba(180, 83, 9, 0.3) 0%, rgba(0,0,0,0.5) 100%)'; // Bronze

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '950px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', padding: '0' }}>
        
        <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'var(--btn-bg)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <X size={24} />
        </button>

        <div className="avatar-modal-grid" style={{ padding: '2rem', background: bgGradient, minHeight: '100%' }}>
          
          {/* Lado Esquerdo: Avatar, Nome, HP */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 220, height: 220, borderRadius: '50%', background: 'var(--bg-dark)', border: `4px solid ${rankColor}`, boxShadow: `0 0 30px ${rankColor}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', marginBottom: '1.5rem' }}>
              {user.avatarConfig ? (
                <AvatarCharacter 
                  config={user.avatarConfig} 
                  equippedItems={equippedItems} 
                  size={200} 
                  interactive={false} 
                  animation="idle" 
                  showSlots={false} 
                />
              ) : (
                <img src={user.photoURL} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              )}
              
              <div style={{ position: 'absolute', bottom: -15, background: 'var(--bg-dark)', padding: '0.4rem 1.5rem', borderRadius: '20px', border: `2px solid ${rankColor}`, color: rankColor, fontWeight: 'bold', fontSize: '1.1rem', whiteSpace: 'nowrap', zIndex: 10, textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                {rankName}
              </div>
            </div>

            <h2 style={{ fontSize: '1.8rem', margin: '1rem 0 0.5rem 0', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px', color: 'white' }}>
              {user.name}
            </h2>
            {user.customStatusText && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', fontStyle: 'italic', marginBottom: '1rem', background: 'var(--btn-bg)', padding: '0.5rem 1.5rem', borderRadius: '20px', textAlign: 'center' }}>
                "{user.customStatusText}"
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
              {Array.from({ length: maxHearts }).map((_, i) => (
                <NintendoHeart 
                  key={i} 
                  size={16} 
                  fillPercentage={i < visualHp ? 100 : 0} 
                  title={i < visualHp ? "Coração Cheio" : "Coração Vazio"} 
                />
              ))}
            </div>
            <button
              onClick={handleAddContact}
              style={{
                marginTop: '1rem', padding: '0.5rem 1.2rem', borderRadius: '20px',
                background: isContact ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.2)',
                border: isContact ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(16,185,129,0.5)',
                color: isContact ? '#f87171' : '#10b981', cursor: 'pointer',
                fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem'
              }}
            >
              {isContact ? <UserMinus size={16} /> : <UserPlus size={16} />}
              {isContact ? 'Remover dos contatos' : 'Adicionar aos contatos'}
            </button>
          </div>

          {/* Lado Direito: Abas de Informações e Histórico de Conquistas */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {isPrivate ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <Shield size={48} color="var(--text-secondary)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <h3 style={{ color: 'var(--text-secondary)', fontSize: '1.5rem', margin: 0 }}>Perfil Privado</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '0.5rem' }}>Este jogador escolheu ocultar suas estatísticas.</p>
              </div>
            ) : (
              <div>
                {/* Abas */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                  <button 
                    onClick={() => setActiveTab('stats')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: activeTab === 'stats' ? 'var(--gold-primary)' : 'transparent',
                      color: activeTab === 'stats' ? 'var(--bg-primary, #000)' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.95rem'
                    }}
                  >
                    <Trophy size={16} /> Status & Estatísticas
                  </button>
                  <button 
                    onClick={() => setActiveTab('history')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: activeTab === 'history' ? 'var(--gold-primary)' : 'transparent',
                      color: activeTab === 'history' ? 'var(--bg-primary, #000)' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.95rem'
                    }}
                  >
                    <History size={16} /> Histórico de Conquistas
                  </button>
                </div>

                {activeTab === 'stats' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
                    
                    {/* Estatísticas de Missões */}
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                      <h3 style={{ color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>
                        <Trophy size={18} /> Missões Concluídas
                      </h3>
                      
                      {loading ? (
                        <p style={{ color: 'var(--text-secondary)' }}>Carregando dados...</p>
                      ) : (
                        <div style={{ display: 'grid', gap: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}><Crosshair size={16} /> Participações</span>
                            <strong style={{ fontSize: '1.1rem' }}>{questStats.participations}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}><Trophy size={16} /> Vitórias</span>
                            <strong style={{ color: 'var(--accent-green)', fontSize: '1.1rem' }}>{questStats.wins}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}><Skull size={16} /> Derrotas</span>
                            <strong style={{ color: 'var(--accent-red)', fontSize: '1.1rem' }}>{questStats.defeats}</strong>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Equipamentos e Atributos */}
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                      <h3 style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>
                        <Swords size={18} /> Equipamentos & Status
                      </h3>
                      
                      <div style={{ display: 'grid', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}><Shield size={16} /> Defesa Total</span>
                          <strong style={{ color: 'var(--accent-blue)', fontSize: '1.1rem' }}>+{totalDefense}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}><Swords size={16} /> Força de Ataque</span>
                          <strong style={{ color: 'var(--accent-red)', fontSize: '1.1rem' }}>+{totalAttack}</strong>
                        </div>
                        {petItem && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Pet Equipado</span>
                            <strong style={{ color: 'var(--gold-primary)', fontSize: '1.1rem' }}>{petItem.itemTitle}</strong>
                          </div>
                        )}
                        {equippedItems.length === 0 && (
                          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', margin: 0, fontSize: '0.9rem' }}>Nenhum equipamento.</p>
                        )}
                      </div>
                    </div>

                  </div>
                ) : (
                  /* Feed do Histórico de Conquistas */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {loading ? (
                      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Carregando conquistas...</p>
                    ) : achievements.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                        <Star size={36} style={{ opacity: 0.5, margin: '0 auto 0.5rem auto' }} />
                        <p>Nenhuma conquista registrada ainda.</p>
                      </div>
                    ) : (
                      achievements.map((item, index) => {
                        const isRank = item.type === 'rank_up';
                        const isItem = item.type === 'item';
                        const isNegative = item.badgeType === 'xp_negative';
                        
                        let borderColor = 'var(--gold-primary)';
                        let badgeBg = 'rgba(251, 191, 36, 0.15)';
                        let badgeColor = 'var(--gold-primary)';
                        
                        if (isRank) {
                          borderColor = '#a855f7';
                          badgeBg = 'rgba(168, 85, 247, 0.2)';
                          badgeColor = '#c084fc';
                        } else if (isItem) {
                          borderColor = '#3b82f6';
                          badgeBg = 'rgba(59, 130, 246, 0.15)';
                          badgeColor = '#60a5fa';
                        } else if (isNegative) {
                          borderColor = 'var(--accent-red)';
                          badgeBg = 'rgba(239, 68, 68, 0.15)';
                          badgeColor = 'var(--accent-red)';
                        }

                        const dateObj = new Date(item.timestamp);

                        return (
                          <div key={item.id || index} style={{ padding: '0.9rem 1.1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', borderLeft: `4px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt="" style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '6px', flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {isRank ? <Trophy size={18} color="#c084fc" /> : isItem ? <Package size={18} color="#60a5fa" /> : <Star size={18} color="var(--gold-primary)" />}
                                </div>
                              )}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.15rem 0', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                  {item.title}
                                </h4>
                                {item.subtitle && (
                                  <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {item.subtitle}
                                  </p>
                                )}
                                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
                                  Data: {dateObj.toLocaleDateString('pt-BR')} | Hora: {dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: badgeColor, background: badgeBg, padding: '0.35rem 0.75rem', borderRadius: '16px', whiteSpace: 'nowrap', border: `1px solid ${borderColor}40` }}>
                              {item.badgeText}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
