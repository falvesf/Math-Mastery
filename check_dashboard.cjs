const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data: user } = await supabase.from('users').select('*').ilike('name', '%Fabio%').single();
  console.log("Fabio UID:", user.id);
  const { data: attemptSnap, error } = await supabase.from('quest_attempts').select('quest_id, created_at').eq('student_id', user.id).eq('status', 'completed');
  if (error) console.error("Error:", error);
  console.log("attemptSnap:", attemptSnap);
}
run();
