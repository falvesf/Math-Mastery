import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider, useTenant } from './contexts/TenantContext';
import { DialogProvider } from './contexts/DialogContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import QuestGameplay from './pages/QuestGameplay';
import QuestGameplayMobile from './pages/QuestGameplayMobile';
import LiveQuestAdmin from './pages/LiveQuestAdmin';
import LiveQuestStudent from './pages/LiveQuestStudent';
import { Loader2 } from 'lucide-react';
import { supabase } from './lib/supabase';
import './App.css';

// Componente para proteger rotas privadas
const PrivateRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: string }) => {
  const { currentUser, userData, loading } = useAuth();
  const { loading: tenantLoading } = useTenant();

  if (loading || tenantLoading) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 className="animate-spin" size={48} color="var(--gold-primary)" />
      </div>
    );
  }

  // Se não tem usuário, joga para o login
  if (!currentUser) return <Navigate to="/" />;

  // Usuários aguardando aprovação NÃO têm acesso a nada — exibe tela de espera
  if (userData?.role === 'pending_teacher' || userData?.role === 'pending_student') {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '500px', width: '100%' }}>
          <Loader2 size={48} color="var(--gold-primary)" style={{ margin: '0 auto 1.5rem auto', display: 'block' }} />
          <h2 style={{ color: 'var(--gold-primary)', marginBottom: '1rem', fontSize: '1.8rem' }}>Aguardando Aprovação</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '2rem' }}>
            Sua solicitação de acesso como <strong style={{ color: 'white' }}>{userData?.role === 'pending_teacher' ? 'Professor/Coordenador' : 'Aluno'}</strong> foi enviada com sucesso.<br /><br />
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

  // Se exigiu uma função (ex: teacher) e o usuário não tem a role necessária
  if (requiredRole && userData?.role !== requiredRole && userData?.role !== 'admin' && userData?.role !== 'superadmin') {
     return <Navigate to="/dashboard" />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <PrivateRoute requiredRole="teacher">
            <AdminDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/quest/:questId"
        element={
          <PrivateRoute>
            {window.innerWidth <= 768 ? <QuestGameplayMobile /> : <QuestGameplay />}
          </PrivateRoute>
        }
      />
      <Route
        path="/live-admin/:sessionId"
        element={
          <PrivateRoute requiredRole="teacher">
            <LiveQuestAdmin />
          </PrivateRoute>
        }
      />
      <Route
        path="/live/:sessionId"
        element={
          <PrivateRoute>
            <LiveQuestStudent />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

function App() {
  React.useEffect(() => {
    const theme = localStorage.getItem('appTheme') || 'default';
    document.body.setAttribute('data-theme', theme);

    if (theme.startsWith('user_')) {
      import('./lib/supabase').then(({ supabase }) => {
        supabase.from('user_themes').select('data').eq('id', theme).single().then(({ data }) => {
          if (data) {
            import('./lib/theme').then(({ applyCustomTheme }) => {
              try { applyCustomTheme(data.data as any); } catch(e) {}
            });
          }
        });
      });
    } else if (theme.startsWith('global_') || localStorage.getItem('appThemeType') === 'global') {
      import('./lib/supabase').then(({ supabase }) => {
        supabase.from('system_collections').select('data').eq('id', theme).single().then(({ data }) => {
          if (data) {
            import('./lib/theme').then(({ applyCustomTheme }) => {
              try { applyCustomTheme(data.data as any); } catch(e) {}
            });
          }
        });
      });
    } else if (theme.startsWith('custom_')) {
      const customData = localStorage.getItem('currentCustomThemeData');
      if (customData) {
        import('./lib/theme').then(({ applyCustomTheme }) => {
          try { applyCustomTheme(JSON.parse(customData)); } catch(e) {}
        });
      }
    }
  }, []);

  return (
    <Router basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <TenantProvider>
          <DialogProvider>
            <AppRoutes />
          </DialogProvider>
        </TenantProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
