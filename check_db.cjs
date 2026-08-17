const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const { error } = await supabase.rpc('execute_sql', {
        sql_query: `
            ALTER TABLE xp_logs 
            ADD COLUMN IF NOT EXISTS eval_name TEXT,
            ADD COLUMN IF NOT EXISTS justification TEXT,
            ADD COLUMN IF NOT EXISTS xp_gained NUMERIC;
        `
    });
    console.log('Alter table error via RPC:', error);
}
run();

async function testThrow() {
  try {
    console.log("Starting update...");
    const result = await supabase.from('users').update({ invalid_col: 'test' }).eq('id', 'test');
    console.log("Finished without throwing. Result:", result);
  } catch (err) {
    console.error("IT THREW AN EXCEPTION!", err);
  }
}
testThrow();
