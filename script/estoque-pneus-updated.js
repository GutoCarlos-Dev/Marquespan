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
    
