const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    // Check ranks
    const { data: ranks } = await supabase.from('custom_ranks').select('name, imageUrl, variants');
    console.log("Lendario variants:", ranks.find(r => r.name === 'Lendário')?.variants);

    // Check users avatar config
    const { data: users } = await supabase.from('users').select('email, avatar_config');
    console.log("Users avatars:", users.map(u => ({ email: u.email, hasAvatar: !!u.avatar_config })));

    // Check quests
    const { data: quests } = await supabase.from('quests').select('title, description, coverImageUrl, baseXp');
    console.log("Quests sample:", quests[0]);
}
run();
