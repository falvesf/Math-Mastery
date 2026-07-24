import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, onSnapshot, updateDoc, deleteField, collection, query, where, getDocs, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Loader2, ArrowLeft, Pen, Heart, Skull } from 'lucide-react';
import type { QuestDef } from './AdminDashboard';
import type { LiveSession, LivePlayer } from './LiveQuestAdmin';
import AvatarPrint from '../components/AvatarPrint';
import AvatarCustomizationModal from '../components/AvatarCustomizationModal';
import AvatarCharacter from '../components/AvatarCharacter';
import CustomModelViewer from '../components/CustomModelViewer';
import ChestReveal from '../components/ChestReveal';
import { Package, Coins } from 'lucide-react';
import { RANKS } from '../lib/ranks';

export default function LiveQuestStudent() {
  const { sessionId } = useParams();
  const { userData } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [quest, setQuest] = useState<QuestDef | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState('');
  const [chestOpened, setChestOpened] = useState(false);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [studentAnim, setStudentAnim] = useState<string>('idle');
  const [monsterAnim, setMonsterAnim] = useState<string>('idle');
  
  const arenaRef = useRef<HTMLDivElement>(null);
  const [arenaWidth, setArenaWidth] = useState(0);

  useEffect(() => {
    if (arenaRef.current) setArenaWidth(arenaRef.current.offsetWidth);
    const handleResize = () => {
      if (arenaRef.current) setArenaWidth(arenaRef.current.offsetWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!sessionId || !userData) return;

    let unsub: any = null;

    const joinSession = async () => {
      try {
        // Load Quest
        const qDoc = await getDoc(doc(db, 'quests', sessionId));
        if (!qDoc.exists()) {
          setError('Missão não encontrada.');
          setLoading(false);
          return;
        }
        setQuest(qDoc.data() as QuestDef);

        // Check Session
        const sessionRef = doc(db, 'live_quests', sessionId);
        const sDoc = await getDoc(sessionRef);
        if (!sDoc.exists()) {
          setError('O professor ainda não abriu a sala para esta missão.');
          setLoading(false);
          return;
        }

        const currentSession = sDoc.data() as LiveSession;
        if (!currentSession.players) {
          currentSession.players = {};
        }

        if (currentSession.status !== 'lobby' && !currentSession.players[userData.uid]) {
          setError('A missão já começou. Você não pode mais entrar.');
          setLoading(false);
          return;
        }

        // Add player to session if not already there
        if (!currentSession.players[userData.uid]) {
          // Fetch equipped items
          let equippedItems: any[] = [];
          try {
            const invRef = collection(db, 'user_items');
            const q = query(invRef, where('studentId', '==', userData.uid), where('equipped', '==', true));
            const invSnap = await getDocs(q);
            equippedItems = invSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
          } catch (e) {
            console.error("Erro ao carregar itens equipados", e);
          }

          let totalPower = userData.xp || 0;
          equippedItems.forEach(item => {
            if (item.baseAttributeValue) {
              totalPower += item.baseAttributeValue;
            }
          });

          const newPlayer: LivePlayer = {
            uid: userData.uid,
            name: userData.name || 'Jogador',
            hp: userData.hearts || 5,
            maxHp: userData.hearts || 5,
            attack: (userData as any).attack || 1,
            avatarConfig: userData.avatarConfig || null,
            equippedItems: equippedItems,
            score: 0,
            isDead: false,
            currentAnswer: null,
            xp: userData.xp || 0,
            sessionEarnedXp: 0,
            power: totalPower
          };

          const sanitizedPlayer = JSON.parse(JSON.stringify(newPlayer));

          await updateDoc(sessionRef, {
            [`players.${userData.uid}`]: sanitizedPlayer
          });
        }

        // Listen to Session
        unsub = onSnapshot(sessionRef, (snap) => {
          if (!snap.exists()) {
            setError('A sessão foi encerrada pelo professor.');
            setSession(null);
          } else {
            setSession(snap.data() as LiveSession);
          }
          setLoading(false);
        });
      } catch (err: any) {
        console.error(err);
        setError(`Erro ao conectar na sala: ${err.message || String(err)}`);
        setLoading(false);
      }
    };

    joinSession();

    return () => {
      if (unsub) unsub();
    };
  }, [sessionId, userData]);

  const handleLeave = async () => {
    if (session && session.status === 'lobby' && userData && sessionId) {
      const sessionRef = doc(db, 'live_quests', sessionId);
      await updateDoc(sessionRef, {
        [`players.${userData.uid}`]: deleteField()
      });
    }
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 className="animate-spin" size={48} color="var(--gold-primary)" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '500px' }}>
          <h2 style={{ color: 'var(--accent-red)', marginBottom: '1rem' }}>Ops!</h2>
          <p style={{ marginBottom: '2rem', fontSize: '1.2rem' }}>{error}</p>
          <button onClick={() => navigate('/dashboard')} className="login-btn">
            <ArrowLeft size={18} style={{ marginRight: '0.5rem', display: 'inline' }} />
            Voltar ao Início
          </button>
        </div>
      </div>
    );
  }

  if (!session || !quest || !userData) return null;

  const me = session.players[userData.uid];

  if (session.status === 'lobby') {
    return (
      <>
        <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '600px', width: '100%' }}>
            <h1 style={{ color: 'var(--gold-primary)', marginBottom: '0.5rem' }}>{quest.title}</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Aguardando o professor iniciar a missão...</p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '3rem' }}>
              <div style={{ position: 'relative', width: '150px', height: '180px', marginBottom: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '1rem', border: '2px solid var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button
                  onClick={() => setIsEditingAvatar(true)}
                  style={{ position: 'absolute', top: '8px', right: '8px', background: 'var(--accent-blue)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', zIndex: 10 }}
                  title="Editar Avatar"
                >
                  <Pen size={14} />
                </button>
                {me?.avatarConfig ? (
                  <AvatarPrint config={me.avatarConfig} equippedItems={me.equippedItems || []} size={150} />
                ) : (
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--accent-blue)' }}></div>
                )}
              </div>
              <h2 style={{ margin: 0 }}>Você está conectado!</h2>
              <p style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>Prepare-se para a batalha.</p>
            </div>

            <button onClick={handleLeave} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--text-secondary)', padding: '0.75rem 2rem', borderRadius: '8px', cursor: 'pointer' }}>
              Sair da Sala
            </button>
          </div>
        </div>

        {isEditingAvatar && (
          <AvatarCustomizationModal
            isOpen={isEditingAvatar}
            onClose={() => setIsEditingAvatar(false)}
            userData={userData}
            initialConfig={me?.avatarConfig}
            equippedItems={me?.equippedItems || []}
            onSave={async (config) => {
              try {
                if (sessionId && userData) {
                  await updateDoc(doc(db, 'live_quests', sessionId), {
                    [`players.${userData.uid}.avatarConfig`]: config
                  });
                  await updateDoc(doc(db, 'users', userData.uid), {
                    avatarConfig: config
                  });
                }
              } catch (e) {
                console.error(e);
              }
              setIsEditingAvatar(false);
            }}
          />
        )}
      </>
    );
  }

  const handleAnswerSubmit = async (answerIndex: number) => {
    if (!sessionId || !userData || !session || !quest) return;
    if (me?.currentAnswer !== null && me?.currentAnswer !== undefined) return;

    const currentQOriginalIndex = session.activeQuestions[session.currentQuestionIndex];
    const question = quest.questions[currentQOriginalIndex];
    const isCorrect = answerIndex === question.correctIndex;
    const answerTime = Date.now();

    // Calculate score
    const timeLimitMs = (question.timeLimit || 30) * 1000;
    const timeTaken = answerTime - (session.questionStartTime || (answerTime - timeLimitMs));
    const timeLeft = Math.max(0, timeLimitMs - timeTaken);

    let earnedScore = 0;
    let earnedXp = 0;

    if (isCorrect) {
      earnedScore = Math.floor((timeLeft / timeLimitMs) * 100);

      const baseQuestXp = quest.baseXp || 0;
      const xpPerQuestion = Math.floor(baseQuestXp / quest.questions.length);

      let totalAddXP = 0;
      me.equippedItems?.forEach((item: any) => {
        item.adds?.forEach((add: any) => {
          if (add.attributeType === 'xp_boost') {
            totalAddXP += add.value;
          }
        });
      });
      earnedXp = xpPerQuestion + totalAddXP;
    }

    const newScore = (me.score || 0) + earnedScore;
    const newXp = (me.xp || 0) + earnedXp;
    const newSessionEarnedXp = (me.sessionEarnedXp || 0) + earnedXp;

    const updates: any = {
      [`players.${userData.uid}.currentAnswer`]: answerIndex,
      [`players.${userData.uid}.isCorrect`]: isCorrect,
      [`players.${userData.uid}.answerTime`]: answerTime,
      [`players.${userData.uid}.score`]: newScore,
      [`players.${userData.uid}.xp`]: newXp,
      [`players.${userData.uid}.sessionEarnedXp`]: newSessionEarnedXp,
    };

    if (isCorrect) {
      // Dano fixo de 1 para simplificar o cálculo global na missão ao vivo (equipe)
      const power = 1;
      updates.monsterHp = increment(-power);

      try {
        await updateDoc(doc(db, 'users', userData.uid), {
          xp: increment(earnedXp)
        });
      } catch (err) {
        console.error("Erro ao adicionar XP ao usuário", err);
      }
    } else {
      let hasShield = false;
      me.equippedItems?.forEach((item: any) => {
        if (item.gameEffect === 'extra_life') hasShield = true;
      });

      if (!hasShield) {
        const maxHearts = 3 + Math.floor((RANKS.findIndex(r => r.name === me.rank) || 0) / 2);
        const currentHp = me.hp !== undefined ? me.hp : (userData?.hearts || maxHearts);
        const newHp = Math.max(0, currentHp - 1);
        updates[`players.${userData.uid}.hp`] = newHp;

        // Atualizar perfil principal
        try {
          const userUpdate: any = { hearts: newHp };
          // Iniciar cooldown de recovery se estava com vida máxima
          if (currentHp >= maxHearts && newHp < maxHearts) {
            userUpdate.hpRecoveryStartTimestamp = Date.now();
          }
          await updateDoc(doc(db, 'users', userData.uid), userUpdate);
        } catch(e) { console.error(e); }
      } else {
        // Has shield, just remove shield visual if you want, but for now just no HP loss
        updates[`players.${userData.uid}.isProtected`] = true; // Optional tracking
      }
    }

    await updateDoc(doc(db, 'live_quests', sessionId), updates);

    if (isCorrect) {
      setStudentAnim('attack');
      setMonsterAnim('hurt');
      setTimeout(() => {
        setStudentAnim('idle');
        setMonsterAnim('idle');
      }, 1500);
    } else {
      setStudentAnim('hurt');
      setMonsterAnim('attack');
      setTimeout(() => {
        setStudentAnim('idle');
        setMonsterAnim('idle');
      }, 1500);
    }
  };

  const OPTION_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c']; // Red, Blue, Yellow, Green

  if (session.status === 'question' || session.status === 'reveal') {
    const hasAnswered = me.currentAnswer !== null && me.currentAnswer !== undefined;

    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* BATTLE SCENE 3D */}
        <div style={{ flex: '1 1 50%', position: 'relative', background: 'var(--bg-primary)', overflow: 'hidden', borderBottom: '2px solid var(--border-glass)' } as any}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 0 }}>
            <div className="battle-arena-bg-image" style={{ opacity: 0.7 }} />
          </div>
          {/* Ambient elements */}
          <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', opacity: 0.2, zIndex: 1 }}>
            <h2 style={{ fontSize: '3rem', margin: 0, textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>VS</h2>
          </div>

          <div ref={arenaRef} style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'space-between', padding: '0 10%', zIndex: 2, '--attack-dist': arenaWidth ? `${Math.max(50, arenaWidth - 200)}px` : '150px' } as any}>
            {/* Player (Left) */}
            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '1rem' }}>
              <div
                className={studentAnim === 'attack' ? 'teleport-player' : ''}
                style={{
                  transform: studentAnim === 'hurt' ? 'translateX(-20px) rotate(-10deg)' : 'none',
                  transition: studentAnim === 'attack' ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  height: '250px'
                }}
              >
                {me.avatarConfig && (
                  <>
                    <AvatarCharacter
                      config={me.avatarConfig}
                      equippedItems={me.equippedItems || []}
                      size={200}
                      interactive={false}
                      animation={studentAnim === 'attack' ? 'attack' : (studentAnim === 'hurt' ? 'hurt' : 'idle')}
                      role="player"
                    />
                    {studentAnim === 'hurt' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(239, 68, 68, 0.5)', mixBlendMode: 'overlay', animation: 'pulse 0.5s infinite', borderRadius: '8px' }} />}
                  </>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '1rem', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px' }}>
                <span style={{ color: 'white', fontWeight: 'bold', marginRight: '0.5rem', fontSize: '0.9rem' }}>VOCÊ</span>
                {Array.from({ length: me.maxHp || userData?.hearts || 5 }).map((_, i) => (
                  <Heart key={i} size={20} fill={i < (me.hp !== undefined ? me.hp : (userData?.hearts || 5)) ? "#ef4444" : "transparent"} color="#ef4444" />
                ))}
              </div>
            </div>

            {/* Monster (Right) */}
            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '1rem' }}>
              <div
                className={monsterAnim === 'attack' ? 'teleport-monster' : ''}
                style={{
                  transform: monsterAnim === 'hurt' ? 'translateX(20px) rotate(10deg)' : 'none',
                  transition: monsterAnim === 'attack' ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  height: '250px'
                }}
              >
                <div style={{ transform: 'scaleX(-1)', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  {quest?.monsterAvatarConfig ? (
                    <AvatarCharacter config={quest.monsterAvatarConfig} size={250} animation={monsterAnim === 'attack' ? 'attack' : (monsterAnim === 'hurt' ? 'hurt' : 'idle')} interactive={false} />
                  ) : (
                    <CustomModelViewer modelUrl={quest?.monsterModelUrl || 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb'} role="monster" animation={monsterAnim} />
                  )}
                </div>
                {monsterAnim === 'hurt' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(239, 68, 68, 0.5)', mixBlendMode: 'overlay', animation: 'pulse 0.5s infinite', borderRadius: '8px' }} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '1rem', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px' }}>
                <span style={{ color: 'var(--accent-red)', fontWeight: 'bold', marginRight: '0.5rem', fontSize: '0.9rem' }}>{quest?.monsterName?.toUpperCase() || 'MONSTRO'}</span>
                {Array.from({ length: quest?.questions?.length || 5 }).map((_, i) => {
                  const monsterHpRatio = session.monsterHp / (session.maxMonsterHp || 1);
                  const heartsToShow = Math.ceil(monsterHpRatio * (quest?.questions?.length || 5));
                  return (
                    <Heart key={i} size={20} fill={i < heartsToShow ? "#ef4444" : "transparent"} color="#ef4444" />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ANSWER BUTTONS */}
        <div style={{ flex: '0 0 50%', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--bg-secondary)', position: 'relative' }}>
          {(me.hp !== undefined && me.hp <= 0) ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', zIndex: 10 }}>
                <Skull size={64} color="var(--accent-red)" style={{ marginBottom: '1rem' }} />
                <h2 style={{ color: 'var(--accent-red)', fontSize: '2.5rem', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>ELIMINADO</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginTop: '1rem' }}>Você não pode mais batalhar nesta missão.</p>
              </div>
            ) : null}

            {hasAnswered ? (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: me.isCorrect ? 'var(--accent-green)' : 'var(--accent-red)', marginBottom: '1rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                  {me.isCorrect ? 'RESPOSTA ENVIADA!' : 'RESPOSTA ENVIADA!'}
                </div>
                <Loader2 className="animate-spin" size={48} color="var(--gold-primary)" style={{ margin: '0 auto 1rem' }} />
                <h2 style={{ color: 'var(--text-secondary)' }}>Aguardando o tempo da rodada acabar...</h2>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1rem', height: '100%', padding: '1rem' }}>
                {[0, 1, 2, 3].map((idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswerSubmit(idx)}
                    disabled={(me.hp !== undefined && me.hp <= 0)}
                    style={{
                      background: OPTION_COLORS[idx],
                      border: 'none',
                      borderRadius: '16px',
                      color: 'white',
                      fontSize: '4rem',
                      fontWeight: 'bold',
                      cursor: (me.hp !== undefined && me.hp <= 0) ? 'not-allowed' : 'pointer',
                      boxShadow: '0 8px 0 rgba(0,0,0,0.3)',
                      transition: 'transform 0.1s',
                    }}
                    onMouseDown={(e) => { if (me.hp === undefined || me.hp > 0) e.currentTarget.style.transform = 'translateY(4px)'; }}
                    onMouseUp={(e) => { if (me.hp === undefined || me.hp > 0) e.currentTarget.style.transform = 'none'; }}
                  >
                    {['A', 'B', 'C', 'D'][idx]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        );
  }

        if (session.status === 'ranking') {
    const isCorrect = me.isCorrect;
        return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
          <h1 style={{ color: isCorrect ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: '4rem', textShadow: '0 4px 8px rgba(0,0,0,0.5)', textAlign: 'center' }}>
            {isCorrect ? 'Você Acertou!' : 'Você Errou!'}
          </h1>
          <p style={{ fontSize: '1.5rem', color: 'var(--text-secondary)', marginTop: '1rem', textAlign: 'center' }}>Olhe para o telão para ver o ranking provisório.</p>
        </div>
        );
  }

        if (session.status === 'finished') {
    if (me.wonChest) {
      return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
          {!chestOpened ? (
            <ChestReveal onOpen={() => setChestOpened(true)} title={`Parabéns pelo ${me.wonChest.place}º Lugar!`} />
          ) : (
            <div style={{ textAlign: 'center', animation: 'epicZoom 0.5s ease-out' }}>
              <h2 style={{ fontSize: '3rem', color: 'var(--gold-primary)', marginBottom: '3rem', textShadow: '0 0 20px var(--gold-primary)' }}>Recompensas Adquiridas!</h2>
              
              {me.wonChest.coins > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid var(--gold-primary)', padding: '1rem 2rem', borderRadius: '12px', marginBottom: '2rem' }}>
                  <Coins size={40} color="var(--gold-primary)" />
                  <span style={{ fontSize: '2rem', color: 'white', fontWeight: 'bold' }}>+{me.wonChest.coins} Moedas</span>
                </div>
              )}

              {me.wonChest.items && me.wonChest.items.length > 0 && (
                <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3rem' }}>
                  {me.wonChest.items.map((item, i) => (
                    <div key={i} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '180px' }}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: '8px', marginBottom: '1rem' }} />
                      ) : (
                        <Package size={80} color="var(--gold-primary)" style={{ marginBottom: '1rem' }} />
                      )}
                      <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.5rem' }}>{item.title}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>Quantidade: {item.quantity || 1}</span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>Acompanhe o pódio na tela do professor!</p>
              <button onClick={() => navigate('/dashboard')} style={{ marginTop: '2rem', padding: '1rem 3rem', background: 'var(--gold-primary)', color: 'var(--bg-primary)', fontSize: '1.5rem', borderRadius: '12px', fontWeight: 'bold' }}>
                Voltar ao Início
              </button>
            </div>
          )}
        </div>
      );
    }
    
    return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
          <h1 style={{ color: 'var(--gold-primary)', fontSize: '4rem', textShadow: '0 4px 8px rgba(0,0,0,0.5)' }}>Missão Concluída!</h1>
          <p style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>Olhe para o telão para ver o pódio final.</p>
          <button onClick={() => navigate('/dashboard')} style={{ marginTop: '3rem', padding: '1rem 3rem', background: 'var(--gold-primary)', color: 'var(--bg-primary)', fontSize: '1.5rem', borderRadius: '12px', fontWeight: 'bold' }}>
            Voltar ao Início
          </button>
        </div>
        );
  }

        return null;
}
