// Correção: A URL do CDN foi trocada para uma compatível com módulos ES (esm.sh)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://hlzcycvlcuhgnnjkmslt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsemN5Y3ZsY3VoZ25uamttc2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODA1ODgsImV4cCI6MjA2OTY1NjU4OH0.GEm-OCzpScQ5uFvhkNFHxdKdwZc3W2bnxphq0pjBwxY';

// Exporta o cliente inicializado para ser usado em outros scripts
export const supabaseClient = createClient(supabaseUrl, supabaseKey);