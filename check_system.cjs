const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const { data } = await supabase.from('system_collections').select('*').limit(1);
    console.log("system_collections columns:", data && data.length > 0 ? Object.keys(data[0]) : "Empty");
    
    // try to insert two rows to see if type is PK
    const { error: e1 } = await supabase.from('system_collections').insert({ type: 'test1', data: {} });
    const { error: e2 } = await supabase.from('system_collections').insert({ type: 'test1', data: {} });
    console.log("Insert second same type error:", e2 ? e2.message : "Success (type is not PK)");
    await supabase.from('system_collections').delete().eq('type', 'test1');
}
run();
