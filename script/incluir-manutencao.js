// 📦 Importação do Supabase

// 🔀 Alternância de painéis internos
function mostrarPainelInterno(id) {
  document.querySelectorAll('.painel-conteudo').forEach(div => {
    div.classList.add('hidden');
    div.classList.remove('fade-in');
  });

  const painel = document.getElementById(id);
  if (painel) {
    painel.classList.remove('hidden');
    requestAnimationFrame(() => painel.classList.add('fade-in'));
  }

  document.querySelectorAll('.painel-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  const btnAtivo = document.querySelector(`.painel-btn[data-painel="${id}"]`);
  if (btnAtivo) {
    btnAtivo.classList.add('active');
    btnAtivo.setAttribute('aria-selected', 'true');
  }
}

// 👤 Preencher campo de usuário logado
function preencherUsuarioLogado() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  if (usuario?.nome) {
    const inputUsuario = document.getElementById('usuarioLogado');
    if (inputUsuario) inputUsuario.value = usuario.nome;

    const divUsuario = document.getElementById('usuario-logado');
    if (divUsuario) divUsuario.textContent = `👤 Olá, ${usuario.nome}`;
  }
}

// 🔧 Carregamento de dados dinâmicos
async function carregarPlacas() {
  const { data, error } = await supabaseClient.from('veiculos').select('placa');
  const lista = document.getElementById('listaPlacas');
  if (error) return console.error('Erro ao carregar placas:', error);
  lista.innerHTML = '';
  data?.forEach(v => v.placa && lista.appendChild(new Option(v.placa)));
}

async function carregarFiliais() {
  const { data, error } = await supabaseClient.from('filial').select('uf');
  const select = document.getElementById('filial');
  if (error) return console.error('Erro ao carregar filiais:', error);
  select.innerHTML = '<option value="">Selecione</option>';
  data?.forEach(f => select.appendChild(new Option(f.uf, f.uf)));
}

async function carregarTitulosManutencao() {
  const { data, error } = await supabaseClient.from('titulomanutencao').select('manutencao');
  const lista = document.getElementById('listaTitulos');
  if (error) return console.error('Erro ao carregar títulos:', error);
  lista.innerHTML = '';
  data?.forEach(item => item.manutencao && lista.appendChild(new Option(item.manutencao)));
}

async function carregarFornecedores() {
  const { data, error } = await supabaseClient.from('fornecedor').select('fornecedor');
  const lista = document.getElementById('listaFornecedores');
  if (error) return console.error('Erro ao carregar fornecedores:', error);
  lista.innerHTML = '';
  data?.forEach(f => f.fornecedor && lista.appendChild(new Option(f.fornecedor)));
}

async function carregarPecasServicos() {
  const { data, error } = await supabaseClient.from('pecaeservico').select('descricao');
  const lista = document.getElementById('listaPecasServicos');
  if (error) return console.error('Erro ao carregar peças/serviços:', error);
  lista.innerHTML = '';
  data?.forEach(item => item.descricao && lista.appendChild(new Option(item.descricao)));
}

