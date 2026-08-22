import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { initRanks } from '../lib/ranks';
import { connectPresence, disconnectPresence } from '../lib/onlinePresence';
import type { AvatarConfig } from '../components/AvatarCharacter';

export type UserRole = 'student' | 'teacher' | 'coordinator' | 'admin' | 'superadmin' | 'pending_teacher';

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
  customStatusText?: string;
  isProfilePublic?: boolean;
  characterName?: string;
  unlockedSkins?: Record<string, number>;
  inventoryPreferences?: {
    viewMode: string;
    activeCategory?: string;
    filterRarity: string;
    sortBy: string;
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
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  loading: true,
  needsEnrollment: false,
  toggleStudentView: async () => {},
  updateUserDataLocally: () => {},
  ranksLoaded: false
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsEnrollment, setNeedsEnrollment] = useState(false);
  const [ranksLoaded, setRanksLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let realtimeSubscription: any;

    const fetchUserData = async (sessionUser: User) => {
      const { data: userDoc, error } = await supabase.from('users').select('*').eq('id', sessionUser.id).single();
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user data', error);
        return;
      }

      // Se o usuário não existe, criar um novo registro
      if (!userDoc) {
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

        if (isStaffAccount && !isInStudentView && (mappedUserData.xp || 0) < 50000) {
          mappedUserData.xp = 50000;
          mappedUserData.coins = 50000;
          await supabase.from('users').update({ xp: 50000, coins: 50000 }).eq('id', sessionUser.id);
        }

        if (mappedUserData.role === 'student' && mappedUserData.avatarConfig?.customSkinUrl) {
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

      if (realtimeSubscription) {
        try { await supabase.removeChannel(realtimeSubscription); } catch (e) { console.warn('Erro ao remover canal antigo:', e); }
        realtimeSubscription = null;
      }
      // Nome de canal único por sessão para evitar o erro
      // "cannot add postgres_changes callbacks after subscribe()"
      realtimeSubscription = supabase.channel(`public:users:${sessionUser.id}_${Date.now()}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${sessionUser.id}` }, (payload) => {
           if (isMounted) {
             setUserData(prev => {
                if (!prev) return prev;
                const newMapped = mapUserToClient(payload.new);
                const isInStudentView = newMapped.studentViewActive === true;
                if (isInStudentView && newMapped.role !== 'student') {
                  newMapped.role = 'student';
                }
                return { ...prev, ...newMapped };
             });
           }
        }).subscribe();

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

  // Presença ONLINE via Realtime (presence channel) + heartbeat de reforço.
  // Usa userData.uid (mapeado de users.id) — currentUser.uid do supabase NÃO existe.
  useEffect(() => {
    if (!userData?.uid) return;
    const uid = userData.uid;

    // Heartbeat: atualiza last_seen_at (fonte principal de "online")
    const beat = () => {
      supabase
        .from('users')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', uid)
        .then(({ error }) => { if (error) console.error('Heartbeat:', error); })
        .catch(() => {});
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
  }, [userData?.uid]);

  // Motor de visitas do PROFESSOR: roda apenas para TEACHERS (são os que têm
// contato direto com os alunos). Superadmin/administradores ficam de fora.
  // Sorteia um aluno online, grava no banco e repete a cada ~15s (o motor só
  // sorteia de novo quando a visita atual passou de 60s). Assim o professor
  // visita UMA tela por vez, sem parar.
  const isTeacherRole = userData?.role === 'teacher';
  useEffect(() => {
    if (!userData?.uid || !isTeacherRole || !userData?.tenantId) return;
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
  }, [userData?.uid, isTeacherRole, userData?.tenantId]);

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
    <AuthContext.Provider value={{ currentUser, userData, loading, needsEnrollment, toggleStudentView, updateUserDataLocally, ranksLoaded }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
