import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_policies', { table_name: 'system_collections' }).catch(() => ({}));
  console.log('RPC Policies:', data, error);

  // Fallback if rpc fails
  const { data: qData, error: qErr } = await supabase.from('system_collections').select('*');
  console.log('Query system_collections:', qData, qErr);
}
run();
