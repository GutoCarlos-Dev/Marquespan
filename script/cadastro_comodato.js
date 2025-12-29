// Variáveis de estado para controlar a edição de equipamentos
let isEditingEquipamento = false;
let editingEquipamentoId = null;

// Variáveis de estado para controlar a edição de clientes
let isEditingCliente = false;
let editingClienteId = null;

// Array para armazenar as fotos temporariamente (Base64)
let clienteFotosBase64 = [];

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadEquipamentos();
  loadClientes();

  // Event Listeners Formulários
  document.getElementById('formEquipamento').addEventListener('submit', saveEquipamento);
  document.getElementById('formCliente').addEventListener('submit', saveCliente);
  document.getElementById('cliFotos').addEventListener('change', handlePhotoSelect);
  document.getElementById('btnLimparCliente').addEventListener('click', clearFormCliente);
});

// --- Lógica de Abas ---
function initTabs() {
  const buttons = document.querySelectorAll('.painel-btn');
  const sections = document.querySelectorAll('.section');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all buttons
      buttons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      // Hide all sections
      sections.forEach(s => s.classList.add('hidden'));

      // Activate clicked button
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // Show target section
      const targetId = btn.getAttribute('data-secao');
      document.getElementById(targetId).classList.remove('hidden');
    });
  });
}

// --- Funções de Utilidade ---
function getCurrentUserName() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  return usuario ? usuario.nome : 'Sistema';
}

// --- Lógica de Equipamentos (Local Storage) ---
const KEY_EQUIPAMENTOS = 'marquespan_comodato_equipamentos';

function getEquipamentos() {
  return JSON.parse(localStorage.getItem(KEY_EQUIPAMENTOS)) || [];
}

function saveEquipamento(e) {
  e.preventDefault();
  const nome = document.getElementById('equipNome').value;
  const tipo = document.getElementById('equipTipo').value;

  let lista = getEquipamentos();

  if (isEditingEquipamento) {
    // Atualiza um equipamento existente
    const index = lista.findIndex(item => item.id === editingEquipamentoId);
    if (index !== -1) {
      lista[index].nome = nome;
      lista[index].tipo = tipo;
    }
    alert('Equipamento atualizado com sucesso!');
  } else {
    // Adiciona um novo equipamento
    const novoEquip = {
      id: Date.now(),
      nome,
      tipo
    };
    lista.push(novoEquip);
    alert('Equipamento salvo com sucesso!');
  }

  localStorage.setItem(KEY_EQUIPAMENTOS, JSON.stringify(lista));

  // Reseta o formulário e o estado de edição
  document.getElementById('formEquipamento').reset();
  const submitButton = document.querySelector('#formEquipamento button[type="submit"]');
  submitButton.innerHTML = '<i class="fas fa-save"></i> Salvar Equipamento';
  isEditingEquipamento = false;
  editingEquipamentoId = null;
  
  loadEquipamentos();
}

function loadEquipamentos() {
  const lista = getEquipamentos();
  const tbody = document.getElementById('tableBodyEquipamentos');
  tbody.innerHTML = '';

  // Ordena a lista em ordem alfabética pelo nome
  lista.sort((a, b) => a.nome.localeCompare(b.nome));

  lista.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.nome}</td>
      <td>${item.tipo || 'NORMAL'}</td>
      <td>
        <button onclick="editEquipamento(${item.id})" class="btn-icon-small text-primary" title="Editar"><i class="fas fa-edit"></i></button>
        <button onclick="deleteEquipamento(${item.id})" class="btn-icon-small text-danger" title="Excluir"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Expor função de exclusão globalmente para o onclick
window.deleteEquipamento = function(id) {
  if(!confirm('Deseja excluir este equipamento?')) return;
  let lista = getEquipamentos();
  lista = lista.filter(item => item.id !== id);
  localStorage.setItem(KEY_EQUIPAMENTOS, JSON.stringify(lista));
  loadEquipamentos();
};

