// 📦 Importação do Supabase
import { supabase } from './supabase.js';

// 📂 Array para armazenar os arquivos selecionados para upload
let arquivosParaUpload = [];

//  Alternância de painéis internos
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
  const desc = document.getElementById('itemDescricao').value.trim().toUpperCase();
  const valorUnitario = parseFloat(document.getElementById('itemValor').value);
  if (!desc || isNaN(valorUnitario) || isNaN(qtd) || qtd <= 0) {
    alert('⚠️ Preencha Quantidade, Descrição e Valor do item corretamente.');
    return;
  }

  // ✨ VERIFICA SE O ITEM JÁ EXISTE NA TABELA
  const itensExistentes = document.querySelectorAll('#tabelaItens tr');
  for (const linha of itensExistentes) {
    if (linha.cells[1].textContent.toUpperCase() === desc) {
      alert(`❌ O item "${desc}" já foi adicionado.`);
      return;
    }
  }
  
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

  document.getElementById('itemQuantidade').value = '0';
  document.getElementById('itemDescricao').value = '';
  document.getElementById('itemValor').value = '0';
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
  
  // Adiciona o arquivo ao nosso array de controle
  arquivosParaUpload.push(file);
  const fileIndex = arquivosParaUpload.length - 1;

  const linha = document.createElement('tr');
  // Adicionamos um data-index para saber qual arquivo remover do array
  linha.dataset.index = fileIndex;
  linha.innerHTML = `
    <td>${file.name}</td>
    <td><button class="btn-remover-arquivo">🗑️</button></td>
  `;
  document.getElementById('tabelaArquivos').appendChild(linha);
  input.value = ''; // Limpa o input para poder adicionar outro arquivo
}

// 💾 Salvar manutenção principal
async function salvarManutencao() {
  // Validações iniciais
  const status = document.getElementById('status').value;
  const veiculo = document.getElementById('veiculo').value;
  const dataManutencao = document.getElementById('data').value;

  if (!status || !veiculo || !dataManutencao) {
    alert('⚠️ Preencha os campos obrigatórios: Status, Placa e Data.');
    return;
  }

  const dados = {
    usuario: document.getElementById('usuarioLogado').value,
    status: status,
    filial: document.getElementById('filial').value,
    titulo: document.getElementById('titulo').value,
    data: dataManutencao,
    veiculo: veiculo,
    km: document.getElementById('km').value,
    motorista: document.getElementById('motorista').value,
    fornecedor: document.getElementById('fornecedor').value,
    notaFiscal: document.getElementById('notaFiscal').value,
    notaServico: document.getElementById('notaServico').value,
    numeroOS: document.getElementById('numeroOS').value,
    descricao: document.getElementById('descricao').value
  };

  const { data, error } = await supabase.from('manutencao').insert([dados]).select();
  if (error) {
    console.error('Erro ao salvar manutenção:', error);
    alert('❌ Erro ao salvar manutenção.');
    return;
  }

  const idManutencao = data[0].id;
  document.getElementById('idManutencao').value = idManutencao;

  // ✨ Salva itens e verifica o resultado
  const sucessoItens = await salvarItensManutencao(idManutencao);
  // 🔴 CORREÇÃO: Garante que a execução pare se o salvamento de itens falhar.
  if (sucessoItens === false) return;

  // ✨ Salva arquivos e verifica o resultado
  const sucessoArquivos = await salvarArquivosManutencao(idManutencao);
  // 🔴 CORREÇÃO: Garante que a execução pare se o salvamento de arquivos falhar.
  if (sucessoArquivos === false) return;
  
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
    // ✅ Corrigido para usar o nome da coluna do banco de dados: 'id_manutencao'
    itens.push({ 
      id_manutencao: idManutencao, 
      descricao: desc, quantidade: qtd, valor 
    });
  });

  if (itens.length) {
    // 🕵️‍♂️ DIAGNÓSTICO: Mostra no console os dados que serão enviados.
    // Pressione F12 no navegador para ver o console.
    console.log('Enviando os seguintes itens para o Supabase:', JSON.stringify(itens, null, 2));

    const { error } = await supabase.from('manutencao_itens').insert(itens);
    if (error) {
      console.error('Erro ao salvar itens da manutenção:', error);
      alert(`❌ Erro ao salvar itens da manutenção. Causa: ${error.message}`);
      return false; // 🔴 Indica falha
    }
  }
  return true; // ✅ Indica sucesso
}

// 💾 Salvar arquivos vinculados
async function salvarArquivosManutencao(idManutencao) { // Adicionado async
  if (arquivosParaUpload.length === 0) {
    return true; // Nenhum arquivo para enviar, sucesso.
  }

  const arquivosParaSalvarNoDB = [];

  for (const file of arquivosParaUpload) {
    // Cria um caminho único para o arquivo para evitar conflitos de nome
    const filePath = `public/${idManutencao}/${Date.now()}-${file.name}`;

    // Faz o upload do arquivo para o Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('manutencao_arquivos') // Nome do bucket
      .upload(filePath, file);

    if (uploadError) {
      console.error('Erro no upload do arquivo:', uploadError);
      alert(`❌ Erro ao fazer upload do arquivo "${file.name}".`);
      return false; // 🔴 Indica falha
    }

    // Adiciona o caminho do arquivo para ser salvo no banco de dados
    arquivosParaSalvarNoDB.push({
      id_manutencao: idManutencao,
      nome_arquivo: filePath // Salvamos o caminho completo do arquivo
    });
  }

  // Insere todos os registros de arquivos no banco de dados de uma vez
  if (arquivosParaSalvarNoDB.length > 0) {
    const { error: dbError } = await supabase.from('manutencao_arquivos').insert(arquivosParaSalvarNoDB);
    if (dbError) {
      console.error('Erro ao salvar arquivos no banco de dados:', dbError);
      alert(`❌ Erro ao salvar referência dos arquivos no banco. Causa: ${dbError.message}`);
      return false; // 🔴 Indica falha
    }
  }
  return true; // ✅ Indica sucesso
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
      const linha = e.target.closest('tr');
      const indexParaRemover = parseInt(linha.dataset.index, 10);
      
      // Remove o arquivo do array usando o índice
      arquivosParaUpload.splice(indexParaRemover, 1);
      linha.remove();
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