// 📝 Carregar dados da manutenção para edição
async function carregarManutencaoParaEdicao(id) {
  try {
    // 1. Buscar dados principais da manutenção
    const { data: manutencao, error: manutencaoError } = await supabaseClient
      .from('manutencao')
      .select('*')
      .eq('id', id)
      .single();

    if (manutencaoError || !manutencao) {
      throw new Error('Manutenção não encontrada ou erro ao carregar.');
    }

    // 2. Preencher os campos do formulário
    document.getElementById('idManutencao').value = manutencao.id;
    document.getElementById('usuarioLogado').value = manutencao.usuario;
    document.getElementById('status').value = manutencao.status;
    document.getElementById('filial').value = manutencao.filial;
    document.getElementById('titulo').value = manutencao.titulo;
    document.getElementById('tipoManutencao').value = manutencao.tipo_manutencao || '';
    document.getElementById('data').value = manutencao.data ? manutencao.data.split('T')[0] : '';
    document.getElementById('veiculo').value = manutencao.veiculo;
    document.getElementById('km').value = manutencao.km;
    document.getElementById('motorista').value = manutencao.motorista;
    document.getElementById('fornecedor').value = manutencao.fornecedor;
    document.getElementById('notaFiscal').value = manutencao.notaFiscal;
    document.getElementById('notaServico').value = manutencao.notaServico;
    document.getElementById('numeroOS').value = manutencao.numeroOS;
    document.getElementById('descricao').value = manutencao.descricao;

    // 3. Buscar e preencher os itens da manutenção
    const { data: itens, error: itensError } = await supabaseClient.from('manutencao_itens').select('*').eq('id_manutencao', id);

    if (itensError) console.error('Erro ao carregar itens da manutenção:', itensError);
    else if (itens && itens.length > 0) {
      const tabelaItens = document.getElementById('tabelaItens');
      tabelaItens.innerHTML = ''; // Limpa a tabela antes de preencher
      itens.forEach(item => { const valorTotal = (item.quantidade || 0) * (item.valor || 0); const linha = document.createElement('tr'); linha.innerHTML = `<td>${item.quantidade}</td><td>${item.descricao}</td><td>R$ ${parseFloat(item.valor || 0).toFixed(2)}</td><td>R$ ${valorTotal.toFixed(2)}</td><td><button class="btn-remover-item">🗑️</button></td>`; tabelaItens.appendChild(linha); });
      atualizarTotal(); // Recalcula o total
    }

    // 4. Mudar o texto do botão para "Atualizar"
    document.getElementById('btnSalvarManutencao').textContent = '🔄 Atualizar Manutenção';
  } catch (error) { console.error('Erro ao carregar manutenção para edição:', error); alert('Não foi possível carregar os dados da manutenção. Você será redirecionado.'); window.location.href = 'buscar-manutencao.html'; }
}

// 🧰 Adicionar item à tabela
function adicionarItem() {
  const qtd = parseInt(document.getElementById('itemQuantidade').value);
  const desc = document.getElementById('itemDescricao').value.trim();
  const valorUnitario = parseFloat(document.getElementById('itemValor').value);
  if (!desc || isNaN(valorUnitario) || isNaN(qtd) || qtd <= 0) return;

  const valorTotal = qtd * valorUnitario;
  const linha = document.createElement('tr');
  linha.innerHTML = `
    <td>${qtd}</td>
    <td>${desc}</td>
    <td>R$ ${valorUnitario.toFixed(2)}</td>
    <td>R$ ${valorTotal.toFixed(2)}</td>
    <td><button class="btn-remover-item">🗑️</button></td>
  `;
  document.getElementById('tabelaItens').appendChild(linha);
  atualizarTotal();

  document.getElementById('itemQuantidade').value = '1';
  document.getElementById('itemDescricao').value = '';
  document.getElementById('itemValor').value = '';
}

function atualizarTotal() {
  let total = 0;
  document.querySelectorAll('#tabelaItens tr').forEach(row => {
    const valor = row.cells[3]?.textContent?.replace('R$', '').trim();
    if (valor) total += parseFloat(valor);
  });
  document.getElementById('totalItens').textContent = total.toFixed(2);
}

// 📎 Adicionar arquivo à tabela
function adicionarArquivo() {
  const input = document.getElementById('arquivoPDF');
  if (!input.files.length) return;

  const file = input.files[0];
  const linha = document.createElement('tr');
  linha.innerHTML = `
    <td>${file.name}</td>
    <td><button class="btn-remover-arquivo">🗑️</button></td>
  `;
  document.getElementById('tabelaArquivos').appendChild(linha);
  input.value = '';
}

