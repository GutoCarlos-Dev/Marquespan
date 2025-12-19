import { supabaseClient } from './supabase.js';

// Variável global para armazenar todos os pneus carregados
let todosPneus = [];
// Variáveis para os gráficos, para que possam ser destruídos e recriados
let chartMovimentacao, chartMarcas, chartModelos, chartVida;

// 🚀 Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    await carregarEstoque(); // Carrega os dados e renderiza as tabelas
    setupFilters();
    gerarGraficos(); // Gera os gráficos com os dados carregados
});

/**
 * Inicializa a funcionalidade das abas.
 */
function initTabs() {
    const tabs = document.querySelectorAll('.painel-btn[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
            
            tab.classList.add('active');
            const target = document.getElementById(tab.dataset.tab);
            if (target) target.style.display = 'block';
        });
    });
}

/**
 * Carrega os dados dos pneus do Supabase.
 */
async function carregarEstoque() {
    const gridDisponivel = document.getElementById('grid-estoque-disponivel');
    const gridUtilizada = document.getElementById('grid-estoque-utilizada');
    
    if (gridDisponivel) gridDisponivel.innerHTML = '<tr><td colspan="6" class="text-center">Carregando...</td></tr>';
    if (gridUtilizada) gridUtilizada.innerHTML = '<tr><td colspan="6" class="text-center">Carregando...</td></tr>';

    try {
        const { data, error } = await supabaseClient
            .from('marcas_fogo_pneus')
            .select(`
                id,
                codigo_marca_fogo,
                status_pneu,
                placa,
                pneus (
                    marca,
                    modelo,
                    tipo,
                    vida
                )
            `)
            .neq('status_pneu', 'DESCARTADO') // Não mostrar pneus descartados
            .order('codigo_marca_fogo', { ascending: true });

        if (error) throw error;

        todosPneus = data || [];
        aplicarFiltros(); // Renderiza as tabelas com os dados carregados
        await popularDatalists(); // Popula os filtros

    } catch (error) {
        console.error('Erro ao carregar estoque:', error);
        if (gridDisponivel) gridDisponivel.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        if (gridUtilizada) gridUtilizada.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
    }
}

/**
 * Aplica os filtros selecionados e re-renderiza as tabelas.
 */
function aplicarFiltros() {
  const placa = document.getElementById('campo-placa-estoque')?.value.toLowerCase() || '';
  const marca = document.getElementById('campo-marca-estoque')?.value.toLowerCase() || '';
  const modelo = document.getElementById('campo-modelo-estoque')?.value.toLowerCase() || '';
  const vida = document.getElementById('campo-vida-estoque')?.value || '';
  const tipo = document.getElementById('campo-tipo-estoque')?.value.toLowerCase() || '';

  const filtrados = todosPneus.filter(item => {
      const pMarca = (item.pneus?.marca || '').toLowerCase();
      const pModelo = (item.pneus?.modelo || '').toLowerCase();
      const pTipo = (item.pneus?.tipo || '').toLowerCase();
      const pVida = String(item.pneus?.vida || '');
      const pPlaca = (item.placa || '').toLowerCase();

      return pMarca.includes(marca) &&
             pModelo.includes(modelo) &&
             pTipo.includes(tipo) &&
             (vida === '' || pVida === vida) &&
             pPlaca.includes(placa);
  });

  renderizarTabelas(filtrados);
}

