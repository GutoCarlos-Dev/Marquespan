let gridBody;

function getEstoque() {
  return JSON.parse(localStorage.getItem('estoquePneus')) || {};
}

// 🚀 Inicialização
function carregarEstoque() {
  gridBody = document.getElementById('grid-estoque-body');
  if (!gridBody) return;

  const estoque = getEstoque();
  const lista = Object.entries(estoque).map(([key, quantidade]) => {
    const [marca, modelo, tipo, vida] = key.split('-');
    return { marca, modelo, tipo, vida: parseInt(vida), quantidade };
  }).sort((a, b) => a.marca.localeCompare(b.marca));

  renderizarEstoque(lista);
}

function buscarEstoque() {
  const marca = document.getElementById('campo-marca-estoque')?.value.trim().toUpperCase();
  const modelo = document.getElementById('campo-modelo-estoque')?.value.trim().toUpperCase();

  let lista = Object.entries(getEstoque()).map(([key, quantidade]) => {
    const [m, mod, t, v] = key.split('-');
    return { marca: m, modelo: mod, tipo: t, vida: parseInt(v), quantidade };
  });

  if (marca) lista = lista.filter(item => item.marca.toUpperCase().includes(marca));
  if (modelo) lista = lista.filter(item => item.modelo.toUpperCase().includes(modelo));

  renderizarEstoque(lista);
}

function renderizarEstoque(lista) {
  gridBody.innerHTML = '';

  if (lista.length === 0) {
    gridBody.innerHTML = '<div class="grid-row" style="padding: 20px; text-align: center;">Nenhum item em estoque.</div>';
    document.getElementById('total-quantidade').textContent = '0';
    return;
  }

  let total = 0;

  lista.forEach((item, index) => {
    total += item.quantidade;
    const row = document.createElement('div');
    row.classList.add('grid-row');
    row.style.display = 'flex';
    row.style.whiteSpace = 'nowrap';
    row.style.borderBottom = '1px solid #eee';
    row.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
    row.style.cursor = 'default';

    row.innerHTML = `
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${item.marca}</div>
      <div style="flex: 1.5; min-width: 120px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${item.modelo}</div>
      <div style="flex: 0.5; min-width: 50px; padding: 12px 8px; text-align: center; border-right: 1px solid #eee;">${item.vida}</div>
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${item.tipo}</div>
      <div style="flex: 1.5; min-width: 100px; padding: 12px 8px; text-align: center; border-right: 1px solid #eee; font-weight: bold; color: ${item.quantidade > 0 ? '#28a745' : '#dc3545'};">${item.quantidade}</div>
    `;

    gridBody.appendChild(row);
  });

  document.getElementById('total-quantidade').textContent = total;
}
