const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjA4NjUsImV4cCI6MjEwMjMzNjg2NX0.H0tBYFKtvX5B9fSGZmfEf5HNmZ3tVpwUEp-DLyeifZ0';
const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function run() {
    const { data, error } = await supabase.from('classes').select('*');
    if (error) {
        console.log('Error classes as anon:', error);
    } else {
        console.log(`Anon could read ${data.length} rows from classes`);
    }

    const { data: qData, error: qError } = await supabase.from('quests').select('*');
    if (qError) {
        console.log('Error quests as anon:', qError);
    } else {
        console.log(`Anon could read ${qData.length} rows from quests`);
    }
}
run();
