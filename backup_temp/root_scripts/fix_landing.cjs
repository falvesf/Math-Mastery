const fs = require('fs');

let content = fs.readFileSync('src/pages/LandingPage.tsx', 'utf-8');

// Replace imports
content = content.replace("import { signInWithPopup, signOut } from 'firebase/auth';\n", "");
content = content.replace("import { auth, googleProvider } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");

const oldLoginStr = `  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await signInWithPopup(auth, googleProvider);
      
      // O restante do processo (criação de doc, etc) é feito via onAuthStateChanged no App.tsx
      // O redirect ou fechamento também é automático pelo estado de 'user'.
      
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('O login foi cancelado. Tente novamente.');
      } else {
        setError('Houve um problema ao entrar com o Google. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };`;

const newLoginStr = `  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      
      if (error) throw error;
      
      // O redirect ou fechamento é automático pelo provider do Supabase
      
    } catch (err: any) {
      console.error(err);
      setError('Houve um problema ao entrar com o Google. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };`;

content = content.replace(oldLoginStr, newLoginStr);

fs.writeFileSync('src/pages/LandingPage.tsx', content, 'utf-8');
console.log('Fixed LandingPage');
