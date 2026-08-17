const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://irpmeockteksidxnpznb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjA4NjUsImV4cCI6MjEwMjMzNjg2NX0.H0tBYFKtvX5B9fSGZmfEf5HNmZ3tVpwUEp-DLyeifZ0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: users, error } = await supabase.from('users').select('*').ilike('name', '%Fabio%');
  if (error) { console.error(error); return; }
  for (const user of users) {
    console.log("Found:", user.name, "ID:", user.id);
    const { data: attempts } = await supabase.from('quest_attempts').select('*').eq('student_id', user.id);
    console.log("Tentativas ativas:", attempts?.length);
    console.log("student_profile_backup.collections:", user.student_profile_backup?.collections ? Object.keys(user.student_profile_backup.collections) : 'None');
    console.log("quest_attempts in backup:", user.student_profile_backup?.collections?.quest_attempts?.length);
  }
}
run();
