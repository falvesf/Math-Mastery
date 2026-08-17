import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length > 0) env[key.trim()] = values.join('=').trim().replace(/"/g, '');
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function check() {
  console.log("Tentando inserir um registro dummy pra ver o erro RLS...");
  const { error: insErr } = await supabase.from('quest_attempts').insert({
     quest_id: 'teste_via_node',
     student_id: '4ce368b7-8d19-4a9f-a885-c8b5e9f5e3e2', // uuid falso qualquer
     status: 'completed',
     data: {}
  });
  console.log("Insert Error Detail:", insErr);
}

check();
