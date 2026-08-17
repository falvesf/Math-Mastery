import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length > 0) env[key.trim()] = values.join('=').trim().replace(/"/g, '');
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: user } = await supabase.from('users').select('id').ilike('name', '%Fabio%').single();
  if (user) {
    const { data: attempts, error } = await supabase.from('quest_attempts').select('*').eq('student_id', user.id);
    if (error) console.error(error);
    else console.log("Tentativas encontradas:", attempts.length);
  }
}
run();
