const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    // Verificar o tipo da coluna questions
    const { data, error } = await supabase.rpc('get_quest_schema');
    if (error) console.log('RPC error:', error.message);

    // Buscar todas as questões e verificar se questions é string ou array
    const { data: quests, error: qErr } = await supabase.from('quests').select('id, title, questions');
    if (qErr) {
        console.log('Query error:', qErr.message);
        return;
    }
    
    quests.forEach(q => {
        const type = typeof q.questions;
        const isArray = Array.isArray(q.questions);
        console.log(`Quest "${q.title}" (${q.id}): questions type=${type}, isArray=${isArray}`);
        if (typeof q.questions === 'string') {
            console.log('  -> É uma string JSON! Primeiros 200 chars:', q.questions.substring(0, 200));
        } else if (isArray && q.questions.length > 0) {
            const first = q.questions[0];
            console.log('  -> Primeira pergunta keys:', Object.keys(first));
            if (first.options && first.options.length > 0) {
                console.log('  -> Primeira opção keys:', Object.keys(first.options[0]));
            }
        }
    });
}
run();
