import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('system_collections').select('*').eq('collection_name', 'ai_config');
  console.log('AI Configs in DB:', data, error);
}
run();
