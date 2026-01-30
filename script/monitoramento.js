import { supabaseClient } from './supabase.js';

// Variáveis globais para armazenar as instâncias dos gráficos
let chartEvolucao = null;
let chartTopPlacas = null;
let chartOficinas = null;
let chartStatus = null;
let chartTopServicosFreq = null;
let chartTopServicosCusto = null;
let chartPendentesInternados = null;
let chartNivelTanques = null;

// Cores padrão dos status
const STATUS_COLORS = {
    'FINALIZADO': '#249c40',       // Verde
    'PENDENTE': '#ff0019',         // Vermelho
    'INTERNADO': '#0cabf5',        // Azul
    'CHECK-IN OFICINA': '#eede06', // Amarelo
    'CHECK-IN ROTA': '#d35400',    // Laranja
    'FINALIZADO ROTA': '#0b3314'   // Verde Escuro
};

// Intervalo de atualização automática (30 segundos)
const REFRESH_INTERVAL = 30000;
let refreshTimer;

document.addEventListener('DOMContentLoaded', () => {
    randomizarGraficos(); // Embaralha a ordem antes de iniciar
    initDashboard();
    iniciarRolagemAutomatica(); // Inicia a animação
});

function initDashboard() {
    // Define datas padrão (Mês atual)
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    document.getElementById('dataInicial').valueAsDate = primeiroDia;
    document.getElementById('dataFinal').valueAsDate = hoje;

    // Listeners
    document.getElementById('btn-aplicar-filtro').addEventListener('click', carregarDados);
    document.getElementById('btn-refresh').addEventListener('click', carregarDados);
    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullScreen);
    document.getElementById('btn-toggle-sidebar').addEventListener('click', () => window.toggleSidebar && window.toggleSidebar());

    // Carregamento inicial
    carregarDados();

    // Configura atualização automática
    refreshTimer = setInterval(carregarDados, REFRESH_INTERVAL);

    // Monitora mudanças de tela cheia (ex: ESC) para atualizar o ícone
    document.addEventListener('fullscreenchange', () => {
        const btn = document.getElementById('btn-fullscreen');
        const sidebar = document.getElementById('sidebar');

        if (document.fullscreenElement) {
            btn.innerHTML = '<i class="fas fa-compress"></i>';
            btn.title = "Sair da Tela Cheia";

            // Ocultar menu ao entrar em tela cheia
            if (sidebar) {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('mobile-open');
                } else {
                    sidebar.classList.add('collapsed');
                }
            }
        } else {
            btn.innerHTML = '<i class="fas fa-expand"></i>';
            btn.title = "Tela Cheia";
        }
    });
}

// Função para embaralhar a ordem dos gráficos no DOM
function randomizarGraficos() {
    const track = document.getElementById('marqueeTrack');
    if (!track) return;
    
    const items = Array.from(track.children);
    // Algoritmo de Fisher-Yates shuffle simplificado
    items.sort(() => Math.random() - 0.5);
    
    // Reanexa os elementos na nova ordem
    items.forEach(item => track.appendChild(item));
}

// Função para rolagem automática horizontal (vai e volta)
function iniciarRolagemAutomatica() {
    const wrapper = document.querySelector('.marquee-wrapper');
    if (!wrapper) return;

    let direction = 1; // 1 = direita, -1 = esquerda
    const speed = 1;   // Pixels por frame (ajuste para mais rápido ou mais lento)

    function step() {
        // Verifica se chegou ao fim ou ao início
        if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 1) {
            direction = -1;
        } else if (wrapper.scrollLeft <= 0) {
            direction = 1;
        }
        wrapper.scrollLeft += speed * direction;
        requestAnimationFrame(step);
    }
    
    // Inicia o loop de animação
    requestAnimationFrame(step);
    
    // Opcional: Pausar ao passar o mouse
    wrapper.addEventListener('mouseenter', () => direction = 0);
    wrapper.addEventListener('mouseleave', () => {
        // Recalcula direção baseado na posição atual para retomar
        if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 10) direction = -1;
        else direction = 1;
    });
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Erro ao tentar entrar em tela cheia: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

