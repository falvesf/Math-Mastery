import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://irpmeockteksidxnpznb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjA4NjUsImV4cCI6MjEwMjMzNjg2NX0.H0tBYFKtvX5B9fSGZmfEf5HNmZ3tVpwUEp-DLyeifZ0';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {

  const { data, error } = await supabase.rpc('run_sql', { sql: 'SELECT id, quest_id, student_id, status FROM quest_attempts ORDER BY created_at DESC LIMIT 5;' });
  console.log('Quest Attempts:', data, error);
  const { data: d2, error: e2 } = await supabase.rpc('run_sql', { sql: 'SELECT id, student_id, amount FROM xp_logs ORDER BY created_at DESC LIMIT 5;' });
  console.log('XP Logs:', d2, e2);
}

check();
