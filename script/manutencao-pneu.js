import { supabase } from './supabase.js';

let gridBody;
let gridCarrinhoBody;
let carrinho = [];

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  gridBody = document.getElementById('grid-pneus-body');
  gridCarrinhoBody = document.getElementById('grid-carrinho-body');
  const btnBuscar = document.getElementById('btn-buscar');
  const btnAdicionarCarrinho = document.getElementById('btn-adicionar-carrinho');
  const btnAplicarMovimentacoes = document.getElementById('btn-aplicar-movimentacoes');

  // Menu toggle
  document.querySelectorAll('.menu-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.parentElement.classList.toggle('active');
    });
  });

  // Buscar pneus
  btnBuscar?.addEventListener('click', () => {
    buscarPneus();
  });

  // Adicionar ao carrinho
  btnAdicionarCarrinho?.addEventListener('click', adicionarAoCarrinho);

  // Aplicar movimentações
  btnAplicarMovimentacoes?.addEventListener('click', aplicarMovimentacoes);

  // Load pneus
  carregarPneus();
});

// 📦 Carregar pneus
async function carregarPneus() {
  if (!gridBody) return;

  const { data, error } = await supabase.from('pneus').select('*').order('marca', { ascending: true });

  if (error) {
    console.error('Erro ao carregar pneus:', error);
    gridBody.innerHTML = '<div class="grid-row">Erro ao carregar dados.</div>';
    return;
  }

  renderizarPneus(data || []);
}

// 🔍 Buscar pneus
async function buscarPneus() {
  const marca = document.getElementById('campo-marca')?.value.trim().toUpperCase();
  const modelo = document.getElementById('campo-modelo')?.value.trim().toUpperCase();
  let query = supabase.from('pneus').select('*');

  if (marca) query = query.ilike('marca', `%${marca}%`);
  if (modelo) query = query.ilike('modelo', `%${modelo}%`);

  if (!marca && !modelo) {
    carregarPneus();
    return;
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar:', error);
    gridBody.innerHTML = '<div class="grid-row">Erro ao buscar.</div>';
    return;
  }

  renderizarPneus(data || []);
}

// 🧱 Renderizar grid de pneus
function renderizarPneus(lista) {
  gridBody.innerHTML = '';

  if (lista.length === 0) {
    gridBody.innerHTML = '<div class="grid-row">Nenhum pneu encontrado.</div>';
    return;
  }

  lista.forEach(pneu => {
    const row = document.createElement('div');
    row.classList.add('grid-row');

    row.innerHTML = `
      <div><input type="checkbox" class="select-pneu" data-id="${pneu.id}"></div>
      <div>${pneu.marca}</div>
      <div>${pneu.modelo}</div>
      <div>${pneu.tamanho || ''}</div>
      <div>${pneu.tipo}</div>
      <div>${pneu.quantidade || 0}</div>
      <div>
        <select class="status-pneu" data-id="${pneu.id}">
          <option value="entrada">Entrada</option>
          <option value="saida">Saída</option>
        </select>
      </div>
      <div><input type="number" class="qtd-mov-pneu" data-id="${pneu.id}" min="1" value="1"></div>
    `;

    gridBody.appendChild(row);
  });
}

// 🛒 Adicionar ao carrinho
function adicionarAoCarrinho() {
  const selected = document.querySelectorAll('.select-pneu:checked');
  selected.forEach(checkbox => {
    const id = checkbox.dataset.id;
    const status = document.querySelector(`.status-pneu[data-id="${id}"]`).value;
    const qtd = parseInt(document.querySelector(`.qtd-mov-pneu[data-id="${id}"]`).value) || 1;

    // Find pneu data
    const rows = gridBody.querySelectorAll('.grid-row');
    let pneuData = null;
    rows.forEach(row => {
      const checkboxInRow = row.querySelector('.select-pneu');
      if (checkboxInRow && checkboxInRow.dataset.id === id) {
        const cells = row.querySelectorAll('div');
        pneuData = {
          id,
          marca: cells[1].textContent,
          modelo: cells[2].textContent,
          status,
          quantidade: qtd
        };
      }
    });

    if (pneuData) {
      carrinho.push(pneuData);
    }
  });

  renderizarCarrinho();
  // Uncheck selected
  selected.forEach(cb => cb.checked = false);
}

// 🧱 Renderizar carrinho
function renderizarCarrinho() {
  gridCarrinhoBody.innerHTML = '';

  if (carrinho.length === 0) {
    gridCarrinhoBody.innerHTML = '<div class="grid-row">Carrinho vazio.</div>';
    return;
  }

  carrinho.forEach((item, index) => {
    const row = document.createElement('div');
    row.classList.add('grid-row');

    row.innerHTML = `
      <div>${item.marca}</div>
      <div>${item.modelo}</div>
      <div>${item.status === 'entrada' ? 'Entrada' : 'Saída'}</div>
      <div>${item.quantidade}</div>
      <div class="acoes">
        <button class="btn-acao excluir" onclick="removerDoCarrinho(${index})">
          <i class="fas fa-trash"></i> Remover
        </button>
      </div>
    `;

    gridCarrinhoBody.appendChild(row);
  });
}

// 🗑️ Remover do carrinho
window.removerDoCarrinho = function(index) {
  carrinho.splice(index, 1);
  renderizarCarrinho();
};

// ✅ Aplicar movimentações
async function aplicarMovimentacoes() {
  if (carrinho.length === 0) {
    alert('Carrinho vazio.');
    return;
  }

  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  if (!usuario || !usuario.id) {
    alert('Usuário não logado.');
    return;
  }

  try {
    for (const item of carrinho) {
      // Update quantidade
      const { data: pneuAtual } = await supabase.from('pneus').select('quantidade').eq('id', item.id).single();
      if (!pneuAtual) continue;

      let novaQtd = pneuAtual.quantidade;
      if (item.status === 'entrada') {
        novaQtd += item.quantidade;
      } else {
        novaQtd -= item.quantidade;
        if (novaQtd < 0) {
          alert(`Quantidade insuficiente para ${item.marca} ${item.modelo}.`);
          return;
        }
      }

      await supabase.from('pneus').update({ quantidade: novaQtd }).eq('id', item.id);

      // Insert movimento (if table exists)
      try {
        await supabase.from('movimentacoes_pneus').insert([{
          pneu_id: item.id,
          tipo: item.status,
          quantidade: item.quantidade,
          usuario_id: usuario.id
        }]);
      } catch (logError) {
        console.warn('Tabela movimentacoes_pneus não existe ou erro no log:', logError);
      }
    }

    alert('Movimentações aplicadas com sucesso!');
    carrinho = [];
    renderizarCarrinho();
    carregarPneus(); // Reload stock
  } catch (error) {
    console.error('Erro ao aplicar movimentações:', error);
    alert('Erro ao aplicar movimentações.');
  }
}
