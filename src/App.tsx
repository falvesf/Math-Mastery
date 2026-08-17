import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DialogProvider } from './contexts/DialogContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import QuestGameplay from './pages/QuestGameplay';
import LiveQuestAdmin from './pages/LiveQuestAdmin';
import LiveQuestStudent from './pages/LiveQuestStudent';
import { Loader2 } from 'lucide-react';
import './App.css';

// Componente para proteger rotas privadas
const PrivateRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: string }) => {
  const { currentUser, userData, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 className="animate-spin" size={48} color="var(--gold-primary)" />
      </div>
    );
  }

  // Se não tem usuário, joga para o login
  if (!currentUser) return <Navigate to="/" />;
  
  // Se exigiu uma função (ex: admin) e o cara não tem
  if (requiredRole && userData?.role !== requiredRole && userData?.role !== 'admin') {
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
            <QuestGameplay />
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
    
    if (theme.startsWith('custom_')) {
      const customData = localStorage.getItem('currentCustomThemeData');
      if (customData) {
        import('./lib/theme').then(({ applyCustomTheme }) => {
          try {
            applyCustomTheme(JSON.parse(customData));
          } catch(e) {}
        });
      }
    }
  }, []);

  return (
    <Router basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <DialogProvider>
          <AppRoutes />
        </DialogProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
