import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://irpmeockteksidxnpznb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjA4NjUsImV4cCI6MjEwMjMzNjg2NX0.H0tBYFKtvX5B9fSGZmfEf5HNmZ3tVpwUEp-DLyeifZ0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  const { data: users } = await supabase.from('users').select('id, name, email, role');
  console.log('Admins:', users?.filter(u => u.role === 'admin'));

  for (const admin of (users?.filter(u => u.role === 'admin') || [])) {
    const { data: items } = await supabase.from('user_items').select('*').eq('student_id', admin.id);
    console.log(`\nItems for admin ${admin.name} (${admin.id}):`, items?.length);
    items?.forEach(i => {
      console.log(' -', i.id, i.data?.itemTitle || i.data?.title, {
        itemType: i.data?.itemType,
        type: i.data?.type,
        gameEffect: i.data?.gameEffect,
        usableInQuest: i.data?.usableInQuest,
        quantity: i.data?.quantity
      });
    });
  }
}

inspect();
