import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
import { useDialog } from '../contexts/DialogContext';
import { calculateTotalStats } from '../lib/gacha';
import type { GameEffectType } from '../components/AdminStoreManager';

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
}


export default function LiveQuestStudent() {
  const { sessionId } = useParams();
  const { userData } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [quest, setQuest] = useState<QuestDef | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState('');
  const [powerups, setPowerups] = useState<UserItem[]>([]);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const { showAlert, showConfirm } = useDialog();
  const [chestOpened, setChestOpened] = useState(false);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [studentAnim, setStudentAnim] = useState<string>('idle');
  const [monsterAnim, setMonsterAnim] = useState<string>('idle');
  const [hasShield, setHasShield] = useState(false);
  
  const [economySettings, setEconomySettings] = useState<any>(null);
  const [coinsToRescue, setCoinsToRescue] = useState<number>(0);
  const [lostCoinsDisplay, setLostCoinsDisplay] = useState<number>(0);

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
        setQuest(qDoc as QuestDef);

        // Check Session
        const { data: sDoc } = await supabase.from('live_quests').select('*').eq('id', sessionId).maybeSingle();
        if (!sDoc) {
          setError('O professor ainda não abriu a sala para esta missão.');
          setLoading(false);
          return;
        }

        // Fetch Economy
        const { data: econSnap } = await supabase.from('system_collections').select('data').eq('type', 'economy').single();
        if (econSnap && econSnap.data) {
          setEconomySettings(econSnap.data);
        }

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
            (invSnap || []).forEach(d => {
              const item = { ...d.data, id: d.id } as UserItem;
              if (item.equipped) {
                equippedItems.push({ docId: d.id, ...item });
              }
              if (item.itemType === 'consumable' && item.usableInQuest && item.gameEffect !== 'add_time') {
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
                  // Já era, abandonou a partida
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
                    // Re-insert player with their current data
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

  // Polling fallback para garantir que o aluno receba atualizações (como limpeza de currentAnswer)
  // mesmo que o realtime do Supabase falhe ou caia.
  useEffect(() => {
    if (!sessionId || !userData) return;

    const interval = setInterval(async () => {
      const { data } = await supabase.from('live_quests').select('*').eq('id', sessionId).single();
      if (data) {
        setSession(prev => {
           if (!prev) return data as LiveSession;
           // O polling deve respeitar o index da pergunta caso esteja no meio de uma transição
           return {
             ...prev,
             status: data.status,
             currentQuestionIndex: data.currentQuestionIndex,
             activeQuestions: data.activeQuestions,
             players: data.players || {},
             monsterHp: data.monster_hp ?? data.monsterHp ?? prev.monsterHp,
             nobodyCorrect: data.nobodyCorrect
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
    const rankIndex = Math.max(0, RANKS.findIndex(r => r.name === userData.lastSeenRank));
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
          const dmg = 1;
          const rankObj = getRankForXp(userData?.xp || 0);
          const rankIndex = Math.max(1, RANKS.findIndex(r => r.name === rankObj.name));
          const maxCoins = rankIndex * dmg;
          const dropped = Math.floor(Math.random() * maxCoins) + 1;
          setCoinsToRescue(dropped);
        }
        // O XP não é mais creditado no banco aqui.
        // Ele fica apenas acumulado em sessionEarnedXp e será creditado
        // pelo admin apenas se o aluno sobreviver até o final da missão.
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
            }
            await supabase.from('users').update(userUpdate).eq('id', userData.uid);
          } catch(e) { console.error(e); }
        } else {
          if (hasShield) setHasShield(false);
          p.isProtected = true;
        }
      }

      await supabase.from('live_quests').update({ players: qData.players, monsterHp: newMonsterHp }).eq('id', sessionId);
      
      // Atualiza o estado local imediatamente para feedback instantâneo sem depender de realtime/polling
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

  if (session.status === 'question' || session.status === 'reveal') {
    const hasAnswered = me.currentAnswer !== null && me.currentAnswer !== undefined;

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
                disabled={hasAnswered || me.hp <= 0}
                title={`Usar: ${p.itemTitle}`}
                style={{
                  position: 'relative', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: (hasAnswered || me.hp <= 0) ? 'not-allowed' : 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (hasAnswered || me.hp <= 0) ? 0.5 : 1, flexShrink: 0
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
                {Array.from({ length: me.maxHp || userData?.hp || 5 }).map((_, i) => (
                  <Heart key={i} size={20} fill={i < (me.hp !== undefined ? me.hp : (userData?.hp || 5)) ? "#ef4444" : "transparent"} color="#ef4444" />
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
                
                {coinsToRescue > 0 && (
                  <div 
                    onClick={() => {
                      if (userData?.uid) {
                        const currentCoins = userData.coins || 0;
                        supabase.from('users').update({ coins: currentCoins + coinsToRescue }).eq('id', userData.uid).then();
                      }
                      setCoinsToRescue(0);
                    }}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      zIndex: 100,
                      animation: 'bounce 1s infinite',
                      cursor: 'pointer',
                      background: 'rgba(0,0,0,0.8)',
                      padding: '1rem',
                      borderRadius: '16px',
                      border: '2px solid var(--gold-primary)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 0 20px rgba(251, 191, 36, 0.5)'
                    }}
                  >
                    <Coins size={40} color="var(--gold-primary)" />
                    <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '1.2rem' }}>+{coinsToRescue}</span>
                    <span style={{ fontSize: '0.8rem', color: 'white' }}>Pegar!</span>
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
                {[0, 1, 2, 3].map((idx) => {
                  const isEliminated = eliminatedOptions.includes(idx);
                  return (
                    <button
                      key={idx}
                      onClick={() => !isEliminated && handleAnswerSubmit(idx)}
                      disabled={(me.hp !== undefined && me.hp <= 0) || isEliminated}
                      style={{
                        background: isEliminated ? 'rgba(0,0,0,0.5)' : OPTION_COLORS[idx],
                        border: isEliminated ? '1px solid var(--border-glass)' : 'none',
                        borderRadius: '16px',
                        color: isEliminated  ? 'rgba(255,255,255,0.2)'  : 'var(--text-primary)',
                        fontSize: '4rem',
                        fontWeight: 'bold',
                        cursor: ((me.hp !== undefined && me.hp <= 0) || isEliminated) ? 'not-allowed' : 'pointer',
                        boxShadow: isEliminated ? 'none' : '0 8px 0 rgba(0,0,0,0.3)',
                        transition: 'transform 0.1s',
                      }}
                      onMouseDown={(e) => { if ((me.hp === undefined || me.hp > 0) && !isEliminated) e.currentTarget.style.transform = 'translateY(4px)'; }}
                      onMouseUp={(e) => { if ((me.hp === undefined || me.hp > 0) && !isEliminated) e.currentTarget.style.transform = 'none'; }}
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
    if (me.wonChest && !chestOpened) {
      // Immediately clear wonChest from Firestore to prevent re-claiming on revisit
      supabase.from('live_quests').select('players').eq('id', sessionId!).single().then(({ data: sess }) => {
        if (sess && sess.players && sess.players[userData!.uid]) {
          delete sess.players[userData!.uid].wonChest;
          supabase.from('live_quests').update({ players: sess.players }).eq('id', sessionId!).then();
        }
      });

      return (
        <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
          {!chestOpened ? (
            <ChestReveal onOpen={async () => {
              // Remove wonChest from Firestore so re-entering the page doesn't show chest again
              try {
                const { data: sess } = await supabase.from('live_quests').select('players').eq('id', sessionId!).single();
                if (sess && sess.players && sess.players[userData!.uid]) {
                  delete sess.players[userData!.uid].wonChest;
                  await supabase.from('live_quests').update({ players: sess.players }).eq('id', sessionId!);
                }
              } catch(e) { console.error(e); }
              setChestOpened(true);
            }} title={`Parabéns pelo ${me.wonChest.place}º Lugar!`} />
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
