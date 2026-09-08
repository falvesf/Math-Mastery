const { createClient } = require('@supabase/supabase-js');

const url = 'https://irpmeockteksidxnpznb.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjA4NjUsImV4cCI6MjEwMjMzNjg2NX0.H0tBYFKtvX5B9fSGZmfEf5HNmZ3tVpwUEp-DLyeifZ0';

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('system_collections').select('*').eq('collection_name', 'ai_config');
  console.log('AI Configs in DB:', data, error);
}
run();