function renderizarTabelas(listaPneus) {
    const gridDisponivel = document.getElementById('grid-estoque-disponivel');
    const gridUtilizada = document.getElementById('grid-estoque-utilizada');
    const totalDisponivelEl = document.getElementById('total-disponivel');
    const totalUtilizadaEl = document.getElementById('total-utilizada');

    if (!gridDisponivel || !gridUtilizada) return;

    gridDisponivel.innerHTML = '';
    gridUtilizada.innerHTML = '';

    let countDisponivel = 0;
    let countUtilizada = 0;

    listaPneus.forEach(item => {
        const marca = item.pneus?.marca || '-';
        const modelo = item.pneus?.modelo || '-';
        const tipo = item.pneus?.tipo || '-';
        const vida = item.pneus?.vida || '-';
        const mf = item.codigo_marca_fogo || '-';
        
        if (item.status_pneu === 'ESTOQUE') {
            countDisponivel++;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${mf}</td>
                <td>${marca}</td>
                <td>${modelo}</td>
                <td class="text-center">${vida}</td>
                <td>${tipo}</td>
                <td><span style="background:#28a745; color:white; padding:2px 6px; border-radius:4px; font-size:0.85rem;">ESTOQUE</span></td>
            `;
            gridDisponivel.appendChild(row);
        } else {
            countUtilizada++;
            const row = document.createElement('tr');
            
            let localizacao = item.placa || 'Sem Placa';
            let badgeStyle = 'background:#007bff; color:white;';
            
            if (item.status_pneu === 'EM_BORRACHARIA' || item.placa === 'BORRACHA') {
                localizacao = 'EM BORRACHARIA';
                badgeStyle = 'background:#ffc107; color:black;';
            } else if (!item.placa) {
                localizacao = item.status_pneu; 
            }

            row.innerHTML = `
                <td>${mf}</td>
                <td>${marca}</td>
                <td>${modelo}</td>
                <td class="text-center">${vida}</td>
                <td>${tipo}</td>
                <td><span style="${badgeStyle} padding:2px 6px; border-radius:4px; font-size:0.85rem;">${localizacao}</span></td>
            `;
            gridUtilizada.appendChild(row);
        }
    });

    if (totalDisponivelEl) totalDisponivelEl.textContent = countDisponivel;
    if (totalUtilizadaEl) totalUtilizadaEl.textContent = countUtilizada;
    
    if (countDisponivel === 0) gridDisponivel.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum pneu disponível.</td></tr>';
    if (countUtilizada === 0) gridUtilizada.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum pneu em uso.</td></tr>';
}

/**
 * Configura os event listeners para os filtros.
 */
function setupFilters() {
    const btnBuscar = document.getElementById('btn-buscar-estoque');
    const btnLimpar = document.getElementById('btn-limpar-estoque');
    const btnExportar = document.getElementById('btn-exportar-estoque');

    if (btnBuscar) btnBuscar.addEventListener('click', aplicarFiltros);
    if (btnLimpar) btnLimpar.addEventListener('click', () => {
        document.getElementById('campo-placa-estoque').value = '';
        document.getElementById('campo-marca-estoque').value = '';
        document.getElementById('campo-modelo-estoque').value = '';
        document.getElementById('campo-vida-estoque').value = '';
        document.getElementById('campo-tipo-estoque').value = '';
        aplicarFiltros();
    });
    if (btnExportar) btnExportar.addEventListener('click', exportarEstoqueXLSX);
}

/**
 * Popula os datalists dos filtros com opções únicas.
 */
async function popularDatalists() {
    const placas = [...new Set(todosPneus.map(item => item.placa).filter(Boolean))].sort();
    const marcas = [...new Set(todosPneus.map(item => item.pneus?.marca).filter(Boolean))].sort();
    const modelos = [...new Set(todosPneus.map(item => item.pneus?.modelo).filter(Boolean))].sort();
    const tipos = [...new Set(todosPneus.map(item => item.pneus?.tipo).filter(Boolean))].sort();

    const datalists = {
        'placas-list': placas,
        'marcas-list': marcas,
        'modelos-list': modelos,
        'tipos-list': tipos,
    };

    for (const id in datalists) {
        const listEl = document.getElementById(id);
        if (listEl) {
            listEl.innerHTML = '';
            datalists[id].forEach(value => {
                const option = document.createElement('option');
                option.value = value;
                listEl.appendChild(option);
            });
        }
    }
}

/**
 * Gera os gráficos com base nos dados carregados.
 */
function gerarGraficos() {
    // Destruir gráficos antigos para evitar sobreposição
    if (chartMovimentacao) chartMovimentacao.destroy();
    if (chartMarcas) chartMarcas.destroy();
    if (chartModelos) chartModelos.destroy();
    if (chartVida) chartVida.destroy();

    const disponiveis = todosPneus.filter(p => p.status_pneu === 'ESTOQUE');
    const utilizados = todosPneus.filter(p => p.status_pneu !== 'ESTOQUE');

    // Gráfico 1: Disponível vs. Utilizado
    const ctxMovimentacao = document.getElementById('chartMovimentacao')?.getContext('2d');
    if (ctxMovimentacao) {
        chartMovimentacao = new Chart(ctxMovimentacao, {
            type: 'pie',
            data: {
                labels: ['Disponível', 'Em Uso/Outros'],
                datasets: [{
                    data: [disponiveis.length, utilizados.length],
                    backgroundColor: ['rgba(40, 167, 69, 0.8)', 'rgba(0, 123, 255, 0.8)'],
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top' } },
                title: { display: true, text: 'Disponível vs. Utilizado' }
            }
        });
    }

    // Gráfico 2: Distribuição por Marca (do total de pneus)
    const marcasCount = todosPneus.reduce((acc, item) => {
        const marca = item.pneus?.marca || 'Sem Marca';
        acc[marca] = (acc[marca] || 0) + 1;
        return acc;
    }, {});
    const ctxMarcas = document.getElementById('chartMarcas')?.getContext('2d');
    if (ctxMarcas) {
        chartMarcas = new Chart(ctxMarcas, {
            type: 'doughnut',
            data: {
                labels: Object.keys(marcasCount),
                datasets: [{
                    data: Object.values(marcasCount),
                    backgroundColor: ['#007bff', '#28a745', '#ffc107', '#dc3545', '#17a2b8', '#6c757d'],
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }

    // Gráfico 3: Top 5 Modelos em Estoque
    const modelosCount = disponiveis.reduce((acc, item) => {
        const modelo = item.pneus?.modelo || 'Sem Modelo';
        acc[modelo] = (acc[modelo] || 0) + 1;
        return acc;
    }, {});
    const topModelos = Object.entries(modelosCount).sort(([, a], [, b]) => b - a).slice(0, 5);
    const ctxModelos = document.getElementById('chartModelos')?.getContext('2d');
    if (ctxModelos) {
        chartModelos = new Chart(ctxModelos, {
            type: 'bar',
            data: {
                labels: topModelos.map(([modelo]) => modelo),
                datasets: [{
                    label: 'Quantidade em Estoque',
                    data: topModelos.map(([, quantidade]) => quantidade),
                    backgroundColor: 'rgba(23, 162, 184, 0.7)',
                }]
            },
            options: { indexAxis: 'y', responsive: true, scales: { x: { beginAtZero: true } } }
        });
    }

    // Gráfico 4: Distribuição por Vida (do total de pneus)
    const vidaCount = todosPneus.reduce((acc, item) => {
        const vida = `Vida ${item.pneus?.vida || 'N/A'}`;
        acc[vida] = (acc[vida] || 0) + 1;
        return acc;
    }, {});
    const ctxVida = document.getElementById('chartVida')?.getContext('2d');
    if (ctxVida) {
        chartVida = new Chart(ctxVida, {
            type: 'line',
            data: {
                labels: Object.keys(vidaCount).sort(),
                datasets: [{
                    label: 'Quantidade por Vida',
                    data: Object.values(vidaCount),
                    borderColor: 'rgba(255, 193, 7, 1)',
                    backgroundColor: 'rgba(255, 193, 7, 0.2)',
                    fill: true,
                }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } } }
        });
    }
}

/**
 * Exporta os dados filtrados para um arquivo XLSX.
 */
function exportarEstoqueXLSX() {
    const disponiveis = todosPneus.filter(p => p.status_pneu === 'ESTOQUE');
    const utilizados = todosPneus.filter(p => p.status_pneu !== 'ESTOQUE');

    const wb = XLSX.utils.book_new();

    // Sheet 1: Disponíveis
    const wsDisponivelData = disponiveis.map(item => ({
        'Marca Fogo': item.codigo_marca_fogo,
        'Marca': item.pneus?.marca,
        'Modelo': item.pneus?.modelo,
        'Vida': item.pneus?.vida,
        'Tipo': item.pneus?.tipo,
        'Local': 'ESTOQUE'
    }));
    const wsDisponivel = XLSX.utils.json_to_sheet(wsDisponivelData);
    XLSX.utils.book_append_sheet(wb, wsDisponivel, 'Disponível');

    // Sheet 2: Utilizados
    const wsUtilizadaData = utilizados.map(item => ({
        'Marca Fogo': item.codigo_marca_fogo,
        'Marca': item.pneus?.marca,
        'Modelo': item.pneus?.modelo,
        'Vida': item.pneus?.vida,
        'Tipo': item.pneus?.tipo,
        'Onde Está': item.placa || item.status_pneu
    }));
    const wsUtilizada = XLSX.utils.json_to_sheet(wsUtilizadaData);
    XLSX.utils.book_append_sheet(wb, wsUtilizada, 'Em Uso');

    XLSX.writeFile(wb, `Relatorio_Estoque_Pneus_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
  try {
    // Buscar dados da tabela estoque_pneus (mantida automaticamente atualizada pelos triggers)
    // Filtrar apenas itens com quantidade > 0 para mostrar apenas estoque positivo
    const { data: estoque, error } = await supabaseClient
      .from('estoque_pneus')
      .select('*')
      .gt('quantidade', 0)
      .order('marca', { ascending: true })
      .order('modelo', { ascending: true });

    if (error) {
      console.error('Erro ao carregar estoque:', error);
      gridBody.innerHTML = '<div class="grid-row" style="padding: 20px; text-align: center;">Erro ao carregar dados.</div>';
      return;
    }

    const lista = estoque || [];
    await popularDatalists();
    renderizarEstoque(lista);
  } catch (error) {
    console.error('Erro ao carregar estoque:', error);
    gridBody.innerHTML = '<div class="grid-row" style="padding: 20px; text-align: center;">Erro ao carregar dados.</div>';
  }


async function buscarEstoque() {
  const placa = document.getElementById('campo-placa-estoque')?.value.trim().toUpperCase();
  const marca = document.getElementById('campo-marca-estoque')?.value.trim().toUpperCase();
  const modelo = document.getElementById('campo-modelo-estoque')?.value.trim().toUpperCase();
  const vida = document.getElementById('campo-vida-estoque')?.value.trim();
  const tipo = document.getElementById('campo-tipo-estoque')?.value.trim().toUpperCase();

  try {
    let query = supabaseClient
      .from('estoque_pneus')
      .select('*')
      .order('placa', { ascending: true })
      .order('marca', { ascending: true })
      .order('modelo', { ascending: true });

    if (placa) {
      query = query.ilike('placa', `%${placa}%`);
    }
    if (marca) {
      query = query.ilike('marca', `%${marca}%`);
    }
    if (modelo) {
      query = query.ilike('modelo', `%${modelo}%`);
    }
    if (vida) {
      query = query.eq('vida', parseInt(vida));
    }
    if (tipo) {
      query = query.ilike('tipo', `%${tipo}%`);
    }

    const { data: estoque, error } = await query;

    if (error) {
      console.error('Erro ao buscar estoque:', error);
      return;
    }

    renderizarEstoque(estoque || []);
  } catch (error) {
    console.error('Erro ao buscar estoque:', error);
  }
}

function renderizarEstoque(lista) {
  gridBody.innerHTML = '';

  if (lista.length === 0) {
    gridBody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum item em estoque.</td></tr>';
    document.getElementById('total-quantidade').textContent = '0';
    return;
  }

  let total = 0;
  let html = '';

  lista.forEach((item, index) => {
    total += item.quantidade;
    // A placa será "ESTOQUE" se o pneu não estiver em um veículo.
    const textoPlaca = item.placa || '<strong>ESTOQUE</strong>';

    html += `
      <tr>
        <td>${textoPlaca}</td>
        <td>${item.marca}</td>
        <td>${item.modelo}</td>
        <td class="text-center">${item.vida}</td>
        <td>${item.tipo}</td>
        <td class="text-center" style="font-weight: bold; color: #28a745;">${item.quantidade}</td>
      </tr>
    `;
  });

  gridBody.innerHTML = html;
  document.getElementById('total-quantidade').textContent = total;
}

// Função para popular os datalists com opções únicas do Supabase
async function popularDatalists() {
  try {
    const { data: estoque, error } = await supabaseClient
      .from('estoque_pneus')
      .select('marca, modelo, tipo, vida');

    if (error) {
      console.error('Erro ao carregar opções para datalist:', error);
      return;
    }

    const lista = estoque || [];
    const marcas = [...new Set(lista.map(item => item.marca))].sort();
    const modelos = [...new Set(lista.map(item => item.modelo))].sort();
    const tipos = [...new Set(lista.map(item => item.tipo))].sort();
    const vidas = [...new Set(lista.map(item => item.vida))].sort();

    const marcasList = document.getElementById('marcas-list');
    const modelosList = document.getElementById('modelos-list');
    const tiposList = document.getElementById('tipos-list');

    if (marcasList) marcasList.innerHTML = '';
    if (modelosList) modelosList.innerHTML = '';
    if (tiposList) tiposList.innerHTML = '';

    marcas.forEach(marca => {
      if (marcasList) {
        const option = document.createElement('option');
        option.value = marca;
        marcasList.appendChild(option);
      }
    });

    modelos.forEach(modelo => {
      if (modelosList) {
        const option = document.createElement('option');
        option.value = modelo;
        modelosList.appendChild(option);
      }
    });

    tipos.forEach(tipo => {
      if (tiposList) {
        const option = document.createElement('option');
        option.value = tipo;
        tiposList.appendChild(option);
      }
    });
  } catch (error) {
    console.error('Erro ao popular datalists:', error);
  }
}

// Função para limpar filtros
function limparFiltros() {
  document.getElementById('campo-placa-estoque').value = '';
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

// Função para gerar gráficos com dados do Supabase
async function gerarGraficos() {
  try {
    // Buscar dados do estoque para gráficos
    const { data: estoque, error: estoqueError } = await supabaseClient
      .from('estoque_pneus')
      .select('*');

    if (estoqueError) {
      console.error('Erro ao buscar dados para gráficos:', estoqueError);
      return;
    }

    const lista = estoque || [];

    // Buscar dados de movimentação dos últimos 6 meses
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

    const { data: movimentacoes, error: movError } = await supabaseClient
      .from('pneus')
      .select('data, status, quantidade')
      .gte('data', seisMesesAtras.toISOString())
      .order('data', { ascending: true });

    if (movError) {
      console.error('Erro ao buscar dados de movimentação:', movError);
      return;
    }

    const movLista = movimentacoes || [];

    // Processar dados de movimentação por mês
    const movimentacaoPorMes = {};
    movLista.forEach(mov => {
      const data = new Date(mov.data);
      const mesAno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;

      if (!movimentacaoPorMes[mesAno]) {
        movimentacaoPorMes[mesAno] = { entradas: 0, saidas: 0 };
      }

      if (mov.status === 'ENTRADA') {
        movimentacaoPorMes[mesAno].entradas += mov.quantidade;
      } else if (mov.status === 'SAIDA') {
        movimentacaoPorMes[mesAno].saidas += mov.quantidade;
      }
    });

    // Preparar dados para o gráfico (últimos 6 meses)
    const meses = [];
    const entradas = [];
    const saidas = [];

    for (let i = 5; i >= 0; i--) {
      const data = new Date();
      data.setMonth(data.getMonth() - i);
      const mesAno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      const nomeMes = data.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

      meses.push(nomeMes);
      entradas.push(movimentacaoPorMes[mesAno]?.entradas || 0);
      saidas.push(movimentacaoPorMes[mesAno]?.saidas || 0);
    }

    const ctxMovimentacao = document.getElementById('chartMovimentacao');
    if (ctxMovimentacao) {
      const context = ctxMovimentacao.getContext('2d');
      new Chart(context, {
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
    }

    // Gráfico de Distribuição por Marca (Pizza)
    const marcasCount = {};
    lista.forEach(item => {
      if (item.quantidade > 0) { // Filtrar apenas itens com estoque positivo
        marcasCount[item.marca] = (marcasCount[item.marca] || 0) + item.quantidade;
      }
    });

    const ctxMarcas = document.getElementById('chartMarcas');
    if (ctxMarcas) {
      const context = ctxMarcas.getContext('2d');
      new Chart(context, {
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
    }

    // Gráfico de Fluxo por Modelo (Barras Horizontais)
    const modelosCount = {};
    lista.forEach(item => {
      if (item.quantidade > 0) { // Filtrar apenas itens com estoque positivo
        modelosCount[item.modelo] = (modelosCount[item.modelo] || 0) + item.quantidade;
      }
    });

    const topModelos = Object.entries(modelosCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    const ctxModelos = document.getElementById('chartModelos');
    if (ctxModelos) {
      const context = ctxModelos.getContext('2d');
      new Chart(context, {
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
    }

    // Gráfico de Análise de Vida Útil (Linha)
    const vidaCount = {};
    lista.forEach(item => {
      if (item.quantidade > 0) { // Filtrar apenas itens com estoque positivo
        vidaCount[item.vida] = (vidaCount[item.vida] || 0) + item.quantidade;
      }
    });

    const ctxVida = document.getElementById('chartVida');
    if (ctxVida) {
      const context = ctxVida.getContext('2d');
      new Chart(context, {
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
  } catch (error) {
    console.error('Erro ao gerar gráficos:', error);
  }
}

// Função para exportar dados do estoque para XLSX com formatação profissional
async function exportarEstoqueXLSX() {
  try {
    // Buscar dados atuais do estoque (mesmos filtros aplicados na tela)
    const placa = document.getElementById('campo-placa-estoque')?.value.trim().toUpperCase();
    const marca = document.getElementById('campo-marca-estoque')?.value.trim().toUpperCase();
    const modelo = document.getElementById('campo-modelo-estoque')?.value.trim().toUpperCase();
    const vida = document.getElementById('campo-vida-estoque')?.value.trim();
    const tipo = document.getElementById('campo-tipo-estoque')?.value.trim().toUpperCase();

    let query = supabaseClient
      .from('estoque_pneus')
      .select('*')
      .order('placa', { ascending: true })
      .order('marca', { ascending: true })
      .order('modelo', { ascending: true });

    if (placa) {
      query = query.ilike('placa', `%${placa}%`);
    }
    if (marca) {
      query = query.ilike('marca', `%${marca}%`);
    }
    if (modelo) {
      query = query.ilike('modelo', `%${modelo}%`);
    }
    if (vida) {
      query = query.eq('vida', parseInt(vida));
    }
    if (tipo) {
      query = query.ilike('tipo', `%${tipo}%`);
    }

    const { data: estoque, error } = await query;

    if (error) {
      console.error('Erro ao buscar dados para exportação:', error);
      alert('Erro ao exportar dados. Tente novamente.');
      return;
    }

    const lista = estoque || [];

    if (lista.length === 0) {
      alert('Nenhum dado encontrado para exportar.');
      return;
    }

    // Preparar dados para XLSX
    const dadosXLSX = [];

    // Cabeçalho com informações da empresa
    dadosXLSX.push(['MARQUESPAN - SISTEMA DE GESTÃO DE PNEUS']);
    dadosXLSX.push([`Relatório de Estoque - ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`]);
    dadosXLSX.push(['Filtros aplicados:']);
    dadosXLSX.push([placa ? `Placa: ${placa}` : 'Placa: Todos']);
    dadosXLSX.push([marca ? `Marca: ${marca}` : 'Marca: Todos']);
    dadosXLSX.push([modelo ? `Modelo: ${modelo}` : 'Modelo: Todos']);
    dadosXLSX.push([vida ? `Vida: ${vida}` : 'Vida: Todos']);
    dadosXLSX.push([tipo ? `Tipo: ${tipo}` : 'Tipo: Todos']);
    dadosXLSX.push(['']); // Linha em branco

    // Cabeçalhos das colunas
    dadosXLSX.push(['PLACA', 'MARCA', 'MODELO', 'VIDA', 'TIPO', 'QUANTIDADE EM ESTOQUE']);

    // Dados dos itens
    lista.forEach(item => {
      dadosXLSX.push([item.placa, item.marca, item.modelo, item.vida, item.tipo, item.quantidade]);
    });

    // Calcular totais
    const totalQuantidade = lista.reduce((sum, item) => sum + item.quantidade, 0);

    // Adicionar linha de total
    dadosXLSX.push(['TOTAL GERAL', '', '', '', '', totalQuantidade]);
    dadosXLSX.push(['']); // Linha em branco
    dadosXLSX.push([`Total de registros exportados: ${lista.length}`]);
    dadosXLSX.push([`Gerado por: Sistema Marquespan - ${new Date().toLocaleString('pt-BR')}`]);

    // Criar workbook e worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dadosXLSX);

    // Definir larguras das colunas
    ws['!cols'] = [
      { wch: 15 }, // PLACA
      { wch: 20 }, // MARCA
      { wch: 30 }, // MODELO
      { wch: 8 },  // VIDA
      { wch: 15 }, // TIPO
      { wch: 20 }  // QUANTIDADE
    ];

    // Estilos para o cabeçalho (simulação básica)
    // Nota: XLSX não suporta estilos avançados, mas podemos definir tipos de células
    if (ws['A1']) ws['A1'].t = 's'; // String
    if (ws['A6']) ws['A6'].t = 's'; // Cabeçalho

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque_Pneus');

    // Nome do arquivo com data e hora
    const dataHora = new Date().toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
    const nomeArquivo = `estoque_pneus_marquespan_${dataHora}.xlsx`;

    // Salvar arquivo
    XLSX.writeFile(wb, nomeArquivo);

    // Feedback visual
    alert(`✅ Exportação concluída!\n\n📊 ${lista.length} registros exportados\n📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n⏰ Hora: ${new Date().toLocaleTimeString('pt-BR')}\n\nArquivo salvo como: ${nomeArquivo}`);
  } catch (error) {
    console.error('Erro na exportação:', error);
    alert('Erro ao exportar dados. Verifique o console para mais detalhes.');
  }
}

// Expor funções globalmente
window.carregarEstoque = carregarEstoque;
window.buscarEstoque = buscarEstoque;
window.limparFiltros = limparFiltros;
window.exportarEstoqueXLSX = exportarEstoqueXLSX;
window.gerarGraficos = gerarGraficos;

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa a página
    carregarEstoque();
    gerarGraficos();

    // Adiciona os event listeners para os botões
    const btnBuscar = document.getElementById('btn-buscar-estoque');
    const btnLimpar = document.getElementById('btn-limpar-estoque');
    const btnExportar = document.getElementById('btn-exportar-estoque');

    if (btnBuscar) btnBuscar.addEventListener('click', buscarEstoque);
    if (btnLimpar) btnLimpar.addEventListener('click', limparFiltros);
    if (btnExportar) btnExportar.addEventListener('click', exportarEstoqueXLSX);
});