// Expor função de edição globalmente para o onclick
window.editEquipamento = function(id) {
  const lista = getEquipamentos();
  const item = lista.find(equip => equip.id === id);

  if (item) {
    // Preenche o formulário com os dados do item
    document.getElementById('equipNome').value = item.nome;
    document.getElementById('equipTipo').value = item.tipo || 'NORMAL';

    // Define o estado de edição
    isEditingEquipamento = true;
    editingEquipamentoId = id;

    // Altera o texto do botão para "Atualizar"
    const submitButton = document.querySelector('#formEquipamento button[type="submit"]');
    submitButton.innerHTML = '<i class="fas fa-save"></i> Atualizar Equipamento';

    document.getElementById('formEquipamento').scrollIntoView({ behavior: 'smooth' });
  }
};

// --- Lógica de Clientes (Local Storage) ---
const KEY_CLIENTES = 'marquespan_comodato_clientes';

function getClientes() {
  return JSON.parse(localStorage.getItem(KEY_CLIENTES)) || [];
}

// --- Lógica de Fotos ---
function handlePhotoSelect(event) {
  const files = event.target.files;
  if (!files) return;

  // Verifica limite
  if (files.length + clienteFotosBase64.length > 5) {
    alert('Você pode adicionar no máximo 5 fotos.');
    event.target.value = ''; // Limpa o input para permitir nova seleção
    return;
  }

  Array.from(files).forEach(file => {
    if (clienteFotosBase64.length >= 5) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      clienteFotosBase64.push(e.target.result);
      renderPreviews();
    };
    reader.readAsDataURL(file);
  });

  event.target.value = ''; // Limpa input para permitir selecionar a mesma foto se necessário
}

function renderPreviews() {
  const container = document.getElementById('previewFotos');
  container.innerHTML = '';
  
  clienteFotosBase64.forEach((foto, index) => {
    const div = document.createElement('div');
    div.className = 'preview-card';
    div.innerHTML = `
      <img src="${foto}" alt="Foto ${index + 1}">
      <button type="button" class="btn-remove-foto" onclick="removePhoto(${index})" title="Remover">
        <i class="fas fa-times"></i>
      </button>
    `;
    container.appendChild(div);
  });
}

window.removePhoto = function(index) {
  clienteFotosBase64.splice(index, 1);
  renderPreviews();
};

function clearFotos() {
  clienteFotosBase64 = [];
  renderPreviews();
}

function clearFormCliente() {
  document.getElementById('formCliente').reset();
  clearFotos();
  isEditingCliente = false;
  editingClienteId = null;
  const submitButton = document.querySelector('#formCliente button[type="submit"]');
  submitButton.innerHTML = '<i class="fas fa-save"></i> Salvar Cliente';
}

function saveCliente(e) {
  e.preventDefault();
  
  const clienteData = {
    data: document.getElementById('cliData').value,
    rota: document.getElementById('cliRota').value,
    status: document.getElementById('cliStatus').value,
    supervisor: document.getElementById('cliSupervisor').value,
    razao: document.getElementById('cliRazao').value,
    fantasia: document.getElementById('cliFantasia').value,
    cnpj: document.getElementById('cliCnpj').value,
    ie: document.getElementById('cliIe').value,
    cnae: document.getElementById('cliCnae').value,
    contato: document.getElementById('cliContato').value,
    email: document.getElementById('cliEmail').value,
    municipio: document.getElementById('cliMunicipio').value,
    endereco: document.getElementById('cliEndereco').value,
    fotos: clienteFotosBase64, // Salva as fotos no objeto
    usuario: getCurrentUserName(),
    dataAtualizacao: new Date().toISOString()
  };

  let lista = getClientes();

  if (isEditingCliente) {
    const index = lista.findIndex(c => c.id === editingClienteId);
    if (index !== -1) {
      // Mantém o ID original e a data de criação, mas atualiza o resto
      lista[index] = { ...lista[index], ...clienteData };
    }
    alert('Cliente atualizado com sucesso!');
  } else {
    clienteData.id = Date.now();
    lista.push(clienteData);
    alert('Cliente salvo com sucesso!');
  }

  localStorage.setItem(KEY_CLIENTES, JSON.stringify(lista));

  clearFormCliente();
  loadClientes();
}