async function carregarDados() {
    const btnRefresh = document.getElementById('btn-refresh');
    btnRefresh.classList.add('fa-spin'); // Animação de carregamento

    const dtIni = document.getElementById('dataInicial').value;
    const dtFim = document.getElementById('dataFinal').value;

    carregarTotalFrota(); // Busca total da frota (sem filtros)
    carregarDadosEstoque(); // Busca dados de estoque para o novo gráfico

    try {
        // Busca dados unindo checklist (itens), cabeçalho (data/placa) e oficinas (nome)
        const { data, error } = await supabaseClient
            .from('coletas_manutencao_checklist')
            .select(`
                *,
                coletas_manutencao!inner (
                    id,
                    data_hora,
                    placa
                ),
                oficinas (
                    nome
                )
            `)
            .gte('coletas_manutencao.data_hora', `${dtIni}T00:00:00`)
            .lte('coletas_manutencao.data_hora', `${dtFim}T23:59:59`);

        if (error) throw error;

        atualizarKPIs(data);
        atualizarGraficos(data);
        
        // Atualiza timestamp
        const now = new Date();
        document.getElementById('last-update').textContent = `Atualizado às: ${now.toLocaleTimeString()}`;

    } catch (error) {
        console.error('Erro ao carregar dados do monitoramento:', error);
        // alert('Erro ao atualizar dashboard.');
    } finally {
        btnRefresh.classList.remove('fa-spin');
    }
}

async function carregarTotalFrota() {
    try {
        const { count, error } = await supabaseClient
            .from('veiculos')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;

        const kpi = document.getElementById('kpi-total-frota');
        if (kpi) kpi.textContent = count;
    } catch (error) {
        console.error('Erro ao carregar total da frota:', error);
    }
}

function atualizarKPIs(data) {
    // 1. Total Manutenções (Conta cabeçalhos únicos, pois 'data' contém itens)
    const uniqueManutencoes = new Set(data.map(item => item.coletas_manutencao.id));
    document.getElementById('kpi-total-qtd').textContent = uniqueManutencoes.size;

    // 2. Gasto Total (Soma o valor de cada item do checklist)
    let totalValor = 0;
    data.forEach(item => {
        // O valor vem da tabela checklist
        const val = parseFloat(item.valor) || 0;
        totalValor += val;
    });
    document.getElementById('kpi-total-valor').textContent = totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // 3. Veículos Internados
    const internados = data.filter(item => item.status === 'INTERNADO').length;
    document.getElementById('kpi-internados').textContent = internados;

    // 4. Finalizados Hoje
    const hojeStr = new Date().toISOString().split('T')[0];
    const finalizadosHoje = data.filter(item => {
        const dataItem = item.coletas_manutencao.data_hora ? item.coletas_manutencao.data_hora.split('T')[0] : '';
        return (item.status === 'FINALIZADO' || item.status === 'FINALIZADO ROTA') && dataItem === hojeStr;
    }).length;
    document.getElementById('kpi-finalizados-hoje').textContent = finalizadosHoje;

    // 5. Total Pendentes
    const pendentes = data.filter(item => item.status === 'PENDENTE').length;
    const kpiPendentes = document.getElementById('kpi-pendentes');
    if (kpiPendentes) kpiPendentes.textContent = pendentes;
}

function atualizarGraficos(data) {
    renderChartEvolucao(data);
    renderChartTopPlacas(data);
    renderChartOficinas(data);
    renderChartStatus(data);
    renderChartTopServicosFreq(data);
    renderChartTopServicosCusto(data);
    renderChartPendentesInternados(data);
}

async function carregarDadosEstoque() {
    try {
        // 1. Buscar todos os tanques
        const { data: tanques, error: tanquesError } = await supabaseClient
            .from('tanques')
            .select('id, nome, capacidade, tipo_combustivel');
        if (tanquesError) throw tanquesError;

        // 2. Buscar todas as entradas (abastecimentos)
        const { data: entradas, error: entradasError } = await supabaseClient
            .from('abastecimentos')
            .select('tanque_id, qtd_litros');
        if (entradasError) throw entradasError;

        // 3. Buscar todas as saídas
        const { data: saidas, error: saidasError } = await supabaseClient
            .from('saidas_combustivel')
            .select('qtd_litros, bicos(bombas(tanque_id))');
        if (saidasError) throw saidasError;

        // 4. Calcular o estoque atual
        const estoqueMap = new Map();
        tanques.forEach(t => {
            estoqueMap.set(t.id, { ...t, estoque_atual: 0 });
        });
        entradas.forEach(e => {
            if (estoqueMap.has(e.tanque_id)) {
                estoqueMap.get(e.tanque_id).estoque_atual += e.qtd_litros;
            }
        });
        saidas.forEach(s => {
            const tanqueId = s.bicos?.bombas?.tanque_id;
            if (tanqueId && estoqueMap.has(tanqueId)) {
                estoqueMap.get(tanqueId).estoque_atual -= s.qtd_litros;
            }
        });
        const estoqueCalculado = Array.from(estoqueMap.values());

        // 5. Renderizar o novo gráfico
        renderChartNivelTanques(estoqueCalculado);

    } catch (error) {
        console.error('Erro ao carregar dados de estoque para o monitoramento:', error);
    }
}

