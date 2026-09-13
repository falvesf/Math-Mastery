import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://irpmeockteksidxnpznb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjA4NjUsImV4cCI6MjEwMjMzNjg2NX0.H0tBYFKtvX5B9fSGZmfEf5HNmZ3tVpwUEp-DLyeifZ0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  const { data: userItems } = await supabase.from('user_items').select('*');
  const potionItems = (userItems || []).filter(u => {
    const t = (u.data?.itemTitle || u.data?.title || '').toLowerCase();
    const g = u.data?.gameEffect || '';
    return t.includes('poção') || t.includes('vida') || t.includes('elixir') || g.includes('hp');
  });

  const studentIds = [...new Set(potionItems.map(p => p.student_id))];
  const { data: users } = await supabase.from('users').select('id, name, email, role').in('id', studentIds);
  const userMap = new Map((users || []).map(u => [u.id, u]));

  console.log('Found potion items count:', potionItems.length);
  potionItems.forEach(p => {
    const u = userMap.get(p.student_id);
    console.log(`User: ${u?.name} (${u?.email}, role=${u?.role}, id=${p.student_id})`);
    console.log('  Item:', p.id, p.data?.itemTitle, {
      gameEffect: p.data?.gameEffect,
      itemType: p.data?.itemType,
      usableInQuest: p.data?.usableInQuest,
      quantity: p.data?.quantity
    });
  });
}

inspect();