function loadClientes() {
  const lista = getClientes();
  lista.sort((a, b) => new Date(b.dataAtualizacao || b.data) - new Date(a.dataAtualizacao || a.data)); // Ordena pelos mais recentes
  const tbody = document.getElementById('tableBodyClientes');
  tbody.innerHTML = '';

  lista.forEach(item => {
    const tr = document.createElement('tr');
    
    // Formatação de Status
    let statusClass = '';
    switch(item.status) {
      case 'APROVADO': statusClass = 'badge-success'; break;
      case 'NEGADO': statusClass = 'badge-danger'; break;
      default: statusClass = 'badge-warning';
    }

    // Formatação de Data
    const dataFormatada = item.dataAtualizacao 
      ? new Date(item.dataAtualizacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) 
      : (item.data ? new Date(item.data).toLocaleDateString('pt-BR') : '-');

    const usuarioCadastro = item.usuario || 'N/A';

    tr.innerHTML = `
      <td>${dataFormatada}</td>
      <td>${usuarioCadastro}</td>
      <td>${item.razao}</td>
      <td>${item.fantasia}</td>
      <td>${item.cnpj}</td>
      <td>${item.rota}</td>
      <td><span class="badge ${statusClass}">${item.status}</span></td>
      <td>
        <button onclick="viewCliente(${item.id})" class="btn-icon-small text-primary" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
        <button onclick="editCliente(${item.id})" class="btn-icon-small text-warning" title="Editar"><i class="fas fa-edit"></i></button>
        <button onclick="deleteCliente(${item.id})" class="btn-icon-small text-danger" title="Excluir"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteCliente = function(id) {
  if(!confirm('Deseja excluir este cliente?')) return;
  let lista = getClientes();
  lista = lista.filter(item => item.id !== id);
  localStorage.setItem(KEY_CLIENTES, JSON.stringify(lista));
  loadClientes();
};

window.editCliente = function(id) {
  const lista = getClientes();
  const item = lista.find(c => c.id === id);
  if (!item) return;

  // Preenche o formulário
  document.getElementById('cliData').value = item.data || '';
  document.getElementById('cliRota').value = item.rota || '';
  document.getElementById('cliStatus').value = item.status || 'PENDENTE';
  document.getElementById('cliSupervisor').value = item.supervisor || '';
  document.getElementById('cliRazao').value = item.razao || '';
  document.getElementById('cliFantasia').value = item.fantasia || '';
  document.getElementById('cliCnpj').value = item.cnpj || '';
  document.getElementById('cliIe').value = item.ie || '';
  document.getElementById('cliCnae').value = item.cnae || '';
  document.getElementById('cliContato').value = item.contato || '';
  document.getElementById('cliEmail').value = item.email || '';
  document.getElementById('cliMunicipio').value = item.municipio || '';
  document.getElementById('cliEndereco').value = item.endereco || '';

  // Carrega as fotos
  clienteFotosBase64 = item.fotos || [];
  renderPreviews();

  // Define o estado de edição
  isEditingCliente = true;
  editingClienteId = id;
  const submitButton = document.querySelector('#formCliente button[type="submit"]');
  submitButton.innerHTML = '<i class="fas fa-save"></i> Atualizar Cliente';
  document.getElementById('formCliente').scrollIntoView({ behavior: 'smooth' });
};

window.viewCliente = function(id) {
  const lista = getClientes();
  const item = lista.find(c => c.id === id);
  if(item) {
    let info = `Detalhes:\n\nSupervisor: ${item.supervisor}\nEndereço: ${item.endereco}\nMunicípio: ${item.municipio}\nContato: ${item.contato}\nEmail: ${item.email}`;
    if (item.fotos && item.fotos.length > 0) {
      info += `\n\n(Este cliente possui ${item.fotos.length} foto(s) anexada(s))`;
    }
    alert(info);
  }
};