function renderChartNivelTanques(estoqueData) {
    const labels = estoqueData.map(t => `${t.nome} (${t.tipo_combustivel})`);
    const percentages = estoqueData.map(t => {
        const capacidade = t.capacidade > 0 ? t.capacidade : 1; // Evita divisão por zero
        return ((t.estoque_atual / capacidade) * 100).toFixed(1);
    });

    const backgroundColors = percentages.map(p => {
        if (p < 20) return 'rgba(220, 53, 69, 0.7)';   // Vermelho
        if (p < 50) return 'rgba(255, 193, 7, 0.7)';  // Amarelo
        return 'rgba(40, 167, 69, 0.7)';              // Verde
    });

    const ctx = document.getElementById('chartNivelTanques').getContext('2d');
    if (chartNivelTanques) chartNivelTanques.destroy();

    chartNivelTanques = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Nível do Tanque (%)',
                data: percentages,
                backgroundColor: backgroundColors,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Gráfico de barras horizontais
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, max: 100, ticks: { callback: value => value + "%" } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: context => ` ${context.parsed.x}% (${estoqueData[context.dataIndex].estoque_atual.toFixed(0)}L de ${estoqueData[context.dataIndex].capacidade}L)` } }
            }
        }
    });
}

// --- Funções de Renderização dos Gráficos ---

function renderChartEvolucao(data) {
    // Agrupar por data
    const agrupado = {};
    const processedIds = new Set();

    data.forEach(item => {
        // Conta apenas uma vez por manutenção (cabeçalho), ignorando múltiplos itens
        if (!processedIds.has(item.coletas_manutencao.id)) {
            processedIds.add(item.coletas_manutencao.id);
            const dataStr = item.coletas_manutencao.data_hora ? new Date(item.coletas_manutencao.data_hora).toLocaleDateString('pt-BR') : 'N/A';
            if (!agrupado[dataStr]) agrupado[dataStr] = 0;
            agrupado[dataStr]++;
        }
    });

    // Ordenar datas
    const labels = Object.keys(agrupado).sort((a, b) => {
        const [da, ma, ya] = a.split('/');
        const [db, mb, yb] = b.split('/');
        return new Date(`${ya}-${ma}-${da}`) - new Date(`${yb}-${mb}-${db}`);
    });
    const values = labels.map(l => agrupado[l]);

    const ctx = document.getElementById('chartEvolucao').getContext('2d');
    
    if (chartEvolucao) chartEvolucao.destroy();

    chartEvolucao = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Quantidade de Manutenções',
                data: values,
                borderColor: '#006937',
                backgroundColor: 'rgba(0, 105, 55, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}

function renderChartTopPlacas(data) {
    // Agrupar gastos por placa
    const gastosPorPlaca = {};
    data.forEach(item => {
        const val = parseFloat(item.valor) || 0;
        const placa = item.coletas_manutencao.placa || 'N/A';
        if (!gastosPorPlaca[placa]) gastosPorPlaca[placa] = 0;
        gastosPorPlaca[placa] += val;
    });

    // Converter para array e ordenar
    const sorted = Object.entries(gastosPorPlaca)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10); // Top 10

    const labels = sorted.map(([k]) => k);
    const values = sorted.map(([,v]) => v);

    const ctx = document.getElementById('chartTopPlacas').getContext('2d');
    if (chartTopPlacas) chartTopPlacas.destroy();

    chartTopPlacas = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Custo Total (R$)',
                data: values,
                backgroundColor: '#007bff',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Barra horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderChartOficinas(data) {
    // Agrupar gastos por Oficina
    const gastosPorOficina = {};
    data.forEach(item => {
        const val = parseFloat(item.valor) || 0;

        // Tenta pegar nome da oficina da relação, ou fallback
        const oficina = item.oficinas ? item.oficinas.nome : (item.detalhes && item.detalhes.includes('|') ? item.detalhes.split('|')[1].trim() : 'Não Informado');
        if (!gastosPorOficina[oficina]) gastosPorOficina[oficina] = 0;
        gastosPorOficina[oficina] += val;
    });

    const sorted = Object.entries(gastosPorOficina).sort(([,a], [,b]) => b - a);
    const labels = sorted.map(([k]) => k);
    const values = sorted.map(([,v]) => v);

    const ctx = document.getElementById('chartOficinas').getContext('2d');
    if (chartOficinas) chartOficinas.destroy();

    chartOficinas = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            }
        }
    });
}

