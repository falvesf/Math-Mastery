import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Clock, ShieldAlert, Swords, Star, CheckCircle, XCircle, Package, Shield, Zap } from 'lucide-react';
import type { GameEffectType } from '../components/AdminStoreManager';
import type { QuestDef } from './AdminDashboard';

interface UserItem {
  id: string;
  itemId: string;
  itemTitle: string;
  itemImageUrl: string;
  gameEffect?: GameEffectType;
  itemType: 'consumable' | 'equippable';
}

export default function QuestGameplay() {
  const { questId } = useParams();
  const { userData } = useAuth();
  const navigate = useNavigate();

  const [quest, setQuest] = useState<QuestDef | null>(null);
  const [gameState, setGameState] = useState<'loading' | 'intro' | 'playing' | 'result'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  
  const searchParams = new URLSearchParams(window.location.search);
  const isStudyMode = searchParams.get('study') === 'true';
  
  // Game State
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [currentXp, setCurrentXp] = useState(0);
  const [won, setWon] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Power-up States
  const [powerups, setPowerups] = useState<UserItem[]>([]);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [hasShield, setHasShield] = useState(false);
  
  // Feedback Visual (certo/errado)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchQuest = async () => {
      if (!questId || !userData) return;
      
      const qRef = doc(db, 'quests', questId);
      const snap = await getDoc(qRef);
      if (!snap.exists()) {
        setErrorMessage('Missão não encontrada.');
        setGameState('result');
        return;
      }
      
      const qData = { id: snap.id, ...snap.data() } as QuestDef;
      
      if (!qData.active && userData.role !== 'admin') {
        setErrorMessage('Esta missão não está ativa no momento.');
        setGameState('result');
        return;
      }

      // Check if already completed
      const attemptsRef = collection(db, 'quest_attempts');
      const qCheck = query(attemptsRef, where('questId', '==', questId), where('studentId', '==', userData.uid));
      const attemptSnap = await getDocs(qCheck);
      
      let alreadyCompleted = false;
      let alreadyFailedHardcore = false;

      attemptSnap.forEach(doc => {
        if (doc.data().status === 'completed') alreadyCompleted = true;
        if (doc.data().status === 'failed' && !qData.allowRetries) alreadyFailedHardcore = true;
      });

      if (alreadyCompleted && userData.role !== 'admin' && !isStudyMode) {
        setErrorMessage('Você já completou esta missão com sucesso!');
        setGameState('result');
        return;
      }

      if (alreadyFailedHardcore && userData.role !== 'admin') {
        setErrorMessage('Você falhou nesta missão e ela não permite novas tentativas (Hardcore).');
        setGameState('result');
        return;
      }

      setQuest(qData);
      setCurrentXp(qData.baseXp);
      setGameState('intro');

      // Fetch Powerups
      if (userData?.uid && !isStudyMode) {
        const pQ = query(collection(db, 'user_items'), where('studentId', '==', userData.uid), where('itemType', '==', 'consumable'));
        const pSnap = await getDocs(pQ);
        const pLoaded: UserItem[] = [];
        pSnap.forEach(d => {
          const item = d.data() as UserItem;
          if (item.gameEffect && item.gameEffect !== 'none') {
            pLoaded.push({ ...item, id: d.id });
          }
        });
        setPowerups(pLoaded);
      }
    };

    fetchQuest();
  }, [questId, userData]);

  // Timer Logic
  useEffect(() => {
    if (gameState === 'playing' && quest && !feedback) {
      const q = quest.questions[currentQIndex];
      setTimeLeft(q.timeLimit);
      
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleTimeOut();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, currentQIndex, feedback, quest]);

  const handleTimeOut = () => {
    handleAnswer(-1); // -1 means timeout/wrong
  };

  const startGame = () => {
    setGameState('playing');
    setCurrentQIndex(0);
    setEliminatedOptions([]);
    setHasShield(false);
  };

  const usePowerup = async (item: UserItem) => {
    if (feedback) return; // don't use during transition
    if (item.gameEffect === 'extra_life' && hasShield) {
      alert('Você já tem um Escudo ativo!');
      return;
    }
    if (item.gameEffect === 'remove_wrong') {
      const q = quest!.questions[currentQIndex];
      const wrongIndices = q.options
        .map((_, i) => i)
        .filter(i => i !== q.correctIndex && !eliminatedOptions.includes(i));
      
      if (wrongIndices.length === 0) {
        alert('Não há mais opções erradas para eliminar!');
        return;
      }
      const toEliminate = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
      setEliminatedOptions([...eliminatedOptions, toEliminate]);
    } else if (item.gameEffect === 'add_time') {
      setTimeLeft(prev => prev + 30);
    } else if (item.gameEffect === 'extra_life') {
      setHasShield(true);
    }

    // Consume the item
    await deleteDoc(doc(db, 'user_items', item.id));
    setPowerups(powerups.filter(p => p.id !== item.id));
  };

  const handleAnswer = async (optIndex: number) => {
    if (!quest) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const q = quest.questions[currentQIndex];
    const isCorrect = optIndex === q.correctIndex;

    if (isCorrect) {
      setFeedback('correct');
      setTimeout(() => {
        setFeedback(null);
        nextQuestion();
      }, 1500);
    } else {
      setFeedback('wrong');
      
      if (hasShield) {
        setHasShield(false);
        setEliminatedOptions([...eliminatedOptions, optIndex]); // eliminate the one they just clicked
        setTimeout(() => {
          setFeedback(null);
        }, 1500);
        return;
      }
      
      if (!quest.allowRetries) {
        // Hardcore mode: insta fail
        setTimeout(() => {
          finishGame(false, 0);
        }, 2000);
      } else {
        // Vidas Extras: Deduct penalty but don't move to next question
        const newXp = Math.max(0, currentXp - quest.xpPenaltyPerRetry);
        setCurrentXp(newXp);
        setTimeout(() => {
          setFeedback(null);
          // O aluno tenta novamente a mesma pergunta
        }, 1000);
      }
    }
  };

  const nextQuestion = () => {
    if (!quest) return;
    setEliminatedOptions([]);
    if (currentQIndex < quest.questions.length - 1) {
      setCurrentQIndex(currentQIndex + 1);
    } else {
      finishGame(true, currentXp);
    }
  };

  const finishGame = async (isWin: boolean, finalXp: number) => {
    setWon(isWin);
    setGameState('result');
    if (userData?.role === 'admin' || isStudyMode) return; // Admins and study mode don't get XP
    
    setSaving(true);
    
    // Log XP if won and > 0
    if (isWin && finalXp > 0) {
      const userRef = doc(db, 'users', userData!.uid);
      await updateDoc(userRef, {
        xp: (userData?.xp || 0) + finalXp,
        coins: (userData?.coins || 0) + finalXp
      });

      await addDoc(collection(db, 'xp_logs'), {
        studentId: userData!.uid,
        evalName: `Missão: ${quest?.title}`,
        xpGained: finalXp,
        timestamp: serverTimestamp()
      });
    }

    // Save Attempt
    await addDoc(collection(db, 'quest_attempts'), {
      questId: quest?.id,
      studentId: userData!.uid,
      status: isWin ? 'completed' : 'failed',
      earnedXp: isWin ? finalXp : 0,
      timestamp: serverTimestamp()
    });

    setSaving(false);
  };

  if (gameState === 'loading') {
    return <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><h2>Carregando Campo de Batalha...</h2></div>;
  }

  return (
    <div className="app-container" style={{ 
      position: 'relative', 
      overflow: 'hidden',
      background: quest?.coverImageUrl ? `url(${quest.coverImageUrl}) center/cover no-repeat` : 'var(--bg-dark)'
    }}>
      {/* Dark overlay for readability */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)' }} />

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        {/* Header */}
        <div style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ArrowLeft /> Abandonar
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {hasShield && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.3)', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', animation: 'epicGlow 2s infinite alternate' }}>
                <Shield size={18} />
                <span style={{ fontWeight: 'bold' }}>Escudo Ativo</span>
              </div>
            )}
            {gameState === 'playing' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid var(--gold-primary)' }}>
                  <Star size={18} color="var(--gold-primary)" />
                  <span style={{ fontWeight: 'bold', color: 'var(--gold-primary)' }}>{currentXp} XP Restante</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: timeLeft <= 5 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px', border: `1px solid ${timeLeft <= 5 ? 'var(--accent-red)' : 'var(--text-secondary)'}`, color: timeLeft <= 5 ? 'var(--accent-red)' : 'white' }}>
                  <Clock size={18} />
                  <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{timeLeft}s</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2rem 2rem 2rem' }}>
          
          {gameState === 'intro' && quest && (
            <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', padding: '4rem', textAlign: 'center', animation: 'epicZoom 0.5s ease-out' }}>
              <Swords size={64} color="var(--gold-primary)" style={{ margin: '0 auto 2rem auto' }} />
              <h1 className="title-glow" style={{ fontSize: '3rem', marginBottom: '1rem' }}>{quest.title}</h1>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '3rem', lineHeight: 1.6 }}>{quest.description}</p>
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '4rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem 2rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>Recompensa</h4>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <Star size={24} /> {isStudyMode ? '0 XP (Estudo)' : `${quest.baseXp} XP`}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem 2rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>Modo de Batalha</h4>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: quest.allowRetries ? 'var(--accent-green)' : 'var(--accent-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={20} /> {quest.allowRetries ? 'Vidas Extras' : 'Hardcore'}
                  </div>
                </div>
              </div>

              <button className="login-btn" onClick={startGame} style={{ background: 'var(--gold-primary)', color: 'black', border: 'none', padding: '1.5rem 4rem', fontSize: '1.5rem', borderRadius: '50px' }}>
                Iniciar Batalha
              </button>
            </div>
          )}

          {gameState === 'playing' && quest && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease-out' }}>
              
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase' }}>Desafio {currentQIndex + 1} de {quest.questions.length}</span>
              </div>

              {/* Question Card */}
              <div className="glass-panel" style={{ padding: '3rem', position: 'relative', border: feedback === 'correct' ? '2px solid var(--accent-green)' : feedback === 'wrong' ? '2px solid var(--accent-red)' : '1px solid var(--border-glass)' }}>
                {quest.questions[currentQIndex].imageUrl && (
                  <div style={{ width: '100%', height: '300px', marginBottom: '2rem', borderRadius: '12px', overflow: 'hidden', background: 'rgba(0,0,0,0.5)' }}>
                    <img src={quest.questions[currentQIndex].imageUrl} alt="Quest" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                )}
                <h2 style={{ fontSize: '2rem', margin: 0, textAlign: 'center' }}>{quest.questions[currentQIndex].title}</h2>
              </div>

              {/* Options Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {quest.questions[currentQIndex].options.map((opt, i) => {
                  const isEliminated = eliminatedOptions.includes(i);
                  return (
                    <button 
                      key={i} 
                      onClick={() => !isEliminated && handleAnswer(i)}
                      disabled={feedback !== null || isEliminated}
                      style={{ 
                        padding: '1.5rem', 
                        borderRadius: '12px', 
                        background: isEliminated ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.05)', 
                        border: isEliminated ? '1px solid transparent' : '1px solid var(--border-glass)', 
                        color: isEliminated ? 'rgba(255,255,255,0.2)' : 'var(--text-primary)', 
                        cursor: isEliminated ? 'not-allowed' : 'pointer', 
                        textAlign: 'left', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '1rem',
                        fontSize: '1.1rem',
                        transition: 'all 0.2s',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      {isEliminated && <div style={{ position: 'absolute', inset: 0, background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><XCircle size={48} color="rgba(239, 68, 68, 0.3)" /></div>}
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--gold-primary)', flexShrink: 0 }}>
                        {String.fromCharCode(65 + i)}
                      </div>
                      {opt.imageUrl && <img src={opt.imageUrl} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />}
                      <span style={{ textDecoration: isEliminated ? 'line-through' : 'none' }}>{opt.text}</span>
                    </button>
                  )
                })}
              </div>

              {/* Power-ups Section */}
              {powerups.length > 0 && (
                <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Zap size={18} /> Seus Poderes
                  </h4>
                  <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                    {powerups.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => usePowerup(p)}
                        disabled={feedback !== null}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid var(--gold-primary)',
                          borderRadius: '8px',
                          padding: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          color: 'white',
                          cursor: feedback ? 'not-allowed' : 'pointer',
                          opacity: feedback ? 0.5 : 1,
                          flexShrink: 0
                        }}
                      >
                        {p.itemImageUrl ? (
                          <img src={p.itemImageUrl} alt="" style={{ width: 30, height: 30, borderRadius: '4px', objectFit: 'cover' }} />
                        ) : (
                          <Package size={20} color="var(--gold-primary)" />
                        )}
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{p.itemTitle}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            {p.gameEffect === 'remove_wrong' ? 'Eliminar 1' : p.gameEffect === 'add_time' ? '+30s Tempo' : p.gameEffect === 'extra_life' ? 'Escudo' : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {gameState === 'result' && (
            <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '4rem', textAlign: 'center', animation: 'epicZoom 0.5s ease-out', border: won ? '2px solid var(--gold-primary)' : '2px solid var(--accent-red)' }}>
              
              {errorMessage ? (
                <>
                  <ShieldAlert size={64} color="var(--text-secondary)" style={{ margin: '0 auto 2rem auto' }} />
                  <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Aviso</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '3rem' }}>{errorMessage}</p>
                </>
              ) : won ? (
                <>
                  <CheckCircle size={80} color="var(--gold-primary)" style={{ margin: '0 auto 2rem auto' }} />
                  <h1 className="title-glow" style={{ fontSize: '3rem', marginBottom: '1rem', color: 'var(--gold-primary)' }}>VITÓRIA!</h1>
                  <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>O monstro foi derrotado e o desafio foi superado.</p>
                  <div style={{ background: 'rgba(251, 191, 36, 0.1)', padding: '2rem', borderRadius: '12px', display: 'inline-block', marginBottom: '3rem' }}>
                    <div style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>Recompensa Adquirida</div>
                    <div style={{ fontSize: '3rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>+{isStudyMode ? 0 : currentXp} XP</div>
                  </div>
                </>
              ) : (
                <>
                  <XCircle size={80} color="var(--accent-red)" style={{ margin: '0 auto 2rem auto' }} />
                  <h1 className="title-glow" style={{ fontSize: '3rem', marginBottom: '1rem', color: 'var(--accent-red)' }}>FALHA</h1>
                  <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '3rem' }}>Você foi derrotado. O tempo acabou ou você errou o ataque fatal.</p>
                </>
              )}

              <div>
                <button className="login-btn" onClick={() => navigate('/dashboard')} disabled={saving} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid var(--border-glass)', padding: '1rem 3rem', fontSize: '1.2rem' }}>
                  {saving ? 'Salvando progresso...' : 'Retornar ao Acampamento'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
