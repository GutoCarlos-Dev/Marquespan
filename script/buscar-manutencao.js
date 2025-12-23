function preencherUsuarioLogado() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  const divUsuario = document.getElementById('usuario-logado');
  if (usuario?.nome && divUsuario) {
    divUsuario.textContent = `👤 Olá, ${usuario.nome}`;
  }
}

async function carregarFiltros() {
  const [placas, titulos, filiais, fornecedores] = await Promise.all([
    supabaseClient.from('veiculos').select('placa'),
    supabaseClient.from('titulomanutencao').select('manutencao'),
    supabaseClient.from('filial').select('uf'),
    supabaseClient.from('fornecedor').select('fornecedor')
  ]);

  preencherDatalist('listaPlacas', placas.data, 'placa');
  preencherDatalist('listaTitulos', titulos.data, 'manutencao');
  preencherSelect('filial', filiais.data, 'uf');
  preencherDatalist('listaFornecedores', fornecedores.data, 'fornecedor');
}

function preencherDatalist(id, data, campo) {
  const lista = document.getElementById(id);
  lista.innerHTML = '';
  data?.forEach(item => {
    if (item[campo]) {
      lista.appendChild(new Option(item[campo]));
    }
  });
}

function preencherSelect(id, data, campo) {
  const select = document.getElementById(id);
  select.innerHTML = '<option value="">Todos</option>';
  data?.forEach(item => {
    select.appendChild(new Option(item[campo], item[campo]));
  });
}

async function buscarManutencao() {
  const filtros = {
    dataInicial: document.getElementById('dataInicial').value,
    dataFinal: document.getElementById('dataFinal').value,
    titulo: document.getElementById('titulo').value,
    nfse: document.getElementById('nfse').value,
    os: document.getElementById('os').value,
    veiculo: document.getElementById('veiculo').value,
    filial: document.getElementById('filial').value,
    // tipo: document.getElementById('tipoManutencao').value, // Coluna não existe no banco
    fornecedor: document.getElementById('fornecedor').value,
    usuario: document.getElementById('usuarioBusca').value
  };

  let query = supabaseClient.from('manutencao').select('*');

  // Aplicar filtros encadeando corretamente
  if (filtros.dataInicial) query = query.gte('data', filtros.dataInicial);
  if (filtros.dataFinal) query = query.lte('data', filtros.dataFinal);
  if (filtros.titulo) query = query.ilike('titulo', `%${filtros.titulo}%`);
  if (filtros.nfse) query = query.ilike('notaServico', `%${filtros.nfse}%`);
  if (filtros.os) query = query.ilike('numeroOS', `%${filtros.os}%`);
  if (filtros.veiculo) query = query.ilike('veiculo', `%${filtros.veiculo}%`);
  if (filtros.filial) query = query.eq('filial', filtros.filial);
  // if (filtros.tipo) query = query.eq('tipo', filtros.tipo); // Coluna não existe no banco
  if (filtros.fornecedor) query = query.ilike('fornecedor', `%${filtros.fornecedor}%`);
  if (filtros.usuario) query = query.ilike('usuario', `%${filtros.usuario}%`);

  // Executar a query
  const { data, error } = await query;

  if (error) {
    console.error('❌ Erro ao buscar manutenções:', error);
    alert('Erro ao buscar manutenções. Verifique os filtros ou tente novamente.');
    return;
  }

  // Verificar se há dados
  if (!data || data.length === 0) {
    alert('Nenhuma manutenção encontrada com os filtros aplicados.');
    document.getElementById('tabelaResultados').innerHTML = '';
    document.getElementById('totalRegistros').textContent = '0';
    document.getElementById('valorTotal').textContent = '0,00';
    return;
  }

  // Preencher a tabela com os dados
  preencherTabela(data);
}

// 📋 Preencher tabela de resultados
function preencherTabela(registros) {
  const tabela = document.getElementById('tabelaResultados');
  tabela.innerHTML = '';
  let total = 0;

  registros.forEach(m => {
    const linha = document.createElement('tr');
    linha.innerHTML = `
      <td style="display: flex; gap: 5px;">
        <button class="btn-acao editar" onclick="abrirManutencao(${m.id})" title="Abrir"><i class="fas fa-search"></i></button>
        <button class="btn-acao excluir" onclick="excluirManutencao(${m.id})" title="Excluir"><i class="fas fa-trash-alt"></i></button>
      </td>
      <td>${m.usuario || ''}</td>
      <td>${m.titulo || ''}</td>
      <td>${m.veiculo || ''}</td>
      <td>${m.descricao || ''}</td>
      <td>${m.numeroOS || ''}</td>
      <td>${formatarData(m.data)}</td>
      <td>R$ ${formatarValor(m.valor || 0)}</td>
    `;
    tabela.appendChild(linha);
    total += parseFloat(m.valor || 0);
  });

  document.getElementById('totalRegistros').textContent = registros.length;
  document.getElementById('valorTotal').textContent = formatarValor(total);
}

function formatarData(data) {
  if (!data) return '';
  const d = new Date(data);
  return d.toLocaleDateString('pt-BR');
}

function formatarValor(valor) {
  return valor.toFixed(2).replace('.', ',');
}

// 🔗 Abrir manutenção
window.abrirManutencao = function(id) {
  window.location.href = `incluir-manutencao.html?id=${id}`;
}

// 🗑️ Excluir manutenção
window.excluirManutencao = async function(id) {
  if (!confirm('Tem certeza que deseja excluir esta manutenção? Esta ação não pode ser desfeita.')) return;

  const { error } = await supabaseClient.from('manutencao').delete().eq('id', id);

  if (error) {
    console.error('Erro ao excluir manutenção:', error);
    alert('❌ Erro ao excluir manutenção.');
  } else {
    alert('✅ Manutenção excluída com sucesso!');
    buscarManutencao(); // Atualiza a tabela
  }
}

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  preencherUsuarioLogado();
  carregarFiltros();

  document.getElementById('btnBuscarManutencao').addEventListener('click', buscarManutencao);

  document.getElementById('btnExportarPDF').addEventListener('click', () => {
    alert('📄 Exportar PDF ainda não implementado.');
  });

  document.getElementById('btnExportarXLS').addEventListener('click', () => {
    alert('📊 Exportar XLS ainda não implementado.');
  });
});
