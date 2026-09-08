const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    // Testar upsert com o campo randomQuestionSelection (que NÃO existe na tabela)
    const testId = 'test_random_col_001';
    const { data, error } = await supabase.from('quests').upsert({
        id: testId,
        title: 'Teste colunas',
        description: 'teste',
        questions: [{ title: 'q1', options: [{ text: 'a' }, { text: 'b' }], correctIndex: 0, timeLimit: 30 }],
        randomQuestionSelection: false,
        randomQuestionCount: 10
    });
    
    console.log('Upsert com colunas novas:', error ? `ERRO: ${error.message}` : 'OK');
    
    if (error) {
        // Agora testar SEM as colunas novas para confirmar que funciona
        const { data: d2, error: e2 } = await supabase.from('quests').upsert({
            id: testId,
            title: 'Teste colunas',
            description: 'teste',
            questions: [{ title: 'q1', options: [{ text: 'a', imageUrl: 'http://exemplo.com/img.png' }, { text: 'b' }], correctIndex: 0, timeLimit: 30 }]
        });
        console.log('Upsert sem colunas novas:', e2 ? `ERRO: ${e2.message}` : 'OK');
        
        // Limpar teste
        await supabase.from('quests').delete().eq('id', testId);
    }
}
run();
