import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { initRanks } from '../lib/ranks';
import { connectPresence, disconnectPresence } from '../lib/onlinePresence';
import type { AvatarConfig } from '../components/AvatarCharacter';

export type UserRole = 'student' | 'teacher' | 'coordinator' | 'admin' | 'superadmin' | 'pending_teacher' | 'pending_student';

export interface UserData {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  photoURL: string;
  tenantId?: string;
  classId?: string;
  pendingClassName?: string;
  selectedTenantId?: string;
  xp?: number;
  coins?: number;
  lastSeenRank?: string;
  hp?: number;
  hpRecoveryStartTimestamp?: number | null;
  lastHeartRegen?: number; // timestamp in milliseconds
  rank?: string;
  extraInventorySpace?: number; // espaços extras na mochila
  stunnedUntil?: number | null;
  happyBuffUntil?: number | null;
  happyBuffDuration?: number | null;
  hpCooldownReductionUntil?: number | null;
  hpCooldownReductionMinutes?: number | null;
  customStatusText?: string;
  isProfilePublic?: boolean;
  characterName?: string;
  unlockedSkins?: Record<string, number>;
  inventoryPreferences?: {
    viewMode?: string;
    activeCategory?: string;
    filterRarity?: string;
    sortBy?: string;
    lastSeenRank?: string;
    highestRankIndex?: number;
    onboarding?: Record<string, boolean>;
  };
  avatarConfig?: AvatarConfig;
  studentViewActive?: boolean;
  adminProfileBackup?: Record<string, any>;
  studentProfileBackup?: Record<string, any>;
  distributedStats?: Record<string, number>;
}

export const mapUserToClient = (dbUser: any): UserData => {
  return {
    ...dbUser,
    uid: dbUser.id,
    photoURL: dbUser.photo_url || '',
    tenantId: dbUser.tenant_id,
    classId: dbUser.class_id,
    pendingClassName: dbUser.pending_class_name,
    selectedTenantId: dbUser.selected_tenant_id,
    hpRecoveryStartTimestamp: dbUser.hp_recovery_start_timestamp,
    lastHeartRegen: dbUser.last_heart_regen,
    extraInventorySpace: dbUser.extra_inventory_space,
    stunnedUntil: dbUser.stunned_until,
    happyBuffUntil: dbUser.happy_buff_until,
    happyBuffDuration: dbUser.happy_buff_duration,
    hpCooldownReductionUntil: dbUser.hp_cooldown_reduction_until,
    hpCooldownReductionMinutes: dbUser.hp_cooldown_reduction_minutes,
    customStatusText: dbUser.custom_status_text,
    isProfilePublic: dbUser.is_profile_public,
    characterName: dbUser.character_name,
    unlockedSkins: dbUser.unlocked_skins,
    inventoryPreferences: dbUser.inventory_preferences,
    lastSeenRank: dbUser.inventory_preferences?.lastSeenRank || dbUser.rank,
    avatarConfig: dbUser.avatar_config,
    studentViewActive: dbUser.student_view_active,
    adminProfileBackup: dbUser.admin_profile_backup,
    studentProfileBackup: dbUser.student_profile_backup,
    distributedStats: dbUser.distributed_stats
  } as UserData;
};

