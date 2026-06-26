import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, ShieldAlert, Swords, Clock, Star, Shield, Heart, CheckCircle, XCircle, Package, Zap } from 'lucide-react';
import type { GameEffectType } from '../components/AdminStoreManager';
import type { QuestDef } from './AdminDashboard';

interface UserItem {
  id: string;
  itemId: string;
  itemTitle: string;
  itemImageUrl: string;
  gameEffect?: GameEffectType;
  usableInQuest?: boolean;
  itemType: 'consumable' | 'equippable';
  equipped: boolean;
  giftedBy?: string;
  count?: number;
  docIds?: string[];
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
  
  // RPG Battle States
  const [battleMessage, setBattleMessage] = useState<string>('Prepare-se para a batalha!');
  const [playerAnim, setPlayerAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [monsterAnim, setMonsterAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  
  // Feedback Visual (certo/errado)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  // Histórico de Respostas
  const [studentAnswers, setStudentAnswers] = useState<{ qIndex: number; text: string; isCorrect: boolean }[]>([]);

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
          if (item.usableInQuest) {
            pLoaded.push({ ...item, id: d.id });
          }
        });

        const groupedMap = new Map<string, UserItem>();
        pLoaded.forEach(item => {
          const key = `${item.itemId}`;
          if (groupedMap.has(key)) {
            const existing = groupedMap.get(key)!;
            existing.count = (existing.count || 1) + 1;
            existing.docIds = [...(existing.docIds || [existing.id]), item.id];
          } else {
            groupedMap.set(key, { ...item, count: 1, docIds: [item.id] });
          }
        });
        
        setPowerups(Array.from(groupedMap.values()));
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
            
            // Record timeout as a wrong answer
            setStudentAnswers(prevAns => [...prevAns, {
              qIndex: currentQIndex,
              text: '(Tempo Esgotado)',
              isCorrect: false
            }]);

