import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { LogOut, Trophy, Settings, History, ShieldAlert, Star, Hammer, TrendingUp, Users, Swords, Clock, CheckCircle, Store, Package, Eye, EyeOff, Plus, ChevronDown, ChevronRight, Lock } from 'lucide-react';
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
// @ts-ignore
import BlacksmithView from '../components/BlacksmithView';
import StudentInventory from '../components/StudentInventory';
import CachedImage from '../components/CachedImage';
import { useDialog } from '../contexts/DialogContext';
import AvatarCharacter, { type EquippedItem } from '../components/AvatarCharacter';
import LazyAnimatedAvatar from '../components/LazyAnimatedAvatar';
import PublicProfileModal from '../components/PublicProfileModal';
import AvatarCustomizationModal from '../components/AvatarCustomizationModal';
import { getProfileAvatarState, hasProfanity } from '../lib/avatarState';
import { Edit3, MessageCircle, X, Box, Palette, Menu, Trash2 } from 'lucide-react';
import { sessionCache, CACHE_KEYS, CACHE_TTL } from '../lib/sessionCache';
import OnboardingModal from '../components/OnboardingModal';
import SchoolSelectorModal from '../components/SchoolSelectorModal';
import ClassSelectorModal from '../components/ClassSelectorModal';
import CustomThemeModal, { type CustomTheme } from '../components/CustomThemeModal';
import { applyCustomTheme, applyFontPreset, applyFontScale } from '../lib/theme';
import { validateCharacterName, normalizeForComparison, normalizeNameForMatch, formatFirstAndLastName } from '../lib/nameValidation';
import { fetchModel3DById } from '../lib/model3d';
import { fetchAiQuestFlavor } from '../lib/questAi';
import { COMPANION_TIPS, fetchCompanionTips } from '../lib/companionTips';
import ChatWidget from '../components/ChatWidget';
import TeacherWanderer from '../components/TeacherWanderer';
import AboutModal from '../components/AboutModal';
import TenantSwitcher from '../components/TenantSwitcher';
import { usePermissions, getPanelRoleName, panelLabel, baseRolePanelLabel } from '../lib/permissions';
import StatDistributionModal from '../components/StatDistributionModal';
import NintendoHeart from '../components/NintendoHeart';
import { fetchStudentAchievementHistory } from '../lib/achievementHistory';
import { fetchEquippedItems, invalidateEquippedItems } from '../lib/equippedItems';
import { orderEffectFirst } from '../lib/damageEffects';
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
              alwaysAnimate={rankPos <= 3}
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
  const { can: canView } = usePermissions();
  // Áreas que pertencem ao Painel Master (staff). Se o usuário (mesmo aluno)
  // tem função de hierarquia com permissão em alguma delas, mostra o botão.
  // 'themes' fica fora: aluno tem view-only (escolher tema), não administra.
  const ADMIN_AREAS = ['users', 'quests_admin', 'items', 'economy', 'classes', 'approvals', 'config', 'ranks', 'entities', 'models', 'skins', 'debug3d', 'pre_authorized', 'tenants', 'companion', 'arena_debug'];
  const hasAdminAccess = ADMIN_AREAS.some(a => canView(a, 'view'));
  // Nome da função que dá título ao painel (função de hierarquia ou base)
  const [panelRoleName, setPanelRoleName] = useState(() => baseRolePanelLabel(userData?.role));
  useEffect(() => {
    if (!userData?.uid) return;
    let active = true;
    getPanelRoleName(userData.uid, tenantId, userData.role).then(n => { if (active) setPanelRoleName(n); }).catch(() => {});
    return () => { active = false; };
  }, [userData?.uid, tenantId, userData?.role]);
  if (!userData) return null;
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('quests');
  const [profileTab, setProfileTab] = useState('overview');
  const [xpHistory, setXpHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expandedPvpId, setExpandedPvpId] = useState<string | null>(null);

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
      // Snap cube to character face before showing inventory
      setCubeRotation(prev => Math.round(prev / 360) * 360);
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
  // Pausa temporária do giro do cubo (ex.: após subir de patente, para ver os status)
  const [cubePaused, setCubePaused] = useState(false);
  const cubePauseTimeoutRef = useRef<any>(null);
  const [rankImageIndex, setRankImageIndex] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const lastInteractionTime = useRef(Date.now());
  const [loadingRankings, setLoadingRankings] = useState(true);

  // Enrollment flow state
  const [enrollmentStep, setEnrollmentStep] = useState<'school' | 'class' | 'pending' | 'complete'>('school');
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  // Quando o usuário clica em "Voltar" para a seleção de escola, NÃO deixa o efeito
  // de auto-pulo (tenantId presente) forçá-lo de volta à escolha de turma.
  const schoolBackRef = useRef(false);

  // Se o usuário já tem uma escola vinculada (ex: conta local criada pelo admin),
  // pula a seleção de escola e vai direto para a escolha da turma.
  useEffect(() => {
    if (schoolBackRef.current) return; // usuário voltou manualmente p/ seleção de escola
    if (userData?.tenantId && !userData?.classId && enrollmentStep === 'school') {
      let active = true;
      (async () => {
        const { data } = await supabase.from('tenants').select('name').eq('id', userData.tenantId).maybeSingle();
        if (!active) return;
        setSelectedSchool({ id: userData.tenantId, name: data?.name || 'Sua Escola' });
        setEnrollmentStep('class');
      })();
      return () => { active = false; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.tenantId, userData?.classId, enrollmentStep]);

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
  // @ts-ignore
  const [levelUpData, setLevelUpData] = useState<{ oldRank: RankDef | null, newRank: RankDef } | null>(null);

  // Rank Up Chest State
  const [showRankUpChest, setShowRankUpChest] = useState(false);
  const [rankUpChestItems, setRankUpChestItems] = useState<any[]>([]);
  const [rankUpChestModel, setRankUpChestModel] = useState<any>(null);

  // Quests State
  const [activeQuests, setActiveQuests] = useState<any[]>([]);
  // Textos de missão gerados pela IA (cache por missão)
  const [aiQuestFlavors, setAiQuestFlavors] = useState<Record<string, string>>({});
  const [completedQuestIds, setCompletedQuestIds] = useState<string[]>([]);
  const [claimedChestIds, setClaimedChestIds] = useState<Set<string>>(new Set());
  const [completedQuestDates, setCompletedQuestDates] = useState<Record<string, number>>({});
  const [loadingQuests, setLoadingQuests] = useState(true);
  const [activeLiveQuests, setActiveLiveQuests] = useState<Record<string, boolean>>({});

  // Status Bubbles
  const [activeBubbleId, setActiveBubbleId] = useState<string | null>(null);

  // Lista atual do ranking (para rotacionar os balões de status entre quem tem status)
  const rankingListRef = useRef<UserData[]>([]);

  // Com os avatares exibidos, mostra o balão de status em cada posição do ranking,
  // um de cada vez, começando pela 1ª colocação. O intervalo entre diálogos é
  // 60 / N segundos, onde N = nº de jogadores do top 10 com status preenchido
  // (status vazio ou só espaços não exibe balão e não conta).
  useEffect(() => {
    if (!showRankingAvatars) { setActiveBubbleId(null); return; }
    let cancelled = false;
    let timeoutId: any;
    let hideTimeoutId: any;
    let currentIdx = 0;

    const studentsWithStatus = () => rankingListRef.current.filter(s => s.customStatusText && s.customStatusText.trim() !== '');

    const tick = () => {
      if (cancelled) return;
      const list = studentsWithStatus();
      if (list.length === 0) {
        // Ainda sem status no ranking (lista carregando) — tenta de novo em breve
        timeoutId = setTimeout(tick, 1000);
        return;
      }
      // Exibe o balão do personagem atual por 5s e depois some
      setActiveBubbleId(list[currentIdx % list.length].uid);
      currentIdx++;
      hideTimeoutId = setTimeout(() => { if (!cancelled) setActiveBubbleId(null); }, 5000);
      // Intervalo = 60 / N segundos entre o início de um diálogo e o próximo
      timeoutId = setTimeout(tick, 60000 / Math.max(1, list.length));
    };
    tick();

    return () => { cancelled = true; clearTimeout(timeoutId); clearTimeout(hideTimeoutId); };
  }, [showRankingAvatars, activeTab]);

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
  const [userThemes, setUserThemes] = useState<CustomTheme[]>([]);
  const [showCustomThemeModal, setShowCustomThemeModal] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CustomTheme | undefined>(undefined);
  const MAX_USER_THEMES = 10;
  const [questChestToOpen, setQuestChestToOpen] = useState<{ quest: any; chestModel?: any } | null>(null);
  const [questChestWonItems, setQuestChestWonItems] = useState<{ title: string; imageUrl?: string; quantity: number }[]>([]);

  const handleOpenQuestChestModal = async (e: React.MouseEvent, q: any) => {
    e.stopPropagation();
    let chestModel = null;
    const chestModelId = q.chestConfig?.chestModelId || q.liveChest1stPlace?.chestModelId;
    if (chestModelId) {
      try {
        chestModel = await fetchModel3DById(chestModelId, tenantId);
      } catch(err) { console.error(err); }
    }
    setQuestChestToOpen({ quest: q, chestModel });
  };

  const getCurrentThemeData = (): CustomTheme | null => {
    if (appTheme === 'custom_local') {
      const saved = localStorage.getItem('currentCustomThemeData');
      return saved ? JSON.parse(saved) : null;
    }
    if (appTheme.startsWith('user_')) {
      return userThemes.find(t => t.id === appTheme) || null;
    }
    if (appTheme.startsWith('global_') || appTheme.startsWith('custom_')) {
      return globalThemes.find(t => t.id === appTheme) || null;
    }
    return null;
  };

  const getComputedTheme = (): CustomTheme => {
    const cs = getComputedStyle(document.body);
    const getVar = (v: string) => cs.getPropertyValue(v).trim();

    const parseColor = (val: string): { hex: string; opacity: number } => {
      if (!val) return { hex: '#000000', opacity: 1 };
      val = val.trim();
      // HEX direto
      if (val.startsWith('#')) {
        return { hex: val.length === 4 ? '#' + val[1]+val[1]+val[2]+val[2]+val[3]+val[3] : val, opacity: 1 };
      }
      // rgba(r, g, b, a) ou rgb(r, g, b)
      const m = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
      if (m) {
        const hex = '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
        const opacity = m[4] !== undefined ? parseFloat(m[4]) : 1;
        return { hex, opacity };
      }
      return { hex: '#000000', opacity: 1 };
    };

    const parseShadowColor = (val: string): { hex: string; opacity: number } => {
      // "0 8px 32px 0 rgba(0, 0, 0, 0.37)" -> extrair a cor
      const m = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
      if (m) {
        const hex = '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
        const opacity = m[4] !== undefined ? parseFloat(m[4]) : 1;
        return { hex, opacity };
      }
      return { hex: '#000000', opacity: 0.37 };
    };

    const bgDark = parseColor(getVar('--bg-dark'));
    const bgPanel = parseColor(getVar('--bg-panel'));
    const bgCard = parseColor(getVar('--bg-card'));
    const btnBg = parseColor(getVar('--btn-bg'));
    const btnHover = parseColor(getVar('--btn-hover'));
    const textPrimary = parseColor(getVar('--text-primary'));
    const textSecondary = parseColor(getVar('--text-secondary'));
    const goldPrimary = parseColor(getVar('--gold-primary'));
    const goldGlow = parseColor(getVar('--gold-glow'));
    const borderGlass = parseColor(getVar('--border-glass'));
    const shadowGlass = parseShadowColor(getVar('--shadow-glass'));
    const textOnGold = parseColor(getVar('--text-on-gold') || '#000000');
    const bgBadge = parseColor(getVar('--bg-badge') || 'rgba(0,0,0,0.5)');

    // Extrair URL do background-image do body
    const bgImage = document.body.style.backgroundImage || '';
    let bgUrl = '';
    const urlMatch = bgImage.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
    if (urlMatch) bgUrl = urlMatch[1];

    // Extrair opacidade do gradient overlay
    let bgOpacity = 0.85;
    const gradMatch = bgImage.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
    if (gradMatch) bgOpacity = parseFloat(gradMatch[1]);

    return {
      id: 'new_' + Date.now(),
      name: 'Novo Tema',
      colors: {
        bgDark: bgDark.hex, bgDarkOpacity: bgDark.opacity,
        bgPanel: bgPanel.hex, bgPanelOpacity: bgPanel.opacity,
        bgCard: bgCard.hex, bgCardOpacity: bgCard.opacity,
        btnBg: btnBg.hex, btnBgOpacity: btnBg.opacity,
        btnHover: btnHover.hex, btnHoverOpacity: btnHover.opacity,
        textPrimary: textPrimary.hex, textPrimaryOpacity: textPrimary.opacity,
        textSecondary: textSecondary.hex, textSecondaryOpacity: textSecondary.opacity,
        textOnGold: textOnGold.hex, textOnGoldOpacity: textOnGold.opacity,
        bgBadge: bgBadge.hex, bgBadgeOpacity: bgBadge.opacity,
        goldPrimary: goldPrimary.hex, goldPrimaryOpacity: goldPrimary.opacity,
        goldGlow: goldGlow.hex, goldGlowOpacity: goldGlow.opacity,
        borderGlass: borderGlass.hex, borderGlassOpacity: borderGlass.opacity,
        shadowGlass: shadowGlass.hex, shadowGlassOpacity: shadowGlass.opacity,
      },
      backgroundImageUrl: bgUrl,
      backgroundOpacity: bgOpacity,
    };
  };

  useEffect(() => {
    const fetchThemes = async () => {
      const { data } = await supabase.from('system_collections').select('*').eq('collection_name', 'themes');
      if (data) {
        setGlobalThemes(data.map(d => ({ id: d.id, ...(d.data as any) } as CustomTheme)));
      }
    };
    fetchThemes();
  }, []);

  useEffect(() => {
    const fetchUserThemes = async () => {
      if (!userData?.uid) return;
      const { data } = await supabase
        .from('user_themes')
        .select('*')
        .eq('user_id', userData.uid)
        .order('created_at', { ascending: true });
      if (data) {
        setUserThemes(data.map(d => ({ id: d.id, ...(d.data as any) } as CustomTheme)));
      }
    };
    fetchUserThemes();
  }, [userData?.uid]);

  useEffect(() => {
    if (appFonts === 'default') {
      const currentThemeData = getCurrentThemeData();
      if (currentThemeData?.fontFamily) {
        applyFontPreset(currentThemeData.fontFamily);
        applyFontScale(currentThemeData.fontFamily, currentThemeData.fontScale ?? 1);
      } else {
        applyFontPreset('default');
        applyFontScale('default', currentThemeData?.fontScale ?? 1);
      }
    } else {
      // Escolha explícita do usuário prevalece sobre a fonte do tema
      applyFontPreset(appFonts);
      applyFontScale(appFonts);
    }
  }, [appFonts, appTheme]);
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

  // Giro automático do cubo quando ocioso (pausado enquanto houver dicas do companheiro, mochila aberta ou pausa temporária)
  useEffect(() => {
    if (!cubeAutoRotate || !isIdle || pendingTips.length > 0 || profileTab === 'inventory' || cubePaused) return;
    const rotateInterval = setInterval(() => {
      setCubeRotation(prev => prev - 90);
    }, cubeRotateInterval * 1000); // Gira a cada X segundos
    return () => clearInterval(rotateInterval);
  }, [isIdle, cubeAutoRotate, cubeRotateInterval, pendingTips.length, profileTab, cubePaused]);

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

        const cachedAttempts = sessionCache.get<{ ids: string[], dates: Record<string, number>, claimed: string[] }>(attemptsCacheKey);

        if (cachedAttempts && cachedAttempts.ids) {
          completedIds = cachedAttempts.ids;
          completedDates = cachedAttempts.dates;
          if (cachedAttempts.claimed) {
            setClaimedChestIds(new Set(cachedAttempts.claimed));
          }
        } else {
            const { data: attemptSnap } = await supabase.from('quest_attempts').select('quest_id, created_at, chest_claimed').eq('student_id', userData.uid).eq('status', 'completed');
            if (attemptSnap) {
              const claimed = new Set<string>();
              attemptSnap.forEach((data: any) => {
                if (data.quest_id) {
                  completedIds.push(data.quest_id);
                  completedDates[data.quest_id] = new Date(data.created_at).getTime();
                  if (data.chest_claimed) claimed.add(data.quest_id);
                }
              });
              setClaimedChestIds(claimed);
              sessionCache.set(attemptsCacheKey, { ids: completedIds, dates: completedDates, claimed: Array.from(claimed) }, CACHE_TTL.QUEST_ATTEMPTS);
          }
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
            chestConfig: d.chestconfig || d.chestConfig || null,
            combatCoinDrop: d.combatcoindrop || d.combatCoinDrop || null,
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

  // Gera (com IA) a descrição das missões que não têm descrição manual
  useEffect(() => {
    if (activeQuests.length === 0) return;
    let cancelled = false;
    const missing = activeQuests.filter(q => !q.description || !q.description.trim());
    console.log('[questAi] missões sem descrição para gerar:', missing.length);
    (async () => {
      const results: Record<string, string> = {};
      for (const q of missing) {
        if (cancelled) return;
        // eslint-disable-next-line no-await-in-loop
        results[q.id] = await fetchAiQuestFlavor(q.id, q.title, q.description);
      }
      if (!cancelled) setAiQuestFlavors(prev => ({ ...prev, ...results }));
    })();
    return () => { cancelled = true; };
  }, [activeQuests]);

  useEffect(() => {
    if (!userData) return;
    const fetchEquipped = async () => {
      try {
        const snapEquip = await fetchEquippedItems(userData.uid);
        const eq: EquippedItem[] = [];
        if (snapEquip) {
          snapEquip.forEach((d: any) => {
            const data = d.data;
            if (data && data.avatarPart && (data.itemImageUrl || data.minecraftHeadValue || data.gameModelUrl)) {
              let parsedAdds = [];
              if (data.adds) {
                try { parsedAdds = typeof data.adds === 'string' ? JSON.parse(data.adds) : data.adds; } catch (e) { }
              }
              parsedAdds = orderEffectFirst(parsedAdds);
              eq.push({
                docId: d.id,
                itemId: d.item_id,
                imageUrl: data.itemImageUrl,
                avatarPart: data.avatarPart as any,
                itemTitle: data.itemTitle,
                itemCategory: data.itemCategory,
                baseAttributeType: data.baseAttributeType,
                baseAttributeValue: data.baseAttributeValue,
                forgeLevel: data.forgeLevel || 0,
                adds: parsedAdds,
                gameModelUrl: data.gameModelUrl,
                modelTextureUrl: data.modelTextureUrl,
                minecraftHeadValue: data.minecraftHeadValue,
                modelTransforms: data.modelTransforms,
                backColor: data.backColor || '',
                customAnimation: data.customAnimation,
                rarity: data.rarity,
                gameEffect: data.gameEffect,
                damageEffect: data.damageEffect,
                description: data.itemDescription || data.description,
                type: data.itemType || data.type || 'equippable',
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

  // Invalida o cache de itens equipados quando o jogador equipa/desequipa algo.
  // Deve rodar ANTES do fetch (efeito acima) para o refetch vir com dados novos.
  useEffect(() => {
    if (inventoryRefresh > 0 && userData?.uid) invalidateEquippedItems(userData.uid);
  }, [inventoryRefresh, userData?.uid]);

  useEffect(() => {
    const fetchUsers = async () => {
      let usersQuery = supabase.from('users').select('*').eq('role', 'student');
      // Filtrar por tenant_id (superadmin vê a escola selecionada, outros veem sua escola).
      // Sem tenantId não listamos alunos de todas as escolas (evita o "limbo").
      if (tenantId) {
        // Incluir também quem existe só em tenant_users (users.tenant_id pode estar nulo)
        const { data: memberRows } = await supabase.from('tenant_users').select('user_id').eq('tenant_id', tenantId);
        const memberIds = (memberRows || []).map(r => r.user_id).filter(Boolean);
        usersQuery = memberIds.length > 0
          ? usersQuery.or(`tenant_id.eq.${tenantId},id.in.(${memberIds.join(',')})`)
          : usersQuery.eq('tenant_id', tenantId);
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
                backColor: data.backColor || '',
                rarity: data.rarity,
                gameEffect: data.gameEffect,
                damageEffect: data.damageEffect,
                description: data.itemDescription || data.description,
                type: data.itemType || data.type || 'equippable',
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
      // No ranking com avatares, a rotação de status já controla os balões
      if (showRankingAvatars && (activeTab === 'ranking_class' || activeTab === 'ranking_general')) return;
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
  }, [allStudents, showRankingAvatars, activeTab]);

  const currentRank = getRankForXp(userData?.xp || 0, userData?.classId);
  const currentRankIndex = Math.max(0, RANKS.findIndex(r => r.name === currentRank.name));

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
    // Sem patentes LOCAIS cadastradas na escola: ninguém sobe de nível.
    if (RANKS.length === 0) return;

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

  // Após subir de patente e equipar: abre o Meu Perfil, mostra a face de STATUS
  // do cubo (esquerda) e pausa o giro por 60s para o jogador atribuir os pontos.
  const focusProfileStatus = () => {
    setActiveTab('profile');
    setProfileTab('overview');
    setCubeRotation(90); // face esquerda = status/pontos
    setCubePaused(true);
    if (cubePauseTimeoutRef.current) clearTimeout(cubePauseTimeoutRef.current);
    cubePauseTimeoutRef.current = setTimeout(() => setCubePaused(false), 60000);
  };

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
      // Após equipar a patente, foca no perfil/status do cubo
      focusProfileStatus();
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

    // Após abrir o baú da patente, foca no perfil/status do cubo
    focusProfileStatus();
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

    rankingListRef.current = list;

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
                    {student.characterName ? (
                      student.characterName
                    ) : (
                      <>
                        <span className="student-name-desktop">{student.name}</span>
                        <span className="student-name-mobile">
                          {student.name && student.name.length > 24 ? formatFirstAndLastName(student.name) : student.name}
                        </span>
                      </>
                    )}
                    {student.uid === userData?.uid && <span style={{ fontSize: '0.7rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', padding: '2px 6px', borderRadius: '4px' }}>Você</span>}
                  </h4>
                  {student.characterName && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                      (<span className="student-name-desktop">{student.name}</span><span className="student-name-mobile">{student.name && student.name.length > 24 ? formatFirstAndLastName(student.name) : student.name}</span>)
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
          userEmail={userData.email}
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

              // Se foi rejeitado antes, agora está autorizado → limpar a marca de rejeição
              await supabase.from('pre_authorized_students')
                .update({ rejected: false })
                .eq('id', preAuth.id);

              updateUserDataLocally({
                tenantId: selectedSchool.id,
                classId: cls.name
              });

              setEnrollmentStep('complete');
            } else if (userData.tenantId) {
              // Usuário já vinculado a uma escola (conta local criada pelo admin,
              // ou admin já aprovou): matrícula é aprovada na hora — sem pedir aprovação.
              await supabase.from('users').update({
                role: 'student',
                tenant_id: userData.tenantId,
                class_id: cls.name,
                pending_class_name: null
              }).eq('id', userData.uid);

              await supabase.from('tenant_users').upsert({
                tenant_id: userData.tenantId,
                user_id: userData.uid,
                role: 'student'
              });

              updateUserDataLocally({
                tenantId: userData.tenantId,
                classId: cls.name,
                pendingClassName: undefined,
                role: 'student'
              });

              setEnrollmentStep('complete');
            } else {
              // Enviar para aprovação - salvar escola/turma escolhidas diretamente no usuário
              await supabase.from('users').update({
                role: 'pending_student',
                tenant_id: selectedSchool.id,
                pending_class_name: cls.name
              }).eq('id', userData.uid);

              // Criar o acesso na tenant escolhida (evita o fallback de "primeira escola"
              // no load do tenant, que só usa escolas presentes em tenant_users)
              await supabase.from('tenant_users').upsert({
                tenant_id: selectedSchool.id,
                user_id: userData.uid,
                role: 'student'
              });

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
            schoolBackRef.current = true;
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
              chestScale={rankUpChestModel?.chestScale}
              chestZoom={rankUpChestModel?.chestZoom}
              chestOffsetX={rankUpChestModel?.chestOffsetX}
              chestOffsetY={rankUpChestModel?.chestOffsetY}
              chestRotY={rankUpChestModel?.chestRotY}
              chestOpenOffsetX={rankUpChestModel?.chestOpenOffsetX}
              chestOpenOffsetY={rankUpChestModel?.chestOpenOffsetY}
              chestSwapSides={rankUpChestModel?.chestSwapSides}
              chestAudioUrl={rankUpChestModel?.chestAudioUrl}
              chestAudioRate={rankUpChestModel?.chestAudioRate}
              chestAudioStart={rankUpChestModel?.chestAudioStart}
              chestAudioDuration={rankUpChestModel?.chestAudioDuration}
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

      {/* Modal de Reabertura de Baú da Missão */}
      {questChestToOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 25000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={() => setQuestChestToOpen(null)} />
          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '600px', padding: '1.5rem' }}>
            <button 
              onClick={() => { setQuestChestToOpen(null); setQuestChestWonItems([]); }} 
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', borderRadius: '50%', padding: '0.4rem', color: 'var(--text-secondary)', cursor: 'pointer', zIndex: 10, display: 'flex' }}
            >
              <X size={20} />
            </button>
            <ChestReveal
              title={`Baú da Missão: ${questChestToOpen.quest.title}`}
              subtitle="Recompensa de conquista da missão!"
              onOpen={async () => {
                const cc = questChestToOpen.quest.chestConfig;
                if (!cc) return;
                const wonItems: { title: string; imageUrl?: string; quantity: number }[] = [];
                // Dar moedas
                const maxCoins = Math.max(0, Math.min(10000, parseInt(cc.maxCoins) || 0));
                if (maxCoins > 0) {
                  const coins = Math.floor(Math.random() * maxCoins) + 1;
                  if (userData?.uid) {
                    const newCoins = (userData.coins || 0) + coins;
                    await supabase.from('users').update({ coins: newCoins }).eq('id', userData.uid);
                    updateUserDataLocally({ coins: newCoins });
                  }
                  wonItems.push({ title: `${coins} Moedas`, quantity: 1 });
                }
                // Dar itens por slot
                if (cc.itemIds) {
                  const validIds = cc.itemIds.filter((id: string) => id);
                  let storeItemsData: any[] = [];
                  if (validIds.length > 0) {
                    const { data } = await supabase.from('store_items').select('id, data').in('id', validIds);
                    storeItemsData = data || [];
                  }
                  for (let i = 0; i < cc.itemIds.length; i++) {
                    const itemId = cc.itemIds[i];
                    if (!itemId) continue;
                    const chance = cc.slotChances?.[i] ?? 100;
                    if (Math.random() * 100 > chance) continue;
                    const storeItem = storeItemsData.find((s: any) => s.id === itemId);
                    if (!storeItem) continue;
                    const itemData = storeItem.data || {};
                    const qty = cc.itemQuantities?.[i] || 1;
                    if (userData?.uid) {
                      await supabase.from('user_items').insert({
                        user_id: userData.uid,
                        item_id: itemId,
                        item_title: itemData.title || 'Item',
                        item_image_url: itemData.itemImageUrl || itemData.imageUrl || '',
                        quantity: qty,
                        item_type: itemData.type || 'consumable',
                        tenant_id: tenantId,
                      });
                    }
                    wonItems.push({ title: itemData.title || 'Item', imageUrl: itemData.itemImageUrl || itemData.imageUrl, quantity: qty });
                  }
                }
                setQuestChestWonItems(wonItems);
                // Marcar baú como resgatado
                if (userData?.uid) {
                  await supabase.from('quest_attempts')
                    .update({ chest_claimed: true })
                    .eq('student_id', userData.uid)
                    .eq('quest_id', questChestToOpen.quest.id)
                    .eq('status', 'completed');
                  setClaimedChestIds(prev => new Set([...prev, questChestToOpen.quest.id]));
                }
              }}
              chestModelUrl={questChestToOpen.chestModel?.url}
              chestOpenUrl={questChestToOpen.chestModel?.open_url}
              rarity={questChestToOpen.chestModel?.rarity}
              chestScale={questChestToOpen.chestModel?.chestScale}
              chestZoom={questChestToOpen.chestModel?.chestZoom}
              chestOffsetX={questChestToOpen.chestModel?.chestOffsetX}
              chestOffsetY={questChestToOpen.chestModel?.chestOffsetY}
              chestRotY={questChestToOpen.chestModel?.chestRotY}
              chestOpenOffsetX={questChestToOpen.chestModel?.chestOpenOffsetX}
              chestOpenOffsetY={questChestToOpen.chestModel?.chestOpenOffsetY}
              chestSwapSides={questChestToOpen.chestModel?.chestSwapSides}
              chestAudioUrl={questChestToOpen.chestModel?.chestAudioUrl}
              chestAudioRate={questChestToOpen.chestModel?.chestAudioRate}
              chestAudioStart={questChestToOpen.chestModel?.chestAudioStart}
              chestAudioDuration={questChestToOpen.chestModel?.chestAudioDuration}
            />
            {/* Itens ganhos */}
            {questChestWonItems.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {questChestWonItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
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
            )}
          </div>
        </div>
      )}

      {/* Modal de Configuração do Sistema */}
      {isSettingsModalOpen && (
        <div className="modal-overlay">
          <div className="glass-panel settings-modal-container" style={{ animation: 'slideUp 0.3s ease-out' }}>
            {/* Sidebar / Abas do Modal */}
            <div className="settings-modal-sidebar">
              <div className="settings-modal-sidebar-header">
                <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Settings size={20} color="var(--gold-primary)" /> Ajustes
                </h3>
              </div>
              <div className="settings-modal-sidebar-nav">
                <button
                  onClick={() => setSettingsTab('cube')}
                  className={`settings-modal-tab-btn ${settingsTab === 'cube' ? 'active' : ''}`}
                >
                  <Box size={18} /> Cubo 3D
                </button>
                {canView('themes', 'view') && (
                  <button
                    onClick={() => setSettingsTab('theme')}
                    className={`settings-modal-tab-btn ${settingsTab === 'theme' ? 'active' : ''}`}
                  >
                    <Palette size={18} /> Temas
                  </button>
                )}
                {(userData?.role !== 'student' || userData?.studentViewActive) && (
                  <button
                    onClick={() => setSettingsTab('debug')}
                    className={`settings-modal-tab-btn ${settingsTab === 'debug' ? 'active' : ''}`}
                    style={{ marginTop: 'auto' }}
                  >
                    <ShieldAlert size={18} /> Debug (Staff)
                  </button>
                )}
              </div>
            </div>

            {/* Conteúdo Principal do Modal */}
            <div className="settings-modal-content">
              <button 
                onClick={() => setIsSettingsModalOpen(false)} 
                style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: '50%', padding: '0.35rem', color: 'var(--text-secondary)', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                className="hover-brightness"
                title="Fechar"
              >
                <X size={20} />
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.5rem 0' }}>
                    <h4 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Temas</h4>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          if (userThemes.length >= MAX_USER_THEMES) {
                            alert(`Limite de ${MAX_USER_THEMES} temas pessoais atingido.`);
                            return;
                          }
                          const baseTheme = getComputedTheme();
                          baseTheme.name = 'Novo Tema';
                          setEditingTheme(baseTheme);
                          setShowCustomThemeModal(true);
                        }}
                        style={{ padding: '0.4rem 0.75rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.4)', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                        className="hover-brightness"
                      >
                        <Plus size={16} /> Novo Tema
                      </button>
                      <button
                        onClick={() => {
                          let tData: CustomTheme;
                          if (appTheme.startsWith('user_')) {
                            const ut = userThemes.find(t => t.id === appTheme);
                            tData = ut ? { ...ut } : getComputedTheme();
                          } else if (appTheme.startsWith('global_') || appTheme.startsWith('custom_')) {
                            const gt = globalThemes.find(g => g.id === appTheme);
                            tData = gt ? { ...gt } : getComputedTheme();
                          } else {
                            tData = getComputedTheme();
                          }
                          tData.id = 'new_' + Date.now();
                          setEditingTheme(tData);
                          setShowCustomThemeModal(true);
                        }}
                        style={{ padding: '0.4rem 0.75rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                        className="hover-brightness"
                      >
                        <Palette size={16} /> Personalizar
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                    {[
                      { id: 'default', name: 'Padrão (Dark RPG)', color: '#0f172a', isCustom: false },
                      { id: 'light', name: 'Amanhecer (Claro)', color: '#f8fafc', isCustom: false },
                    ].map(t => (
                      <div
                        key={t.id}
                        onClick={() => {
                          setAppTheme(t.id);
                          localStorage.setItem('appTheme', t.id);
                          localStorage.removeItem('appThemeType');
                          document.body.setAttribute('data-theme', t.id);
                          applyCustomTheme(null);
                        }}
                        style={{ padding: '0.75rem 1rem', border: appTheme === t.id ? '2px solid var(--gold-primary)' : '2px solid transparent', background: 'var(--bg-card)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: '0.2s' }}
                        className="hover-brightness"
                      >
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: t.color, border: '2px solid var(--border-glass)', flexShrink: 0 }} />
                        <span style={{ fontWeight: appTheme === t.id ? 'bold' : 'normal', color: appTheme === t.id ? 'var(--gold-primary)' : 'var(--text-primary)', fontSize: '0.9rem' }}>{t.name}</span>
                        {appTheme === t.id && <CheckCircle size={16} color="var(--gold-primary)" style={{ marginLeft: 'auto' }} />}
                      </div>
                    ))}
                  </div>

                  {globalThemes.length > 0 && (
                    <>
                      <h4 style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', color: 'var(--text-secondary)' }}>Temas Globais</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                        {globalThemes.map(gt => (
                          <div
                            key={gt.id}
                            onClick={() => {
                              setAppTheme(gt.id);
                              localStorage.setItem('appTheme', gt.id);
                              localStorage.setItem('appThemeType', 'global');
                              document.body.setAttribute('data-theme', gt.id);
                              applyCustomTheme(gt);
                            }}
                            style={{ padding: '0.75rem 1rem', border: appTheme === gt.id ? '2px solid var(--gold-primary)' : '2px solid transparent', background: 'var(--bg-card)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: '0.2s' }}
                            className="hover-brightness"
                          >
                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: gt.colors.bgDark, border: '2px solid var(--border-glass)', flexShrink: 0 }} />
                            <span style={{ fontWeight: appTheme === gt.id ? 'bold' : 'normal', color: appTheme === gt.id ? 'var(--gold-primary)' : 'var(--text-primary)', fontSize: '0.9rem', flex: 1 }}>{gt.name}</span>
                            {appTheme === gt.id && <CheckCircle size={16} color="var(--gold-primary)" />}
                            {userData?.role !== 'student' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTheme({ ...gt });
                                    setShowCustomThemeModal(true);
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--gold-primary)', cursor: 'pointer', padding: '0.25rem' }}
                                  title="Editar"
                                >
                                  <Edit3 size={16} />
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm(`Excluir o tema global "${gt.name}"?`)) return;
                                    await supabase.from('system_collections').delete().eq('id', gt.id);
                                    setGlobalThemes(prev => prev.filter(t => t.id !== gt.id));
                                    if (appTheme === gt.id) {
                                      setAppTheme('default');
                                      localStorage.setItem('appTheme', 'default');
                                      localStorage.removeItem('appThemeType');
                                      document.body.setAttribute('data-theme', 'default');
                                      applyCustomTheme(null);
                                    }
                                  }}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.25rem' }}
                                  title="Excluir"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {userThemes.length > 0 && (
                    <>
                      <h4 style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', color: 'var(--text-secondary)' }}>Meus Temas ({userThemes.length}/{MAX_USER_THEMES})</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                        {userThemes.map(t => (
                          <div
                            key={t.id}
                            onClick={() => {
                              setAppTheme(t.id);
                              localStorage.setItem('appTheme', t.id);
                              localStorage.setItem('appThemeType', 'user');
                              document.body.setAttribute('data-theme', t.id);
                              applyCustomTheme(t);
                            }}
                            style={{ padding: '0.75rem 1rem', border: appTheme === t.id ? '2px solid var(--gold-primary)' : '2px solid transparent', background: 'var(--bg-card)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: '0.2s' }}
                            className="hover-brightness"
                          >
                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: t.colors.bgDark, border: '2px solid var(--border-glass)', flexShrink: 0 }} />
                            <span style={{ fontWeight: appTheme === t.id ? 'bold' : 'normal', color: appTheme === t.id ? 'var(--gold-primary)' : 'var(--text-primary)', fontSize: '0.9rem', flex: 1 }}>{t.name}</span>
                            {appTheme === t.id && <CheckCircle size={16} color="var(--gold-primary)" />}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTheme(t);
                                setShowCustomThemeModal(true);
                              }}
                              style={{ background: 'transparent', border: 'none', color: 'var(--gold-primary)', cursor: 'pointer', padding: '0.25rem' }}
                              title="Editar"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Excluir o tema "${t.name}"?`)) return;
                                await supabase.from('user_themes').delete().eq('id', t.id);
                                setUserThemes(prev => prev.filter(ut => ut.id !== t.id));
                                if (appTheme === t.id) {
                                  setAppTheme('default');
                                  localStorage.setItem('appTheme', 'default');
                                  document.body.setAttribute('data-theme', 'default');
                                  applyCustomTheme(null);
                                }
                              }}
                              style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.25rem' }}
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {userThemes.length === 0 && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, textAlign: 'center', padding: '1rem' }}>
                      Clique em "Novo Tema" ou "Personalizar" para criar seu primeiro tema pessoal.
                    </p>
                  )}

                  <h4 style={{ margin: '1.5rem 0 1rem 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>Estilo de Fonte</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>
                    "Padrão do Tema" usa a fonte definida pelo tema selecionado. Escolha uma fonte específica para sobrescrever.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }} className="custom-scrollbar">
                    {[
                      { id: 'default', name: 'Padrão do Tema', desc: 'Usa a fonte definida pelo tema selecionado' },
                      { id: 'epic', name: 'Épico (Cinzel)', desc: 'Cinzel & Outfit' },
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
            const cur = localStorage.getItem('appTheme') || 'default';
            if (cur.startsWith('user_') || cur.startsWith('global_') || cur.startsWith('custom_')) {
              const themeData = getCurrentThemeData();
              if (themeData) applyCustomTheme(themeData);
              else applyCustomTheme(null);
            } else {
              applyCustomTheme(null);
            }
          }}
          onSave={async (theme) => {
            try {
              if (theme.isGlobal && userData?.role !== 'student') {
                const isNew = theme.id.startsWith('new_');
                const newId = isNew ? crypto.randomUUID() : theme.id;
                theme.id = newId;
                let globalErr;
                if (isNew) {
                  const res = await supabase.from('system_collections').insert({
                    id: newId,
                    collection_name: 'themes',
                    doc_id: newId,
                    data: theme as any,
                  });
                  globalErr = res.error;
                } else {
                  const res = await supabase.from('system_collections')
                    .update({ data: theme as any })
                    .eq('id', newId);
                  globalErr = res.error;
                }
                if (globalErr) { console.error('Erro ao salvar tema global:', globalErr); return; }
                setGlobalThemes(prev => {
                  const existing = prev.findIndex(t => t.id === newId);
                  if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = theme;
                    return updated;
                  }
                  return [...prev, theme];
                });
                setAppTheme(newId);
                localStorage.setItem('appTheme', newId);
                localStorage.setItem('appThemeType', 'global');
                applyCustomTheme(theme);
              } else {
                const isNew = theme.id.startsWith('new_');
                const newId = isNew ? 'user_' + Date.now() : theme.id;
                theme.id = newId;
                theme.isGlobal = false;
                const payload: any = {
                  id: newId,
                  user_id: userData!.uid,
                  name: theme.name,
                  data: theme,
                  is_global: false,
                };
                if (tenantId) payload.tenant_id = tenantId;
                console.log('Salvando tema pessoal:', payload);
                const { error } = await supabase.from('user_themes').upsert(payload, { onConflict: 'id' });
                if (error) { console.error('Erro ao salvar tema pessoal:', error); return; }
                setUserThemes(prev => {
                  const existing = prev.findIndex(t => t.id === newId);
                  if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = theme;
                    return updated;
                  }
                  return [...prev, theme];
                });
                setAppTheme(newId);
                localStorage.setItem('appTheme', newId);
                localStorage.setItem('appThemeType', 'user');
                applyCustomTheme(theme);
              }
              setShowCustomThemeModal(false);
            } catch (err) {
              console.error('Erro inesperado ao salvar tema:', err);
            }
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

      <div className="dashboard-header-sticky">
        <nav className="navbar glass-panel compact-nav" style={{ position: 'static', marginBottom: '0.5rem' }}>
          <div className="logo-container" onClick={handleLogoClick} style={{ cursor: 'pointer', userSelect: 'none' }} title="Clique 3x para ver o Sobre">
            <div style={{ width: 48, height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={`${import.meta.env.BASE_URL}logo-math-mastery.png`} alt="Math Mastery" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem', minWidth: 0 }}>
              <h1 className="title-glow">Painel do Aluno</h1>
              <div className="tenant-switcher-desktop" style={{ position: 'relative', zIndex: 99999 }}>
                <TenantSwitcher />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'flex-end' }}>

            {(userData?.role === 'admin' || userData?.role === 'teacher' || hasAdminAccess) && !userData?.studentViewActive && (
              <button
                className="login-btn hide-on-mobile"
                onClick={() => navigate('/admin')}
                style={{ padding: '0.4rem 0.8rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(251, 191, 36, 0.1)', borderColor: 'var(--gold-primary)', fontSize: '0.85rem' }}
                title={panelLabel(panelRoleName)}
              >
                <ShieldAlert size={16} color="var(--gold-primary)" />
                <span style={{ color: 'var(--gold-primary)' }}>{panelLabel(panelRoleName)}</span>
              </button>
            )}

            <button
              onClick={async () => {
                setIsSettingsModalOpen(true);
                const { data } = await supabase.from('system_collections').select('*').eq('collection_name', 'themes');
                if (data) setGlobalThemes(data.map(d => ({ id: d.id, ...(d.data as any) } as CustomTheme)));
              }}
              className="hover-brightness hide-on-mobile"
              style={{ background: 'transparent', border: 'none', color: 'var(--gold-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.4rem' }}
              title="Configurações do Sistema"
            >
              <Settings size={22} />
            </button>

            <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.35rem 0.75rem', borderRadius: '50px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {userData && (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)' }}>
                    <AvatarCharacter config={liveAvatarConfig || userData.avatarConfig} size={32} interactive={false} animation="none" />
                  </div>
                )}
                <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{userData?.name?.split(' ')[0]}</span>
              </div>
            </div>

            <button className="login-btn hide-on-mobile" onClick={handleLogout} style={{ padding: '0.5rem', borderRadius: '50%' }} title="Sair">
              <LogOut size={18} />
            </button>

            {/* Menu Hambúrguer Mobile com todas as ações acopladas */}
            <div className="tenant-switcher-mobile">
              <button className="login-btn mobile-menu-btn" onClick={() => setStudentMobileMenuOpen(o => !o)} style={{ padding: '0.5rem', borderRadius: '8px' }} title="Menu">
                <Menu size={22} />
              </button>
              {studentMobileMenuOpen && typeof document !== 'undefined' && createPortal(
                <>
                  <div 
                    style={{ position: 'fixed', inset: 0, zIndex: 99999998, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} 
                    onClick={() => setStudentMobileMenuOpen(false)} 
                  />
                  <div style={{ 
                    position: 'fixed', 
                    right: '12px', 
                    top: '64px', 
                    background: 'var(--bg-panel, #18181b)', 
                    border: '1px solid var(--border-glass, rgba(255,255,255,0.15))', 
                    borderRadius: '16px', 
                    boxShadow: '0 20px 60px rgba(0,0,0,0.95)', 
                    padding: '0.85rem', 
                    minWidth: '270px', 
                    maxWidth: 'calc(100vw - 24px)', 
                    zIndex: 99999999, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '0.65rem' 
                  }}>
                    
                    {/* Usuário no Menu Mobile */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem', borderBottom: '1px solid var(--border-glass)' }}>
                      {userData && (
                        <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)', border: '1px solid var(--gold-primary)' }}>
                          <AvatarCharacter config={liveAvatarConfig || userData.avatarConfig} size={38} interactive={false} animation="none" />
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userData?.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--gold-primary)' }}>{userData?.classId || 'Sem Turma'}</span>
                      </div>
                    </div>

                    {/* Troca de Escola */}
                    <div style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Escola / Unidade:</span>
                      <TenantSwitcher variant="menu" />
                    </div>

                    {/* Acesso Staff */}
                    {(userData?.role === 'admin' || userData?.role === 'teacher' || hasAdminAccess) && !userData?.studentViewActive && (
                      <button
                        className="login-btn"
                        onClick={() => { setStudentMobileMenuOpen(false); navigate('/admin'); }}
                        style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', gap: '0.5rem', background: 'rgba(251, 191, 36, 0.1)', borderColor: 'var(--gold-primary)', fontSize: '0.85rem' }}
                      >
                        <ShieldAlert size={16} color="var(--gold-primary)" />
                        <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>{panelLabel(panelRoleName)}</span>
                      </button>
                    )}

                    {/* Ajustes e Temas */}
                    <button
                      className="login-btn"
                      onClick={async () => { setStudentMobileMenuOpen(false); setIsSettingsModalOpen(true); const { data } = await supabase.from('system_collections').select('*').eq('collection_name', 'themes'); if (data) setGlobalThemes(data.map(d => ({ id: d.id, ...(d.data as any) } as CustomTheme))); }}
                      style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', gap: '0.5rem', background: 'var(--btn-bg)', fontSize: '0.85rem' }}
                    >
                      <Settings size={16} color="var(--gold-primary)" />
                      <span>Temas & Ajustes</span>
                    </button>

                    {/* Sair */}
                    <button
                      className="login-btn"
                      onClick={() => { setStudentMobileMenuOpen(false); handleLogout(); }}
                      style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--accent-red)', fontSize: '0.85rem' }}
                    >
                      <LogOut size={16} />
                      <span>Sair da Conta</span>
                    </button>
                  </div>
                </>,
                document.body
              )}
            </div>

          </div>
        </nav>

        {/* Navegação de Abas do Aluno */}
        <div className="scrollable-menu-container">
          {canView('quests', 'view') && (
            <button
              onClick={() => setActiveTab('quests')}
              title="Central de Missões"
              style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', background: activeTab === 'quests' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'quests' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}
            >
              <Swords size={20} /> <span className="tab-text">Central de Missões</span>
            </button>
          )}
          {canView('profile', 'view') && (
            <button
              onClick={() => setActiveTab('profile')}
              title="Meu Perfil"
              style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', background: activeTab === 'profile' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'profile' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}
            >
              <Star size={20} /> <span className="tab-text">Meu Perfil</span>
            </button>
          )}
          {canView('ranking', 'view') && (
            <button
              onClick={() => setActiveTab('ranking_class')}
              title="Ranking da Turma"
              style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', background: activeTab === 'ranking_class' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'ranking_class' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}
            >
              <Users size={20} /> <span className="tab-text">Ranking Turma</span>
            </button>
          )}
          {canView('ranking', 'view') && (
            <button
              onClick={() => setActiveTab('ranking_general')}
              title="Ranking Geral"
              style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', background: activeTab === 'ranking_general' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'ranking_general' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}
            >
              <TrendingUp size={20} /> <span className="tab-text">Ranking Geral</span>
            </button>
          )}
          {canView('store', 'view') && (
            <>
              <button
                onClick={() => setActiveTab('store')}
                title="Mercado"
                style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', background: activeTab === 'store' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'store' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}
              >
                <Store size={20} /> <span className="tab-text">Mercado</span>
              </button>
              <button
                onClick={() => currentRankIndex >= 5 && setActiveTab('forge')}
                title={currentRankIndex >= 5 ? "A Forja" : "A Forja — requer patente Prata I"}
                style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', background: activeTab === 'forge' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'forge' ? 'var(--text-on-gold, #000000)' : (currentRankIndex >= 5 ? 'var(--text-primary)' : '#64748b'), border: 'none', cursor: currentRankIndex >= 5 ? 'pointer' : 'not-allowed', fontWeight: 'bold', transition: 'all 0.2s', padding: '0.75rem 1rem', whiteSpace: 'nowrap', opacity: currentRankIndex >= 5 ? 1 : 0.6 }}
              >
                {currentRankIndex >= 5 ? <Hammer size={18} /> : <Lock size={16} />} <span className="tab-text">A Forja</span>
              </button>
            </>
          )}


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
                          // Admin/superadmin SEMPRE joga a missão completa (não vai para Revisão),
                          // mesmo que já tenha tentativas da época em que era aluno — assim pode testar recompensas.
                          const isAdminPlayer = userData?.role === 'admin' || userData?.role === 'superadmin';
                          navigate((isCompleted && !isAdminPlayer) ? `/quest/${quest.id}?study=true` : `/quest/${quest.id}`);
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
                          {quest.description || aiQuestFlavors[quest.id]}
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
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {isCompleted && !claimedChestIds.has(quest.id) && ((quest.chestConfig?.itemIds?.some((id: string) => id) || quest.chestConfig?.maxCoins) || (quest as any).liveChest1stPlace) && (
                              <button
                                className="login-btn"
                                onClick={(e) => handleOpenQuestChestModal(e, quest)}
                                style={{
                                  background: 'linear-gradient(45deg, #f59e0b, #fbbf24)',
                                  color: '#000000',
                                  border: 'none',
                                  padding: '0.5rem 0.8rem',
                                  fontSize: '0.9rem',
                                  fontWeight: 'bold',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.4rem',
                                  borderRadius: '8px',
                                  boxShadow: '0 0 10px rgba(245, 158, 11, 0.4)'
                                }}
                                title="Abrir Baú de Recompensa da Missão"
                              >
                                <Package size={16} /> Baú
                              </button>
                            )}
                            <button
                              className="login-btn"
                              disabled={quest.mode === 'live' && (!activeLiveQuests[quest.id] && !isCompleted)}
                              style={{
                                background: (isCompleted || (quest.mode === 'live' && !activeLiveQuests[quest.id] && !isCompleted)) ? 'var(--btn-bg)' : 'var(--gold-primary)',
                                color: (isCompleted || (quest.mode === 'live' && !activeLiveQuests[quest.id] && !isCompleted)) ? 'var(--text-primary)' : 'var(--text-on-gold, #000000)',
                                border: (isCompleted || (quest.mode === 'live' && !activeLiveQuests[quest.id] && !isCompleted)) ? '1px solid var(--border-glass)' : 'none',
                                padding: '0.5rem 1.2rem',
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
                                  const isAdminPlayer = userData?.role === 'admin' || userData?.role === 'superadmin';
                                  navigate((isCompleted && !isAdminPlayer) ? `/quest/${quest.id}?study=true` : `/quest/${quest.id}`);
                                }
                              }}
                            >
                              {quest.mode === 'live' && !isCompleted
                                ? (activeLiveQuests[quest.id] ? 'Batalha Ao Vivo' : 'Não Iniciada')
                                : ((isCompleted && userData?.role !== 'admin' && userData?.role !== 'superadmin') ? 'Revisar' : 'Jogar Agora')}
                            </button>
                          </div>
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
                style={{ background: profileTab === 'overview' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: profileTab === 'overview' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold', padding: '0.4rem 1rem', fontSize: '0.85rem' }}
              >
                <Star size={16} /> Personagem
              </button>
              <button
                onClick={() => {
                  // Snap cube to character face (nearest multiple of 360°) before showing inventory
                  setCubeRotation(prev => Math.round(prev / 360) * 360);
                  setProfileTab('inventory');
                }}
                className="login-btn"
                style={{ background: profileTab === 'inventory' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: profileTab === 'inventory' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold', padding: '0.4rem 1rem', fontSize: '0.85rem' }}
              >
                <Package size={16} /> Mochila
              </button>
            </div>

            <div className="responsive-stack-mobile" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: (userData?.role === 'student' || userData?.studentViewActive || profileTab === 'inventory') ? 'flex-start' : 'center', width: '100%' }}>
              {/* Perfil do Aluno (Esquerda - Fixo ao rolar) */}
              <div className={`glass-panel profile-glass-panel ${profileTab === 'inventory' ? 'backpack-open' : 'backpack-closed'}`} style={{ flex: (userData?.role === 'student' || userData?.studentViewActive) ? '1 1 min(100%, 380px)' : '0 1 500px', width: '100%', maxWidth: '100%', padding: '1.25rem', textAlign: 'center', position: 'sticky', top: '115px', zIndex: 105, minHeight: 'auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', alignSelf: 'flex-start', boxSizing: 'border-box', backdropFilter: 'blur(16px)' }}>

                <div style={{ flexShrink: 0, paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '2rem', height: '100%' }}>
                  <div
                    style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', perspective: '1000px', width: '100%' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                      <button onClick={() => setCubeRotation(prev => prev + 90)} style={{ position: 'relative', zIndex: 200, background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}>
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

                            <div 
                              onClick={(e) => { e.stopPropagation(); handleRenameCharacter(); }}
                              title={userData?.characterName ? 'Renomear personagem' : 'Criar nome do personagem'}
                              style={{ position: 'absolute', bottom: -24, left: '50%', transform: 'translateX(-50%)', background: currentRank.color, padding: '0.25rem 1rem', borderRadius: '20px', color: getContrastColor(currentRank.color), fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', boxShadow: `0 0 10px ${currentRank.color}80`, zIndex: 30, display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                              {userData?.characterName || 'Personagem'}
                              <Edit3 size={14} style={{ opacity: 0.7 }} />
                            </div>
                            {(liveAvatarConfig || userData?.avatarConfig) ? (
                              <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', position: 'relative', zIndex: 40 }} onClick={() => setIsCustomizingAvatar(true)}>
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
                                        const labelInfo = (ATTRIBUTE_LABELS as any)[key] || ATTRIBUTE_LABELS['none'];
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

                      <button onClick={() => setCubeRotation(prev => prev - 90)} style={{ position: 'relative', zIndex: 200, background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}>
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

                  {/* Nome e status do personagem — no mobile com a mochila aberta são ocultados via CSS */}
                  <div className="profile-name-status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
              </div>
              {/* Coluna Direita Alternável (Histórico ou Mochila) */}
              {(userData?.role === 'student' || userData?.studentViewActive) && profileTab === 'overview' && (
                <div className="glass-panel" style={{ flex: '2 1 450px', width: '100%', padding: '1.25rem', display: 'flex', flexDirection: 'column', minHeight: '450px', maxHeight: '80vh', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                    <History size={24} color="var(--gold-primary)" />
                    <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Histórico de Conquistas</h3>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                        const isPvp = item.type === 'pvp';
                        const isPvpExpanded = expandedPvpId === item.id;
                        const hasPvpDetails = isPvp && (item.pvpDetails || []).length > 0;

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
                        } else if (isPvp) {
                          borderColor = '#f43f5e';
                          badgeBg = 'rgba(244, 63, 94, 0.18)';
                          badgeColor = '#fb7185';
                        } else if (isNegative) {
                          borderColor = 'var(--accent-red)';
                          badgeBg = 'rgba(239, 68, 68, 0.15)';
                          badgeColor = 'var(--accent-red)';
                        }

                        const dateObj = item.timestamp ? (typeof item.timestamp === 'number' ? new Date(item.timestamp) : (item.timestamp.seconds ? new Date(item.timestamp.seconds * 1000) : new Date(item.timestamp))) : new Date();

                        return (
                          <div key={item.id || index} style={{ padding: '0.9rem 1.1rem', background: 'rgba(0,0,0,0.25)', borderRadius: '12px', borderLeft: `4px solid ${borderColor}`, cursor: hasPvpDetails ? 'pointer' : 'default' }} onClick={hasPvpDetails ? () => setExpandedPvpId(isPvpExpanded ? null : item.id) : undefined}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt="" style={{ width: '38px', height: '38px', objectFit: 'contain', borderRadius: '8px', flexShrink: 0 }} />
                                ) : (
                                  <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {isRank ? <Trophy size={20} color="#c084fc" /> : isItem ? <Package size={20} color="#60a5fa" /> : isPvp ? <Swords size={20} color="#fb7185" /> : <Star size={20} color="var(--gold-primary)" />}
                                  </div>
                                )}
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.15rem 0', fontWeight: 'bold', color: 'var(--text-primary)', whiteSpace: 'normal' }}>
                                    {item.title || item.evalName}
                                  </h4>
                                  {item.subtitle && (
                                    <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                      {item.subtitle}
                                    </p>
                                  )}
                                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
                                    Data: {dateObj.toLocaleDateString('pt-BR')} | {dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: badgeColor, background: badgeBg, padding: '0.35rem 0.75rem', borderRadius: '20px', whiteSpace: 'nowrap', border: `1px solid ${borderColor}40` }}>
                                  {item.badgeText || (item.xpGained !== undefined ? `${item.xpGained > 0 ? '+' : ''}${item.xpGained} XP` : 'Conquista')}
                                </div>
                                {isPvp && hasPvpDetails && (isPvpExpanded ? <ChevronDown size={16} color="#fb7185" /> : <ChevronRight size={16} color="#fb7185" />)}
                              </div>
                            </div>

                            {isPvp && isPvpExpanded && (
                              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {(item.pvpDetails || []).length === 0 ? (
                                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhum duelo registrado.</p>
                                ) : item.pvpDetails.map((e: any) => (
                                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.65rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: e.won ? 'var(--accent-green, #10b981)' : e.draw ? 'var(--gold-primary)' : 'var(--accent-red)' }}>
                                        {e.won ? '🏆 Vitória' : e.draw ? '🤝 Empate' : '💀 Derrota'} vs {e.opponentName}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                        {new Date(e.timestamp).toLocaleDateString('pt-BR')} | {new Date(e.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>{e.score}</div>
                                      {e.prizeText && (
                                        <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: e.won ? 'var(--accent-green, #10b981)' : e.draw ? 'var(--gold-primary)' : 'var(--accent-red)' }}>
                                          {e.prizeText}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {profileTab === 'inventory' && (
                <div className="glass-panel" style={{ flex: '2 1 450px', width: '100%', padding: '1.25rem', display: 'flex', flexDirection: 'column', minHeight: '450px', maxHeight: '80vh', overflow: 'hidden' }}>
                  {userData && <StudentInventory userData={userData} onEquip={() => {
                    invalidateEquippedItems(userData.uid);
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

        {activeTab === 'forge' && userData && (
          <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
            <BlacksmithView
              userData={userData}
              currentRankIndex={RANKS.findIndex(r => r.name === currentRank.name)}
              onClose={() => {}}
              onSuccess={() => { window.location.reload(); }}
            />
          </div>
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
