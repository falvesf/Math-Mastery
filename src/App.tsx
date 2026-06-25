import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import type React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import QuestGameplay from './pages/QuestGameplay';
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
          <PrivateRoute requiredRole="admin">
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
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
