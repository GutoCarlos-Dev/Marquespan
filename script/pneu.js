import { supabase } from './supabase.js';

let gridBody;
let editMode = false;
let editingId = null;

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
async function handleSubmit(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const pneu = {
    data: new Date().toISOString(),
    marca: formData.get('marca'),
    modelo: formData.get('modelo'),
    vida: parseInt(formData.get('vida') || 0),
    tipo: formData.get('tipo'),
    status: formData.get('status'),
    quantidade: parseInt(formData.get('quantidade') || 0),
    usuario: getCurrentUserName(),
  };

  if (!pneu.marca || !pneu.modelo || !pneu.tipo) {
    alert('Preencha os campos obrigatórios.');
    return;
  }

  try {
    let result;
    if (editMode && editingId) {
      result = await supabase.from('pneus').update(pneu).eq('id', editingId);
      if (result.error) throw result.error;
      alert('Pneu atualizado!');
      clearForm();
      editMode = false;
      editingId = null;
    } else {
      result = await supabase.from('pneus').insert([pneu]);
      if (result.error) throw result.error;
      alert('Pneu cadastrado!');
      // Log movement if needed
      clearForm();
    }
    carregarPneus();
  } catch (error) {
    console.error('Erro:', error);
    alert('Erro ao salvar.');
  }
}

function clearForm() {
  document.getElementById('formPneu').reset();
  document.getElementById('data').value = new Date().toISOString().slice(0, 16);
}

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
window.editarPneu = async function(id) {
  const { data, error } = await supabase.from('pneus').select('*').eq('id', id).single();

  if (error || !data) {
    alert('Pneu não encontrado.');
    return;
  }

  // Populate form
  document.getElementById('data').value = data.data ? new Date(data.data).toISOString().slice(0, 16) : '';
  document.getElementById('marca').value = data.marca;
  document.getElementById('modelo').value = data.modelo;
  document.getElementById('vida').value = data.vida || 0;
  document.getElementById('tipo').value = data.tipo;
  document.getElementById('status').value = data.status || '';
  document.getElementById('quantidade').value = data.quantidade || 0;

  editMode = true;
  editingId = id;

  // Scroll to form
  document.getElementById('formPneu').scrollIntoView({ behavior: 'smooth' });
};

// 🗑️ Excluir pneu
window.excluirPneu = async function(id) {
  if (!confirm('Tem certeza que deseja excluir este pneu?')) return;

  const { error } = await supabase.from('pneus').delete().eq('id', id);

  if (error) {
    console.error('Erro ao excluir:', error);
    alert('Erro ao excluir.');
  } else {
    alert('Pneu excluído!');
    carregarPneus();
  }
};
