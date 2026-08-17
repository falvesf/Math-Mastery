import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
  const { data: attempts, error } = await supabase.from('quest_attempts').select('*');
  if (error) {
    console.error('Error fetching attempts:', error);
  } else {
    console.log('Total attempts:', attempts.length);
    console.log('Last 5 attempts:', attempts.slice(-5));
  }
}

check();
