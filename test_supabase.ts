import { supabase } from './src/lib/supabase'; supabase.from('quest_attempts').select('*').limit(1).then(r = 
