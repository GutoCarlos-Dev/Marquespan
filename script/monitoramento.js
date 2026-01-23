import { supabaseClient } from './supabase.js';

// Variáveis globais para armazenar as instâncias dos gráficos
let chartEvolucao = null;
let chartTopPlacas = null;
let chartOficinas = null;
let chartStatus = null;

// Intervalo de atualização automática (30 segundos)
const REFRESH_INTERVAL = 30000;
let refreshTimer;

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
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

    // Carregamento inicial
    carregarDados();

    // Configura atualização automática
    refreshTimer = setInterval(carregarDados, REFRESH_INTERVAL);
}

async function carregarDados() {
    const btnRefresh = document.getElementById('btn-refresh');
    btnRefresh.classList.add('fa-spin'); // Animação de carregamento

    const dtIni = document.getElementById('dataInicial').value;
    const dtFim = document.getElementById('dataFinal').value;

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
}

function atualizarGraficos(data) {
    renderChartEvolucao(data);
    renderChartTopPlacas(data);
    renderChartOficinas(data);
    renderChartStatus(data);
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

    // Cores específicas para status conhecidos
    const colorMap = {
        'FINALIZADO': '#28a745', // Verde
        'PENDENTE': '#ffc107', // Amarelo
        'INTERNADO': '#dc3545', // Vermelho
        'CHECK-IN OFICINA': '#17a2b8', // Azul claro
        'CHECK-IN ROTA': '#6f42c1', // Roxo
        'FINALIZADO ROTA': '#20c997' // Verde água
    };

    const bgColors = labels.map(label => colorMap[label] || '#6c757d'); // Cinza default

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