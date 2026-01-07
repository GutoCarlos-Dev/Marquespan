import { supabaseClient } from './supabase.js';

let gridBody;

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  gridBody = document.getElementById('grid-veiculos-body');
  const btnBuscar = document.getElementById('btn-buscar');
  const btnNovoVeiculo = document.getElementById('btn-novo-veiculo');

  // 🔍 Buscar veículos
  btnBuscar?.addEventListener('click', () => {
    buscarVeiculos();
  });

  // ➕ Abrir modal de cadastro
  btnNovoVeiculo?.addEventListener('click', () => {
    abrirCadastroVeiculo();
  });

  // 🚚 Carrega veículos ao iniciar
  carregarVeiculos();
});

// 🔄 Expõe a função de atualização para a janela filha (cadastro-veiculo.html)
window.refreshGrid = function() {
  console.log('Grid de veículos será atualizada...');
  carregarVeiculos();
};

// ➕ Abre a janela para um novo cadastro
function abrirCadastroVeiculo() {
  const largura = 900;
  const altura = 700;
  const esquerda = (window.screen.width - largura) / 2;
  const topo = (window.screen.height - altura) / 2;

  window.open(
    'cadastro-veiculo.html',
    'CadastroVeiculo',
    `width=${largura},height=${altura},left=${esquerda},top=${topo},resizable=yes,scrollbars=yes`
  );
}


// 📦 Carregar todos os veículos
async function carregarVeiculos() {
  if (!gridBody) return;
  gridBody.innerHTML = '<div class="grid-row-loading">Carregando veículos...</div>';

  const { data, error } = await supabaseClient
    .from('veiculos')
    .select('*')
    .order('placa', { ascending: true });

  if (error) {
    console.error('Erro ao carregar veículos:', error);
    gridBody.innerHTML = '<div class="grid-row-error">Erro ao carregar dados.</div>';
    return;
  }

  renderizarVeiculos(data);
}


// 🔍 Buscar veículos por placa
async function buscarVeiculos() {
  if (!gridBody) return;
  gridBody.innerHTML = '<div class="grid-row-loading">Buscando...</div>';

  const placa = document.getElementById('campo-placa')?.value.trim().toUpperCase();
  let query = supabaseClient.from('veiculos').select('*').order('placa', { ascending: true });

  if (placa) {
    query = query.ilike('placa', `%${placa}%`);
  } else {
    // Se a busca for vazia, carrega todos, sem confirmação.
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar veículos:', error);
    gridBody.innerHTML = '<div class="grid-row-error">Erro ao buscar dados.</div>';
    return;
  }

  if (data.length === 0) {
    gridBody.innerHTML = '<div class="grid-row-empty">Nenhum veículo encontrado.</div>';
    return;
  }

  renderizarVeiculos(data);
}


// 🧱 Renderiza os veículos na grid
function renderizarVeiculos(lista) {
  gridBody.innerHTML = '';

  if (!lista || lista.length === 0) {
    gridBody.innerHTML = '<div class="grid-row-empty">Nenhum veículo cadastrado.</div>';
    return;
  }

  lista.forEach(veiculo => {
    const row = document.createElement('div');
    row.classList.add('grid-row');

    row.innerHTML = `
  <div>${veiculo.filial || '-'}</div>
  <div>${veiculo.placa}</div>
  <div>${veiculo.modelo || '-'}</div>
  <div>${veiculo.renavan || '-'}</div>
  <div>${veiculo.tipo || '-'}</div>
  <div>${veiculo.situacao || '-'}</div>
  <div>${veiculo.qrcode || '-'}</div>

  <div class="acoes">
    <button class="btn-acao editar" onclick="editarVeiculo('${veiculo.id}')" title="Editar">
      <i class="fas fa-pen"></i>
    </button>
    <button class="btn-acao excluir" onclick="excluirVeiculo('${veiculo.id}')" title="Excluir">
      <i class="fas fa-trash"></i>
    </button>
  </div>
`;

    gridBody.appendChild(row);
  });
}


// ✏️ Editar veículo
window.editarVeiculo = function (id) {
  if (!id) return;

  const largura = 900;
  const altura = 700;
  const esquerda = (window.screen.width - largura) / 2;
  const topo = (window.screen.height - altura) / 2;

  // Passa apenas o ID, que é o que a página de cadastro espera
  window.open(
    `cadastro-veiculo.html?id=${id}`,
    'EditarVeiculo',
    `width=${largura},height=${altura},left=${esquerda},top=${top},resizable=yes,scrollbars=yes`
  );
};

// 🗑️ Excluir veículo
window.excluirVeiculo = async function (id) {
  const confirmar = confirm("Tem certeza que deseja excluir este veículo?");
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from('veiculos')
    .delete()
    .eq('id', id);

  if (error) {
    console.error("Erro ao excluir veículo:", error);
    alert("❌ Erro ao excluir. Tente novamente.");
  } else {
    alert("✅ Veículo excluído com sucesso!");
    carregarVeiculos(); // Atualiza a grid
  }
};