// 💾 Salvar manutenção principal
async function salvarManutencao() {
  const idManutencao = document.getElementById('idManutencao').value;

  const dados = {
    usuario: document.getElementById('usuarioLogado').value,
    status: document.getElementById('status').value,
    filial: document.getElementById('filial').value,
    titulo: document.getElementById('titulo').value,
    data: document.getElementById('data').value,
    tipo_manutencao: document.getElementById('tipoManutencao').value,
    veiculo: document.getElementById('veiculo').value,
    km: parseInt(document.getElementById('km').value.replace(/\D/g, '')) || null,
    motorista: document.getElementById('motorista').value,
    fornecedor: document.getElementById('fornecedor').value,
    notaFiscal: document.getElementById('notaFiscal').value,
    notaServico: document.getElementById('notaServico').value,
    numeroOS: document.getElementById('numeroOS').value,
    descricao: document.getElementById('descricao').value
  };

  if (!dados.status || !dados.veiculo || !dados.data) {
    alert('⚠️ Preencha os campos obrigatórios: Status, Placa e Data.');
    return;
  }

  let resultado;
  if (idManutencao) {
    // Modo de atualização
    resultado = await supabaseClient.from('manutencao').update(dados).eq('id', idManutencao).select();
  } else {
    // Modo de inserção
    resultado = await supabaseClient.from('manutencao').insert([dados]).select();
  }

  const { data, error } = resultado;

  if (error) {
    console.error('Erro ao salvar manutenção:', error);
    alert(`❌ Erro ao ${idManutencao ? 'atualizar' : 'salvar'} manutenção.`);
    return;
  }

  const novoIdManutencao = data[0].id;
  document.getElementById('idManutencao').value = novoIdManutencao;

  // Se estiver atualizando, apaga os itens antigos para reinserir os novos
  if (idManutencao) {
    await supabaseClient.from('manutencao_itens').delete().eq('id_manutencao', idManutencao);
    await supabaseClient.from('manutencao_arquivos').delete().eq('id_manutencao', idManutencao);
  }

  await salvarItensManutencao(novoIdManutencao);
  await salvarArquivosManutencao(novoIdManutencao);

  alert(`✅ Manutenção ${idManutencao ? 'atualizada' : 'salva'} com sucesso! ID: ${novoIdManutencao}`);
}

// 💾 Salvar itens vinculados
async function salvarItensManutencao(idManutencao) {
  const linhas = document.querySelectorAll('#tabelaItens tr');
  const itens = [];

  linhas.forEach(row => {
    const qtd = parseInt(row.cells[0].textContent);
    const desc = row.cells[1].textContent;
    const valor = parseFloat(row.cells[2].textContent.replace('R$', '').trim());
    itens.push({ id_manutencao: idManutencao, descricao: desc, quantidade: qtd, valor });
  });

  if (itens.length) {
    const { error } = await supabaseClient.from('manutencao_itens').insert(itens);
    if (error) alert('❌ Erro ao salvar itens da manutenção.');
  }
}

// 💾 Salvar arquivos vinculados
async function salvarArquivosManutencao(idManutencao) {
  const linhas = document.querySelectorAll('#tabelaArquivos tr');
  const arquivos = [];

  linhas.forEach(row => {
    const nome = row.cells[0].textContent;
    arquivos.push({ id_manutencao: idManutencao, nome_arquivo: nome });
  });

  if (arquivos.length) {
    const { error } = await supabaseClient.from('manutencao_arquivos').insert(arquivos);
    if (error) alert('❌ Erro ao salvar arquivos.');
  }
}

// 🗂️ Modais
function abrirModalTitulo() { document.getElementById('modalTitulo').style.display = 'flex'; }
function fecharModalTitulo() { document.getElementById('modalTitulo').style.display = 'none'; }

async function salvarTitulo() {
  const titulo = document.getElementById('novoTitulo').value.trim();
  if (!titulo) return;

  const { error } = await supabaseClient.from('titulomanutencao').insert([{ manutencao: titulo }]);
  if (error) {
    console.error('Erro ao salvar título:', error);
    alert('❌ Erro ao salvar título.');
    return;
  }

  const lista = document.getElementById('listaTitulos');
  lista.appendChild(new Option(titulo));
  document.getElementById('titulo').value = titulo;
  document.getElementById('novoTitulo').value = '';
  alert('✅ Título cadastrado com sucesso!');
  fecharModalTitulo();
}

// 🗂️ Modal de Fornecedor
function abrirModalFornecedor() {
  document.getElementById('modalFornecedor').style.display = 'flex';
}

