import { supabase } from './supabase.js';

let gridBody;

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  gridBody = document.getElementById('grid-manutencao-body');
  const btnIncluir = document.getElementById('btn-incluir');
  const btnBuscar = document.getElementById('btn-buscar');

  document.querySelectorAll('.menu-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.parentElement.classList.toggle('active');
    });
  });

  // ➕ Incluir manutenção
  btnIncluir?.addEventListener('click', () => {
    // Abrir modal ou página para incluir manutenção de pneu
    alert('Funcionalidade de incluir manutenção de pneu ainda não implementada.');
  });

  // 🔍 Buscar manutenções
  btnBuscar?.addEventListener('click', () => {
    // Implementar busca
    alert('Funcionalidade de buscar manutenção de pneu ainda não implementada.');
  });

  // 🚚 Carrega manutenções ao iniciar
  carregarManutencoesPneu();
});

// 📦 Carregar manutenções de pneus
async function carregarManutencoesPneu() {
  if (!gridBody) return;

  const { data, error } = await supabase
    .from('manutencoes_pneus')
    .select('*')
    .order('data', { ascending: false });

  if (error) {
    console.error('Erro ao carregar manutenções de pneus:', error);
    gridBody.innerHTML = '<div class="grid-row">Erro ao carregar dados.</div>';
    return;
  }

  renderizarManutencoes(data);
}

// 🧱 Renderiza as manutenções na grid
function renderizarManutencoes(lista) {
  gridBody.innerHTML = '';

  lista.forEach(manutencao => {
    const row = document.createElement('div');
    row.classList.add('grid-row');

    row.innerHTML = `
      <div>${formatarData(manutencao.data)}</div>
      <div>${manutencao.pneu}</div>
      <div>${manutencao.tipo_manutencao}</div>
      <div>${manutencao.descricao}</div>
      <div class="acoes">
        <button class="btn-acao editar" onclick="editarManutencaoPneu('${manutencao.id}')">
          <i class="fas fa-pen"></i> Editar
        </button>
        <button class="btn-acao excluir" onclick="excluirManutencaoPneu('${manutencao.id}')">
          <i class="fas fa-trash"></i> Excluir
        </button>
      </div>
    `;

    gridBody.appendChild(row);
  });
}

function formatarData(data) {
  if (!data) return '';
  const d = new Date(data);
  return d.toLocaleDateString('pt-BR');
}

// ✏️ Editar manutenção
window.editarManutencaoPneu = async function (id) {
  alert('Editar manutenção de pneu ainda não implementado.');
};

// 🗑️ Excluir manutenção
window.excluirManutencaoPneu = async function (id) {
  const confirmar = confirm("Tem certeza que deseja excluir esta manutenção?");
  if (!confirmar) return;

  const { error } = await supabase
    .from('manutencoes_pneus')
    .delete()
    .eq('id', id);

  if (error) {
    console.error("Erro ao excluir manutenção:", error);
    alert("❌ Erro ao excluir. Tente novamente.");
  } else {
    alert("✅ Manutenção excluída com sucesso!");
    carregarManutencoesPneu();
  }
};
