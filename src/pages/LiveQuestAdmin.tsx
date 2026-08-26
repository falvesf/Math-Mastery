import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';

import { Loader2, Play, CheckCircle, ChevronRight, Swords, Crown, Skull, Package, Trophy, Medal, SkipForward } from 'lucide-react';
import type { QuestDef } from './AdminDashboard';
import AvatarPrint from '../components/AvatarPrint';
import CustomModelViewer from '../components/CustomModelViewer';
import AvatarCharacter from '../components/AvatarCharacter';
import { useDialog } from '../contexts/DialogContext';
import { rollItemAdds, fetchGlobalGachaConfig } from '../lib/gacha';

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
  hasSurrendered?: boolean;
  currentAnswer?: number | null;
  isCorrect?: boolean | null;
  answerTime?: number | null;
  sessionEarnedXp?: number;
  xp?: number;
  power?: number;
  wonChest?: { place: number; coins: number; items: any[] };
  rank?: string;
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
  const { tenantId, isSuperAdmin } = useTenant();
  const { showConfirm } = useDialog();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [loading, setLoading] = useState(true);
  const [quest, setQuest] = useState<QuestDef | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const processedAnswers = useRef<Set<string>>(new Set());
  const resetApplied = useRef(false); // Garante que o reset só é aplicado uma vez
  const [playerAnims, setPlayerAnims] = useState<Record<string, any>>({});
  const [playerErrou, setPlayerErrou] = useState<Record<string, boolean>>({});
  const [activeAvatars, setActiveAvatars] = useState<Record<string, { active: boolean, direction: 'left' | 'right' }>>({});
  const [monsterAnim, setMonsterAnim] = useState<string>('idle');
  const [monsterDirection, setMonsterDirection] = useState<'left' | 'right'>('left');

  const [podiumStep, setPodiumStep] = useState<number>(0);
  const [teacherCutsceneStage, setTeacherCutsceneStage] = useState<'none' | 'enter' | 'approach' | 'hit' | 'victory'>('none');
  const fireworksCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Suspense reveal sequence when game finishes
  useEffect(() => {
    if (session?.status === 'finished') {
      setPodiumStep(0);
      const t1 = setTimeout(() => setPodiumStep(1), 2000);  // 3º Lugar sobe após 2s
      const t2 = setTimeout(() => setPodiumStep(2), 6500);  // 2º Lugar sobe após mais 4.5s
      const t3 = setTimeout(() => setPodiumStep(3), 11000); // 1º Lugar sobe com fogos após mais 4.5s
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [session?.status]);

  // Particle fireworks canvas loop when 1st place is revealed
  useEffect(() => {
    if (session?.status !== 'finished' || podiumStep < 3) return;
    const canvas = fireworksCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (canvas) {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    interface Particle {
      x: number; y: number; vx: number; vy: number; color: string; size: number; alpha: number; decay: number;
    }
    const particles: Particle[] = [];
    const colors = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ffffff', '#ffd700'];

    const createFirework = (targetX: number, targetY: number) => {
      const count = 45;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = Math.random() * 7 + 2;
        particles.push({
          x: targetX,
          y: targetY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: Math.random() * 4 + 2,
          alpha: 1,
          decay: Math.random() * 0.015 + 0.008
        });
      }
    };

    let lastFirework = 0;
    const loop = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      if (time - lastFirework > 600) {
        lastFirework = time;
        createFirework(
          Math.random() * (width * 0.8) + width * 0.1,
          Math.random() * (height * 0.4) + height * 0.1
        );
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.07;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
        } else {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [session?.status, podiumStep]);

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
    const qStartTime = session?.questionStartTime || (session as any)?.questionstarttime || (session as any)?.question_start_time;
    if (session?.status !== 'question' || !qStartTime || !quest) return;
    
    const currentQOriginalIndex = session.activeQuestions[session.currentQuestionIndex];
    const question = quest.questions[currentQOriginalIndex];
    const limit = question?.timeLimit || 30;

    const interval = setInterval(() => {
       const elapsed = Math.floor((Date.now() - qStartTime) / 1000);
       const remaining = Math.max(0, limit - elapsed);
       setTimeLeft(remaining);

       const allPlayersList = Object.values(session.players || {});
       const activePlayers = allPlayersList.filter(p => p.hp === undefined || p.hp > 0);
       const activePlayersCount = activePlayers.length;
       const ansCount = activePlayers.filter(p => p.currentAnswer !== null && p.currentAnswer !== undefined).length;

       if (remaining === 0 || (activePlayersCount > 0 && ansCount >= activePlayersCount) || (activePlayersCount === 0 && allPlayersList.length > 0)) {
          clearInterval(interval);
          const correctCount = activePlayers.filter(p => p.currentAnswer === question?.correctIndex).length;
          // Só considera "ninguém acertou" se PELO MENOS UM jogador tiver tentado responder e ainda houver jogadores vivos.
          // Se ansCount === 0, significa que estão todos AFK/desconectados. Não repete a pergunta para evitar loop infinito.
          const nobodyCorrect = activePlayersCount > 0 && correctCount === 0 && ansCount > 0;
          
          const updates: any = { status: 'reveal', nobodyCorrect };
          if (nobodyCorrect) {
             updates.activeQuestions = [...session.activeQuestions, session.activeQuestions[session.currentQuestionIndex]];
          }
          supabase.from('live_quests').update(updates).eq('id', sessionId!);
          // Atualiza estado local imediatamente (sem depender de realtime)
          setSession(prev => prev ? { ...prev, ...updates } : prev);
       }
    }, 500);

    return () => clearInterval(interval);
  }, [session, quest, sessionId]);

  const activePlayers = session ? Object.values(session.players || {}).filter(p => p.hp === undefined || p.hp > 0) : [];

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
       const t = setTimeout(async () => {
          // Busca o estado mais recente dos jogadores para garantir que o ranking mostre todos os pontos
          const { data: latest } = await supabase.from('live_quests').select('*').eq('id', sessionId).single();
          const latestPlayers = latest?.players || session.players;
          await supabase.from('live_quests').update({ status: 'ranking' }).eq('id', sessionId);
          // Atualiza estado local imediatamente
          setSession(prev => prev ? { ...prev, ...latest, players: latestPlayers, status: 'ranking' } : prev);
       }, 5000);
       return () => clearTimeout(t);
    }
  }, [session?.status, sessionId]);

  // Load Quest and Session
  useEffect(() => {
    if (!sessionId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadData = async () => {
      // Load Quest Def
      const { data: qDocData } = await supabase.from('quests').select('*').eq('id', sessionId).single();
      if (!qDocData) {
        navigate('/admin');
        return;
      }
      const qData = { id: qDocData.id, ...qDocData } as QuestDef;
      // Isolamento por escola (Superadmin pode acessar qualquer missão)
      if (tenantId && !isSuperAdmin) {
        const questTenant = (qDocData as any).tenant_id;
        if (questTenant && questTenant !== tenantId) {
          navigate('/admin');
          return;
        }
      }
      setQuest(qData);

      // Create or Load Session
      let currentSessionData: LiveSession | null = null;
      const { data: sDocData } = await supabase.from('live_quests').select('*').eq('id', sessionId).maybeSingle();
      
      if (!sDocData) {
        const newSession: LiveSession = {
          questId: sessionId,
          teacherId: (userData?.uid || ''),
          status: 'lobby',
          currentQuestionIndex: 0,
          activeQuestions: qData.questions.map((_, i) => i),
          monsterHp: 0,
          maxMonsterHp: 0,
          players: {}
        };
        await supabase.from('live_quests').insert({ id: sessionId, ...newSession, tenant_id: (qData as any).tenant_id || null });
        currentSessionData = newSession;
      } else {
        const data = sDocData as LiveSession;
        const playersCount = Object.keys(data.players || {}).length;
        // Aplica reset apenas na primeira carga (forceReset via location.state)
        const forceReset = location.state?.reset === true && !resetApplied.current;
        if (forceReset) resetApplied.current = true;
        
        if (forceReset || (data.status as string) === 'lobby' || ((data.status as string) !== 'lobby' && playersCount === 0)) {
          const updates: any = {
            status: 'lobby',
            currentQuestionIndex: 0,
            activeQuestions: qData.questions.map((_, i) => i),
            monsterHp: 0,
            maxMonsterHp: 0,
            players: {}, // Limpa jogadores — cada sessão começa do zero
          };
          await supabase.from('live_quests').update(updates).eq('id', sessionId);
          currentSessionData = { ...data, ...updates } as LiveSession;
        } else {
          currentSessionData = data;
        }
      }

      setSession(currentSessionData);
      setLoading(false);

      // Listen to Session — canal com nome fixo para evitar duplicatas
      channel = supabase.channel(`live_quest_admin_${sessionId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_quests', filter: `id=eq.${sessionId}` }, (payload) => {
          if (payload.eventType !== 'DELETE') {
            setSession(payload.new as LiveSession);
          } else {
            setSession(null);
          }
        })
        .subscribe();
    };

    loadData();

    // Cleanup corretamente fora da função async — React registra este retorno
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId, navigate]); // NÃO depende de userData para evitar resets acidentais durante o jogo

  // Polling de fallback no lobby: atualiza lista de jogadores a cada 2s
  // Necessário pois o realtime do admin pode não receber updates de outros clientes
  useEffect(() => {
    if (!sessionId || session?.status !== 'lobby') return;

    const interval = setInterval(async () => {
      const { data } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
      if (data?.players) {
        setSession(prev => prev ? { ...prev, players: data.players } : prev);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId, session?.status]);

  // Polling durante a fase de pergunta: atualiza sessão completa a cada 500ms
  // Garante que o timer veja as respostas dos alunos mesmo sem realtime
  useEffect(() => {
    if (!sessionId || session?.status !== 'question') return;

    const interval = setInterval(async () => {
      const { data } = await supabase.from('live_quests').select('*').eq('id', sessionId).single();
      if (data) {
        setSession(prev => {
          // Só atualiza players durante 'question' para não sobrescrever transições de status
          if (prev?.status === 'question') {
            return {
              ...prev,
              players: data.players || {},
              monsterHp: data.monsterHp ?? data.monster_hp ?? prev.monsterHp
            };
          }
          return prev;
        });
      }
    }, 500);

    return () => clearInterval(interval);
  }, [sessionId, session?.status]);


  const handleStartGame = async () => {
    console.log('[handleStartGame] Iniciando...', { session: !!session, sessionId, quest: !!quest });
    if (!session || !sessionId || !quest) {
      console.warn('[handleStartGame] Guard falhou:', { session, sessionId, quest });
      return;
    }
    const playerIds = Object.keys(session.players || {});
    console.log('[handleStartGame] playerIds:', playerIds);
    if (playerIds.length === 0) {
      alert("Aguarde pelo menos 1 aluno entrar na sala!");
      return;
    }

    const players = Object.values(session.players);
    const questionsLen = quest.questions?.length || 0;
    console.log('[handleStartGame] players:', players.length, 'questions:', questionsLen);

    if (questionsLen === 0) {
      alert("Esta missão não tem perguntas configuradas!");
      return;
    }

    const maxHp = Math.max(1, Math.ceil(players.length * questionsLen * 0.8));
    console.log('[handleStartGame] maxHp calculado:', maxHp, '→ atualizando live_quests:', sessionId);

    const { error } = await supabase.from('live_quests').update({
      status: 'question',
      monsterHp: maxHp,
      maxMonsterHp: maxHp,
      questionStartTime: Date.now()
    }).eq('id', sessionId);

    if (error) {
      console.error('[handleStartGame] Erro ao atualizar live_quests:', error);
      alert(`Erro ao iniciar batalha: ${error.message}`);
    } else {
      console.log('[handleStartGame] Atualização bem-sucedida! Atualizando estado local...');
      // Atualiza o estado local imediatamente, sem esperar pelo realtime
      setSession(prev => prev ? {
        ...prev,
        status: 'question',
        monsterHp: maxHp,
        maxMonsterHp: maxHp,
        questionStartTime: Date.now()
      } : prev);
    }
  };

  const handleEndSession = async () => {
    if (!sessionId) return;
    const confirmed = await showConfirm("Tem certeza que deseja encerrar esta sessão ao vivo? Todos os alunos serão desconectados.");
    if (confirmed) {
      await supabase.from('live_quests').update({ status: 'finished' }).eq('id', sessionId);
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
              style={{ padding: '1rem 3rem', fontSize: '1.2rem', background: playersList.length > 0 ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', color: playersList.length > 0 ? 'var(--text-on-gold, #000000)' : 'var(--text-secondary)' }}
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

  const executeEndGame = async () => {
    if (!sessionId || !session) return;
    try {
      const allPlayers = Object.values(session.players || {});
      const alivePlayers = allPlayers.filter(p => (p.hp === undefined || p.hp > 0) && !p.hasSurrendered).sort((a, b) => (b.score || 0) - (a.score || 0));
      const promises: any[] = [];
      const updatedPlayers = { ...(session.players || {}) };

      const processReward = async (playerUid: string, chestConfig: any, place: number) => {
        if (!chestConfig) return;
        const userUpdates: any = {};
        let itemsWon: any[] = [];

        if (chestConfig.maxCoins && chestConfig.maxCoins > 0) {
           const { data: uData } = await supabase.from('users').select('coins').eq('id', playerUid).single();
           userUpdates.coins = (uData?.coins || 0) + chestConfig.maxCoins;
        }

        if (chestConfig.itemIds && chestConfig.itemIds.length > 0) {
           const validIds = chestConfig.itemIds.filter((id: string) => id.trim() !== '');
           if (validIds.length > 0) {
             const { data: snap } = await supabase.from('store_items').select('*').in('id', validIds);
             const storeItemsMap = new Map();
             if (snap) snap.forEach(d => storeItemsMap.set(d.id, { id: d.id, ...d.data }));

             for (let i = 0; i < chestConfig.itemIds.length; i++) {
               const itemId = chestConfig.itemIds[i];
               const qty = chestConfig.itemQuantities ? chestConfig.itemQuantities[i] || 1 : 1;
               const item = storeItemsMap.get(itemId);
               if (item) {
                 itemsWon.push({ ...item, quantity: qty });
                 const itemData = {
                    studentId: playerUid,
                    itemId: item.id,
                    itemTitle: item.title,
                    itemType: item.type,
                    itemImageUrl: item.imageUrl || '',
                    gameEffect: item.gameEffect || 'none',
                    usableInQuest: item.usableInQuest || false,
                    battleSoundUrl: (item as any).battleSoundUrl || '',
                    gameModelUrl: item.gameModelUrl || '',
                    modelTextureUrl: item.modelTextureUrl || '',
                    minecraftHeadValue: item.minecraftHeadValue || '',
                    quantity: qty,
                    equipped: false,
                    purchasedAt: new Date().toISOString(),
                    giftedBy: `Recompensa ${place}º Lugar`,
                    avatarPart: item.avatarPart || null,
                    itemCategory: item.itemCategory || 'none',
                    baseAttributeType: item.baseAttributeType || 'none',
                    baseAttributeValue: item.baseAttributeValue || 0,
                    modelTransforms: item.modelTransforms || null,
                    adds: item.type === 'equippable' ? rollItemAdds(item.gachaConfig, item.fixedAttributes, (item.useGlobalGacha ?? true) ? globalGachaConfig : undefined) : []
                 };
                 promises.push(supabase.from('user_items').insert({ student_id: playerUid, item_id: item.id, equipped: false, data: itemData }));
               }
             }
           }
        }
        
        if (Object.keys(userUpdates).length > 0) {
           promises.push(supabase.from('users').update(userUpdates).eq('id', playerUid));
        }

        if (itemsWon.length > 0 || (chestConfig.maxCoins && chestConfig.maxCoins > 0)) {
           if (updatedPlayers[playerUid]) {
             updatedPlayers[playerUid] = {
               ...updatedPlayers[playerUid],
               wonChest: { place, coins: chestConfig.maxCoins || 0, items: itemsWon }
             };
           }
        }
      };

      const globalGachaConfig = await fetchGlobalGachaConfig();

      if (alivePlayers.length > 0) await processReward(alivePlayers[0].uid, quest?.liveChest1stPlace, 1);
      if (alivePlayers.length > 1) await processReward(alivePlayers[1].uid, quest?.liveChest2ndPlace, 2);
      if (alivePlayers.length > 2) await processReward(alivePlayers[2].uid, quest?.liveChest3rdPlace, 3);

      const playerUpdatePromises = Object.keys(session.players || {}).map(async uid => {
        const player = session.players[uid];
        const earnedXp = player.sessionEarnedXp || 0;
        const survived = player.hp === undefined || player.hp > 0;

        // Somente jogadores que sobreviveram ganham o XP acumulado e o status 'completed'
        if (survived && quest) {
          promises.push(
            supabase.from('quest_attempts').insert({
              quest_id: quest.id,
              student_id: uid,
              status: 'completed',
              tenant_id: quest.tenant_id || tenantId,
              data: { answers: [], earned_xp: earnedXp, isStudyMode: false, isLiveQuest: true },
              created_at: new Date().toISOString()
            })
          );

          if (earnedXp > 0) {
            // Agora sim creditamos o XP oficialmente
            const { data: u } = await supabase.from('users').select('xp').eq('id', uid).single();
            if (u) {
              promises.push(
                supabase.from('users').update({ xp: (u.xp || 0) + earnedXp }).eq('id', uid)
              );
            }
          }
        }
      });

      await Promise.all(playerUpdatePromises);

      const finishUpdates = { status: 'finished' as const, players: updatedPlayers };
      promises.push(supabase.from('live_quests').update(finishUpdates).eq('id', sessionId));
      
      await Promise.all(promises);
      setSession(prev => prev ? { ...prev, ...finishUpdates } : prev);
    } catch (err) {
      console.error("Erro ao registrar recompensas/historico da missão ao vivo:", err);
    }
  };

  const handleNextQuestion = async () => {
    if (!sessionId || !session) return;
    
    // Busca dados atualizados da sessão para verificar lista de perguntas (inclusive as repetidas) e HP do monstro
    const { data: freshSession } = await supabase.from('live_quests').select('activeQuestions, active_questions, monsterHp, monster_hp, maxMonsterHp, max_monster_hp, players').eq('id', sessionId).single();
    const activeQ = freshSession?.activeQuestions || freshSession?.active_questions || session.activeQuestions || [];
    const currentPlayers = freshSession?.players || session.players || {};
    const allPlayers = Object.values(currentPlayers);
    const activeAlivePlayers = allPlayers.filter((p: any) => p.hp === undefined || p.hp > 0);
    const hasPlayers = allPlayers.length > 0;
    const isAllDead = hasPlayers && activeAlivePlayers.length === 0;

    const currMonsterHp = freshSession?.monsterHp ?? freshSession?.monster_hp ?? session.monsterHp ?? (session as any).monster_hp;
    const currMaxMonsterHp = freshSession?.maxMonsterHp ?? freshSession?.max_monster_hp ?? session.maxMonsterHp ?? (session as any).max_monster_hp;
    const isMonsterDead = typeof currMonsterHp === 'number' && typeof currMaxMonsterHp === 'number' && currMaxMonsterHp > 0 && currMonsterHp <= 0;
    const isLastQuestion = session.currentQuestionIndex + 1 >= activeQ.length;

    const isGameOver = isLastQuestion || isMonsterDead || isAllDead;

    if (isGameOver) {
      // Se acabou as perguntas mas o monstro ainda está vivo e há sobreviventes, o professor executa a intervenção épica (Fatality)!
      if (isLastQuestion && !isMonsterDead && !isAllDead && teacherCutsceneStage === 'none') {
        setTeacherCutsceneStage('enter');
        setTimeout(() => setTeacherCutsceneStage('approach'), 2500);
        setTimeout(async () => {
          setTeacherCutsceneStage('hit');
          setMonsterAnim('hurt');
          await supabase.from('live_quests').update({ monsterHp: 0, monster_hp: 0 }).eq('id', sessionId);
          setSession(prev => prev ? { ...prev, monsterHp: 0 } : prev);
        }, 5000);
        setTimeout(() => setTeacherCutsceneStage('victory'), 7500);
        setTimeout(async () => {
          setTeacherCutsceneStage('none');
          await executeEndGame();
        }, 11000);
        return;
      }

      await executeEndGame();
    } else {
      // Próxima pergunta: busca o estado atual dos jogadores do banco e reseta as respostas
      const nextIndex = session.currentQuestionIndex + 1;
      const { data: curr } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
      const currentPlayers = curr?.players || session.players || {};
      
      // Reseta respostas dos jogadores corretamente
      const resetPlayers: Record<string, any> = {};
      Object.entries(currentPlayers).forEach(([uid, p]) => {
        resetPlayers[uid] = { ...(p as any), currentAnswer: null, isCorrect: null, answerTime: null };
      });
      
      const now = Date.now();
      const updates = {
        status: 'question' as const,
        currentQuestionIndex: nextIndex,
        questionStartTime: now,
        players: resetPlayers
      };
      await supabase.from('live_quests').update(updates).eq('id', sessionId);
      // Atualiza estado local imediatamente
      setSession(prev => prev ? { ...prev, ...updates } : prev);
    }
  };

  const currentQOriginalIndex = session.activeQuestions[session.currentQuestionIndex];
  const question = quest.questions[currentQOriginalIndex];
  const allPlayersList = Object.values(session.players || {});
  const alivePlayers = allPlayersList.filter(p => (p.hp === undefined || p.hp > 0) && !p.hasSurrendered).sort((a, b) => (b.score || 0) - (a.score || 0));
  const eliminatedPlayers = allPlayersList.filter(p => (p.hp !== undefined && p.hp <= 0) || p.hasSurrendered).sort((a, b) => (b.score || 0) - (a.score || 0));
  const sortedPlayers = alivePlayers; // Apenas sobreviventes sobem nos pilares do pódio

  const OPTION_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c']; // Red, Blue, Yellow, Green

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid var(--border-glass)', flexShrink: 0, zIndex: 30, position: 'relative' }}>
        <h1 style={{ margin: 0, color: 'var(--gold-primary)', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
          <Swords size={24} /> {quest.title}
          {session.status === 'finished' && (
            <span style={{ fontSize: '0.85rem', background: 'rgba(251, 191, 36, 0.2)', border: '1px solid var(--gold-primary)', color: 'var(--gold-primary)', padding: '0.2rem 0.8rem', borderRadius: '20px', marginLeft: '0.5rem' }}>
              🏆 Pódio Final
            </span>
          )}
        </h1>
        
        {/* CENTER QUESTION COUNTER (Apenas durante perguntas) */}
        {session.status !== 'finished' && (
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
            {(session.status === 'question' || session.status === 'reveal') && (
              <span style={{ color: 'var(--gold-primary)', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold' }}>
                Pergunta {session.currentQuestionIndex + 1} de {session.activeQuestions.length}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {session.status === 'question' && (
            <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1.5rem', borderRadius: '12px', border: `2px solid ${timeLeft <= 5 ? 'var(--accent-red)' : 'var(--gold-primary)'}` }}>
              <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tempo Restante</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: timeLeft <= 5  ? 'var(--accent-red)'  : 'var(--text-primary)' }}>{timeLeft}s</span>
            </div>
          )}
          {session.status === 'ranking' && (
            <button onClick={handleNextQuestion} className="login-btn" style={{ padding: '0.5rem 2rem', fontSize: '1rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)' }}>
              Próxima Etapa <ChevronRight style={{ display: 'inline', marginLeft: '0.5rem' }} />
            </button>
          )}

          {session.status !== 'finished' && (
            <>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Respostas</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{answersCount} / {activePlayersCount}</div>
              </div>
              <button onClick={handleEndSession} style={{ background: 'transparent', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer' }}>
                Abortar
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* MAIN CONTENT AREA */}
      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* BACKGROUND IMAGE */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 0 }}>
           <div 
             className="battle-arena-bg-image" 
             style={{ 
               opacity: 0.5,
               ...(quest?.battleBgUrl ? { 
                 background: `url(${quest.battleBgUrl}) ${quest.battleBgPosX ?? 50}% ${quest.battleBgPosY ?? 50}% / ${(quest.battleBgScale ?? 1.2) * 100}% no-repeat`,
                 ...(quest.battleBgMoveEnabled !== false
                   ? {
                       '--bg-move-x': `${quest.battleBgMoveDirection === 'horizontal' || quest.battleBgMoveDirection === 'diagonal' ? (quest.battleBgMoveSpeed ?? 10) : 0}%`,
                       '--bg-move-y': `${quest.battleBgMoveDirection === 'vertical' ? (quest.battleBgMoveSpeed ?? 10) : quest.battleBgMoveDirection === 'diagonal' ? -(quest.battleBgMoveSpeed ?? 10) / 2 : 0}%`,
                       '--bg-move-duration': `${quest.battleBgMoveDuration ?? 30}s`,
                     }
                   : { '--bg-move-play': 'paused' })
               } : {})
             }} 
           />
        </div>

        {/* MIDDLE AREA: 3D VIEWER & AVATARS - HIDE ON RANKING */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: (session.status === 'ranking' || session.status === 'finished') ? 0 : 1, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
          
          {/* TEACHER FATALITY CUTSCENE */}
          {teacherCutsceneStage !== 'none' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '2rem', background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.9) 100%)', pointerEvents: 'auto' }}>
              
              {/* Top Cutscene Banner */}
              <div style={{ background: 'rgba(0,0,0,0.85)', border: '2px solid var(--gold-primary)', borderRadius: '20px', padding: '0.8rem 2.5rem', textAlign: 'center', boxShadow: '0 0 30px rgba(245, 158, 11, 0.7)', animation: 'popIn 0.4s ease-out', zIndex: 70 }}>
                {teacherCutsceneStage === 'enter' && (
                  <div style={{ color: 'var(--gold-primary)', fontSize: '1.6rem', fontWeight: 'bold' }}>
                    ⚡ Uma presença misteriosa surge no campo de batalha...
                  </div>
                )}
                {teacherCutsceneStage === 'approach' && (
                  <div style={{ color: '#f59e0b', fontSize: '1.8rem', fontWeight: '900', textShadow: '0 0 15px #f59e0b' }}>
                    💥 "Deixem comigo, turma! GOLPE FINAL ÉPICO!"
                  </div>
                )}
                {teacherCutsceneStage === 'hit' && (
                  <div style={{ color: '#ef4444', fontSize: '2rem', fontWeight: '900', textShadow: '0 0 20px #ef4444' }}>
                    🔥 IMPACTO CRÍTICO! O MONSTRO FOI DERROTADO!
                  </div>
                )}
                {teacherCutsceneStage === 'victory' && (
                  <div style={{ color: '#ffd700', fontSize: '2rem', fontWeight: '900', textShadow: '0 0 25px #ffd700' }}>
                    ✨ VITÓRIA ÉPICA! O PROFESSOR SALVOU O DIA!
                  </div>
                )}
              </div>

              {/* Center Stage with Teacher Avatar */}
              <div style={{ position: 'relative', width: '100%', height: '320px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                
                {/* Teacher Avatar */}
                <div style={{
                  position: 'absolute',
                  left: teacherCutsceneStage === 'enter' ? '25%' : (teacherCutsceneStage === 'approach' || teacherCutsceneStage === 'hit' ? '52%' : '50%'),
                  transform: teacherCutsceneStage === 'victory' ? 'translateX(-50%)' : 'none',
                  transition: teacherCutsceneStage === 'approach' ? 'all 1.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  filter: 'drop-shadow(0 0 25px rgba(245, 158, 11, 0.9))',
                  zIndex: 70
                }}>
                  <div style={{ color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.3rem', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                    PROFESSOR
                  </div>
                  {userData?.avatarConfig ? (
                    <AvatarCharacter
                      config={userData.avatarConfig}
                      size={220}
                      animation={teacherCutsceneStage === 'approach' || teacherCutsceneStage === 'hit' ? 'attack-fatal' : (teacherCutsceneStage === 'victory' ? 'cheer' : 'idle')}
                      interactive={false}
                      role="player"
                    />
                  ) : (
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--gold-primary)' }} />
                  )}
                </div>

                {/* Hit Impact Flash */}
                {teacherCutsceneStage === 'hit' && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(255, 215, 0, 0.4)', mixBlendMode: 'overlay', animation: 'pulse 0.3s infinite', pointerEvents: 'none' }} />
                )}
              </div>

              {/* Skip Cutscene */}
              <button
                onClick={() => {
                  setTeacherCutsceneStage('none');
                  executeEndGame();
                }}
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 1.2rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem', zIndex: 70 }}
              >
                Pular Animação ➔
              </button>
            </div>
          )}

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
            <div style={{ pointerEvents: 'auto', background: 'rgba(0,0,0,0.85)', padding: '1.5rem', borderRadius: '16px', width: '100%', maxWidth: '650px', border: '1px solid var(--gold-primary)', backdropFilter: 'blur(10px)', marginTop: '0.5rem' }}>
               <h2 style={{ textAlign: 'center', color: 'var(--gold-primary)', fontSize: '1.8rem', marginBottom: '1.5rem', marginTop: 0 }}>Ranking Provisório</h2>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                 {sortedPlayers.slice(0, 5).map((p, index) => {
                   const isPlayerEliminated = p.hp !== undefined && p.hp <= 0;
                   return (
                     <div key={p.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1.2rem', background: isPlayerEliminated ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.1)', borderRadius: '8px', border: isPlayerEliminated ? '1px solid rgba(239, 68, 68, 0.4)' : 'none' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                          <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: index === 0 ? 'var(--gold-primary)' : 'var(--text-primary)' }}>#{index + 1}</span>
                          <span style={{ fontSize: '1.1rem', textDecoration: isPlayerEliminated ? 'line-through' : 'none', opacity: isPlayerEliminated ? 0.7 : 1 }}>{p.name}</span>
                          {isPlayerEliminated && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(239, 68, 68, 0.25)', color: '#f87171', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                              <Skull size={13} color="#f87171" /> Eliminado
                            </span>
                          )}
                       </div>
                       <span style={{ fontWeight: 'bold', color: isPlayerEliminated ? '#94a3b8' : 'var(--accent-blue)', fontSize: '1.1rem' }}>{p.score} pts</span>
                     </div>
                   );
                 })}
               </div>
            </div>
          )}

          {/* QUESTION TEXT (FORMATTED HTML) */}
          {(session.status === 'question' || session.status === 'reveal') && (
            <div style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 100%)', padding: '1rem', borderRadius: '16px', pointerEvents: 'auto', width: '100%', maxWidth: '800px', border: '1px solid var(--border-glass)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'flex', flexWrap: 'wrap', flexDirection: question.imageUrl ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
              {question.imageUrl && (
                <img src={question.imageUrl} alt="Questão" style={{ maxHeight: '80px', maxWidth: '200px', objectFit: 'contain', borderRadius: '8px' }} />
              )}
              <h2
                style={{ fontSize: question.imageUrl ? '1.3rem' : '1.5rem', margin: 0, flex: 1, textAlign: question.imageUrl ? 'left' : 'center', textShadow: '0 2px 4px rgba(0,0,0,0.8)', color: 'white' }}
                dangerouslySetInnerHTML={{ __html: question.title || (question as any).question || 'Sem título' }}
              />
            </div>
          )}
        </div>
        {/* BOTTOM AREA: OPTIONS & OVERLAYS */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, padding: '1rem 2rem', pointerEvents: 'none' }}>
          {session.status === 'reveal' && (session as any).nobodyCorrect && (
            <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(239, 68, 68, 0.95)', padding: '1.5rem', borderRadius: '16px', border: '2px solid white', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', textAlign: 'center', width: '90%', maxWidth: '400px' }}>
               <h2 style={{ margin: 0, fontSize: '2.5rem', color: 'white' }}>Ninguém Acertou!</h2>
               <p style={{ margin: '0.5rem 0 0', fontSize: '1.2rem', color: 'rgba(255,255,255,0.9)' }}>Essa pergunta voltará no futuro...</p>
            </div>
          )}

          {(session.status === 'question' || session.status === 'reveal') && (
            <div className="responsive-grid" style={{ pointerEvents: 'auto', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
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
                    <span style={{ flex: 1 }} dangerouslySetInnerHTML={{ __html: typeof opt === 'string' ? opt : (opt.text || '') }} />
                    {isReveal && isCorrect && <CheckCircle size={32} color="white" />}
                  </div>
                );
              })}
            </div>
          )}
          {/* FINISHED CONTENT - KAHOOT STYLE PODIUM */}
          {session.status === 'finished' && (
            <div style={{
              pointerEvents: 'auto',
              position: 'fixed',
              inset: 0,
              zIndex: 80,
              background: quest?.podiumBgUrl
                ? `linear-gradient(rgba(10, 10, 25, 0.5), rgba(10, 10, 25, 0.7)), url(${quest.podiumBgUrl}) center / cover no-repeat`
                : 'radial-gradient(ellipse at center, rgba(30, 27, 75, 0.96) 0%, rgba(10, 10, 20, 0.99) 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 2rem 1.5rem',
              overflow: 'hidden'
            }}>
              <canvas ref={fireworksCanvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 95 }} />

              {/* Header & Controls */}
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <Crown size={32} color="var(--gold-primary)" />
                  <span style={{ fontSize: '1.8rem', fontWeight: '900', letterSpacing: '2px', background: 'linear-gradient(135deg, #f59e0b 0%, #ffd700 50%, #ffffff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textShadow: '0 0 20px rgba(245, 158, 11, 0.5)' }}>
                    PÓDIO DOS CAMPEÕES
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {podiumStep < 3 && (
                    <button
                      onClick={() => setPodiumStep(3)}
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.3)',
                        color: 'white',
                        padding: '0.5rem 1.2rem',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontWeight: 'bold',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s'
                      }}
                      title="Pular suspense e revelar o grande campeão"
                    >
                      <SkipForward size={16} /> Revelar Tudo
                    </button>
                  )}
                  <button
                    onClick={handleEndSession}
                    style={{
                      background: 'var(--gold-primary)',
                      color: 'var(--text-on-gold, #000000)',
                      border: 'none',
                      padding: '0.5rem 1.5rem',
                      borderRadius: '20px',
                      fontWeight: 'bold',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      boxShadow: '0 0 15px rgba(245, 158, 11, 0.5)',
                      transition: 'transform 0.2s'
                    }}
                  >
                    Finalizar Missão
                  </button>
                </div>
              </div>

              {/* Status Announcement */}
              <div style={{ textAlign: 'center', margin: '0.3rem 0', zIndex: 100 }}>
                {podiumStep === 0 && (
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-secondary)', animation: 'pulse 1s infinite' }}>
                    E os vencedores são...
                  </div>
                )}
                {podiumStep === 1 && (
                  <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#cd7f32', textShadow: '0 0 15px rgba(205,127,50,0.8)', animation: 'popIn 0.4s ease-out' }}>
                    🥉 3º LUGAR REVELADO!
                  </div>
                )}
                {podiumStep === 2 && (
                  <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#e2e8f0', textShadow: '0 0 15px rgba(226,232,240,0.8)', animation: 'popIn 0.4s ease-out' }}>
                    🥈 2º LUGAR REVELADO!
                  </div>
                )}
                {podiumStep >= 3 && (
                  <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#ffd700', textShadow: '0 0 25px rgba(255,215,0,1)', animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                    👑 1º LUGAR — O GRANDE CAMPEÃO! 🏆
                  </div>
                )}
              </div>

              {/* MAIN PODIUM STAGE (ELEVADO & RESPONSIVO) */}
              <div className="podium-stage-container">
                
                {/* 5º LUGAR (Desktop/Paisagem apenas) */}
                {sortedPlayers[4] && (
                  <div className="podium-desktop-only" style={{ flexDirection: 'column', alignItems: 'center', opacity: podiumStep >= 1 ? 1 : 0.2, transition: 'all 0.5s', transform: podiumStep >= 1 ? 'scale(1)' : 'scale(0.8)' }}>
                    <div style={{ width: '110px', height: '140px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: '-32px', position: 'relative', zIndex: 2 }}>
                      <AvatarCharacter config={sortedPlayers[4].avatarConfig} equippedItems={sortedPlayers[4].equippedItems || []} size={110} animation="idle" expression="happy" interactive={false} role="player" />
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px 10px 0 0', width: '100px', height: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.3rem', position: 'relative', zIndex: 1 }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#94a3b8' }}>5º</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'white', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sortedPlayers[4].name}</span>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{sortedPlayers[4].score} pts</span>
                    </div>
                  </div>
                )}

                {/* 2º LUGAR (Left Center) */}
                {sortedPlayers[1] && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                    {podiumStep >= 2 ? (
                      <div style={{ animation: 'slideUpFade 0.6s ease-out', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {sortedPlayers[1].wonChest && (
                          <div style={{ marginBottom: '0.3rem', animation: 'bounce 2s infinite' }}>
                            <Package size={32} color="#e2e8f0" style={{ filter: 'drop-shadow(0 0 10px rgba(226,232,240,0.8))' }} />
                          </div>
                        )}
                        <Medal size={30} color="#e2e8f0" style={{ filter: 'drop-shadow(0 0 10px rgba(226,232,240,0.9))', marginBottom: '0.2rem' }} />
                        <div style={{ width: '150px', height: '170px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: '-35px', position: 'relative', zIndex: 2 }}>
                          <AvatarCharacter config={sortedPlayers[1].avatarConfig} equippedItems={sortedPlayers[1].equippedItems || []} size={150} animation="raise-hand" expression="happy" interactive={false} role="player" />
                        </div>
                      </div>
                    ) : (
                      <div style={{ width: '150px', height: '170px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', color: 'rgba(255,255,255,0.2)', fontWeight: 'bold' }}>
                        ?
                      </div>
                    )}
                    {/* Silver Pillar */}
                    <div style={{
                      background: 'linear-gradient(180deg, #e2e8f0 0%, #94a3b8 50%, #475569 100%)',
                      border: '2px solid #ffffff',
                      borderRadius: '16px 16px 0 0',
                      width: '150px',
                      height: podiumStep >= 2 ? '150px' : '50px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingTop: '0.8rem',
                      boxShadow: '0 0 25px rgba(226,232,240,0.4), inset 0 4px 10px rgba(255,255,255,0.6)',
                      transition: 'height 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      position: 'relative',
                      zIndex: 1
                    }}>
                      <span style={{ fontSize: '2.2rem', fontWeight: '900', color: '#0f172a' }}>2º</span>
                      {podiumStep >= 2 && (
                        <>
                          <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#0f172a', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.2rem' }}>{sortedPlayers[1].name}</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: '900', color: '#0284c7' }}>{sortedPlayers[1].score} pts</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 1º LUGAR (Center - Grande Campeão) */}
                {sortedPlayers[0] && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 95, transition: 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                    {podiumStep >= 3 ? (
                      <div style={{ animation: 'slideUpFade 0.6s ease-out', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {sortedPlayers[0].wonChest && (
                          <div style={{ marginBottom: '0.3rem', animation: 'bounce 2s infinite' }}>
                            <Package size={42} color="#ffd700" style={{ filter: 'drop-shadow(0 0 15px rgba(255,215,0,0.9))' }} />
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <Crown size={40} color="#ffd700" style={{ filter: 'drop-shadow(0 0 15px rgba(255,215,0,1))', animation: 'spin 6s linear infinite' }} />
                          <Trophy size={40} color="#ffd700" style={{ filter: 'drop-shadow(0 0 15px rgba(255,215,0,1))' }} />
                        </div>
                        <div style={{ width: '180px', height: '200px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: '-38px', position: 'relative', zIndex: 2 }}>
                          <AvatarCharacter config={sortedPlayers[0].avatarConfig} equippedItems={sortedPlayers[0].equippedItems || []} size={180} animation="cheer" expression="happy" interactive={false} role="player" />
                        </div>
                      </div>
                    ) : (
                      <div style={{ width: '180px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem', color: 'rgba(255,215,0,0.3)', fontWeight: 'bold' }}>
                        ?
                      </div>
                    )}
                    {/* Gold Pillar */}
                    <div style={{
                      background: 'linear-gradient(180deg, #ffd700 0%, #f59e0b 50%, #b45309 100%)',
                      border: '3px solid #ffffff',
                      borderRadius: '20px 20px 0 0',
                      width: '180px',
                      height: podiumStep >= 3 ? '210px' : '60px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingTop: '0.8rem',
                      boxShadow: '0 0 40px rgba(255,215,0,0.7), inset 0 6px 15px rgba(255,255,255,0.8)',
                      transition: 'height 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      position: 'relative',
                      zIndex: 1
                    }}>
                      <span style={{ fontSize: '2.8rem', fontWeight: '900', color: '#000000', textShadow: '0 2px 4px rgba(255,255,255,0.5)' }}>1º</span>
                      {podiumStep >= 3 && (
                        <>
                          <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#000000', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.2rem' }}>{sortedPlayers[0].name}</span>
                          <span style={{ fontSize: '1rem', fontWeight: '900', color: '#7c2d12' }}>{sortedPlayers[0].score} pts</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 3º LUGAR (Right Center) */}
                {sortedPlayers[2] && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                    {podiumStep >= 1 ? (
                      <div style={{ animation: 'slideUpFade 0.6s ease-out', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {sortedPlayers[2].wonChest && (
                          <div style={{ marginBottom: '0.3rem', animation: 'bounce 2s infinite' }}>
                            <Package size={28} color="#cd7f32" style={{ filter: 'drop-shadow(0 0 10px rgba(205,127,50,0.8))' }} />
                          </div>
                        )}
                        <Medal size={28} color="#cd7f32" style={{ filter: 'drop-shadow(0 0 10px rgba(205,127,50,0.9))', marginBottom: '0.2rem' }} />
                        <div style={{ width: '140px', height: '160px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: '-35px', position: 'relative', zIndex: 2 }}>
                          <AvatarCharacter config={sortedPlayers[2].avatarConfig} equippedItems={sortedPlayers[2].equippedItems || []} size={140} animation="idle" expression="happy" interactive={false} role="player" />
                        </div>
                      </div>
                    ) : (
                      <div style={{ width: '140px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', color: 'rgba(255,255,255,0.2)', fontWeight: 'bold' }}>
                        ?
                      </div>
                    )}
                    {/* Bronze Pillar */}
                    <div style={{
                      background: 'linear-gradient(180deg, #d97706 0%, #b45309 50%, #78350f 100%)',
                      border: '2px solid #fed7aa',
                      borderRadius: '16px 16px 0 0',
                      width: '140px',
                      height: podiumStep >= 1 ? '120px' : '45px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingTop: '0.8rem',
                      boxShadow: '0 0 25px rgba(217,119,6,0.4), inset 0 4px 10px rgba(255,255,255,0.5)',
                      transition: 'height 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      position: 'relative',
                      zIndex: 1
                    }}>
                      <span style={{ fontSize: '2rem', fontWeight: '900', color: '#ffffff' }}>3º</span>
                      {podiumStep >= 1 && (
                        <>
                          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#ffffff', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.2rem' }}>{sortedPlayers[2].name}</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#fed7aa' }}>{sortedPlayers[2].score} pts</span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 4º LUGAR (Desktop/Paisagem apenas) */}
                {sortedPlayers[3] && (
                  <div className="podium-desktop-only" style={{ flexDirection: 'column', alignItems: 'center', opacity: podiumStep >= 1 ? 1 : 0.2, transition: 'all 0.5s', transform: podiumStep >= 1 ? 'scale(1)' : 'scale(0.8)' }}>
                    <div style={{ width: '110px', height: '140px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: '-32px', position: 'relative', zIndex: 2 }}>
                      <AvatarCharacter config={sortedPlayers[3].avatarConfig} equippedItems={sortedPlayers[3].equippedItems || []} size={110} animation="idle" expression="happy" interactive={false} role="player" />
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px 10px 0 0', width: '100px', height: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.3rem', position: 'relative', zIndex: 1 }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#94a3b8' }}>4º</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'white', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sortedPlayers[3].name}</span>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{sortedPlayers[3].score} pts</span>
                    </div>
                  </div>
                )}

              </div>

              {/* TORCIDA & GUERREIROS NATURAIS NO RODAPÉ DA TELA (Desktop/Paisagem) */}
              {(sortedPlayers.length > 5 || eliminatedPlayers.length > 0) && (
                <div
                  className="podium-crowd-container"
                  style={{
                    position: 'absolute',
                    bottom: '0.5rem',
                    left: 0,
                    right: 0,
                    justifyContent: 'center',
                    alignItems: 'flex-end',
                    gap: '1.2rem',
                    flexWrap: 'wrap',
                    padding: '0 1rem',
                    zIndex: 95,
                    pointerEvents: 'auto'
                  }}
                >
                  {/* Sobreviventes além do 5º lugar */}
                  {sortedPlayers.slice(5).map((p, idx) => {
                    const isLeftSide = idx % 2 === 0;
                    return (
                      <div key={p.uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: '70px', height: '90px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', transform: isLeftSide ? 'scaleX(1)' : 'scaleX(-1)' }}>
                          <AvatarCharacter config={p.avatarConfig} equippedItems={p.equippedItems || []} size={80} animation="idle" expression="happy" interactive={false} role="player" />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'white', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                          {p.name.split(' ')[0]}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>{p.score} pts</span>
                      </div>
                    );
                  })}

                  {/* Jogadores Eliminados (Machucados mas Felizes vibrando pela vitória do time!) */}
                  {eliminatedPlayers.map((p, idx) => {
                    const isLeftSide = idx % 2 === 1;
                    return (
                      <div key={p.uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, opacity: 0.95 }}>
                        <div style={{ width: '70px', height: '90px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative', transform: isLeftSide ? 'scaleX(1)' : 'scaleX(-1)' }}>
                          <AvatarCharacter config={p.avatarConfig} equippedItems={p.equippedItems || []} size={80} animation="idle" expression="happy" hurt={true} interactive={false} role="player" />
                          <div style={{ position: 'absolute', top: '0', right: '0', background: 'rgba(239,68,68,0.85)', borderRadius: '50%', padding: '2px', display: 'flex', transform: isLeftSide ? 'none' : 'scaleX(-1)' }} title="Abatido na batalha, mas comemorando a vitória!">
                            <Skull size={12} color="white" />
                          </div>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fca5a5', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                          {p.name.split(' ')[0]}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--accent-red)', fontWeight: 'bold' }}>Abatido</span>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
