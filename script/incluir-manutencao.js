<<<<<<< HEAD
// 📦 Importação do Supabase
import { supabase } from './supabase.js';

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
    document.getElementById('usuarioLogado').value = usuario.nome;
    document.getElementById('usuario-logado').textContent = `👤 Olá, ${usuario.nome}`;
  }
}

// 🔧 Carregamento de dados dinâmicos
async function carregarPlacas() {
  const { data, error } = await supabase.from('veiculos').select('placa');
  const lista = document.getElementById('listaPlacas');
  if (error) return console.error('Erro ao carregar placas:', error);
  lista.innerHTML = '';
  data?.forEach(v => v.placa && lista.appendChild(new Option(v.placa)));
}

async function carregarFiliais() {
  const { data, error } = await supabase.from('filial').select('uf');
  const select = document.getElementById('filial');
  if (error) return console.error('Erro ao carregar filiais:', error);
  select.innerHTML = '<option value="">Selecione</option>';
  data?.forEach(f => select.appendChild(new Option(f.uf, f.uf)));
}

async function carregarTitulosManutencao() {
  const { data, error } = await supabase.from('titulomanutencao').select('manutencao');
  const lista = document.getElementById('listaTitulos');
  if (error) return console.error('Erro ao carregar títulos:', error);
  lista.innerHTML = '';
  data?.forEach(item => item.manutencao && lista.appendChild(new Option(item.manutencao)));
}

async function carregarFornecedores() {
  const { data, error } = await supabase.from('fornecedor').select('fornecedor');
  const lista = document.getElementById('listaFornecedores');
  if (error) return console.error('Erro ao carregar fornecedores:', error);
  lista.innerHTML = '';
  data?.forEach(f => f.fornecedor && lista.appendChild(new Option(f.fornecedor)));
}

async function carregarPecasServicos() {
  const { data, error } = await supabase.from('pecaeservico').select('descricao');
  const lista = document.getElementById('listaPecasServicos');
  if (error) return console.error('Erro ao carregar peças/serviços:', error);
  lista.innerHTML = '';
  data?.forEach(item => item.descricao && lista.appendChild(new Option(item.descricao)));
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

  document.getElementById('itemQuantidade').value = '';
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
  const dados = {
    usuario: document.getElementById('usuarioLogado').value,
    status: document.getElementById('status').value,
    filial: document.getElementById('filial').value,
    titulo: document.getElementById('titulo').value,
    data: document.getElementById('data').value,
    veiculo: document.getElementById('veiculo').value,
    km: document.getElementById('km').value,
    motorista: document.getElementById('motorista').value,
    fornecedor: document.getElementById('fornecedor').value,
    notaFiscal: document.getElementById('notaFiscal').value,
    notaServico: document.getElementById('notaServico').value,
    numeroOS: document.getElementById('numeroOS').value,
    descricao: document.getElementById('descricao').value
  };

  if (!dados.status || !dados.veiculo || !dados.data) {
    alert('⚠️ Preencha os campos obrigatórios.');
    return;
  }

  const { data, error } = await supabase.from('manutencao').insert([dados]).select();
  if (error) {
    console.error('Erro ao salvar manutenção:', error);
    alert('❌ Erro ao salvar manutenção.');
    return;
  }

  const idManutencao = data[0].id;
  document.getElementById('idManutencao').value = idManutencao;

  await salvarItensManutencao(idManutencao);
  await salvarArquivosManutencao(idManutencao);

  alert(`✅ Manutenção salva com sucesso! ID: ${idManutencao}`);
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
    const { error } = await supabase.from('manutencao_itens').insert(itens);
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
    const { error } = await supabase.from('manutencao_arquivos').insert(arquivos);
    if (error) alert('❌ Erro ao salvar arquivos.');
  }
}

// 🗂️ Modais
function abrirModalTitulo() { document.getElementById('modalTitulo').style.display = 'flex'; }
function fecharModalTitulo() { document.getElementById('modalTitulo').style.display = 'none'; }

async function salvarTitulo() {
  const titulo = document.getElementById('novoTitulo').value.trim();
  if (!titulo) return;

  const { error } = await supabase.from('titulomanutencao').insert([{ manutencao: titulo }]);
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

  const { error } = await supabase.from('fornecedor').insert([{ fornecedor: nome, obsFornecedor }]);
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

  const { error } = await supabase.from('pecaeservico').insert([{ descricao, tipo }]);
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
  mostrarPainelInterno('cadastroInterno');

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
=======
// 📦 Importação do Supabase
import { supabase } from './supabase.js';

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
    document.getElementById('usuarioLogado').value = usuario.nome;
    document.getElementById('usuario-logado').textContent = `👤 Olá, ${usuario.nome}`;
  }
}

