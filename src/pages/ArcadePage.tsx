import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ArcadeBeatEmUp from '../components/ArcadeBeatEmUp';

export default function ArcadePage() {
  const { userData } = useAuth();
  const navigate = useNavigate();

  if (!userData?.uid) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        Carregando modo Arcade...
      </div>
    );
  }

  return (
    <ArcadeBeatEmUp
      userData={userData}
      onExit={() => navigate(-1)}
    />
  );
}
