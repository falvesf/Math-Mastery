import { doc, getDoc, updateDoc, collection, query, where, getDocs, writeBatch, deleteField } from 'firebase/firestore';
import { db } from './firebase';
import type { UserData } from '../contexts/AuthContext';

// Keys that are swapped between admin/student world
const SWAPPABLE_KEYS = [
  'xp', 'coins', 'rank', 'avatarConfig', 'lastSeenRank',
  'hearts', 'hpRecoveryStartTimestamp', 'lastHeartRegen',
  'extraInventorySpace', 'stunnedUntil', 'happyBuffUntil',
  'happyBuffDuration', 'customStatusText', 'isProfilePublic', 'unlockedSkins'
] as const;

type SwappableKey = typeof SWAPPABLE_KEYS[number];

function extractProfile(data: Record<string, any>): Record<string, any> {
  const profile: Record<string, any> = {};
  SWAPPABLE_KEYS.forEach(key => {
    if (data[key] !== undefined) {
      profile[key] = data[key];
    }
  });
  return profile;
}

function applyProfile(
  nextState: Record<string, any>,
  backup: Record<string, any>
) {
  SWAPPABLE_KEYS.forEach(key => {
    if (backup[key] !== undefined) {
      nextState[key] = backup[key];
    } else {
      // Use deleteField() for fields that don't exist in the backup
      // so they are actually removed from Firestore (not set to null)
      nextState[key] = deleteField();
    }
  });

  // Apply fresh student defaults if the value was deleted
  if (!backup.xp) nextState.xp = 0;
  if (!backup.coins) nextState.coins = 0;
  if (!backup.hearts) nextState.hearts = 3;
  if (!backup.extraInventorySpace) nextState.extraInventorySpace = 0;
}

export async function toggleStudentView(userData: UserData): Promise<void> {
  const userRef = doc(db, 'users', userData.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) return;
  const currentData = userSnap.data() as Record<string, any>;

  const isCurrentlyStudentView = !!currentData.studentViewActive;
  const batch = writeBatch(db);

  // Extract current profile state
  const currentProfile = extractProfile(currentData);

  const nextState: Record<string, any> = {
    studentViewActive: !isCurrentlyStudentView,
    role: !isCurrentlyStudentView ? 'student' : (currentData.adminProfileBackup?.role || 'admin')
  };

  if (!isCurrentlyStudentView) {
    // === TURNING ON Student View ===
    // 1. Save current admin profile to backup
    nextState.adminProfileBackup = currentProfile;
    // 2. Load student world (use backup if exists, otherwise defaults)
    const studentBackup = (currentData.studentProfileBackup as Record<string, any>) || {};
    applyProfile(nextState, studentBackup);
  } else {
    // === TURNING OFF Student View ===
    // 1. Save current student progress to backup
    nextState.studentProfileBackup = currentProfile;
    // 2. Restore admin profile
    const adminBackup = (currentData.adminProfileBackup as Record<string, any>) || {};
    applyProfile(nextState, adminBackup);
    // Admin always has 50000 XP/coins — restore guaranteed
    if (!adminBackup.xp || adminBackup.xp < 50000) nextState.xp = 50000;
    if (!adminBackup.coins || adminBackup.coins < 50000) nextState.coins = 50000;
  }

  batch.update(userRef, nextState);

  // === Swap user_items and xp_logs between worlds ===
  const ADMIN_BACKUP_ID = userData.uid + '_admin';
  const STUDENT_BACKUP_ID = userData.uid + '_student';

  const collectionsToSwap = ['user_items', 'xp_logs'];

  for (const collName of collectionsToSwap) {
    // Archive active items (under real uid) to appropriate backup id
    const archiveId = !isCurrentlyStudentView ? ADMIN_BACKUP_ID : STUDENT_BACKUP_ID;
    const qActive = query(collection(db, collName), where('studentId', '==', userData.uid));
    const activeSnaps = await getDocs(qActive);
    activeSnaps.docs.forEach(docSnap => {
      batch.update(docSnap.ref, { studentId: archiveId });
    });

    // Restore items from the target backup to the real uid
    const restoreId = !isCurrentlyStudentView ? STUDENT_BACKUP_ID : ADMIN_BACKUP_ID;
    const qRestore = query(collection(db, collName), where('studentId', '==', restoreId));
    const restoreSnaps = await getDocs(qRestore);
    restoreSnaps.docs.forEach(docSnap => {
      batch.update(docSnap.ref, { studentId: userData.uid });
    });
  }

  await batch.commit();
}

