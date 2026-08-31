import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PvpBattle from '../components/PvpBattle';

export default function PvpPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [searchParams] = useSearchParams();
  const { userData } = useAuth();
  const navigate = useNavigate();

  if (!matchId || !userData?.uid) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        Duelo inválido.
      </div>
    );
  }

  const watchUid = searchParams.get('watch') || null;

  return (
    <PvpBattle
      matchId={matchId}
      userData={userData}
      watchUid={watchUid}
      onExit={() => navigate(-1)}
    />
  );
}