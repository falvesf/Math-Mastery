const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const tables = [
    'quests', 'quest_attempts', 'xp_logs', 'users'
];

async function run() {
    for (let t of tables) {
        const { data, error } = await supabase.from(t).select('id').limit(10);
        if (error) {
            console.log(`Error reading ${t}:`, error.message);
        } else {
            console.log(`${t}: ${data.length} rows found`);
        }
    }
}
run();
