import { useEffect, useState } from 'react';
import { X, Shield, Swords, Heart, Trophy, Crosshair, Skull } from 'lucide-react';
import AvatarCharacter, { type EquippedItem } from './AvatarCharacter';
import { type UserData } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !user.uid) return;
    
    const fetchStats = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'quest_attempts'), where('studentId', '==', user.uid));
        const snap = await getDocs(q);
        
        let wins = 0;
        let defeats = 0;
        const uniqueQuests = new Set<string>();

        snap.forEach(d => {
          const data = d.data();
          uniqueQuests.add(data.questId);
          if (data.status === 'completed') wins++;
          if (data.status === 'failed') defeats++;
        });

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

  let bgGradient = 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 100%)';
  if (rankPos === 1) bgGradient = 'linear-gradient(180deg, rgba(251, 191, 36, 0.3) 0%, rgba(0,0,0,0.5) 100%)'; // Ouro
  else if (rankPos === 2) bgGradient = 'linear-gradient(180deg, rgba(156, 163, 175, 0.3) 0%, rgba(0,0,0,0.5) 100%)'; // Prata
  else if (rankPos === 3) bgGradient = 'linear-gradient(180deg, rgba(180, 83, 9, 0.3) 0%, rgba(0,0,0,0.5) 100%)'; // Bronze

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', padding: '0', display: 'flex', flexDirection: 'column' }}>
        
        <button onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'var(--btn-bg)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          <X size={24} />
        </button>

        <div style={{ padding: '3rem 2rem 2rem 2rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', alignItems: 'center', background: bgGradient }}>
          
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

          <h2 style={{ fontSize: '2.5rem', margin: '1rem 0 0.5rem 0', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px', color: 'white' }}>
            {user.name}
          </h2>
          {user.customStatusText && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', fontStyle: 'italic', marginBottom: '1rem', background: 'var(--btn-bg)', padding: '0.5rem 1.5rem', borderRadius: '20px' }}>
              "{user.customStatusText}"
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <Heart key={i} size={24} fill={i < (user.hearts || 0) ? "var(--accent-red)" : "none"} color={i < (user.hearts || 0) ? "var(--accent-red)" : "rgba(255,255,255,0.2)"} />
            ))}
          </div>
        </div>

        <div style={{ padding: '2rem' }}>
          {isPrivate ? (
            <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
              <Shield size={48} color="var(--text-secondary)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <h3 style={{ color: 'var(--text-secondary)', fontSize: '1.5rem', margin: 0 }}>Perfil Privado</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '0.5rem' }}>Este jogador escolheu ocultar suas estatísticas.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
              
              {/* Estatísticas de Missões */}
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <h3 style={{ color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1.5rem 0' }}>
                  <Trophy size={24} /> Histórico de Missões
                </h3>
                
                {loading ? (
                  <p style={{ color: 'var(--text-secondary)' }}>Carregando dados...</p>
                ) : (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Crosshair size={18} /> Participações</span>
                      <strong style={{ fontSize: '1.2rem' }}>{questStats.participations}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Trophy size={18} /> Vitórias</span>
                      <strong style={{ color: 'var(--accent-green)', fontSize: '1.2rem' }}>{questStats.wins}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Skull size={18} /> Derrotas</span>
                      <strong style={{ color: 'var(--accent-red)', fontSize: '1.2rem' }}>{questStats.defeats}</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Equipamentos e Atributos */}
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <h3 style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1.5rem 0' }}>
                  <Swords size={24} /> Equipamentos & Status
                </h3>
                
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Shield size={18} /> Defesa Total</span>
                    <strong style={{ color: 'var(--accent-blue)', fontSize: '1.2rem' }}>+{totalDefense}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Swords size={18} /> Força de Ataque</span>
                    <strong style={{ color: 'var(--accent-red)', fontSize: '1.2rem' }}>+{totalAttack}</strong>
                  </div>
                  {petItem && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Pet Equipado</span>
                      <strong style={{ color: 'var(--gold-primary)' }}>{petItem.itemTitle}</strong>
                    </div>
                  )}
                  {equippedItems.length === 0 && (
                    <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', margin: 0 }}>Nenhum equipamento.</p>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
