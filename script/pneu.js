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

function getEstoque() {
  return JSON.parse(localStorage.getItem('estoquePneus')) || {};
}

function saveEstoque(estoque) {
  localStorage.setItem('estoquePneus', JSON.stringify(estoque));
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
  const oldPneu = editMode ? pneus.find(p => p.id === editingId) : null;
  if (editMode && editingId) {
    const index = pneus.findIndex(p => p.id === editingId);
    if (index !== -1) {
      const updatedPneu = { ...pneu, id: editingId };
      pneus[index] = updatedPneu;
      // Adjust stock for edit: revert old and apply new
      if (oldPneu) {
        const oldKey = `${oldPneu.marca}-${oldPneu.modelo}-${oldPneu.tipo}-${oldPneu.vida || 0}`;
        let estoque = getEstoque();
        if (oldPneu.status === 'ENTRADA') {
          estoque[oldKey] = Math.max(0, (estoque[oldKey] || 0) - oldPneu.quantidade);
          if (estoque[oldKey] === 0) delete estoque[oldKey];
        } else if (oldPneu.status === 'SAIDA') {
          estoque[oldKey] = (estoque[oldKey] || 0) + oldPneu.quantidade;
        }
        saveEstoque(estoque);
      }
      // Apply new
      const newKey = `${updatedPneu.marca}-${updatedPneu.modelo}-${updatedPneu.tipo}-${updatedPneu.vida || 0}`;
      let estoque = getEstoque();
      if (updatedPneu.status === 'ENTRADA') {
        estoque[newKey] = (estoque[newKey] || 0) + updatedPneu.quantidade;
      } else if (updatedPneu.status === 'SAIDA') {
        if ((estoque[newKey] || 0) < updatedPneu.quantidade) {
          alert('Estoque insuficiente para saída.');
          return;
        }
        estoque[newKey] = (estoque[newKey] || 0) - updatedPneu.quantidade;
        if (estoque[newKey] === 0) delete estoque[newKey];
      }
      saveEstoque(estoque);
      alert('Pneu atualizado!');
    } else {
      alert('Pneu não encontrado para atualização.');
      return;
    }
    editMode = false;
    editingId = null;
  } else {
    pneu.id = Date.now().toString();
    const key = `${pneu.marca}-${pneu.modelo}-${pneu.tipo}-${pneu.vida || 0}`;
    let estoque = getEstoque();
    if (pneu.status === 'ENTRADA') {
      estoque[key] = (estoque[key] || 0) + pneu.quantidade;
    } else if (pneu.status === 'SAIDA') {
      if ((estoque[key] || 0) < pneu.quantidade) {
        alert('Estoque insuficiente para saída.');
        return;
      }
      estoque[key] = (estoque[key] || 0) - pneu.quantidade;
      if (estoque[key] === 0) delete estoque[key];
    }
    saveEstoque(estoque);
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

  lista.forEach((pneu, index) => {
    const row = document.createElement('div');
    row.classList.add('grid-row');
    row.style.display = 'flex';
    row.style.whiteSpace = 'nowrap';
    row.style.borderBottom = '1px solid #eee';
    row.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
    row.style.cursor = 'pointer';
    row.onmouseover = () => row.style.backgroundColor = '#e9ecef';
    row.onmouseout = () => row.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';

    row.innerHTML = `
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.marca}</div>
      <div style="flex: 1.5; min-width: 120px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.modelo}</div>
      <div style="flex: 0.5; min-width: 50px; padding: 12px 8px; text-align: center; border-right: 1px solid #eee;">${pneu.vida || 0}</div>
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.tipo}</div>
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.status || ''}</div>
      <div style="flex: 2; min-width: 100px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.descricao || ''}</div>
      <div style="flex: 1.5; min-width: 120px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.data ? new Date(pneu.data).toLocaleString() : ''}</div>
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${pneu.usuario || ''}</div>
      <div style="flex: 0.5; min-width: 60px; padding: 12px 8px; text-align: center; border-right: 1px solid #eee;">${pneu.quantidade || 0}</div>
      <div style="flex: 1; min-width: 150px; padding: 12px 8px; text-align: center;">
        <button class="btn-acao editar" onclick="editarPneu('${pneu.id}'); event.stopPropagation();" style="margin-right: 5px; background-color: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
          <i class="fas fa-pen"></i> Editar
        </button>
        <button class="btn-acao excluir" onclick="excluirPneu('${pneu.id}'); event.stopPropagation();" style="background-color: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
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
    const pneu = pneus[index];
    // Adjust stock: revert the movement
    const key = `${pneu.marca}-${pneu.modelo}-${pneu.tipo}-${pneu.vida || 0}`;
    let estoque = getEstoque();
    if (pneu.status === 'ENTRADA') {
      estoque[key] = Math.max(0, (estoque[key] || 0) - pneu.quantidade);
      if (estoque[key] === 0) delete estoque[key];
    } else if (pneu.status === 'SAIDA') {
      estoque[key] = (estoque[key] || 0) + pneu.quantidade;
    }
    saveEstoque(estoque);
    pneus.splice(index, 1);
    savePneus(pneus);
    alert('Pneu excluído!');
    carregarPneus();
  } else {
    alert('Erro ao excluir.');
  }
};
