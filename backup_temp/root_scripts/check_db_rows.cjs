const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const tables = ['classes', 'custom_ranks', 'quests', 'user_items', 'store_items', 'preset_skins', '3d_models'];
    for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*');
        if (error) {
            console.log(`Table ${t}: Error - ${error.message}`);
        } else {
            console.log(`Table ${t}: ${data.length} rows`);
            if (data.length > 0) {
                console.log(`Sample from ${t}:`, JSON.stringify(data[0]).substring(0, 200));
            }
        }
    }
}
run();