interface AuthContextType {
  currentUser: User | null;
  userData: UserData | null;
  loading: boolean;
  needsEnrollment: boolean;
  toggleStudentView: () => Promise<void>;
  updateUserDataLocally: (updates: Partial<UserData>) => void;
  ranksLoaded: boolean;
  impersonatingId: string | null;
  startImpersonation: (userId: string) => Promise<void>;
  exitImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  loading: true,
  needsEnrollment: false,
  toggleStudentView: async () => {},
  updateUserDataLocally: () => {},
  ranksLoaded: false,
  impersonatingId: null,
  startImpersonation: async () => {},
  exitImpersonation: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsEnrollment, setNeedsEnrollment] = useState(false);
  const [ranksLoaded, setRanksLoaded] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(() => {
    return localStorage.getItem('impersonatingUserId') || null;
  });

  const getImpersonatingId = () => localStorage.getItem('impersonatingUserId') || null;

  // Guarda a função de fetch definida dentro do efeito para poder ser chamada
  // por startImpersonation/exitImpersonation (que vivem no corpo do provider).
  const fetchUserDataRef = useRef<((u: User) => Promise<void>) | null>(null);

  const isAdminOrSuper = async (sessionUserId: string) => {
    const { data } = await supabase.from('users').select('role').eq('id', sessionUserId).single();
    return !!data && (data.role === 'admin' || data.role === 'superadmin');
  };

  const startImpersonation = async (userId: string) => {
    if (!currentUser) return;
    const allowed = await isAdminOrSuper(currentUser.id);
    if (!allowed) return;
    localStorage.setItem('impersonatingUserId', userId);
    setImpersonatingId(userId);
    if (fetchUserDataRef.current) await fetchUserDataRef.current(currentUser);
  };

  const exitImpersonation = async () => {
    localStorage.removeItem('impersonatingUserId');
    setImpersonatingId(null);
    if (currentUser && fetchUserDataRef.current) await fetchUserDataRef.current(currentUser);
  };

  useEffect(() => {
    let isMounted = true;
    let realtimeSubscription: any;

    const fetchUserData = async (sessionUser: User) => {
      const impersonatingId = getImpersonatingId();
      const isImpersonating = !!impersonatingId && impersonatingId !== sessionUser.id;
      const targetUserId = isImpersonating ? impersonatingId : sessionUser.id;

      const { data: userDoc, error } = await supabase.from('users').select('*').eq('id', targetUserId).single();
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user data', error);
        return;
      }

      // Se o usuário não existe, criar um novo registro
      if (!userDoc) {
        // Impersonação aponta para um usuário que não existe mais — cancela o modo
        if (isImpersonating) {
          localStorage.removeItem('impersonatingUserId');
          setImpersonatingId(null);
          return;
        }
        console.log('Novo usuário detectado, criando registro...');
        const newUser = {
          id: sessionUser.id,
          email: sessionUser.email || '',
          name: sessionUser.user_metadata?.full_name || sessionUser.email?.split('@')[0] || 'Novo Aluno',
          photo_url: sessionUser.user_metadata?.avatar_url || '',
          role: 'student',
          xp: 0,
          coins: 0,
          hp: 3
        };
        
        const { data: createdUser, error: createError } = await supabase.from('users').insert(newUser).select().single();
        
        if (createError) {
          console.error('Erro ao criar usuário:', createError);
          // Mesmo com erro, criar um userData mínimo para não travar
          if (isMounted) {
            setUserData({
              uid: sessionUser.id,
              email: sessionUser.email || '',
              name: newUser.name,
              role: 'student',
              photoURL: newUser.photo_url,
              xp: 0,
              coins: 0,
              hp: 3
            } as UserData);
            setNeedsEnrollment(true);
          }
          return;
        }
        
        // Usar o usuário criado
        const mappedUserData = mapUserToClient(createdUser);
        if (isMounted) {
          setUserData(mappedUserData);
          setNeedsEnrollment(true);
        }
        return;
      }

      // Usuário existe - continuar com o fluxo normal
      if (userDoc) {
        // Blocos especiais (super admin, staff rules) só rodam na conta REAL do admin,
        // nunca durante impersonação — assim vemos os dados reais do usuário alvo.
        if (!isImpersonating) {
          // Mágica de Super Admin (Abordagem Híbrida)
          // 1. Chave mestra: email hardcoded (fallback de segurança)
          // 2. Role no banco: permite adicionar outros superadmins
          const isSuperAdmin = 
            sessionUser.email === 'fabio.feitoza@eaportal.org' ||  // Chave mestra
            userDoc.role === 'superadmin';                         // Role no banco
          
          if (isSuperAdmin && userDoc.role !== 'superadmin' && userDoc.role !== 'admin') {
             // Se é superadmin mas não tem role adequada, promover para admin
             await supabase.from('users').update({ role: 'admin' }).eq('id', sessionUser.id);
             userDoc.role = 'admin';
          }
        }

        const mappedUserData = mapUserToClient(userDoc);
        
        // Verificar se o aluno precisa fazer matrícula
        if (mappedUserData.role === 'student' && (!mappedUserData.tenantId || !mappedUserData.classId)) {
          if (isMounted) setNeedsEnrollment(true);
        } else {
          if (isMounted) setNeedsEnrollment(false);
        }
        
        // Staff Rules
        const isInStudentView = mappedUserData.studentViewActive === true;
        const isStaffAccount = mappedUserData.role !== 'student' && mappedUserData.role !== 'pending_student';
        
        if (isInStudentView && isStaffAccount) {
          mappedUserData.role = 'student';
        }

        if (!isImpersonating && isStaffAccount && !isInStudentView && (mappedUserData.xp || 0) < 50000) {
          mappedUserData.xp = 50000;
          mappedUserData.coins = 50000;
          await supabase.from('users').update({ xp: 50000, coins: 50000 }).eq('id', sessionUser.id);
        }

        if (!isImpersonating && mappedUserData.role === 'student' && mappedUserData.avatarConfig?.customSkinUrl) {
          const skinUrl = mappedUserData.avatarConfig.customSkinUrl;
          const expiry = mappedUserData.unlockedSkins?.[skinUrl];
          if (expiry !== undefined && expiry <= Date.now()) {
            let updatedConfig = { ...mappedUserData.avatarConfig, customSkinUrl: '', customModelUrl: undefined };
            if (updatedConfig.savedPreSkinConfig) {
              updatedConfig = { ...updatedConfig, ...updatedConfig.savedPreSkinConfig };
              delete updatedConfig.savedPreSkinConfig;
            }
            mappedUserData.avatarConfig = updatedConfig;
            await supabase.from('users').update({ avatar_config: updatedConfig }).eq('id', sessionUser.id);
          }
        }

        if (isMounted) setUserData(mappedUserData);
      }
    };

    fetchUserDataRef.current = fetchUserData;

    const handleUserSession = async (sessionUser: User | null) => {
      if (!sessionUser) {
        if (isMounted) {
          setCurrentUser(null);
          setUserData(null);
          setLoading(false);
        }
        return;
      }

      if (isMounted) setCurrentUser(sessionUser);
      
      // Fetch after row creation trigger
      await fetchUserData(sessionUser);
      // Fallback if trigger was slow
      if (isMounted) {
        setTimeout(() => fetchUserData(sessionUser), 1500);
      }

      if (isMounted) setLoading(false);
    };

    initRanks().then(() => {
      if (isMounted) setRanksLoaded(true);
      supabase.auth.getSession().then(({ data: { session } }) => {
        handleUserSession(session?.user || null);
      });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUserSession(session?.user || null);
    });

    return () => {
      isMounted = false;
      if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
      subscription.unsubscribe();
    };
  }, []);

  // Realtime do usuário ATIVO (conta real ou usuário impersonado).
  // Recria o canal quando a impersonação muda de alvo.
  useEffect(() => {
    if (!currentUser) return;
    const targetId = getImpersonatingId() || currentUser.id;

    const channel = supabase.channel(`public:users:${targetId}_${Date.now()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${targetId}` }, (payload) => {
        if (!isMounted) return;
        setUserData(prev => {
          if (!prev) return prev;
          const newMapped = mapUserToClient(payload.new);
          const isInStudentView = newMapped.studentViewActive === true;
          if (isInStudentView && newMapped.role !== 'student') {
            newMapped.role = 'student';
          }
          return { ...prev, ...newMapped };
        });
      }).subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [currentUser, impersonatingId]);

  // Presença ONLINE via Realtime (presence channel) + heartbeat de reforço.
  // Usa userData.uid (mapeado de users.id) — currentUser.uid do supabase NÃO existe.
  // Não roda durante impersonação para não "sujar" os dados do usuário alvo.
  useEffect(() => {
    if (!userData?.uid || impersonatingId) return;
    const uid = userData.uid;

    // Heartbeat: atualiza last_seen_at (fonte principal de "online")
    const beat = () => {
      supabase
        .from('users')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', uid)
        .then(
          ({ error }) => { if (error) console.error('Heartbeat:', error); },
          () => {}
        );
    };
    beat();
    const int = setInterval(beat, 30 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    const onFocus = () => beat();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    // Presence (bônus, em tempo real) — isolado para não quebrar o heartbeat
    try {
      connectPresence(uid, { name: userData?.name, role: userData?.role, classId: userData?.classId });
    } catch (e) {
      console.error('Presence error:', e);
    }

    return () => {
      clearInterval(int);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      disconnectPresence();
    };
  }, [userData?.uid, impersonatingId]);

  // Motor de visitas do PROFESSOR: roda apenas para TEACHERS (são os que têm
// contato direto com os alunos). Superadmin/administradores ficam de fora.
  // Sorteia um aluno online, grava no banco e repete a cada ~15s (o motor só
  // sorteia de novo quando a visita atual passou de 60s). Assim o professor
  // visita UMA tela por vez, sem parar.
  const isTeacherRole = userData?.role === 'teacher';
  useEffect(() => {
    if (!userData?.uid || impersonatingId || !isTeacherRole || !userData?.tenantId) return;
    let cancelled = false;
    const engine = async () => {
      if (cancelled) return;
      try {
        const { runVisitEngine } = await import('../lib/teacherVisit');
        await runVisitEngine(userData.uid, userData.name || 'Professor(a)', userData.tenantId);
      } catch (e) {
        console.error('Erro no motor de visitas:', e);
      }
    };
    engine();
    const int = setInterval(engine, 15 * 1000);
    return () => { cancelled = true; clearInterval(int); };
  }, [userData?.uid, isTeacherRole, userData?.tenantId, impersonatingId]);

  // Usuários aguardando aprovação: mesmo que o Realtime da tabela users não
  // esteja ativo, verifica periodicamente se o admin aprovou e atualiza o
  // userData no lugar (dispensa refresh manual na tela "Aguardando Aprovação").
  const isPendingApproval = userData?.role === 'pending_teacher' || userData?.role === 'pending_student';
  useEffect(() => {
    if (!userData?.uid || !isPendingApproval) return;
    let cancelled = false;
    const check = async () => {
      try {
        const { data } = await supabase.from('users').select('*').eq('id', userData.uid).maybeSingle();
        if (cancelled || !data) return;
        if (data.role !== 'pending_teacher' && data.role !== 'pending_student') {
          const mapped = mapUserToClient(data);
          const isInStudentView = mapped.studentViewActive === true;
          if (isInStudentView && mapped.role !== 'student') mapped.role = 'student';
          setUserData(prev => prev ? { ...prev, ...mapped } : prev);
        }
      } catch (e) {
        // silencioso — não interromper o ciclo de verificação
      }
    };
    check();
    const int = setInterval(check, 4000);
    return () => { cancelled = true; clearInterval(int); };
  }, [userData?.uid, isPendingApproval]);

  const updateUserDataLocally = (updates: Partial<UserData>) => {
    setUserData(prev => prev ? { ...prev, ...updates } : prev);
  };

  const toggleStudentView = async () => {
    if (userData) {
      const { toggleStudentView } = await import('../lib/debugSwap');
      await toggleStudentView(userData);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, userData, loading, needsEnrollment, toggleStudentView, updateUserDataLocally, ranksLoaded, impersonatingId, startImpersonation, exitImpersonation }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
