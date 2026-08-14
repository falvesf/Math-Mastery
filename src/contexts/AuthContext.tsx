import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { initRanks } from '../lib/ranks';
import { auth, db } from '../lib/firebase';
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
  hearts?: number;
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
  };
  avatarConfig?: AvatarConfig;
  studentViewActive?: boolean;
  adminProfileBackup?: Record<string, any>;
  studentProfileBackup?: Record<string, any>;
}

interface AuthContextType {
  currentUser: User | null;
  userData: UserData | null;
  loading: boolean;
  toggleStudentView: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  loading: true,
  toggleStudentView: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | undefined;
    let unsubscribeAuth: (() => void) | undefined;

    // Carrega as patentes customizadas globais primeiro
    initRanks().then(() => {
      unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user && user.email?.endsWith('@eaportal.org')) {
          setCurrentUser(user);
        
        // Buscar ou criar o documento do usuário no Firestore
        const userRef = doc(db, 'users', user.uid);
        
        unsubscribeSnapshot = onSnapshot(userRef, async (userSnap) => {
          let fetchedUserData: UserData;
          
          if (userSnap.exists()) {
            fetchedUserData = userSnap.data() as UserData;
          } else {
          // A Mágica de Super Admin: Verifica se é o e-mail do Fabio
          const isSuperAdmin = user.email === 'fabio.feitoza@eaportal.org';
          
          fetchedUserData = {
            uid: user.uid,
            email: user.email,
            name: user.displayName || 'Sem Nome',
            photoURL: user.photoURL || '',
            role: isSuperAdmin ? 'admin' : 'student',
            xp: 0,
          };
          
          // Salva o novo usuário no banco de dados
          await setDoc(userRef, fetchedUserData);
        }
        
        // Regra para Staff (Professor, Coordenador, Admin) ter 50.000 XP
        // NUNCA aplicar se o modo de visão de aluno estiver ativo (mundo paralelo)
        // Usamos 3 camadas de proteção:
        // 1. Campo studentViewActive no Firestore
        // 2. Flag no localStorage (para sobreviver ao reload logo após o reset)
        // 3. Presença do campo adminProfileBackup (indica que o admin entrou no mundo paralelo)
        const isInStudentViewFirestore = fetchedUserData.studentViewActive === true;
        const isInStudentViewLocalStorage = localStorage.getItem('studentViewActive') === 'true';
        const hasAdminBackup = !!(fetchedUserData as any).adminProfileBackup;
        const isInStudentView = isInStudentViewFirestore || isInStudentViewLocalStorage || hasAdminBackup;
        const isStaffAccount = fetchedUserData.role !== 'student';
        
        // Manter o localStorage em sincronia com o Firestore
        if (isInStudentViewFirestore) {
          localStorage.setItem('studentViewActive', 'true');
        } else if (!hasAdminBackup) {
          localStorage.removeItem('studentViewActive');
        }
        
        console.log('[AuthContext] XP rule check:', {
          xp: fetchedUserData.xp, role: fetchedUserData.role,
          isInStudentViewFirestore, isInStudentViewLocalStorage, hasAdminBackup,
          isInStudentView, willApplyRule: isStaffAccount && !isInStudentView && (fetchedUserData.xp || 0) < 50000
        });

        if (isStaffAccount && !isInStudentView && (fetchedUserData.xp || 0) < 50000) {
          fetchedUserData.xp = 50000;
          fetchedUserData.coins = 50000;
          // Usar updateDoc (não setDoc) para evitar sobrescrever campos como studentViewActive
          try {
            const { updateDoc: fbUpdateDoc } = await import('firebase/firestore');
            await fbUpdateDoc(userRef, { xp: 50000, coins: 50000 });
          } catch (_e) {
            // Silently fail if document doesn't exist yet; setDoc handles that case above
          }
        }
        
        // Verifica se a skin do aluno expirou e remove
        if (fetchedUserData.role === 'student' && fetchedUserData.avatarConfig?.customSkinUrl) {
          const skinUrl = fetchedUserData.avatarConfig.customSkinUrl;
          const expiry = fetchedUserData.unlockedSkins?.[skinUrl];
          if (!expiry || expiry <= Date.now()) {
            let updatedConfig = { ...fetchedUserData.avatarConfig, customSkinUrl: '', customModelUrl: undefined };
            if (updatedConfig.savedPreSkinConfig) {
              updatedConfig = { ...updatedConfig, ...updatedConfig.savedPreSkinConfig };
              delete updatedConfig.savedPreSkinConfig;
            }
            fetchedUserData.avatarConfig = updatedConfig;
            await setDoc(userRef, { avatarConfig: updatedConfig }, { merge: true });
          }
        }

        // Passar os dados exatamente como vieram do banco
        setUserData(fetchedUserData as UserData);
          setLoading(false);
        }); // Fim do onSnapshot

        // Retornar a função de limpeza do snapshot
        return () => {
          unsubscribeSnapshot();
        };
      } else {
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = undefined;
        }
        setCurrentUser(null);
        setUserData(null);
        setLoading(false);
      }
      }); // Fim do onAuthStateChanged
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const handleToggleStudentView = async () => {
    if (userData) {
      const { toggleStudentView } = await import('../lib/debugSwap');
      await toggleStudentView(userData);
      // O onSnapshot vai pegar a mudanca e atualizar userData automaticamente
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, userData, loading, toggleStudentView: handleToggleStudentView }}>
      {children}
    </AuthContext.Provider>
  );
};
