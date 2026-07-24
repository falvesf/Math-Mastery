import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Loader2, Play, CheckCircle, ChevronRight, Swords, Crown, Skull } from 'lucide-react';
import type { QuestDef } from './AdminDashboard';
import AvatarPrint from '../components/AvatarPrint';
import CustomModelViewer from '../components/CustomModelViewer';
import AvatarCharacter from '../components/AvatarCharacter';
import { useDialog } from '../contexts/DialogContext';

export interface LivePlayer {
  uid: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  avatarConfig: any;
  equippedItems?: any[];
  score: number;
  isDead: boolean;
  currentAnswer?: number | null;
  isCorrect?: boolean | null;
  answerTime?: number | null;
  xp?: number;
  power?: number;
}

export interface LiveSession {
  questId: string;
  teacherId: string;
  status: 'lobby' | 'question' | 'reveal' | 'ranking' | 'finished';
  currentQuestionIndex: number; // Index in the activeQuestions array
  activeQuestions: number[]; // Array of original question indices
  monsterHp: number;
  maxMonsterHp: number;
  players: Record<string, LivePlayer>;
  questionStartTime?: number; // timestamp when the question started
}

export default function LiveQuestAdmin() {
  const { sessionId } = useParams(); // Using questId as sessionId for simplicity
  const { userData } = useAuth();
  const { showConfirm } = useDialog();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [quest, setQuest] = useState<QuestDef | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const processedAnswers = useRef<Set<string>>(new Set());
  const [playerAnims, setPlayerAnims] = useState<Record<string, any>>({});
  const [playerErrou, setPlayerErrou] = useState<Record<string, boolean>>({});
  const [activeAvatars, setActiveAvatars] = useState<Record<string, { active: boolean, direction: 'left' | 'right' }>>({});
  const [monsterAnim, setMonsterAnim] = useState<string>('idle');
  const [monsterDirection, setMonsterDirection] = useState<'left' | 'right'>('left');

  // Reset processed answers on new question
  useEffect(() => {
    if (session?.status === 'question') {
      processedAnswers.current.clear();
      setPlayerErrou({});
      setPlayerAnims({});
      setActiveAvatars({});
    }
  }, [session?.currentQuestionIndex, session?.status]);
  useEffect(() => {
    if (session?.status !== 'question' || !session.questionStartTime || !quest) return;
    
    const currentQOriginalIndex = session.activeQuestions[session.currentQuestionIndex];
    const question = quest.questions[currentQOriginalIndex];
    const limit = question?.timeLimit || 30;

    const interval = setInterval(() => {
       const elapsed = Math.floor((Date.now() - session.questionStartTime!) / 1000);
       const remaining = Math.max(0, limit - elapsed);
       setTimeLeft(remaining);

       const activePlayers = Object.values(session.players).filter(p => p.hp === undefined || p.hp > 0);
       const activePlayersCount = activePlayers.length;
       const ansCount = activePlayers.filter(p => p.currentAnswer !== null && p.currentAnswer !== undefined).length;

       if (remaining === 0 || (activePlayersCount > 0 && ansCount >= activePlayersCount)) {
          clearInterval(interval);
          const correctCount = activePlayers.filter(p => p.currentAnswer === question.correctIndex).length;
          const nobodyCorrect = activePlayersCount > 0 && correctCount === 0;
          
          const updates: any = { status: 'reveal', nobodyCorrect };
          if (nobodyCorrect) {
             updates.activeQuestions = [...session.activeQuestions, session.activeQuestions[session.currentQuestionIndex]];
          }
          updateDoc(doc(db, 'live_quests', sessionId!), updates);
       }
    }, 500);

    return () => clearInterval(interval);
  }, [session, quest, sessionId]);

  const activePlayers = session ? Object.values(session.players).filter(p => p.hp === undefined || p.hp > 0) : [];
  const totalPlayers = session ? Object.keys(session.players).length : 0;
  const activePlayersCount = activePlayers.length;
  const answersCount = activePlayers.filter(p => p.currentAnswer !== null && p.currentAnswer !== undefined).length;

  // Process live combat animations
  useEffect(() => {
    if (!session || session.status !== 'question' || !quest) return;
    const currentQOriginalIndex = session.activeQuestions[session.currentQuestionIndex];
    const question = quest.questions[currentQOriginalIndex];

    Object.values(session.players).forEach(p => {
       if (p.currentAnswer !== null && p.currentAnswer !== undefined && !processedAnswers.current.has(p.uid)) {
          processedAnswers.current.add(p.uid);
          const isCorrect = p.currentAnswer === question.correctIndex;
          
          // Determine side based on ranking position to match the rendering logic
          const sorted = Object.values(session.players).sort((a, b) => b.score - a.score);
          const rankPos = sorted.findIndex(player => player.uid === p.uid);
          const direction = rankPos < 5 ? 'left' : 'right';
          
          setMonsterDirection(direction === 'left' ? 'left' : 'right');
          
          if (isCorrect) {
             setActiveAvatars(prev => ({...prev, [p.uid]: { active: true, direction }}));
             setPlayerAnims(prev => ({...prev, [p.uid]: 'attack'}));
             setMonsterAnim('hurt');
             
             setTimeout(() => {
                setMonsterAnim('idle');
             }, 500);
             
             setTimeout(() => {
                setActiveAvatars(prev => { const n = {...prev}; delete n[p.uid]; return n; });
             }, 1500);
          } else {
             // FAKE ATTACK
             setActiveAvatars(prev => ({...prev, [p.uid]: { active: true, direction }}));
             setPlayerAnims(prev => ({...prev, [p.uid]: 'attack'})); // Player attacks, but monster doesn't get hurt
             setPlayerErrou(prev => ({...prev, [p.uid]: true}));
             
             setTimeout(() => {
                setActiveAvatars(prev => { const n = {...prev}; delete n[p.uid]; return n; });
                setPlayerErrou(prev => ({...prev, [p.uid]: false}));
             }, 2000);
          }
       }
    });
  }, [session, quest]);

  // Reveal to Ranking transition
  useEffect(() => {
    if (session?.status === 'reveal' && sessionId) {
       const t = setTimeout(() => {
          if (session.monsterHp <= 0 || session.currentQuestionIndex >= session.activeQuestions.length - 1) {
             updateDoc(doc(db, 'live_quests', sessionId), { status: 'finished' });
          } else {
             updateDoc(doc(db, 'live_quests', sessionId), { status: 'ranking' });
          }
       }, 5000); // Wait 5s on reveal screen before showing ranking
       return () => clearTimeout(t);
    }
  }, [session?.status, sessionId, session?.monsterHp, session?.currentQuestionIndex, session?.activeQuestions?.length]);

  // Load Quest and Session
  useEffect(() => {
    if (!sessionId || !userData) return;

    const loadData = async () => {
      // Load Quest Def
      const qDoc = await getDoc(doc(db, 'quests', sessionId));
      if (!qDoc.exists()) {
        navigate('/admin');
        return;
      }
      const qData = qDoc.data() as QuestDef;
      setQuest(qData);

      // Create or Load Session
      const sessionRef = doc(db, 'live_quests', sessionId);
      const sDoc = await getDoc(sessionRef);
      if (!sDoc.exists()) {
        const newSession: LiveSession = {
          questId: sessionId,
          teacherId: userData.uid,
          status: 'lobby',
          currentQuestionIndex: 0,
          activeQuestions: qData.questions.map((_, i) => i),
          monsterHp: 0,
          maxMonsterHp: 0,
          players: {}
        };
        await setDoc(sessionRef, newSession);
      } else {
        // If resuming a session but no players are present, force reset to lobby
        const data = sDoc.data() as LiveSession;
        const playersCount = Object.keys(data.players || {}).length;
        if (data.status !== 'lobby' && playersCount === 0) {
          await updateDoc(sessionRef, {
            status: 'lobby',
            currentQuestionIndex: 0,
            monsterHp: 0,
            maxMonsterHp: 0
          });
        }
      }

      // Listen to Session
      const unsub = onSnapshot(sessionRef, (snap) => {
        if (snap.exists()) {
          setSession(snap.data() as LiveSession);
        } else {
          setSession(null);
        }
        setLoading(false);
      });

      return () => unsub();
    };

    loadData();
  }, [sessionId, userData, navigate]);

  const handleStartGame = async () => {
    if (!session || !sessionId || !quest) return;
    const playerIds = Object.keys(session.players);
    if (playerIds.length === 0) {
      alert("Aguarde pelo menos 1 aluno entrar na sala!");
      return;
    }

    const players = Object.values(session.players);

    // O HP do monstro é o total de acertos possíveis (se todos acertarem tudo) vezes 80%.
    // O dano de cada aluno agora é fixo em 1 na missão ao vivo para garantir que o HP caia proporcionalmente ao número de questões.
    const maxHp = Math.max(1, Math.ceil(players.length * quest.questions.length * 0.8));

    await updateDoc(doc(db, 'live_quests', sessionId), {
      status: 'question',
      monsterHp: maxHp,
      maxMonsterHp: maxHp,
      questionStartTime: Date.now()
    });
  };

  const handleEndSession = async () => {
    if (!sessionId) return;
    const confirmed = await showConfirm("Tem certeza que deseja encerrar esta sessão ao vivo? Todos os alunos serão desconectados.");
    if (confirmed) {
      await deleteDoc(doc(db, 'live_quests', sessionId));
      navigate('/admin');
    }
  };

  if (loading || !quest || !session) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 className="animate-spin" size={48} color="var(--gold-primary)" />
      </div>
    );
  }

  const playersList = Object.values(session.players);

  // --- LOBBY VIEW ---
  if (session.status === 'lobby') {
    return (
      <div className="app-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid var(--border-glass)' }}>
          <h1 style={{ margin: 0, color: 'var(--gold-primary)', fontSize: '1.5rem' }}>Lobby: {quest.title}</h1>
          <button onClick={handleEndSession} style={{ background: 'transparent', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>
            Encerrar Sessão
          </button>
        </div>

        <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', padding: '3rem', textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Aguardando Alunos...</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '2rem' }}>Peça para os alunos entrarem na missão <strong>"{quest.title}"</strong> pela aba Início.</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '3rem' }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem 2rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Jogadores na Sala</span>
                <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent-blue)' }}>{playersList.length}</span>
              </div>
            </div>

            <button 
              onClick={handleStartGame}
              disabled={playersList.length === 0}
              className="login-btn"
              style={{ padding: '1rem 3rem', fontSize: '1.2rem', background: playersList.length > 0 ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', color: playersList.length > 0 ? 'black' : 'var(--text-secondary)' }}
            >
              <Play fill="currentColor" size={24} style={{ marginRight: '0.5rem', display: 'inline' }} />
              Iniciar Batalha
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', maxWidth: '1000px' }}>
            {playersList.map(p => (
              <div key={p.uid} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '120px' }}>
                <div style={{ width: '70px', height: '100px', marginBottom: '0.5rem' }}>
                  {p.avatarConfig ? (
                    <AvatarPrint config={p.avatarConfig} equippedItems={p.equippedItems || []} size={70} />
                  ) : (
                    <div style={{ width: '100%', height: '70px', borderRadius: '50%', background: 'var(--accent-blue)' }}></div>
                  )}
                </div>
                <span style={{ fontWeight: 'bold', textAlign: 'center', fontSize: '0.9rem', lineHeight: '1.2' }}>
                  {(() => {
                    const parts = p.name.trim().split(' ');
                    if (parts.length === 1) return parts[0];
                    return `${parts[0]} ${parts[parts.length - 1]}`;
                  })()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleNextQuestion = async () => {
    if (!sessionId) return;
    if (session.currentQuestionIndex + 1 >= session.activeQuestions.length || session.monsterHp <= 0) {
      // End game
      await updateDoc(doc(db, 'live_quests', sessionId), {
        status: 'finished'
      });
    } else {
      // Reset player answers
      const updates: any = {
        status: 'question',
        currentQuestionIndex: session.currentQuestionIndex + 1,
        questionStartTime: Date.now()
      };
      Object.keys(session.players).forEach(uid => {
        updates[`players.${uid}.currentAnswer`] = null;
        updates[`players.${uid}.isCorrect`] = null;
        updates[`players.${uid}.answerTime`] = null;
      });
      await updateDoc(doc(db, 'live_quests', sessionId), updates);
    }
  };

  const currentQOriginalIndex = session.activeQuestions[session.currentQuestionIndex];
  const question = quest.questions[currentQOriginalIndex];
  const sortedPlayers = Object.values(session.players).sort((a, b) => (b.score || 0) - (a.score || 0));

  const OPTION_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c']; // Red, Blue, Yellow, Green

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid var(--border-glass)', flexShrink: 0, zIndex: 30, position: 'relative' }}>
        <h1 style={{ margin: 0, color: 'var(--gold-primary)', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
          <Swords size={24} /> {quest.title}
        </h1>
        
        {/* CENTER QUESTION COUNTER */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
          {(session.status === 'question' || session.status === 'reveal') && (
            <span style={{ color: 'var(--gold-primary)', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold' }}>
              Pergunta {session.currentQuestionIndex + 1} de {session.activeQuestions.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          {session.status === 'question' && (
            <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1.5rem', borderRadius: '12px', border: `2px solid ${timeLeft <= 5 ? 'var(--accent-red)' : 'var(--gold-primary)'}` }}>
              <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tempo Restante</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: timeLeft <= 5 ? 'var(--accent-red)' : 'white' }}>{timeLeft}s</span>
            </div>
          )}
          {session.status === 'ranking' && (
            <button onClick={handleNextQuestion} className="login-btn" style={{ padding: '0.5rem 2rem', fontSize: '1rem', background: 'var(--gold-primary)', color: 'black' }}>
              Próxima Etapa <ChevronRight style={{ display: 'inline', marginLeft: '0.5rem' }} />
            </button>
          )}
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Respostas</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{answersCount} / {activePlayersCount}</div>
          </div>
          <button onClick={handleEndSession} style={{ background: 'transparent', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>
            Abortar
          </button>
        </div>
      </div>
      
      {/* MAIN CONTENT AREA */}
      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* BACKGROUND IMAGE */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 0 }}>
           <div className="battle-arena-bg-image" style={{ opacity: 0.5 }} />
        </div>

        {/* MIDDLE AREA: 3D VIEWER & AVATARS - HIDE ON RANKING */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: (session.status === 'ranking' || session.status === 'finished') ? 0 : 1, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
          
          <div 
            className={monsterAnim === 'hurt' ? 'anim-hurt' : ''}
            style={{ 
              position: 'relative', 
              width: '280px', 
              height: '350px', 
              display: 'flex', 
              alignItems: 'flex-end', 
              justifyContent: 'center',
              transform: `scaleX(${monsterDirection === 'left' ? -1 : 1})`,
              transition: 'transform 0.3s ease-in-out'
            }}
          >
            {quest.monsterAvatarConfig ? (
               <AvatarCharacter config={quest.monsterAvatarConfig} size={250} animation={monsterAnim === 'hurt' ? 'hurt' : 'idle'} interactive={false} />
            ) : (
               <CustomModelViewer modelUrl={quest.monsterModelUrl || 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb'} role="monster" size={280} animation={monsterAnim} />
            )}
            {monsterAnim === 'hurt' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(239, 68, 68, 0.5)', mixBlendMode: 'overlay', animation: 'pulse 0.5s infinite', borderRadius: '8px' }} />}
          </div>
          
          {/* RENDER 10 PLAYERS AROUND MONSTER */}
          <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 5%', pointerEvents: 'none', zIndex: 5 }}>
             <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', width: '30%' }}>
               {sortedPlayers.slice(0, 5).map(p => activeAvatars[p.uid]?.active && (
                 <div key={p.uid} style={{ position: 'relative', transform: playerAnims[p.uid] === 'attack' ? 'translateX(250px)' : 'none', transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                    {playerErrou[p.uid] && <div style={{ position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)', background: 'var(--accent-red)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 'bold', border: '2px solid white', zIndex: 10 }}>ERROU!!</div>}
                    {p.avatarConfig && <AvatarCharacter config={p.avatarConfig} equippedItems={p.equippedItems || []} size={150} animation={playerAnims[p.uid] || 'idle'} interactive={false} />}
                 </div>
               ))}
             </div>
             <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', width: '30%', transform: 'scaleX(-1)' }}>
               {sortedPlayers.slice(5, 10).map(p => activeAvatars[p.uid]?.active && (
                 <div key={p.uid} style={{ position: 'relative', transform: playerAnims[p.uid] === 'attack' ? 'translateX(250px)' : 'none', transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                    {playerErrou[p.uid] && <div style={{ position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%) scaleX(-1)', background: 'var(--accent-red)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 'bold', border: '2px solid white', zIndex: 10 }}>ERROU!!</div>}
                    {p.avatarConfig && <AvatarCharacter config={p.avatarConfig} equippedItems={p.equippedItems || []} size={150} animation={playerAnims[p.uid] || 'idle'} interactive={false} />}
                 </div>
               ))}
             </div>
          </div>
        </div>

        {/* TOP AREA: HP Bar & Question Text */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25, padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
          {/* MONSTER HP BAR - HIDE ON RANKING */}
          {session.status !== 'ranking' && session.status !== 'finished' && (
            <div style={{ width: '100%', maxWidth: '800px', background: 'rgba(0,0,0,0.6)', borderRadius: '20px', padding: '0.5rem', border: '2px solid var(--border-glass)', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', padding: '0 0.5rem' }}>
                <span style={{ fontWeight: 'bold', color: 'var(--accent-red)' }}>{quest.monsterName || 'Monstro'}</span>
                <span style={{ fontWeight: 'bold' }}>{session.monsterHp} / {session.maxMonsterHp} HP</span>
              </div>
              <div style={{ height: '20px', background: 'rgba(0,0,0,0.5)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${Math.max(0, (session.monsterHp / session.maxMonsterHp) * 100)}%`,
                  background: 'linear-gradient(90deg, #ff0000, #ff5555)',
                  transition: 'width 0.5s ease-out'
                }}></div>
              </div>
            </div>
          )}

          {session.status === 'ranking' && (
            <div style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,0.8)', padding: '1.5rem', borderRadius: '16px', width: '100%', maxWidth: '600px', border: '1px solid var(--gold-primary)', backdropFilter: 'blur(10px)', marginTop: '0.5rem' }}>
               <h2 style={{ textAlign: 'center', color: 'var(--gold-primary)', fontSize: '1.8rem', marginBottom: '1.5rem', marginTop: 0 }}>Ranking Provisório</h2>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                 {sortedPlayers.slice(0, 5).map((p, index) => (
                   <div key={p.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: index === 0 ? 'var(--gold-primary)' : 'white' }}>#{index + 1}</span>
                        <span style={{ fontSize: '1.2rem' }}>{p.name}</span>
                     </div>
                     <span style={{ fontWeight: 'bold', color: 'var(--accent-blue)', fontSize: '1.2rem' }}>{p.score} pts</span>
                   </div>
                 ))}
               </div>
            </div>
          )}

          {/* QUESTION TEXT */}
          {(session.status === 'question' || session.status === 'reveal') && (
            <div style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 100%)', padding: '1rem', borderRadius: '16px', pointerEvents: 'auto', width: '100%', maxWidth: '800px', border: '1px solid var(--border-glass)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'flex', flexDirection: question.imageUrl ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
              {question.imageUrl && (
                <img src={question.imageUrl} alt="Questão" style={{ maxHeight: '80px', maxWidth: '200px', objectFit: 'contain', borderRadius: '8px' }} />
              )}
              <h2 style={{ fontSize: question.imageUrl ? '1.3rem' : '1.5rem', margin: 0, flex: 1, textAlign: question.imageUrl ? 'left' : 'center', textShadow: '0 2px 4px rgba(0,0,0,0.8)', color: 'white' }}>
                {question.title || (question as any).question || 'Sem título'}
              </h2>
            </div>
          )}
        </div>
        {/* BOTTOM AREA: OPTIONS & OVERLAYS */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, padding: '1rem 2rem', pointerEvents: 'none' }}>
          {session.status === 'reveal' && (session as any).nobodyCorrect && (
            <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(239, 68, 68, 0.95)', padding: '1.5rem 3rem', borderRadius: '16px', border: '2px solid white', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', textAlign: 'center', minWidth: '400px' }}>
               <h2 style={{ margin: 0, fontSize: '2.5rem', color: 'white' }}>Ninguém Acertou!</h2>
               <p style={{ margin: '0.5rem 0 0', fontSize: '1.2rem', color: 'rgba(255,255,255,0.9)' }}>Essa pergunta voltará no futuro...</p>
            </div>
          )}

          {(session.status === 'question' || session.status === 'reveal') && (
            <div style={{ pointerEvents: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: '1000px', margin: '0 auto' }}>
              {question.options.map((opt, idx) => {
                const isReveal = session.status === 'reveal';
                const nobodyCorrect = (session as any).nobodyCorrect;
                const isCorrect = idx === question.correctIndex && !nobodyCorrect;
                
                return (
                  <div key={idx} style={{ 
                    background: (isReveal && !isCorrect) ? 'rgba(0,0,0,0.6)' : OPTION_COLORS[idx % OPTION_COLORS.length], 
                    opacity: (isReveal && !isCorrect) ? 0.5 : 1,
                    padding: '1rem', 
                    borderRadius: '12px', 
                    color: 'white', 
                    fontSize: '1.2rem', 
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    boxShadow: (isReveal && isCorrect) ? '0 0 20px rgba(255,255,255,0.8)' : '0 4px 0 rgba(0,0,0,0.3)',
                    transition: 'all 0.3s'
                  }}>
                    <div style={{ width: '40px', height: '40px', background: 'rgba(0,0,0,0.3)', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.5rem', flexShrink: 0 }}>
                      {['A', 'B', 'C', 'D'][idx]}
                    </div>
                    <span style={{ flex: 1 }}>{typeof opt === 'string' ? opt : (opt.text || '')}</span>
                    {isReveal && isCorrect && <CheckCircle size={32} color="white" />}
                  </div>
                );
              })}
            </div>
          )}
          {/* FINISHED CONTENT */}
          {session.status === 'finished' && (
            <div style={{ pointerEvents: 'auto', position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.85)', padding: '3rem', borderRadius: '24px', width: '100%', maxWidth: '800px', border: '2px solid var(--gold-primary)', backdropFilter: 'blur(10px)', textAlign: 'center' }}>
               <h1 style={{ color: 'var(--gold-primary)', fontSize: '3rem', marginBottom: '0.5rem', textShadow: '0 4px 8px rgba(0,0,0,0.5)' }}>Missão Concluída!</h1>
               {session.monsterHp <= 0 ? (
                 <div style={{ color: 'var(--accent-green)', fontSize: '1.5rem', marginBottom: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}><Skull /> Monstro Derrotado! Vitória Épica!</div>
               ) : (
                 <div style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '2rem' }}>Fim das perguntas. Veja quem se destacou!</div>
               )}
               
               <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '2rem', marginBottom: '3rem', height: '200px' }}>
                 {/* 2nd Place */}
                 {sortedPlayers[1] && (
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                     <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{sortedPlayers[1].name}</div>
                     <div style={{ width: '120px', height: '120px', background: 'silver', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '1rem', color: 'black', fontWeight: 'bold', fontSize: '1.5rem', boxShadow: 'inset 0 4px 10px rgba(255,255,255,0.5)' }}>
                       2º
                     </div>
                     <div style={{ marginTop: '0.5rem', color: 'silver', fontWeight: 'bold' }}>{sortedPlayers[1].score} pts</div>
                   </div>
                 )}
                 {/* 1st Place */}
                 {sortedPlayers[0] && (
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                     <Crown size={48} color="var(--gold-primary)" style={{ marginBottom: '0.5rem' }} />
                     <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--gold-primary)', marginBottom: '0.5rem' }}>{sortedPlayers[0].name}</div>
                     <div style={{ width: '140px', height: '160px', background: 'var(--gold-primary)', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '1rem', color: 'black', fontWeight: 'bold', fontSize: '2rem', boxShadow: 'inset 0 4px 10px rgba(255,255,255,0.5)' }}>
                       1º
                     </div>
                     <div style={{ marginTop: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '1.2rem' }}>{sortedPlayers[0].score} pts</div>
                   </div>
                 )}
                 {/* 3rd Place */}
                 {sortedPlayers[2] && (
                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                     <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{sortedPlayers[2].name}</div>
                     <div style={{ width: '120px', height: '100px', background: '#cd7f32', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '1rem', color: 'black', fontWeight: 'bold', fontSize: '1.5rem', boxShadow: 'inset 0 4px 10px rgba(255,255,255,0.5)' }}>
                       3º
                     </div>
                     <div style={{ marginTop: '0.5rem', color: '#cd7f32', fontWeight: 'bold' }}>{sortedPlayers[2].score} pts</div>
                   </div>
                 )}
               </div>
               
               <button onClick={handleEndSession} className="login-btn" style={{ padding: '1rem 3rem', fontSize: '1.2rem', background: 'var(--gold-primary)', color: 'black' }}>
                 Finalizar Missão
               </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
