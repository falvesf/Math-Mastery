import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Trophy, Settings, History, ShieldAlert, Star, TrendingUp, Users, Swords, Clock, CheckCircle, Store, Heart, Package, Eye, EyeOff } from 'lucide-react';
import { useAuth, type UserData } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { getRankForXp, RANKS, type RankDef } from '../lib/ranks';
import { calculateTotalStats } from '../lib/gacha';
import LevelUpModal from '../components/LevelUpModal';
import StudentStore from '../components/StudentStore';
import StudentInventory from '../components/StudentInventory';
import { useDialog } from '../contexts/DialogContext';
import AvatarCharacter, { type EquippedItem } from '../components/AvatarCharacter';
import PublicProfileModal from '../components/PublicProfileModal';
import AvatarCustomizationModal from '../components/AvatarCustomizationModal';
import { getProfileAvatarState, hasProfanity } from '../lib/avatarState';
import { Edit3, MessageCircle, X, Box, Palette } from 'lucide-react';
import { sessionCache, CACHE_KEYS, CACHE_TTL } from '../lib/sessionCache';
import OnboardingModal from '../components/OnboardingModal';
import CustomThemeModal, { type CustomTheme, DEFAULT_FANTASY_THEME } from '../components/CustomThemeModal';
import { applyCustomTheme } from '../lib/theme';
export interface RankingHistory {
  general: Record<string, { currentRank: number; previousRank: number; rankSince: number }>;
  classes: Record<string, Record<string, { currentRank: number; previousRank: number; rankSince: number }>>;
}

const RankingAvatar = React.memo(({ student, size, rankPos = 1, equippedItems, activeBubbleId, onAvatarClick, showAvatars = false }: { 
  student: UserData; 
  size: number; 
  rankPos?: number; 
  equippedItems: EquippedItem[];
  activeBubbleId: string | null;
  onAvatarClick?: () => void;
  showAvatars?: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const avatarState = getProfileAvatarState(student);
  const show3D = rankPos <= 3 || isHovered;
  const rank = getRankForXp(student.xp || 0, student.classId);
  
  let finalAnimation = show3D ? (avatarState.animation as any) : 'idle';
  if (rankPos === 1 && show3D) {
    finalAnimation = 'cheer';
  }

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onAvatarClick}
      style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'visible', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >
      {showAvatars && activeBubbleId === student.uid && student.customStatusText && (
        <div style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', background: 'white', color: 'black', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', whiteSpace: 'nowrap', zIndex: 50, boxShadow: '0 4px 10px rgba(0,0,0,0.5)', animation: 'epicZoom 0.3s ease-out' }}>
          {student.customStatusText}
          <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: 'white' }} />
        </div>
      )}

      {/* Imagem da Patente (Sempre visível no fundo) */}
      {rank.imageUrl ? (
        <img src={rank.imageUrl} alt={rank.name} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%', filter: `drop-shadow(0 0 10px ${rank.color}80)`, opacity: showAvatars ? 0.6 : 1, zIndex: 0 }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: rank.color, textAlign: 'center', fontSize: size > 60 ? '0.9rem' : '0.7rem', zIndex: 0, textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>{rank.name}</div>
      )}

      {/* Avatar (Visível apenas se showAvatars for true) */}
      {showAvatars && (
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
          {student.avatarConfig ? (
            <AvatarCharacter 
              config={student.avatarConfig} 
              equippedItems={equippedItems} 
              size={size} 
              interactive={false} 
              animation={finalAnimation} 
              expression={rankPos === 1 && show3D ? 'normal' : (avatarState.expression as any)} 
            />
          ) : (
            <img src={student.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          )}
        </div>
      )}
    </div>
  );
});

