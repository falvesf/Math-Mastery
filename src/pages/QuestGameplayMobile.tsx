import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { supabase } from '../lib/supabase';
import { RANKS, getRankForXp } from '../lib/ranks';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import ArenaDebugPanel, { type ArenaDebugConfig, DEFAULT_ARENA_DEBUG } from '../components/ArenaDebugPanel';
import { fetchEconomySettings } from '../lib/economy';
import { ArrowLeft, Clock, Heart, ShieldAlert, Star, Swords, Shield, Zap, XCircle, Package, Coins } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import AvatarCharacter, { type EquippedItem } from '../components/AvatarCharacter';
import CustomModelViewer from '../components/CustomModelViewer';
import ChestReveal from '../components/ChestReveal';
import type { GameEffectType } from '../components/AdminStoreManager';
import type { QuestDef } from './AdminDashboard';
import { calculateTotalStats, rollItemAdds, fetchGlobalGachaConfig } from '../lib/gacha';
import { getSafeUrl, normalizeCombatCoinDrop } from '../lib/utils';
import { sessionCache, CACHE_KEYS } from '../lib/sessionCache';
import { fetchModel3DById, fetchActiveCoin } from '../lib/model3d';

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
  hpCooldownReductionMinutes?: number;
  buffDurationHours?: number;
}

