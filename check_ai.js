import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('system_collections').select('*').eq('collection_name', 'ai_config');
  console.log('Data:', data);
  console.log('Error:', error);
}
run();
