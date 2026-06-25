import { useState } from 'react';
import { Sword, Shield, Trophy, LogIn } from 'lucide-react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LandingPage() {
  const [isHovered, setIsHovered] = useState(false);
  const [error, setError] = useState('');
  const { currentUser } = useAuth();

  // Se já estiver logado, joga para o dashboard
  if (currentUser) {
    return <Navigate to="/dashboard" />;
  }

  const handleLogin = async () => {
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email;
      
      if (!email?.endsWith('@eaportal.org')) {
        await signOut(auth);
        setError('Acesso negado. Por favor, use seu e-mail institucional @eaportal.org.');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user') {
         setError('Erro ao fazer login. Tente novamente.');
      }
    }
  };

  return (
    <div className="app-container">
      <nav className="navbar glass-panel">
        <div className="logo-container">
          <Sword className="logo-icon" color="var(--gold-primary)" size={32} />
          <h1 className="title-glow">Math Mastery</h1>
        </div>
        <button 
          className="login-btn"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handleLogin}
        >
          <LogIn size={20} className={isHovered ? 'icon-hover' : ''} />
          <span>Login com Google</span>
        </button>
      </nav>

      <main className="main-content">
        <div className="hero-section">
          <h2 className="hero-title">Prepare-se para a Batalha do Conhecimento</h2>
          <p className="hero-subtitle">
            Resolva desafios, suba de patente e torne-se uma lenda da matemática.
          </p>
          {error && (
            <div style={{ marginTop: '1.5rem', color: 'var(--accent-red)', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem 2rem', borderRadius: '8px', border: '1px solid var(--accent-red)', display: 'inline-block', fontWeight: 600 }}>
              {error}
            </div>
          )}
        </div>

        <div className="features-grid">
          <div className="feature-card glass-panel">
            <Trophy size={48} color="var(--gold-primary)" />
            <h3>Ranking em Tempo Real</h3>
            <p>Acompanhe sua posição no Top 10 geral e da sua turma.</p>
          </div>
          
          <div className="feature-card glass-panel">
            <Shield size={48} color="var(--accent-blue)" />
            <h3>Patentes Exclusivas</h3>
            <p>De Bronze a Lenda. Cada conquista desbloqueia uma nova medalha.</p>
          </div>
          
          <div className="feature-card glass-panel">
            <Sword size={48} color="var(--accent-red)" />
            <h3>Desafios Épicos</h3>
            <p>Enfrente missões matemáticas para ganhar XP extra.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
