import { useEffect, useState } from 'react';
import { X, Shield, Swords, Heart, Trophy, Crosshair, Skull } from 'lucide-react';
import AvatarCharacter, { type EquippedItem } from './AvatarCharacter';
import { type UserData } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface PublicProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserData;
  equippedItems: EquippedItem[];
  rankName: string;
  rankColor: string;
  rankPos?: number;
}

import { calculateTotalStats } from '../lib/gacha';
import { RANKS } from '../lib/ranks';
export default function PublicProfileModal({ isOpen, onClose, user, equippedItems, rankName, rankColor, rankPos }: PublicProfileModalProps) {
  const [questStats, setQuestStats] = useState({ participations: 0, wins: 0, defeats: 0 });
  const [recentQuests, setRecentQuests] = useState<any[]>([]);
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
        const recentAttempts = (snap || []).slice(0, 10);

        (snap || []).forEach((row: any) => {
          uniqueQuests.add(row.quest_id);
          if (row.status === 'completed') wins++;
          if (row.status === 'failed') defeats++;
        });

        const questsToFetch = Array.from(new Set(recentAttempts.map(a => a.quest_id)));
        const { data: questsData } = questsToFetch.length > 0 
          ? await supabase.from('quests').select('id, title').in('id', questsToFetch)
          : { data: [] };
          
        const questsMap = new Map((questsData || []).map(q => [q.id, q.title]));

        setRecentQuests(recentAttempts.map(a => ({
          ...a,
          title: questsMap.get(a.quest_id) || 'Missão Desconhecida'
        })));

        setQuestStats({
          participations: uniqueQuests.size,
          wins,
          defeats
        });
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
      <div className="glass-panel" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', padding: '0' }}>
        
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

            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {Array.from({ length: Math.max(10, maxHearts) }).map((_, i) => (
                <Heart key={i} size={20} fill={i < visualHp ? "var(--accent-red)" : "none"} color={i < visualHp ? "var(--accent-red)" : "rgba(255,255,255,0.2)"} />
              ))}
            </div>
          </div>

          {/* Lado Direito: Informações e Status */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {isPrivate ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <Shield size={48} color="var(--text-secondary)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <h3 style={{ color: 'var(--text-secondary)', fontSize: '1.5rem', margin: 0 }}>Perfil Privado</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '0.5rem' }}>Este jogador escolheu ocultar suas estatísticas.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                
                {/* Estatísticas de Missões */}
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1.5rem 0' }}>
                    <Trophy size={20} /> Histórico de Missões
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
                      
                      {recentQuests.length > 0 && (
                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
                          <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Últimas Missões</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {recentQuests.map((q, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{q.title}</span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: q.status === 'completed' ? 'var(--accent-green)' : (q.status === 'failed' ? 'var(--accent-red)' : 'var(--text-secondary)') }}>
                                  {q.status === 'completed' ? 'VITÓRIA' : (q.status === 'failed' ? 'FALHA' : 'ABANDONOU')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Equipamentos e Atributos */}
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1.5rem 0' }}>
                    <Swords size={20} /> Equipamentos & Status
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
