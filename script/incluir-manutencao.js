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

// 🚚 Buscar placas de veículos no Supabase
async function carregarPlacas() {
  const { data, error } = await supabase.from('veiculos').select('placa');
  const select = document.getElementById('veiculo');
  if (data && select) {
    data.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.placa;
      opt.textContent = v.placa;
      select.appendChild(opt);
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

 // carregar UF do Banco de dados

async function carregarFiliais() {
  const { data, error } = await supabase.from('filial').select('uf');
  const select = document.getElementById('filial');

  if (error) {
    console.error('Erro ao carregar filiais:', error);
    return;
  }

  if (data && select) {
    select.innerHTML = '<option value="">Selecione</option>'; // limpa opções antigas
    data.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.uf;
      opt.textContent = f.uf;
      select.appendChild(opt);
    });
  }
}

// 📋 Carregar títulos de manutenção do Supabase
async function carregarTitulosManutencao() {
  const { data, error } = await supabase
    .from('titulomanutencao')
    .select('manutencao');

  const lista = document.getElementById('listaTitulos');

  if (error) {
    console.error('Erro ao carregar títulos de manutenção:', error);
    return;
  }

  if (data && lista) {
    lista.innerHTML = ''; // limpa sugestões antigas

    data.forEach(item => {
      if (item.manutencao) {
        const opt = document.createElement('option');
        opt.value = item.manutencao;
        lista.appendChild(opt);
      }
    });
  }
}




// 🚀 Inicialização da página
document.addEventListener('DOMContentLoaded', () => {
  preencherUsuarioLogado();
  carregarPlacas();
  carregarFiliais(); // ✅ função para preencher o campo Filial
  carregarTitulosManutencao(); // ✅ função para preencher o campo Titulo de Manutenção
  mostrarPainelInterno('cadastroInterno');

  // 🧭 Alternância de abas internas
  document.querySelectorAll('.painel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mostrarPainelInterno(btn.dataset.painel);
    });
  });

  // ➕ Adicionar item
  document.getElementById('formItem').addEventListener('submit', e => {
    e.preventDefault();
    adicionarItem();
  });

  // 🗑️ Remover item
  document.getElementById('tabelaItens').addEventListener('click', e => {
    if (e.target.classList.contains('btn-remover-item')) {
      e.target.closest('tr').remove();
      atualizarTotal();
    }
  });

  // 📎 Adicionar arquivo
  document.getElementById('formUpload').addEventListener('submit', e => {
    e.preventDefault();
    adicionarArquivo();
  });

  // 🗑️ Remover arquivo
  document.getElementById('tabelaArquivos').addEventListener('click', e => {
    if (e.target.classList.contains('btn-remover-arquivo')) {
      e.target.closest('tr').remove();
    }
  });
});

