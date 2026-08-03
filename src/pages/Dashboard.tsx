import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Trophy, Settings, History, ShieldAlert, Star, TrendingUp, Users, Swords, Clock, CheckCircle, Store, Heart, Package } from 'lucide-react';
import { useAuth, type UserData } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { getRankForXp, RANKS, type RankDef } from '../lib/ranks';
import LevelUpModal from '../components/LevelUpModal';
import StudentStore from '../components/StudentStore';
import StudentInventory from '../components/StudentInventory';
import { useDialog } from '../contexts/DialogContext';
import AvatarCharacter, { type EquippedItem } from '../components/AvatarCharacter';
import PublicProfileModal from '../components/PublicProfileModal';
import AvatarCustomizationModal from '../components/AvatarCustomizationModal';
import { getProfileAvatarState, hasProfanity } from '../lib/avatarState';
import { Edit3, MessageCircle } from 'lucide-react';
import { sessionCache, CACHE_KEYS, CACHE_TTL } from '../lib/sessionCache';
import OnboardingModal from '../components/OnboardingModal';

export interface RankingHistory {
  general: Record<string, { currentRank: number; previousRank: number; rankSince: number }>;
  classes: Record<string, Record<string, { currentRank: number; previousRank: number; rankSince: number }>>;
}

const RankingAvatar = React.memo(({ student, size, rankPos = 1, equippedItems, activeBubbleId, onAvatarClick }: { 
  student: UserData; 
  size: number; 
  rankPos?: number; 
  equippedItems: EquippedItem[];
  activeBubbleId: string | null;
  onAvatarClick?: () => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const avatarState = getProfileAvatarState(student);
  const show3D = rankPos <= 3 || isHovered;
  
  let finalAnimation = show3D ? (avatarState.animation as any) : 'idle';
  if (rankPos === 1 && show3D) {
    finalAnimation = 'cheer';
  }

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onAvatarClick}
      style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'visible', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >
      {activeBubbleId === student.uid && student.customStatusText && (
        <div style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', background: 'white', color: 'black', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', whiteSpace: 'nowrap', zIndex: 50, boxShadow: '0 4px 10px rgba(0,0,0,0.5)', animation: 'epicZoom 0.3s ease-out' }}>
          {student.customStatusText}
          <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: 'white' }} />
        </div>
      )}
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
  );
});

