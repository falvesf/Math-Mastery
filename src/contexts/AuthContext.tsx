import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { initRanks } from '../lib/ranks';
import type { AvatarConfig } from '../components/AvatarCharacter';

export type UserRole = 'student' | 'teacher' | 'coordinator' | 'admin' | 'pending_teacher';

export interface UserData {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  photoURL: string;
  classId?: string;
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
  unlockedSkins?: Record<string, number>;
  inventoryPreferences?: {
    viewMode: string;
    activeCategory?: string;
    filterRarity: string;
    sortBy: string;
    lastSeenRank?: string;
    highestRankIndex?: number;
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
    classId: dbUser.class_id,
    hpRecoveryStartTimestamp: dbUser.hp_recovery_start_timestamp,
    lastHeartRegen: dbUser.last_heart_regen,
    extraInventorySpace: dbUser.extra_inventory_space,
    stunnedUntil: dbUser.stunned_until,
    happyBuffUntil: dbUser.happy_buff_until,
    happyBuffDuration: dbUser.happy_buff_duration,
    customStatusText: dbUser.custom_status_text,
    isProfilePublic: dbUser.is_profile_public,
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
  toggleStudentView: () => Promise<void>;
  updateUserDataLocally: (updates: Partial<UserData>) => void;
  ranksLoaded: boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  loading: true,
  toggleStudentView: async () => {},
  updateUserDataLocally: () => {},
  ranksLoaded: false
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
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

      if (userDoc) {
        // Mágica de Super Admin
        const isSuperAdmin = sessionUser.email === 'fabio.feitoza@eaportal.org';
        if (isSuperAdmin && userDoc.role !== 'admin') {
           await supabase.from('users').update({ role: 'admin' }).eq('id', sessionUser.id);
           userDoc.role = 'admin';
        }

        const mappedUserData = mapUserToClient(userDoc);
        
        // Staff Rules
        const isInStudentView = mappedUserData.studentViewActive === true;
        const isStaffAccount = mappedUserData.role !== 'student';
        
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

      if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
      realtimeSubscription = supabase.channel(`public:users:${sessionUser.id}`)
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
    <AuthContext.Provider value={{ currentUser, userData, loading, toggleStudentView, updateUserDataLocally, ranksLoaded }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
