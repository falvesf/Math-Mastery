import React, { useState, useEffect, useRef } from 'react';

import { LogOut, Trophy, Settings, History, ShieldAlert, Star, TrendingUp, Users, Swords, Clock, CheckCircle, Store, Package, Eye, EyeOff, Plus } from 'lucide-react';
import { useAuth, mapUserToClient, type UserData } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchEconomySettings } from '../lib/economy';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getRankForXp, RANKS, type RankDef } from '../lib/ranks';
import { calculateTotalStats, ATTRIBUTE_LABELS } from '../lib/gacha';
import LevelUpModal from '../components/LevelUpModal';
import ChestReveal from '../components/ChestReveal';
import StudentStore from '../components/StudentStore';
import StudentInventory from '../components/StudentInventory';
import CachedImage from '../components/CachedImage';
import { useDialog } from '../contexts/DialogContext';
import AvatarCharacter, { type EquippedItem } from '../components/AvatarCharacter';
import LazyAnimatedAvatar from '../components/LazyAnimatedAvatar';
import PublicProfileModal from '../components/PublicProfileModal';
import AvatarCustomizationModal from '../components/AvatarCustomizationModal';
import { getProfileAvatarState, hasProfanity } from '../lib/avatarState';
import { Edit3, MessageCircle, X, Box, Palette, Menu } from 'lucide-react';
import { sessionCache, CACHE_KEYS, CACHE_TTL } from '../lib/sessionCache';
import OnboardingModal from '../components/OnboardingModal';
import SchoolSelectorModal from '../components/SchoolSelectorModal';
import ClassSelectorModal from '../components/ClassSelectorModal';
import CustomThemeModal, { type CustomTheme, DEFAULT_FANTASY_THEME } from '../components/CustomThemeModal';
import { applyCustomTheme } from '../lib/theme';
import { validateCharacterName, normalizeForComparison, normalizeNameForMatch } from '../lib/nameValidation';
import { fetchModel3DById } from '../lib/model3d';
import { COMPANION_TIPS, fetchCompanionTips } from '../lib/companionTips';
import ChatWidget from '../components/ChatWidget';
import TeacherWanderer from '../components/TeacherWanderer';
import AboutModal from '../components/AboutModal';
import TenantSwitcher from '../components/TenantSwitcher';
import StatDistributionModal from '../components/StatDistributionModal';
import NintendoHeart from '../components/NintendoHeart';
import { fetchStudentAchievementHistory } from '../lib/achievementHistory';
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
        <CachedImage src={rank.imageUrl} alt={rank.name} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%', filter: `drop-shadow(0 0 10px ${rank.color}80)`, opacity: showAvatars ? 0.6 : 1, zIndex: 0 }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: rank.color, textAlign: 'center', fontSize: size > 60 ? '0.9rem' : '0.7rem', zIndex: 0, textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>{rank.name}</div>
      )}

      {/* Avatar (Visível apenas se showAvatars for true) */}
      {showAvatars && (
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
          {student.avatarConfig ? (
            <LazyAnimatedAvatar
              id={`ranking-${student.uid}`}
              config={student.avatarConfig}
              equippedItems={equippedItems}
              size={size}
              animation={finalAnimation}
              faceCamera={true}
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
  const { showAlert, showConfirm, showToast, showPrompt } = useDialog();
  const { userData, toggleStudentView, updateUserDataLocally, ranksLoaded } = useAuth();
  const { tenantId } = useTenant();
  if (!userData) return null;
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('quests');
  const [profileTab, setProfileTab] = useState('overview');
  const [xpHistory, setXpHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Companion (boneco) - dicas para iniciantes
  const [onboarding, setOnboarding] = useState<Record<string, boolean>>(userData?.inventoryPreferences?.onboarding || {});
  const [bubble, setBubble] = useState<{ tipId: string; step: number } | null>(null);
  const [companionTips, setCompanionTips] = useState<typeof COMPANION_TIPS>(COMPANION_TIPS);
  const prevTabRef = useRef(activeTab);

  // Carregar dicas salvas pelo superadmin (com fallback para o padrão)
  useEffect(() => {
    fetchCompanionTips().then(tips => setCompanionTips(tips));
  }, []);

  const isPlayerView = userData?.role === 'student' || userData?.studentViewActive;
  const pendingTips = isPlayerView
    ? [...companionTips].filter(t => !onboarding[t.id]).sort((a, b) => a.priority - b.priority)
    : [];

  const persistOnboarding = (next: Record<string, boolean>) => {
    if (!userData?.uid) return;
    const prefs = { ...(userData.inventoryPreferences || {}), onboarding: next };
    supabase.from('users').update({ inventory_preferences: prefs }).eq('id', userData.uid).then(({ error }) => { if (error) console.error(error); });
    updateUserDataLocally({ inventoryPreferences: prefs });
  };

  const markTipSeen = (tipId: string) => {
    if (onboarding[tipId]) return;
    const next = { ...onboarding, [tipId]: true };
    setOnboarding(next);
    persistOnboarding(next);
  };

  const handleBubbleClick = () => {
    if (!bubble) return;
    const tip = companionTips.find(t => t.id === bubble.tipId);
    if (!tip) return;
    if (tip.id === 'intro') {
      const nextTip = pendingTips.find(t => t.id !== 'intro');
      if (nextTip) {
        setBubble({ tipId: nextTip.id, step: 0 });
      } else {
        setBubble({ tipId: tip.id, step: (bubble.step + 1) % tip.lines.length });
      }
    } else {
      markTipSeen(tip.id);
    }
  };

  // Primeiro acesso: levar direto para a guia Personagem (só na primeira vez)
  useEffect(() => {
    if (isPlayerView && userData && !userData.inventoryPreferences?.onboarding) {
      setActiveTab('profile');
      const next = { ...onboarding, redirected: true };
      setOnboarding(next);
      persistOnboarding(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcar dica como vista quando a área é acessada pela primeira vez
  useEffect(() => {
    if (!isPlayerView) return;
    if (prevTabRef.current !== activeTab) {
      companionTips.forEach(t => {
        if (t.seenOnTabs?.includes(activeTab)) markTipSeen(t.id);
      });
    }
    prevTabRef.current = activeTab;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Selecionar qual dica o boneco fala (prioridade: intro -> ordem definida)
  useEffect(() => {
    if (!isPlayerView || pendingTips.length === 0) {
      setBubble(null);
      return;
    }
    setBubble(prev => (prev && prev.tipId === pendingTips[0].id ? prev : { tipId: pendingTips[0].id, step: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, onboarding]);

  // Avançar estrofes da dica atual (max 3 linhas, troca a cada ~3s)
  useEffect(() => {
    if (!bubble) return;
    const tip = companionTips.find(t => t.id === bubble.tipId);
    if (!tip) return;
    const timer = setTimeout(() => {
      const next = bubble.step + 1;
      if (next >= tip.lines.length) {
        if (tip.id === 'intro') {
          setBubble({ tipId: tip.id, step: 0 });
        } else {
          markTipSeen(tip.id);
        }
      } else {
        setBubble({ ...bubble, step: next });
      }
    }, 3200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubble]);

  useEffect(() => {
    const handleOpenInventory = () => {
      setActiveTab('profile');
      setProfileTab('inventory');
    };
    window.addEventListener('select-inventory-tab', handleOpenInventory);
    return () => window.removeEventListener('select-inventory-tab', handleOpenInventory);
  }, []);

  // Rankings state
  const [showRankingAvatars, setShowRankingAvatars] = useState(false);
  const [allStudents, setAllStudents] = useState<UserData[]>([]);
  const [selectedClassForRanking, setSelectedClassForRanking] = useState<string>('');
  const [cubeRotation, setCubeRotation] = useState(0);
  const [rankImageIndex, setRankImageIndex] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const lastInteractionTime = useRef(Date.now());
  const [loadingRankings, setLoadingRankings] = useState(true);

  // Enrollment flow state
  const [enrollmentStep, setEnrollmentStep] = useState<'school' | 'class' | 'pending' | 'complete'>('school');
  const [selectedSchool, setSelectedSchool] = useState<any>(null);

  // Monitorar se o aluno foi aprovado (role muda de pending_student para student com tenant/class)
  useEffect(() => {
    const shouldMonitor = userData?.role === 'pending_student' ||
      (userData?.role === 'student' && (!userData?.tenantId || !userData?.classId));

    if (!shouldMonitor || !userData?.uid) return;

    const checkApproval = async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('role, tenant_id, class_id, pending_class_name')
          .eq('id', userData.uid)
          .maybeSingle();

        if (data && data.role === 'student' && data.tenant_id && data.class_id) {
          updateUserDataLocally({
            role: 'student',
            tenantId: data.tenant_id,
            classId: data.class_id,
            pendingClassName: undefined
          });
          setEnrollmentStep('complete');
          showToast('Sua matrícula foi aprovada pelo administrador! Bem-vindo!', 'success');
        }
      } catch (err) {
        console.error('Erro ao verificar aprovação de matrícula:', err);
      }
    };

    // Verificar a cada 10 segundos
    const interval = setInterval(checkApproval, 10000);
    return () => clearInterval(interval);
  }, [userData?.uid, userData?.role, userData?.tenantId, userData?.classId]);

  // Se for aluno pendente sem escola/turma, redirecionar para fluxo de matrícula
  useEffect(() => {
    if (userData?.role === 'pending_student' && !userData?.tenantId) {
      setEnrollmentStep('school');
    }
  }, [userData?.role, userData?.tenantId]);

  const [rankingEquippedItems, setRankingEquippedItems] = useState<Record<string, EquippedItem[]>>({});
  const [rankingHistory, setRankingHistory] = useState<RankingHistory | null>(null);
  const [publicProfileUser, setPublicProfileUser] = useState<{ user: UserData, rankPos: number } | null>(null);

  // Avatar State
  const [isCustomizingAvatar, setIsCustomizingAvatar] = useState(false);
  const [studentMobileMenuOpen, setStudentMobileMenuOpen] = useState(false);
  const [equippedItems, setEquippedItems] = useState<EquippedItem[]>([]);
  const [equippedItemsLoaded, setEquippedItemsLoaded] = useState(false);
  const [liveAvatarConfig, setLiveAvatarConfig] = useState<any>(null);
  const [inventoryRefresh, setInventoryRefresh] = useState(0);

  // Level Up Animation State
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{ oldRank: RankDef | null, newRank: RankDef } | null>(null);

  // Rank Up Chest State
  const [showRankUpChest, setShowRankUpChest] = useState(false);
  const [rankUpChestItems, setRankUpChestItems] = useState<any[]>([]);
  const [rankUpChestModel, setRankUpChestModel] = useState<any>(null);

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
  const [showStatDistributionModal, setShowStatDistributionModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const logoClicksRef = useRef(0);
  const logoClickTimerRef = useRef<any>(null);

  // Triplo clique na logo abre a tela "Sobre o Sistema"
  const handleLogoClick = () => {
    logoClicksRef.current += 1;
    if (logoClickTimerRef.current) clearTimeout(logoClickTimerRef.current);
    logoClickTimerRef.current = setTimeout(() => { logoClicksRef.current = 0; }, 800);
    if (logoClicksRef.current >= 3) {
      logoClicksRef.current = 0;
      setShowAboutModal(true);
    }
  };
  const [settingsTab, setSettingsTab] = useState<'cube' | 'theme' | 'debug'>('cube');
  const [appTheme, setAppTheme] = useState(() => localStorage.getItem('appTheme') || 'default');
  const [appFonts, setAppFonts] = useState(() => localStorage.getItem('appFonts') || 'default');

  const [globalThemes, setGlobalThemes] = useState<CustomTheme[]>([]);
  const [showCustomThemeModal, setShowCustomThemeModal] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CustomTheme | undefined>(undefined);

  useEffect(() => {
    const fetchThemes = async () => {
      const { data } = await supabase.from('system_collections').select('*').eq('type', 'themes');
      if (data) {
        setGlobalThemes(data.map(d => ({ id: d.id, ...(d.data as any) } as CustomTheme)));
      }
    };
    fetchThemes();

    const channel = supabase.channel('themes_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_collections', filter: 'type=eq.themes' }, () => {
        fetchThemes();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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

  // Giro automático do cubo quando ocioso (pausado enquanto houver dicas do companheiro)
  useEffect(() => {
    if (!cubeAutoRotate || !isIdle || pendingTips.length > 0) return;
    const rotateInterval = setInterval(() => {
      setCubeRotation(prev => prev - 90);
    }, cubeRotateInterval * 1000); // Gira a cada X segundos
    return () => clearInterval(rotateInterval);
  }, [isIdle, cubeAutoRotate, cubeRotateInterval, pendingTips.length]);

  useEffect(() => {
    if (!userData || !equippedItemsLoaded) return;

    const stats = calculateTotalStats(equippedItems, userData?.distributedStats);
    const maxHearts = 3 + Math.floor((RANKS.findIndex(r => r.name === currentRank.name) || 0) / 2) + Math.floor(stats.vitality / 30);
    const dbHearts = userData.hp !== undefined ? Number(userData.hp) : maxHearts;

    // STAFF (admin/teacher/coordinator): HP sempre no máximo da patente.
    const isStaff = userData?.role === 'admin' || userData?.role === 'teacher' || userData?.role === 'coordinator';
    if (isStaff) {
      setCurrentHpVisual(maxHearts);
      setNextHeartProgress(0);
      if (dbHearts !== maxHearts) {
        supabase.from('users').update({ hp: maxHearts, hp_recovery_start_timestamp: null }).eq('id', userData.uid).then(({ error }) => { if (error) console.error(error); });
        if (userData) {
          userData.hp = maxHearts;
          userData.hpRecoveryStartTimestamp = null;
        }
      }
      return;
    }

    if (dbHearts > maxHearts) {
      supabase.from('users').update({
        hp: maxHearts,
        hp_recovery_start_timestamp: null
      }).eq('id', userData.uid).then(({ error }) => { if (error) console.error(error); });
      setCurrentHpVisual(maxHearts);
      setNextHeartProgress(0);
      return;
    }

    // Se está com vida cheia, zera qualquer timer
    if (dbHearts === maxHearts) {
      setCurrentHpVisual(maxHearts);
      setNextHeartProgress(0);
      if (userData.hpRecoveryStartTimestamp) {
        supabase.from('users').update({ hp_recovery_start_timestamp: null }).eq('id', userData.uid).then(({ error }) => { if (error) console.error(error); });
        userData.hpRecoveryStartTimestamp = null;
      }
      return;
    }

    // Inicializa o timestamp de recuperação se estiver faltando
    let startMs: number;
    if (!userData.hpRecoveryStartTimestamp) {
      startMs = Date.now();
      supabase.from('users').update({ hp_recovery_start_timestamp: startMs }).eq('id', userData.uid).then(({ error }) => { if (error) console.error(error); });
      userData.hpRecoveryStartTimestamp = startMs;
    } else {
      startMs = typeof userData.hpRecoveryStartTimestamp === 'string'
        ? new Date(userData.hpRecoveryStartTimestamp).getTime()
        : Number(userData.hpRecoveryStartTimestamp);
    }

    // Calcula redução de tempo de recarga (Equipamentos + Buff Consumível Ativo)
    const nowTime = Date.now();
    const equippedReduction = equippedItems
      .filter(item => (item as any).gameEffect === 'reduce_hp_cooldown')
      .reduce((acc, item) => acc + Number((item as any).hpCooldownReductionMinutes || 0), 0);

    const isBuffActive = userData.hpCooldownReductionUntil && userData.hpCooldownReductionUntil > nowTime;
    const buffReduction = isBuffActive ? Number(userData.hpCooldownReductionMinutes || 0) : 0;

    const totalReductionMinutes = Math.min(29, equippedReduction + buffReduction);
    const effectiveMinutes = Math.max(1, 30 - totalReductionMinutes);
    const RECOVERY_TIME_MS = effectiveMinutes * 60 * 1000;

    const updateHpTick = async () => {
      const now = Date.now();
      const timePassed = Math.max(0, now - startMs);

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
          const nextTimestampMs = newHp < maxHearts ? (startMs + (recoveredHearts * RECOVERY_TIME_MS)) : null;
          const updates: any = {
            hp: newHp,
            hp_recovery_start_timestamp: nextTimestampMs
          };
          userData.hp = newHp;
          userData.hpRecoveryStartTimestamp = nextTimestampMs;
          updateUserDataLocally({ hp: newHp, hpRecoveryStartTimestamp: nextTimestampMs });
          await supabase.from('users').update(updates).eq('id', userData.uid);
        } catch (e) {
          console.error(e);
        }
      }
    };

    updateHpTick();
    const interval = setInterval(updateHpTick, 1000);

    return () => clearInterval(interval);
  }, [userData?.hp, userData?.hpRecoveryStartTimestamp, userData?.role, userData?.hpCooldownReductionUntil, userData?.hpCooldownReductionMinutes, equippedItemsLoaded, equippedItems, inventoryRefresh]);

  useEffect(() => {
    if (userData?.uid) {
      const fetchHistory = async () => {
        // Verifica o cache primeiro — histórico de conquistas
        const cacheKey = CACHE_KEYS.xpHistory(userData.uid);
        const cached = sessionCache.get<any[]>(cacheKey);
        if (cached) {
          setXpHistory(cached);
          setLoadingHistory(false);
          return;
        }
        const items = await fetchStudentAchievementHistory(userData.uid, tenantId);
        sessionCache.set(cacheKey, items, CACHE_TTL.XP_HISTORY);
        setXpHistory(items);
        setLoadingHistory(false);
      };
      fetchHistory();

      const fetchQuests = async () => {
        setLoadingQuests(true);

        // Buscar tentativas concluídas (com cache)
        const attemptsCacheKey = CACHE_KEYS.questAttempts(userData.uid);
        let completedIds: string[] = [];
        let completedDates: Record<string, number> = {};

        const cachedAttempts = sessionCache.get<{ ids: string[], dates: Record<string, number> }>(attemptsCacheKey);

        if (cachedAttempts && cachedAttempts.ids) {
          completedIds = cachedAttempts.ids;
          completedDates = cachedAttempts.dates;
        } else {
          const { data: attemptSnap } = await supabase.from('quest_attempts').select('quest_id, created_at').eq('student_id', userData.uid).eq('status', 'completed');
          if (attemptSnap) {
            attemptSnap.forEach((data: any) => {
              if (data.quest_id) {
                completedIds.push(data.quest_id);
                completedDates[data.quest_id] = new Date(data.created_at).getTime();
              }
            });
          }
          sessionCache.set(attemptsCacheKey, { ids: completedIds, dates: completedDates }, CACHE_TTL.QUEST_ATTEMPTS);
        }
        setCompletedQuestIds(completedIds);
        setCompletedQuestDates(completedDates);

        // Buscar missões ativas (com cache por turma)
        const questsCacheKey = CACHE_KEYS.quests(tenantId ? `${tenantId}_${userData.classId || 'all'}` : (userData.classId || 'all'));
        let fetched: any[] = sessionCache.get<any[]>(questsCacheKey) || [];
        if (fetched.length === 0) {
          let questsQuery = supabase.from('quests').select('*').eq('active', true);
          // Filtrar por tenant_id
          if (tenantId) {
            questsQuery = questsQuery.eq('tenant_id', tenantId);
          }
          const { data: snap } = await questsQuery;
          fetched = snap ? snap.map((d: any) => ({
            ...d,
            id: d.id,
            coverImageUrl: d.cover_image_url || d.coverImageUrl,
            baseXp: d.base_xp || d.baseXp,
            allowRetries: d.allow_retries !== undefined ? d.allow_retries : d.allowRetries,
            targetClasses: d.target_classes || d.targetClasses || [],
            createdAt: { seconds: new Date(d.created_at || d.id).getTime() / 1000 }
          })) : [];
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
  }, [userData?.uid, userData?.classId, userData?.role, tenantId]);

  useEffect(() => {
    if (!userData) return;
    const fetchEquipped = async () => {
      try {
        const { data: snapEquip } = await supabase.from('user_items').select('*').eq('student_id', userData.uid).eq('equipped', true);
        const eq: EquippedItem[] = [];
        if (snapEquip) {
          snapEquip.forEach((d: any) => {
            const data = d.data;
            if (data && data.avatarPart && (data.itemImageUrl || data.minecraftHeadValue || data.gameModelUrl)) {
              let parsedAdds = [];
              if (data.adds) {
                try { parsedAdds = typeof data.adds === 'string' ? JSON.parse(data.adds) : data.adds; } catch (e) { }
              }
              eq.push({
                docId: d.id,
                itemId: d.item_id,
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
                modelTransforms: data.modelTransforms,
                backColor: data.backColor || '',
                customAnimation: data.customAnimation,
              });
            }
          });
        }
        setEquippedItems(eq);
      } catch (err) {
        console.error("Error fetching equipped items:", err);
      } finally {
        setEquippedItemsLoaded(true);
      }
    };
    fetchEquipped();
  }, [userData?.uid, userData?.studentViewActive, inventoryRefresh]);

  useEffect(() => {
    const fetchUsers = async () => {
      let usersQuery = supabase.from('users').select('*').eq('role', 'student');
      // Filtrar por tenant_id (superadmin vê a escola selecionada, outros veem sua escola).
      // Sem tenantId não listamos alunos de todas as escolas (evita o "limbo").
      if (tenantId) {
        usersQuery = usersQuery.eq('tenant_id', tenantId);
      } else {
        usersQuery = usersQuery.eq('tenant_id', '00000000-0000-0000-0000-000000000001');
      }
      const { data } = await usersQuery;
      if (data) {
        const loaded = data.map(d => mapUserToClient(d));
        loaded.sort((a, b) => (b.xp || 0) - (a.xp || 0));
        setAllStudents(loaded);
      }
      setLoadingRankings(false);
    };
    fetchUsers();

    const fetchLiveQuests = async () => {
      let liveQuestsQuery = supabase.from('live_quests').select('*').neq('status', 'finished');
      // Filtrar por tenant_id
      if (tenantId) {
        liveQuestsQuery = liveQuestsQuery.eq('tenant_id', tenantId);
      }
      const { data } = await liveQuestsQuery;
      if (data) {
        const activeMap: Record<string, boolean> = {};
        data.forEach(d => activeMap[d.id] = true);
        setActiveLiveQuests(activeMap);
      }
    };
    fetchLiveQuests();

    const channelUsers = supabase.channel('dashboard_users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: 'role=eq.student' }, () => fetchUsers())
      .subscribe();

    const channelLiveQuests = supabase.channel('dashboard_live_quests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_quests' }, () => fetchLiveQuests())
      .subscribe();

    return () => {
      supabase.removeChannel(channelUsers);
      supabase.removeChannel(channelLiveQuests);
    };
  }, [userData?.classId, tenantId]);

  useEffect(() => {
    if (allStudents.length === 0) return;

    const checkAndSyncRankings = async () => {
      try {
        const { data: snap } = await supabase.from('system_collections').select('data').eq('type', 'rankings').single();
        let history: RankingHistory = { general: {}, classes: {} };
        if (snap && snap.data) {
          history = snap.data as RankingHistory;
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
          await supabase.from('system_collections').upsert({ type: 'rankings', data: history }, { onConflict: 'type' });
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
        const { data: snap } = await supabase.from('user_items').select('*').eq('equipped', true).in('student_id', Array.from(studentIds));
        const newRankingItems: Record<string, EquippedItem[]> = {};

        if (snap) {
          snap.forEach((d: any) => {
            const data = d.data;
            if (studentIds.has(d.student_id) && data && data.avatarPart && (data.itemImageUrl || data.minecraftHeadValue || data.gameModelUrl)) {
              if (!newRankingItems[d.student_id]) newRankingItems[d.student_id] = [];
              newRankingItems[d.student_id].push({
                itemId: d.item_id,
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
                modelTransforms: data.modelTransforms,
                backColor: data.backColor || ''
              } as EquippedItem);
            }
          });
        }

        sessionCache.set(cacheKey, newRankingItems, CACHE_TTL.RANKING_ITEMS);
        setRankingEquippedItems(newRankingItems);
      } catch (e) {
        console.error(e);
      }
    };

    fetchRankingItems();
  }, [allStudents, userData?.classId, userData?.studentViewActive]);

  // Invalidate ranking cache when student mode changes (admin items are archived to backup)
  useEffect(() => {
    sessionCache.invalidate(CACHE_KEYS.rankingItems());
    setRankingEquippedItems({});
  }, [userData?.studentViewActive]);

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
    if (!userData || userData.role !== 'student' || !ranksLoaded) return;

    // Se não tem lastSeenRank e o rank é Iniciante, apenas salva silenciosamente.
    if (!userData.lastSeenRank) {
      if (currentRank.name !== RANKS[0].name) {
        // Primeira vez logando já com XP (ex: prof lançou antes dele entrar a primeira vez)
        setLevelUpData({ oldRank: RANKS[0], newRank: currentRank });
        setShowLevelUp(true);
      } else {
        const newPrefs = { ...(userData.inventoryPreferences || {}), lastSeenRank: currentRank.name };
        supabase.from('users').update({ inventory_preferences: newPrefs }).eq('id', userData.uid);
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
        // Caiu de rank (ex: punição).
        const newPrefs = { ...(userData.inventoryPreferences || {}), lastSeenRank: currentRank.name };

        // Verifica se tem mais pontos distribuídos do que a patente atual permite
        const totalEarnedPoints = newRankIndex * 4;
        const confirmedStats = userData.distributedStats || {};
        const totalConfirmedPoints = Object.values(confirmedStats).reduce((sum: any, val: any) => sum + (val || 0), 0) as number;

        let updateData: any = { inventory_preferences: newPrefs };

        if (totalConfirmedPoints > totalEarnedPoints) {
          const pointsToRemove = totalConfirmedPoints - totalEarnedPoints;
          let removed = 0;
          let newStats = { ...confirmedStats };

          while (removed < pointsToRemove) {
            const availableKeys = Object.keys(newStats).filter(k => newStats[k] > 0);
            if (availableKeys.length === 0) break;

            const keyToReduce = availableKeys[0];
            newStats[keyToReduce] -= 1;
            removed++;
          }

          updateData.distributed_stats = newStats;
          showToast(`Sua patente caiu para ${currentRank.name}. ${pointsToRemove} ponto(s) de atributo foram removidos.`, 'error');
        }

        supabase.from('users').update(updateData).eq('id', userData.uid).then();
      }
    }
  }, [userData?.xp, userData?.lastSeenRank, currentRank.name, ranksLoaded]);

  const handleCloseLevelUp = async () => {
    setShowLevelUp(false);
    if (userData) {
      const highest = userData.inventoryPreferences?.highestRankIndex || 0;
      const newRankIndex = RANKS.findIndex(r => r.name === levelUpData?.newRank?.name);

      const newPrefs = { ...(userData.inventoryPreferences || {}), lastSeenRank: currentRank.name };

      if (levelUpData?.newRank && newRankIndex > highest) {
        newPrefs.highestRankIndex = newRankIndex;

        // Invalida o cache do histórico de conquistas
        const cacheKey = CACHE_KEYS.xpHistory(userData.uid);
        sessionCache.invalidate(cacheKey);

        // Atualiza o estado local para forçar recarregamento se voltar na aba
        setXpHistory([]);

        // Verificar se deve mostrar baú de patente
        try {
          const econ = await fetchEconomySettings(tenantId);
          const rankChestItems = (levelUpData?.newRank?.rankUpChestItems || []) as { itemId: string, quantity: number }[];
          // Só distribui se o checkbox global estiver ativo E a patente alcançada tiver itens configurados
          if (econ.rankUpChestEnabled && rankChestItems.length > 0) {
            // Carregar itens do baú da patente alcançada
            const chestItems = rankChestItems;
            const itemIds = chestItems.map(i => i.itemId).filter(id => id);

            if (itemIds.length > 0) {
              const { data: storeItems } = await supabase.from('store_items').select('id, data').in('id', itemIds);

              if (storeItems) {
                const itemsToShow: any[] = [];

                chestItems.forEach(chestItem => {
                  if (!chestItem.itemId) return;
                  const storeItem = storeItems.find(s => s.id === chestItem.itemId);
                  if (storeItem) {
                    const itemData = storeItem.data || {};
                    itemsToShow.push({
                      itemId: chestItem.itemId,
                      title: itemData.title || 'Item',
                      imageUrl: itemData.imageUrl || '',
                      quantity: chestItem.quantity,
                      type: itemData.type || 'consumable'
                    });
                  }
                });

                if (itemsToShow.length > 0) {
                  // Agrupar itens empilháveis
                  const grouped = new Map<string, any>();
                  itemsToShow.forEach(item => {
                    const key = `${item.itemId}-${item.type}`;
                    if (grouped.has(key) && item.type === 'consumable') {
                      grouped.get(key).quantity += item.quantity;
                    } else {
                      grouped.set(key, { ...item });
                    }
                  });

                  setRankUpChestItems(Array.from(grouped.values()));
                  // Carregar a arte do baú de patente (Moldes 3D → Baús de Recompensa), se configurada
                  const rankChestModelId = (levelUpData?.newRank as any)?.rankUpChestModelId;
                  const rankChestModel = rankChestModelId ? await fetchModel3DById(rankChestModelId, tenantId) : null;
                  setRankUpChestModel(rankChestModel);
                  setShowRankUpChest(true);
                  return; // Sair aqui para mostrar o baú antes de fechar
                }
              }
            }
          }
        } catch (err) {
          console.error("Erro ao verificar baú de patente:", err);
        }
      }

      await supabase.from('users').update({ inventory_preferences: newPrefs }).eq('id', userData.uid);
    }
  };

  const handleOpenRankUpChest = async () => {
    // Adicionar itens ao inventário do jogador
    if (userData && rankUpChestItems.length > 0) {
      const inserts = rankUpChestItems.map(item => ({
        student_id: userData.uid,
        item_id: item.itemId,
        equipped: false,
        data: {
          itemId: item.itemId,
          itemTitle: item.title,
          itemImageUrl: item.imageUrl,
          quantity: item.quantity,
          itemType: item.type,
          obtainedFrom: 'rank_up_chest',
          obtainedAt: Date.now()
        }
      }));

      await supabase.from('user_items').insert(inserts);
    }
    setShowRankUpChest(false);
    setRankUpChestItems([]);
    setRankUpChestModel(null);

    // Agora salvar as preferências
    if (userData) {
      const highest = userData.inventoryPreferences?.highestRankIndex || 0;
      const newRankIndex = RANKS.findIndex(r => r.name === levelUpData?.newRank?.name);
      const newPrefs = { ...(userData.inventoryPreferences || {}), lastSeenRank: currentRank.name };
      if (levelUpData?.newRank && newRankIndex > highest) {
        newPrefs.highestRankIndex = newRankIndex;
      }
      await supabase.from('users').update({ inventory_preferences: newPrefs }).eq('id', userData.uid);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleToggleSlotVisibility = async (slotId: string) => {
    const baseConfig = liveAvatarConfig || userData?.avatarConfig;
    if (!baseConfig) return;
    const currentHidden = baseConfig.hiddenSlots || [];
    const newHidden = currentHidden.includes(slotId)
      ? currentHidden.filter(id => id !== slotId)
      : [...currentHidden, slotId];

    const newConfig = { ...baseConfig, hiddenSlots: newHidden };

    // Update live preview immediately
    setLiveAvatarConfig(newConfig);

    if (userData && newConfig) {
      await supabase.from('users').update({ avatar_config: newConfig }).eq('id', userData.uid);
    }
  };

  const getContrastColor = (hexColor: string): string => {
    if (!hexColor || hexColor === 'transparent') return 'var(--text-primary)';
    const hex = hexColor.replace('#', '');
    if (hex.length < 6) return '#000000';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 160 ? '#000000' : '#ffffff';
  };

  const handleUnequipItem = async (item: EquippedItem) => {
    if (!userData || !item.docId) return;
    try {
      await supabase.from('user_items').update({ equipped: false }).eq('id', item.docId);
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

    await supabase.from('users').update({ custom_status_text: status }).eq('id', userData!.uid);
  };

  const handleRenameCharacter = async () => {
    if (!userData) return;

    const isFreeCreation = !userData.characterName;
    const canRenameFreely = isAdminOrTeacher || isFreeCreation;

    if (!canRenameFreely) {
      const { data: items } = await supabase.from('user_items')
        .select('*')
        .eq('student_id', userData.uid)
        .eq('item_type', 'consumable');

      const hasRenameItem = (items || []).some(i => {
        const data = i.data || {};
        return data.gameEffect === 'rename_character' && (i.count || 0) > 0;
      });

      if (!hasRenameItem) {
        showToast('Você precisa de uma Carta de Troca de Nome para renomear seu personagem. Compre na loja!', 'error');
        return;
      }
    }

    const newName = await showPrompt(
      isFreeCreation
        ? 'Escolha um nome para seu personagem (até 12 caracteres, sem acentos/espaços/símbolos):'
        : 'Digite o novo nome do seu personagem (até 12 caracteres, sem acentos/espaços/símbolos):',
      userData.characterName || '',
      isFreeCreation ? 'Criar Nome do Personagem' : 'Renomear Personagem'
    );

    if (!newName || newName.trim() === (userData.characterName || '')) return;

    const validation = validateCharacterName(newName);
    if (!validation.valid) {
      showToast(validation.error!, 'error');
      return;
    }

    const { data: existing } = await supabase.from('users')
      .select('id, character_name')
      .not('id', 'eq', userData.uid)
      .not('character_name', 'is', null);

    if (existing) {
      const normalizedNew = normalizeForComparison(newName);
      const conflict = existing.find(u => {
        const existingNorm = normalizeForComparison(u.character_name || '');
        return existingNorm === normalizedNew ||
          existingNorm.includes(normalizedNew) ||
          normalizedNew.includes(existingNorm);
      });

      if (conflict) {
        showToast('Este nome já está em uso ou é muito similar ao de outro personagem. Escolha outro nome.', 'error');
        return;
      }
    }

    if (!canRenameFreely) {
      const { data: renameItems } = await supabase.from('user_items')
        .select('*')
        .eq('student_id', userData.uid)
        .eq('item_type', 'consumable');

      const renameItem = (renameItems || []).find(i => {
        const data = i.data || {};
        return data.gameEffect === 'rename_character' && (i.count || 0) > 0;
      });

      if (renameItem) {
        const newCount = (renameItem.count || 1) - 1;
        if (newCount <= 0) {
          await supabase.from('user_items').delete().eq('id', renameItem.id);
        } else {
          await supabase.from('user_items').update({ count: newCount }).eq('id', renameItem.id);
        }
      }
    }

    await supabase.from('users').update({ character_name: newName.trim() }).eq('id', userData.uid);
    updateUserDataLocally({ characterName: newName.trim() });
    showToast(`Nome do personagem definido como "${newName.trim()}"!`, 'success');
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
  const uniqueClasses = Array.from(new Set(allStudents.map(s => s.classId).filter(Boolean))).sort() as string[];
  const targetClassRanking = isAdminOrTeacher ? (selectedClassForRanking || userData?.classId || uniqueClasses[0] || '') : userData?.classId;
  const classStudents = allStudents.filter(s => s.classId === targetClassRanking).slice(0, 10);
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {list.map((student, index) => {
          const rankPos = index + 1;
          const sRank = getRankForXp(student.xp || 0, student.classId);

          let medalColor = 'var(--text-secondary)';
          let bgStyle = student.uid === userData?.uid ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255,255,255,0.02)';
          let borderStyle = student.uid === userData?.uid ? '1px solid var(--gold-primary)' : '1px solid transparent';
          let avatarSize = 40;
          let fontSizeTitle = '0.95rem';
          let fontSizeXp = '1.1rem';

          if (rankPos === 1) {
            medalColor = '#fbbf24'; // Gold
            avatarSize = 60;
            fontSizeTitle = '1.2rem';
            fontSizeXp = '1.3rem';
            bgStyle = student.uid === userData?.uid ? 'rgba(251, 191, 36, 0.2)' : 'linear-gradient(90deg, rgba(251, 191, 36, 0.1), rgba(0,0,0,0.2))';
            borderStyle = '1px solid #fbbf24';
          } else if (rankPos === 2) {
            medalColor = '#94a3b8'; // Silver
            avatarSize = 50;
            fontSizeTitle = '1.1rem';
            fontSizeXp = '1.2rem';
            bgStyle = student.uid === userData?.uid ? 'rgba(251, 191, 36, 0.15)' : 'linear-gradient(90deg, rgba(148, 163, 184, 0.1), rgba(0,0,0,0.2))';
            borderStyle = '1px solid #94a3b8';
          } else if (rankPos === 3) {
            medalColor = '#b45309'; // Bronze
            avatarSize = 45;
            fontSizeTitle = '1rem';
            fontSizeXp = '1.1rem';
            bgStyle = student.uid === userData?.uid ? 'rgba(251, 191, 36, 0.1)' : 'linear-gradient(90deg, rgba(180, 83, 9, 0.1), rgba(0,0,0,0.2))';
            borderStyle = '1px solid #b45309';
          }

          return (
            <div key={student.uid} className="glass-panel" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem',
              background: bgStyle,
              border: borderStyle,
              boxShadow: rankPos === 1 ? '0 0 15px rgba(251, 191, 36, 0.2)' : 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '30px', textAlign: 'center', fontSize: rankPos <= 3 ? '1.2rem' : '1rem', fontWeight: 'bold', color: medalColor }}>
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
                    {student.characterName || student.name} {student.uid === userData?.uid && <span style={{ fontSize: '0.7rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', padding: '2px 6px', borderRadius: '4px' }}>Você</span>}
                  </h4>
                  {student.characterName && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                      ({student.name})
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: sRank.color, fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
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

  const handleSelectClass = async (classId: string) => {
    if (!userData) return;
    const { error } = await supabase.from('users').update({ class_id: classId }).eq('id', userData.uid);
    if (!error) {
      updateUserDataLocally({ classId });
    } else {
      console.error('Erro ao salvar turma:', error);
    }
  };
  const handleSelectTeacher = async () => {
    if (!userData) return;
    const { error } = await supabase.from('users').update({ role: 'pending_teacher' }).eq('id', userData.uid);
    if (!error) {
      updateUserDataLocally({ role: 'pending_teacher' });
    } else {
      console.error('Erro ao definir role de professor:', error);
    }
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
        <button className="login-btn" onClick={() => supabase.auth.signOut()} style={{ padding: '0.75rem 2rem', fontSize: '1.1rem' }}>
          Sair
        </button>
      </div>
    );
  }

  // Novo aluno - precisa selecionar escola e turma
  if (userData?.role === 'student' && (!userData?.tenantId || !userData?.classId)) {
    if (enrollmentStep === 'school') {
      return (
        <SchoolSelectorModal
          onSelect={(school) => {
            setSelectedSchool(school);
            setEnrollmentStep('class');
          }}
        />
      );
    }

    if (enrollmentStep === 'class' && selectedSchool) {
      return (
        <ClassSelectorModal
          tenantId={selectedSchool.id}
          schoolName={selectedSchool.name}
          onSelect={async (cls) => {
            // Verificar se o aluno está na lista pré-autorizada
            // Busca candidatos da escola (ou globais) e compara nome/turma de forma tolerante
            const { data: preAuthRows } = await supabase
              .from('pre_authorized_students')
              .select('*')
              .or(`tenant_id.eq.${selectedSchool.id},tenant_id.is.null`);

            const normName = normalizeNameForMatch(userData.name || '');
            const normClass = normalizeNameForMatch(cls.name);
            const preAuth = (preAuthRows || []).find((row: any) =>
              normalizeNameForMatch(row.name || '') === normName &&
              normalizeNameForMatch(row.class_name || '') === normClass
            );

            if (preAuth) {
              // Auto-aprovar - associar à escola e turma
              await supabase.from('users').update({
                tenant_id: selectedSchool.id,
                class_id: cls.name
              }).eq('id', userData.uid);

              await supabase.from('tenant_users').upsert({
                tenant_id: selectedSchool.id,
                user_id: userData.uid,
                role: 'student'
              });

              updateUserDataLocally({
                tenantId: selectedSchool.id,
                classId: cls.name
              });

              setEnrollmentStep('complete');
            } else {
              // Enviar para aprovação - salvar escola/turma escolhidas diretamente no usuário
              await supabase.from('users').update({
                role: 'pending_student',
                tenant_id: selectedSchool.id,
                pending_class_name: cls.name
              }).eq('id', userData.uid);

              // Também criar registro na tabela de solicitações (para backup/relatórios)
              try {
                await supabase.from('enrollment_requests').insert({
                  user_id: userData.uid,
                  tenant_id: selectedSchool.id,
                  class_name: cls.name,
                  status: 'pending'
                });
              } catch (e) {
                console.error('Erro ao criar solicitação de matrícula (opcional):', e);
              }

              updateUserDataLocally({
                tenantId: selectedSchool.id,
                pendingClassName: cls.name,
                role: 'pending_student'
              });

              setEnrollmentStep('pending');
            }
          }}
          onBack={() => {
            setSelectedSchool(null);
            setEnrollmentStep('school');
          }}
        />
      );
    }

    if (enrollmentStep === 'pending') {
      return (
        <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '500px', width: '100%' }}>
            <ShieldAlert size={64} color="var(--gold-primary)" style={{ margin: '0 auto 1.5rem auto', display: 'block' }} />
            <h2 style={{ color: 'var(--gold-primary)', marginBottom: '1rem', fontSize: '1.8rem' }}>Aguardando Aprovação</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '2rem' }}>
              Sua solicitação de matrícula na escola <strong style={{ color: 'white' }}>{selectedSchool?.name}</strong> foi enviada com sucesso.<br /><br />
              Aguarde o administrador aprovar sua conta para ter acesso ao sistema.
            </p>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{ padding: '0.75rem 2rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--text-secondary)', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem' }}
            >
              Sair
            </button>
          </div>
        </div>
      );
    }
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

      {showRankUpChest && rankUpChestItems.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)' }} />
          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '600px', padding: '2rem' }}>
            <ChestReveal
              title="Baú de Patente!"
              subtitle={`Parabéns por alcançar a patente ${levelUpData?.newRank?.name || 'novo'}!`}
              onOpen={handleOpenRankUpChest}
              chestModelUrl={rankUpChestModel?.url}
              chestOpenUrl={rankUpChestModel?.open_url}
              rarity={rankUpChestModel?.rarity}
            />
            {rankUpChestItems.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                ) : (
                  <Package size={32} color="var(--text-secondary)" />
                )}
                <span style={{ flex: 1, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{item.title}</span>
                {item.quantity > 1 && (
                  <span style={{ color: 'var(--gold-primary)', fontSize: '0.85rem', fontWeight: 'bold' }}>x{item.quantity}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Configuração do Sistema */}
      {isSettingsModalOpen && (
        <div className="modal-overlay">
          <div className="glass-panel" style={{ width: '800px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', overflow: 'hidden', animation: 'slideUp 0.3s ease-out', position: 'relative', minHeight: '400px', padding: 0 }}>
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
                {(userData?.role !== 'student' || userData?.studentViewActive) && (
                  <button
                    onClick={() => setSettingsTab('debug')}
                    style={{ background: settingsTab === 'debug' ? 'rgba(251, 191, 36, 0.1)' : 'transparent', color: settingsTab === 'debug' ? 'var(--gold-primary)' : 'var(--text-secondary)', border: 'none', padding: '1rem', textAlign: 'left', cursor: 'pointer', borderLeft: settingsTab === 'debug' ? '3px solid var(--gold-primary)' : '3px solid transparent', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: settingsTab === 'debug' ? 'bold' : 'normal', marginTop: 'auto' }}
                  >
                    <ShieldAlert size={18} /> Debug (Staff)
                  </button>
                )}
              </div>
            </div>

            {/* Conteúdo Principal do Modal */}
            <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
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

              {settingsTab === 'debug' && (userData?.role !== 'student' || userData?.studentViewActive) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left', flex: 1 }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>Modo Debug (Staff)</h4>

                  <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    <strong>Visão de Aluno (Mundo Paralelo)</strong>
                    <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                      Ative para jogar, comprar itens e evoluir como se fosse um aluno. Todo o progresso feito aqui será salvo em um "cofre" separado, mantendo o seu acesso Master, seu XP e itens de Admin 100% protegidos.
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div>
                      <span style={{ color: 'var(--text-primary)', display: 'block', fontWeight: 'bold' }}>Simular como Aluno</span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!userData.studentViewActive} onChange={async () => {
                        if (toggleStudentView) {
                          try {
                            await toggleStudentView();
                            const nextMode = !userData.studentViewActive;
                            showToast(
                              nextMode
                                ? '🎮 Modo Aluno ativado! Recarregando...'
                                : '🔓 Modo Admin restaurado! Recarregando...',
                              'success'
                            );
                            setTimeout(() => window.location.reload(), 1500);
                          } catch (err: any) {
                            console.error(err);
                            alert('Erro ao alternar modo: ' + err.message);
                          }
                        }
                      }} style={{ display: 'none' }} />
                      <div style={{ width: '40px', height: '20px', background: userData.studentViewActive ? 'var(--gold-primary)' : 'rgba(255,255,255,0.2)', borderRadius: '10px', position: 'relative', transition: '0.3s' }}>
                        <div style={{ position: 'absolute', top: '2px', left: userData.studentViewActive ? '22px' : '2px', width: '16px', height: '16px', background: userData.studentViewActive ? 'black' : 'white', borderRadius: '50%', transition: '0.3s' }} />
                      </div>
                    </label>
                  </div>

                  {/* Botão de reset do perfil de aluno */}
                  <div style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-primary)', display: 'block', fontWeight: 'bold', fontSize: '0.9rem' }}>Resetar Perfil de Aluno</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Apaga todo o progresso do mundo paralelo e começa do zero.</span>
                    </div>
                    <button
                      onClick={async () => {
                        const confirmed = await showConfirm(
                          'Isso vai apagar TODO o progresso do seu perfil de aluno: XP, Moedas, Avatar, Histórico de Missões e Inventário.\n\nOs seus dados de Administrador (50.000 XP, itens, patente, etc.) ficam 100% intactos.\n\nDeseja continuar?',
                          'Resetar Perfil de Aluno'
                        );
                        if (!confirmed) return;
                        try {
                          const { resetStudentProfile } = await import('../lib/debugSwap');
                          await resetStudentProfile(userData);
                          localStorage.setItem('studentViewActive', 'true'); // Proteger contra regra de XP no reload
                          showToast('Perfil de aluno resetado com sucesso! Veja o console.', 'success');
                          // setTimeout(() => window.location.reload(), 1500);
                        } catch (err) {
                          console.error('Erro ao resetar perfil:', err);
                          showToast('Erro ao resetar perfil. Tente novamente.', 'error');
                        }
                      }}
                      className="login-btn"
                      style={{ padding: '0.5rem 1rem', background: 'rgba(239,68,68,0.2)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      Resetar
                    </button>
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
              await supabase.from('system_collections').upsert({ id: newId, type: 'themes', data: theme as any });
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
            markTipSeen('intro');
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
          <div className="logo-container" onClick={handleLogoClick} style={{ cursor: 'pointer', userSelect: 'none' }} title="Clique 3x para ver o Sobre">
            <div style={{ width: 64, height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={`${import.meta.env.BASE_URL}logo-math-mastery.png`} alt="Math Mastery" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem', minWidth: 0 }}>
              <h1 className="title-glow">Painel do Aluno</h1>
              <div className="tenant-switcher-desktop" style={{ position: 'relative', zIndex: 99999 }}>
                <TenantSwitcher />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>

            {(userData?.role === 'admin' || userData?.role === 'teacher') && !userData?.studentViewActive && (
              <button
                className="login-btn hide-text-mobile"
                onClick={() => navigate('/admin')}
                style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(251, 191, 36, 0.1)', borderColor: 'var(--gold-primary)' }}
                title={userData?.role === 'admin' ? 'Painel Master' : 'Painel do Professor'}
              >
                <ShieldAlert size={18} color="var(--gold-primary)" />
                <span style={{ color: 'var(--gold-primary)' }}>{userData?.role === 'admin' ? 'Painel Master' : 'Painel do Professor'}</span>
              </button>
            )}

            <div className="tenant-switcher-mobile" style={{ position: 'relative' }}>
              <button className="login-btn mobile-menu-btn" onClick={() => setStudentMobileMenuOpen(o => !o)} style={{ padding: '0.5rem', borderRadius: '8px' }} title="Menu">
                <Menu size={20} />
              </button>
              {studentMobileMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setStudentMobileMenuOpen(false)} />
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: 'var(--bg-panel)', border: '1px solid var(--border-glass)', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', padding: '0.5rem', minWidth: '240px', zIndex: 1000 }}>
                    <TenantSwitcher variant="menu" />
                  </div>
                </>
              )}
            </div>

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
                              <span>{quest.randomQuestionSelection && quest.randomQuestionCount ? quest.randomQuestionCount : (quest.questions?.length || 0)} Desafios</span>
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
                              // Require avatar if in student mode or is a student
                              const isActingAsStudent = userData?.role === 'student' || !!userData?.studentViewActive;
                              if (isActingAsStudent && !userData?.avatarConfig) {
                                await showAlert('Você precisa criar o seu avatar antes de jogar uma missão!');
                                return;
                              }
                              if (!isCompleted && currentHpVisual < 1 && isActingAsStudent) {
                                await showAlert('Você precisa de pelo menos 1 coração (vida) para jogar um desafio! Espere regenerar ou use um item de cura.');
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
                style={{ background: profileTab === 'overview' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: profileTab === 'overview' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
              >
                <Star size={20} /> {(userData?.role === 'student' || userData?.studentViewActive) ? 'Personagem e Histórico' : 'Personagem'}
              </button>
              <button
                onClick={() => setProfileTab('inventory')}
                className="login-btn"
                style={{ background: profileTab === 'inventory' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: profileTab === 'inventory' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
              >
                <Package size={20} /> Mochila
              </button>
            </div>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: (userData?.role === 'student' || userData?.studentViewActive || profileTab === 'inventory') ? 'flex-start' : 'center' }}>
              {/* Perfil do Aluno (Esquerda) */}
              <div className="glass-panel" style={{ flex: (userData?.role === 'student' || userData?.studentViewActive) ? '1 1 400px' : '0 1 500px', padding: '1.5rem 2rem 5vh 1.5rem', textAlign: 'center', position: 'relative', minHeight: '60vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', alignSelf: 'flex-start' }}>

                <div style={{ flexShrink: 0, paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '2rem', height: '100%' }}>
                  <div
                    style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', perspective: '1000px', width: '100%' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                      <button onClick={() => setCubeRotation(prev => prev + 90)} style={{ position: 'relative', zIndex: 1, background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}>
                        {'<'}
                      </button>

                      <div className="cube-container" style={{ position: 'relative', zIndex: 100 }}>
                        <div className="cube" style={{ transform: `rotateY(${cubeRotation}deg)` }}>
                          {/* Frente: Avatar */}
                          <div className="cube-face cube-face-front" style={{
                            border: `3px solid ${currentRank.color}`,
                            boxShadow: `0 0 20px ${currentRank.color}40`,
                            flexDirection: 'column',
                            background: 'linear-gradient(to bottom, var(--bg-panel), var(--bg-dark))'
                          }} title="Clique para personalizar seu personagem">

                            {/* Rock Pedestal/Shadow */}
                            <div style={{
                              position: 'absolute',
                              bottom: '0',
                              left: '0',
                              width: '100%',
                              height: '35%',
                              background: 'radial-gradient(ellipse at top, rgba(255, 255, 255, 0.15) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0) 80%)',
                              borderTopLeftRadius: '50% 100%',
                              borderTopRightRadius: '50% 100%',
                              borderBottomLeftRadius: '12px',
                              borderBottomRightRadius: '12px',
                              zIndex: 0
                            }} />

                            <div style={{ position: 'absolute', bottom: -15, left: '50%', transform: 'translateX(-50%)', background: currentRank.color, padding: '0.25rem 1rem', borderRadius: '20px', color: getContrastColor(currentRank.color), fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', boxShadow: `0 0 10px ${currentRank.color}80`, zIndex: 10, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {userData?.characterName || 'Personagem'}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRenameCharacter(); }}
                                style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', opacity: 0.7 }}
                                title={userData?.characterName ? 'Renomear personagem' : 'Criar nome do personagem'}
                              >
                                <Edit3 size={12} />
                              </button>
                            </div>
                            {(liveAvatarConfig || userData?.avatarConfig) ? (
                              <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', position: 'relative', zIndex: 20 }} onClick={() => setIsCustomizingAvatar(true)}>
                                <AvatarCharacter
                                  config={(liveAvatarConfig || userData.avatarConfig)}
                                  size={90}
                                  equippedItems={equippedItems}
                                  interactive={false}
                                  animation={getProfileAvatarState(userData, liveAvatarConfig || userData.avatarConfig).animation as any}
                                  expression={getProfileAvatarState(userData, liveAvatarConfig || userData.avatarConfig).expression as any}
                                  showSlots={true}
                                  actionPoses={(liveAvatarConfig || userData.avatarConfig)?.actionPoses}
                                  faceCamera={true}
                                  onAvatarClick={() => setIsCustomizingAvatar(true)}
                                  onSlotClick={handleUnequipItem}
                                  onToggleSlotVisibility={handleToggleSlotVisibility}
                                />
                              </div>
                            ) : (
                              <img onClick={() => setIsCustomizingAvatar(true)} src={userData?.photoURL} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px', cursor: 'pointer' }} />
                            )}
                          </div>

                          {/* Trás: Patente */}
                          <div className="cube-face cube-face-back" style={{ border: `3px solid ${currentRank.color}`, boxShadow: `0 0 20px ${currentRank.color}40`, flexDirection: 'column', background: 'linear-gradient(to bottom, var(--bg-panel), var(--bg-dark))' }}>
                            {currentDisplayImage ? (
                              <CachedImage key={currentDisplayImage} src={currentDisplayImage} alt={currentRank.name} style={{ width: 170, height: 170, objectFit: 'contain', filter: `drop-shadow(0 0 20px ${currentRank.color}80)`, animation: 'epicZoom 1s ease-out' }} />
                            ) : (
                              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: currentRank.color }}>{currentRank.name}</div>
                            )}
                            <div style={{ position: 'absolute', bottom: -15, left: '50%', transform: 'translateX(-50%)', background: currentRank.color, padding: '0.25rem 1rem', borderRadius: '20px', color: getContrastColor(currentRank.color), fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', boxShadow: `0 0 10px ${currentRank.color}80`, zIndex: 10 }}>
                              {currentRank.name}
                            </div>
                          </div>

                          {/* Direita: Pet */}
                          <div className="cube-face cube-face-right" style={{ border: `3px solid ${currentRank.color}`, boxShadow: `0 0 20px ${currentRank.color}40`, flexDirection: 'column', background: 'linear-gradient(to bottom, var(--bg-panel), var(--bg-dark))' }}>
                            {(() => {
                              const equippedPet = equippedItems.find(item => item.avatarPart === 'pet');
                              return equippedPet ? (
                                <CachedImage src={equippedPet.imageUrl} alt="Pet" style={{ width: 140, height: 140, objectFit: 'contain', animation: 'float 3s ease-in-out infinite' }} />
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.5 }}>
                                  <div style={{ width: 100, height: 100, border: '3px dashed var(--border-glass)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                                    <span style={{ fontSize: '3rem' }}>🐾</span>
                                  </div>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 'bold' }}>Nenhum Pet</span>
                                </div>
                              );
                            })()}
                            <div style={{ position: 'absolute', bottom: -15, left: '50%', transform: 'translateX(-50%)', background: currentRank.color, padding: '0.25rem 1rem', borderRadius: '20px', color: getContrastColor(currentRank.color), fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', boxShadow: `0 0 10px ${currentRank.color}80`, zIndex: 10 }}>
                              Companheiro
                            </div>
                          </div>

                          {/* Esquerda: Status Integrado */}
                          <div className="cube-face cube-face-left" style={{
                            border: `3px solid ${currentRank.color}`,
                            boxShadow: `0 0 20px ${currentRank.color}40`,
                            flexDirection: 'column',
                            background: 'linear-gradient(to bottom, var(--bg-panel), var(--bg-dark))',
                            padding: '12px',
                            justifyContent: 'center'
                          }}>

                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>

                              {(!userData?.studentViewActive && userData?.role !== 'student') ? null : (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '2px' }}>
                                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Turma</span>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{userData?.classId || 'N/A'}</span>
                                </div>
                              )}

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '2px' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Experiência Total</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>{userData?.xp || 0} XP</span>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '2px' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>HP</span>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', maxWidth: '100%' }}>
                                  {(() => {
                                    const stats = calculateTotalStats(equippedItems, userData?.distributedStats);
                                    const maxHearts = 3 + Math.floor((RANKS.findIndex(r => r.name === currentRank.name) || 0) / 2) + Math.floor(stats.vitality / 30);
                                    const displayHp = userData?.role === 'admin' || userData?.role === 'teacher' ? maxHearts : currentHpVisual;

                                    const nowTime = Date.now();
                                    const equippedRed = equippedItems
                                      .filter(item => (item as any).gameEffect === 'reduce_hp_cooldown')
                                      .reduce((acc, item) => acc + Number((item as any).hpCooldownReductionMinutes || 0), 0);
                                    const isBuffAct = userData.hpCooldownReductionUntil && userData.hpCooldownReductionUntil > nowTime;
                                    const buffRed = isBuffAct ? Number(userData.hpCooldownReductionMinutes || 0) : 0;
                                    const effMin = Math.max(1, 30 - Math.min(29, equippedRed + buffRed));
                                    const totalCycleMs = effMin * 60 * 1000;

                                    return (
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                          {Array.from({ length: maxHearts }).map((_, i) => {
                                            let fillPct = 0;
                                            if (i < displayHp) {
                                              fillPct = 100;
                                            } else if (i === displayHp && displayHp < maxHearts) {
                                              fillPct = nextHeartProgress;
                                            }
                                            const isCharging = i === displayHp && displayHp < maxHearts;
                                            const remainingMs = totalCycleMs - ((nextHeartProgress / 100) * totalCycleMs);
                                            const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
                                            const tooltip = isCharging
                                              ? `Regenerando coração (${Math.round(fillPct)}%) — ~${remainingMin} min restantes${effMin < 30 ? ` (Acelerado: ${effMin} min/coração)` : ''}`
                                              : (i < displayHp ? 'Coração Cheio' : 'Coração Vazio');

                                            return (
                                              <span key={i} title={tooltip} style={{ display: 'inline-flex' }}>
                                                <NintendoHeart
                                                  fillPercentage={fillPct}
                                                  size={12}
                                                  title={tooltip}
                                                />
                                              </span>
                                            );
                                          })}
                                        </div>
                                        {effMin < 30 && displayHp < maxHearts && (
                                          <span style={{ fontSize: '0.6rem', color: '#f87171', fontWeight: 'bold' }}>
                                            ⚡ {effMin}m / coração
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>

                              {/* Progress */}
                              {nextRank ? (
                                <div style={{ margin: '2px 0' }}>
                                  <div style={{ width: '100%', height: '4px', background: 'rgba(0,0,0,0.3)', borderRadius: '2px', overflow: 'hidden', marginBottom: '2px' }}>
                                    <div style={{ height: '100%', width: `${progressPercentage}%`, background: `linear-gradient(90deg, ${currentRank.color}, ${nextRank.color})`, borderRadius: '2px', transition: 'width 1s ease-in-out' }}></div>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                    <span>{currentRank.name}</span>
                                    <span>Faltam {nextRank.minXp - (userData?.xp || 0)} XP</span>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '0.7rem', textAlign: 'center', margin: '2px 0' }}>
                                  Patente Máxima Alcançada!
                                </div>
                              )}

                              {/* Character Stats Section */}
                              {(() => {
                                const stats = calculateTotalStats(equippedItems, userData?.distributedStats);
                                const rankIndex = Math.max(0, RANKS.findIndex(r => r.name === currentRank.name));
                                const totalEarnedPoints = rankIndex * 4;
                                const confirmedStats = userData?.distributedStats || {};
                                const totalConfirmedPoints = Object.values(confirmedStats).reduce((sum: any, val: any) => sum + (val || 0), 0) as number;
                                const unspentPoints = totalEarnedPoints - totalConfirmedPoints;

                                return (
                                  <div style={{ marginTop: '2px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                      <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', margin: 0 }}>Estatísticas</h4>
                                      {unspentPoints > 0 && (
                                        <button
                                          onClick={() => setShowStatDistributionModal(true)}
                                          className="glow-effect hover-brightness"
                                          style={{
                                            background: 'var(--gold-primary)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.3)',
                                            borderRadius: '4px', padding: '0.1rem 0.3rem', fontSize: '0.65rem', fontWeight: 'bold',
                                            display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer',
                                            boxShadow: '0 0 5px var(--gold-primary)'
                                          }}
                                        >
                                          <Plus size={10} /> <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{unspentPoints} pts</span>
                                        </button>
                                      )}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '4px' }}>
                                      {Object.entries(stats).map(([key, value]) => {
                                        if (value === 0 && key !== 'attack' && key !== 'defense' && key !== 'vitality') return null;
                                        const labelInfo = ATTRIBUTE_LABELS[key] || ATTRIBUTE_LABELS['none'];
                                        let displayValue = `+${value}`;
                                        if (key === 'xp' || key === 'coins') displayValue += '%';

                                        return (
                                          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '4px', gap: '2px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', minWidth: 0 }}>
                                              <span style={{ fontSize: '0.8rem', flexShrink: 0 }} title={labelInfo.label}>{labelInfo.icon}</span>
                                              <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{labelInfo.label}</span>
                                            </div>
                                            <span style={{ fontSize: '0.65rem', color: labelInfo.color, fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.8)', flexShrink: 0 }}>
                                              {displayValue}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}

                            </div>

                            <div style={{ position: 'absolute', bottom: -15, left: '50%', transform: 'translateX(-50%)', background: currentRank.color, padding: '0.25rem 1rem', borderRadius: '20px', color: getContrastColor(currentRank.color), fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', boxShadow: `0 0 10px ${currentRank.color}80`, zIndex: 10 }}>
                              Status
                            </div>
                          </div>
                        </div>
                      </div>

                      <button onClick={() => setCubeRotation(prev => prev - 90)} style={{ position: 'relative', zIndex: 1, background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}>
                        {'>'}
                      </button>
                    </div>

                    {/* Balão do companheiro (boneco) */}
                    {bubble && (Math.round((((cubeRotation % 360) + 360) % 360) / 90) % 4) === 0 && (
                      <div className="companion-bubble" onClick={handleBubbleClick} title="Clique para continuar">
                        {companionTips.find(t => t.id === bubble.tipId)?.lines[bubble.step]}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem', marginBottom: '1rem', justifyContent: 'center' }}>
                    <h2 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', margin: 0 }}>{userData?.name}</h2>
                  </div>

                  {isEditingStatus ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', background: 'var(--btn-bg)', padding: '0.5rem 1rem', borderRadius: '20px', width: '100%', maxWidth: '400px' }}>
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
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', flex: 1, outline: 'none', fontStyle: 'italic', width: '100%', fontSize: '0.9rem' }}
                      />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', background: 'var(--btn-bg)', padding: '0.5rem 1rem', borderRadius: '20px', color: 'var(--text-secondary)', minHeight: '36px', width: '100%', maxWidth: '400px', fontSize: '0.9rem' }}>
                      <MessageCircle size={16} />
                      <span style={{ fontStyle: 'italic', flex: 1 }}>{userData?.customStatusText ? `"${userData.customStatusText}"` : "Escreva seu status..."}</span>
                      <button onClick={() => { setStatusInputValue(userData?.customStatusText || ''); setIsEditingStatus(true); }} style={{ background: 'transparent', border: 'none', color: 'var(--gold-primary)', cursor: 'pointer', padding: '0 0.25rem', display: 'flex' }} className="hover-brightness" title="Editar Status">
                        <Edit3 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {/* Coluna Direita Alternável (Histórico ou Mochila) */}
              {(userData?.role === 'student' || userData?.studentViewActive) && profileTab === 'overview' && (
                <div className="glass-panel" style={{ flex: '2 1 500px', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', height: '71vh', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                    <History size={24} color="var(--gold-primary)" />
                    <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Histórico de Conquistas</h3>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', maxHeight: '600px', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {loadingHistory ? (
                      <p style={{ color: 'var(--text-secondary)' }}>Carregando suas conquistas...</p>
                    ) : xpHistory.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                        <Star size={48} style={{ opacity: 0.5, margin: '0 auto 1rem auto' }} />
                        <p>Você ainda não recebeu XP.<br />Complete desafios e atividades para subir de patente!</p>
                      </div>
                    ) : (
                      xpHistory.map((item: any, index: number) => {
                        const isRank = item.type === 'rank_up';
                        const isItem = item.type === 'item';
                        const isNegative = item.badgeType === 'xp_negative';

                        let borderColor = 'var(--gold-primary)';
                        let badgeBg = 'rgba(251, 191, 36, 0.15)';
                        let badgeColor = 'var(--gold-primary)';

                        if (isRank) {
                          borderColor = '#a855f7';
                          badgeBg = 'rgba(168, 85, 247, 0.2)';
                          badgeColor = '#c084fc';
                        } else if (isItem) {
                          borderColor = '#3b82f6';
                          badgeBg = 'rgba(59, 130, 246, 0.15)';
                          badgeColor = '#60a5fa';
                        } else if (isNegative) {
                          borderColor = 'var(--accent-red)';
                          badgeBg = 'rgba(239, 68, 68, 0.15)';
                          badgeColor = 'var(--accent-red)';
                        }

                        const dateObj = item.timestamp ? (typeof item.timestamp === 'number' ? new Date(item.timestamp) : (item.timestamp.seconds ? new Date(item.timestamp.seconds * 1000) : new Date(item.timestamp))) : new Date();

                        return (
                          <div key={item.id || index} style={{ padding: '1.1rem 1.25rem', background: 'rgba(0,0,0,0.25)', borderRadius: '12px', borderLeft: `4px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0, flex: 1 }}>
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt="" style={{ width: '42px', height: '42px', objectFit: 'contain', borderRadius: '8px', flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {isRank ? <Trophy size={22} color="#c084fc" /> : isItem ? <Package size={22} color="#60a5fa" /> : <Star size={22} color="var(--gold-primary)" />}
                                </div>
                              )}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <h4 style={{ fontSize: '1.05rem', margin: '0 0 0.2rem 0', fontWeight: 'bold', color: 'var(--text-primary)', whiteSpace: 'normal' }}>
                                  {item.title || item.evalName}
                                </h4>
                                {item.subtitle && (
                                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {item.subtitle}
                                  </p>
                                )}
                                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>
                                  Data: {dateObj.toLocaleDateString('pt-BR')} | Hora: {dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: badgeColor, background: badgeBg, padding: '0.4rem 0.9rem', borderRadius: '20px', whiteSpace: 'nowrap', border: `1px solid ${borderColor}40` }}>
                              {item.badgeText || (item.xpGained !== undefined ? `${item.xpGained > 0 ? '+' : ''}${item.xpGained} XP` : 'Conquista')}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {profileTab === 'inventory' && (
                <div className="glass-panel" style={{ flex: '2 1 500px', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', height: '71vh', overflow: 'hidden' }}>
                  {userData && <StudentInventory userData={userData} onEquip={() => {
                    setInventoryRefresh(r => r + 1);
                    setCubeRotation(prev => prev % 360 !== 0 ? Math.round(prev / 360) * 360 : prev);
                  }} inventoryRefresh={inventoryRefresh} />}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'ranking_class' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-glass)', flexShrink: 0, background: 'var(--bg-card)', backdropFilter: 'blur(12px)' }}>
              <Users size={32} color="var(--gold-primary)" />
              <div style={{ flex: 1, minWidth: '200px' }}>
                <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Top 10 da Turma</h2>
                {isAdminOrTeacher ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Ver turma:</span>
                    <select
                      value={targetClassRanking}
                      onChange={(e) => setSelectedClassForRanking(e.target.value)}
                      style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-glass)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                    >
                      {uniqueClasses.length > 0 ? (
                        uniqueClasses.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))
                      ) : (
                        <option value="">Nenhuma turma encontrada</option>
                      )}
                    </select>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Sua sala: {userData?.classId || 'Não definida'}</p>
                )}
              </div>
              <button
                onClick={() => setShowRankingAvatars(!showRankingAvatars)}
                className="login-btn hide-text-mobile"
                style={{ background: 'transparent', border: '1px solid var(--gold-primary)', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                title={showRankingAvatars ? "Ocultar Avatares" : "Mostrar Avatares"}
              >
                {showRankingAvatars ? <EyeOff size={18} /> : <Eye size={18} />}
                <span>{showRankingAvatars ? 'Ocultar Avatares' : 'Mostrar Avatares'}</span>
              </button>
            </div>
            <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
              {targetClassRanking ? renderRankingList(classStudents, 'class') : <p style={{ color: 'var(--text-secondary)' }}>Você precisa estar em uma turma para ver o ranking dela.</p>}
            </div>
          </div>
        )}

        {activeTab === 'ranking_general' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-glass)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-glass)', flexShrink: 0, background: 'var(--bg-card)', backdropFilter: 'blur(12px)' }}>
              <Trophy size={32} color="var(--gold-primary)" />
              <div style={{ flex: 1, minWidth: '200px' }}>
                <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Top 10 Geral</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Os maiores pontuadores de toda a escola.</p>
              </div>
              <button
                onClick={() => setShowRankingAvatars(!showRankingAvatars)}
                className="login-btn hide-text-mobile"
                style={{ background: 'transparent', border: '1px solid var(--gold-primary)', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                title={showRankingAvatars ? "Ocultar Avatares" : "Mostrar Avatares"}
              >
                {showRankingAvatars ? <EyeOff size={18} /> : <Eye size={18} />}
                <span>{showRankingAvatars ? 'Ocultar Avatares' : 'Mostrar Avatares'}</span>
              </button>
            </div>
            <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
              {renderRankingList(top10General, 'general')}
            </div>
          </div>
        )}

        {activeTab === 'store' && userData && (
          <StudentStore userData={userData} />
        )}

      </main>

      <StatDistributionModal
        isOpen={showStatDistributionModal}
        onClose={() => setShowStatDistributionModal(false)}
        userData={userData}
      />

      <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} />

      <TeacherWanderer
        myUid={userData?.uid}
        tenantId={tenantId || userData?.tenantId || null}
        isRankingView={activeTab === 'ranking_class' || activeTab === 'ranking_general'}
        top3Names={(activeTab === 'ranking_class' ? classStudents : top10General).slice(0, 3).map(s => s.characterName || s.name)}
        onOpenTeacherProfile={async (profileUid) => {
          let student = allStudents.find(s => s.uid === profileUid);
          if (!student) {
            // Professor não está em allStudents (só alunos): buscar do banco
            const { data } = await supabase.from('users').select('*').eq('id', profileUid).single();
            if (data) student = mapUserToClient(data);
          }
          if (student) setPublicProfileUser({ user: student, rankPos: 0 });
        }}
      />

      <ChatWidget onOpenProfile={(profileUid) => {
        const student = allStudents.find(s => s.uid === profileUid);
        if (student) setPublicProfileUser({ user: student, rankPos: 0 });
      }} />
    </div>
  );
}
