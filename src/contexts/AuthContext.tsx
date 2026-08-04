import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { initRanks } from '../lib/ranks';
import { auth, db } from '../lib/firebase';

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
    filterType: string;
    filterRarity: string;
    sortBy: string;
  };
  avatarConfig?: {
    skinColor: string;
    hairColor: string;
    eyeColor: string;
    hairStyle: string;
    mouthStyle: string;
    shirtColor?: string;
    pantsColor?: string;
    handedness?: 'right' | 'left';
    animationState?: 'idle' | 'walk' | 'run';
    customSkinUrl?: string;
    customModelUrl?: string;
  };
}

interface AuthContextType {
  currentUser: User | null;
  userData: UserData | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  loading: true,
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
        if (fetchedUserData.role !== 'student' && (fetchedUserData.xp || 0) < 50000) {
          fetchedUserData.xp = 50000;
          fetchedUserData.coins = 50000;
          await setDoc(userRef, { xp: 50000, coins: 50000 }, { merge: true });
        }
        
        // Verifica se a skin do aluno expirou e remove
        if (fetchedUserData.role === 'student' && fetchedUserData.avatarConfig?.customSkinUrl) {
          const skinUrl = fetchedUserData.avatarConfig.customSkinUrl;
          const expiry = fetchedUserData.unlockedSkins?.[skinUrl];
          if (!expiry || expiry <= Date.now()) {
            fetchedUserData.avatarConfig.customSkinUrl = '';
            await setDoc(userRef, { avatarConfig: { ...fetchedUserData.avatarConfig, customSkinUrl: '' } }, { merge: true });
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

  return (
    <AuthContext.Provider value={{ currentUser, userData, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
