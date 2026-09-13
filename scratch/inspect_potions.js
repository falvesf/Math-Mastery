const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://irpmeockteksidxnpznb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjA4NjUsImV4cCI6MjEwMjMzNjg2NX0.H0tBYFKtvX5B9fSGZmfEf5HNmZ3tVpwUEp-DLyeifZ0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  console.log('--- STORE POTIONS ---');
  const { data: storeItems } = await supabase.from('store_items').select('id, data').limit(100);
  const potions = (storeItems || []).filter(s => {
    const d = s.data || {};
    return d.gameEffect && d.gameEffect !== 'none' || (d.title && d.title.toLowerCase().includes('poção'));
  });
  console.log('Found store potions/effect items:', potions.length);
  potions.slice(0, 10).forEach(p => {
    console.log(p.id, p.data?.title, {
      type: p.data?.type,
      itemType: p.data?.itemType,
      gameEffect: p.data?.gameEffect,
      usableInQuest: p.data?.usableInQuest
    });
  });

  console.log('\n--- RECENT USER ITEMS (POTIONS / CONSUMABLES) ---');
  const { data: userItems } = await supabase.from('user_items').select('*').limit(100);
  const userPotions = (userItems || []).filter(u => {
    const d = u.data || {};
    return (d.itemTitle && d.itemTitle.toLowerCase().includes('poção')) ||
      (d.title && d.title.toLowerCase().includes('poção')) ||
      (d.gameEffect && d.gameEffect.includes('hp')) ||
      d.itemType === 'consumable' ||
      d.type === 'consumable';
  });
  console.log('Found user potions/consumables:', userPotions.length);
  userPotions.slice(0, 10).forEach(u => {
    console.log('UserItem row:', u.id, 'student_id:', u.student_id, 'item_id:', u.item_id);
    console.log('  data:', JSON.stringify({
      itemTitle: u.data?.itemTitle || u.data?.title,
      type: u.data?.type,
      itemType: u.data?.itemType,
      gameEffect: u.data?.gameEffect,
      usableInQuest: u.data?.usableInQuest,
      quantity: u.data?.quantity
    }));
  });
}

inspect();
