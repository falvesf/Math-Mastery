import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Trophy, Settings, History, ShieldAlert, Star, TrendingUp, Users, Swords, Clock, CheckCircle, Store, Heart } from 'lucide-react';
import { useAuth, type UserData } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getRankForXp, RANKS, type RankDef } from '../lib/ranks';
import LevelUpModal from '../components/LevelUpModal';
import StudentStore from '../components/StudentStore';
import StudentInventory from '../components/StudentInventory';

export default function Dashboard() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('quests');
  const [xpHistory, setXpHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // Rankings state
  const [allStudents, setAllStudents] = useState<UserData[]>([]);
  const [loadingRankings, setLoadingRankings] = useState(true);

  // Level Up Animation State
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{oldRank: RankDef | null, newRank: RankDef} | null>(null);

  // Quests State
  const [activeQuests, setActiveQuests] = useState<any[]>([]);
  const [completedQuestIds, setCompletedQuestIds] = useState<string[]>([]);
  const [loadingQuests, setLoadingQuests] = useState(true);

  useEffect(() => {
    if (userData?.uid && userData.role === 'student') {
      const fetchHistory = async () => {
        const q = query(collection(db, 'xp_logs'), where('studentId', '==', userData.uid));
        const snap = await getDocs(q);
        const logs = snap.docs.map(d => d.data());
        logs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setXpHistory(logs);
        setLoadingHistory(false);
      };
      fetchHistory();

      const fetchQuests = async () => {
        setLoadingQuests(true);
        
        // Buscar tentativas concluídas
        const attemptQ = query(collection(db, 'quest_attempts'), where('studentId', '==', userData.uid), where('status', '==', 'completed'));
        const attemptSnap = await getDocs(attemptQ);
        const completedIds: string[] = [];
        attemptSnap.forEach(doc => {
          if (doc.data().questId) completedIds.push(doc.data().questId);
        });
        setCompletedQuestIds(completedIds);

        // Buscar missões ativas
        const q = query(collection(db, 'quests'), where('active', '==', true));
        const snap = await getDocs(q);
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Ordenar as mais novas primeiro
        fetched.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setActiveQuests(fetched);
        setLoadingQuests(false);
      };
      fetchQuests();
    }
  }, [userData]);

  useEffect(() => {
    const fetchRankings = async () => {
      setLoadingRankings(true);
      const q = query(collection(db, 'users'), where('role', '==', 'student'));
      const snap = await getDocs(q);
      const loaded: UserData[] = [];
      snap.forEach(d => loaded.push(d.data() as UserData));
      loaded.sort((a, b) => (b.xp || 0) - (a.xp || 0));
      setAllStudents(loaded);
      setLoadingRankings(false);
    };
    fetchRankings();
  }, []);

  const currentRank = getRankForXp(userData?.xp || 0);

  // Verificar se subiu de patente
  useEffect(() => {
    if (!userData || userData.role !== 'student') return;
    
    // Se não tem lastSeenRank e o rank é Iniciante, apenas salva silenciosamente.
    if (!userData.lastSeenRank) {
      if (currentRank.name !== RANKS[0].name) {
        // Primeira vez logando já com XP (ex: prof lançou antes dele entrar a primeira vez)
        setLevelUpData({ oldRank: RANKS[0], newRank: currentRank });
        setShowLevelUp(true);
      } else {
        updateDoc(doc(db, 'users', userData.uid), { lastSeenRank: currentRank.name });
      }
      return;
    }

    if (userData.lastSeenRank !== currentRank.name) {
      const oldRankIndex = RANKS.findIndex(r => r.name === userData.lastSeenRank);
      const newRankIndex = RANKS.findIndex(r => r.name === currentRank.name);
      
      // Subiu de rank!
      if (newRankIndex > oldRankIndex) {
        setLevelUpData({ oldRank: RANKS[oldRankIndex], newRank: currentRank });
        setShowLevelUp(true);
      } else {
        // Caiu de rank (ex: punição). Atualiza silencioso.
        updateDoc(doc(db, 'users', userData.uid), { lastSeenRank: currentRank.name });
      }
    }
  }, [userData?.xp, userData?.lastSeenRank, currentRank.name]);

  const handleCloseLevelUp = async () => {
    setShowLevelUp(false);
    if (userData) {
      await updateDoc(doc(db, 'users', userData.uid), { lastSeenRank: currentRank.name });
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  // Calcular progresso para a próxima patente
  const currentIndex = RANKS.findIndex(r => r.name === currentRank.name);
  const nextRank = currentIndex < RANKS.length - 1 ? RANKS[currentIndex + 1] : null;
  
  let progressPercentage = 100;
  if (nextRank) {
    const xpIntoCurrentRank = (userData?.xp || 0) - currentRank.minXp;
    const xpNeededForNext = nextRank.minXp - currentRank.minXp;
    progressPercentage = Math.min(100, Math.max(0, (xpIntoCurrentRank / xpNeededForNext) * 100));
  }

  // Filtragem de Rankings (Top 10)
  const classStudents = allStudents.filter(s => s.classId === userData?.classId).slice(0, 10);
  const top10General = allStudents.slice(0, 10);

  const renderRankingList = (list: UserData[]) => {
    if (loadingRankings) return <p style={{ color: 'var(--text-secondary)' }}>Calculando as posições...</p>;
    if (list.length === 0) return <p style={{ color: 'var(--text-secondary)' }}>Nenhum aluno no ranking.</p>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {list.map((student, index) => {
          const rankPos = index + 1;
          const sRank = getRankForXp(student.xp || 0);
          
          let medalColor = 'var(--text-secondary)';
          if (rankPos === 1) medalColor = '#fbbf24'; // Gold
          if (rankPos === 2) medalColor = '#94a3b8'; // Silver
          if (rankPos === 3) medalColor = '#b45309'; // Bronze

          return (
            <div key={student.uid} className="glass-panel" style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', 
              background: student.uid === userData?.uid ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255,255,255,0.02)',
              border: student.uid === userData?.uid ? '1px solid var(--gold-primary)' : '1px solid transparent'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '30px', textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold', color: medalColor }}>
                  {rankPos}º
                </div>
                <img src={student.photoURL} alt="" style={{ width: 40, height: 40, borderRadius: '50%', border: `2px solid ${sRank.color}` }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {student.name} {student.uid === userData?.uid && <span style={{ fontSize: '0.7rem', background: 'var(--gold-primary)', color: 'black', padding: '2px 6px', borderRadius: '4px' }}>Você</span>}
                  </h4>
                  <div style={{ fontSize: '0.85rem', color: sRank.color, fontWeight: 'bold' }}>
                    {sRank.name} {student.classId && <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>| {student.classId}</span>}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                {student.xp || 0} XP
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="app-container">
      {showLevelUp && levelUpData && (
        <LevelUpModal 
          oldRank={levelUpData.oldRank} 
          newRank={levelUpData.newRank} 
          onClose={handleCloseLevelUp} 
        />
      )}

      <nav className="navbar glass-panel">
        <div className="logo-container">
          <Trophy className="logo-icon" color="var(--gold-primary)" size={32} />
          <h1 className="title-glow">Painel do Aluno</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          
          {userData?.role === 'admin' && (
            <button 
              className="login-btn" 
              onClick={() => navigate('/admin')}
              style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(251, 191, 36, 0.1)', borderColor: 'var(--gold-primary)' }}
            >
              <Settings size={18} color="var(--gold-primary)" />
              <span style={{ color: 'var(--gold-primary)' }}>Painel Master</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '50px' }}>
            <img src={userData?.photoURL} alt="Avatar" style={{ width: 36, borderRadius: '50%', border: `2px solid ${currentRank.color}` }} />
            <span style={{ fontWeight: 600 }}>{userData?.name?.split(' ')[0]}</span>
          </div>
          <button className="login-btn" onClick={handleLogout} style={{ padding: '0.75rem', borderRadius: '50%' }} title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      {/* Navegação de Abas do Aluno */}
      <div style={{ display: 'flex', gap: '1rem', padding: '1rem', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 100, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '2rem', margin: '0 -2rem 2rem -2rem' }}>
        <button 
          onClick={() => setActiveTab('quests')}
          style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: activeTab === 'quests' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.05)', color: activeTab === 'quests' ? 'black' : 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
        >
          <Swords size={20} /> Central de Missões
        </button>
        <button 
          onClick={() => setActiveTab('profile')}
          style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: activeTab === 'profile' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.05)', color: activeTab === 'profile' ? 'black' : 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
        >
          <Star size={20} /> Meu Perfil
        </button>
        <button 
          onClick={() => setActiveTab('ranking_class')}
          style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: activeTab === 'ranking_class' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.05)', color: activeTab === 'ranking_class' ? 'black' : 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
        >
          <Users size={20} /> Ranking da Turma (Top 10)
        </button>
        <button 
          onClick={() => setActiveTab('ranking_general')}
          style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: activeTab === 'ranking_general' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.05)', color: activeTab === 'ranking_general' ? 'black' : 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
        >
          <TrendingUp size={20} /> Ranking Geral (Top 10)
        </button>
        <button 
          onClick={() => setActiveTab('store')}
          style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: activeTab === 'store' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.05)', color: activeTab === 'store' ? 'black' : 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
        >
          <Store size={20} /> Mercado
        </button>
      </div>

      <main className="main-content">
        
        {activeTab === 'quests' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <Swords size={32} color="var(--gold-primary)" />
              <div>
                <h2 style={{ fontSize: '2rem', margin: 0 }}>Central de Missões</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Enfrente os desafios do seu professor para ganhar XP e subir de patente.</p>
              </div>
            </div>

            {loadingQuests ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Buscando missões disponíveis...</p>
            ) : activeQuests.length === 0 ? (
              <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center' }}>
                <ShieldAlert size={64} style={{ margin: '0 auto 1rem auto', color: 'var(--text-secondary)', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Nenhuma missão ativa</h3>
                <p style={{ color: 'var(--text-secondary)' }}>O professor ainda não publicou nenhuma missão, ou você já completou todas. Volte mais tarde!</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '2rem' }}>
                {activeQuests.map(quest => {
                  const isCompleted = completedQuestIds.includes(quest.id);
                  
                  return (
                    <div 
                      key={quest.id} 
                      className="glass-panel" 
                      style={{ 
                        padding: 0, 
                        overflow: 'hidden', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        transition: 'transform 0.2s', 
                        cursor: 'pointer',
                        opacity: isCompleted ? 0.7 : 1,
                        filter: isCompleted ? 'grayscale(30%)' : 'none'
                      }} 
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} 
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'} 
                      onClick={() => navigate(isCompleted ? `/quest/${quest.id}?study=true` : `/quest/${quest.id}`)}
                    >
                      <div style={{ height: '200px', width: '100%', position: 'relative' }}>
                        {quest.coverImageUrl ? (
                          <img src={quest.coverImageUrl} alt={quest.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, var(--bg-dark), var(--accent-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Swords size={64} color="rgba(255,255,255,0.2)" />
                          </div>
                        )}
                        <div style={{ position: 'absolute', top: '10px', right: '10px', background: isCompleted ? 'rgba(16, 185, 129, 0.9)' : 'rgba(0,0,0,0.8)', padding: '0.5rem 1rem', borderRadius: '20px', border: `1px solid ${isCompleted ? 'var(--accent-green)' : 'var(--gold-primary)'}`, color: isCompleted ? 'black' : 'var(--gold-primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isCompleted ? <CheckCircle size={16} /> : <Star size={16} />} 
                          {isCompleted ? 'Concluída' : `${quest.baseXp} XP`}
                        </div>
                      </div>
                      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0' }}>{quest.title}</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem', flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {quest.description || 'Uma missão misteriosa aguarda você...'}
                        </p>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
                          <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><ShieldAlert size={14} /> {quest.allowRetries ? 'Vidas Extras' : 'Hardcore'}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={14} /> {quest.questions?.length || 0} Desafios</span>
                          </div>
                          <button 
                            className="login-btn" 
                            style={{ 
                              background: isCompleted ? 'rgba(255,255,255,0.1)' : 'var(--gold-primary)', 
                              color: isCompleted ? 'white' : 'black', 
                              border: isCompleted ? '1px solid var(--border-glass)' : 'none', 
                              padding: '0.5rem 1.5rem', 
                              fontSize: '1rem' 
                            }} 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (!isCompleted && (userData?.hearts || 0) < 1 && userData?.role === 'student') {
                                alert("Você precisa de pelo menos 1 coração (vida) para jogar um desafio! Espere regenerar ou use um item de cura.");
                                return;
                              }
                              navigate(isCompleted ? `/quest/${quest.id}?study=true` : `/quest/${quest.id}`); 
                            }}
                          >
                            {isCompleted ? 'Revisar' : 'Jogar Agora'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', animation: 'fadeIn 0.3s ease-out' }}>
            {/* Perfil do Aluno (Esquerda) */}
            <div className="glass-panel" style={{ flex: '1 1 400px', padding: '3rem 2rem', textAlign: 'center' }}>
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
                {currentRank.imageUrl ? (
                  <>
                    <img src={currentRank.imageUrl} alt={currentRank.name} style={{ width: 140, height: 140, objectFit: 'contain', filter: `drop-shadow(0 0 20px ${currentRank.color}80)`, marginBottom: '1rem', animation: 'epicZoom 1s ease-out' }} />
                    <div style={{ position: 'absolute', bottom: 50, right: -10 }}>
                      <img src={userData?.photoURL} alt="Avatar" style={{ width: 50, height: 50, borderRadius: '50%', border: `2px solid ${currentRank.color}` }} />
                    </div>
                    <div style={{ background: 'var(--bg-dark)', padding: '0.25rem 1rem', borderRadius: '20px', border: `2px solid ${currentRank.color}`, color: currentRank.color, fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      {currentRank.name}
                    </div>
                  </>
                ) : (
                  <>
                    <img src={userData?.photoURL} alt="Avatar" style={{ width: 120, height: 120, borderRadius: '50%', border: `4px solid ${currentRank.color}`, boxShadow: `0 0 20px ${currentRank.color}40` }} />
                    <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-dark)', padding: '0.25rem 1rem', borderRadius: '20px', border: `2px solid ${currentRank.color}`, color: currentRank.color, fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      {currentRank.name}
                    </div>
                  </>
                )}
              </div>
              
              <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{userData?.name}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '2rem' }}>
                Turma: {userData?.classId || 'Não definida'}
              </p>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Experiência Total</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Star size={20} /> {userData?.xp || 0} XP
                  </span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem', marginTop: '1rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Vidas (HP)</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {Array.from({ length: 3 + Math.floor((RANKS.findIndex(r => r.name === currentRank.name) || 0) / 2) }).map((_, i) => (
                      <Heart key={i} size={24} fill={i < (userData?.hearts || 0) ? '#ef4444' : 'transparent'} color={i < (userData?.hearts || 0) ? '#ef4444' : 'rgba(255,255,255,0.2)'} />
                    ))}
                  </span>
                </div>
                
                {nextRank ? (
                  <>
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-dark)', borderRadius: '4px', overflow: 'hidden', marginTop: '1rem', marginBottom: '0.5rem' }}>
                      <div style={{ height: '100%', width: `${progressPercentage}%`, background: `linear-gradient(90deg, ${currentRank.color}, ${nextRank.color})`, borderRadius: '4px', transition: 'width 1s ease-in-out' }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <span>{currentRank.name}</span>
                      <span>Faltam {nextRank.minXp - (userData?.xp || 0)} XP para {nextRank.name}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: '1rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>
                    Patente Máxima Alcançada!
                  </div>
                )}
              </div>
            </div>

            {/* Histórico do Aluno (Direita) */}
            <div className="glass-panel" style={{ flex: '2 1 500px', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
                <History size={24} color="var(--gold-primary)" />
                <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Histórico de Conquistas</h3>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {userData?.role === 'admin' ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <ShieldAlert size={48} style={{ opacity: 0.5, margin: '0 auto 1rem auto' }} />
                    <p>Você é um Administrador. Administradores não ganham XP.<br/>Acesse o Painel Master para gerenciar o sistema.</p>
                  </div>
                ) : loadingHistory ? (
                  <p style={{ color: 'var(--text-secondary)' }}>Carregando suas conquistas...</p>
                ) : xpHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <Star size={48} style={{ opacity: 0.5, margin: '0 auto 1rem auto' }} />
                    <p>Você ainda não recebeu XP.<br/>Complete desafios e atividades para subir de patente!</p>
                  </div>
                ) : (
                  xpHistory.map((log, index) => (
                    <div key={index} style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', borderLeft: `4px solid ${log.xpGained >= 0 ? 'var(--gold-primary)' : 'var(--accent-red)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ fontSize: '1.1rem', margin: '0 0 0.25rem 0' }}>{log.evalName}</h4>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          {log.justification ? `Motivo: ${log.justification}` : `Nota: ${log.grade}`} | Data: {log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleDateString('pt-BR') : 'Hoje'}
                        </span>
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: log.xpGained >= 0 ? 'var(--gold-primary)' : 'var(--accent-red)', background: log.xpGained >= 0 ? 'rgba(251, 191, 36, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: '20px' }}>
                        {log.xpGained > 0 ? '+' : ''}{log.xpGained} XP
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Inventário Movido para Cá */}
            <div style={{ width: '100%', marginTop: '1rem' }}>
              {userData && <StudentInventory userData={userData} />}
            </div>
          </div>
        )}

        {activeTab === 'ranking_class' && (
          <div className="glass-panel" style={{ padding: '0', animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-glass)', position: 'sticky', top: '75px', zIndex: 90, background: 'var(--bg-card)', backdropFilter: 'blur(12px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
              <Users size={32} color="var(--gold-primary)" />
              <div>
                <h2 style={{ fontSize: '2rem', margin: 0 }}>Top 10 da Turma</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Sua sala: {userData?.classId || 'Não definida'}</p>
              </div>
            </div>
            <div style={{ padding: '2rem' }}>
              {userData?.classId ? renderRankingList(classStudents) : <p style={{ color: 'var(--text-secondary)' }}>Você precisa estar em uma turma para ver o ranking dela.</p>}
            </div>
          </div>
        )}

        {activeTab === 'ranking_general' && (
          <div className="glass-panel" style={{ padding: '0', animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-glass)', position: 'sticky', top: '75px', zIndex: 90, background: 'var(--bg-card)', backdropFilter: 'blur(12px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
              <Trophy size={32} color="var(--gold-primary)" />
              <div>
                <h2 style={{ fontSize: '2rem', margin: 0 }}>Top 10 Geral</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Os maiores pontuadores de toda a escola.</p>
              </div>
            </div>
            <div style={{ padding: '2rem' }}>
              {renderRankingList(top10General)}
            </div>
          </div>
        )}

        {activeTab === 'store' && userData && (
          <StudentStore userData={userData} />
        )}

      </main>
    </div>
  );
}
