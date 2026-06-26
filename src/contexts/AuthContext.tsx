import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { initRanks } from '../lib/ranks';
import { auth, db } from '../lib/firebase';

export type UserRole = 'student' | 'teacher' | 'coordinator' | 'admin';

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
  lastHeartRegen?: number; // timestamp in milliseconds
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
    // Carrega as patentes customizadas globais primeiro
    initRanks().then(() => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user && user.email?.endsWith('@eaportal.org')) {
          setCurrentUser(user);
        
        // Buscar ou criar o documento do usuário no Firestore
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
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

        // Sistema de Vidas (Corações)
        let currentHearts = fetchedUserData.hearts !== undefined ? fetchedUserData.hearts : 3;
        let lastRegen = fetchedUserData.lastHeartRegen || Date.now();
        const now = Date.now();
        
        // Calcular Max Hearts com base na patente atual
        // Usa a initRanks para pegar o índice. A cada 2 patentes = +1 coração (base 3)
        const { RANKS } = await import('../lib/ranks');
        const xp = fetchedUserData.xp || 0;
        let rankIndex = 0;
        for (let i = RANKS.length - 1; i >= 0; i--) {
          if (xp >= RANKS[i].minXp) {
            rankIndex = i;
            break;
          }
        }
        const maxHearts = 3 + Math.floor(rankIndex / 2);

        // Lógica de Regeneração (1 coração por hora = 3600000 ms)
        const msPerHour = 3600000;
        if (currentHearts < maxHearts) {
          const hoursPassed = Math.floor((now - lastRegen) / msPerHour);
          if (hoursPassed > 0) {
            currentHearts = Math.min(maxHearts, currentHearts + hoursPassed);
            lastRegen = lastRegen + (hoursPassed * msPerHour); // avança o relógio
          }
        } else {
          lastRegen = now; // se está full, reseta o timer
        }

        if (fetchedUserData.hearts !== currentHearts || fetchedUserData.lastHeartRegen !== lastRegen) {
          fetchedUserData.hearts = currentHearts;
          fetchedUserData.lastHeartRegen = lastRegen;
          await setDoc(userRef, { hearts: currentHearts, lastHeartRegen: lastRegen }, { merge: true });
        }
        
        setUserData(fetchedUserData);
      } else {
        setCurrentUser(null);
        setUserData(null);
      }
      setLoading(false);
      });

      return () => unsubscribe();
    });
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, userData, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
