import { supabase } from './supabase';

const SWAPPABLE_KEYS = [
  'xp', 'coins', 'rank', 'avatar_config',
  'hp', 'hp_recovery_start_timestamp', 'last_heart_regen',
  'extra_inventory_space', 'stunned_until', 'happy_buff_until',
  'happy_buff_duration', 'custom_status_text', 'is_profile_public', 
  'unlocked_skins', 'distributed_stats'
];

export const toggleStudentView = async (userData: any) => {
  if (!userData?.uid && !userData?.id) return;
  const uid = userData.uid || userData.id;

  const { data: currentData, error: fetchErr } = await supabase.from('users').select('*').eq('id', uid).single();
  if (fetchErr || !currentData) return;

  const isCurrentlyStudentView = !!currentData.student_view_active;
  
  const extractProfile = (data: any) => {
    const profile: any = {};
    SWAPPABLE_KEYS.forEach(key => {
      if (data[key] !== undefined && data[key] !== null) profile[key] = data[key];
    });
    return profile;
  };

  const currentProfile = extractProfile(currentData);
  const nextState: any = {
    student_view_active: !isCurrentlyStudentView
  };

  let skipItemSwap = false;

  if (!isCurrentlyStudentView) {
    // TURNING ON Student View
    nextState.admin_profile_backup = currentProfile;
    const studentBackup = currentData.student_profile_backup || {};
    SWAPPABLE_KEYS.forEach(key => {
      nextState[key] = studentBackup[key] !== undefined ? studentBackup[key] : null;
    });
    if (nextState.xp === null) nextState.xp = 0;
    if (nextState.coins === null) nextState.coins = 0;
    if (nextState.hp === null) nextState.hp = 3;
    if (nextState.extra_inventory_space === null) nextState.extra_inventory_space = 0;
  } else {
    // TURNING OFF Student View
    // RECOVERY LOGIC: If admin_profile_backup is empty, they entered student view during a bug!
    if (!currentData.admin_profile_backup) {
      skipItemSwap = true;
      // Do not overwrite their current stats into student backup, leave them active
      // Their current stats ARE their admin stats. Just turn off the flag.
      console.warn("Recovering corrupted admin profile: leaving active stats untouched.");
    } else {
      nextState.student_profile_backup = currentProfile;
      const adminBackup = currentData.admin_profile_backup || {};
      SWAPPABLE_KEYS.forEach(key => {
        nextState[key] = adminBackup[key] !== undefined ? adminBackup[key] : null;
      });
      if (!nextState.xp || nextState.xp < 50000) nextState.xp = 50000;
      if (!nextState.coins || nextState.coins < 50000) nextState.coins = 50000;
    }
  }

  // Backup and Restore Collections (we no longer swap quest_attempts so admins can see their test attempts in history)
  const collectionsToSwap = ['user_items', 'xp_logs'];
  const currentCollectionsData: any = {};

  if (!skipItemSwap) {
    for (const collName of collectionsToSwap) {
      const { data: items } = await supabase.from(collName).select('*').eq('student_id', uid);
      currentCollectionsData[collName] = items || [];
      if (items && items.length > 0) {
        await supabase.from(collName).delete().eq('student_id', uid);
      }
    }

    if (!isCurrentlyStudentView) {
      // Save active collections to admin backup
      nextState.admin_profile_backup.collections = currentCollectionsData;
      // Restore from student backup
      const studentBackup = currentData.student_profile_backup || {};
      const toRestore = studentBackup.collections || {};
      for (const collName of collectionsToSwap) {
        if (toRestore[collName] && toRestore[collName].length > 0) {
          const rowsToInsert = toRestore[collName].map((r: any) => {
            const { id, created_at, ...rest } = r;
            return { ...rest, student_id: uid };
          });
          await supabase.from(collName).insert(rowsToInsert);
        }
      }
    } else {
      // Save active collections to student backup
      nextState.student_profile_backup.collections = currentCollectionsData;
      // Restore from admin backup
      const adminBackup = currentData.admin_profile_backup || {};
      const toRestore = adminBackup.collections || {};
      for (const collName of collectionsToSwap) {
        if (toRestore[collName] && toRestore[collName].length > 0) {
          const rowsToInsert = toRestore[collName].map((r: any) => {
            const { id, created_at, ...rest } = r;
            return { ...rest, student_id: uid };
          });
          await supabase.from(collName).insert(rowsToInsert);
        }
      }
    }
  }

  const { error } = await supabase.from('users').update(nextState).eq('id', uid);
  if (error) {
    console.error('Failed to toggle student view:', error);
    throw error;
  }
};

export const resetStudentProfile = async (userData: any) => {
  if (!userData?.uid && !userData?.id) return;
  const uid = userData.uid || userData.id;
  const STUDENT_BACKUP_ID = uid + '_student';

  const { data: currentData } = await supabase.from('users').select('student_view_active').eq('id', uid).single();
  const isCurrentlyInStudentView = currentData?.student_view_active === true;

  const resetFields: any = {
    student_profile_backup: null,
    xp: 0,
    coins: 0,
    hp: 3,
    rank: null,
    avatar_config: {},
    extra_inventory_space: 0,
    stunned_until: null,
    happy_buff_until: null,
    happy_buff_duration: null,
    unlocked_skins: null,
    custom_status_text: null,
    distributed_stats: { vitality: 0, fortitude: 0, persuasion: 0 }
  };

  if (!isCurrentlyInStudentView) {
    await supabase.from('users').update({ student_profile_backup: null }).eq('id', uid);
  } else {
    await supabase.from('users').update(resetFields).eq('id', uid);
  }

  const collectionsToClean = ['user_items', 'xp_logs', 'quest_attempts'];
  if (isCurrentlyInStudentView) {
    for (const collName of collectionsToClean) {
      await supabase.from(collName).delete().eq('student_id', uid);
    }
  }
};