export default function Dashboard() {
  const { showAlert, showPrompt } = useDialog();
  const { userData } = useAuth();
  if (!userData) return null;
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('quests');
  const [profileTab, setProfileTab] = useState('overview');
  const [xpHistory, setXpHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // Rankings state
  const [allStudents, setAllStudents] = useState<UserData[]>([]);
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [rankingEquippedItems, setRankingEquippedItems] = useState<Record<string, EquippedItem[]>>({});
  const [rankingHistory, setRankingHistory] = useState<RankingHistory | null>(null);
  const [publicProfileUser, setPublicProfileUser] = useState<{user: UserData, rankPos: number} | null>(null);

  // Avatar State
  const [isCustomizingAvatar, setIsCustomizingAvatar] = useState(false);
  const [equippedItems, setEquippedItems] = useState<EquippedItem[]>([]);
  const [liveAvatarConfig, setLiveAvatarConfig] = useState<any>(null);
  const [inventoryRefresh, setInventoryRefresh] = useState(0);

  // Level Up Animation State
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{oldRank: RankDef | null, newRank: RankDef} | null>(null);

  // Quests State
  const [activeQuests, setActiveQuests] = useState<any[]>([]);
  const [completedQuestIds, setCompletedQuestIds] = useState<string[]>([]);
  const [loadingQuests, setLoadingQuests] = useState(true);
  const [activeLiveQuests, setActiveLiveQuests] = useState<Record<string, boolean>>({});

  // Status Bubbles
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null);

  const [currentHpVisual, setCurrentHpVisual] = useState(0);
  const [nextHeartProgress, setNextHeartProgress] = useState(0);

  useEffect(() => {
    if (!userData || userData.role !== 'student') return;
    
    const maxHearts = 3 + Math.floor((RANKS.findIndex(r => r.name === currentRank.name) || 0) / 2);
    const dbHearts = userData.hearts !== undefined ? Number(userData.hearts) : maxHearts;
    
    setCurrentHpVisual(dbHearts);
    
    if (dbHearts < maxHearts && !userData.hpRecoveryStartTimestamp) {
      updateDoc(doc(db, 'users', userData.uid), { hpRecoveryStartTimestamp: Date.now() }).catch(console.error);
      setNextHeartProgress(0);
      return;
    }

    if (dbHearts >= maxHearts) {
      setNextHeartProgress(0);
      if (userData.hpRecoveryStartTimestamp) {
        updateDoc(doc(db, 'users', userData.uid), { hpRecoveryStartTimestamp: null }).catch(console.error);
      }
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
  }, [userData]);

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
        const attemptsCacheKey = CACHE_KEYS.questAttempts(userData.uid);
        let completedIds: string[] = sessionCache.get<string[]>(attemptsCacheKey) || [];
        if (completedIds.length === 0) {
          const attemptQ = query(collection(db, 'quest_attempts'), where('studentId', '==', userData.uid), where('status', '==', 'completed'));
          const attemptSnap = await getDocs(attemptQ);
          attemptSnap.forEach(doc => {
            if (doc.data().questId) completedIds.push(doc.data().questId);
          });
          sessionCache.set(attemptsCacheKey, completedIds, CACHE_TTL.QUEST_ATTEMPTS);
        }
        setCompletedQuestIds(completedIds);

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
      const qEquip = query(collection(db, 'user_items'), where('studentId', '==', userData.uid), where('equipped', '==', true));
      const snapEquip = await getDocs(qEquip);
      const eq: EquippedItem[] = [];
      snapEquip.forEach(d => {
        const data = d.data();
        if (data.itemImageUrl && data.avatarPart) {
          eq.push({ 
            docId: d.id,
            itemId: data.itemId,
            imageUrl: data.itemImageUrl, 
            avatarPart: data.avatarPart as any,
            itemTitle: data.itemTitle,
            itemCategory: data.itemCategory,
            baseAttributeType: data.baseAttributeType,
            baseAttributeValue: data.baseAttributeValue,
            adds: data.adds,
            gameModelUrl: data.gameModelUrl,
            modelTransforms: data.modelTransforms
          });
        }
      });
      setEquippedItems(eq);
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

  const handleEditStatus = async () => {
    const status = await showPrompt('Digite sua mensagem de status (ex: Feliz da vida!, Cansado de matemática...):', userData?.customStatusText || '');
    if (status === null) return;
    
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
          const sRank = getRankForXp(student.xp || 0);
          
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
                  <h4 style={{ margin: 0, fontSize: fontSizeTitle, display: 'flex', alignItems: 'center', gap: '0.5rem', color: rankPos === 1 ? '#fbbf24' : 'white' }}>
                    {student.name} {student.uid === userData?.uid && <span style={{ fontSize: '0.7rem', background: 'var(--gold-primary)', color: 'black', padding: '2px 6px', borderRadius: '4px' }}>Você</span>}
                  </h4>
                  <div style={{ fontSize: '0.85rem', color: sRank.color, fontWeight: 'bold' }}>
                    {sRank.name} {student.classId && <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>| {student.classId}</span>}
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
          rankName={getRankForXp(publicProfileUser.user.xp || 0).name}
          rankColor={getRankForXp(publicProfileUser.user.xp || 0).color}
        />
      )}

      <nav className="navbar glass-panel compact-nav">
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
              <Settings size={18} color="var(--gold-primary)" />
              <span style={{ color: 'var(--gold-primary)' }}>{userData?.role === 'admin' ? 'Painel Master' : 'Painel do Professor'}</span>
            </button>
          )}

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
      <div className="scrollable-menu-container" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '0 -2rem 2rem -2rem', padding: '1rem 2rem' }}>
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
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <ShieldAlert size={14} style={{ flexShrink: 0 }} /> 
                              <span style={{ lineHeight: 1.1 }}>{quest.allowRetries ? <>Vidas<br/>Extras</> : 'Hardcore'}</span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Clock size={14} style={{ flexShrink: 0 }} /> 
                              <span style={{ lineHeight: 1.1 }}>{quest.questions?.length || 0}<br/>Desafios</span>
                            </span>
                          </div>
                            <button 
                              className="login-btn" 
                              disabled={quest.mode === 'live' && (!activeLiveQuests[quest.id] && !isCompleted)}
                              style={{ 
                                background: (isCompleted || (quest.mode === 'live' && !activeLiveQuests[quest.id] && !isCompleted)) ? 'rgba(255,255,255,0.1)' : 'var(--gold-primary)', 
                                color: (isCompleted || (quest.mode === 'live' && !activeLiveQuests[quest.id] && !isCompleted)) ? 'white' : 'black', 
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
            <div style={{ display: 'flex', gap: '1rem', padding: '1rem 0', marginBottom: '1rem', justifyContent: 'center', position: 'sticky', top: '75px', zIndex: 95, background: 'var(--bg-dark)', backdropFilter: 'blur(12px)' }}>
              <button 
                onClick={() => setProfileTab('overview')}
                className="login-btn"
                style={{ background: profileTab === 'overview' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.05)', color: profileTab === 'overview' ? 'black' : 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
              >
                <Star size={20} /> Personagem e Histórico
              </button>
              <button 
                onClick={() => setProfileTab('inventory')}
                className="login-btn"
                style={{ background: profileTab === 'inventory' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.05)', color: profileTab === 'inventory' ? 'black' : 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
              >
                <Package size={20} /> Mochila
              </button>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              {/* Perfil do Aluno (Esquerda) */}
              <div className="glass-panel" style={{ flex: '1 1 400px', padding: '3rem 2rem', textAlign: 'center' }}>
                  <div 
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem', transition: 'transform 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {currentRank.imageUrl ? (
                  <>
                    <img src={currentRank.imageUrl} alt={currentRank.name} style={{ width: 140, height: 140, objectFit: 'contain', filter: `drop-shadow(0 0 20px ${currentRank.color}80)`, marginBottom: '1rem', animation: 'epicZoom 1s ease-out' }} />
                    <div style={{ position: 'absolute', bottom: 50, right: -10 }}>
                      {(liveAvatarConfig || userData?.avatarConfig) ? (
                        <div style={{ width: 50, height: 50, borderRadius: '50%', overflow: 'visible', border: `2px solid ${currentRank.color}`, background: 'var(--bg-dark)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <AvatarCharacter config={(liveAvatarConfig || userData.avatarConfig)} size={50} equippedItems={equippedItems} interactive={false} animation={getProfileAvatarState(userData, liveAvatarConfig || userData.avatarConfig).animation as any} expression={getProfileAvatarState(userData, liveAvatarConfig || userData.avatarConfig).expression as any} showSlots={true} onAvatarClick={() => setIsCustomizingAvatar(true)} onSlotClick={handleUnequipItem} />
                        </div>
                      ) : (
                        <img onClick={() => setIsCustomizingAvatar(true)} src={userData?.photoURL} alt="Avatar" style={{ width: 50, height: 50, borderRadius: '50%', border: `2px solid ${currentRank.color}`, cursor: 'pointer' }} />
                      )}
                    </div>
                    <div style={{ background: 'var(--bg-dark)', padding: '0.25rem 1rem', borderRadius: '20px', border: `2px solid ${currentRank.color}`, color: currentRank.color, fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      {currentRank.name}
                    </div>
                  </>
                ) : (
                  <>
                    {(liveAvatarConfig || userData?.avatarConfig) ? (
                      <div style={{ width: 120, height: 120, borderRadius: '50%', overflow: 'visible', border: `4px solid ${currentRank.color}`, background: 'var(--bg-dark)', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: `0 0 20px ${currentRank.color}40` }} title="Clique para personalizar seu personagem">
                        <AvatarCharacter config={(liveAvatarConfig || userData.avatarConfig)} size={100} equippedItems={equippedItems} interactive={false} animation={getProfileAvatarState(userData, liveAvatarConfig || userData.avatarConfig).animation as any} expression={getProfileAvatarState(userData, liveAvatarConfig || userData.avatarConfig).expression as any} showSlots={true} onAvatarClick={() => setIsCustomizingAvatar(true)} onSlotClick={handleUnequipItem} />
                      </div>
                    ) : (
                      <img onClick={() => setIsCustomizingAvatar(true)} src={userData?.photoURL} alt="Avatar" style={{ width: 120, height: 120, borderRadius: '50%', border: `4px solid ${currentRank.color}`, boxShadow: `0 0 20px ${currentRank.color}40`, objectFit: 'cover', cursor: 'pointer' }} />
                    )}
                    <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-dark)', padding: '0.25rem 1rem', borderRadius: '20px', border: `2px solid ${currentRank.color}`, color: currentRank.color, fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      {currentRank.name}
                    </div>
                  </>
                )}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h2 style={{ fontSize: '2rem', color: 'var(--text-primary)' }}>{userData?.name}</h2>
              </div>
              
              {userData?.customStatusText && (
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  <MessageCircle size={16} /> <i>"{userData.customStatusText}"</i>
                </div>
              )}
              
              <button onClick={handleEditStatus} style={{ background: 'transparent', border: 'none', color: 'var(--gold-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.9rem', marginBottom: '1.5rem', opacity: 0.8 }} className="hover-brightness">
                <Edit3 size={14} /> Editar Status
              </button>

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
                    {(() => {
                      const maxHearts = 3 + Math.floor((RANKS.findIndex(r => r.name === currentRank.name) || 0) / 2);
                      const displayHp = userData?.role === 'admin' || userData?.role === 'teacher' ? maxHearts : currentHpVisual;
                      return Array.from({ length: maxHearts }).map((_, i) => {
                        if (i < displayHp) {
                          return (
                            <div key={i} style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Heart size={24} fill="#ef4444" color="#ef4444" />
                            </div>
                          );
                        } else if (i === displayHp && userData?.hpRecoveryStartTimestamp && displayHp < maxHearts) {
                          // Recovering heart
                          const minsLeft = Math.ceil(((100 - nextHeartProgress) / 100) * 30);
                          return (
                            <div key={i} title={`Recuperando vida... ${minsLeft} min restantes`} style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}>
                              <Heart className="recovering-heart" size={24} fill="transparent" color="rgba(255,255,255,0.4)" style={{ position: 'absolute', top: 0, left: 0 }} />
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${nextHeartProgress}%`, overflow: 'hidden', transition: 'height 1s linear' }}>
                                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Heart size={24} fill="#ef4444" color="#ef4444" />
                                </div>
                              </div>
                            </div>
                          );
                        } else {
                          // Empty heart
                          return (
                            <div key={i} style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Heart size={24} fill="transparent" color="rgba(255,255,255,0.2)" />
                            </div>
                          );
                        }
                      });
                    })()}
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

            {/* Coluna Direita Alternável (Histórico ou Mochila) */}
            {profileTab === 'overview' ? (
              <div className="glass-panel" style={{ flex: '2 1 500px', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
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
              <div className="glass-panel" style={{ flex: '2 1 500px', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
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
              <div>
                <h2 style={{ fontSize: '2rem', margin: 0 }}>Top 10 da Turma</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Sua sala: {userData?.classId || 'Não definida'}</p>
              </div>
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
              <div>
                <h2 style={{ fontSize: '2rem', margin: 0 }}>Top 10 Geral</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Os maiores pontuadores de toda a escola.</p>
              </div>
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
