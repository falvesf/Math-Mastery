import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { initRanks } from '../lib/ranks';
import { auth, db } from '../lib/firebase';

export type UserRole = 'student' | 'teacher' | 'admin';

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
