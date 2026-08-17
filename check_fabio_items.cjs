const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const { data: users } = await supabase.from('users').select('id, name').ilike('name', '%Fabio%');
    console.log("Fabio Users:", users);
    if (users.length === 0) return;
    const uid = users[0].id;
    
    const { data: items } = await supabase.from('user_items').select('*').eq('student_id', uid);
    console.log(`Fabio has ${items.length} items`);
    for (const item of items) {
        if (item.data && item.data.itemType === 'equippable') {
            console.log(`ID: ${item.id}, Name: ${item.data.itemTitle}, Part: ${item.data.avatarPart}, Equipped: ${item.equipped}, Category: ${item.data.itemCategory}`);
        }
    }
}
run();
