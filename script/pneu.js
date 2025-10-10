let gridBody;
let editMode = false;
let editingId = null;

// Helper functions for localStorage
function getPneus() {
  return JSON.parse(localStorage.getItem('pneus')) || [];
}

function savePneus(pneus) {
  localStorage.setItem('pneus', JSON.stringify(pneus));
}

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', () => {
  gridBody = document.getElementById('grid-pneus-body');
  const form = document.getElementById('formPneu');
  const btnBuscar = document.getElementById('btn-buscar');

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

  // Form submit
  form.addEventListener('submit', handleSubmit);

  // Initialize selects
  initializeSelects();

  // Load pneus
  carregarPneus();
});

// Initialize selects with predefined options
function initializeSelects() {
  const selectMarca = document.getElementById('marca');
  const selectModelo = document.getElementById('modelo');
  const selectTipo = document.getElementById('tipo');

  // Predefined options
  const marcas = ['BRIDGESTONE', 'CONTINENTAL', 'GOODYEAR', 'MICHELIN', 'PIRELLI'];
  const modelos = ['225/75/16', '235/75/17.5', '275/80/22.5 - LISO', '275/80/22.5 - BORRACHUDO', '295/80/22.5 - LISO', '295/80/22.5 - BORRACHUDO'];
  const tipos = ['NOVO', 'RECAPADO'];

  // Update marca options
  selectMarca.innerHTML = '<option value="">Selecione</option>' + marcas.map(m => `<option value="${m}">${m}</option>`).join('');

  // Similar for others
  selectModelo.innerHTML = '<option value="">Selecione</option>' + modelos.map(m => `<option value="${m}">${m}</option>`).join('');
  selectTipo.innerHTML = '<option value="">Selecione</option>' + tipos.map(t => `<option value="${t}">${t}</option>`).join('');
}



function getCurrentUserName() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  return usuario ? usuario.nome : 'Usuário Anônimo';
}

// Handle form submit
function handleSubmit(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const pneu = {
    data: new Date().toISOString(),
    marca: formData.get('marca'),
    modelo: formData.get('modelo'),
    vida: parseInt(formData.get('vida') || 0),
    tipo: formData.get('tipo'),
    status: formData.get('status'),
    descricao: formData.get('descricao'),
    quantidade: parseInt(formData.get('quantidade') || 0),
    usuario: getCurrentUserName(),
  };

  if (!pneu.marca || !pneu.modelo || !pneu.tipo) {
    alert('Preencha os campos obrigatórios.');
    return;
  }

  let pneus = getPneus();
  if (editMode && editingId) {
    const index = pneus.findIndex(p => p.id === editingId);
    if (index !== -1) {
      pneus[index] = { ...pneu, id: editingId };
      alert('Pneu atualizado!');
    } else {
      alert('Pneu não encontrado para atualização.');
      return;
    }
    editMode = false;
    editingId = null;
  } else {
    pneu.id = Date.now().toString();
    pneus.push(pneu);
    alert('Pneu cadastrado!');
  }
  savePneus(pneus);
  clearForm();
  carregarPneus();
}

function clearForm() {
  document.getElementById('formPneu').reset();
  document.getElementById('data').value = new Date().toISOString().slice(0, 16);
}

// 📦 Carregar pneus
function carregarPneus() {
  if (!gridBody) return;

  const data = getPneus().sort((a, b) => a.marca.localeCompare(b.marca));
  renderizarPneus(data);
}

// 🔍 Buscar pneus
function buscarPneus() {
  const marca = document.getElementById('campo-marca')?.value.trim().toUpperCase();
  const modelo = document.getElementById('campo-modelo')?.value.trim().toUpperCase();

  if (!marca && !modelo) {
    carregarPneus();
    return;
  }

  let data = getPneus();
  if (marca) data = data.filter(p => p.marca.toUpperCase().includes(marca));
  if (modelo) data = data.filter(p => p.modelo.toUpperCase().includes(modelo));

  renderizarPneus(data);
}

// 🧱 Renderizar grid
function renderizarPneus(lista) {
  gridBody.innerHTML = '';

  if (lista.length === 0) {
    gridBody.innerHTML = '<div class="grid-row">Nenhum pneu encontrado.</div>';
    return;
  }

  lista.forEach(pneu => {
    const row = document.createElement('div');
    row.classList.add('grid-row');
    row.style.display = 'flex';
    row.style.whiteSpace = 'nowrap';

    row.innerHTML = `
      <div>${pneu.marca}</div>
      <div>${pneu.modelo}</div>
      <div>${pneu.vida || 0}</div>
      <div>${pneu.tipo}</div>
      <div>${pneu.status || ''}</div>
      <div>${pneu.descricao || ''}</div>
      <div>${pneu.data ? new Date(pneu.data).toLocaleString() : ''}</div>
      <div>${pneu.usuario || ''}</div>
      <div>${pneu.quantidade || 0}</div>
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
window.editarPneu = function(id) {
  let pneus = getPneus();
  const pneu = pneus.find(p => p.id === id);

  if (!pneu) {
    alert('Pneu não encontrado.');
    return;
  }

  // Populate form
  document.getElementById('data').value = pneu.data ? new Date(pneu.data).toISOString().slice(0, 16) : '';
  document.getElementById('marca').value = pneu.marca;
  document.getElementById('modelo').value = pneu.modelo;
  document.getElementById('vida').value = pneu.vida || 0;
  document.getElementById('tipo').value = pneu.tipo;
  document.getElementById('status').value = pneu.status || '';
  document.getElementById('descricao').value = pneu.descricao || '';
  document.getElementById('quantidade').value = pneu.quantidade || 0;

  editMode = true;
  editingId = id;

  // Scroll to form
  document.getElementById('formPneu').scrollIntoView({ behavior: 'smooth' });
};

// 🗑️ Excluir pneu
window.excluirPneu = function(id) {
  if (!confirm('Tem certeza que deseja excluir este pneu?')) return;

  let pneus = getPneus();
  const index = pneus.findIndex(p => p.id === id);
  if (index !== -1) {
    pneus.splice(index, 1);
    savePneus(pneus);
    alert('Pneu excluído!');
    carregarPneus();
  } else {
    alert('Erro ao excluir.');
  }
};