// 🔧 Carregamento de dados dinâmicos
async function carregarPlacas() {
  const { data, error } = await supabase.from('veiculos').select('placa');
  const lista = document.getElementById('listaPlacas');
  if (error) return console.error('Erro ao carregar placas:', error);
  lista.innerHTML = '';
  data?.forEach(v => v.placa && lista.appendChild(new Option(v.placa)));
}

async function carregarFiliais() {
  const { data, error } = await supabase.from('filial').select('uf');
  const select = document.getElementById('filial');
  if (error) return console.error('Erro ao carregar filiais:', error);
  select.innerHTML = '<option value="">Selecione</option>';
  data?.forEach(f => select.appendChild(new Option(f.uf, f.uf)));
}

async function carregarTitulosManutencao() {
  const { data, error } = await supabase.from('titulomanutencao').select('manutencao');
  const lista = document.getElementById('listaTitulos');
  if (error) return console.error('Erro ao carregar títulos:', error);
  lista.innerHTML = '';
  data?.forEach(item => item.manutencao && lista.appendChild(new Option(item.manutencao)));
}

async function carregarFornecedores() {
  const { data, error } = await supabase.from('fornecedor').select('fornecedor');
  const lista = document.getElementById('listaFornecedores');
  if (error) return console.error('Erro ao carregar fornecedores:', error);
  lista.innerHTML = '';
  data?.forEach(f => f.fornecedor && lista.appendChild(new Option(f.fornecedor)));
}

async function carregarPecasServicos() {
  const { data, error } = await supabase.from('pecaeservico').select('descricao');
  const lista = document.getElementById('listaPecasServicos');
  if (error) return console.error('Erro ao carregar peças/serviços:', error);
  lista.innerHTML = '';
  data?.forEach(item => item.descricao && lista.appendChild(new Option(item.descricao)));
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

  document.getElementById('itemQuantidade').value = '';
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
  const dados = {
    usuario: document.getElementById('usuarioLogado').value,
    status: document.getElementById('status').value,
    filial: document.getElementById('filial').value,
    titulo: document.getElementById('titulo').value,
    data: document.getElementById('data').value,
    veiculo: document.getElementById('veiculo').value,
    km: document.getElementById('km').value,
    motorista: document.getElementById('motorista').value,
    fornecedor: document.getElementById('fornecedor').value,
    notaFiscal: document.getElementById('notaFiscal').value,
    notaServico: document.getElementById('notaServico').value,
    numeroOS: document.getElementById('numeroOS').value,
    descricao: document.getElementById('descricao').value
  };

  if (!dados.status || !dados.veiculo || !dados.data) {
    alert('⚠️ Preencha os campos obrigatórios.');
    return;
  }

  const { data, error } = await supabase.from('manutencao').insert([dados]).select();
  if (error) {
    console.error('Erro ao salvar manutenção:', error);
    alert('❌ Erro ao salvar manutenção.');
    return;
  }

  const idManutencao = data[0].id;
  document.getElementById('idManutencao').value = idManutencao;

  await salvarItensManutencao(idManutencao);
  await salvarArquivosManutencao(idManutencao);

  alert(`✅ Manutenção salva com sucesso! ID: ${idManutencao}`);
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
    const { error } = await supabase.from('manutencao_itens').insert(itens);
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
    const { error } = await supabase.from('manutencao_arquivos').insert(arquivos);
    if (error) alert('❌ Erro ao salvar arquivos.');
  }
}

// 🗂️ Modais
function abrirModalTitulo() { document.getElementById('modalTitulo').style.display = 'flex'; }
function fecharModalTitulo() { document.getElementById('modalTitulo').style.display = 'none'; }

async function salvarTitulo() {
  const titulo = document.getElementById('novoTitulo').value.trim();
  if (!titulo) return;

  const { error } = await supabase.from('titulomanutencao').insert([{ manutencao: titulo }]);
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

  const { error } = await supabase.from('fornecedor').insert([{ fornecedor: nome, obsFornecedor }]);
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

  const { error } = await supabase.from('pecaeservico').insert([{ descricao, tipo }]);
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
  mostrarPainelInterno('cadastroInterno');

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
>>>>>>> 10558e27b8270be434cb5b3e3a21a0e039cc7ab9
