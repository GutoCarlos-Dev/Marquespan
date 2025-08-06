import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://hlzcycvlcuhgnnjkmslt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsemN5Y3ZsY3VoZ25uamttc2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODA1ODgsImV4cCI6MjA2OTY1NjU4OH0.GEm-OCzpScQ5uFvhkNFHxdKdwZc3W2bnxphq0pjBwxY' // substitua pela sua chave pública real
);

document.addEventListener('DOMContentLoaded', () => {
  // Formulário de cadastro de usuário
  const formUsuario = document.getElementById('formUsuario');
  if (formUsuario) {
    formUsuario.addEventListener('submit', async function (e) {
      e.preventDefault();

      const codigo = document.getElementById('codigo').value.trim();
      const nome = document.getElementById('nome').value.trim();
      const funcao = document.getElementById('funcao').value.trim();
      const senha = document.getElementById('senha').value.trim();

      if (!codigo || !nome || !funcao || !senha) {
        alert('⚠️ Preencha todos os campos!');
        return;
      }

      const { error } = await supabase
        .from('usuarios')
        .insert([{ codigo, nome, funcao, senha }]);

      if (error) {
        alert('❌ Erro ao cadastrar: ' + error.message);
      } else {
        alert('✅ Usuário cadastrado com sucesso!');
        this.reset();
        mostrarUsuarios();
        alternarBotoes(true);
      }
    });
  }

  // Exibir usuários com filtro
  async function mostrarUsuarios() {
    const { data, error } = await supabase.from('usuarios').select('senha');
    const corpoTabela = document.getElementById('corpoTabelaUsuarios');
    corpoTabela.innerHTML = '';

    if (error) {
      alert('❌ Erro ao buscar usuários: ' + error.message);
      return;
    }

    const termoBusca = document.getElementById('termoBusca')?.value.trim().toLowerCase() || '';
    const filtrados = termoBusca
      ? data.filter(u => u.nome.toLowerCase().includes(termoBusca) || u.codigo.toLowerCase().includes(termoBusca))
      : data;

    if (!filtrados.length) {
      corpoTabela.innerHTML = '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>';
      return;
    }

    filtrados.forEach(usuario => {
      const linha = document.createElement('tr');
      linha.innerHTML = `
        <td>${usuario.codigo}</td>
        <td>${usuario.nome}</td>
        <td>${usuario.funcao}</td>
        <td>
          <button onclick="preencherFormulario('${usuario.codigo}')">✏️ Editar</button>
          <button onclick="excluirUsuario('${usuario.codigo}')">🗑️ Excluir</button>
        </td>
      `;
      corpoTabela.appendChild(linha);
    });
  }

  // Preencher formulário para edição
  window.preencherFormulario = async (codigo) => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('codigo', codigo)
      .single();

    if (error) {
      alert('❌ Erro ao buscar usuário: ' + error.message);
      return;
    }

    document.getElementById('codigo').value = data.codigo;
    document.getElementById('nome').value = data.nome;
    document.getElementById('funcao').value = data.funcao;
    document.getElementById('senha').value = data.senha;

    alternarBotoes(false);
  };

  // Atualizar usuário
  window.atualizarUsuario = async () => {
    const codigo = document.getElementById('codigo').value.trim();
    const nome = document.getElementById('nome').value.trim();
    const funcao = document.getElementById('funcao').value.trim();
    const senha = document.getElementById('senha').value.trim();

    const { error } = await supabase
      .from('usuarios')
      .update({ nome, funcao, senha })
      .eq('codigo', codigo);

    if (error) {
      alert('❌ Erro ao atualizar: ' + error.message);
    } else {
      alert('✅ Usuário atualizado com sucesso!');
      document.getElementById('formUsuario').reset();
      mostrarUsuarios();
      alternarBotoes(true);
    }
  };

  // Excluir usuário
  window.excluirUsuario = async (codigo) => {
    if (!confirm('❗ Tem certeza que deseja excluir este usuário?')) return;

    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('codigo', codigo);

    if (error) {
      alert('❌ Erro ao excluir: ' + error.message);
    } else {
      alert('🗑️ Usuário excluído com sucesso!');
      mostrarUsuarios();
    }
  };

  // Alterna exibição dos botões Salvar/Atualizar
  function alternarBotoes(modoSalvar) {
    document.getElementById('btnSalvar').style.display = modoSalvar ? 'inline-block' : 'none';
    document.getElementById('btnAtualizar').style.display = modoSalvar ? 'none' : 'inline-block';
  }

  // Inicializa a exibição de usuários
  mostrarUsuarios();
});
