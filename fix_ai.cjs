const { createClient } = require('@supabase/supabase-js');

const url = 'https://irpmeockteksidxnpznb.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjA4NjUsImV4cCI6MjEwMjMzNjg2NX0.H0tBYFKtvX5B9fSGZmfEf5HNmZ3tVpwUEp-DLyeifZ0';

const supabase = createClient(url, key);

async function run() {
  // Delete the older row
  const { error } = await supabase.from('system_collections').delete().eq('id', '108b2eca-5bd3-41b9-b1da-9582e059f2bb');
  if (error) {
    console.error('Error deleting older AI config:', error);
  } else {
    console.log('Successfully deleted the older AI config (duplicate).');
  }
}
run();