function renderChartStatus(data) {
    const contagem = {};
    data.forEach(item => {
        const status = item.status || 'N/A';
        if (!contagem[status]) contagem[status] = 0;
        contagem[status]++;
    });

    const labels = Object.keys(contagem);
    const values = Object.values(contagem);

    const bgColors = labels.map(label => STATUS_COLORS[label] || '#6c757d'); // Cinza default

    const ctx = document.getElementById('chartStatus').getContext('2d');
    if (chartStatus) chartStatus.destroy();

    chartStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: bgColors
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold' },
                    formatter: (value, ctx) => {
                        let sum = 0;
                        let dataArr = ctx.chart.data.datasets[0].data;
                        dataArr.map(data => {
                            sum += data;
                        });
                        let percentage = (value*100 / sum).toFixed(1)+"%";
                        return percentage;
                    },
                    display: function(context) {
                        // Só mostra se for maior que 5% para não poluir
                        var index = context.dataIndex;
                        var value = context.dataset.data[index];
                        var total = context.dataset.data.reduce((a, b) => a + b, 0);
                        return (value / total) > 0.05; 
                    }
                }
            }
        },
        plugins: [ChartDataLabels] // Ativa o plugin se estiver carregado
    });
}

function renderChartTopServicosFreq(data) {
    // Agrupar frequência por Item/Serviço
    const freqPorItem = {};
    data.forEach(item => {
        // Tenta pegar o nome do item (ajuste 'item' ou 'descricao' conforme sua coluna no banco)
        const nomeItem = item.item || item.descricao || 'Outros';
        if (!freqPorItem[nomeItem]) freqPorItem[nomeItem] = 0;
        freqPorItem[nomeItem]++;
    });

    // Ordenar e pegar Top 10
    const sorted = Object.entries(freqPorItem)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

    const labels = sorted.map(([k]) => k);
    const values = sorted.map(([,v]) => v);

    const ctx = document.getElementById('chartTopServicosFreq').getContext('2d');
    if (chartTopServicosFreq) chartTopServicosFreq.destroy();

    chartTopServicosFreq = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Qtd. Realizada',
                data: values,
                backgroundColor: '#17a2b8', // Azul Ciano
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Barra horizontal para facilitar leitura dos nomes
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { beginAtZero: true }
            }
        }
    });
}

function renderChartPendentesInternados(data) {
    // Contagem total de Pendentes e Internados
    let totalPendente = 0;
    let totalInternado = 0;

    data.forEach(item => {
        if (item.status === 'PENDENTE') totalPendente++;
        if (item.status === 'INTERNADO') totalInternado++;
    });

    const ctx = document.getElementById('chartPendentesInternados').getContext('2d');
    if (chartPendentesInternados) chartPendentesInternados.destroy();

    chartPendentesInternados = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pendentes', 'Internados'],
            datasets: [{
                data: [totalPendente, totalInternado],
                backgroundColor: [STATUS_COLORS['PENDENTE'], STATUS_COLORS['INTERNADO']],
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: { font: { size: 14 } }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 24 },
                    formatter: (value) => value > 0 ? value : ''
                },
                title: {
                    display: true,
                    text: `Total: ${totalPendente + totalInternado}`,
                    font: { size: 16 },
                    position: 'top'
                }
            },
            cutout: '60%'
        },
        plugins: [ChartDataLabels]
    });
}

function renderChartTopServicosCusto(data) {
    // Agrupar custo por Item/Serviço
    const custoPorItem = {};
    data.forEach(item => {
        const nomeItem = item.item || item.descricao || 'Outros';
        const val = parseFloat(item.valor) || 0;
        
        if (!custoPorItem[nomeItem]) custoPorItem[nomeItem] = 0;
        custoPorItem[nomeItem] += val;
    });

    // Ordenar e pegar Top 10
    const sorted = Object.entries(custoPorItem)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

    const labels = sorted.map(([k]) => k);
    const values = sorted.map(([,v]) => v);

    const ctx = document.getElementById('chartTopServicosCusto').getContext('2d');
    if (chartTopServicosCusto) chartTopServicosCusto.destroy();

    chartTopServicosCusto = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Custo Total (R$)',
                data: values,
                backgroundColor: '#dc3545', // Vermelho
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}