function fecharModalFornecedor() {
  document.getElementById('modalFornecedor').style.display = 'none';
}

async function salvarFornecedor() {
  const nome = document.getElementById('novoFornecedor').value.trim();
  const obsFornecedor = document.getElementById('obsFornecedor').value.trim();
  if (!nome) return;

  const { error } = await supabaseClient.from('fornecedor').insert([{ fornecedor: nome, obsFornecedor }]);
  if (error) {
    console.error('Erro ao salvar fornecedor:', error);
    alert('❌ Erro ao salvar fornecedor.');
    return;
  }

  const lista = document.getElementById('listaFornecedores');
  lista.appendChild(new Option(nome));
  document.getElementById('fornecedor').value = nome;
  document.getElementById('novoFornecedor').value = '';
  document.getElementById('obsFornecedor').value = '';
  alert('✅ Fornecedor cadastrado com sucesso!');
  fecharModalFornecedor();
}

// 🗂️ Modal de Peça/Serviço
function abrirModalPecaServico() {
  document.getElementById('modalPecaServico').style.display = 'flex';
}

function fecharModalPecaServico() {
  document.getElementById('modalPecaServico').style.display = 'none';
}

async function salvarPecaServico() {
  const descricao = document.getElementById('novaDescricao').value.trim();
  const tipo = document.getElementById('novoTipo').value;
  if (!descricao || !tipo) return;

  const { error } = await supabaseClient.from('pecaeservico').insert([{ descricao, tipo }]);
  if (error) {
    console.error('Erro ao salvar peça/serviço:', error);
    alert('❌ Erro ao salvar peça/serviço.');
    return;
  }

  const lista = document.getElementById('listaPecasServicos');
  lista.appendChild(new Option(descricao));
  document.getElementById('itemDescricao').value = descricao;
  document.getElementById('novaDescricao').value = '';
  document.getElementById('novoTipo').value = '';
  alert('✅ Peça/Serviço cadastrado com sucesso!');
  fecharModalPecaServico();
}

// 🚀 Inicialização da página
document.addEventListener('DOMContentLoaded', () => {
  preencherUsuarioLogado();
  carregarPlacas();
  carregarFiliais();
  carregarTitulosManutencao();
  carregarFornecedores();
  carregarPecasServicos();

  const params = new URLSearchParams(window.location.search);
  const idManutencao = params.get('id');

  if (idManutencao) {
    carregarManutencaoParaEdicao(idManutencao);
  }
  mostrarPainelInterno('cadastroInterno'); // Garante que a aba de cadastro seja exibida

  document.querySelectorAll('.painel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mostrarPainelInterno(btn.dataset.painel);
    });
  });

  document.getElementById('formItem').addEventListener('submit', e => {
    e.preventDefault();
    adicionarItem();
  });

  document.getElementById('tabelaItens').addEventListener('click', e => {
    if (e.target.classList.contains('btn-remover-item')) {
      e.target.closest('tr').remove();
      atualizarTotal();
    }
  });

  document.getElementById('formUpload').addEventListener('submit', e => {
    e.preventDefault();
    adicionarArquivo();
  });

  document.getElementById('tabelaArquivos').addEventListener('click', e => {
    if (e.target.classList.contains('btn-remover-arquivo')) {
      e.target.closest('tr').remove();
    }
  });

  document.getElementById('btnSalvarManutencao').addEventListener('click', () => {
    salvarManutencao();
  });
});

    document.querySelectorAll('.menu-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.parentElement.classList.toggle('active');
  });
});




// 🌐 Expor funções para uso no HTML
window.abrirModalTitulo = abrirModalTitulo;
window.fecharModalTitulo = fecharModalTitulo;
window.salvarTitulo = salvarTitulo;

window.abrirModalFornecedor = abrirModalFornecedor;
window.fecharModalFornecedor = fecharModalFornecedor;
window.salvarFornecedor = salvarFornecedor;

window.abrirModalPecaServico = abrirModalPecaServico;
window.fecharModalPecaServico = fecharModalPecaServico;
window.salvarPecaServico = salvarPecaServico;