            const timeoutMsgs = [
              "O monstro foi mais rápido e te acertou em cheio!",
              "Você demorou demais para agir!",
              "O tempo acabou e você sofreu dano!",
              "A lentidão custou caro nesta rodada..."
            ];
            setBattleMessage(timeoutMsgs[Math.floor(Math.random() * timeoutMsgs.length)]);
            setPlayerAnim('hurt');
            setMonsterAnim('attack');
            setTimeout(() => {
              setPlayerAnim('idle');
              setMonsterAnim('idle');
            }, 1000);

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
    if (userData?.role === 'student' && (userData?.hearts || 0) < 1 && !isStudyMode) {
      alert("Você precisa de pelo menos 1 coração (vida) para iniciar!");
      setGameState('result');
      return;
    }
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
    if (item.gameEffect === 'none') {
      alert(`Você ativou o item "${item.itemTitle}"! Mostre esta mensagem para o seu professor para receber a vantagem prometida.`);
    } else if (item.gameEffect === 'remove_wrong') {
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
    
    // Save answer
    setStudentAnswers(prev => [...prev, {
      qIndex: currentQIndex,
      text: q.options[optIndex].text,
      isCorrect
    }]);

    if (isCorrect) {
      setFeedback('correct');
      
      const msgs = [
        "Muito bem! Um golpe crítico no monstro!",
        "Você acertou em cheio!",
        "Incrível! O monstro sentiu essa!",
        "Excelente! Continue pressionando!",
        "Golpe de mestre!"
      ];
      setBattleMessage(msgs[Math.floor(Math.random() * msgs.length)]);
      setPlayerAnim('attack');
      setMonsterAnim('hurt');
      setTimeout(() => { setPlayerAnim('idle'); setMonsterAnim('idle'); }, 1000);

      setTimeout(() => {
        setFeedback(null);
        setBattleMessage('Prepare-se para o próximo round!');
        nextQuestion();
      }, 2000);
    } else {
      setFeedback('wrong');
      
      const wrongMsgs = [
        "O monstro defendeu e te acertou!",
        "Errou! Cuidado com o contra-ataque!",
        "Seu golpe passou raspando... e o monstro revidou!",
        "O inimigo é forte, tente focar mais!"
      ];
      setBattleMessage(wrongMsgs[Math.floor(Math.random() * wrongMsgs.length)]);
      setPlayerAnim('hurt');
      setMonsterAnim('attack');
      setTimeout(() => { setPlayerAnim('idle'); setMonsterAnim('idle'); }, 1000);
      
      if (hasShield) {
        setHasShield(false);
        setEliminatedOptions([...eliminatedOptions, optIndex]); // eliminate the one they just clicked
        setTimeout(() => {
          setFeedback(null);
          setBattleMessage('Seu escudo absorveu o dano do monstro! Tente novamente!');
        }, 2000);
        return;
      }
      
      let newHearts = userData?.hearts || 0;
      if (userData?.role === 'student' && !isStudyMode) {
        newHearts = Math.max(0, newHearts - 1);
        userData.hearts = newHearts;
        const userRef = doc(db, 'users', userData.uid);
        await updateDoc(userRef, { hearts: newHearts });
      }
      
      if (newHearts === 0 && userData?.role === 'student' && !isStudyMode) {
        setTimeout(() => {
          finishGame(false, 0, 'Você perdeu todos os seus corações (Game Over). Descanse ou use um item para tentar novamente mais tarde.');
        }, 2000);
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
          setBattleMessage('Respire fundo e tente novamente!');
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

  const finishGame = async (isWin: boolean, finalXp: number, customMessage?: string) => {
    setWon(isWin);
    setGameState('result');
    if (customMessage) setErrorMessage(customMessage);

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
      answers: studentAnswers,
      timestamp: serverTimestamp()
    });

    setSaving(false);
    setSaving(false);
  };

  const handleAbandon = async () => {
    if (gameState === 'playing' && !isStudyMode && userData?.role === 'student') {
      if (!confirm("Tem certeza que deseja abandonar? Você perderá 1 vida e receberá penalidade de XP para as perguntas não respondidas. A missão será encerrada permanentemente!")) {
        return;
      }
      
      let newHearts = userData.hearts || 0;
      if (newHearts > 0) {
        newHearts -= 1;
        userData.hearts = newHearts;
        await updateDoc(doc(db, 'users', userData.uid), { hearts: newHearts });
      }

      const remainingQuestions = quest!.questions.length - currentQIndex;
      const penalty = remainingQuestions * quest!.xpPenaltyPerRetry;
      const finalXp = Math.max(0, currentXp - penalty);
      
      finishGame(true, finalXp, `Você abandonou a missão. Recebeu apenas ${finalXp} XP (penalidade aplicada).`);
    } else {
      navigate('/dashboard');
    }
  };

  const handleUsePowerup = async (item: UserItem) => {
    if (gameState !== 'playing') {
      alert("Você só pode usar itens durante a batalha!");
      return;
    }
    
    if (item.gameEffect === 'remove_wrong') {
      const q = quest!.questions[currentQIndex];
      const correctIdx = q.correctIndex;
      const wrongIndices = q.options
        .map((_, i) => (i !== correctIdx && !eliminatedOptions.includes(i) ? i : -1))
        .filter(i => i !== -1);
      
      if (wrongIndices.length === 0) {
        alert("Não há mais opções erradas para remover!");
        return;
      }
      const randomWrong = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
      setEliminatedOptions([...eliminatedOptions, randomWrong]);
      
    } else if (item.gameEffect === 'add_time') {
      setTimeLeft(prev => prev + 30);
      
    } else if (item.gameEffect === 'extra_life' || item.gameEffect === 'restore_hp') {
      setHasShield(true);
    }
    
    await deleteDoc(doc(db, 'user_items', item.id));
    setPowerups(powerups.filter(p => p.id !== item.id));
  };


  if (gameState === 'loading') {
    return <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><h2>Carregando Campo de Batalha...</h2></div>;
  }

  return (
    <div className="app-container" style={{ 
      position: 'relative', 
      height: '100vh',
      overflow: 'hidden',
      background: quest?.coverImageUrl ? `url(${quest.coverImageUrl}) center/cover no-repeat` : 'var(--bg-dark)'
    }}>
      {/* Dark overlay for readability */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)' }} />

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
        
        {/* Header */}
        <div style={{ padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <button onClick={handleAbandon} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ArrowLeft /> Abandonar
            </button>
            {gameState === 'playing' && quest && (
              <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Desafio {currentQIndex + 1} de {quest.questions.length}
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {gameState === 'playing' && powerups.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginRight: '1rem' }}>
                {powerups.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleUsePowerup(p)}
                    title={`Usar: ${p.itemTitle}`}
                    style={{ position: 'relative', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {p.itemImageUrl ? (
                      <img src={p.itemImageUrl} alt={p.itemTitle} style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }} />
                    ) : (
                      <Zap size={24} color="var(--gold-primary)" style={{ padding: '4px' }} />
                    )}
                    {p.count && p.count > 1 && (
                      <span style={{ position: 'absolute', top: -5, right: -5, background: 'var(--accent-red)', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px', zIndex: 2 }}>
                        {p.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {hasShield && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.3)', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', animation: 'epicGlow 2s infinite alternate' }}>
                <Shield size={18} />
                <span style={{ fontWeight: 'bold' }}>Escudo</span>
              </div>
            )}
            {gameState === 'playing' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid var(--gold-primary)' }}>
                  <Star size={18} color="var(--gold-primary)" />
                  <span style={{ fontWeight: 'bold', color: 'var(--gold-primary)' }}>{currentXp} XP</span>
                </div>
                {!isStudyMode && userData?.role === 'student' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid #ef4444' }}>
                    {Array.from({ length: userData.hearts || 0 }).map((_, i) => (
                      <Heart key={i} size={18} fill="#ef4444" color="#ef4444" />
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: timeLeft <= 5 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px', border: `1px solid ${timeLeft <= 5 ? 'var(--accent-red)' : 'var(--text-secondary)'}`, color: timeLeft <= 5 ? 'var(--accent-red)' : 'white' }}>
                  <Clock size={18} />
                  <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{timeLeft}s</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Battle Arena Fixed */}
        {gameState === 'playing' && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border-glass)', flexShrink: 0, zIndex: 20 }}>
            
            {/* Player Side */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transform: playerAnim === 'attack' ? 'translateX(50px)' : playerAnim === 'hurt' ? 'translateX(-20px) rotate(-10deg)' : 'none', transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
              <div style={{ position: 'relative' }}>
                <img src={userData?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData?.name}`} alt="Player" style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid var(--gold-primary)', background: 'var(--bg-dark)', objectFit: 'cover' }} />
                {playerAnim === 'hurt' && <div style={{ position: 'absolute', inset: -10, background: 'rgba(239, 68, 68, 0.5)', borderRadius: '50%', mixBlendMode: 'overlay', animation: 'pulse 0.5s infinite' }} />}
              </div>
              <span style={{ fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.9rem' }}>Você</span>
            </div>

            {/* Battle Message */}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 2rem' }}>
              <div style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem', textAlign: 'center', minWidth: '250px', backdropFilter: 'blur(10px)', boxShadow: 'var(--shadow-glass)' }}>
                <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'white', minHeight: '1.5em', fontStyle: 'italic' }}>
                  {battleMessage}
                </p>
              </div>
            </div>

            {/* Monster Side */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transform: monsterAnim === 'attack' ? 'translateX(-50px)' : monsterAnim === 'hurt' ? 'translateX(20px) rotate(10deg)' : 'none', transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
              <div style={{ position: 'relative' }}>
                <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${quest?.title || 'monster'}&colors=red,orange,yellow`} alt="Monster" style={{ width: '90px', height: '90px', filter: 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.5))' }} />
                {monsterAnim === 'hurt' && <div style={{ position: 'absolute', inset: -10, background: 'rgba(239, 68, 68, 0.5)', mixBlendMode: 'overlay', animation: 'pulse 0.5s infinite' }} />}
              </div>
              <span style={{ fontWeight: 'bold', color: 'var(--accent-red)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.9rem' }}>Inimigo</span>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: gameState === 'playing' ? 'flex-start' : 'center', padding: '2rem', overflowY: 'auto' }}>

          
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
