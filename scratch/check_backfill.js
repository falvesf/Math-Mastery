import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://irpmeockteksidxnpznb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjA4NjUsImV4cCI6MjEwMjMzNjg2NX0.H0tBYFKtvX5B9fSGZmfEf5HNmZ3tVpwUEp-DLyeifZ0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BATTLE_EFFECTS = [
  'heal_1_hp',
  'restore_hp',
  'remove_wrong',
  'add_time',
  'extra_life',
  'cure_bleed',
  'cure_poison',
  'cure_freeze',
  'cure_burn',
  'cure_electric'
];

async function checkBackfill() {
  console.log('--- CHECKING STORE ITEMS ---');
  const { data: storeItems } = await supabase.from('store_items').select('id, data');
  const storeToUpdate = (storeItems || []).filter(s => {
    const d = s.data || {};
    return BATTLE_EFFECTS.includes(d.gameEffect) && !d.usableInQuest;
  });
  console.log(`Store items to update (usableInQuest -> true): ${storeToUpdate.length}`);
  storeToUpdate.forEach(s => console.log('Store item:', s.id, s.data?.title, s.data?.gameEffect));

  console.log('\n--- CHECKING USER ITEMS ---');
  const { data: userItems } = await supabase.from('user_items').select('id, student_id, item_id, data');
  const userToUpdate = (userItems || []).filter(u => {
    const d = u.data || {};
    return BATTLE_EFFECTS.includes(d.gameEffect) && !d.usableInQuest;
  });
  console.log(`User items to update (usableInQuest -> true): ${userToUpdate.length}`);
  userToUpdate.forEach(u => console.log('User item:', u.id, u.student_id, u.data?.itemTitle, u.data?.gameEffect));
}

checkBackfill();