export default function QuestGameplay() {
  const { questId } = useParams();
  const { userData, updateUserDataLocally } = useAuth();
  const { tenantId, isSuperAdmin } = useTenant();
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useDialog();

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
  const [playerEquippedItems, setPlayerEquippedItems] = useState<EquippedItem[]>([]);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [currentHearts, setCurrentHearts] = useState<number>(3);
  const [hasShield, setHasShield] = useState(false);
  
  const [battleMessage, setBattleMessage] = useState<string>('Prepare-se para a batalha!');
  const [chestRewards, setChestRewards] = useState<{coins: number, items: any[]}>({ coins: 0, items: [] });

  const totalEquippedStats = calculateTotalStats(playerEquippedItems, userData?.distributedStats);
  const xpMultiplier = 1 + (totalEquippedStats.xp / 100);
  const coinsMultiplier = 1 + (totalEquippedStats.coins / 100);

  const currentRankObj = getRankForXp(userData?.xp || 0, userData?.classId);
  const calculatedRankIndex = Math.max(0, RANKS.findIndex(r => r.name === currentRankObj.name));
  const calculatedMaxHearts = Math.max(3, 3 + Math.floor(calculatedRankIndex / 2)) + Math.floor(totalEquippedStats.vitality / 30);

  const [showChest, setShowChest] = useState(false);
  const [chestOpened, setChestOpened] = useState(false);
  const [selectedChestModel, setSelectedChestModel] = useState<any>(null);
  const [activeCoinModel, setActiveCoinModel] = useState<any>(null);
  const [criticalHits, setCriticalHits] = useState(0);
  const [playerBubble, setPlayerBubble] = useState<string>('');
  const [monsterBubble, setMonsterBubble] = useState<string>('');
  const [playerAnim, setPlayerAnim] = useState<string>('idle');
  const [monsterAnim, setMonsterAnim] = useState<string>('idle');
  
  // Feedback Visual (certo/errado)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [lastSelectedOption, setLastSelectedOption] = useState<number | null>(null);
  
  // Dano Crítico Fracionado (Vantagens para a próxima pergunta)
  const [nextQAdvantage, setNextQAdvantage] = useState<'eliminate-2' | 'eliminate-1' | 'bonus-crit' | null>(null);
  const [bonusCritActive, setBonusCritActive] = useState<boolean>(false);

  // Histórico de Respostas
  const studentAnswers = useRef<{ qIndex: number; text: string; isCorrect: boolean }[]>([]);

  // Fatores de estresse para o suor
  const [stressFactors, setStressFactors] = useState({
    lowTimeAnswers: 0,    // Respostas com pouco tempo
    wrongAnswers: 0,      // Respostas erradas
    hpLost: 0,            // Vida perdida (0-1)
  });

  // Cálculo do nível de estresse (0-1)
  const calculateStress = (): number => {
    if (!quest) return 0;
    
    const totalQuestions = quest.questions.length;
    const progress = (currentQIndex + 1) / totalQuestions;
    
    // Fator 1: Tempo baixo nas respostas (0-25%)
    const timePressure = Math.min(1, stressFactors.lowTimeAnswers / Math.max(1, totalQuestions * 0.3)) * 0.25;
    
    // Fator 2: Vida perdida (0-30%)
    const hpFactor = stressFactors.hpLost * 0.30;
    
    // Factor 3: Respostas erradas (0-25%)
    const wrongFactor = Math.min(1, stressFactors.wrongAnswers / Math.max(1, totalQuestions * 0.4)) * 0.25;
    
    // Fator 4: Progresso sem sucesso (0-20%)
    // Se passou da metade com menos de 50% de vida, aumenta estresse
    const progressStress = (progress > 0.5 && stressFactors.hpLost > 0.5) 
      ? Math.min(1, (progress - 0.5) * 2) * 0.20 
      : 0;
    
    const totalStress = timePressure + hpFactor + wrongFactor + progressStress;
    return Math.min(1, totalStress);
  };

  const stressLevel = calculateStress();

  // Economia Dinâmica
  const [economySettings, setEconomySettings] = useState<any>(null);
  const [, setCoinsToRescue] = useState<number | null>(null);
  const [droppedCoins, setDroppedCoins] = useState<{ id: number; x: number; y: number; value: number }[]>([]);
  const [coinPops, setCoinPops] = useState<{ id: number; x: number; y: number; value: number }[]>([]);
  const [fallingCoins, setFallingCoins] = useState<{ id: number; x: number; value: number }[]>([]);
  const [, setLostCoinsDisplay] = useState<number | null>(null);
  const alreadyCompletedRef = useRef(false);
  const combatCoinConfigRef = useRef<{ minCoins?: number; maxCoins?: number; minValue?: number; maxValue?: number }>({});

  // Escudos e Defesa
  const totalDefense = totalEquippedStats.defense;

  // Verificar se o jogador tem arma de ataque equipada
  const hasAttackWeapon = playerEquippedItems.some(item => 
    item.itemCategory === 'attack' || 
    (item.baseAttributeType === 'attack' && (item.baseAttributeValue || 0) > 0) ||
    item.avatarPart === 'rightHand' || 
    item.avatarPart === 'leftHand' || 
    item.avatarPart === 'hand' || 
    item.avatarPart === 'two_handed'
  );

  const calculatePenalty = (basePenalty: number) => {
    if (basePenalty <= 0) return 0;
    const absorption = Math.min(100, totalDefense * 2.5);
    return Math.floor(basePenalty * (1 - absorption / 100));
  };

  // Animate hearts dying - simple delay then update
  const drainHeartsAnimated = (newHearts: number, onComplete?: () => void) => {
    const heartsToLose = currentHearts - newHearts;
    if (heartsToLose <= 0) {
      setCurrentHearts(newHearts);
      if (onComplete) onComplete();
      return;
    }

    // Small delay for dramatic effect, then update
    setTimeout(() => {
      setCurrentHearts(newHearts);
      if (onComplete) onComplete();
    }, heartsToLose * 150); // 150ms per heart for stagger effect
  };

  const [deviceKey, setDeviceKey] = useState(window.innerWidth < 768 ? 'mobile' : 'desktop');

  const arenaRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameStateRef = useRef(gameState);
  const timerPausedRef = useRef(false);
  const [timerPaused, setTimerPaused] = useState(false);
  
  const [arenaDebug, setArenaDebug] = useState<ArenaDebugConfig>(() => {
    const saved = localStorage.getItem(`arenaDebugConfig_${window.innerWidth < 768 ? 'mobile' : 'desktop'}`);
    const sharedStr = localStorage.getItem('arenaDebugSharedToggles');
    const shared = sharedStr ? JSON.parse(sharedStr) : {};
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_ARENA_DEBUG, ...parsed, ...shared };
      } catch { return { ...DEFAULT_ARENA_DEBUG, ...shared }; }
    }
    return { ...DEFAULT_ARENA_DEBUG, ...shared };
  });
  
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const newKey = window.innerWidth < 768 ? 'mobile' : 'desktop';
      if (newKey !== deviceKey) {
        setDeviceKey(newKey);
        const docId = `arena_${newKey}`;
        const localKey = `arenaDebugConfig_${newKey}`;
        
        // Carregar do localStorage primeiro
        const localSaved = localStorage.getItem(localKey);
        const sharedStr = localStorage.getItem('arenaDebugSharedToggles');
        const shared = sharedStr ? JSON.parse(sharedStr) : {};

        if (localSaved) {
          try { setArenaDebug({ ...DEFAULT_ARENA_DEBUG, ...JSON.parse(localSaved), ...shared }); } catch {}
        }
        
        // Depois do Supabase
        supabase.from('system_collections').select('data').eq('collection_name', 'arena_debug').eq('doc_id', docId).single().then(({ data }) => {
          if (data?.data) {
            const dbData = data.data as Record<string, any>;
            const cleanData = Object.fromEntries(Object.entries(dbData).filter(([_, v]) => v !== undefined && v !== null));
            setArenaDebug(prev => ({ ...DEFAULT_ARENA_DEBUG, ...cleanData, ...shared }));
          }
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [deviceKey]);

  // Load arena debug config from Supabase on mount
  useEffect(() => {
    const loadArenaDebug = async () => {
      const { data } = await supabase.from('system_collections').select('data').eq('collection_name', 'arena_debug').eq('doc_id', `arena_${deviceKey}`).single();
      const sharedStr = localStorage.getItem('arenaDebugSharedToggles');
      const shared = sharedStr ? JSON.parse(sharedStr) : {};

      if (data?.data) {
        // Merge with defaults, filtering out undefined/null values from DB
        const dbData = data.data as Record<string, any>;
        const cleanData = Object.fromEntries(Object.entries(dbData).filter(([_, v]) => v !== undefined && v !== null));
        setArenaDebug(prev => ({ ...DEFAULT_ARENA_DEBUG, ...prev, ...cleanData, ...shared }));
      }
    };
    loadArenaDebug();
  }, [deviceKey]);

  // Save to localStorage on every change
  useEffect(() => {
    localStorage.setItem(`arenaDebugConfig_${deviceKey}`, JSON.stringify(arenaDebug));
    
    const SHARED_DEBUG_TOGGLES: (keyof ArenaDebugConfig)[] = [
      'showBoxes', 'showCoinArea', 'showPlayerCoinArea', 'showBubbleOrigins', 
      'playerBubbleAlwaysOn', 'monsterBubbleAlwaysOn', 
      'noInstantKill', 'adminImmortal', 'monsterImmortal', 'forceCoinLoss'
    ];
    const sharedToggles: Partial<ArenaDebugConfig> = {};
    SHARED_DEBUG_TOGGLES.forEach(k => {
      (sharedToggles as any)[k] = arenaDebug[k];
    });
    localStorage.setItem('arenaDebugSharedToggles', JSON.stringify(sharedToggles));
  }, [arenaDebug, deviceKey]);

  const handleSaveArenaDebug = async () => {
    const dataToSave = { ...arenaDebug };
    const SHARED_DEBUG_TOGGLES: (keyof ArenaDebugConfig)[] = [
      'showBoxes', 'showCoinArea', 'showPlayerCoinArea', 'showBubbleOrigins', 
      'playerBubbleAlwaysOn', 'monsterBubbleAlwaysOn', 
      'noInstantKill', 'adminImmortal', 'monsterImmortal', 'forceCoinLoss'
    ];
    SHARED_DEBUG_TOGGLES.forEach(k => {
      delete dataToSave[k];
    });

    const payload: any = {
      collection_name: 'arena_debug',
      doc_id: `arena_${deviceKey}`,
      data: dataToSave,
    };
    if (tenantId) payload.tenant_id = tenantId;
    
    // Tenta update primeiro, se não existir faz insert
    const { data: existing } = await supabase.from('system_collections').select('id').eq('collection_name', 'arena_debug').eq('doc_id', `arena_${deviceKey}`).limit(1);
    let error;
    if (existing && existing.length > 0) {
      const res = await supabase.from('system_collections').update({ data: dataToSave }).eq('collection_name', 'arena_debug').eq('doc_id', `arena_${deviceKey}`);
      error = res.error;
    } else {
      const res = await supabase.from('system_collections').insert(payload);
      error = res.error;
    }
    if (error) {
      console.error('Erro ao salvar arena debug:', error);
      alert('Erro ao salvar: ' + error.message);
    } else {
      alert('Configurações da arena salvas globalmente!');
    }
  };

  const testPlayerQuotes = ['Vamos lá!', 'Ataque!', 'Cuidado!', 'Não vai me pegar!', 'Hora de lutar!'];
  const testMonsterQuotes = ['Grrr!', 'Você não vai escapar!', 'Sinta meu poder!', 'Rugido!', 'Prepare-se!'];

  const handleTestPlayerBubble = () => {
    setPlayerBubble(testPlayerQuotes[Math.floor(Math.random() * testPlayerQuotes.length)]);
    setTimeout(() => setPlayerBubble(''), 15000);
  };

  const handleTestMonsterBubble = () => {
    setMonsterBubble(testMonsterQuotes[Math.floor(Math.random() * testMonsterQuotes.length)]);
    setTimeout(() => setMonsterBubble(''), 15000);
  };

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);



  useEffect(() => {
    if (battleMessage || playerBubble || monsterBubble) {
      const t = setTimeout(() => {
        if (!battleMessage.includes('FATALITY')) setBattleMessage('');
        setPlayerBubble('');
        setMonsterBubble('');
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [battleMessage, playerBubble, monsterBubble]);

  // Proteção contra F5/atualização durante a missão
  useEffect(() => {
    if (gameState !== 'playing') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Ao desmontar durante o jogo, registra a falha
      if (gameStateRef.current === 'playing' && questId && userData) {
        const isStudent = userData.role === 'student' || !!userData.studentViewActive;
        if (isStudent) {
          supabase.from('quest_attempts').insert({
            quest_id: questId,
            student_id: userData.uid,
            status: 'failed',
            data: { answers: studentAnswers.current, isStudyMode: isStudyMode, earned_xp: 0 }
          });
          supabase.from('users').update({ stunned_until: Date.now() + 10 * 60 * 1000 }).eq('id', userData.uid);
        }
      }
    };
  }, [gameState, questId, userData]);

  useEffect(() => {
    // Não re-executar se já estamos jogando ou em resultado
    if (gameState !== 'loading') return;

    const fetchQuest = async () => {
      try {
        if (!questId || !userData) return;
        
        const { data: snap } = await supabase.from('quests').select('*').eq('id', questId).single();
        if (!snap) {
          setErrorMessage('Missão não encontrada.');
          setGameState('result');
          return;
        }
        
        const qData = {
          ...snap,
          id: snap.id,
          coverImageUrl: snap.cover_image_url || snap.coverImageUrl,
          baseXp: snap.base_xp || snap.baseXp,
          allowRetries: snap.allow_retries !== undefined ? snap.allow_retries : snap.allowRetries,
          targetClasses: snap.target_classes || snap.targetClasses || [],
          chestConfig: snap.chestconfig || snap.chestConfig || null,
          combatCoinDrop: snap.combatcoindrop || snap.combatCoinDrop || null,
          monsterAvatarConfig: snap.monster_avatar_config || snap.monsterAvatarConfig || null,
          monsterModelUrl: snap.monster_model_url || snap.monsterModelUrl || null,
          monsterQuotes: snap.monster_quotes || snap.monsterQuotes || null,
          monsterDefeatQuotes: snap.monster_defeat_quotes || snap.monsterDefeatQuotes || null,
          liveChest1stPlace: snap.live_chest_1st_place || snap.liveChest1stPlace || null,
          liveChest2ndPlace: snap.live_chest_2nd_place || snap.liveChest2ndPlace || null,
          liveChest3rdPlace: snap.live_chest_3rd_place || snap.liveChest3rdPlace || null,
          monsterDrops: snap.monster_drops || snap.monsterDrops || null,
          battleBgUrl: snap.battle_bg_url || snap.battleBgUrl || null,
          podiumBgUrl: snap.podium_bg_url || snap.podiumBgUrl || null
        } as QuestDef;
        
        // Isolamento por escola: impedir que aluno de outra escola acesse a missão
        if (userData.role !== 'admin' && tenantId) {
          const questTenant = (qData as any).tenant_id;
          if (questTenant && questTenant !== tenantId) {
            setErrorMessage('Esta missão pertence a outra escola.');
            setGameState('result');
            return;
          }
        }

        if (!qData.active && userData.role !== 'admin') {
          setErrorMessage('Esta missão não está ativa no momento.');
          setGameState('result');
          return;
        }

        // Check if already completed
        const { data: attemptSnap } = await supabase.from('quest_attempts').select('status').eq('quest_id', questId).eq('student_id', userData.uid);
        
        let alreadyCompleted = false;
        let alreadyFailedHardcore = false;

        if (attemptSnap) {
          attemptSnap.forEach((doc: any) => {
            if (doc.status === 'completed') alreadyCompleted = true;
            if (doc.status === 'failed' && !qData.allowRetries) alreadyFailedHardcore = true;
          });
        }
        alreadyCompletedRef.current = alreadyCompleted;
        combatCoinConfigRef.current = normalizeCombatCoinDrop(qData.combatCoinDrop);

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

        // Economy Config (por escola)
        const econ = await fetchEconomySettings(tenantId);
        setEconomySettings(econ);

        // Apply shuffling if configured
        let processedQuestions = [...(qData.questions || [])];
        
        if (qData.shuffleQuestions) {
          processedQuestions.sort(() => Math.random() - 0.5);
        }

        // Apply random selection if configured (select N random questions)
        if (qData.randomQuestionSelection && qData.randomQuestionCount && qData.randomQuestionCount < processedQuestions.length) {
          // Shuffle first, then take the first N questions
          const shuffled = [...processedQuestions].sort(() => Math.random() - 0.5);
          processedQuestions = shuffled.slice(0, qData.randomQuestionCount);
        }

        if (qData.shuffleAnswers) {
          processedQuestions = processedQuestions.map(q => {
            const optionsWithCorrectness = (q.options || []).map((opt, idx) => ({
              ...opt,
              isOriginalCorrect: idx === q.correctIndex
            }));
            
            optionsWithCorrectness.sort(() => Math.random() - 0.5);
            
            const newCorrectIndex = optionsWithCorrectness.findIndex(o => o.isOriginalCorrect);
            
            return {
              ...q,
              options: optionsWithCorrectness.map(({ isOriginalCorrect, ...rest }) => rest),
              correctIndex: newCorrectIndex
            };
          });
        }
        
        qData.questions = processedQuestions;

        setQuest(qData);
        setCurrentXp(qData.baseXp);
        setGameState('intro');

        // Load selected chest model & active coin for this quest
        if (qData.chestConfig?.chestModelId) {
          const chestModel = await fetchModel3DById(qData.chestConfig.chestModelId, tenantId);
          setSelectedChestModel(chestModel);
        } else {
          setSelectedChestModel(null);
        }
        const coinModel = await fetchActiveCoin(tenantId);
        setActiveCoinModel(coinModel);

        // Fetch Powerups & Equipped Items
        if (userData?.uid) {
          const { data: pSnap } = await supabase.from('user_items').select('*').eq('student_id', userData.uid);
          const pLoaded: UserItem[] = [];
          const eLoaded: EquippedItem[] = [];
          
          if (pSnap) {
            // Collect itemIds that need modelTransforms fallback from store_items
            const missingTransformIds: string[] = [];

            pSnap.forEach((d: any) => {
              const data = d.data;
              if (!data) return;

              if (data.itemType === 'consumable' && data.usableInQuest) {
                pLoaded.push({ ...data, id: d.id, equipped: d.equipped });
              }
              if (d.equipped) {
                let parsedAdds: any[] = [];
                if (data.adds) {
                  try { parsedAdds = typeof data.adds === 'string' ? JSON.parse(data.adds) : data.adds; } catch(e){}
                }
                const eqItem: EquippedItem = { 
                  docId: d.id,
                  itemId: d.item_id,
                  imageUrl: data.itemImageUrl || data.imageUrl || '', 
                  avatarPart: data.avatarPart as any,
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
                };
                eLoaded.push(eqItem);

                if (!data.modelTransforms && d.item_id) {
                  missingTransformIds.push(d.item_id);
                }
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
                eLoaded.forEach(eq => {
                  if (!eq.modelTransforms && eq.itemId && storeMap.has(eq.itemId)) {
                    eq.modelTransforms = storeMap.get(eq.itemId);
                  }
                });
              }
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
          
          setPowerups(Array.from(groupedMap.values()));
          setPlayerEquippedItems(eLoaded);
        }
      } catch (err: any) {
        console.error("Error fetching quest:", err);
        setErrorMessage("Erro ao carregar a missão: " + err.message);
        setGameState('result');
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
          if (timerPausedRef.current) return prev;
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

  const getMonsterSpecialChance = () => {
    if (!quest) return 0;
    const itemsConfigured = quest.chestConfig?.itemIds?.filter(id => id.trim() !== '').length || 0;
    
    if (itemsConfigured === 0) {
      return 2.5;
    }
    
    const dropChance = quest.chestConfig?.dropChance ?? 100;
    return dropChance / itemsConfigured;
  };

  const updateUserHearts = async (newHearts: number) => {
    if (!userData?.uid) return;
    const maxHearts = calculatedMaxHearts;
    const updates: any = { hp: newHearts };
    const currentHp = userData.hp !== undefined ? userData.hp : maxHearts;
    if (currentHp >= maxHearts && newHearts < maxHearts) {
      updates.hp_recovery_start_timestamp = Date.now();
    } else if (newHearts >= maxHearts) {
      updates.hp_recovery_start_timestamp = null;
    }
    
    userData.hp = newHearts;
    if (updates.hp_recovery_start_timestamp !== undefined) {
      userData.hpRecoveryStartTimestamp = updates.hp_recovery_start_timestamp;
    }
    
    updateUserDataLocally({ 
      hp: newHearts, 
      hpRecoveryStartTimestamp: updates.hp_recovery_start_timestamp !== undefined 
        ? updates.hp_recovery_start_timestamp 
        : userData.hpRecoveryStartTimestamp 
    });

    await supabase.from('users').update(updates).eq('id', userData.uid);
  };

  const startGame = async () => {
    // STAFF (admin/teacher/coordinator): sempre inicia com o HP máximo da patente
    const isStaffUser = userData?.role === 'admin' || userData?.role === 'teacher' || userData?.role === 'coordinator';
    const initialHearts = isStaffUser
      ? calculatedMaxHearts
      : Math.min(userData?.hp ?? calculatedMaxHearts, calculatedMaxHearts);
    setCurrentHearts(initialHearts);
    if ((userData?.role === 'student' || userData?.studentViewActive) && initialHearts < 1 && !isStudyMode) {
      await showAlert("Você precisa de pelo menos 1 coração (vida) para iniciar!");
      setGameState('result');
      return;
    }
    
    const chance = getMonsterSpecialChance();
    const isSurpriseAttack = (userData?.role === 'student' || !!userData?.studentViewActive) && !isStudyMode && (Math.random() * 100 < chance);

    if (isSurpriseAttack) {
      let newHearts = Math.max(0, initialHearts - 1);
      // Debug: evitar 1-hit kill
      if (((userData?.role === 'admin' || isSuperAdmin) && arenaDebug.noInstantKill) && newHearts === 0) newHearts = 1;
      // Debug: admin imortal
      if (arenaDebug.adminImmortal && (userData?.role === 'admin' || isSuperAdmin)) newHearts = initialHearts;
      drainHeartsAnimated(newHearts);
      setGameState('playing');
      setCurrentQIndex(0);
      setEliminatedOptions([]);
      setHasShield(false);
      
      if (newHearts === 0) {
        setBattleMessage('ATAQUE SURPRESA LETAL! O monstro te emboscou e você não resistiu!');
        // Drenar corações após a animação de queda
        triggerFatality(false, newHearts);
      } else {
        if (userData?.uid) {
            updateUserHearts(newHearts);
        }
        setBattleMessage('ATAQUE SURPRESA! O monstro foi mais rápido e atacou primeiro!');
        setMonsterAnim('attack');
        setTimeout(() => setPlayerAnim('hurt'), 500);
        setTimeout(() => { setPlayerAnim('idle'); setMonsterAnim('idle'); }, 1500);
      }
    } else {
      setGameState('playing');
      setCurrentQIndex(0);
      setEliminatedOptions([]);
      setHasShield(false);
      
      const startMsgs = [
        "PREPARE-SE!",
        "LUTE PELA SUA VIDA!",
        `DERROTE ${quest?.monsterName ? quest.monsterName.toUpperCase() : 'O MONSTRO'} PARA AVANÇAR!`
      ];
      setBattleMessage(startMsgs[Math.floor(Math.random() * startMsgs.length)]);
    }
  };

  const getRoundMessage = (nextQIndex: number, currentLife: number) => {
    if (!quest) return '';
    const totalQ = quest.questions.length;
    const remainingQ = totalQ - nextQIndex;
    
    if (currentLife === 1 && remainingQ === 1) {
      return "AGORA É UMA QUESTÃO DE VIDA OU MORTE. É TUDO OU NADA!";
    }
    
    const playerHpPct = (currentLife / maxHearts) * 100;
    const monsterHpPct = (remainingQ / totalQ) * 100;
    if (Math.abs(playerHpPct - monsterHpPct) < 0.1) {
      return "O DESAFIO ESTÁ EMPATADO";
    }
    
    const roundNumber = nextQIndex + 1;
    if (roundNumber === totalQ) {
      return "ROUND FINAL";
    }
    return `ROUND ${roundNumber}`;
  };

/*
  const usePowerup = async (item: UserItem) => {
    if (feedback) return; // don't use during transition
    if (item.gameEffect === 'extra_life' && hasShield) {
      await showAlert('Você já tem um Escudo ativo!');
      return;
    }
    if (item.gameEffect === 'none') {
      await showAlert(`Você ativou o item "${item.itemTitle}"! Mostre esta mensagem para o seu professor para receber a vantagem prometida.`);
    } else if (item.gameEffect === 'remove_wrong') {
      const q = quest!.questions[currentQIndex];
      const wrongIndices = q.options
        .map((_, i) => i)
        .filter(i => i !== q.correctIndex && !eliminatedOptions.includes(i));
      
      if (wrongIndices.length === 0) {
        await showAlert('Não há mais opções erradas para eliminar!');
        return;
      }
      const toEliminate = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
      setEliminatedOptions([...eliminatedOptions, toEliminate]);
    } else if (item.gameEffect === 'add_time') {
      setTimeLeft(prev => prev + 30);
    } else if (item.gameEffect === 'extra_life') {
      setHasShield(true);
    }

    // Consume the item locally
    setPowerups(powerups.filter(p => p.id !== item.id));
    
    // Consume in DB only if not in study mode
    if (!isStudyMode) {
      await supabase.from('user_items').delete().eq('id', item.id);
    }
  };
*/

  const triggerFatality = (isPlayerWinning: boolean, defeatHearts?: number) => {
    // Se não tem arma, só animações simples (sem explosão, corte)
    const deaths = hasAttackWeapon 
      ? ['death-fall', 'death-evaporate', 'death-slice', 'death-explode']
      : ['death-fall', 'death-evaporate'];
    const fatality = deaths[Math.floor(Math.random() * deaths.length)];
    
    let msg = '';
    if (hasAttackWeapon) {
      if (fatality === 'death-explode') msg = 'Agora EXPLODA!!!';
      else if (fatality === 'death-slice') msg = 'Seja derrotado pela minha lâmina!';
      else if (fatality === 'death-evaporate') msg = 'Vou te pulverizar!';
      else msg = 'Caia perante mim!';
    } else {
      if (fatality === 'death-evaporate') msg = 'Desapareça!';
      else msg = 'Caia perante mim!';
    }
    
    const getVictoryMessage = () => {
      const playerHpPercentage = (currentHearts / maxHearts) * 100;
      const playerName = userData?.name || 'O Herói';
      if (playerHpPercentage === 100) return 'O Desafio foi concluído de forma épica!';
      if (playerHpPercentage >= 80) return 'Esse Desafio foi fácil!';
      if (playerHpPercentage >= 50) return `${playerName} foi melhor e venceu!`;
      if (playerHpPercentage >= 25) return 'Esse desafio teve uma certa disputa.';
      return 'Esse desafio não foi nada fácil.';
    };

    const getDefeatMessage = () => {
      const monsterName = quest?.monsterName || 'O monstro';
      const msgs = [
        `O/A ${monsterName} levou a melhor!`,
        `Você não foi páreo para ${monsterName}.`,
        'Você falhou neste desafio.'
      ];
      return msgs[Math.floor(Math.random() * msgs.length)];
    };
    
    if (isPlayerWinning) {
      setPlayerAnim('idle');
      setPlayerBubble('Eu venci!');
      
      let monsterDefeatQuote = 'Argh!!!';
      if (quest?.monsterDefeatQuotes) {
        const quotes = quest.monsterDefeatQuotes.split(';').map(s => s.trim()).filter(s => s);
        if (quotes.length > 0) monsterDefeatQuote = quotes[Math.floor(Math.random() * quotes.length)];
      }

      setTimeout(() => {
        // Golpe final: usa animação fatal que mantém o player perto do monstro,
        // independente de ter arma ou não (evita reset para a posição inicial)
        setPlayerAnim(hasAttackWeapon ? 'attack-fatal-slow' : 'attack-fatal');
        setPlayerBubble(msg);
        setBattleMessage(hasAttackWeapon ? 'Câmera lenta ativada! Golpe final épico!' : 'Golpe final!');
        
        // Espera para o monstro sentir o golpe
        const impactDelay = hasAttackWeapon ? 1125 : 600;
        setTimeout(() => setMonsterAnim('hurt'), impactDelay);
        
        setTimeout(() => {
          setMonsterAnim(fatality);
          setMonsterBubble(monsterDefeatQuote);
          setBattleMessage(getVictoryMessage());
          
          // Entra em idle-victory (apreensão) e depois roda a animação de vitória
          setPlayerAnim('idle-victory' as any);
          setPlayerBubble('');
          
          setTimeout(() => {
             const hpPct = currentHearts / maxHearts;
             let vicAnim: any = 'victory-hard';
             if (hpPct === 1) vicAnim = 'victory-easy';
             else if (hpPct >= 0.5) vicAnim = 'victory-mid';
             
             setPlayerAnim(`${vicAnim}_${fatality}` as any);
             
             // Espera 8.5 segundos (4.5 de suspense + 4 de comemoração) para abrir a recompensa
             setTimeout(() => finishGame(true, currentXp), 8500);
          }, 100); // pequeno delay para limpar a bubble e aplicar idle-victory
        }, 2500);
      }, 3000);
    } else {
      setMonsterAnim('idle');
      setMonsterBubble('Você é fraco!');
      
      const playerDefeatQuotes = ['NÃO!!!', 'AHHH!', 'ESSA NÃO!!!'];
      const playerDefeatQuote = playerDefeatQuotes[Math.floor(Math.random() * playerDefeatQuotes.length)];

      setTimeout(() => {
        setMonsterAnim('attack-fatal-slow');
        setMonsterBubble(msg);
        setBattleMessage('O monstro está preparando um ataque letal!');
        
        // Espera 1.125s para o jogador sentir o golpe
        setTimeout(() => setPlayerAnim('hurt'), 1125);
        
        setTimeout(() => {
          setPlayerAnim('death-fall');
          setPlayerBubble(playerDefeatQuote);
          const gameOverMsg = isStudyMode 
            ? 'Fim de Jogo (Modo Estudo). Suas vidas reais estão a salvo, mas a simulação terminou!' 
            : getDefeatMessage();
          setBattleMessage(gameOverMsg);
          
          // Drenar corações APÓS o personagem cair, com delay para efeito dramático
          if (defeatHearts !== undefined && defeatHearts !== null) {
            setTimeout(() => {
              drainHeartsAnimated(defeatHearts, () => {
                if ((userData?.role === 'student' || !!userData?.studentViewActive) && !isStudyMode) {
                  updateUserHearts(defeatHearts);
                }
              });
            }, 800); // Delay para sincronizar com a queda
          }
          
          setTimeout(() => finishGame(false, 0, gameOverMsg), 3500);
        }, 2500);
      }, 3000);
    }
  };

  const playerQuotesByHp = {
    hp100_80: [
      "Lá vou eu!",
      "Segura essa!",
      "Eu sou invencível!",
      "Você não pode comigo!",
      "Não vai chorar, heim!"
    ],
    hp79_50: [
      "Você luta bem, mas eu vou vencer!",
      "Eu estou em vantagem.",
      "A vitória será minha!",
      "Não vou perdoar esse ataque!"
    ],
    hp49_25: [
      "Você é um adversário digno, mas eu sou melhor!",
      "Ahhh!!!",
      "Toma essa!",
      "Você não vai me vencer!"
    ],
    hp24_0: [
      "Eu ainda não desisti!",
      "Arghhhhh!!",
      "Eu vou conseguir!",
      "Nada vai me desanimar.",
      "Você é um adversário formidável!"
    ]
  };

  // Falas baseadas no nível de estresse da luta
  const playerQuotesByStress = {
    easy: [
      "Essa foi fácil!",
      "Não deu nem para o começo!",
      "Muito simples!",
      "Próximo!",
      "Sem esforço!"
    ],
    tense: [
      "Deu para suar um pouco!",
      "Foi uma boa luta!",
      "Quase complicou!",
      "Essa foi acirrada!",
      "Boa tentativa!"
    ],
    epic: [
      "Essa foi por pouco!",
      "Não foi fácil, mas venci!",
      "Ufa! Consegui!",
      "Por um triz!",
      "Que luta intensa!"
    ]
  };

  const getDynamicQuote = (hpPercentage: number, source: 'player' | 'monster') => {
    // 25% chance to speak
    if (Math.random() > 0.25) return null;

    let quotesArray: string[] = [];
    
    if (source === 'player') {
      // 40% de chance de usar fala baseada em estresse, 60% baseada em HP
      if (stressLevel >= 0.5 && Math.random() < 0.4) {
        // Luta épica ou tensa
        quotesArray = stressLevel >= 0.75 
          ? playerQuotesByStress.epic 
          : playerQuotesByStress.tense;
      } else if (stressLevel < 0.25 && Math.random() < 0.3) {
        // Luta fácil
        quotesArray = playerQuotesByStress.easy;
      } else {
        // Fallback para falas baseadas em HP
        if (hpPercentage >= 80) quotesArray = playerQuotesByHp.hp100_80;
        else if (hpPercentage >= 50) quotesArray = playerQuotesByHp.hp79_50;
        else if (hpPercentage >= 25) quotesArray = playerQuotesByHp.hp49_25;
        else quotesArray = playerQuotesByHp.hp24_0;
      }
    } else {
      const custom = quest?.monsterQuotes;
      let rawQuotes = '';
      if (hpPercentage >= 80) rawQuotes = custom?.hp100_80 || '';
      else if (hpPercentage >= 50) rawQuotes = custom?.hp79_50 || '';
      else if (hpPercentage >= 25) rawQuotes = custom?.hp49_25 || '';
      else rawQuotes = custom?.hp24_0 || '';

      if (rawQuotes.trim()) {
        quotesArray = rawQuotes.split(';').map(s => s.trim()).filter(s => s);
      } else {
        quotesArray = ["Grrrr!", "Roar!!!"];
      }
    }

    if (quotesArray.length === 0) return null;
    return quotesArray[Math.floor(Math.random() * quotesArray.length)];
  };

  const handleAnswer = async (optIndex: number) => {
    if (!quest) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const q = quest.questions[currentQIndex];
    const isTimeout = optIndex === -1;
    const isCorrect = !isTimeout && optIndex === q.correctIndex;
    
    // Save answer
    studentAnswers.current.push({
      qIndex: currentQIndex,
      text: isTimeout ? '(Tempo Esgotado)' : q.options[optIndex].text,
      isCorrect
    });

    // Rastrear fatores de estresse
    const timeRatio = timeLeft / q.timeLimit;
    if (timeRatio < 0.3) {
      setStressFactors(prev => ({ ...prev, lowTimeAnswers: prev.lowTimeAnswers + 1 }));
    }
    if (!isCorrect) {
      setStressFactors(prev => ({ ...prev, wrongAnswers: prev.wrongAnswers + 1 }));
    }

    setLastSelectedOption(isTimeout ? -1 : optIndex);

    if (isCorrect) {
      setFeedback('correct');
      
      const timeRatio = timeLeft / quest.questions[currentQIndex].timeLimit;
      // Se a vantagem de bônus crítico estiver ativa, dobramos a chance
      const baseCritChance = timeRatio > 0.5 ? 0.02 : 0.0025;
      const critChance = bonusCritActive ? baseCritChance * 2.5 : baseCritChance;
      
      const isCritical = Math.random() < critChance;
      
      if (isCritical) {
        setCriticalHits(prev => prev + 1);
        
        // Sorteia a vantagem fracionada
        const fractions = ['1/4', '1/3', '1/2'];
        const fraction = fractions[Math.floor(Math.random() * fractions.length)];
        
        if (fraction === '1/4') {
          setNextQAdvantage('eliminate-2');
          setBattleMessage('DANO CRÍTICO (1/4)! 2 alternativas falsas cairão na próxima!');
        } else if (fraction === '1/3') {
          setNextQAdvantage('eliminate-1');
          setBattleMessage('DANO CRÍTICO (1/3)! 1 alternativa falsa cairá na próxima!');
        } else {
          setNextQAdvantage('bonus-crit');
          setBattleMessage('DANO CRÍTICO (1/2)! Mais chance de crítico na próxima!');
        }
      }

      const playerHpPercentage = (currentHearts / maxHearts) * 100;
      const quote = getDynamicQuote(playerHpPercentage, 'player');
      if (quote && !isCritical) setPlayerBubble(quote);

      const nextQExists = currentQIndex < quest.questions.length - 1;

      if (!nextQExists) {
        // Debug: monstro imortal - não finaliza, volta ao início
        if ((userData?.role === 'admin' || isSuperAdmin) && arenaDebug.monsterImmortal) {
          setCurrentQIndex(0);
          setFeedback(null);
          setLastSelectedOption(null);
          setBattleMessage('O monstro regenerou! Continue lutando!');
          setMonsterAnim('idle');
          setPlayerAnim('idle');
        } else {
          triggerFatality(true);
        }
      } else {
        setPlayerAnim('attack');
        setTimeout(() => { setMonsterAnim('hurt'); dropCoins(); }, 500);
        setTimeout(() => { setPlayerAnim('idle'); setMonsterAnim('idle'); }, 1500);
        setTimeout(() => {
          setFeedback(null);
          setLastSelectedOption(null);
          if (!isCritical) setBattleMessage(getRoundMessage(currentQIndex + 1, currentHearts));
          nextQuestion();
        }, 2000);
      }
    } else {
      setFeedback('wrong');
      
      const chance = getMonsterSpecialChance();
      const isMonsterCrit = (userData?.role === 'student' || !!userData?.studentViewActive) && !isStudyMode && (Math.random() * 100 < chance);
      
      // Hardcore Mode: errou, perdeu todos os corações
      const isHardcore = !quest.allowRetries;
      let damage = isHardcore ? currentHearts : (isMonsterCrit ? 2 : 1);
      // Debug: admin imortal
      if (arenaDebug.adminImmortal && (userData?.role === 'admin' || isSuperAdmin)) damage = 0;
      // Debug: evitar 1-hit kill - nunca deixa morrer de uma vez
      if (((userData?.role === 'admin' || isSuperAdmin) && arenaDebug.noInstantKill) && damage >= currentHearts) damage = Math.max(0, currentHearts - 1);
      
      let newHearts = Math.max(0, currentHearts - damage);
      // Debug: se admin imortal, nunca é fatal
      // Debug: se noInstantKill, nunca é fatal se ainda tem corações
      const isFatalForPlayer = !hasShield && (arenaDebug.adminImmortal && (userData?.role === 'admin' || isSuperAdmin) ? false : (((userData?.role === 'admin' || isSuperAdmin) && arenaDebug.noInstantKill) ? newHearts === 0 : (newHearts === 0 || isHardcore)));

      const shouldLoseCoins = economySettings?.coinsLostInCombat || arenaDebug.forceCoinLoss;
      if (shouldLoseCoins && !isStudyMode && !hasShield) {
        const currentCoins = userData?.coins || 0;
        if (currentCoins > 0) {
          const rankObj = getRankForXp(userData?.xp || 0);
          const rankIndex = Math.max(1, RANKS.findIndex(r => r.name === rankObj.name));
          const monsterHpPercentage = quest.questions.length > 0 ? ((quest.questions.length - currentQIndex) / quest.questions.length) * 100 : 100;
          const hpMultiplier = Math.max(1, Math.ceil(monsterHpPercentage / 10));
          const maxLost = rankIndex * hpMultiplier;
          const lost = Math.min(currentCoins, Math.floor(Math.random() * maxLost) + 1);
          
          setLostCoinsDisplay(lost);
          
          // Moedas caindo na área configurável do jogador
          const newFalling = Array.from({ length: Math.min(lost, 6) }).map((_, i) => ({
            id: Date.now() + i,
            x: (arenaDebug.playerCoinAreaX || 10) + Math.random() * (arenaDebug.playerCoinAreaW || 40),
            value: Math.ceil(lost / Math.min(lost, 6))
          }));
          setFallingCoins(prev => [...prev, ...newFalling]);
          setTimeout(() => {
            setFallingCoins(prev => prev.filter(c => !newFalling.find(nc => nc.id === c.id)));
          }, 2500);

          if (userData?.uid) {
            const newCoins = Math.max(0, currentCoins - lost);
            supabase.from('users').update({ coins: newCoins }).eq('id', userData.uid).then(({error}) => { if(error) console.error(error); });
            updateUserDataLocally({ coins: newCoins });
          }
        } else if ((userData?.role === 'admin' || isSuperAdmin) && arenaDebug.forceCoinLoss) {
          // Debug: mostrar feedback mesmo sem moedas
          setLostCoinsDisplay(0);
          setBattleMessage('Sem moedas para perder!');
        }
      }

      if (isFatalForPlayer) {
        // NÃO drenar corações ainda - esperar a animação de queda
        if (isMonsterCrit) {
          setBattleMessage('DANO CRÍTICO LETAL! O monstro te aniquilou!');
        }
        // Inicia a animação de morte - corações serão drenados APÓS o personagem cair
        triggerFatality(false, newHearts);
        return;
      }
      
      if (hasShield) {
        setPlayerBubble("O escudo aguentou!");
      } else {
        const remainingQuestions = quest.questions.length - currentQIndex;
        const monsterHpPercentage = (remainingQuestions / quest.questions.length) * 100;
        const quote = getDynamicQuote(monsterHpPercentage, 'monster');
        if (quote) setMonsterBubble(quote);
      }
      setMonsterAnim('attack');
      setTimeout(() => setPlayerAnim('hurt'), 500);
      setTimeout(() => { setPlayerAnim('idle'); setMonsterAnim('idle'); }, 1500);
      
      if (hasShield) {
        setHasShield(false);
        setEliminatedOptions([...eliminatedOptions, optIndex]); // eliminate the one they just clicked
        setTimeout(() => {
          setFeedback(null);
          setLastSelectedOption(null);
          if (isMonsterCrit) {
            setBattleMessage('DANO CRÍTICO DO INIMIGO! Sorte que seu escudo segurou o impacto!');
          } else {
            setBattleMessage('Seu escudo absorveu o dano do monstro! Tente novamente!');
          }
        }, 2000);
        return;
      }
      
      drainHeartsAnimated(newHearts, () => {
        if ((userData?.role === 'student' || !!userData?.studentViewActive) && !isStudyMode) {
          updateUserHearts(newHearts);
        }
      });
      
      // Atualizar fator de estresse baseado na vida perdida
      const hpLostRatio = 1 - (newHearts / maxHearts);
      setStressFactors(prev => ({ ...prev, hpLost: hpLostRatio }));
      
      // Vidas Extras: Deduct penalty but don't move to next question
      const actualPenalty = calculatePenalty(quest.xpPenaltyPerRetry);
      const newXp = Math.max(0, currentXp - actualPenalty);
      setCurrentXp(newXp);
      setTimeout(() => {
        setFeedback(null);
        setLastSelectedOption(null);
        if (isMonsterCrit) {
          setBattleMessage('DANO CRÍTICO DO INIMIGO! Você perdeu 2 corações!');
        } else {
          setBattleMessage(actualPenalty < quest.xpPenaltyPerRetry 
            ? 'Seu escudo absorveu parte do dano! Respire fundo e tente novamente!' 
            : 'Respire fundo e tente novamente!');
        }
        // O aluno tenta novamente a mesma pergunta
      }, 1000);
    }
  };

  const nextQuestion = () => {
    if (!quest) return;
    
    // Processa a Vantagem antes de avançar
    const nextIndex = currentQIndex + 1;
    let newEliminated: number[] = [];
    let isBonusCrit = false;
    
    if (nextIndex < quest.questions.length) {
      const nextQ = quest.questions[nextIndex];
      const correctIdx = nextQ.correctIndex;
      const wrongOptionsCount = nextQ.options.length - 1;
      
      // Limita eliminações para não resolver a questão automaticamente se houver poucas opções
      let toEliminateCount = 0;
      if (nextQAdvantage === 'eliminate-2') {
        toEliminateCount = Math.min(2, wrongOptionsCount - 1);
      } else if (nextQAdvantage === 'eliminate-1') {
        toEliminateCount = Math.min(1, wrongOptionsCount - 1);
      } else if (nextQAdvantage === 'bonus-crit') {
        isBonusCrit = true;
      }
      
      if (toEliminateCount > 0) {
        const availableWrongIdxs = nextQ.options
          .map((_, i) => (i !== correctIdx ? i : -1))
          .filter(i => i !== -1);
        
        // Embaralha e pega a quantidade exata
        const shuffled = availableWrongIdxs.sort(() => 0.5 - Math.random());
        newEliminated = shuffled.slice(0, toEliminateCount);
      }
    }
    
    setNextQAdvantage(null);
    setBonusCritActive(isBonusCrit);
    setEliminatedOptions(newEliminated);

    if (currentQIndex < quest.questions.length - 1) {
      setCurrentQIndex(nextIndex);
    } else {
      finishGame(true, currentXp);
    }
  };

  const finishGame = async (isWin: boolean, finalXp: number, customMessage?: string) => {
    setWon(isWin);
    setGameState('result');
    if (customMessage) setErrorMessage(customMessage);
    const isAbandon = customMessage?.includes('abandonou');

    const isStudent = userData?.role === 'student' || !!userData?.studentViewActive;
    const isEligibleForXP = isStudent && !isStudyMode;
    const isEligibleForChest = isStudent && !alreadyCompletedRef.current; // Baú só na 1ª conclusão
    
    setSaving(true);
    
    let actualXpGained = isEligibleForXP ? Math.floor(finalXp * xpMultiplier) : 0;
    let earnedCoins = Math.floor(actualXpGained * coinsMultiplier);
    const finalRewards = { coins: 0, items: [] as any[] };
    const globalGachaConfig = await fetchGlobalGachaConfig();

    if (isEligibleForChest) {
      if (isWin && quest?.chestConfig?.maxCoins && quest.chestConfig.maxCoins > 0) {
        const totalAttack = playerEquippedItems.reduce((acc, item) => item.baseAttributeType === 'attack' ? acc + (item.baseAttributeValue || 0) : acc, 0);
        const chestBonus = Math.min(5, criticalHits) * totalAttack;
        const baseDropChance = quest.chestConfig.dropChance ?? 100;
        const finalDropChance = baseDropChance + chestBonus;
        
        const shouldDropChest = (Math.random() * 100) <= finalDropChance;

        if (shouldDropChest) {
          const max = quest.chestConfig.maxCoins;
          const min = Math.max(1, Math.floor(max * 0.1));
          finalRewards.coins = Math.floor(Math.random() * (max - min + 1)) + min;
          earnedCoins += finalRewards.coins;
          
          const wonSlots: { id: string, quantity: number }[] = [];
          const slotCount = selectedChestModel?.slot_count || (quest?.chestConfig as any)?.slotCount || 4;
          for (let i = 0; i < slotCount; i++) {
            const itemId = quest.chestConfig.itemIds?.[i];
            if (!itemId || itemId.trim() === '') continue;
            const configured = quest.chestConfig.slotChances?.[i];
            const defaultChance = i === 0 ? 50 : i === 1 ? 25 : i === 2 ? 10 : 5;
            const chance = Math.max(0.01, (configured ?? defaultChance) / 100);
            if (Math.random() <= chance) {
              wonSlots.push({ id: itemId, quantity: quest.chestConfig.itemQuantities?.[i] || 1 });
            } else {
              break;
            }
          }
            
            if (wonSlots.length > 0) {
              const wonItemIds = wonSlots.map(s => s.id);
              const { data: snap } = await supabase.from('store_items').select('*').in('id', wonItemIds);
              const storeItemsMap = new Map();
              if (snap) snap.forEach(d => storeItemsMap.set(d.id, { id: d.id, ...d.data }));
              
              for (const slot of wonSlots) {
                const item = storeItemsMap.get(slot.id);
                if (!item) continue;
                
                const itemData = {
                  studentId: userData!.uid,
                  itemId: item.id,
                  itemTitle: item.title,
                  itemType: item.type,
                  itemImageUrl: item.imageUrl || '',
                  gameEffect: item.gameEffect || 'none',
                  usableInQuest: item.usableInQuest || false,
                  gameModelUrl: item.gameModelUrl || '',
                  modelTextureUrl: item.modelTextureUrl || '',
                  minecraftHeadValue: item.minecraftHeadValue || '',
                  quantity: slot.quantity,
                  equipped: false,
                  purchasedAt: Date.now(),
                  giftedBy: 'Baú do Desafio',
                  avatarPart: item.avatarPart || null,
                  itemCategory: item.itemCategory || 'none',
                  baseAttributeType: item.baseAttributeType || 'none',
                  baseAttributeValue: item.baseAttributeValue || 0,
                  modelTransforms: item.modelTransforms || null,
                  adds: item.type === 'equippable' ? rollItemAdds(item.gachaConfig, item.fixedAttributes, (item.useGlobalGacha ?? true) ? globalGachaConfig : undefined) : [],
                  minSalePrice: item.minSalePrice || 0
                };
                await supabase.from('user_items').insert({
                  student_id: userData!.uid,
                  item_id: item.id,
                  equipped: false,
                  data: itemData
                });
                finalRewards.items.push({ ...item, quantity: slot.quantity });
              }
            }
          }
        }
      
    // Monster Drops (só na 1ª conclusão)
    if (isWin && !alreadyCompletedRef.current && quest?.monsterDrops && quest.monsterDrops.length > 0) {
      const dropItemIds = quest.monsterDrops.map(d => d.itemId);
      if (dropItemIds.length > 0) {
        const { data: snap } = await supabase.from('store_items').select('*').in('id', dropItemIds);
        const storeItemsMap = new Map();
        if (snap) snap.forEach(d => storeItemsMap.set(d.id, { id: d.id, ...d.data }));

        for (const drop of quest.monsterDrops) {
          if (Math.random() * 100 <= drop.dropChance) {
            const item = storeItemsMap.get(drop.itemId);
            if (!item) continue;
            
            const itemData = {
              studentId: userData!.uid,
              itemId: item.id,
              itemTitle: item.title,
              itemType: item.type,
              itemImageUrl: item.imageUrl || '',
              gameEffect: item.gameEffect || 'none',
              usableInQuest: item.usableInQuest || false,
              gameModelUrl: item.gameModelUrl || '',
              modelTextureUrl: item.modelTextureUrl || '',
              minecraftHeadValue: item.minecraftHeadValue || '',
              quantity: 1,
              equipped: false,
              purchasedAt: Date.now(),
              giftedBy: `Drop de Monstro (${quest.monsterName || 'Desconhecido'})`,
              avatarPart: item.avatarPart || null,
              itemCategory: item.itemCategory || 'none',
              baseAttributeType: item.baseAttributeType || 'none',
              baseAttributeValue: item.baseAttributeValue || 0,
              modelTransforms: item.modelTransforms || null,
              adds: item.type === 'equippable' ? rollItemAdds(item.gachaConfig, item.fixedAttributes, (item.useGlobalGacha ?? true) ? globalGachaConfig : undefined) : []
            };
            await supabase.from('user_items').insert({
              student_id: userData!.uid,
              item_id: item.id,
              equipped: false,
              data: itemData
            });
            finalRewards.items.push({ ...item, quantity: 1, isMonsterDrop: true });
          }
        }
      }
    }

    if (finalRewards.coins > 0 || finalRewards.items.length > 0) {
      setChestRewards(finalRewards);
      setShowChest(true);
    }
      
      // Log XP and Coins only if won
      if (isWin && (actualXpGained > 0 || earnedCoins > 0)) {
        const updates: any = {};
        
        if (actualXpGained > 0) {
          updates.xp = (userData?.xp || 0) + actualXpGained;
          // Invalida o cache de histórico para que o Dashboard mostre a nova entrada
          sessionCache.invalidate(CACHE_KEYS.xpHistory(userData!.uid));
        }
        
        if (earnedCoins > 0) {
          updates.coins = (userData?.coins || 0) + earnedCoins;
        }

        const { error: userErr } = await supabase.from('users').update(updates).eq('id', userData!.uid);
        if (userErr) console.error("Falha ao atualizar users (possível bloqueio de RLS):", userErr);
        // Atualiza o estado local para refletir XP/moedas imediatamente (evita valor desatualizado na loja)
        updateUserDataLocally({ xp: updates.xp ?? userData?.xp, coins: updates.coins ?? userData?.coins });
      }

      // Buffs and Debuffs only applied if eligible for XP
      if (isEligibleForXP) {
        const updates: any = {};
        const now = Date.now();
        
        const rankIdx = Math.max(0, RANKS.findIndex(r => r.name === userData.lastSeenRank));
        const baseHearts = Math.max(3, 3 + Math.floor(rankIdx / 2));
        const bonusHearts = Math.floor(totalEquippedStats.vitality / 30);
        const mHearts = baseHearts + bonusHearts;
        const hpPerc = (currentHearts / mHearts) * 100;
        
        if (!isWin || currentHearts === 0) {
          updates.stunned_until = now + 10 * 60 * 1000;
          updates.happy_buff_until = null;
          updates.happy_buff_duration = null;
        } else if (hpPerc === 100) {
          let newDuration = 5;
          if (userData.happyBuffUntil && userData.happyBuffUntil > now) {
            newDuration = (userData.happyBuffDuration || 5) * 2;
          }
          updates.happy_buff_until = now + newDuration * 60 * 1000;
          updates.happy_buff_duration = newDuration;
          updates.stunned_until = null;
        } else {
          updates.happy_buff_until = null;
          updates.happy_buff_duration = null;
          updates.stunned_until = null;
        }
        
        await supabase.from('users').update(updates).eq('id', userData.uid);
      }

      // Garantir que o HP final do jogo seja gravado em users e updateUserDataLocally
      if (!isStudyMode && (userData?.role === 'student' || !!userData?.studentViewActive)) {
        const finalHp = isWin ? currentHearts : 0;
        await updateUserHearts(finalHp);
      }
    }

    // Save Attempt only for students (admins shouldn't pollute the logs)
    if (userData?.role === 'student' || !!userData?.studentViewActive) {
      const { error: attemptErr } = await supabase.from('quest_attempts').insert({
        quest_id: quest?.id,
        student_id: userData.uid,
        status: isWin ? 'completed' : 'failed',
        data: {
          answers: studentAnswers.current,
          isStudyMode: isStudyMode,
          earned_xp: (isWin && isEligibleForXP) ? finalXp : 0
        }
      });
      
      if (attemptErr) console.error("Falha ao registrar quest_attempts:", attemptErr);
      
      // Invalida o cache de tentativas para que o Dashboard atualize os botões de missão
      if (isWin || isAbandon) sessionCache.invalidate(CACHE_KEYS.questAttempts(userData.uid));
    }

    setSaving(false);
  };

  const handleAbandon = async () => {
    if (gameState === 'playing' && !isStudyMode && (userData?.role === 'student' || !!userData?.studentViewActive)) {
      const confirmed = await showConfirm("Tem certeza que deseja abandonar? Você perderá 1 vida e receberá penalidade de XP para as perguntas não respondidas. A missão será encerrada permanentemente!");
      if (!confirmed) {
        return;
      }
      
      let newHearts = currentHearts;
      if (newHearts > 0) {
        newHearts -= 1;
        await updateUserHearts(newHearts);
      }

      const remainingQuestions = quest!.questions.length - currentQIndex;
      const basePenalty = remainingQuestions * quest!.xpPenaltyPerRetry;
      const actualPenalty = calculatePenalty(basePenalty);
      const finalXp = Math.max(0, currentXp - actualPenalty);
      
      finishGame(false, finalXp, `Você abandonou a missão. Recebeu apenas ${finalXp} XP (penalidade aplicada).`);
    } else {
      navigate('/dashboard');
    }
  };

  const collectCoin = (coin: { id: number; x: number; y: number; value: number }) => {
    if (!userData) return;
    const currentCoins = userData.coins || 0;
    const newCoins = currentCoins + coin.value;
    supabase.from('users').update({ coins: newCoins }).eq('id', userData.uid).then(({ error }) => { if (error) console.error(error); });
    userData.coins = newCoins;
    setDroppedCoins(prev => prev.filter(c => c.id !== coin.id));
    setCoinPops(prev => [...prev, { id: Date.now() + Math.random(), x: coin.x, y: coin.y, value: coin.value }]);
  };

  const dropCoins = () => {
    if (!economySettings?.coinsDropInCombat) return;
    const cfg = combatCoinConfigRef.current;
    let dropped: number;
    let coinValue: number;

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
    coinValue = Math.floor(Math.random() * (maxV - minV + 1)) + minV;

    // Moedas caem na área configurável
    const newCoins = Array.from({ length: Math.min(dropped, 8) }).map((_, i) => ({
      id: Date.now() + i,
      x: arenaDebug.coinAreaX + Math.random() * arenaDebug.coinAreaW,
      y: arenaDebug.coinAreaY + Math.random() * arenaDebug.coinAreaH,
      value: coinValue
    }));
    setDroppedCoins(prev => [...prev, ...newCoins]);
    setCoinsToRescue(dropped);
    setTimeout(() => setCoinsToRescue(null), 2500);
  };

  const handleUsePowerup = async (item: UserItem) => {
    if (gameState !== 'playing') {
      await showAlert("Você só pode usar itens durante a batalha!");
      return;
    }
    
    if (item.gameEffect === 'remove_wrong') {
      const q = quest!.questions[currentQIndex];
      const correctIdx = q.correctIndex;
      const wrongIndices = q.options
        .map((_, i) => (i !== correctIdx && !eliminatedOptions.includes(i) ? i : -1))
        .filter(i => i !== -1);
      
      if (wrongIndices.length === 0) {
        await showAlert("Não há mais opções erradas para remover!");
        return;
      }
      const randomWrong = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
      setEliminatedOptions([...eliminatedOptions, randomWrong]);
      
    } else if (item.gameEffect === 'add_time') {
      setTimeLeft(prev => prev + 30);
      
    } else if (item.gameEffect === 'extra_life') {
      setHasShield(true);
      
    } else if (item.gameEffect === 'restore_hp') {
      const maxHearts = calculatedMaxHearts;
      
      if (currentHearts >= maxHearts) {
         await showAlert("Sua vida já está cheia!");
         return;
      }
      
      setCurrentHearts(maxHearts);
      
      if ((userData?.role === 'student' || !!userData?.studentViewActive) && !isStudyMode) {
        updateUserHearts(maxHearts);
      }
    } else if (item.gameEffect === 'heal_1_hp') {
      const maxHearts = calculatedMaxHearts;
      
      if (currentHearts >= maxHearts) {
         await showAlert("Sua vida já está cheia!");
         return;
      }
      
      const newHearts = Math.min(maxHearts, currentHearts + 1);
      setCurrentHearts(newHearts);
      
      if ((userData?.role === 'student' || !!userData?.studentViewActive) && !isStudyMode) {
        updateUserHearts(newHearts);
      }
    }
    
    await supabase.from('user_items').delete().eq('id', item.id);
    setPowerups(powerups.filter(p => p.id !== item.id));
  };


  if (gameState === 'loading') {
    return <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><h2>Carregando Campo de Batalha...</h2></div>;
  }

  const maxHearts = calculatedMaxHearts;
  const hpPercentage = (currentHearts / maxHearts) * 100;

  let baseAnim: 'idle' | 'exhausted' = 'idle';
  let baseExp: 'normal' | 'serious' | 'sad' = 'normal';

  if (hpPercentage >= 75) {
    baseAnim = 'idle';
    baseExp = 'normal';
  } else if (hpPercentage >= 50) {
    baseAnim = 'idle';
    baseExp = 'serious';
  } else if (hpPercentage >= 25) {
    baseAnim = 'exhausted';
    baseExp = 'serious';
  } else {
    baseAnim = 'exhausted';
    baseExp = 'sad';
  }

  const activePlayerAnim = (playerAnim === 'idle' || playerAnim === 'exhausted') ? baseAnim : playerAnim;

  return (
    <div className="app-container" style={{ 
      position: 'relative', 
      height: '100vh',
      overflow: 'hidden',
      background: quest?.coverImageUrl ? `url(${getSafeUrl(quest.coverImageUrl)}) center/cover no-repeat` : 'var(--bg-dark)'
    }}>
      {/* Dark overlay for readability */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)' }} />

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', flexShrink: 0 }}>
        
        {/* Header */}
        <div style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
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
          
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
            {gameState === 'playing' && powerups.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginRight: '1rem', overflowX: 'auto', maxWidth: '300px', paddingBottom: '0.2rem', scrollbarWidth: 'thin' }}>
                {powerups.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleUsePowerup(p)}
                    title={`Usar: ${p.itemTitle}`}
                    style={{ position: 'relative', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {p.itemImageUrl ? (
                      <img src={getSafeUrl(p.itemImageUrl)} alt={p.itemTitle} style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover' }} />
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
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid #ef4444' }}>
                  {Array.from({ length: currentHearts }).map((_, i) => (
                    <Heart key={i} size={18} fill="#ef4444" color="#ef4444" />
                  ))}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: timeLeft <= 5 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px', border: `1px solid ${timeLeft <= 5 ? 'var(--accent-red)' : 'var(--text-secondary)'}`, color: timeLeft <= 5  ? 'var(--accent-red)'  : 'var(--text-primary)' }}>
                  <Clock size={18} />
                  <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{timeLeft}s</span>
                  {(isSuperAdmin || userData?.role === 'admin') && (
                    <button onClick={() => { setTimerPaused(p => { timerPausedRef.current = !p; return !p; }); }} style={{ background: 'transparent', border: 'none', color: timerPaused ? 'var(--gold-primary)' : 'var(--text-secondary)', cursor: 'pointer', padding: '0.1rem', marginLeft: '0.25rem' }} title={timerPaused ? 'Retomar timer' : 'Pausar timer'}>
                      {timerPaused ? '▶' : '⏸'}
                    </button>
                  )}
                </div>
                {(isSuperAdmin || userData?.role === 'admin') && (
                  <button onClick={() => setShowDebugPanel(v => !v)} style={{ background: showDebugPanel ? 'rgba(245,158,11,0.3)' : 'rgba(0,0,0,0.5)', border: `1px solid ${showDebugPanel ? 'var(--gold-primary)' : 'var(--border-glass)'}`, borderRadius: '20px', color: showDebugPanel ? 'var(--gold-primary)' : 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 'bold' }} title="Arena Debug">
                    🏟️ Debug
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Battle Arena Fixed */}
        {gameState === 'playing' && (
          <div ref={arenaRef} className="battle-arena-bg quest-arena" style={{ '--attack-dist': `${arenaDebug.attackDist}px`, position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: `${arenaDebug.arenaGap}px`, padding: `${arenaDebug.arenaPaddingTop}px 0.5rem 1rem`, flex: '1 1 auto', maxHeight: `${arenaDebug.arenaHeight}px`, zIndex: 20, overflow: 'hidden' } as any}>
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}>
              <div 
                className="battle-arena-bg-image" 
                style={quest?.battleBgUrl ? ({
                  background: `url(${quest.battleBgUrl}) ${quest.battleBgPosX ?? 50}% ${quest.battleBgPosY ?? 50}% / ${(quest.battleBgScale ?? 1.2) * 100}% no-repeat`,
                  ...(quest.battleBgMoveEnabled !== false
                    ? {
                        '--bg-move-x': `${quest.battleBgMoveDirection === 'horizontal' || quest.battleBgMoveDirection === 'diagonal' ? (quest.battleBgMoveSpeed ?? 10) : 0}%`,
                        '--bg-move-y': `${quest.battleBgMoveDirection === 'vertical' ? (quest.battleBgMoveSpeed ?? 10) : quest.battleBgMoveDirection === 'diagonal' ? -(quest.battleBgMoveSpeed ?? 10) / 2 : 0}%`,
                        '--bg-move-duration': `${quest.battleBgMoveDuration ?? 30}s`,
                      }
                    : { '--bg-move-play': 'paused' })
                } as any) : undefined}
              />
            </div>
            
            {/* Coin Drop Area Debug Rectangle (Monster) */}
            {(userData?.role === 'admin' || isSuperAdmin) && arenaDebug.showCoinArea && (
              <div style={{ position: 'absolute', left: `${arenaDebug.coinAreaX}%`, top: `${arenaDebug.coinAreaY}%`, width: `${arenaDebug.coinAreaW}%`, height: `${arenaDebug.coinAreaH}%`, border: '2px solid #10b981', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', zIndex: 39, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.6rem', color: '#10b981', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>💰 Drop Monstro</span>
              </div>
            )}
            {/* Player Coin Drop Area Debug Rectangle */}
            {(userData?.role === 'admin' || isSuperAdmin) && arenaDebug.showPlayerCoinArea && (
              <div style={{ position: 'absolute', left: `${arenaDebug.playerCoinAreaX}%`, top: `${arenaDebug.playerCoinAreaY}%`, width: `${arenaDebug.playerCoinAreaW}%`, height: `${arenaDebug.playerCoinAreaH}%`, border: '2px solid #3b82f6', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', zIndex: 39, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.6rem', color: '#3b82f6', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>💧 Queda Jogador</span>
              </div>
            )}
            {droppedCoins.length > 0 && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
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
                      zIndex: 40,
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

            {/* Falling coins (lost by player, not clickable) */}
            {fallingCoins.length > 0 && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 45, pointerEvents: 'none', overflow: 'hidden' }}>
                {fallingCoins.map(coin => (
                  <div
                    key={coin.id}
                    style={{
                      position: 'absolute',
                      left: `${coin.x}%`,
                      top: '-30px',
                      animation: 'coin-fall 2.5s ease-in forwards',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <Coins size={16} color="var(--gold-primary)" fill="rgba(245, 158, 11, 0.5)" />
                    <span style={{ fontSize: '0.65rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>-{coin.value}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Question Overlay - Sobre a arena, abaixo dos balões de fala */}
            <div className="quest-question-overlay">
              <div className="quest-question-title">
                {quest.questions[currentQIndex].imageUrl && (
                  <img src={getSafeUrl(quest.questions[currentQIndex].imageUrl)} alt="Quest" />
                )}
                <h2 dangerouslySetInnerHTML={{ __html: quest.questions[currentQIndex].title }} />
              </div>
              
              <div className="quest-options-compact">
                {quest.questions[currentQIndex].options.map((opt, i) => {
                  const isEliminated = eliminatedOptions.includes(i);
                  const isCorrectAnswer = feedback && i === quest.questions[currentQIndex].correctIndex;
                  const isWrongSelected = feedback === 'wrong' && i === lastSelectedOption;
                  
                  return (
                    <button 
                      key={i} 
                      onClick={() => !isEliminated && handleAnswer(i)}
                      disabled={feedback !== null || isEliminated}
                      className={`quest-option-btn ${isEliminated ? 'eliminated' : ''} ${isCorrectAnswer ? 'correct' : ''} ${isWrongSelected ? 'wrong' : ''}`}
                    >
                      {isEliminated && <XCircle size={16} color="rgba(239, 68, 68, 0.5)" style={{ position: 'absolute' }} />}
                      <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                      {opt.imageUrl && <img src={getSafeUrl(opt.imageUrl)} alt="" className="option-img" />}
                      <span className="option-text">{opt.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Player Side */}
            <div 
              className={`${playerAnim === 'attack' ? 'teleport-player' : (playerAnim === 'attack-fatal' || playerAnim === 'attack-fatal-slow') ? `teleport-player-fatal${playerAnim === 'attack-fatal-slow' ? '-slow' : ''}` : (playerAnim === 'idle-victory' || playerAnim.startsWith('victory-')) ? 'teleport-player-victory' : ''} ${userData?.avatarConfig?.customModelUrl ? 'is-3d' : ''}`}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transform: playerAnim === 'hurt' ? 'translateX(-20px) rotate(-10deg)' : undefined, transition: playerAnim.startsWith('attack') ? 'none' : 'transform 1s cubic-bezier(0.175, 0.885, 0.32, 1.275)', zIndex: (playerAnim.startsWith('attack') || playerAnim === 'idle-victory' || playerAnim.startsWith('victory-')) ? 30 : (monsterAnim.startsWith('death-') ? 20 : 26) }}
            >
              {(playerBubble || arenaDebug.playerBubbleAlwaysOn) && (
                <div className="speech-bubble player debug-bubble" style={{ '--bubble-max-w': `${arenaDebug.playerBubbleMaxWidth || 200}px`, '--bubble-font': `${arenaDebug.playerBubbleFontSize || 14}px`, '--bubble-rotate': `${arenaDebug.playerBubbleRotate || 0}deg`, position: 'absolute', left: `calc(50% + ${arenaDebug.playerBubbleX}px)`, top: `${arenaDebug.playerBubbleY}px`, bottom: 'auto', transform: 'translateX(-50%)', zIndex: 30 } as any}>
                  {playerBubble || 'Olá!'}
                </div>
              )}
              {(userData?.role === 'admin' || isSuperAdmin) && arenaDebug.showBubbleOrigins && (
                <div style={{ position: 'absolute', left: `calc(50% + ${arenaDebug.playerBubbleX}px)`, top: `${arenaDebug.playerBubbleY}px`, width: `${arenaDebug.bubbleOriginSize}px`, height: `${arenaDebug.bubbleOriginSize}px`, borderRadius: '50%', border: '2px dashed #3b82f6', background: 'rgba(59,130,246,0.15)', transform: 'translate(-50%, -50%)', zIndex: 29, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.5rem', color: '#3b82f6', fontWeight: 'bold' }}>F</span>
                </div>
              )}
              {/* Nome do jogador - pequeno, acima da cabeça */}
              <div style={{ position: 'absolute', top: `${arenaDebug.playerNameY}px`, left: '50%', transform: `translateX(calc(-50% + ${arenaDebug.playerNameX}px))`, zIndex: 5, whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.65rem', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px' }}>Você</span>
              </div>
              <div className="quest-arena-avatars" style={{ position: 'relative', width: '130px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', transition: 'width 0.3s ease', outline: ((userData?.role === 'admin' || isSuperAdmin) && arenaDebug.showBoxes) ? '2px solid lime' : 'none', outlineOffset: '2px', marginRight: '-20px', transform: `translate(${arenaDebug.playerOffsetX}px, ${arenaDebug.playerOffsetY}px) scale(${arenaDebug.playerScale})` }}>
                <div style={{ position: 'relative', display: 'inline-block', marginBottom: '-60px' }}>
                  <AvatarCharacter config={userData?.avatarConfig || null} equippedItems={playerEquippedItems} size={170} animation={activePlayerAnim as any} expression={baseExp} interactive={false} hurt={playerAnim === 'hurt'} />
                  {!quest?.allowRetries ? (
                    (() => {
                      // Suor baseado em estresse real (tempo, vida, erros)
                      const sweatLevel = stressLevel >= 0.75 ? 1 : stressLevel >= 0.5 ? 0.7 : stressLevel >= 0.25 ? 0.4 : 0;
                      return (
                        <div className="sweat-overlay" style={{ '--sweat-opacity': sweatLevel } as any}>
                          {stressLevel >= 0.25 && <div className="sweat-drop" />}
                          {stressLevel >= 0.5 && <div className="sweat-drop" />}
                          {stressLevel >= 0.75 && <div className="sweat-drop" />}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="bruise-overlay" style={{ '--damage-opacity': Math.max(0, Math.min(1, (maxHearts - currentHearts) / maxHearts)) } as any} />
                  )}
                </div>
              </div>
            </div>

            {/* Battle Message */}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 2rem', zIndex: 20, opacity: battleMessage ? 1 : 0, transition: 'opacity 0.3s' }}>
              <div style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem', textAlign: 'center', minWidth: '250px', backdropFilter: 'blur(10px)', boxShadow: 'var(--shadow-glass)' }}>
                <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)', minHeight: '1.5em', fontStyle: 'italic', textShadow: battleMessage.includes('FATALITY') ? '0 0 10px red' : 'none' }}>
                  {battleMessage}
                </p>
              </div>
            </div>

            {/* Monster Side */}
            <div 
              className={`${monsterAnim === 'attack' ? 'teleport-monster' : (monsterAnim === 'attack-fatal' || monsterAnim === 'attack-fatal-slow') ? `teleport-monster-fatal${monsterAnim === 'attack-fatal-slow' ? '-slow' : ''}` : (monsterAnim === 'idle-victory' || monsterAnim.startsWith('victory-')) ? 'teleport-monster-victory' : ''} ${(quest?.monsterModelUrl || quest?.monsterAvatarConfig?.customModelUrl) ? 'is-3d' : ''}`}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transform: monsterAnim === 'hurt' ? 'translateX(20px) rotate(10deg)' : undefined, transition: monsterAnim.startsWith('attack') ? 'none' : 'transform 1s cubic-bezier(0.175, 0.885, 0.32, 1.275)', zIndex: (monsterAnim === 'attack-fatal' || monsterAnim === 'attack-fatal-slow') ? 35 : (monsterAnim.startsWith('attack') || monsterAnim.startsWith('death-')) ? 30 : 26 }}
            >
              {(monsterBubble || arenaDebug.monsterBubbleAlwaysOn) && (
                <div className="speech-bubble monster debug-bubble" style={{ '--bubble-max-w': `${arenaDebug.monsterBubbleMaxWidth || 200}px`, '--bubble-font': `${arenaDebug.monsterBubbleFontSize || 14}px`, '--bubble-rotate': `${arenaDebug.monsterBubbleRotate || 0}deg`, position: 'absolute', left: `calc(50% + ${arenaDebug.monsterBubbleX}px)`, top: `${arenaDebug.monsterBubbleY}px`, bottom: 'auto', transform: 'translateX(-50%)', zIndex: 30 } as any}>
                  {monsterBubble || 'Grrr!'}
                </div>
              )}
              {(userData?.role === 'admin' || isSuperAdmin) && arenaDebug.showBubbleOrigins && (
                <div style={{ position: 'absolute', left: `calc(50% + ${arenaDebug.monsterBubbleX}px)`, top: `${arenaDebug.monsterBubbleY}px`, width: `${arenaDebug.bubbleOriginSize}px`, height: `${arenaDebug.bubbleOriginSize}px`, borderRadius: '50%', border: '2px dashed #ef4444', background: 'rgba(239,68,68,0.15)', transform: 'translate(-50%, -50%)', zIndex: 29, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.5rem', color: '#ef4444', fontWeight: 'bold' }}>F</span>
                </div>
              )}
              {monsterAnim === 'death-slice' ? (
                <div className="quest-arena-avatars" style={{ position: 'relative', width: '130px', height: '200px' }}>
                  {/* Nome do monstro - acompanha death-slice */}
                  <div style={{ position: 'absolute', top: '-25px', left: '50%', transform: 'translateX(-50%)', zIndex: 5, whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <span style={{ fontWeight: 'bold', color: 'var(--accent-red)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.65rem', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', opacity: 0.3 }}>{quest?.monsterName || 'Inimigo'}</span>
                  </div>
                  <div className="death-slice-left" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    {(quest?.monsterModelUrl || quest?.monsterAvatarConfig?.customModelUrl) ? <CustomModelViewer modelUrl={(quest?.monsterModelUrl || quest?.monsterAvatarConfig?.customModelUrl)!} textureUrl={quest?.monsterAvatarConfig?.customSkinUrl} size={190} animation="none" role="monster" /> : <div style={{ marginBottom: '-60px' }}><AvatarCharacter config={quest?.monsterAvatarConfig || null} equippedItems={[]} size={170} animation="idle" interactive={false} role="monster" /></div>}
                  </div>
                  <div className="death-slice-right" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    {(quest?.monsterModelUrl || quest?.monsterAvatarConfig?.customModelUrl) ? <CustomModelViewer modelUrl={(quest?.monsterModelUrl || quest?.monsterAvatarConfig?.customModelUrl)!} textureUrl={quest?.monsterAvatarConfig?.customSkinUrl} size={190} animation="none" role="monster" /> : <div style={{ marginBottom: '-60px' }}><AvatarCharacter config={quest?.monsterAvatarConfig || null} equippedItems={[]} size={170} animation="idle" interactive={false} role="monster" /></div>}
                  </div>
                </div>
              ) : (
                <div 
                  className={`quest-arena-avatars ${
                    monsterAnim === 'death-evaporate' ? 'anim-death-evaporate' : 
                    monsterAnim === 'death-fall' ? 'anim-death-fall' :
                    monsterAnim === 'death-explode' ? 'anim-death-explode' : ''
                  }`}
                  style={{ position: 'relative', width: '130px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', outline: ((userData?.role === 'admin' || isSuperAdmin) && arenaDebug.showBoxes) ? '2px solid red' : 'none', outlineOffset: '2px', marginLeft: '-20px', transform: `translate(${arenaDebug.monsterOffsetX}px, ${arenaDebug.monsterOffsetY}px) scale(${arenaDebug.monsterScale})` }}
                >
                  {/* Nome do monstro - acompanha animações de morte */}
                  <div style={{ position: 'absolute', top: `${arenaDebug.monsterNameY}px`, left: '50%', transform: `translateX(calc(-50% + ${arenaDebug.monsterNameX}px))`, zIndex: 5, whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', opacity: monsterAnim.startsWith('death-') ? 0.3 : 1, transition: 'opacity 2s' }}>
                    <span style={{ fontWeight: 'bold', color: 'var(--accent-red)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.65rem', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px' }}>{quest?.monsterName || 'Inimigo'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                      {Array.from({ length: Math.max(0, (quest?.questions.length || 0) - currentQIndex - (monsterAnim.startsWith('death-') ? 1 : 0)) }).map((_, i) => (
                        <Heart key={i} size={10} fill="#ef4444" color="#ef4444" />
                      ))}
                    </div>
                  </div>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  {(() => {
                    const modelUrl = quest?.monsterModelUrl || quest?.monsterAvatarConfig?.customModelUrl;
                    const modelCfg = modelUrl ? arenaDebug.modelConfigs[modelUrl] : null;
                    const modelScale = modelCfg?.scale ?? 1;
                    const modelOX = modelCfg?.offsetX ?? 0;
                    const modelOY = modelCfg?.offsetY ?? 0;
                    const wrapperStyle = modelCfg ? { transform: `translate(${modelOX}px, ${modelOY}px) scale(${modelScale})`, transformOrigin: 'bottom center' } : {};

                    if (modelUrl) {
                      return <div style={wrapperStyle}><CustomModelViewer modelUrl={modelUrl} textureUrl={quest?.monsterAvatarConfig?.customSkinUrl} size={190} animation={monsterAnim} role="monster" /></div>;
                    } else if (quest?.monsterAvatarConfig) {
                      return <div style={{ marginBottom: '-60px', ...wrapperStyle }}><AvatarCharacter config={quest.monsterAvatarConfig} equippedItems={[]} size={170} animation={(monsterAnim === 'hurt' || monsterAnim === 'attack' || monsterAnim === 'attack-fatal-slow') ? monsterAnim as any : 'idle'} interactive={false} role="monster" hurt={monsterAnim === 'hurt'} /></div>;
                    } else {
                      return <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${quest?.title || 'monster'}&colors=red,orange,yellow`} alt="Monster" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.5))' }} />;
                    }
                  })()}
                  <div className="bruise-overlay" style={{ '--damage-opacity': Math.max(0, Math.min(1, currentQIndex / Math.max(1, quest?.questions.length || 1))) } as any} />
                </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="quest-content-area" style={{ flex: gameState === 'playing' ? '0 0 auto' : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: gameState === 'playing' ? 'flex-start' : 'center', overflowY: gameState === 'playing' ? 'visible' : 'auto', minHeight: 0 }}>

          
          {gameState === 'intro' && quest && (
            <div className="glass-panel quest-victory-panel" style={{ width: '100%', maxWidth: '800px', textAlign: 'center', animation: 'epicZoom 0.5s ease-out' }}>
              <Swords size={64} color="var(--gold-primary)" style={{ margin: '0 auto 2rem auto' }} />
              <h1 className="title-glow" style={{ fontSize: '3rem', marginBottom: '1rem' }}>{quest.title}</h1>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '3rem', lineHeight: 1.6 }}>{quest.description}</p>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2rem', marginBottom: '4rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem 2rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>Recompensa</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold-primary)', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    <Star size={24} /> {isStudyMode ? '0 XP (Estudo)' : `${Math.floor(quest.baseXp * (1 + (totalEquippedStats.xp / 100)))} XP`}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem 2rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>Modo de Batalha</h4>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: quest.allowRetries ? 'var(--accent-green)' : 'var(--accent-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={20} /> {quest.allowRetries ? 'Vidas Extras' : 'Hardcore'}
                  </div>
                </div>
              </div>

              <button className="login-btn" onClick={startGame} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '1.5rem 4rem', fontSize: '1.5rem', borderRadius: '50px' }}>
                Iniciar Batalha
              </button>
            </div>
          )}

          {gameState === 'playing' && quest && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out', flex: 1 }}>
              {/* Feedback visual quando responde */}
              {feedback && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '1rem',
                  animation: 'fadeIn 0.3s ease-out',
                  background: feedback === 'correct' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  borderRadius: '12px',
                  border: `1px solid ${feedback === 'correct' ? 'var(--accent-green)' : 'var(--accent-red)'}`,
                }}>
                  <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: feedback === 'correct' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {feedback === 'correct' ? '✓ Resposta Correta!' : '✗ Resposta Incorreta!'}
                  </p>
                </div>
              )}
            </div>
          )}

          {gameState === 'result' && (
            <div className="glass-panel quest-victory-panel" style={{ margin: 'auto', width: '100%', maxWidth: '600px', textAlign: 'center', animation: 'epicZoom 0.5s ease-out', border: won ? '2px solid var(--gold-primary)' : '2px solid var(--accent-red)' }}>
              
              {errorMessage ? (
                <>
                  <ShieldAlert size={64} color="var(--text-secondary)" style={{ margin: '0 auto 2rem auto' }} />
                  <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Aviso</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '3rem' }}>{errorMessage}</p>
                </>
              ) : won ? (
                <>
                  <div className="quest-victory-avatar">
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <AvatarCharacter 
                        config={userData?.avatarConfig || null} 
                        equippedItems={playerEquippedItems} 
                        size={120} 
                        animation={hpPercentage === 100 ? 'cheer' : baseAnim} 
                        expression={hpPercentage === 100 ? 'normal' : baseExp}
                        interactive={false} 
                      />
                      {!quest?.allowRetries ? (
                        (() => {
                          // Suor baseado em estresse real na tela de vitória
                          const sweatLevel = stressLevel >= 0.75 ? 1 : stressLevel >= 0.5 ? 0.7 : stressLevel >= 0.25 ? 0.4 : 0;
                          return (
                            <div className="sweat-overlay" style={{ '--sweat-opacity': sweatLevel } as any}>
                              {stressLevel >= 0.25 && <div className="sweat-drop" />}
                              {stressLevel >= 0.5 && <div className="sweat-drop" />}
                              {stressLevel >= 0.75 && <div className="sweat-drop" />}
                            </div>
                          );
                        })()
                      ) : (
                        <div className="bruise-overlay" style={{ '--damage-opacity': Math.max(0, Math.min(1, (maxHearts - currentHearts) / maxHearts)) } as any} />
                      )}
                    </div>
                  </div>
                  <h1 className="title-glow quest-victory-title" style={{ marginBottom: '0.5rem', color: 'var(--gold-primary)' }}>VITÓRIA!</h1>
                  <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>O monstro foi derrotado e o desafio foi superado.</p>
                  <div style={{ background: 'rgba(251, 191, 36, 0.1)', padding: '1rem', borderRadius: '12px', display: 'inline-block', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', alignItems: 'center' }}>
                      <div className="quest-victory-xp" style={{ fontWeight: 'bold', color: 'var(--gold-primary)', fontSize: '1.5rem' }}>+{isStudyMode ? 0 : Math.floor(currentXp * xpMultiplier)} XP</div>
                      <div className="quest-victory-xp" style={{ fontWeight: 'bold', color: 'var(--gold-secondary)', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>+{isStudyMode ? 0 : Math.floor(currentXp * coinsMultiplier)} <Coins size={24}/></div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <XCircle size={64} color="var(--accent-red)" style={{ margin: '0 auto 1rem auto' }} />
                  <h1 className="title-glow quest-victory-title" style={{ marginBottom: '0.5rem', color: 'var(--accent-red)' }}>FALHA</h1>
                  <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>Você foi derrotado. O tempo acabou ou você errou o ataque fatal.</p>
                </>
              )}

              <div>
                <button className="login-btn" onClick={() => navigate('/dashboard')} disabled={saving} style={{ background: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', padding: '1rem 3rem', fontSize: '1.2rem' }}>
                  {saving ? 'Salvando progresso...' : 'Retornar ao Acampamento'}
                </button>
              </div>
            </div>
          )}

          {showChest && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              {!chestOpened ? (
                <ChestReveal
                  onOpen={() => setChestOpened(true)}
                  chestModelUrl={selectedChestModel?.url}
                  chestOpenUrl={selectedChestModel?.open_url}
                  rarity={selectedChestModel?.rarity}
                />
              ) : (
                <div style={{ textAlign: 'center', animation: 'epicZoom 0.5s ease-out' }}>
                  <h2 style={{ fontSize: '3rem', color: 'var(--gold-primary)', marginBottom: '3rem', textShadow: '0 0 20px var(--gold-primary)' }}>Recompensas Adquiridas!</h2>
                  
                  <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '800px' }}>
                    <div style={{ background: 'rgba(255,215,0,0.1)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--gold-primary)', minWidth: '150px', animation: 'popInChest 0.3s ease-out forwards', animationDelay: '0.1s', opacity: 0 }}>
                      <Coins size={48} color="var(--gold-primary)" style={{ margin: '0 auto 1rem auto' }} />
                      <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white' }}>+{chestRewards.coins}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>Moedas</div>
                    </div>
                    
                    {chestRewards.items.map((item, idx) => (
                      <div key={idx} style={{ background: 'var(--btn-bg)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-glass)', minWidth: '150px', animation: 'popInChest 0.3s ease-out forwards', animationDelay: `${0.2 + idx * 0.1}s`, opacity: 0 }}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.title} style={{ width: '64px', height: '64px', objectFit: 'contain', margin: '0 auto 1rem auto' }} />
                        ) : (
                          <Package size={48} color="var(--text-secondary)" style={{ margin: '0 auto 1rem auto' }} />
                        )}
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white' }}>{item.title}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                          {item.isMonsterDrop ? <span style={{color: 'var(--accent-red)'}}>Drop!</span> : ''} {item.type === 'equippable' ? 'Equipamento' : `Consumível (x${item.quantity})`}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button className="login-btn" onClick={() => navigate('/dashboard')} style={{ marginTop: '4rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', padding: '1rem 3rem', fontSize: '1.2rem', animation: 'popInChest 0.3s ease-out forwards', animationDelay: '1s', opacity: 0 }}>
                    Coletar Tudo e Continuar
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Arena Debug Panel - floating control for admins, only during gameplay */}
      {gameState === 'playing' && showDebugPanel && (
        <ArenaDebugPanel
          config={arenaDebug}
          onChange={setArenaDebug}
          onSave={handleSaveArenaDebug}
          onTestPlayerBubble={handleTestPlayerBubble}
          onTestMonsterBubble={handleTestMonsterBubble}
          isAdmin={userData?.role === 'admin' || isSuperAdmin}
          deviceKey={deviceKey}
        />
      )}
    </div>
  );
}
