import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchEconomySettings } from '../lib/economy';
import { supabase } from '../lib/supabase';
import { Loader2, ArrowLeft, Pen, Heart, Skull, Zap } from 'lucide-react';
import type { QuestDef } from './AdminDashboard';
import type { LiveSession, LivePlayer } from './LiveQuestAdmin';
import AvatarPrint from '../components/AvatarPrint';
import AvatarCustomizationModal from '../components/AvatarCustomizationModal';
import AvatarCharacter from '../components/AvatarCharacter';
import CustomModelViewer from '../components/CustomModelViewer';
import ChestReveal from '../components/ChestReveal';
import { Package, Coins } from 'lucide-react';
import { RANKS, getRankForXp } from '../lib/ranks';
import { normalizeCombatCoinDrop } from '../lib/utils';
import { useDialog } from '../contexts/DialogContext';
import { calculateTotalStats } from '../lib/gacha';
import type { GameEffectType } from '../components/AdminStoreManager';
import { fetchModel3DById, fetchActiveCoin, fetchActiveChest } from '../lib/model3d';
import { sessionCache, CACHE_KEYS } from '../lib/sessionCache';

interface UserItem {
  id: string;
  itemId: string;
  itemTitle: string;
  itemImageUrl: string;
  gameEffect?: GameEffectType;
  usableInQuest?: boolean;
  itemType: 'consumable' | 'equippable';
  equipped: boolean;
  count?: number;
  docIds?: string[];
  hpCooldownReductionMinutes?: number;
  buffDurationHours?: number;
}

