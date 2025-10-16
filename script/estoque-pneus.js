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

  popularDatalists();
  renderizarEstoque(lista);
}

function buscarEstoque() {
  const marca = document.getElementById('campo-marca-estoque')?.value.trim().toUpperCase();
  const modelo = document.getElementById('campo-modelo-estoque')?.value.trim().toUpperCase();
  const vida = document.getElementById('campo-vida-estoque')?.value.trim();
  const tipo = document.getElementById('campo-tipo-estoque')?.value.trim().toUpperCase();

  let lista = Object.entries(getEstoque()).map(([key, quantidade]) => {
    const [m, mod, t, v] = key.split('-');
    return { marca: m, modelo: mod, tipo: t, vida: parseInt(v), quantidade };
  });

  if (marca) lista = lista.filter(item => item.marca.toUpperCase().includes(marca));
  if (modelo) lista = lista.filter(item => item.modelo.toUpperCase().includes(modelo));
  if (vida) lista = lista.filter(item => item.vida.toString().includes(vida));
  if (tipo) lista = lista.filter(item => item.tipo.toUpperCase().includes(tipo));

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

// Função para popular os datalists com opções únicas
function popularDatalists() {
  const estoque = getEstoque();
  const lista = Object.entries(estoque).map(([key, quantidade]) => {
    const [marca, modelo, tipo, vida] = key.split('-');
    return { marca, modelo, tipo, vida: parseInt(vida), quantidade };
  });

  const marcas = [...new Set(lista.map(item => item.marca))].sort();
  const modelos = [...new Set(lista.map(item => item.modelo))].sort();
  const tipos = [...new Set(lista.map(item => item.tipo))].sort();
  const vidas = [...new Set(lista.map(item => item.vida))].sort();

  const marcasList = document.getElementById('marcas-list');
  const modelosList = document.getElementById('modelos-list');
  const tiposList = document.getElementById('tipos-list');

  marcasList.innerHTML = '';
  modelosList.innerHTML = '';
  tiposList.innerHTML = '';

  marcas.forEach(marca => {
    const option = document.createElement('option');
    option.value = marca;
    marcasList.appendChild(option);
  });

  modelos.forEach(modelo => {
    const option = document.createElement('option');
    option.value = modelo;
    modelosList.appendChild(option);
  });

  tipos.forEach(tipo => {
    const option = document.createElement('option');
    option.value = tipo;
    tiposList.appendChild(option);
  });
}

// Função para limpar filtros
function limparFiltros() {
  document.getElementById('campo-marca-estoque').value = '';
  document.getElementById('campo-modelo-estoque').value = '';
  document.getElementById('campo-vida-estoque').value = '';
  document.getElementById('campo-tipo-estoque').value = '';
  carregarEstoque();
}

// Funções para gerar dados simulados de movimentação (entrada/saída)
function gerarDadosMovimentacao() {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
  const entradas = meses.map(() => Math.floor(Math.random() * 50) + 20);
  const saidas = meses.map(() => Math.floor(Math.random() * 40) + 15);
  return { meses, entradas, saidas };
}

// Função para gerar gráficos
function gerarGraficos() {
  const estoque = getEstoque();
  const lista = Object.entries(estoque).map(([key, quantidade]) => {
    const [marca, modelo, tipo, vida] = key.split('-');
    return { marca, modelo, tipo, vida: parseInt(vida), quantidade };
  });

  // Gráfico de Movimentação (Entrada/Saída)
  const { meses, entradas, saidas } = gerarDadosMovimentacao();
  const ctxMovimentacao = document.getElementById('chartMovimentacao').getContext('2d');
  new Chart(ctxMovimentacao, {
    type: 'bar',
    data: {
      labels: meses,
      datasets: [{
        label: 'Entradas',
        data: entradas,
        backgroundColor: 'rgba(40, 167, 69, 0.7)',
        borderColor: 'rgba(40, 167, 69, 1)',
        borderWidth: 1
      }, {
        label: 'Saídas',
        data: saidas,
        backgroundColor: 'rgba(220, 53, 69, 0.7)',
        borderColor: 'rgba(220, 53, 69, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });

  // Gráfico de Distribuição por Marca (Pizza)
  const marcasCount = {};
  lista.forEach(item => {
    marcasCount[item.marca] = (marcasCount[item.marca] || 0) + item.quantidade;
  });
  const ctxMarcas = document.getElementById('chartMarcas').getContext('2d');
  new Chart(ctxMarcas, {
    type: 'doughnut',
    data: {
      labels: Object.keys(marcasCount),
      datasets: [{
        data: Object.values(marcasCount),
        backgroundColor: [
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 205, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
          'rgba(255, 159, 64, 0.8)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
        }
      }
    }
  });

  // Gráfico de Fluxo por Modelo (Barras Horizontais)
  const modelosCount = {};
  lista.forEach(item => {
    modelosCount[item.modelo] = (modelosCount[item.modelo] || 0) + item.quantidade;
  });
  const topModelos = Object.entries(modelosCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);
  const ctxModelos = document.getElementById('chartModelos').getContext('2d');
  new Chart(ctxModelos, {
    type: 'bar',
    data: {
      labels: topModelos.map(([modelo]) => modelo),
      datasets: [{
        label: 'Quantidade em Estoque',
        data: topModelos.map(([,quantidade]) => quantidade),
        backgroundColor: 'rgba(54, 162, 235, 0.7)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      scales: {
        x: {
          beginAtZero: true
        }
      }
    }
  });

  // Gráfico de Análise de Vida Útil (Linha)
  const vidaCount = {};
  lista.forEach(item => {
    vidaCount[item.vida] = (vidaCount[item.vida] || 0) + item.quantidade;
  });
  const ctxVida = document.getElementById('chartVida').getContext('2d');
  new Chart(ctxVida, {
    type: 'line',
    data: {
      labels: Object.keys(vidaCount).sort((a, b) => a - b),
      datasets: [{
        label: 'Quantidade por Vida Útil',
        data: Object.keys(vidaCount).sort((a, b) => a - b).map(vida => vidaCount[vida]),
        backgroundColor: 'rgba(255, 159, 64, 0.2)',
        borderColor: 'rgba(255, 159, 64, 1)',
        borderWidth: 2,
        fill: true
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}
