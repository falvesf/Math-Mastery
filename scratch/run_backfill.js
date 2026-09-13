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

async function runBackfill() {
  console.log('=== STARTING BACKFILL ===');

  // 1. Store items
  const { data: storeItems, error: storeErr } = await supabase.from('store_items').select('id, data');
  if (storeErr) {
    console.error('Error fetching store_items:', storeErr);
    return;
  }

  let storeUpdated = 0;
  for (const item of (storeItems || [])) {
    const d = item.data || {};
    if (BATTLE_EFFECTS.includes(d.gameEffect) && !d.usableInQuest) {
      const updatedData = { ...d, usableInQuest: true };
      const { error: updErr } = await supabase.from('store_items').update({ data: updatedData }).eq('id', item.id);
      if (updErr) {
        console.error(`Error updating store_item ${item.id}:`, updErr);
      } else {
        storeUpdated++;
      }
    }
  }
  console.log(`Updated ${storeUpdated} store_items to usableInQuest: true.`);

  // 2. User items
  const { data: userItems, error: userErr } = await supabase.from('user_items').select('id, student_id, data');
  if (userErr) {
    console.error('Error fetching user_items:', userErr);
    return;
  }

  let userUpdated = 0;
  for (const u of (userItems || [])) {
    const d = u.data || {};
    if (BATTLE_EFFECTS.includes(d.gameEffect) && !d.usableInQuest) {
      const updatedData = { ...d, usableInQuest: true };
      const { error: updErr } = await supabase.from('user_items').update({ data: updatedData }).eq('id', u.id);
      if (updErr) {
        console.error(`Error updating user_item ${u.id}:`, updErr);
      } else {
        userUpdated++;
      }
    }
  }
  console.log(`Updated ${userUpdated} user_items to usableInQuest: true.`);

  console.log('=== BACKFILL COMPLETE ===');
}

runBackfill();