export default function LiveQuestStudent() {
  const { sessionId } = useParams();
  const { userData, updateUserDataLocally } = useAuth();
  const { tenantId, isSuperAdmin } = useTenant();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [quest, setQuest] = useState<QuestDef | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState('');
  const [powerups, setPowerups] = useState<UserItem[]>([]);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const { showAlert, showConfirm } = useDialog();
  const [chestOpened, setChestOpened] = useState(false);
  const [selectedChestModel, setSelectedChestModel] = useState<any>(null);
  const [activeCoinModel, setActiveCoinModel] = useState<any>(null);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [studentAnim, setStudentAnim] = useState<string>('idle');
  const [monsterAnim, setMonsterAnim] = useState<string>('idle');
  const [hasShield, setHasShield] = useState(false);
  
  const [economySettings, setEconomySettings] = useState<any>(null);
  const [coinsToRescue, setCoinsToRescue] = useState<number>(0);
  const [droppedCoins, setDroppedCoins] = useState<{ id: number; x: number; y: number; value: number }[]>([]);
  const [coinPops, setCoinPops] = useState<{ id: number; x: number; y: number; value: number }[]>([]);
  const [lostCoinsDisplay, setLostCoinsDisplay] = useState<number>(0);

  const arenaRef = useRef<HTMLDivElement>(null);
  const [arenaWidth, setArenaWidth] = useState(0);
  const hasSavedAttempt = useRef(false);

  // Quando a missão ao vivo finaliza, o aluno registra sua tentativa concluída e invalida o cache do Dashboard
  useEffect(() => {
    if (session?.status === 'finished' && quest && userData && !hasSavedAttempt.current) {
      hasSavedAttempt.current = true;
      const me = session.players?.[userData.uid];
      const isAlive = me?.hp === undefined || me?.hp > 0;
      const earnedXp = me?.sessionEarnedXp || 0;
      const status = isAlive ? 'completed' : 'failed';

      supabase.from('quest_attempts').insert({
        quest_id: quest.id,
        student_id: userData.uid,
        status: status,
        tenant_id: tenantId || quest.tenant_id,
        data: {
          answers: [],
          isStudyMode: false,
          isLiveQuest: true,
          earned_xp: earnedXp,
          score: me?.score || 0,
          place: me?.wonChest?.place || null,
          questTitle: quest.title || ''
        },
        created_at: new Date().toISOString()
      }).then(({ error: attErr }) => {
        if (attErr) console.error("Erro ao registrar tentativa do aluno na missão ao vivo:", attErr);
        sessionCache.invalidate(CACHE_KEYS.questAttempts(userData.uid));
      });
    }
  }, [session?.status, quest?.id, userData?.uid, tenantId]);

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

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const joinSession = async () => {
      try {
        // Load Quest
        const { data: qDoc } = await supabase.from('quests').select('*').eq('id', sessionId).single();
        if (!qDoc) {
          setError('Missão não encontrada.');
          setLoading(false);
          return;
        }
        // Isolamento por escola (Superadmin pode acessar qualquer missão)
        if (tenantId && !isSuperAdmin) {
          const questTenant = (qDoc as any).tenant_id;
          if (questTenant && questTenant !== tenantId) {
            setError('Esta missão pertence a outra escola.');
            setLoading(false);
            return;
          }
        }
        setQuest(qDoc as QuestDef);

        // Load selected chest model & active coin for this live quest
        const chestModelId = (qDoc as any)?.chestConfig?.chestModelId;
        if (chestModelId) {
          const chestModel = await fetchModel3DById(chestModelId, tenantId);
          setSelectedChestModel(chestModel);
        } else {
          // Sem baú específico → usa o baú padrão cadastrado em Moldes 3D > Baús
          const activeChest = await fetchActiveChest(tenantId);
          setSelectedChestModel(activeChest);
        }
        const coinModel = await fetchActiveCoin(tenantId);
        setActiveCoinModel(coinModel);

        // Check Session
        const { data: sDoc } = await supabase.from('live_quests').select('*').eq('id', sessionId).maybeSingle();
        if (!sDoc) {
          setError('O professor ainda não abriu a sala para esta missão.');
          setLoading(false);
          return;
        }

        // Fetch Economy (por escola)
        const econ = await fetchEconomySettings(tenantId);
        setEconomySettings(econ);

        const currentSession = sDoc as LiveSession;
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
          let loadedPowerups: UserItem[] = [];
          try {
            const { data: invSnap } = await supabase.from('user_items').select('*').eq('student_id', userData.uid);
            
            const pLoaded: any[] = [];
            const missingTransformIds: string[] = [];
            (invSnap || []).forEach(d => {
              const data = d.data;
              if (!data) return;

              if (d.equipped) {
                let parsedAdds: any[] = [];
                if (data.adds) {
                  try { parsedAdds = typeof data.adds === 'string' ? JSON.parse(data.adds) : data.adds; } catch(e){}
                }
                equippedItems.push({ 
                  docId: d.id,
                  itemId: d.item_id,
                  imageUrl: data.itemImageUrl || data.imageUrl || '', 
                  avatarPart: data.avatarPart,
                  itemTitle: data.itemTitle,
                  itemCategory: data.itemCategory,
                  baseAttributeType: data.baseAttributeType,
                  baseAttributeValue: data.baseAttributeValue,
                  adds: parsedAdds,
                  gameModelUrl: data.gameModelUrl,
                  modelTextureUrl: data.modelTextureUrl,
                  minecraftHeadValue: data.minecraftHeadValue,
                  modelTransforms: data.modelTransforms,
                  backColor: data.backColor || '',
                  rarity: data.rarity,
                  customAnimation: data.customAnimation,
                });
                if (!data.modelTransforms && d.item_id) {
                  missingTransformIds.push(d.item_id);
                }
              }
              const item = { ...data, id: d.id } as UserItem;
              if (item.itemType === 'consumable' && item.usableInQuest && item.gameEffect !== 'add_time') {
                pLoaded.push({ ...item, id: d.id });
              }
            });

            // Fallback: fetch modelTransforms from store_items for items missing them
            if (missingTransformIds.length > 0) {
              const uniqueIds = [...new Set(missingTransformIds)];
              const { data: storeSnap } = await supabase.from('store_items').select('id, data').in('id', uniqueIds);
              if (storeSnap) {
                const storeMap = new Map<string, any>();
                storeSnap.forEach((s: any) => {
                  if (s.data?.modelTransforms) {
                    storeMap.set(s.id, s.data.modelTransforms);
                  }
                });
                equippedItems.forEach((eq: any) => {
                  if (!eq.modelTransforms && eq.itemId && storeMap.has(eq.itemId)) {
                    eq.modelTransforms = storeMap.get(eq.itemId);
                  }
                });
              }
            }

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
            loadedPowerups = Array.from(groupedMap.values());
            setPowerups(loadedPowerups);
          } catch (e) {
            console.error("Erro ao carregar itens equipados", e);
          }

          const stats = calculateTotalStats(equippedItems, userData?.distributedStats);
          const rankIndex = Math.max(0, RANKS.findIndex(r => r.name === userData.lastSeenRank));
          const maxHp = Math.max(3, 3 + Math.floor(rankIndex / 2)) + Math.floor(stats.vitality / 30);

          const newPlayer: LivePlayer = {
            uid: userData.uid,
            name: userData.name || 'Jogador',
            hp: maxHp,
            maxHp: maxHp,
            attack: (userData as any).attack || 1,
            avatarConfig: userData.avatarConfig || null,
            equippedItems: equippedItems,
            score: 0,
            isDead: false,
            currentAnswer: null,
            xp: userData.xp || 0,
            sessionEarnedXp: 0,
            power: (userData.xp || 0) + stats.attack
          };

          const sanitizedPlayer = JSON.parse(JSON.stringify(newPlayer));

          const { data: curr } = await supabase.from('live_quests').select('status, players').eq('id', sessionId).single();
          if (curr && curr.players) {
            const existingPlayer = curr.players[userData.uid];
            
            // Se já existe e a missão já começou, é uma reconexão!
            if (existingPlayer && curr.status !== 'lobby') {
               if (existingPlayer.hasSurrendered) {
                  // Abandonou a partida
                  curr.players[userData.uid] = existingPlayer;
               } else {
                  // Reconexão: Preserva os dados antigos, mas tira 0.5 de vida como penalidade por queda
                  existingPlayer.hp = Math.max(0, (existingPlayer.hp || 0) - 0.5);
                  curr.players[userData.uid] = existingPlayer;
               }
            } else {
               // Primeira entrada (ou entrada no lobby)
               curr.players[userData.uid] = sanitizedPlayer;
            }
            
            await supabase.from('live_quests').update({ players: curr.players }).eq('id', sessionId);
          }
        }

        // Listen to Session
        channel = supabase.channel(`student_live_quests_${sessionId}_${Date.now()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'live_quests', filter: `id=eq.${sessionId}` }, async (payload) => {
            if (payload.eventType === 'DELETE') {
              setError('A sessão foi encerrada pelo professor.');
              setSession(null);
            } else {
              const newSession = payload.new as LiveSession;
              setSession(newSession);
              
              // Auto re-registration: se o aluno foi removido durante um reset do admin
              // mas a sessão ainda está no lobby, re-adicione o aluno automaticamente
              if (newSession.status === 'lobby' && userData && !newSession.players?.[userData.uid]) {
                try {
                  const { data: curr } = await supabase.from('live_quests').select('players').eq('id', sessionId!).single();
                  if (curr && curr.players && !curr.players[userData.uid]) {
                    const { data: invSnap } = await supabase.from('user_items').select('*').eq('student_id', userData.uid);
                    const equippedItems: any[] = (invSnap || []).filter(d => d.data?.equipped).map(d => ({ docId: d.id, ...d.data }));
                    
                    const { RANKS: R } = await import('../lib/ranks');
                    const { calculateTotalStats: cts } = await import('../lib/gacha');
                    const stats = cts(equippedItems, userData.distributedStats);
                    const rankIndex = Math.max(0, R.findIndex((r: any) => r.name === userData.lastSeenRank));
                    const maxHp = Math.max(3, 3 + Math.floor(rankIndex / 2)) + Math.floor(stats.vitality / 30);
                    
                    const rejoinPlayer = JSON.parse(JSON.stringify({
                      uid: userData.uid,
                      name: userData.name || 'Jogador',
                      hp: maxHp,
                      maxHp,
                      attack: (userData as any).attack || 1,
                      avatarConfig: userData.avatarConfig || null,
                      equippedItems,
                      score: 0,
                      isDead: false,
                      currentAnswer: null,
                      xp: userData.xp || 0,
                      sessionEarnedXp: 0,
                      power: (userData.xp || 0) + stats.attack
                    }));
                    curr.players[userData.uid] = rejoinPlayer;
                    await supabase.from('live_quests').update({ players: curr.players }).eq('id', sessionId!);
                  }
                } catch (e) {
                  console.error('Erro ao re-registrar na sessão:', e);
                }
              }
            }
          })
          .subscribe();
        
        setSession(sDoc as LiveSession);
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(`Erro ao conectar na sala: ${err.message || String(err)}`);
        setLoading(false);
      }
    };

    joinSession();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId, userData]);

  // Polling fallback para garantir que o aluno receba atualizações
  useEffect(() => {
    if (!sessionId || !userData) return;

    const interval = setInterval(async () => {
      const { data } = await supabase.from('live_quests').select('*').eq('id', sessionId).single();
      if (data) {
        setSession(prev => {
           if (!prev) return data as LiveSession;
           return {
             ...prev,
             status: data.status,
             currentQuestionIndex: data.currentQuestionIndex ?? (data as any).current_question_index ?? prev.currentQuestionIndex,
             activeQuestions: data.activeQuestions ?? (data as any).active_questions ?? prev.activeQuestions,
             questionStartTime: data.questionStartTime ?? (data as any).questionstarttime ?? (data as any).question_start_time ?? prev.questionStartTime,
             players: data.players || {},
             monsterHp: data.monster_hp ?? data.monsterHp ?? prev.monsterHp,
             nobodyCorrect: data.nobodyCorrect ?? (data as any).nobody_correct
           };
        });
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [sessionId, userData]);

  const handleLeave = async () => {
    if (session && session.status === 'lobby' && userData && sessionId) {
      const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
      if (currSess && currSess.players) {
        delete currSess.players[userData.uid];
        await supabase.from('live_quests').update({ players: currSess.players }).eq('id', sessionId);
      }
    }
    navigate('/dashboard');
  };

  const handleSurrender = async () => {
    const confirmed = await showConfirm("Tem certeza que deseja abandonar a batalha? Você perderá todo seu progresso e XP desta missão, e não poderá retornar!");
    if (confirmed && session && userData && sessionId) {
       const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
       if (currSess && currSess.players && currSess.players[userData.uid]) {
          currSess.players[userData.uid].hasSurrendered = true;
          currSess.players[userData.uid].hp = 0;
          await supabase.from('live_quests').update({ players: currSess.players }).eq('id', sessionId);
       }
       navigate('/dashboard');
    }
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
  const totalEquippedStats = me?.equippedItems ? calculateTotalStats(me.equippedItems, userData?.distributedStats) : { attack: 0, defense: 0, xp: 0, coins: 0, vitality: 0, fortitude: 0, persuasion: 0 };
  const isStaff = userData.role === 'admin' || userData.role === 'teacher' || userData.role === 'coordinator';
  const rankObj = isStaff ? getRankForXp(userData.xp || 50000) : RANKS.find(r => r.name === userData.lastSeenRank) || RANKS[0];
  const rankIndex = Math.max(0, RANKS.findIndex(r => r.name === rankObj.name));
  const maxHearts = Math.max(3, 3 + Math.floor(rankIndex / 2)) + Math.floor(totalEquippedStats.vitality / 30);

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
                {(me?.avatarConfig || userData.avatarConfig) ? (
                  <AvatarPrint config={me?.avatarConfig || userData.avatarConfig} equippedItems={me?.equippedItems || []} size={150} />
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
                  const { data: c } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
                  if (c && c.players && c.players[userData.uid]) {
                    c.players[userData.uid].avatarConfig = config;
                    await supabase.from('live_quests').update({ players: c.players }).eq('id', sessionId);
                  }
                  await supabase.from('users').update({ avatar_config: config }).eq('id', userData.uid);
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

  const collectCoin = (coin: { id: number; x: number; y: number; value: number }) => {
    if (!userData?.uid) return;
    const currentCoins = userData.coins || 0;
    supabase.from('users').update({ coins: currentCoins + coin.value }).eq('id', userData.uid).then();
    userData.coins = currentCoins + coin.value;
    setDroppedCoins(prev => prev.filter(c => c.id !== coin.id));
    setCoinPops(prev => [...prev, { id: Date.now() + Math.random(), x: coin.x, y: coin.y, value: coin.value }]);
  };

  const handleAnswerSubmit = async (answerIndex: number) => {
    if (!sessionId || !userData || !session || !quest) return;
    if (me?.currentAnswer !== null && me?.currentAnswer !== undefined) return;

    const currentQOriginalIndex = session.activeQuestions[session.currentQuestionIndex];
    const question = quest.questions[currentQOriginalIndex];
    const isCorrect = answerIndex === question.correctIndex;
    const answerTime = Date.now();

    // Calculate score
    const timeLimitMs = (question.timeLimit || 30) * 1000;
    const qStartTime = session.questionStartTime || (session as any).questionstarttime || (session as any).question_start_time || (answerTime - 5000);
    const timeTaken = Math.max(0, Math.min(timeLimitMs, answerTime - qStartTime));
    const timeLeft = Math.max(0, timeLimitMs - timeTaken);

    let earnedScore = 0;
    let earnedXp = 0;

    if (isCorrect) {
      earnedScore = Math.max(10, Math.floor((timeLeft / timeLimitMs) * 100));
      const baseQuestXp = quest.baseXp || 0;
      const xpPerQuestion = Math.floor(baseQuestXp / (quest.questions?.length || 1));
      earnedXp = xpPerQuestion;
      const xpMultiplier = 1 + (totalEquippedStats.xp / 100);
      earnedXp = Math.floor(earnedXp * xpMultiplier);
    }

    const newScore = (me.score || 0) + earnedScore;
    const newXp = (me.xp || 0) + earnedXp;
    const newSessionEarnedXp = (me.sessionEarnedXp || 0) + earnedXp;

    const { data: qData } = await supabase.from('live_quests').select('players, monsterHp').eq('id', sessionId).single();
    if (qData && qData.players && qData.players[userData.uid]) {
      const p = qData.players[userData.uid];
      p.currentAnswer = answerIndex;
      p.isCorrect = isCorrect;
      p.answerTime = answerTime;
      p.score = newScore;
      p.xp = newXp;
      p.sessionEarnedXp = newSessionEarnedXp;
      
      let newMonsterHp = qData.monsterHp;
      
      if (isCorrect) {
        const power = 1;
        newMonsterHp = (newMonsterHp || 0) - power;
        
        if (economySettings?.coinsDropInCombat) {
          const cfg = normalizeCombatCoinDrop(quest?.combatCoinDrop);
          let dropped: number;
          if (cfg.minCoins && cfg.maxCoins) {
            const minC = Math.max(1, cfg.minCoins);
            const maxC = Math.max(minC, cfg.maxCoins);
            dropped = Math.floor(Math.random() * (maxC - minC + 1)) + minC;
          } else {
            const rankObj = getRankForXp(userData?.xp || 0);
            const rankIndex = Math.max(1, RANKS.findIndex(r => r.name === rankObj.name));
            dropped = Math.floor(Math.random() * rankIndex) + 1;
          }
          const minV = Math.max(1, cfg.minValue ?? 1);
          const maxV = Math.max(minV, cfg.maxValue ?? minV);
          setCoinsToRescue(dropped);
          setTimeout(() => setCoinsToRescue(0), 3000);
          const newCoins = Array.from({ length: Math.min(dropped, 8) }).map((_, i) => ({
            id: Date.now() + i,
            x: 74 + Math.random() * 18,
            y: 70 + Math.random() * 15,
            value: Math.floor(Math.random() * (maxV - minV + 1)) + minV
          }));
          setDroppedCoins(prev => [...prev, ...newCoins]);
        }
      } else {
        let hasEquippedShield = false;
        me.equippedItems?.forEach((item: any) => {
          if (item.gameEffect === 'extra_life') hasEquippedShield = true;
        });

        if (!hasEquippedShield && !hasShield) {
          if (economySettings?.coinsLostInCombat) {
            const rankObj = getRankForXp(userData?.xp || 0);
            const rankIndex = Math.max(1, RANKS.findIndex(r => r.name === rankObj.name));
            const maxLost = rankIndex * 1;
            const lost = Math.floor(Math.random() * maxLost) + 1;
            setLostCoinsDisplay(lost);
            try {
               const currentCoins = userData.coins || 0;
               await supabase.from('users').update({ coins: Math.max(0, currentCoins - lost) }).eq('id', userData.uid);
            } catch(e){}
          }

          const currentHp = me.hp !== undefined ? me.hp : maxHearts;
          const newHp = Math.max(0, currentHp - 1);
          p.hp = newHp;

          try {
            const userUpdate: any = { hp: newHp };
            if (currentHp >= maxHearts && newHp < maxHearts) {
              userUpdate.hp_recovery_start_timestamp = Date.now();
            } else if (newHp >= maxHearts) {
              userUpdate.hp_recovery_start_timestamp = null;
            }
            await supabase.from('users').update(userUpdate).eq('id', userData.uid);
            userData.hp = newHp;
            if (userUpdate.hp_recovery_start_timestamp !== undefined) {
              userData.hpRecoveryStartTimestamp = userUpdate.hp_recovery_start_timestamp;
            }
            updateUserDataLocally({
              hp: newHp,
              hpRecoveryStartTimestamp: userUpdate.hp_recovery_start_timestamp !== undefined
                ? userUpdate.hp_recovery_start_timestamp
                : userData.hpRecoveryStartTimestamp
            });
          } catch(e) { console.error(e); }
        } else {
          if (hasShield) setHasShield(false);
          p.isProtected = true;
        }
      }

      await supabase.from('live_quests').update({ players: qData.players, monsterHp: newMonsterHp }).eq('id', sessionId);
      
      setSession(prev => {
         if (!prev) return prev;
         const updatedPlayers = { ...prev.players };
         updatedPlayers[userData.uid] = p;
         return { ...prev, players: updatedPlayers, monsterHp: newMonsterHp };
      });
    }

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

  const OPTION_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];

  const usePowerup = async (item: UserItem) => {
    if (!sessionId || !userData || !session || !quest) return;
    
    if (item.gameEffect === 'remove_wrong') {
      const q = quest.questions[session.activeQuestions[session.currentQuestionIndex]];
      const wrongIndices = [0, 1, 2, 3].filter(i => i !== q.correctIndex && !eliminatedOptions.includes(i));
      
      if (wrongIndices.length === 0) {
        await showAlert('Não há mais opções erradas para eliminar!');
        return;
      }
      const toEliminate = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
      setEliminatedOptions([...eliminatedOptions, toEliminate]);
    } else if (item.gameEffect === 'extra_life') {
      setHasShield(true);
      
    } else if (item.gameEffect === 'restore_hp') {
      const currentHp = me.hp !== undefined ? me.hp : maxHearts;
      
      if (currentHp >= maxHearts) {
         await showAlert('Sua vida já está no máximo!');
         return;
      }
      
      const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
      if (currSess && currSess.players && currSess.players[userData.uid]) {
        currSess.players[userData.uid].hp = maxHearts;
        await supabase.from('live_quests').update({ players: currSess.players }).eq('id', sessionId);
      }
      try {
         await supabase.from('users').update({ hp: maxHearts }).eq('id', userData.uid);
      } catch (e) {}
    } else if (item.gameEffect === 'heal_1_hp') {
      const rankIndex = Math.max(0, RANKS.findIndex(r => r.name === me.rank));
      const maxHearts = 3 + Math.floor(rankIndex / 2);
      const currentHp = me.hp !== undefined ? me.hp : (userData.hp || maxHearts);
      
      if (currentHp >= maxHearts) {
         await showAlert('Sua vida já está no máximo!');
         return;
      }
      const newHp = Math.min(maxHearts, currentHp + 1);
      
      const { data: currSess } = await supabase.from('live_quests').select('players').eq('id', sessionId).single();
      if (currSess && currSess.players && currSess.players[userData.uid]) {
        currSess.players[userData.uid].hp = newHp;
        await supabase.from('live_quests').update({ players: currSess.players }).eq('id', sessionId);
      }
      try {
         await supabase.from('users').update({ hp: newHp }).eq('id', userData.uid);
      } catch (e) {}
    }

    setPowerups(powerups.filter(p => p.id !== item.id));
    await supabase.from('user_items').delete().eq('id', item.id);
  };

    const currentHp = me.hp !== undefined ? me.hp : (userData?.hp || maxHearts);
    const isEliminated = currentHp <= 0 || !!me.hasSurrendered;

    // Estado CONGELADO para jogador eliminado: não pisca nem muda de tela entre perguntas
    if (isEliminated && session.status !== 'finished') {
      return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '2rem', background: 'var(--bg-primary)' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '2px solid var(--accent-red)', padding: '2.5rem 2rem', borderRadius: '24px', maxWidth: '550px', width: '100%', boxShadow: '0 0 40px rgba(239, 68, 68, 0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            <div style={{ height: '160px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: '1rem' }}>
              {me.avatarConfig && (
                <AvatarCharacter
                  config={me.avatarConfig}
                  equippedItems={me.equippedItems || []}
                  size={140}
                  interactive={false}
                  animation="death-fall"
                  expression="sad"
                  role="player"
                  hurt={true}
                />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-red)', marginBottom: '0.5rem' }}>
              <Skull size={32} />
              <h2 style={{ fontSize: '2rem', margin: 0, fontWeight: 'bold' }}>Abatido em Combate</h2>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', margin: '0.5rem 0 1.5rem 0', lineHeight: '1.5' }}>
              Seus corações se esgotaram. Acompanhe a batalha pelo telão! Quando a missão terminar, você se juntará aos seus colegas no pódio.
            </p>

            <button 
              onClick={handleSurrender} 
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.2)', padding: '0.6rem 1.5rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', transition: '0.2s' }}
              className="hover-brightness"
            >
              Abandonar Batalha
            </button>
          </div>
        </div>
      );
    }

    if (session.status === 'question' || session.status === 'reveal') {
      const hasAnswered = me.currentAnswer !== null && me.currentAnswer !== undefined;
      const hpPercentage = (currentHp / maxHearts) * 100;
      const stressLevel = Math.max(0, (maxHearts - currentHp) / maxHearts);
      const sweatLevel = stressLevel >= 0.75 ? 1 : stressLevel >= 0.5 ? 0.7 : stressLevel >= 0.25 ? 0.4 : 0;

      let baseAnim: 'idle' | 'exhausted' | 'death-fall' = 'idle';
      let baseExp: 'normal' | 'serious' | 'sad' = 'normal';
      if (isEliminated) {
        baseAnim = 'death-fall';
        baseExp = 'sad';
      } else if (hpPercentage < 50) {
        baseAnim = 'exhausted';
        baseExp = hpPercentage < 25 ? 'sad' : 'serious';
      } else if (hpPercentage < 75) {
        baseAnim = 'idle';
        baseExp = 'serious';
      }
    const activeStudentAnim = (studentAnim === 'attack' || studentAnim === 'hurt') ? studentAnim : baseAnim;

    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        
        {/* Header com Consumíveis e Abandono */}
        <div style={{ padding: '0.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border-glass)', flexShrink: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>Desafio Ao Vivo</div>
            <button 
              onClick={handleSurrender} 
              style={{ background: 'transparent', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '0.2rem 0.8rem', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Abandonar Batalha
            </button>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', overflowX: 'auto', maxWidth: '300px', scrollbarWidth: 'thin' }}>
            {powerups.map((p, i) => (
              <button
                key={i}
                onClick={() => usePowerup(p)}
                disabled={hasAnswered || isEliminated}
                title={`Usar: ${p.itemTitle}`}
                style={{
                  position: 'relative', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: (hasAnswered || isEliminated) ? 'not-allowed' : 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (hasAnswered || isEliminated) ? 0.5 : 1, flexShrink: 0
                }}
              >
                {p.itemImageUrl ? (
                  <img src={p.itemImageUrl} alt={p.itemTitle} style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }} />
                ) : (
                  <Zap size={24} color="var(--gold-primary)" style={{ padding: '4px' }} />
                )}
                {p.count && p.count > 1 && (
                  <span style={{ position: 'absolute', top: -5, right: -5, background: 'var(--accent-red)', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px', zIndex: 2 }}>{p.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* BATTLE SCENE 3D */}
        <div style={{ flex: '1 1 50%', position: 'relative', background: 'var(--bg-primary)', overflow: 'hidden', borderBottom: '2px solid var(--border-glass)' } as any}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 0 }}>
            <div 
              className="battle-arena-bg-image" 
              style={{ 
                opacity: 0.7,
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
          {/* Ambient elements */}
          <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', opacity: 0.2, zIndex: 1 }}>
            <h2 style={{ fontSize: '3rem', margin: 0, textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>VS</h2>
          </div>

          <div ref={arenaRef} style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'space-between', padding: '0 10%', zIndex: 2, '--attack-dist': arenaWidth ? `${Math.max(50, arenaWidth - 200)}px` : '150px' } as any}>
            {/* Player (Left) */}
            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '1rem' }}>
              <div
                className={`${studentAnim === 'attack' ? 'teleport-player' : ''} ${isEliminated ? 'anim-death-fall' : ''}`}
                style={{
                  transform: studentAnim === 'hurt' ? 'translateX(-20px) rotate(-10deg)' : 'none',
                  transition: studentAnim === 'attack' ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  height: '220px',
                  transformOrigin: 'bottom center'
                }}
              >
                {me.avatarConfig && (
                  <div style={{ position: 'relative', display: 'inline-block', marginBottom: '-30px' }}>
                    <AvatarCharacter
                      config={me.avatarConfig}
                      equippedItems={me.equippedItems || []}
                      size={180}
                      interactive={false}
                      animation={activeStudentAnim as any}
                      expression={baseExp}
                      role="player"
                      hurt={studentAnim === 'hurt'}
                    />
                    {studentAnim === 'hurt' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(239, 68, 68, 0.5)', mixBlendMode: 'overlay', animation: 'pulse 0.5s infinite', borderRadius: '8px' }} />}
                    {!isEliminated && (
                      <>
                        <div className="bruise-overlay" style={{ '--damage-opacity': Math.max(0, Math.min(1, (maxHearts - currentHp) / maxHearts)) } as any} />
                        <div className="sweat-overlay" style={{ '--sweat-opacity': sweatLevel } as any}>
                          {sweatLevel >= 0.25 && <div className="sweat-drop" />}
                          {sweatLevel >= 0.5 && <div className="sweat-drop" />}
                          {sweatLevel >= 0.75 && <div className="sweat-drop" />}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '1rem', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px' }}>
                <span style={{ color: 'white', fontWeight: 'bold', marginRight: '0.5rem', fontSize: '0.9rem' }}>VOCÊ</span>
                {Array.from({ length: me.maxHp || userData?.hp || 5 }).map((_, i) => (
                  <Heart key={i} size={20} fill={i < currentHp ? "#ef4444" : "transparent"} color="#ef4444" />
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
                  height: '220px'
                }}
              >
                <div style={{ transform: 'scaleX(-1)', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  {quest?.monsterAvatarConfig ? (
                    <div style={{ position: 'relative', display: 'inline-block', marginBottom: '-30px' }}>
                      <AvatarCharacter
                        config={quest.monsterAvatarConfig}
                        size={180}
                        animation={monsterAnim === 'attack' ? 'attack' : (monsterAnim === 'hurt' ? 'hurt' : 'idle')}
                        interactive={false}
                        role="monster"
                        hurt={monsterAnim === 'hurt'}
                      />
                    </div>
                  ) : (
                    <CustomModelViewer
                      modelUrl={quest?.monsterModelUrl || 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb'}
                      role="monster"
                      size={190}
                      animation={monsterAnim}
                    />
                  )}
                </div>
                {monsterAnim === 'hurt' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(239, 68, 68, 0.5)', mixBlendMode: 'overlay', animation: 'pulse 0.5s infinite', borderRadius: '8px' }} />}
                
                {droppedCoins.length > 0 && (
                  <div style={{ position: 'absolute', inset: 0, zIndex: 100, pointerEvents: 'none' }}>
                    {droppedCoins.map(coin => (
                      <button
                        key={coin.id}
                        onClick={() => collectCoin(coin)}
                        title="Coletar moeda"
                        style={{
                          position: 'absolute',
                          left: `${coin.x}%`,
                          top: `${coin.y}%`,
                          pointerEvents: 'auto',
                          background: activeCoinModel ? 'transparent' : 'rgba(245, 158, 11, 0.2)',
                          border: activeCoinModel ? 'none' : '2px solid var(--gold-primary)',
                          borderRadius: '50%',
                          width: '30px',
                          height: '30px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          animation: 'coin-pop 0.4s ease-out',
                          zIndex: 100,
                          boxShadow: activeCoinModel ? 'none' : '0 0 12px rgba(245, 158, 11, 0.6)'
                        }}
                      >
                        {activeCoinModel ? (
                          activeCoinModel.open_url ? (
                            <img src={activeCoinModel.open_url} alt="Moeda" style={{ width: '26px', height: '26px', objectFit: 'contain', animation: 'coin-bounce 0.8s infinite' }} />
                          ) : (
                            <img src={activeCoinModel.url} alt="Moeda" style={{ width: '26px', height: '26px', objectFit: 'contain', animation: 'coin-bounce 0.8s infinite' }} />
                          )
                        ) : (
                          <Coins size={15} color="var(--gold-primary)" fill="rgba(245, 158, 11, 0.4)" />
                        )}
                      </button>
                    ))}
                    {coinPops.map(pop => (
                      <div
                        key={pop.id}
                        className="coin-value-pop"
                        style={{ left: `${pop.x}%`, top: `${pop.y}%` }}
                        onAnimationEnd={() => setCoinPops(prev => prev.filter(p => p.id !== pop.id))}
                      >
                        +{pop.value}
                      </div>
                    ))}
                  </div>
                )}
                
                {coinsToRescue > 0 && (
                  <div 
                    style={{
                      position: 'absolute',
                      top: '20%',
                      right: '15%',
                      background: 'rgba(245, 158, 11, 0.95)',
                      color: '#000',
                      padding: '0.4rem 0.9rem',
                      borderRadius: '16px',
                      fontWeight: 'bold',
                      fontSize: '0.95rem',
                      boxShadow: '0 0 20px rgba(245, 158, 11, 0.9)',
                      animation: 'popIn 0.3s ease-out',
                      zIndex: 100,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <Coins size={18} color="#000" />
                    +{coinsToRescue} Moedas no Chão! Pegue-as!
                  </div>
                )}
                
                {lostCoinsDisplay > 0 && (
                  <div 
                    style={{
                      position: 'absolute',
                      top: '30%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      zIndex: 100,
                      animation: 'slideUpFade 2s forwards',
                      color: 'var(--accent-red)',
                      fontWeight: 'bold',
                      fontSize: '1.5rem',
                      textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                    }}
                    onAnimationEnd={() => setLostCoinsDisplay(0)}
                  >
                    -{lostCoinsDisplay} Moedas!
                  </div>
                )}
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
          {isEliminated ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '1rem' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '2px solid var(--accent-red)', padding: '1.5rem 2rem', borderRadius: '20px', maxWidth: '500px', width: '100%', boxShadow: '0 0 25px rgba(239, 68, 68, 0.3)' }}>
                <Skull size={48} color="var(--accent-red)" style={{ margin: '0 auto 0.5rem' }} />
                <h2 style={{ color: 'var(--accent-red)', fontSize: '2rem', margin: '0 0 0.5rem', fontWeight: 'bold' }}>Você foi Eliminado!</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', margin: 0 }}>Acompanhe o restante do combate e o ranking dos seus colegas pelo telão principal.</p>
              </div>
            </div>
          ) : hasAnswered ? (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: me.isCorrect ? 'var(--accent-green)' : 'var(--accent-red)', marginBottom: '1rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                  {me.isCorrect ? 'RESPOSTA ENVIADA!' : 'RESPOSTA ENVIADA!'}
                </div>
                <Loader2 className="animate-spin" size={48} color="var(--gold-primary)" style={{ margin: '0 auto 1rem' }} />
                <h2 style={{ color: 'var(--text-secondary)' }}>Aguardando o tempo da rodada acabar...</h2>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '0.75rem', height: '100%', padding: '0.5rem', boxSizing: 'border-box' }}>
                {[0, 1, 2, 3].map((idx) => {
                  const isEliminatedOpt = eliminatedOptions.includes(idx);
                  return (
                    <button
                      key={idx}
                      onClick={() => !isEliminatedOpt && handleAnswerSubmit(idx)}
                      style={{
                        background: isEliminatedOpt ? 'rgba(0,0,0,0.5)' : OPTION_COLORS[idx],
                        border: isEliminatedOpt ? '1px solid var(--border-glass)' : 'none',
                        borderRadius: '16px',
                        color: isEliminatedOpt  ? 'rgba(255,255,255,0.2)'  : 'var(--text-primary)',
                        fontSize: 'clamp(2.5rem, 7vw, 4rem)',
                        fontWeight: 'bold',
                        cursor: isEliminatedOpt ? 'not-allowed' : 'pointer',
                        boxShadow: isEliminatedOpt ? 'none' : '0 6px 0 rgba(0,0,0,0.3)',
                        transition: 'transform 0.1s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '60px'
                      }}
                      onMouseDown={(e) => { if (!isEliminatedOpt) e.currentTarget.style.transform = 'translateY(4px)'; }}
                      onMouseUp={(e) => { if (!isEliminatedOpt) e.currentTarget.style.transform = 'none'; }}
                    >
                      {['A', 'B', 'C', 'D'][idx]}
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      </div>
    );
  }

  if (session.status === 'ranking') {
    const isCorrect = me.isCorrect;
    const currentHp = me.hp !== undefined ? me.hp : (userData?.hp || 5);
    const isEliminated = currentHp <= 0;

    if (isEliminated) {
      return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '2px solid var(--accent-red)', padding: '2.5rem', borderRadius: '24px', maxWidth: '600px', width: '100%', boxShadow: '0 0 30px rgba(239, 68, 68, 0.3)' }}>
            <Skull size={64} color="var(--accent-red)" style={{ margin: '0 auto 1rem' }} />
            <h1 style={{ color: 'var(--accent-red)', fontSize: '2.8rem', margin: '0 0 1rem' }}>Fora da Disputa</h1>
            <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)', margin: 0 }}>Olhe para o telão para acompanhar a pontuação e os sobreviventes.</p>
          </div>
        </div>
      );
    }

    let earnedXp = 0;
    if (isCorrect && quest) {
      const baseQuestXp = quest.baseXp || 0;
      const xpPerQuestion = Math.floor(baseQuestXp / (quest.questions?.length || 1));
      const xpMultiplier = 1 + (totalEquippedStats.xp / 100);
      earnedXp = Math.floor(xpPerQuestion * xpMultiplier);
    }
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        {isCorrect && (
           <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 10 }}>
              <div style={{ 
                color: 'var(--gold-primary)', 
                fontWeight: 'bold', 
                fontSize: '3rem', 
                textShadow: '0 4px 8px rgba(0,0,0,0.8)',
                animation: 'floatUpAndFade 2s ease-out forwards'
              }}>
                +{earnedXp} XP
              </div>
           </div>
        )}
        {!isCorrect && (
           <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 10 }}>
              <div style={{ 
                color: 'var(--accent-red)', 
                animation: 'floatUpAndFade 2s ease-out forwards',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Heart size={80} fill="var(--accent-red)" stroke="black" strokeWidth={2} style={{ clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)' }} />
                <Heart size={80} fill="var(--accent-red)" stroke="black" strokeWidth={2} style={{ clipPath: 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)', marginLeft: '-80px', transform: 'translate(10px, 10px) rotate(15deg)' }} />
              </div>
           </div>
        )}
        <h1 style={{ color: isCorrect ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: '4rem', textShadow: '0 4px 8px rgba(0,0,0,0.5)', textAlign: 'center' }}>
          {isCorrect ? 'Você Acertou!' : 'Você Errou!'}
        </h1>
        <p style={{ fontSize: '1.5rem', color: 'var(--text-secondary)', marginTop: '1rem', textAlign: 'center' }}>Olhe para o telão para ver o ranking provisório.</p>
      </div>
    );
  }

  if (session.status === 'finished') {
    if (me?.wonChest && !chestOpened) {
      return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
          <ChestReveal 
            onOpen={async () => {
              // Somente após o jogador abrir o baú, removemos a pendência
              try {
                const { data: sess } = await supabase.from('live_quests').select('players').eq('id', sessionId!).single();
                if (sess && sess.players && sess.players[userData!.uid]) {
                  delete sess.players[userData!.uid].wonChest;
                  await supabase.from('live_quests').update({ players: sess.players }).eq('id', sessionId!);
                }
              } catch(e) { console.error(e); }
              setChestOpened(true);
            }} 
            title={`Parabéns pelo ${me.wonChest.place}º Lugar!`} 
            subtitle="Abra o seu baú para resgatar os prêmios conquistados no pódio!"
            chestModelUrl={selectedChestModel?.url} 
            chestOpenUrl={selectedChestModel?.open_url} 
            rarity={selectedChestModel?.rarity} 
            chestScale={selectedChestModel?.chestScale} 
            chestZoom={selectedChestModel?.chestZoom}
            chestOffsetX={selectedChestModel?.chestOffsetX}
            chestOffsetY={selectedChestModel?.chestOffsetY}
            chestRotY={selectedChestModel?.chestRotY}
            chestOpenOffsetX={selectedChestModel?.chestOpenOffsetX}
            chestOpenOffsetY={selectedChestModel?.chestOpenOffsetY}
            chestSwapSides={selectedChestModel?.chestSwapSides}
            chestAudioUrl={selectedChestModel?.chestAudioUrl}
            chestAudioRate={selectedChestModel?.chestAudioRate}
            chestAudioStart={selectedChestModel?.chestAudioStart}
            chestAudioDuration={selectedChestModel?.chestAudioDuration}
          />
        </div>
      );
    }

    if (me?.wonChest && chestOpened) {
      return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', animation: 'epicZoom 0.5s ease-out', maxWidth: '600px', width: '100%' }}>
            <h2 style={{ fontSize: '2.5rem', color: 'var(--gold-primary)', marginBottom: '1.5rem', textShadow: '0 0 20px var(--gold-primary)' }}>Recompensas Resgatadas!</h2>
            
            {me.wonChest.coins > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid var(--gold-primary)', padding: '1rem 2rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                <Coins size={36} color="var(--gold-primary)" />
                <span style={{ fontSize: '1.8rem', color: 'white', fontWeight: 'bold' }}>+{me.wonChest.coins} Moedas</span>
              </div>
            )}

            {me.wonChest.items && me.wonChest.items.length > 0 && (
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
                {me.wonChest.items.map((item: any, i: number) => (
                  <div key={i} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '150px' }}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '8px', marginBottom: '0.5rem' }} />
                    ) : (
                      <Package size={60} color="var(--gold-primary)" style={{ marginBottom: '0.5rem' }} />
                    )}
                    <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.25rem', textAlign: 'center' }}>{item.title}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Qtd: {item.quantity || 1}</span>
                  </div>
                ))}
              </div>
            )}
            <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>Acompanhe o pódio na tela do professor!</p>
            <button 
              onClick={() => {
                if (userData?.uid) sessionCache.invalidate(CACHE_KEYS.questAttempts(userData.uid));
                navigate('/dashboard');
              }} 
              className="login-btn"
              style={{ marginTop: '1.5rem', padding: '0.8rem 2.5rem', background: 'var(--gold-primary)', color: 'var(--bg-primary)', fontSize: '1.2rem', borderRadius: '12px', fontWeight: 'bold' }}
            >
              Voltar ao Início
            </button>
          </div>
        </div>
      );
    }
    
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ color: 'var(--gold-primary)', fontSize: '3.5rem', textShadow: '0 4px 8px rgba(0,0,0,0.5)', margin: '0 0 1rem 0' }}>Missão Concluída!</h1>
        <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)', margin: '0 0 2rem 0' }}>Olhe para o telão para ver a celebração e o pódio final.</p>
        <button 
          onClick={() => {
            if (userData?.uid) sessionCache.invalidate(CACHE_KEYS.questAttempts(userData.uid));
            navigate('/dashboard');
          }} 
          className="login-btn"
          style={{ padding: '0.8rem 2.5rem', background: 'var(--gold-primary)', color: 'var(--bg-primary)', fontSize: '1.2rem', borderRadius: '12px', fontWeight: 'bold' }}
        >
          Voltar ao Início
        </button>
      </div>
    );
  }

  return null;
}