/**
 * Reseta completamente o perfil de aluno (mundo paralelo).
 * Funciona tanto no modo aluno ativo quanto fora dele.
 * Sempre zera XP, moedas, avatar e demais campos do perfil aluno.
 * Os itens e logs do mundo aluno são apagados.
 * Os dados de Admin ficam intactos no adminProfileBackup.
 */
export async function resetStudentProfile(userData: UserData): Promise<void> {
  const userRef = doc(db, 'users', userData.uid);
  const STUDENT_BACKUP_ID = userData.uid + '_student';

  // Re-ler o documento do Firestore para garantir dados frescos (evitar estado stale)
  const freshSnap = await getDoc(userRef);
  const freshData = freshSnap.data() as Record<string, any> | undefined;
  const isCurrentlyInStudentView = freshData?.studentViewActive === true;

  console.log('[resetStudentProfile] Starting reset:', {
    uid: userData.uid,
    isCurrentlyInStudentView,
    freshXp: freshData?.xp,
    freshStudentViewActive: freshData?.studentViewActive,
  });

  const batch = writeBatch(db);

  // Sempre limpar o studentProfileBackup e zerar os campos do perfil aluno
  // Se o modo aluno estiver ativo, também zerar os campos atuais do documento
  const resetFields: Record<string, any> = {
    studentProfileBackup: deleteField(), // Apaga o cofre do aluno
    // Sempre zerar esses campos (eles pertencem ao mundo aluno)
    xp: 0,
    coins: 0,
    hearts: 3,
    rank: deleteField(),
    lastSeenRank: deleteField(),
    avatarConfig: deleteField(),
    extraInventorySpace: 0,
    stunnedUntil: deleteField(),
    happyBuffUntil: deleteField(),
    happyBuffDuration: deleteField(),
    unlockedSkins: deleteField(),
    customStatusText: deleteField(),
    role: 'student', // <-- ESCONDE O STATUS DE ADMIN DO BACKEND
  };

  // Se NÃO estiver em modo aluno, não queremos sobrescrever os campos do admin
  // (mas o modo aluno sempre deve estar ativo para que o botão Resetar apareça)
  if (!isCurrentlyInStudentView) {
    // Fora do modo aluno: apenas limpar o backup do aluno, sem tocar nos dados atuais (que são do admin)
    const safeResetFields: Record<string, any> = {
      studentProfileBackup: deleteField(),
    };
    batch.update(userRef, safeResetFields);
  } else {
    // Em modo aluno: zerar tudo
    batch.update(userRef, resetFields);
  }

  // Deleta itens e logs do mundo aluno (tanto ativos quanto no backup)
  const collectionsToClean = ['user_items', 'xp_logs'];
  for (const collName of collectionsToClean) {
    // Items ativos (pertencem ao aluno quando studentViewActive=true)
    if (isCurrentlyInStudentView) {
      const qActive = query(collection(db, collName), where('studentId', '==', userData.uid));
      const activeSnaps = await getDocs(qActive);
      activeSnaps.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
    }
    // Items do cofre de aluno (backup com sufixo _student)
    const qBackup = query(collection(db, collName), where('studentId', '==', STUDENT_BACKUP_ID));
    const backupSnaps = await getDocs(qBackup);
    backupSnaps.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
  }

  // Deleta quest_attempts do aluno (apenas quando em modo aluno ativo)
  if (isCurrentlyInStudentView) {
    const qAttempts = query(
      collection(db, 'quest_attempts'),
      where('studentId', '==', userData.uid)
    );
    const attemptSnaps = await getDocs(qAttempts);
    attemptSnaps.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
    });
  }

  await batch.commit();
  console.log('[resetStudentProfile] Reset committed successfully.');
}
