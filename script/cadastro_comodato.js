document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadEquipamentos();
  loadClientes();

  // Event Listeners Formulários
  document.getElementById('formEquipamento').addEventListener('submit', saveEquipamento);
  document.getElementById('formCliente').addEventListener('submit', saveCliente);
  document.getElementById('btnLimparCliente').addEventListener('click', () => {
    document.getElementById('formCliente').reset();
  });
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

// --- Lógica de Equipamentos (Local Storage) ---
const KEY_EQUIPAMENTOS = 'marquespan_comodato_equipamentos';

function getEquipamentos() {
  return JSON.parse(localStorage.getItem(KEY_EQUIPAMENTOS)) || [];
}

function saveEquipamento(e) {
  e.preventDefault();
  const nome = document.getElementById('equipNome').value;

  const novoEquip = {
    id: Date.now(),
    nome
  };

  const lista = getEquipamentos();
  lista.push(novoEquip);
  localStorage.setItem(KEY_EQUIPAMENTOS, JSON.stringify(lista));

  document.getElementById('formEquipamento').reset();
  loadEquipamentos();
  alert('Equipamento salvo com sucesso!');
}

function loadEquipamentos() {
  const lista = getEquipamentos();
  const tbody = document.getElementById('tableBodyEquipamentos');
  tbody.innerHTML = '';

  lista.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.nome}</td>
      <td>
        <button onclick="deleteEquipamento(${item.id})" class="btn-icon-small text-danger" title="Excluir"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Expor função globalmente para o onclick
window.deleteEquipamento = function(id) {
  if(!confirm('Deseja excluir este equipamento?')) return;
  let lista = getEquipamentos();
  lista = lista.filter(item => item.id !== id);
  localStorage.setItem(KEY_EQUIPAMENTOS, JSON.stringify(lista));
  loadEquipamentos();
};


// --- Lógica de Clientes (Local Storage) ---
const KEY_CLIENTES = 'marquespan_comodato_clientes';

function getClientes() {
  return JSON.parse(localStorage.getItem(KEY_CLIENTES)) || [];
}

function saveCliente(e) {
  e.preventDefault();
  
  const novoCliente = {
    id: Date.now(),
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
    endereco: document.getElementById('cliEndereco').value
  };

  const lista = getClientes();
  lista.push(novoCliente);
  localStorage.setItem(KEY_CLIENTES, JSON.stringify(lista));

  document.getElementById('formCliente').reset();
  loadClientes();
  alert('Cliente salvo com sucesso!');
}

function loadClientes() {
  const lista = getClientes();
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
    const dataFormatada = item.data ? new Date(item.data).toLocaleDateString('pt-BR') : '-';

    tr.innerHTML = `
      <td>${dataFormatada}</td>
      <td>${item.razao}</td>
      <td>${item.fantasia}</td>
      <td>${item.cnpj}</td>
      <td>${item.rota}</td>
      <td><span class="badge ${statusClass}">${item.status}</span></td>
      <td>
        <button onclick="viewCliente(${item.id})" class="btn-icon-small text-primary" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
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

window.viewCliente = function(id) {
  const lista = getClientes();
  const item = lista.find(c => c.id === id);
  if(item) {
    alert(`Detalhes:\n\nSupervisor: ${item.supervisor}\nEndereço: ${item.endereco}\nMunicípio: ${item.municipio}\nContato: ${item.contato}\nEmail: ${item.email}`);
  }
};