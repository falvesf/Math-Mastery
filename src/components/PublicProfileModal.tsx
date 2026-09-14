import { useEffect, useState, Component, type ReactNode } from 'react';
import { X, Shield, Swords, Trophy, Crosshair, Skull, UserPlus, UserMinus, History, Package, Star, Hammer, Flame, Sparkles, BookOpen, Scroll } from 'lucide-react';
import AvatarCharacter, { type EquippedItem } from './AvatarCharacter';
import { type UserData } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { calculateTotalStats } from '../lib/gacha';
import { RANKS } from '../lib/ranks';
import { fetchStudentAchievementHistory, fetchStudentActivityLog, type AchievementItem } from '../lib/achievementHistory';
import { getCustomRoleName } from '../lib/permissions';
import { useTenant } from '../contexts/TenantContext';
import NintendoHeart from './NintendoHeart';
import MonsterBestiaryModal, { type BestiaryMonsterData } from './MonsterBestiaryModal';

class ProfileContentErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; errorText: string }> {
  state = { hasError: false, errorText: '' };
  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorText: String(error?.message || error) };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('[PublicProfileModal Content Error]', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '1.5rem', background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: '12px', color: '#fca5a5', margin: '1rem 0' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#ef4444' }}>Ocorreu um erro ao exibir esta aba</h4>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>{this.state.errorText}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const [activityLog, setActivityLog] = useState<AchievementItem[]>([]);
  const [historySubTab, setHistorySubTab] = useState<'achievements' | 'activity'>('achievements');
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedBestiaryMonster, setSelectedBestiaryMonster] = useState<BestiaryMonsterData | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'history'>('stats');
  const [loading, setLoading] = useState(true);
  const { tenantId } = useTenant();
  const [customRoleName, setCustomRoleName] = useState('');
  const { userData: currentUser } = useAuth();
  const [isContact, setIsContact] = useState(false);
  const [liveHp, setLiveHp] = useState<number | null>(null);
  const [recoveryStartMs, setRecoveryStartMs] = useState<number | null>(null);
  const [, setHpTick] = useState(0);

  // Função de hierarquia (customizada) — badge discreto, ex: Designer
  useEffect(() => {
    if (!isOpen || !user.uid) { setCustomRoleName(''); return; }
    let active = true;
    getCustomRoleName(user.uid, tenantId).then(name => { if (active) setCustomRoleName(name); });
    return () => { active = false; };
  }, [isOpen, user.uid, tenantId]);

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

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setHpTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Valores computados (considerando nível de forja dos equipamentos e pontos distribuídos)
  const stats = calculateTotalStats(equippedItems, user.distributedStats || (user as any).distributed_stats);
  const maxHearts = 3 + Math.floor((RANKS.findIndex(r => r.name === rankName) || 0) / 2) + Math.floor(stats.vitality / 30);

  useEffect(() => {
    if (!isOpen || !user.uid) return;
    let active = true;
    const fetchFreshHp = async () => {
      try {
        const { data } = await supabase.from('users').select('hp, hp_recovery_start_timestamp, hp_cooldown_reduction_until, hp_cooldown_reduction_minutes').eq('id', user.uid).maybeSingle();
        if (!active) return;
        const freshHp = data && data.hp !== undefined && data.hp !== null ? Number(data.hp) : (user.hp !== undefined ? Number(user.hp) : maxHearts);
        setLiveHp(freshHp);
        const rawTs = data && data.hp_recovery_start_timestamp !== undefined ? data.hp_recovery_start_timestamp : user.hpRecoveryStartTimestamp;
        setRecoveryStartMs(typeof rawTs === 'string' ? new Date(rawTs).getTime() : (rawTs ? Number(rawTs) : null));
      } catch (e) {
        console.error(e);
        setLiveHp(user.hp !== undefined ? Number(user.hp) : maxHearts);
        setRecoveryStartMs(typeof user.hpRecoveryStartTimestamp === 'string' ? new Date(user.hpRecoveryStartTimestamp).getTime() : (user.hpRecoveryStartTimestamp ? Number(user.hpRecoveryStartTimestamp) : null));
      }
    };
    fetchFreshHp();
    return () => { active = false; };
  }, [isOpen, user.uid, maxHearts]);

  if (!isOpen) return null;

  // Se for privado, não exibe os detalhes
  const isPrivate = user.isProfilePublic === false;

  const totalDefense = stats.defense;
  const totalAttack = stats.attack;

  const petItem = equippedItems.find(i => (i.itemCategory as string) === 'pet');

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

  let visualHp = liveHp !== null ? liveHp : (user.hp !== undefined ? Number(user.hp) : maxHearts);
  if (recoveryStartMs && visualHp < maxHearts) {
    // Tempo de recuperação respeitando redução de cooldown (equipamentos/buff), como no Dashboard
    const now = Date.now();
    const equippedReduction = equippedItems
      .filter(item => (item as any).gameEffect === 'reduce_hp_cooldown')
      .reduce((acc, item) => acc + Number((item as any).hpCooldownReductionMinutes || 0), 0);
    const isBuffActive = user.hpCooldownReductionUntil && new Date(user.hpCooldownReductionUntil).getTime() > now;
    const buffReduction = isBuffActive ? Number(user.hpCooldownReductionMinutes || 0) : 0;
    const effectiveMinutes = Math.max(1, 30 - Math.min(29, equippedReduction + buffReduction));
    const recoveryMs = effectiveMinutes * 60 * 1000;
    const timePassed = Math.max(0, now - recoveryStartMs);
    if (timePassed > 0) {
      visualHp = Math.min(maxHearts, visualHp + Math.floor(timePassed / recoveryMs));
    }
  }
  // Nunca mostra mais que o máximo nem menos que o real
  visualHp = Math.min(maxHearts, Math.max(0, visualHp));
  // Professores/administradores sempre com corações cheios (como na batalha)
  if (user.role === 'admin' || user.role === 'teacher') visualHp = maxHearts;

  let bgGradient = 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 100%)';
  if (rankPos === 1) bgGradient = 'linear-gradient(180deg, rgba(251, 191, 36, 0.3) 0%, rgba(0,0,0,0.5) 100%)'; // Ouro
  else if (rankPos === 2) bgGradient = 'linear-gradient(180deg, rgba(156, 163, 175, 0.3) 0%, rgba(0,0,0,0.5) 100%)'; // Prata
  else if (rankPos === 3) bgGradient = 'linear-gradient(180deg, rgba(180, 83, 9, 0.3) 0%, rgba(0,0,0,0.5) 100%)'; // Bronze

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', padding: '1rem' }}
    >
      <div 
        className="glass-panel" 
        style={{ 
          width: '100%', 
          maxWidth: '950px', 
          maxHeight: '90vh', 
          position: 'relative', 
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Fechar perfil"
          style={{ 
            position: 'absolute', 
            top: '1rem', 
            right: '1rem', 
            background: 'rgba(25, 25, 35, 0.85)', 
            border: '1px solid rgba(255, 255, 255, 0.25)', 
            color: 'var(--text-primary, #ffffff)', 
            cursor: 'pointer', 
            borderRadius: '50%', 
            width: '42px', 
            height: '42px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 100,
            pointerEvents: 'auto',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)';
            e.currentTarget.style.transform = 'scale(1.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(25, 25, 35, 0.85)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <X size={22} />
        </button>

        <div className="profile-modal-grid" style={{ padding: '2rem', background: bgGradient, flex: 1, overflowY: 'auto', maxHeight: '90vh' }}>
          
          {/* Lado Esquerdo: Avatar, Nome, HP */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 220, height: 220, borderRadius: '50%', background: 'var(--bg-dark)', border: `4px solid ${rankColor}`, boxShadow: `0 0 30px ${rankColor}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', marginBottom: '1.5rem' }}>
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
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
              </div>
              
              <div style={{ position: 'absolute', bottom: -15, background: 'var(--bg-dark)', padding: '0.4rem 1.5rem', borderRadius: '20px', border: `2px solid ${rankColor}`, color: rankColor, fontWeight: 'bold', fontSize: '1.1rem', whiteSpace: 'nowrap', zIndex: 10, textShadow: '1px 1px 2px rgba(0,0,0,0.8)', pointerEvents: 'none' }}>
                {rankName}
              </div>
            </div>

            <h2 style={{ fontSize: '1.8rem', margin: '1rem 0 0.5rem 0', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px', color: 'white' }}>
              {user.name}
            </h2>
            {customRoleName && (
              <span style={{ display: 'inline-block', fontSize: '0.7rem', fontWeight: 'bold', padding: '0.2rem 0.8rem', borderRadius: '12px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.4)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {customRoleName}
              </span>
            )}
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
              type="button"
              onClick={handleAddContact}
              style={{
                marginTop: '1rem', padding: '0.5rem 1.2rem', borderRadius: '20px',
                background: isContact ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.2)',
                border: isContact ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(16,185,129,0.5)',
                color: isContact ? '#f87171' : '#10b981', cursor: 'pointer',
                fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem',
                position: 'relative',
                zIndex: 20
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
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem', position: 'relative', zIndex: 20 }}>
                  <button 
                    type="button"
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
                      fontSize: '0.95rem',
                      position: 'relative',
                      zIndex: 21
                    }}
                  >
                    <Trophy size={16} /> Status & Estatísticas
                  </button>
                  <button 
                    type="button"
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
                      fontSize: '0.95rem',
                      position: 'relative',
                      zIndex: 21
                    }}
                  >
                    <History size={16} /> Histórico de Conquistas
                  </button>
                </div>

                <ProfileContentErrorBoundary key={activeTab}>

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
                  /* Feed do Histórico: Conquistas Reais vs Log de Atividades */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* Sub-abas de Navegação */}
                    <div style={{
                      display: 'flex',
                      gap: '0.5rem',
                      background: 'rgba(0, 0, 0, 0.4)',
                      padding: '4px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}>
                      <button
                        type="button"
                        onClick={() => setHistorySubTab('achievements')}
                        style={{
                          flex: 1,
                          padding: '0.5rem 0.75rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: historySubTab === 'achievements' ? 'rgba(251, 191, 36, 0.2)' : 'transparent',
                          color: historySubTab === 'achievements' ? 'var(--gold-primary)' : 'var(--text-secondary)',
                          fontWeight: 'bold',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          transition: 'all 0.2s',
                          borderBottom: historySubTab === 'achievements' ? '2px solid var(--gold-primary)' : '2px solid transparent'
                        }}
                      >
                        <Trophy size={15} /> Conquistas Reais ({achievements.length})
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setHistorySubTab('activity');
                          if (activityLog.length === 0 && !loadingActivity) {
                            setLoadingActivity(true);
                            try {
                              const acts = await fetchStudentActivityLog(user.uid);
                              setActivityLog(acts);
                            } finally {
                              setLoadingActivity(false);
                            }
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '0.5rem 0.75rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: historySubTab === 'activity' ? 'rgba(96, 165, 250, 0.2)' : 'transparent',
                          color: historySubTab === 'activity' ? '#60a5fa' : 'var(--text-secondary)',
                          fontWeight: 'bold',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          transition: 'all 0.2s',
                          borderBottom: historySubTab === 'activity' ? '2px solid #60a5fa' : '2px solid transparent'
                        }}
                      >
                        <Scroll size={15} /> Log de Atividades {activityLog.length > 0 ? `(${activityLog.length})` : ''}
                      </button>
                    </div>

                    {/* Feed correspondente à sub-aba selecionada */}
                    {historySubTab === 'achievements' ? (
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
                            const isPvp = item.type === 'pvp';
                            const isForge = item.type === 'forge';
                            const isBestiary = item.type === 'bestiary';
                            const hasBestiaryData = !!item.bestiaryData;

                            const isPvpFirstWin = item.id === 'pvp-first-win';
                            const isForgeFirst = item.id === 'forge-first-success';
                            const isForgePlusNine = item.id === 'forge-first-plus-nine';
                            const isForgeTransmute = item.id === 'forge-first-transmute';
                            const isSpecialMilestone = isPvpFirstWin || isForgeFirst || isForgePlusNine || isForgeTransmute || isBestiary || !!item.isSpecialMilestone;
                            
                            let borderColor = 'var(--gold-primary)';
                            let badgeBg = 'rgba(251, 191, 36, 0.15)';
                            let badgeColor = 'var(--gold-primary)';
                            let cardBg = 'rgba(0,0,0,0.3)';
                            let cardShadow = 'none';
                            let titleColor = 'var(--text-primary)';
                            
                            if (isBestiary) {
                              borderColor = '#a855f7';
                              badgeBg = 'linear-gradient(135deg, rgba(168, 85, 247, 0.35) 0%, rgba(139, 92, 246, 0.25) 100%)';
                              badgeColor = '#c084fc';
                              cardBg = 'linear-gradient(135deg, rgba(168, 85, 247, 0.16) 0%, rgba(99, 102, 241, 0.08) 50%, rgba(0, 0, 0, 0.35) 100%)';
                              cardShadow = '0 0 16px rgba(168, 85, 247, 0.2)';
                              titleColor = '#c084fc';
                            } else if (isRank) {
                              borderColor = '#a855f7';
                              badgeBg = 'rgba(168, 85, 247, 0.2)';
                              badgeColor = '#c084fc';
                            } else if (isItem) {
                              if (hasBestiaryData) {
                                borderColor = '#ec4899';
                                badgeBg = 'linear-gradient(135deg, rgba(236, 72, 153, 0.3) 0%, rgba(168, 85, 247, 0.2) 100%)';
                                badgeColor = '#f472b6';
                                cardBg = 'linear-gradient(135deg, rgba(236, 72, 153, 0.12) 0%, rgba(0, 0, 0, 0.35) 100%)';
                                cardShadow = '0 0 14px rgba(236, 72, 153, 0.16)';
                                titleColor = '#f472b6';
                              } else {
                                borderColor = '#3b82f6';
                                badgeBg = 'rgba(59, 130, 246, 0.15)';
                                badgeColor = '#60a5fa';
                              }
                            } else if (isForge) {
                              if (isForgeFirst) {
                                borderColor = '#f97316';
                                badgeBg = 'rgba(249, 115, 22, 0.22)';
                                badgeColor = '#f97316';
                                cardBg = 'linear-gradient(135deg, rgba(249, 115, 22, 0.14) 0%, rgba(234, 88, 12, 0.08) 50%, rgba(0, 0, 0, 0.35) 100%)';
                                cardShadow = '0 0 16px rgba(249, 115, 22, 0.18)';
                                titleColor = '#f97316';
                              } else if (isForgePlusNine) {
                                borderColor = '#ea580c';
                                badgeBg = 'linear-gradient(135deg, rgba(234, 88, 12, 0.35) 0%, rgba(239, 68, 68, 0.25) 100%)';
                                badgeColor = '#fbbf24';
                                cardBg = 'linear-gradient(135deg, rgba(239, 68, 68, 0.16) 0%, rgba(234, 88, 12, 0.12) 50%, rgba(0, 0, 0, 0.35) 100%)';
                                cardShadow = '0 0 20px rgba(234, 88, 12, 0.22)';
                                titleColor = '#fbbf24';
                              } else if (isForgeTransmute) {
                                borderColor = '#a855f7';
                                badgeBg = 'linear-gradient(135deg, rgba(168, 85, 247, 0.35) 0%, rgba(139, 92, 246, 0.25) 100%)';
                                badgeColor = '#c084fc';
                                cardBg = 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(139, 92, 246, 0.09) 50%, rgba(0, 0, 0, 0.35) 100%)';
                                cardShadow = '0 0 18px rgba(168, 85, 247, 0.2)';
                                titleColor = '#c084fc';
                              } else {
                                borderColor = '#f97316';
                                badgeBg = 'rgba(249, 115, 22, 0.18)';
                                badgeColor = '#f97316';
                              }
                            } else if (isPvp) {
                              if (isPvpFirstWin) {
                                borderColor = '#f59e0b';
                                badgeBg = 'linear-gradient(135deg, rgba(245, 158, 11, 0.35) 0%, rgba(244, 63, 94, 0.25) 100%)';
                                badgeColor = '#fbbf24';
                                cardBg = 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(244, 63, 94, 0.08) 50%, rgba(0, 0, 0, 0.35) 100%)';
                                cardShadow = '0 0 16px rgba(245, 158, 11, 0.15)';
                                titleColor = '#fbbf24';
                              } else if (isNegative) {
                                borderColor = 'var(--accent-red)';
                                badgeBg = 'rgba(239, 68, 68, 0.15)';
                                badgeColor = 'var(--accent-red)';
                              } else if (item.badgeType === 'xp_positive') {
                                borderColor = 'var(--accent-green, #10b981)';
                                badgeBg = 'rgba(16, 185, 129, 0.18)';
                                badgeColor = 'var(--accent-green, #10b981)';
                              } else {
                                borderColor = '#f43f5e';
                                badgeBg = 'rgba(244, 63, 94, 0.18)';
                                badgeColor = '#fb7185';
                              }
                            } else if (isNegative) {
                              borderColor = 'var(--accent-red)';
                              badgeBg = 'rgba(239, 68, 68, 0.15)';
                              badgeColor = 'var(--accent-red)';
                            }

                            const dateObj = new Date(item.timestamp);
                            const isValidDate = !isNaN(dateObj.getTime());
                            const formattedDate = isValidDate ? dateObj.toLocaleDateString('pt-BR') : (item.rawDate || '');
                            const formattedTime = isValidDate ? dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

                            return (
                              <div
                                key={item.id || index}
                                onClick={() => {
                                  if (item.bestiaryData) {
                                    setSelectedBestiaryMonster(item.bestiaryData);
                                  }
                                }}
                                style={{
                                  padding: '0.9rem 1.1rem',
                                  background: cardBg,
                                  borderRadius: '10px',
                                  borderLeft: `4px solid ${borderColor}`,
                                  boxShadow: cardShadow,
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                  cursor: hasBestiaryData ? 'pointer' : 'default',
                                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (hasBestiaryData) {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = `0 4px 20px ${borderColor}50`;
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (hasBestiaryData) {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = cardShadow;
                                  }
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                                  {item.imageUrl ? (
                                    <img src={item.imageUrl} alt="" style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '6px', flexShrink: 0 }} />
                                  ) : (
                                    <div style={{
                                      width: '36px',
                                      height: '36px',
                                      borderRadius: '6px',
                                      background: isSpecialMilestone ? `${borderColor}25` : 'rgba(255,255,255,0.05)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0
                                    }}>
                                      {isBestiary ? (
                                        <BookOpen size={18} color="#c084fc" />
                                      ) : isRank ? (
                                        <Trophy size={18} color="#c084fc" />
                                      ) : isItem ? (
                                        <Package size={18} color="#60a5fa" />
                                      ) : isForgeFirst ? (
                                        <Hammer size={18} color="#f97316" />
                                      ) : isForgePlusNine ? (
                                        <Flame size={18} color="#ea580c" />
                                      ) : isForgeTransmute ? (
                                        <Sparkles size={18} color="#c084fc" />
                                      ) : isPvp ? (
                                        isPvpFirstWin ? <Trophy size={18} color="#fbbf24" /> : <Swords size={18} color={isNegative ? 'var(--accent-red)' : item.badgeType === 'xp_positive' ? 'var(--accent-green, #10b981)' : '#fb7185'} />
                                      ) : (
                                        <Star size={18} color="var(--gold-primary)" />
                                      )}
                                    </div>
                                  )}
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <h4 style={{
                                      fontSize: '0.95rem',
                                      margin: '0 0 0.15rem 0',
                                      fontWeight: 'bold',
                                      color: titleColor,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.4rem',
                                      flexWrap: 'wrap'
                                    }}>
                                      {item.title}
                                      {hasBestiaryData && (
                                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.25)', color: '#c084fc', fontWeight: 'normal' }}>
                                          📖 Abrir Bestiário
                                        </span>
                                      )}
                                    </h4>
                                    {item.subtitle && (
                                      <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.8rem', color: isSpecialMilestone ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)' }}>
                                        {item.subtitle}
                                      </p>
                                    )}
                                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
                                      Data: {formattedDate} {formattedTime ? `| Hora: ${formattedTime}` : ''}
                                    </span>
                                  </div>
                                </div>
                                <div style={{
                                  fontSize: '0.85rem',
                                  fontWeight: 'bold',
                                  color: badgeColor,
                                  background: badgeBg,
                                  padding: '0.35rem 0.75rem',
                                  borderRadius: '16px',
                                  whiteSpace: 'nowrap',
                                  border: isSpecialMilestone ? `1px solid ${borderColor}80` : `1px solid ${borderColor}40`
                                }}>
                                  {item.badgeText}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      /* Feed de Log de Atividades (com agrupamento inteligente de poções/compras) */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                        {loadingActivity ? (
                          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Carregando log de atividades...</p>
                        ) : activityLog.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                            <Scroll size={36} style={{ opacity: 0.5, margin: '0 auto 0.5rem auto' }} />
                            <p>Nenhuma atividade recente registrada.</p>
                          </div>
                        ) : (
                          activityLog.map((act, index) => {
                            const isItem = act.type === 'item';
                            const isQuest = act.type === 'quest';
                            const isTeacher = act.type === 'teacher_xp';
                            const isGrouped = act.count && act.count > 1;

                            let borderColor = '#3b82f6';
                            let badgeBg = 'rgba(59, 130, 246, 0.15)';
                            let badgeColor = '#60a5fa';

                            if (isItem) {
                              borderColor = isGrouped ? '#38bdf8' : '#3b82f6';
                              badgeBg = isGrouped ? 'rgba(56, 189, 248, 0.2)' : 'rgba(59, 130, 246, 0.15)';
                              badgeColor = isGrouped ? '#38bdf8' : '#60a5fa';
                            } else if (isQuest) {
                              if (act.badgeType === 'xp_positive') {
                                borderColor = '#10b981';
                                badgeBg = 'rgba(16, 185, 129, 0.18)';
                                badgeColor = '#34d399';
                              } else if (act.badgeType === 'xp_negative') {
                                borderColor = '#ef4444';
                                badgeBg = 'rgba(239, 68, 68, 0.18)';
                                badgeColor = '#f87171';
                              } else {
                                borderColor = '#f59e0b';
                                badgeBg = 'rgba(245, 158, 11, 0.18)';
                                badgeColor = '#fbbf24';
                              }
                            } else if (isTeacher) {
                              borderColor = act.badgeType === 'xp_positive' ? '#10b981' : '#ef4444';
                              badgeBg = act.badgeType === 'xp_positive' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)';
                              badgeColor = act.badgeType === 'xp_positive' ? '#34d399' : '#f87171';
                            }

                            const dateObj = new Date(act.timestamp);
                            const isValidDate = !isNaN(dateObj.getTime());
                            const formattedDate = isValidDate ? dateObj.toLocaleDateString('pt-BR') : (act.rawDate || '');
                            const formattedTime = isValidDate ? dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

                            return (
                              <div
                                key={act.id || index}
                                style={{
                                  padding: '0.85rem 1rem',
                                  background: 'rgba(0, 0, 0, 0.3)',
                                  borderRadius: '10px',
                                  borderLeft: `4px solid ${borderColor}`,
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '0.75rem'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                                  {act.imageUrl ? (
                                    <img src={act.imageUrl} alt="" style={{ width: '34px', height: '34px', objectFit: 'contain', borderRadius: '6px', flexShrink: 0 }} />
                                  ) : (
                                    <div style={{
                                      width: '34px',
                                      height: '34px',
                                      borderRadius: '6px',
                                      background: `${borderColor}20`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0
                                    }}>
                                      {isItem ? <Package size={17} color={borderColor} /> : isQuest ? <Crosshair size={17} color={borderColor} /> : <Star size={17} color={borderColor} />}
                                    </div>
                                  )}
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <h4 style={{
                                      fontSize: '0.9rem',
                                      margin: '0 0 0.15rem 0',
                                      fontWeight: 'bold',
                                      color: '#fff',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.4rem'
                                    }}>
                                      {act.title}
                                    </h4>
                                    {act.subtitle && (
                                      <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                        {act.subtitle}
                                      </p>
                                    )}
                                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                                      Data: {formattedDate} {formattedTime ? `| Hora: ${formattedTime}` : ''}
                                    </span>
                                  </div>
                                </div>
                                <div style={{
                                  fontSize: '0.8rem',
                                  fontWeight: 'bold',
                                  color: badgeColor,
                                  background: badgeBg,
                                  padding: '0.3rem 0.65rem',
                                  borderRadius: '14px',
                                  whiteSpace: 'nowrap',
                                  border: `1px solid ${borderColor}40`
                                }}>
                                  {act.badgeText}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
                </ProfileContentErrorBoundary>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Temático do Bestiário (aberto ao clicar no card de criatura ou drop) */}
      {selectedBestiaryMonster && (
        <MonsterBestiaryModal
          isOpen={!!selectedBestiaryMonster}
          onClose={() => setSelectedBestiaryMonster(null)}
          monsterData={selectedBestiaryMonster}
        />
      )}
    </div>
  );
}
