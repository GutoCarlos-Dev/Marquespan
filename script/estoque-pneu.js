import { supabase } from './supabase.js';

let gridBody;

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  gridBody = document.getElementById('grid-pneus-body');
  const btnBuscar = document.getElementById('btn-buscar');

  document.querySelectorAll('.menu-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.parentElement.classList.toggle('active');
    });
  });

  // 🔍 Buscar pneus
  btnBuscar?.addEventListener('click', () => {
    buscarPneus();
  });

  // 🚚 Carrega pneus ao iniciar
  carregarPneus();
});

// 📦 Carregar todos os pneus
async function carregarPneus() {
  if (!gridBody) return;

  const { data, error } = await supabase
    .from('pneus')
    .select('*')
    .order('marca', { ascending: true });

  if (error) {
    console.error('Erro ao carregar pneus:', error);
    gridBody.innerHTML = '<div class="grid-row">Erro ao carregar dados.</div>';
    return;
  }

  renderizarPneus(data);
}

// 🔍 Buscar pneus por marca ou modelo
async function buscarPneus() {
  if (!gridBody) return;

  const marca = document.getElementById('campo-marca')?.value.trim().toUpperCase();
  const modelo = document.getElementById('campo-modelo')?.value.trim().toUpperCase();
  let query = supabase.from('pneus').select('*');

  if (marca) {
    query = query.ilike('marca', `%${marca}%`);
  }
  if (modelo) {
    query = query.ilike('modelo', `%${modelo}%`);
  }
  if (!marca && !modelo) {
    const confirmar = confirm("⚠️ Nenhum filtro foi preenchido.\nDeseja buscar todos os pneus?");
    if (!confirmar) return;
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar pneus:', error);
    gridBody.innerHTML = '<div class="grid-row">Erro ao buscar dados.</div>';
    return;
  }

  if (data.length === 0) {
    gridBody.innerHTML = '<div class="grid-row">Nenhum pneu encontrado.</div>';
    return;
  }

  renderizarPneus(data);
}

// 🧱 Renderiza os pneus na grid
function renderizarPneus(lista) {
  gridBody.innerHTML = '';

  lista.forEach(pneu => {
    const row = document.createElement('div');
    row.classList.add('grid-row');

    row.innerHTML = `
      <div>${pneu.marca}</div>
      <div>${pneu.modelo}</div>
      <div>${pneu.tamanho}</div>
      <div>${pneu.tipo}</div>
      <div>${pneu.quantidade}</div>
      <div class="acoes">
        <button class="btn-acao editar" onclick="editarPneu('${pneu.id}')">
          <i class="fas fa-pen"></i> Editar
        </button>
        <button class="btn-acao excluir" onclick="excluirPneu('${pneu.id}')">
          <i class="fas fa-trash"></i> Excluir
        </button>
      </div>
    `;

    gridBody.appendChild(row);
  });
}

// ✏️ Editar pneu
window.editarPneu = async function (id) {
  const { data, error } = await supabase
    .from('pneus')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    alert('❌ Pneu não encontrado.');
    return;
  }

  const largura = 900;
  const altura = 700;
  const esquerda = (window.screen.width - largura) / 2;
  const topo = (window.screen.height - altura) / 2;

  const params = new URLSearchParams(data).toString();

  window.open(
    `cadastro-pneu.html?${params}`,
    'EditarPneu',
    `width=${largura},height=${altura},left=${esquerda},top=${top},resizable=yes,scrollbars=yes`
  );
};

// 🗑️ Excluir pneu
window.excluirPneu = async function (id) {
  const confirmar = confirm("Tem certeza que deseja excluir este pneu?");
  if (!confirmar) return;

  const { error } = await supabase
    .from('pneus')
    .delete()
    .eq('id', id);

  if (error) {
    console.error("Erro ao excluir pneu:", error);
    alert("❌ Erro ao excluir. Tente novamente.");
  } else {
    alert("✅ Pneu excluído com sucesso!");
    carregarPneus();
  }
};
