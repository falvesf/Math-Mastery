import { supabase } from './supabase';

/**
 * Contas Locais (login híbrido).
 * Contas criadas pelo administrador por tenant, com usuário + senha gerada.
 * A senha gerada só é válida até ser trocada; no 1º acesso o usuário é
 * obrigado a alterar a senha (must_change_password).
 */

export interface LocalLoginResult {
  id: string;
  username: string;
  auth_email: string;
  must_change_password: boolean;
  tenant_id: string | null;
}

export interface CreateLocalAccountResult {
  id: string;
  username: string;
  auth_email: string;
  password: string;
}

/** Hash SHA-256 em hex (bate com encode(digest(...,'sha256'),'hex') do Postgres) */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Gera uma senha aleatória legível (sem caracteres ambíguos) */
export function generatePassword(len = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return [...arr].map(b => chars[b % chars.length]).join('');
}

/** Valida usuário/e-mail + senha. Lança erro com mensagem amigável. */
export async function verifyLocalLogin(identifier: string, password: string): Promise<LocalLoginResult> {
  const { data, error } = await supabase.rpc('verify_local_login', {
    p_identifier: identifier.trim(),
    p_password: password,
  });
  if (error) throw new Error(error.message);
  return data as LocalLoginResult;
}

/** Troca a senha local (usada no 1º acesso obrigatório). */
export async function changeLocalPassword(accountId: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const { error } = await supabase.rpc('change_local_password', {
    p_account_id: accountId,
    p_current_password: currentPassword,
    p_new_password: newPassword,
  });
  if (error) throw new Error(error.message);
  return true;
}

/** Cria a sessão Supabase Auth com o e-mail real da conta local. */
export async function signInLocal(authEmail: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
  if (error) throw new Error(error.message);
}

/**
 * Admin: cria uma conta local.
 * O usuário de autenticação é criado pelo PRÓPRIO Supabase (signUp), o que
 * garante que o signInWithPassword funcione (INSERT manual em auth.users
 * falha com "Database error querying schema"). Em seguida finaliza o perfil
 * local (local_accounts + users + tenant) via RPC.
 */
export async function createLocalAccount(params: {
  tenantId: string;
  username: string;
  email?: string;
  phone?: string;
  className?: string;
  password?: string;
}): Promise<CreateLocalAccountResult> {
  const password = params.password || generatePassword();
  const authEmail = (params.email?.trim().toLowerCase() || `${params.username.toLowerCase()}@local.mathmastery.app`);

  // Captura a sessão do admin para restaurar caso o signUp crie uma nova sessão
  // (acontece quando "Confirm email" está DESLIGADO no Supabase).
  const before = await supabase.auth.getSession();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: authEmail,
    password,
    options: {
      data: { username: params.username.toLowerCase(), full_name: params.username, local_account: true },
    },
  });
  if (signUpError) throw new Error(signUpError.message);

  // Se o signUp substituiu a sessão do admin, restaura a sessão original
  const after = await supabase.auth.getSession();
  if (after.session && before.session && after.session.user.id !== before.session.user.id) {
    await supabase.auth.setSession(before.session);
  }

  const userId = signUpData.user?.id;
  if (!userId) throw new Error('Não foi possível criar a conta de autenticação.');

  const { data, error } = await supabase.rpc('create_local_account_profile', {
    p_auth_user_id: userId,
    p_tenant_id: params.tenantId,
    p_username: params.username,
    p_email: params.email || null,
    p_phone: params.phone || null,
    p_class_name: params.className || null,
    p_password: password,
  });
  if (error) throw new Error(error.message);
  return data as CreateLocalAccountResult;
}

/** Admin: redefine a senha de uma conta local (marca troca obrigatória no próximo acesso). */
export async function resetLocalPassword(accountId: string, newPassword?: string): Promise<CreateLocalAccountResult> {
  const { data, error } = await supabase.rpc('reset_local_password', {
    p_account_id: accountId,
    p_new_password: newPassword || null,
  });
  if (error) throw new Error(error.message);
  return data as CreateLocalAccountResult;
}

/** Admin: lista as contas locais da escola atual (usado no gerenciamento). */
export interface LocalAccountRow {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  must_change_password: boolean;
  status: string;
  created_at: string;
}

export async function listLocalAccounts(tenantId: string | null): Promise<LocalAccountRow[]> {
  let q = supabase.from('local_accounts').select('id, username, email, phone, must_change_password, status, created_at');
  if (tenantId) q = q.eq('tenant_id', tenantId);
  else q = q.is('tenant_id', null);
  const { data, error } = await q.order('username');
  if (error) throw new Error(error.message);
  return (data || []) as LocalAccountRow[];
}

/** Admin: exclui uma conta local (auth user + users + local_accounts). */
export async function deleteLocalAccount(accountId: string): Promise<boolean> {
  const { error } = await supabase.rpc('delete_local_account', { p_account_id: accountId });
  if (error) throw new Error(error.message);
  return true;
}