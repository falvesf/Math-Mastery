const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const tables = [
    'store_items', 'classes', '3d_models', 'preset_skins', 'custom_ranks', 'themes', 'tileset_configs'
];

async function run() {
    for (let t of tables) {
        const { error: err2 } = await supabase.from(t).insert({ id: '00000000-0000-0000-0000-000000000000' }).select();
        if (err2) {
            console.log(`Table ${t} schema error:`, err2.message);
        } else {
            const { data } = await supabase.from(t).select('*').eq('id', '00000000-0000-0000-0000-000000000000');
            console.log(`Table ${t} columns:`, Object.keys(data[0]));
            await supabase.from(t).delete().eq('id', '00000000-0000-0000-0000-000000000000');
        }
    }
}
run();
