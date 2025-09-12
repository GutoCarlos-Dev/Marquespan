import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://hlzcycvlcuhgnnjkmslt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsemN5Y3ZsY3VoZ25uamttc2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODA1ODgsImV4cCI6MjA2OTY1NjU4OH0.GEm-OCzpScQ5uFvhkNFHxdKdwZc3W2bnxphq0pjBwxY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function setup() {
  // 1. Deletar a tabela 'usuarios' se existir
  await supabase.rpc('drop_table_if_exists', { table_name: 'usuarios' }).catch(() => {});

  // 2. Criar a tabela 'usuarios'
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS public.usuarios (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      codigo text UNIQUE NOT NULL,
      nome text NOT NULL,
      funcao text,
      email text UNIQUE NOT NULL
    );
  `;

  const { error: createError } = await supabase.rpc('execute_sql', { sql: createTableSQL });
  if (createError) {
    console.error('Erro ao criar tabela usuarios:', createError);
    return;
  }

  // 3. Inserir usuário de teste na tabela 'usuarios'
  const { error: insertError } = await supabase
    .from('usuarios')
    .insert([
      {
        codigo: 'teste@marquespan.com',
        nome: 'Usuário Teste',
        funcao: 'Administrador',
        email: 'teste@marquespan.com',
      },
    ]);

  if (insertError) {
    console.error('Erro ao inserir usuário de teste:', insertError);
    return;
  }

  // 4. Criar usuário de autenticação no Supabase Auth
  const { data, error: authError } = await supabase.auth.admin.createUser({
    email: 'teste@marquespan.com',
    password: '123456',
    email_confirm: true,
  });

  if (authError) {
    console.error('Erro ao criar usuário de autenticação:', authError);
    return;
  }

  console.log('Setup concluído com sucesso. Usuário de teste criado.');
}

setup();
