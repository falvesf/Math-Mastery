import { useState } from 'react';
import { KeyRound, Loader2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { verifyLocalLogin, changeLocalPassword, signInLocal, type LocalLoginResult } from '../lib/localAuth';

interface LocalLoginModalProps {
  onClose: () => void;
}

export default function LocalLoginModal({ onClose }: LocalLoginModalProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [account, setAccount] = useState<LocalLoginResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    if (!identifier.trim() || !password) {
      setError('Informe seu usuário/e-mail e sua senha.');
      return;
    }
    setLoading(true);
    try {
      const acc = await verifyLocalLogin(identifier, password);
      setAccount(acc);
      if (!acc.must_change_password) {
        await signInLocal(acc.auth_email, password);
        onClose();
      }
    } catch (e: any) {
      setError(e?.message || 'Erro ao verificar a conta.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setError('');
    if (!newPassword || newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não confere com a nova senha.');
      return;
    }
    if (!account) return;
    setLoading(true);
    try {
      // A senha atual (gerada) foi validada pelo verify_local_login; usa o id
      // retornado para localização determinística da conta.
      await changeLocalPassword(account.id, password, newPassword);
      // Senha alterada. Tenta entrar automaticamente com a nova senha.
      try {
        await signInLocal(account.auth_email, newPassword);
        onClose();
        return;
      } catch (signErr: any) {
        // Senha alterada com sucesso, mas o login automático falhou:
        // volta para a tela de login e orienta o usuário.
        setAccount(null);
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setError(`Senha alterada com sucesso! Entre novamente com a nova senha. (Login automático: ${signErr?.message || 'erro desconhecido'})`);
        return;
      }
    } catch (e: any) {
      setError(e?.message || 'Erro ao alterar a senha.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setError('');
    if (account) {
      setAccount(null);
      setNewPassword('');
      setConfirmPassword('');
    } else {
      onClose();
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '440px', maxWidth: '100%', padding: '2rem', textAlign: 'center', animation: 'slideUp 0.3s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <button onClick={goBack} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}>
            <ArrowLeft size={16} /> {account ? 'Voltar ao login' : 'Voltar'}
          </button>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1 }}>×</button>
        </div>

        <KeyRound size={44} color="var(--gold-primary)" style={{ margin: '0.5rem auto 1rem auto', display: 'block' }} />
        <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.4rem', color: 'var(--text-primary)' }}>
          {account ? 'Defina uma nova senha' : 'Conta Local'}
        </h2>
        <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          {account
            ? <>Primeiro acesso de <strong style={{ color: 'var(--gold-primary)' }}>{account.username}</strong>. Você precisa trocar a senha gerada pelo sistema para continuar.</>
            : <>Entre com o <strong style={{ color: 'var(--gold-primary)' }}>usuário ou e-mail</strong> cadastrado pelo administrador e a senha fornecida.</>}
        </p>

        {!account ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="Usuário ou e-mail"
              autoFocus
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.95rem' }}
            />
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                placeholder="Senha"
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.95rem' }}
              />
              <button onClick={() => setShowPass(s => !s)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title={showPass ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && <div style={{ color: 'var(--accent-red)', fontSize: '0.85rem', background: 'rgba(239,68,68,0.1)', padding: '0.6rem 0.8rem', borderRadius: '8px' }}>{error}</div>}
            <button onClick={handleLogin} disabled={loading} className="login-btn" style={{ padding: '0.8rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', fontWeight: 'bold', justifyContent: 'center' }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Entrar'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type={showPass ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Nova senha (mín. 6 caracteres)"
              autoFocus
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.95rem' }}
            />
            <input
              type={showPass ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleChangePassword(); }}
              placeholder="Confirmar nova senha"
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.95rem' }}
            />
            <button onClick={() => setShowPass(s => !s)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />} {showPass ? 'Ocultar' : 'Mostrar'} senhas
            </button>
            {error && <div style={{ color: 'var(--accent-red)', fontSize: '0.85rem', background: 'rgba(239,68,68,0.1)', padding: '0.6rem 0.8rem', borderRadius: '8px' }}>{error}</div>}
            <button onClick={handleChangePassword} disabled={loading} className="login-btn" style={{ padding: '0.8rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', fontWeight: 'bold', justifyContent: 'center' }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Salvar e Entrar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}