export default function Dashboard() {
  const { showAlert } = useDialog();
  const { userData } = useAuth();
  if (!userData) return null;
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('quests');
  const [profileTab, setProfileTab] = useState('overview');
  const [xpHistory, setXpHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // Rankings state
  const [showRankingAvatars, setShowRankingAvatars] = useState(false);
  const [allStudents, setAllStudents] = useState<UserData[]>([]);
  const [cubeRotation, setCubeRotation] = useState(0);
  const [rankImageIndex, setRankImageIndex] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const lastInteractionTime = useRef(Date.now());
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [rankingEquippedItems, setRankingEquippedItems] = useState<Record<string, EquippedItem[]>>({});
  const [rankingHistory, setRankingHistory] = useState<RankingHistory | null>(null);
  const [publicProfileUser, setPublicProfileUser] = useState<{user: UserData, rankPos: number} | null>(null);

  // Avatar State
  const [isCustomizingAvatar, setIsCustomizingAvatar] = useState(false);
  const [equippedItems, setEquippedItems] = useState<EquippedItem[]>([]);
  const [equippedItemsLoaded, setEquippedItemsLoaded] = useState(false);
  const [liveAvatarConfig, setLiveAvatarConfig] = useState<any>(null);
  const [inventoryRefresh, setInventoryRefresh] = useState(0);

  // Level Up Animation State
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{oldRank: RankDef | null, newRank: RankDef} | null>(null);

  // Quests State
  const [activeQuests, setActiveQuests] = useState<any[]>([]);
  const [completedQuestIds, setCompletedQuestIds] = useState<string[]>([]);
  const [completedQuestDates, setCompletedQuestDates] = useState<Record<string, number>>({});
  const [loadingQuests, setLoadingQuests] = useState(true);
  const [activeLiveQuests, setActiveLiveQuests] = useState<Record<string, boolean>>({});

  // Status Bubbles
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null);
  
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [statusInputValue, setStatusInputValue] = useState('');

  const [currentHpVisual, setCurrentHpVisual] = useState(0);
  const [nextHeartProgress, setNextHeartProgress] = useState(0);

  // Configurações do Sistema
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'cube' | 'theme'>('cube');
  const [appTheme, setAppTheme] = useState(() => localStorage.getItem('appTheme') || 'default');
  const [appFonts, setAppFonts] = useState(() => localStorage.getItem('appFonts') || 'default');

  const [globalThemes, setGlobalThemes] = useState<CustomTheme[]>([]);
  const [showCustomThemeModal, setShowCustomThemeModal] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CustomTheme | undefined>(undefined);

  // Fetch Global Themes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'themes'), (snap) => {
      const t: CustomTheme[] = [];
      snap.forEach(d => t.push({ id: d.id, ...d.data() } as CustomTheme));
      setGlobalThemes(t);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fonts: Record<string, { heading: string, body: string }> = {
      'default': { heading: "'Cinzel', serif", body: "'Outfit', system-ui, sans-serif" },
      'classic': { heading: "'Playfair Display', serif", body: "'Lora', serif" },
      'scifi': { heading: "'Orbitron', sans-serif", body: "'Roboto', sans-serif" },
      'casual': { heading: "'Fredoka', sans-serif", body: "'Nunito', sans-serif" },
      'retro': { heading: "'Press Start 2P', cursive", body: "'VT323', monospace" },
      'clean': { heading: "'Oswald', sans-serif", body: "'Open Sans', sans-serif" }
    };
    
    const selected = fonts[appFonts] || fonts['default'];
    document.documentElement.style.setProperty('--font-heading', selected.heading);
    document.documentElement.style.setProperty('--font-body', selected.body);
  }, [appFonts]);
  const [cubeAutoRotate, setCubeAutoRotate] = useState(() => {
    const saved = localStorage.getItem('cubeAutoRotate');
    return saved !== null ? saved === 'true' : true;
  });
  const [cubeRotateInterval, setCubeRotateInterval] = useState(() => {
    const saved = localStorage.getItem('cubeRotateInterval');
    return saved !== null ? parseInt(saved, 10) : 5;
  });
  const [cubeIdleTime, setCubeIdleTime] = useState(() => {
    const saved = localStorage.getItem('cubeIdleTime');
    return saved !== null ? parseInt(saved, 10) : 60;
  });

  useEffect(() => {
    localStorage.setItem('cubeAutoRotate', String(cubeAutoRotate));
    localStorage.setItem('cubeRotateInterval', String(cubeRotateInterval));
    localStorage.setItem('cubeIdleTime', String(cubeIdleTime));
  }, [cubeAutoRotate, cubeRotateInterval, cubeIdleTime]);

  // Detector de inatividade para girar o cubo
  useEffect(() => {
    const handleInteraction = () => {
      lastInteractionTime.current = Date.now();
      if (isIdle) setIsIdle(false);
    };

    window.addEventListener('mousemove', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('click', handleInteraction);
    window.addEventListener('scroll', handleInteraction);

    const idleInterval = setInterval(() => {
      if (Date.now() - lastInteractionTime.current > cubeIdleTime * 1000) {
        if (!isIdle) setIsIdle(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('scroll', handleInteraction);
      clearInterval(idleInterval);
    };
  }, [isIdle, cubeIdleTime]);

  // Giro automático do cubo quando ocioso
  useEffect(() => {
    if (!cubeAutoRotate || !isIdle) return;
    const rotateInterval = setInterval(() => {
      setCubeRotation(prev => prev - 90);
    }, cubeRotateInterval * 1000); // Gira a cada X segundos
    return () => clearInterval(rotateInterval);
  }, [isIdle, cubeAutoRotate, cubeRotateInterval]);

  useEffect(() => {
    if (!userData || userData.role !== 'student' || !equippedItemsLoaded) return;
    
    const stats = calculateTotalStats(equippedItems);
    const maxHearts = 3 + Math.floor((RANKS.findIndex(r => r.name === currentRank.name) || 0) / 2) + Math.floor(stats.vitality / 30);
    const dbHearts = userData.hearts !== undefined ? Number(userData.hearts) : maxHearts;
    
    // A UI visual nunca deve mostrar mais do que o max atual
    setCurrentHpVisual(Math.min(dbHearts, maxHearts));
    
    // Se o jogador tem mais corações do que o máximo permitido (ex: perdeu XP/patente)
    if (dbHearts > maxHearts) {
      updateDoc(doc(db, 'users', userData.uid), { 
        hearts: maxHearts,
        hpRecoveryStartTimestamp: null 
      }).catch(console.error);
      setNextHeartProgress(0);
      return;
    }

    // Se está com vida cheia, zera qualquer timer
    if (dbHearts === maxHearts) {
      setNextHeartProgress(0);
      if (userData.hpRecoveryStartTimestamp) {
        updateDoc(doc(db, 'users', userData.uid), { hpRecoveryStartTimestamp: null }).catch(console.error);
      }
      return;
    }

    if (dbHearts < maxHearts && !userData.hpRecoveryStartTimestamp) {
      updateDoc(doc(db, 'users', userData.uid), { hpRecoveryStartTimestamp: Date.now() }).catch(console.error);
      setNextHeartProgress(0);
      return;
    }

    const RECOVERY_TIME_MS = 30 * 60 * 1000;
    
    const interval = setInterval(async () => {
      const now = Date.now();
      const timePassed = now - userData.hpRecoveryStartTimestamp;
      
      if (timePassed < 0) return;

      const recoveredHearts = Math.floor(timePassed / RECOVERY_TIME_MS);
      const remainderMs = timePassed % RECOVERY_TIME_MS;
      
      const newHp = Math.min(maxHearts, dbHearts + recoveredHearts);
      setCurrentHpVisual(newHp);
      
      if (newHp < maxHearts) {
        setNextHeartProgress((remainderMs / RECOVERY_TIME_MS) * 100);
      } else {
        setNextHeartProgress(0);
      }
      
      if (recoveredHearts > 0 && newHp > dbHearts) {
        try {
          const updates: any = { hearts: newHp };
          if (newHp < maxHearts) {
            updates.hpRecoveryStartTimestamp = userData.hpRecoveryStartTimestamp + (recoveredHearts * RECOVERY_TIME_MS);
          } else {
            updates.hpRecoveryStartTimestamp = null;
          }
          await updateDoc(doc(db, 'users', userData.uid), updates);
        } catch (e) {
          console.error(e);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [userData, equippedItemsLoaded, inventoryRefresh]);

  useEffect(() => {
    if (userData?.uid) {
      const fetchHistory = async () => {
        // Verifica o cache primeiro — histórico raramente muda durante a sessão
        const cacheKey = CACHE_KEYS.xpHistory(userData.uid);
        const cached = sessionCache.get<any[]>(cacheKey);
        if (cached) {
          setXpHistory(cached);
          setLoadingHistory(false);
          return;
        }
        const q = query(collection(db, 'xp_logs'), where('studentId', '==', userData.uid));
        const snap = await getDocs(q);
        const logs = snap.docs.map(d => d.data());
        logs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        sessionCache.set(cacheKey, logs, CACHE_TTL.XP_HISTORY);
        setXpHistory(logs);
        setLoadingHistory(false);
      };
      fetchHistory();

      const fetchQuests = async () => {
        setLoadingQuests(true);
        
        // Buscar tentativas concluídas (com cache)
        const attemptsCacheKey = `questAttemptsV2_${userData.uid}`;
        let completedIds: string[] = [];
        let completedDates: Record<string, number> = {};
        
        const cachedAttempts = sessionCache.get<{ids: string[], dates: Record<string, number>}>(attemptsCacheKey);
        
        if (cachedAttempts && cachedAttempts.ids) {
          completedIds = cachedAttempts.ids;
          completedDates = cachedAttempts.dates;
        } else {
          const attemptQ = query(collection(db, 'quest_attempts'), where('studentId', '==', userData.uid), where('status', '==', 'completed'));
          const attemptSnap = await getDocs(attemptQ);
          attemptSnap.forEach(doc => {
            const data = doc.data();
            if (data.questId) {
              completedIds.push(data.questId);
              // O campo correto no banco de dados se chama 'timestamp'
              completedDates[data.questId] = data.timestamp?.seconds 
                ? data.timestamp.seconds * 1000 
                : Date.now();
            }
          });
          sessionCache.set(attemptsCacheKey, { ids: completedIds, dates: completedDates }, CACHE_TTL.QUEST_ATTEMPTS);
        }
        setCompletedQuestIds(completedIds);
        setCompletedQuestDates(completedDates);

        // Buscar missões ativas (com cache por turma)
        const questsCacheKey = CACHE_KEYS.quests(userData.classId || 'all');
        let fetched: any[] = sessionCache.get<any[]>(questsCacheKey) || [];
        if (fetched.length === 0) {
          const q = query(collection(db, 'quests'), where('active', '==', true));
          const snap = await getDocs(q);
          fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          sessionCache.set(questsCacheKey, fetched, CACHE_TTL.QUESTS);
        }
        
        // Filtrar por turmas alvo
        const filteredQuests = fetched.filter((quest: any) => {
          if (!quest.targetClasses || quest.targetClasses.length === 0) return true;
          if (userData.role !== 'student') return true; // Professores/Admins veem todas
          return quest.targetClasses.includes(userData.classId);
        });

        // Ordenar as mais novas primeiro (pelo ID caso não haja createdAt)
        filteredQuests.sort((a: any, b: any) => {
          const timeA = a.createdAt?.seconds || parseInt(a.id) || 0;
          const timeB = b.createdAt?.seconds || parseInt(b.id) || 0;
          return timeB - timeA;
        });
        setActiveQuests(filteredQuests);
        setLoadingQuests(false);
      };
      fetchQuests();
    }
  }, [userData?.uid, userData?.classId, userData?.role]);

  useEffect(() => {
    if (!userData) return;
    const fetchEquipped = async () => {
      try {
        const qEquip = query(collection(db, 'user_items'), where('studentId', '==', userData.uid));
        const snapEquip = await getDocs(qEquip);
        const eq: EquippedItem[] = [];
        snapEquip.forEach(d => {
          const data = d.data();
          if (data.equipped === true && data.itemImageUrl && data.avatarPart) {
            let parsedAdds = [];
            if (data.adds) {
              try { parsedAdds = typeof data.adds === 'string' ? JSON.parse(data.adds) : data.adds; } catch(e){}
            }
            eq.push({ 
              docId: d.id,
              itemId: data.itemId,
              imageUrl: data.itemImageUrl, 
              avatarPart: data.avatarPart as any,
              itemTitle: data.itemTitle,
              itemCategory: data.itemCategory,
              baseAttributeType: data.baseAttributeType,
              baseAttributeValue: data.baseAttributeValue,
              adds: parsedAdds,
              gameModelUrl: data.gameModelUrl,
              modelTextureUrl: data.modelTextureUrl,
              minecraftHeadValue: data.minecraftHeadValue,
              modelTransforms: data.modelTransforms
            });
          }
        });
        setEquippedItems(eq);
      } catch (err) {
        console.error("Error fetching equipped items:", err);
      } finally {
        setEquippedItemsLoaded(true);
      }
    };
    fetchEquipped();
  }, [userData?.uid, inventoryRefresh]);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'student'));
    const unsubUsers = onSnapshot(q, (snap) => {
      const loaded: UserData[] = [];
      snap.forEach(d => loaded.push(d.data() as UserData));
      loaded.sort((a, b) => (b.xp || 0) - (a.xp || 0));
      setAllStudents(loaded);
      setLoadingRankings(false);
    });

    const unsubLiveQuests = onSnapshot(collection(db, 'live_quests'), (snap) => {
       const activeMap: Record<string, boolean> = {};
       snap.forEach(doc => {
         const data = doc.data();
         if (data.status && data.status !== 'finished') {
            activeMap[doc.id] = true;
         }
       });
       setActiveLiveQuests(activeMap);
    });

    return () => {
      unsubUsers();
      unsubLiveQuests();
    };
  }, [userData?.classId]);

  useEffect(() => {
    if (allStudents.length === 0) return;
    
    const checkAndSyncRankings = async () => {
      try {
        const docRef = doc(db, 'system', 'rankings');
        const snap = await getDoc(docRef);
        let history: RankingHistory = { general: {}, classes: {} };
        if (snap.exists()) {
          history = snap.data() as RankingHistory;
        }
        
        let changed = false;
        
        // General ranks
        allStudents.forEach((student, index) => {
          const rank = index + 1;
          const currentData = history.general[student.uid];
          if (!currentData || currentData.currentRank !== rank) {
            history.general[student.uid] = {
              currentRank: rank,
              previousRank: currentData ? currentData.currentRank : rank,
              rankSince: Date.now()
            };
            changed = true;
          }
        });
        
        // Class ranks
        const studentsByClass: Record<string, UserData[]> = {};
        allStudents.forEach(s => {
          if (s.classId) {
            if (!studentsByClass[s.classId]) studentsByClass[s.classId] = [];
            studentsByClass[s.classId].push(s);
          }
        });
        
        if (!history.classes) history.classes = {};
        
        Object.entries(studentsByClass).forEach(([classId, students]) => {
          if (!history.classes[classId]) history.classes[classId] = {};
          
          students.forEach((student, index) => {
            const rank = index + 1;
            const currentData = history.classes[classId][student.uid];
            if (!currentData || currentData.currentRank !== rank) {
              history.classes[classId][student.uid] = {
                currentRank: rank,
                previousRank: currentData ? currentData.currentRank : rank,
                rankSince: Date.now()
              };
              changed = true;
            }
          });
        });
        
        if (changed) {
          await setDoc(docRef, history);
        }
        setRankingHistory(history);
      } catch (err) {
        console.error("Erro ao sincronizar rankings:", err);
      }
    };
    
    // Pequeno delay para não atolar o Firestore caso vários usuários carreguem ao mesmo tempo
    const timeoutId = setTimeout(checkAndSyncRankings, 2000);
    return () => clearTimeout(timeoutId);
  }, [allStudents]);

  useEffect(() => {
    const fetchRankingItems = async () => {
      const classStudents = allStudents.filter(s => s.classId === userData?.classId).slice(0, 10);
      const top10General = allStudents.slice(0, 10);
      const studentIds = new Set<string>();
      
      classStudents.forEach(s => studentIds.add(s.uid));
      top10General.forEach(s => studentIds.add(s.uid));
      
      if (studentIds.size === 0) return;

      // Verifica o cache — itens do ranking mudam raramente
      const cacheKey = CACHE_KEYS.rankingItems();
      const cached = sessionCache.get<Record<string, EquippedItem[]>>(cacheKey);
      if (cached) {
        setRankingEquippedItems(cached);
        return;
      }
      
      try {
        const q = query(collection(db, 'user_items'), where('equipped', '==', true));
        const snap = await getDocs(q);
        const newRankingItems: Record<string, EquippedItem[]> = {};
        
        snap.forEach(d => {
          const data = d.data();
          if (studentIds.has(data.studentId) && data.itemImageUrl && data.avatarPart) {
            if (!newRankingItems[data.studentId]) newRankingItems[data.studentId] = [];
            newRankingItems[data.studentId].push({
              itemId: data.itemId,
              imageUrl: data.itemImageUrl,
              avatarPart: data.avatarPart as any,
              itemTitle: data.itemTitle,
              itemCategory: data.itemCategory,
              baseAttributeType: data.baseAttributeType,
              baseAttributeValue: data.baseAttributeValue,
              adds: data.adds,
              gameModelUrl: data.gameModelUrl,
              modelTextureUrl: data.modelTextureUrl,
              minecraftHeadValue: data.minecraftHeadValue,
              modelTransforms: data.modelTransforms
            } as EquippedItem);
          }
        });
        
        sessionCache.set(cacheKey, newRankingItems, CACHE_TTL.RANKING_ITEMS);
        setRankingEquippedItems(newRankingItems);
      } catch (e) {
        console.error(e);
      }
    };
    
    fetchRankingItems();
  }, [allStudents, userData?.classId]);

  const recentBubblesRef = useRef<string[]>([]);

  useEffect(() => {
    let timeoutId: any;

    const scheduleNextBubble = () => {
      // Tempo aleatório entre 60.000ms (1 min) e 120.000ms (2 min)
      const delay = Math.floor(Math.random() * (120000 - 60000 + 1)) + 60000;
      
      timeoutId = setTimeout(() => {
        const studentsWithStatus = allStudents.filter(s => s.customStatusText && s.customStatusText.trim() !== '');
        if (studentsWithStatus.length > 0) {
          let available = studentsWithStatus.filter(s => !recentBubblesRef.current.includes(s.uid));
          
          if (available.length === 0) {
            recentBubblesRef.current = [];
            available = studentsWithStatus;
          }
          
          const randomStudent = available[Math.floor(Math.random() * available.length)];
          setActiveBubbleId(randomStudent.uid);
          recentBubblesRef.current.push(randomStudent.uid);
          
          setTimeout(() => {
            setActiveBubbleId(prev => prev === randomStudent.uid ? null : prev);
          }, 4000);
        }
        
        scheduleNextBubble();
      }, delay);
    };

    scheduleNextBubble();
    
    return () => clearTimeout(timeoutId);
  }, [allStudents]);

  const currentRank = getRankForXp(userData?.xp || 0, userData?.classId);

  // Transition rank images for admins and teachers
  useEffect(() => {
    if (!userData || (userData.role !== 'admin' && userData.role !== 'teacher')) return;
    
    const originalRank = RANKS.find(r => r.name === currentRank.name) || currentRank;
    const allImages = [originalRank.imageUrl, ...(originalRank.variants?.map(v => v.imageUrl) || [])].filter(Boolean) as string[];

    if (allImages.length <= 1) return;

    const intervalId = setInterval(() => {
      setRankImageIndex(prev => (prev + 1) % allImages.length);
    }, 10000);

    return () => clearInterval(intervalId);
  }, [userData, currentRank.name]);

  const originalRank = RANKS.find(r => r.name === currentRank.name) || currentRank;
  const allRankImages = [originalRank.imageUrl, ...(originalRank.variants?.map(v => v.imageUrl) || [])].filter(Boolean) as string[];
  const isAdminOrTeacher = userData?.role === 'admin' || userData?.role === 'teacher';
  
  let currentDisplayImage = currentRank.imageUrl;
  if (isAdminOrTeacher && allRankImages.length > 1) {
    currentDisplayImage = allRankImages[rankImageIndex % allRankImages.length] || currentRank.imageUrl;
  }

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

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleUnequipItem = async (item: EquippedItem) => {
    if (!userData || !item.docId) return;
    try {
      await updateDoc(doc(db, 'user_items', item.docId), { equipped: false });
      // Remove do estado local para atualização instantânea (opcional, mas o inventário deve recarregar)
      setEquippedItems(prev => prev.filter(i => i.docId !== item.docId));
      setInventoryRefresh(prev => prev + 1);
    } catch (e) {
      console.error('Erro ao desequipar item:', e);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (status === userData?.customStatusText) return;
    
    if (hasProfanity(status)) {
      await showAlert('Sua mensagem contém palavras inadequadas e não foi salva.');
      return;
    }
    
    if (status.length > 50) {
      await showAlert('Sua mensagem é muito longa! Use no máximo 50 caracteres.');
      return;
    }

    await updateDoc(doc(db, 'users', userData!.uid), { customStatusText: status });
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

  // Moved outside to prevent remounting

  const renderRankingList = (list: UserData[], type: 'general' | 'class') => {
    if (loadingRankings) return <p style={{ color: 'var(--text-secondary)' }}>Calculando as posições...</p>;
    if (list.length === 0) return <p style={{ color: 'var(--text-secondary)' }}>Nenhum aluno no ranking.</p>;

    const getArrow = (student: UserData) => {
      if (!rankingHistory) return null;
      const historyData = type === 'general' ? rankingHistory.general[student.uid] : rankingHistory.classes?.[student.classId || '']?.[student.uid];
      if (!historyData) return null;
      
      const daysSince = (Date.now() - historyData.rankSince) / (1000 * 60 * 60 * 24);
      if (daysSince > 15) return null;
      
      const diff = historyData.previousRank - historyData.currentRank;
      if (diff === 0) return null;
      
      const isUp = diff > 0;
      const color = isUp ? '#4CAF50' : '#F44336';
      const arrow = isUp ? '▲' : '▼';
      
      let timeStr = '';
      if (daysSince < 1) {
         const hours = Math.floor(daysSince * 24);
         const mins = Math.floor(daysSince * 24 * 60);
         if (hours < 1) {
           timeStr = mins <= 1 ? 'menos de 1 min' : `${mins} min`;
         } else {
           timeStr = hours === 1 ? '1 hora' : `${hours} horas`;
         }
      } else {
         const d = Math.floor(daysSince);
         timeStr = d === 1 ? '1 dia' : `${d} dias`;
      }

      return (
        <span 
          style={{ color, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help', fontWeight: 'bold' }} 
          title={`Nesta posição há ${timeStr}`}
        >
          {arrow} {Math.abs(diff)}
        </span>
      );
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {list.map((student, index) => {
          const rankPos = index + 1;
          const sRank = getRankForXp(student.xp || 0, student.classId);
          
          let medalColor = 'var(--text-secondary)';
          let bgStyle = student.uid === userData?.uid ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255,255,255,0.02)';
          let borderStyle = student.uid === userData?.uid ? '1px solid var(--gold-primary)' : '1px solid transparent';
          let avatarSize = 45;
          let fontSizeTitle = '1.1rem';
          let fontSizeXp = '1.2rem';
          
          if (rankPos === 1) {
            medalColor = '#fbbf24'; // Gold
            avatarSize = 80;
            fontSizeTitle = '1.5rem';
            fontSizeXp = '1.6rem';
            bgStyle = student.uid === userData?.uid ? 'rgba(251, 191, 36, 0.2)' : 'linear-gradient(90deg, rgba(251, 191, 36, 0.1), rgba(0,0,0,0.2))';
            borderStyle = '1px solid #fbbf24';
          } else if (rankPos === 2) {
            medalColor = '#94a3b8'; // Silver
            avatarSize = 65;
            fontSizeTitle = '1.3rem';
            fontSizeXp = '1.4rem';
            bgStyle = student.uid === userData?.uid ? 'rgba(251, 191, 36, 0.15)' : 'linear-gradient(90deg, rgba(148, 163, 184, 0.1), rgba(0,0,0,0.2))';
            borderStyle = '1px solid #94a3b8';
          } else if (rankPos === 3) {
            medalColor = '#b45309'; // Bronze
            avatarSize = 55;
            fontSizeTitle = '1.2rem';
            fontSizeXp = '1.3rem';
            bgStyle = student.uid === userData?.uid ? 'rgba(251, 191, 36, 0.1)' : 'linear-gradient(90deg, rgba(180, 83, 9, 0.1), rgba(0,0,0,0.2))';
            borderStyle = '1px solid #b45309';
          }

          return (
            <div key={student.uid} className="glass-panel" style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', 
              background: bgStyle,
              border: borderStyle,
              boxShadow: rankPos === 1 ? '0 0 15px rgba(251, 191, 36, 0.2)' : 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '40px', textAlign: 'center', fontSize: rankPos <= 3 ? '1.5rem' : '1.2rem', fontWeight: 'bold', color: medalColor }}>
                  {rankPos}º
                </div>
                
                <div style={{ padding: '2px', borderRadius: '50%', border: `2px solid ${medalColor}`, boxShadow: rankPos === 1 ? '0 0 10px rgba(251,191,36,0.5)' : 'none' }}>
                      <RankingAvatar 
                        student={student} 
                        size={avatarSize} 
                        rankPos={rankPos} 
                        activeBubbleId={activeBubbleId}
                        equippedItems={rankingEquippedItems[student.uid] || []}
                        showAvatars={showRankingAvatars}
                        onAvatarClick={() => {
                          if (student.customStatusText) {
                            setActiveBubbleId(student.uid);
                            setTimeout(() => setActiveBubbleId(null), 3000);
                          }
                          setPublicProfileUser({ user: student, rankPos });
                        }}
                      />
                </div>
                
                <div>
                  <h4 style={{ margin: 0, fontSize: fontSizeTitle, display: 'flex', alignItems: 'center', gap: '0.5rem', color: rankPos === 1 ? '#fbbf24' : 'var(--text-primary)' }}>
                    {student.name} {student.uid === userData?.uid && <span style={{ fontSize: '0.7rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', padding: '2px 6px', borderRadius: '4px' }}>Você</span>}
                  </h4>
                  <div style={{ fontSize: '0.85rem', color: sRank.color, fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                    {sRank.name} {student.classId && <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', textShadow: 'none' }}>| {student.classId}</span>}
                  </div>
                </div>
              </div>
              
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  {getArrow(student)}
              </div>

              <div style={{ fontSize: fontSizeXp, fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                {student.xp || 0} XP
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const handleSelectClass = async (className: string) => {
    if (!userData) return;
    await updateDoc(doc(db, 'users', userData.uid), { classId: className });
  };

  const handleSelectTeacher = async () => {
    if (!userData) return;
    await updateDoc(doc(db, 'users', userData.uid), { role: 'pending_teacher' });
  };

  if (userData?.role === 'pending_teacher') {
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center', gap: '2rem' }}>
        <ShieldAlert size={64} color="var(--gold-primary)" />
        <h2 style={{ fontSize: '2rem', margin: 0 }}>Aguardando Aprovação</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', maxWidth: '500px' }}>
          Sua solicitação de acesso como Professor / Coordenador está em análise pelo Administrador do sistema.
          Por favor, aguarde a liberação.
        </p>
        <button className="login-btn" onClick={() => signOut(auth)} style={{ padding: '0.75rem 2rem', fontSize: '1.1rem' }}>
          Sair
        </button>
      </div>
    );
  }

  if (userData?.role === 'student' && !userData?.classId) {
    return <OnboardingModal userName={userData.name} onSelectClass={handleSelectClass} onSelectTeacher={handleSelectTeacher} />;
  }

  return (
    <div className="app-container">
      {showLevelUp && levelUpData && (
        <LevelUpModal 
          oldRank={levelUpData.oldRank} 
          newRank={levelUpData.newRank} 
          onClose={handleCloseLevelUp} 
          isMaxRank={levelUpData.newRank.minXp === Math.max(...RANKS.map(r => r.minXp))}
          avatarConfig={liveAvatarConfig || userData.avatarConfig}
          equippedItems={equippedItems}
        />
      )}

      {/* Modal de Configuração do Sistema */}
      {isSettingsModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass-panel" style={{ width: '600px', maxWidth: '95vw', display: 'flex', overflow: 'hidden', animation: 'slideUp 0.3s ease-out', position: 'relative', minHeight: '400px', padding: 0 }}>
            {/* Sidebar do Modal */}
            <div style={{ width: '200px', background: 'rgba(0,0,0,0.2)', borderRight: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1.5rem 1rem', borderBottom: '1px solid var(--border-glass)' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Settings size={20} color="var(--gold-primary)" /> Ajustes
                </h3>
              </div>
              <div style={{ padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button 
                  onClick={() => setSettingsTab('cube')}
                  style={{ background: settingsTab === 'cube' ? 'rgba(251, 191, 36, 0.1)' : 'transparent', color: settingsTab === 'cube' ? 'var(--gold-primary)' : 'var(--text-secondary)', border: 'none', padding: '1rem', textAlign: 'left', cursor: 'pointer', borderLeft: settingsTab === 'cube' ? '3px solid var(--gold-primary)' : '3px solid transparent', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: settingsTab === 'cube' ? 'bold' : 'normal' }}
                >
                  <Box size={18} /> Cubo 3D
                </button>
                <button 
                  onClick={() => setSettingsTab('theme')}
                  style={{ background: settingsTab === 'theme' ? 'rgba(251, 191, 36, 0.1)' : 'transparent', color: settingsTab === 'theme' ? 'var(--gold-primary)' : 'var(--text-secondary)', border: 'none', padding: '1rem', textAlign: 'left', cursor: 'pointer', borderLeft: settingsTab === 'theme' ? '3px solid var(--gold-primary)' : '3px solid transparent', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: settingsTab === 'theme' ? 'bold' : 'normal' }}
                >
                  <Palette size={18} /> Temas
                </button>
              </div>
            </div>

            {/* Conteúdo Principal do Modal */}
            <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
              <button onClick={() => setIsSettingsModalOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} className="hover-brightness">
                <X size={24} />
              </button>

              {settingsTab === 'cube' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left', flex: 1 }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>Configurações do Cubo</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ color: 'var(--text-primary)', display: 'block', fontWeight: 'bold' }}>Giro Automático</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Girar quando estiver ocioso</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input type="checkbox" checked={cubeAutoRotate} onChange={e => {
                          setCubeAutoRotate(e.target.checked);
                          localStorage.setItem('cubeAutoRotate', JSON.stringify(e.target.checked));
                      }} style={{ display: 'none' }} />
                      <div style={{ width: '40px', height: '20px', background: cubeAutoRotate ? 'var(--gold-primary)' : 'rgba(255,255,255,0.2)', borderRadius: '10px', position: 'relative', transition: '0.3s' }}>
                        <div style={{ position: 'absolute', top: '2px', left: cubeAutoRotate ? '22px' : '2px', width: '16px', height: '16px', background: cubeAutoRotate ? 'black' : 'white', borderRadius: '50%', transition: '0.3s' }} />
                      </div>
                    </label>
                  </div>

                  {cubeAutoRotate && (
                    <>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Tempo de Ociosidade (segundos)</label>
                        <input 
                          type="number" 
                          min="5" 
                          max="300"
                          value={cubeIdleTime}
                          onChange={e => {
                              const val = Math.max(5, parseInt(e.target.value) || 60);
                              setCubeIdleTime(val);
                              localStorage.setItem('cubeIdleTime', val.toString());
                          }}
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Intervalo de Giro (segundos)</label>
                        <input 
                          type="number" 
                          min="1" 
                          max="60"
                          value={cubeRotateInterval}
                          onChange={e => {
                              const val = Math.max(1, parseInt(e.target.value) || 5);
                              setCubeRotateInterval(val);
                              localStorage.setItem('cubeRotateInterval', val.toString());
                          }}
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {settingsTab === 'theme' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1rem 0' }}>
                    <h4 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Temas do Sistema</h4>
                    <button 
                      onClick={() => {
                        let tData = DEFAULT_FANTASY_THEME;
                        if (appTheme === 'custom_local') {
                           const saved = localStorage.getItem('currentCustomThemeData');
                           if (saved) tData = JSON.parse(saved);
                        } else if (appTheme.startsWith('custom_')) {
                           const gt = globalThemes.find(g => g.id === appTheme);
                           if (gt) tData = gt;
                        }
                        setEditingTheme(tData);
                        setShowCustomThemeModal(true);
                      }}
                      style={{ padding: '0.4rem 0.75rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                      className="hover-brightness"
                    >
                      <Palette size={16} /> Personalizar
                    </button>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                    {[
                      { id: 'default', name: 'Padrão (Dark RPG)', color: '#0f172a', isCustom: false },
                      { id: 'light', name: 'Amanhecer (Claro)', color: '#f8fafc', isCustom: false },
                      ...globalThemes.map(gt => ({ id: gt.id, name: gt.name, color: gt.colors.bgDark, isCustom: true, data: gt })),
                      { 
                        id: 'custom_local', 
                        name: (localStorage.getItem('currentCustomThemeData') ? JSON.parse(localStorage.getItem('currentCustomThemeData') || '{}').name : 'Meu Tema') + ' (Pessoal)', 
                        color: '#7dd3fc', 
                        isCustom: true 
                      }
                    ].map(t => (
                      <div 
                        key={t.id} 
                        onClick={() => {
                          setAppTheme(t.id);
                          localStorage.setItem('appTheme', t.id);
                          document.body.setAttribute('data-theme', t.id);
                          
                          if (t.isCustom) {
                            if (t.id === 'custom_local') {
                              const localData = localStorage.getItem('currentCustomThemeData');
                              if (localData) {
                                applyCustomTheme(JSON.parse(localData));
                              } else {
                                applyCustomTheme(DEFAULT_FANTASY_THEME);
                              }
                            } else if ((t as any).data) {
                              localStorage.setItem('currentCustomThemeData', JSON.stringify((t as any).data));
                              applyCustomTheme((t as any).data as CustomTheme);
                            }
                          } else {
                            applyCustomTheme(null);
                          }
                        }}
                        style={{ padding: '1rem', border: appTheme === t.id ? '2px solid var(--gold-primary)' : '2px solid transparent', background: 'var(--bg-card)', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', transition: '0.2s' }}
                        className="hover-brightness"
                      >
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: t.color, border: '2px solid var(--border-glass)' }} />
                        <span style={{ fontWeight: appTheme === t.id ? 'bold' : 'normal', color: appTheme === t.id ? 'var(--gold-primary)' : 'var(--text-primary)' }}>{t.name}</span>
                        {appTheme === t.id && <CheckCircle size={18} color="var(--gold-primary)" style={{ marginLeft: 'auto' }} />}
                        
                        {t.isCustom && appTheme === t.id && (
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setEditingTheme((t as any).data || (localStorage.getItem('currentCustomThemeData') ? JSON.parse(localStorage.getItem('currentCustomThemeData')!) : DEFAULT_FANTASY_THEME));
                               setShowCustomThemeModal(true);
                             }}
                             style={{ background: 'transparent', border: 'none', color: 'var(--gold-primary)', cursor: 'pointer', padding: '0.25rem' }}
                             title="Editar Tema"
                           >
                             <Edit3 size={18} />
                           </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <h4 style={{ margin: '1.5rem 0 1rem 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>Estilo de Fonte</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }} className="custom-scrollbar">
                    {[
                      { id: 'default', name: 'Padrão (Épico)', desc: 'Cinzel & Outfit' },
                      { id: 'classic', name: 'Clássico (Medieval)', desc: 'Playfair & Lora' },
                      { id: 'scifi', name: 'Ficção (Moderno)', desc: 'Orbitron & Roboto' },
                      { id: 'casual', name: 'Casual (Divertido)', desc: 'Fredoka & Nunito' },
                      { id: 'retro', name: 'Retrô (Pixel Art)', desc: 'Press Start 2P & VT323' },
                      { id: 'clean', name: 'Limpo (Corporativo)', desc: 'Oswald & Open Sans' }
                    ].map(f => (
                      <div 
                        key={f.id} 
                        onClick={() => {
                          setAppFonts(f.id);
                          localStorage.setItem('appFonts', f.id);
                        }}
                        style={{ padding: '0.75rem 1rem', border: appFonts === f.id ? '2px solid var(--gold-primary)' : '2px solid transparent', background: 'var(--bg-card)', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', transition: '0.2s' }}
                        className="hover-brightness"
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <span style={{ fontWeight: appFonts === f.id ? 'bold' : 'normal', color: appFonts === f.id ? 'var(--gold-primary)' : 'var(--text-primary)' }}>{f.name}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{f.desc}</span>
                        </div>
                        {appFonts === f.id && <CheckCircle size={18} color="var(--gold-primary)" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-glass)' }}>
                <button onClick={() => setIsSettingsModalOpen(false)} className="login-btn" style={{ padding: '0.5rem 1.5rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>
                  Concluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCustomThemeModal && editingTheme && (
        <CustomThemeModal
          initialTheme={editingTheme}
          isAdmin={userData?.role !== 'student'}
          onPreview={(theme) => {
            applyCustomTheme(theme);
          }}
          onClose={() => {
            setShowCustomThemeModal(false);
            // Restore previous active theme
            const cur = localStorage.getItem('appTheme') || 'default';
            if (cur.startsWith('custom_')) {
               const saved = localStorage.getItem('currentCustomThemeData');
               if (saved) applyCustomTheme(JSON.parse(saved));
            } else {
               applyCustomTheme(null);
            }
          }}
          onSave={async (theme) => {
            if (theme.isGlobal && userData?.role !== 'student') {
               const newId = theme.id.startsWith('custom_local') ? 'custom_' + Date.now() : theme.id;
               theme.id = newId;
               await setDoc(doc(db, 'themes', newId), theme);
               setAppTheme(newId);
               localStorage.setItem('appTheme', newId);
               localStorage.setItem('currentCustomThemeData', JSON.stringify(theme));
               applyCustomTheme(theme);
            } else {
               theme.id = 'custom_local';
               theme.isGlobal = false;
               setAppTheme('custom_local');
               localStorage.setItem('appTheme', 'custom_local');
               localStorage.setItem('currentCustomThemeData', JSON.stringify(theme));
               applyCustomTheme(theme);
            }
            setShowCustomThemeModal(false);
          }}
        />
      )}

      {userData && isCustomizingAvatar && (
        <AvatarCustomizationModal
          isOpen={isCustomizingAvatar}
          onClose={() => setIsCustomizingAvatar(false)}
          equippedItems={equippedItems}
          userData={userData}
          initialConfig={liveAvatarConfig || userData.avatarConfig}
          onSave={(newConfig) => {
            setLiveAvatarConfig(newConfig);
            setIsCustomizingAvatar(false);
          }}
          onPositionsSaved={() => setInventoryRefresh(prev => prev + 1)}
        />
      )}

      {publicProfileUser && (
        <PublicProfileModal
          isOpen={!!publicProfileUser}
          onClose={() => setPublicProfileUser(null)}
          user={publicProfileUser.user}
          rankPos={publicProfileUser.rankPos}
          equippedItems={rankingEquippedItems[publicProfileUser.user.uid] || []}
          rankName={getRankForXp(publicProfileUser.user.xp || 0, publicProfileUser.user.classId).name}
          rankColor={getRankForXp(publicProfileUser.user.xp || 0, publicProfileUser.user.classId).color}
        />
      )}

      <div style={{ position: 'sticky', top: 0, zIndex: 100, margin: '-1rem -2rem 0 -2rem', padding: '1rem 2rem 0.5rem 2rem', background: 'transparent', backdropFilter: 'blur(12px)' }}>
      <nav className="navbar glass-panel compact-nav" style={{ position: 'static', marginBottom: '1rem' }}>
        <div className="logo-container">
          <Trophy className="logo-icon" color="var(--gold-primary)" size={32} />
          <h1 className="title-glow">Painel do Aluno</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          
          {(userData?.role === 'admin' || userData?.role === 'teacher') && (
            <button 
              className="login-btn" 
              onClick={() => navigate('/admin')}
              style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(251, 191, 36, 0.1)', borderColor: 'var(--gold-primary)' }}
            >
              <ShieldAlert size={18} color="var(--gold-primary)" />
              <span style={{ color: 'var(--gold-primary)' }}>{userData?.role === 'admin' ? 'Painel Master' : 'Painel do Professor'}</span>
            </button>
          )}

          <button 
            onClick={() => setIsSettingsModalOpen(true)}
            style={{ background: 'transparent', border: 'none', color: 'var(--gold-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.5rem' }}
            className="hover-brightness"
            title="Configurações do Sistema"
          >
            <Settings size={24} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '50px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              {userData && (
                <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)' }}>
                  <AvatarCharacter config={liveAvatarConfig || userData.avatarConfig} size={36} interactive={false} animation="none" />
                </div>
              )}
              <span style={{ fontWeight: 'bold' }}>{userData?.name?.split(' ')[0]}</span>
            </div>
          </div>
          <button className="login-btn" onClick={handleLogout} style={{ padding: '0.75rem', borderRadius: '50%' }} title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      {/* Navegação de Abas do Aluno */}
      <div className="scrollable-menu-container" style={{ background: 'transparent', margin: '0 -2rem 0 -2rem', padding: '0.5rem 2rem' }}>
        <button 
          onClick={() => setActiveTab('quests')}
          style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: activeTab === 'quests' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'quests' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
        >
          <Swords size={20} /> Central de Missões
        </button>
        <button 
          onClick={() => setActiveTab('profile')}
          style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: activeTab === 'profile' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'profile' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
        >
          <Star size={20} /> Meu Perfil
        </button>
        <button 
          onClick={() => setActiveTab('ranking_class')}
          style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: activeTab === 'ranking_class' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'ranking_class' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
        >
          <Users size={20} /> Ranking da Turma
        </button>
        <button 
          onClick={() => setActiveTab('ranking_general')}
          style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: activeTab === 'ranking_general' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'ranking_general' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
        >
          <TrendingUp size={20} /> Ranking Geral
        </button>
        <button 
          onClick={() => setActiveTab('store')}
          style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: activeTab === 'store' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'store' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s' }}
        >
          <Store size={20} /> Mercado
        </button>
      </div>
      </div>

      <main className="main-content">
        
        {activeTab === 'quests' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div className="compact-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Swords size={32} color="var(--gold-primary)" />
              <div>
                <h2>Central de Missões</h2>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem' }}>
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
                      onClick={() => {
                        if (quest.mode === 'live') {
                          // Don't navigate to a completed or inactive live quest
                          if (isCompleted || !activeLiveQuests[quest.id]) return;
                          navigate(`/live/${quest.id}`);
                        } else {
                          navigate(isCompleted ? `/quest/${quest.id}?study=true` : `/quest/${quest.id}`);
                        }
                      }}
                    >
                      <div style={{ height: '140px', width: '100%', position: 'relative' }}>
                        {quest.coverImageUrl ? (
                          <img src={quest.coverImageUrl} alt={quest.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, var(--bg-dark), var(--accent-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Swords size={64} color="rgba(255,255,255,0.2)" />
                          </div>
                        )}
                        <div style={{ position: 'absolute', top: '10px', right: '10px', background: isCompleted ? 'rgba(16, 185, 129, 0.9)' : 'var(--bg-badge)', padding: '0.5rem 1rem', borderRadius: '20px', border: `1px solid ${isCompleted ? 'var(--accent-green)' : 'var(--gold-primary)'}`, color: isCompleted ? 'var(--text-on-gold, #000000)' : 'var(--gold-primary)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isCompleted ? <CheckCircle size={16} /> : <Star size={16} />} 
                          {isCompleted ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                              <span>Concluída</span>
                              {completedQuestDates[quest.id] && (
                                <span style={{ fontSize: '0.65rem', fontWeight: 'normal', opacity: 0.8 }}>
                                  em {new Date(completedQuestDates[quest.id]).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span>{quest.baseXp} XP</span>
                          )}
                        </div>
                      </div>
                      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0' }}>{quest.title}</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem', flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {quest.description || 'Uma missão misteriosa aguarda você...'}
                        </p>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <ShieldAlert size={14} style={{ flexShrink: 0 }} /> 
                              <span>{quest.allowRetries ? 'Vidas Extras' : 'Hardcore'}</span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <Clock size={14} style={{ flexShrink: 0 }} /> 
                              <span>{quest.questions?.length || 0} Desafios</span>
                            </span>
                          </div>
                            <button 
                              className="login-btn" 
                              disabled={quest.mode === 'live' && (!activeLiveQuests[quest.id] && !isCompleted)}
                              style={{ 
                                background: (isCompleted || (quest.mode === 'live' && !activeLiveQuests[quest.id] && !isCompleted)) ? 'var(--btn-bg)' : 'var(--gold-primary)', 
                                color: (isCompleted || (quest.mode === 'live' && !activeLiveQuests[quest.id] && !isCompleted)) ? 'var(--text-primary)' : 'var(--text-on-gold, #000000)', 
                                border: (isCompleted || (quest.mode === 'live' && !activeLiveQuests[quest.id] && !isCompleted)) ? '1px solid var(--border-glass)' : 'none', 
                                padding: '0.5rem 1.5rem', 
                                fontSize: '1rem',
                                opacity: (quest.mode === 'live' && (!activeLiveQuests[quest.id] && !isCompleted)) ? 0.6 : 1,
                                cursor: (quest.mode === 'live' && (!activeLiveQuests[quest.id] && !isCompleted)) ? 'not-allowed' : 'pointer'
                              }} 
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                // Block access to inactive live quests if NOT completed
                                if (quest.mode === 'live' && (!activeLiveQuests[quest.id] && !isCompleted)) return;
                                if (!isCompleted && (userData?.hearts || 0) < 1 && userData?.role === 'student') {
                                  await showAlert("Você precisa de pelo menos 1 coração (vida) para jogar um desafio! Espere regenerar ou use um item de cura.");
                                  return;
                                }
                                if (quest.mode === 'live' && !isCompleted) {
                                  navigate(`/live/${quest.id}`);
                                } else {
                                  navigate(isCompleted ? `/quest/${quest.id}?study=true` : `/quest/${quest.id}`); 
                                }
                              }}
                            >
                              {quest.mode === 'live' && !isCompleted
                                 ? (activeLiveQuests[quest.id] ? 'Batalha Ao Vivo' : 'Não Iniciada') 
                                 : (isCompleted ? 'Revisar' : 'Jogar Agora')}
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
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ display: 'flex', gap: '1rem', padding: '0.5rem 0', marginBottom: '0.5rem', justifyContent: 'center', position: 'sticky', top: '60px', zIndex: 95, background: 'transparent', backdropFilter: 'blur(12px)' }}>
              <button 
                onClick={() => setProfileTab('overview')}
                className="login-btn"
                style={{ background: profileTab === 'overview' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: profileTab === 'overview'  ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
              >
                <Star size={20} /> Personagem e Histórico
              </button>
              <button 
                onClick={() => setProfileTab('inventory')}
                className="login-btn"
                style={{ background: profileTab === 'inventory' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: profileTab === 'inventory'  ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
              >
                <Package size={20} /> Mochila
              </button>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Perfil do Aluno (Esquerda) */}
              <div className="glass-panel" style={{ flex: '1 1 400px', padding: '1.5rem 2rem', textAlign: 'center', position: 'relative' }}>
              <div 
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '1.5rem', marginBottom: '2.5rem', perspective: '1000px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button onClick={() => setCubeRotation(prev => prev + 90)} style={{ background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer', zIndex: 10 }}>
                    {'<'}
                  </button>
                  
                  <div className="cube-container">
                    <div className="cube" style={{ transform: `rotateY(${cubeRotation}deg)` }}>
                      {/* Frente: Avatar */}
                      <div className="cube-face cube-face-front" style={{ border: `3px solid ${currentRank.color}`, boxShadow: `0 0 20px ${currentRank.color}40`, flexDirection: 'column' }} title="Clique para personalizar seu personagem">
                        {(liveAvatarConfig || userData?.avatarConfig) ? (
                          <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', position: 'relative' }} onClick={() => setIsCustomizingAvatar(true)}>
                            <AvatarCharacter config={(liveAvatarConfig || userData.avatarConfig)} size={90} equippedItems={equippedItems} interactive={false} animation={getProfileAvatarState(userData, liveAvatarConfig || userData.avatarConfig).animation as any} expression={getProfileAvatarState(userData, liveAvatarConfig || userData.avatarConfig).expression as any} showSlots={true} onAvatarClick={() => setIsCustomizingAvatar(true)} onSlotClick={handleUnequipItem} />
                          </div>
                        ) : (
                          <img onClick={() => setIsCustomizingAvatar(true)} src={userData?.photoURL} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px', cursor: 'pointer' }} />
                        )}
                        <div style={{ position: 'absolute', bottom: -15, left: '50%', transform: 'translateX(-50%)', background: currentRank.color, padding: '0.25rem 1rem', borderRadius: '20px', color: '#fff', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', boxShadow: `0 0 10px ${currentRank.color}80`, zIndex: 10 }}>
                          Personagem
                        </div>
                      </div>

                      {/* Trás: Patente */}
                      <div className="cube-face cube-face-back" style={{ border: `3px solid ${currentRank.color}`, boxShadow: `0 0 20px ${currentRank.color}40`, flexDirection: 'column' }}>
                        {currentDisplayImage ? (
                          <img key={currentDisplayImage} src={currentDisplayImage} alt={currentRank.name} style={{ width: 110, height: 110, objectFit: 'contain', filter: `drop-shadow(0 0 20px ${currentRank.color}80)`, animation: 'epicZoom 1s ease-out' }} />
                        ) : (
                          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: currentRank.color }}>{currentRank.name}</div>
                        )}
                        <div style={{ position: 'absolute', bottom: -15, left: '50%', transform: 'translateX(-50%)', background: currentRank.color, padding: '0.25rem 1rem', borderRadius: '20px', color: '#fff', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', boxShadow: `0 0 10px ${currentRank.color}80`, zIndex: 10 }}>
                          {currentRank.name}
                        </div>
                      </div>

                      {/* Direita: Pet */}
                      <div className="cube-face cube-face-right" style={{ border: `3px solid ${currentRank.color}`, boxShadow: `0 0 20px ${currentRank.color}40`, flexDirection: 'column' }}>
                        {(() => {
                          const equippedPet = equippedItems.find(item => item.avatarPart === 'pet');
                          return equippedPet ? (
                            <img src={equippedPet.imageUrl} alt="Pet" style={{ width: 80, height: 80, objectFit: 'contain', animation: 'float 3s ease-in-out infinite' }} />
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.5 }}>
                              <div style={{ width: 60, height: 60, border: '2px dashed var(--border-glass)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '1.5rem' }}>🐾</span>
                              </div>
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Nenhum Pet</span>
                            </div>
                          );
                        })()}
                        <div style={{ position: 'absolute', bottom: -15, left: '50%', transform: 'translateX(-50%)', background: currentRank.color, padding: '0.25rem 1rem', borderRadius: '20px', color: '#fff', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', boxShadow: `0 0 10px ${currentRank.color}80`, zIndex: 10 }}>
                          Companheiro
                        </div>
                      </div>

                      {/* Esquerda: Placeholder (Em Breve) */}
                      <div className="cube-face cube-face-left" style={{ border: `1px dashed var(--border-glass)` }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Em Breve</span>
                      </div>
                    </div>
                  </div>

                  <button onClick={() => setCubeRotation(prev => prev - 90)} style={{ background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer', zIndex: 10 }}>
                    {'>'}
                  </button>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0' }}>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--text-primary)' }}>{userData?.name}</h2>
              </div>
              
              {isEditingStatus ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', background: 'var(--btn-bg)', padding: '0.25rem 1rem', borderRadius: '20px' }}>
                  <MessageCircle size={16} color="var(--text-secondary)" />
                  <input 
                    autoFocus
                    value={statusInputValue}
                    onChange={e => setStatusInputValue(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        await handleUpdateStatus(statusInputValue);
                        setIsEditingStatus(false);
                      }
                      if (e.key === 'Escape') {
                        setIsEditingStatus(false);
                      }
                    }}
                    onBlur={async () => {
                      await handleUpdateStatus(statusInputValue);
                      setIsEditingStatus(false);
                    }}
                    placeholder="Escreva seu status..."
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', flex: 1, outline: 'none', fontStyle: 'italic', width: '100%' }}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', background: 'var(--btn-bg)', padding: '0.25rem 1rem', borderRadius: '20px', color: 'var(--text-secondary)', minHeight: '36px' }}>
                  <MessageCircle size={16} />
                  <span style={{ fontStyle: 'italic', flex: 1 }}>{userData?.customStatusText ? `"${userData.customStatusText}"` : "Escreva seu status..."}</span>
                  <button onClick={() => { setStatusInputValue(userData?.customStatusText || ''); setIsEditingStatus(true); }} style={{ background: 'transparent', border: 'none', color: 'var(--gold-primary)', cursor: 'pointer', padding: '0 0.25rem', display: 'flex' }} className="hover-brightness" title="Editar Status">
                    <Edit3 size={14} />
                  </button>
                </div>
              )}

              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                Turma: {userData?.classId || 'Não definida'}
              </p>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Experiência Total</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Star size={16} /> {userData?.xp || 0} XP
                  </span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0', marginTop: '0.5rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Vidas (HP)</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {(() => {
                      const stats = calculateTotalStats(equippedItems);
                      const maxHearts = 3 + Math.floor((RANKS.findIndex(r => r.name === currentRank.name) || 0) / 2) + Math.floor(stats.vitality / 30);
                      const displayHp = userData?.role === 'admin' || userData?.role === 'teacher' ? maxHearts : currentHpVisual;
                      return Array.from({ length: maxHearts }).map((_, i) => {
                        if (i < displayHp) {
                          return (
                            <div key={i} style={{ position: 'relative', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Heart size={20} fill="#ef4444" color="#ef4444" />
                            </div>
                          );
                        } else if (i === displayHp && userData?.hpRecoveryStartTimestamp && displayHp < maxHearts) {
                          // Recovering heart
                          const minsLeft = Math.ceil(((100 - nextHeartProgress) / 100) * 30);
                          return (
                            <div key={i} title={`Recuperando vida... ${minsLeft} min restantes`} style={{ position: 'relative', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}>
                              <Heart className="recovering-heart" size={20} fill="transparent" color="rgba(255,255,255,0.4)" style={{ position: 'absolute', top: 0, left: 0 }} />
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${nextHeartProgress}%`, overflow: 'hidden', transition: 'height 1s linear' }}>
                                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Heart size={20} fill="#ef4444" color="#ef4444" />
                                </div>
                              </div>
                            </div>
                          );
                        } else {
                          // Empty heart
                          return (
                            <div key={i} style={{ position: 'relative', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Heart size={20} fill="transparent" color="rgba(255,255,255,0.2)" />
                            </div>
                          );
                        }
                      });
                    })()}
                  </span>
                </div>
                
                {nextRank ? (
                  <>
                    <div style={{ width: '100%', height: '6px', background: 'var(--bg-dark)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.75rem', marginBottom: '0.25rem' }}>
                      <div style={{ height: '100%', width: `${progressPercentage}%`, background: `linear-gradient(90deg, ${currentRank.color}, ${nextRank.color})`, borderRadius: '3px', transition: 'width 1s ease-in-out' }}></div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span>{currentRank.name}</span>
                      <span>Faltam {nextRank.minXp - (userData?.xp || 0)} XP para {nextRank.name}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                    Patente Máxima Alcançada!
                  </div>
                )}
              </div>
            </div>

            {/* Coluna Direita Alternável (Histórico ou Mochila) */}
            {profileTab === 'overview' ? (
              <div className="glass-panel" style={{ flex: '2 1 500px', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 140px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                <History size={24} color="var(--gold-primary)" />
                <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Histórico de Conquistas</h3>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', maxHeight: '600px', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
            ) : (
              <div className="glass-panel" style={{ flex: '2 1 500px', padding: '2rem', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
                {userData && <StudentInventory userData={userData} onEquip={() => setInventoryRefresh(r => r + 1)} inventoryRefresh={inventoryRefresh} />}
              </div>
            )}
            </div>
          </div>
        )}

        {activeTab === 'ranking_class' && (
          <div className="glass-panel" style={{ padding: '0', animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-glass)', position: 'sticky', top: '75px', zIndex: 90, background: 'var(--bg-card)', backdropFilter: 'blur(12px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
              <Users size={32} color="var(--gold-primary)" />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '2rem', margin: 0 }}>Top 10 da Turma</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Sua sala: {userData?.classId || 'Não definida'}</p>
              </div>
              <button 
                onClick={() => setShowRankingAvatars(!showRankingAvatars)}
                className="login-btn"
                style={{ background: 'transparent', border: '1px solid var(--gold-primary)', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                title={showRankingAvatars ? "Ocultar Avatares" : "Mostrar Avatares"}
              >
                {showRankingAvatars ? <EyeOff size={18} /> : <Eye size={18} />}
                {showRankingAvatars ? 'Ocultar Avatares' : 'Mostrar Avatares'}
              </button>
            </div>
            <div style={{ padding: '2rem' }}>
              {userData?.classId ? renderRankingList(classStudents, 'class') : <p style={{ color: 'var(--text-secondary)' }}>Você precisa estar em uma turma para ver o ranking dela.</p>}
            </div>
          </div>
        )}

        {activeTab === 'ranking_general' && (
          <div className="glass-panel" style={{ padding: '0', animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-glass)', position: 'sticky', top: '75px', zIndex: 90, background: 'var(--bg-card)', backdropFilter: 'blur(12px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
              <Trophy size={32} color="var(--gold-primary)" />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '2rem', margin: 0 }}>Top 10 Geral</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Os maiores pontuadores de toda a escola.</p>
              </div>
              <button 
                onClick={() => setShowRankingAvatars(!showRankingAvatars)}
                className="login-btn"
                style={{ background: 'transparent', border: '1px solid var(--gold-primary)', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                title={showRankingAvatars ? "Ocultar Avatares" : "Mostrar Avatares"}
              >
                {showRankingAvatars ? <EyeOff size={18} /> : <Eye size={18} />}
                {showRankingAvatars ? 'Ocultar Avatares' : 'Mostrar Avatares'}
              </button>
            </div>
            <div style={{ padding: '2rem' }}>
              {renderRankingList(top10General, 'general')}
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
