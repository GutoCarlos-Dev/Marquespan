// 📦 Importação do Supabase
import { supabase } from './supabase.js';

// 🔀 Alternância de painéis internos com animação e acessibilidade
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
  if (usuario && usuario.nome) {
    const campo = document.getElementById('usuarioLogado');
    const label = document.getElementById('usuario-logado');
    if (campo) campo.value = usuario.nome;
    if (label) label.textContent = `👤 Olá, ${usuario.nome}`;
  }
}

// 🚚 Buscar placas de veículos
async function carregarPlacas() {
  const { data, error } = await supabase.from('veiculos').select('placa');
  const lista = document.getElementById('listaPlacas');

  if (error) {
    console.error('Erro ao carregar placas:', error);
    return;
  }

  if (data && lista) {
    lista.innerHTML = '';
    data.forEach(v => {
      if (v.placa) {
        const opt = document.createElement('option');
        opt.value = v.placa;
        lista.appendChild(opt);
      }
    });
  }
}

// 🧾 Buscar filiais
async function carregarFiliais() {
  const { data, error } = await supabase.from('filial').select('uf');
  const select = document.getElementById('filial');

  if (error) {
    console.error('Erro ao carregar filiais:', error);
    return;
  }

  if (data && select) {
    select.innerHTML = '<option value="">Selecione</option>';
    data.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.uf;
      opt.textContent = f.uf;
      select.appendChild(opt);
    });
  }
}

// 📋 Buscar títulos de manutenção
async function carregarTitulosManutencao() {
  const { data, error } = await supabase.from('titulomanutencao').select('manutencao');
  const lista = document.getElementById('listaTitulos');

  if (error) {
    console.error('Erro ao carregar títulos:', error);
    return;
  }

  if (data && lista) {
    lista.innerHTML = '';
    data.forEach(item => {
      if (item.manutencao) {
        const opt = document.createElement('option');
        opt.value = item.manutencao;
        lista.appendChild(opt);
      }
    });
  }
}

// 🧾 Buscar fornecedores
async function carregarFornecedores() {
  const { data, error } = await supabase.from('fornecedor').select('fornecedor');
  const lista = document.getElementById('listaFornecedores');

  if (error) {
    console.error('Erro ao carregar fornecedores:', error);
    return;
  }

  if (data && lista) {
    lista.innerHTML = '';
    data.forEach(f => {
      if (f.fornecedor) {
        const opt = document.createElement('option');
        opt.value = f.fornecedor;
        lista.appendChild(opt);
      }
    });
  }
}

// 🧰 Adicionar item à manutenção
function adicionarItem() {
  const desc = document.getElementById('itemDescricao').value.trim();
  const valor = parseFloat(document.getElementById('itemValor').value);
  if (!desc || isNaN(valor)) return;

  const linha = document.createElement('tr');
  linha.innerHTML = `
    <td>${desc}</td>
    <td>R$ ${valor.toFixed(2)}</td>
    <td><button class="btn-remover-item">🗑️</button></td>
  `;
  document.getElementById('tabelaItens').appendChild(linha);
  atualizarTotal();
}

function atualizarTotal() {
  let total = 0;
  document.querySelectorAll('#tabelaItens tr').forEach(row => {
    const valor = parseFloat(row.children[1].textContent.replace('R$', '').trim());
    if (!isNaN(valor)) total += valor;
  });
  document.getElementById('totalItens').textContent = total.toFixed(2);
}

// 📎 Upload de arquivos PDF
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

// 🗂️ Modal de Título de Manutenção
function abrirModalTitulo() {
  document.getElementById('modalTitulo').style.display = 'flex';
}

function fecharModalTitulo() {
  document.getElementById('modalTitulo').style.display = 'none';
}

async function salvarTitulo() {
  const titulo = document.getElementById('novoTitulo').value.trim();
  if (!titulo) return;

  const { error } = await supabase.from('titulomanutencao').insert([{ manutencao: titulo }]);
  if (error) {
    console.error('Erro ao salvar título:', error);
    return;
  }

  const lista = document.getElementById('listaTitulos');
  const opt = document.createElement('option');
  opt.value = titulo;
  lista.appendChild(opt);

  document.getElementById('titulo').value = titulo;
  document.getElementById('novoTitulo').value = '';
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
  const obs = document.getElementById('obsFornecedor').value.trim();
  if (!nome) return;

  const { error } = await supabase.from('fornecedor').insert([{ fornecedor: nome, obs }]);
  if (error) {
    console.error('Erro ao salvar fornecedor:', error);
    return;
  }

  const lista = document.getElementById('listaFornecedores');
  const opt = document.createElement('option');
  opt.value = nome;
  lista.appendChild(opt);

  document.getElementById('fornecedor').value = nome;
  document.getElementById('novoFornecedor').value = '';
  document.getElementById('obsFornecedor').value = '';
  fecharModalFornecedor();
}

// 🚀 Inicialização da página
document.addEventListener('DOMContentLoaded', () => {
  preencherUsuarioLogado();
  carregarPlacas();
  carregarFiliais();
  carregarTitulosManutencao();
  carregarFornecedores();
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
});

// 🌐 Expor funções para uso no HTML
window.abrirModalTitulo = abrirModalTitulo;
window.fecharModalTitulo = fecharModalTitulo;
window.salvarTitulo = salvar
window.abrirModalFornecedor = abrirModalFornecedor;
window.fecharModalFornecedor = fecharModalFornecedor;
window.salvarFornecedor = salvarFornecedor;
