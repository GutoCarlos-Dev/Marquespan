import { supabaseClient } from './supabase.js';

let chartProgressoLavagem = null;
let chartProgressoEngraxe = null;
let chartsPizzaLavagem = []; 
let chartsPizzaEngraxe = [];
let chartStatus = null;
let chartGastoMensal = null;
let chartGastoEngraxe = null;
let chartGastoAnualLavagem = null;
let chartGastoAnualEngraxe = null;
let lavagemRotationInterval = null;
let engraxeRotationInterval = null;

const REFRESH_INTERVAL = 300000; // 5 minutos

// Configurações de Status e Cores conforme lavagem.html e mobile-engraxe.css
const lavagemConfig = {
    'REALIZADO': { color: '#28a745', label: 'Realizado' },
    'PENDENTE': { color: '#dc3545', label: 'Pendente' },
    'INTERNADO': { color: '#007bff', label: 'Internado' },
    'AGENDADO': { color: '#ffc107', label: 'Agendado' },
    'DISPENSADO': { color: '#6c757d', label: 'Dispensado' }
};

const engraxeConfig = {
    'OK': { color: '#28a745', label: 'Realizado' },
    'PENDENTE': { color: '#dc3545', label: 'Pendente' },
    'INTERNADO': { color: '#007bff', label: 'Internado' },
    'ROTA': { color: '#17a2b8', label: 'Em Rota' }
};

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    carregarFiliais();
    iniciarRolagemAutomatica();
});

function initDashboard() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('dataInicial').valueAsDate = primeiroDia;
    document.getElementById('dataFinal').valueAsDate = hoje;

    document.getElementById('btn-aplicar-filtro').addEventListener('click', carregarDados);
    document.getElementById('btn-refresh').addEventListener('click', carregarDados);
    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullScreen);
    document.getElementById('btn-toggle-sidebar').addEventListener('click', () => window.toggleSidebar && window.toggleSidebar());

    carregarDados();
    setInterval(carregarDados, REFRESH_INTERVAL);

    document.addEventListener('fullscreenchange', () => {
        const container = document.querySelector('.container');
        const menuContainer = document.getElementById('menu-container');
        if (document.fullscreenElement) {
            container.classList.add('fullscreen-active');
            if (menuContainer) menuContainer.classList.add('hidden');
        } else {
            container.classList.remove('fullscreen-active');
            if (menuContainer) menuContainer.classList.remove('hidden');
        }
        setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    });
}

async function carregarFiliais() {
    const select = document.getElementById('filtroFilial');
    const { data } = await supabaseClient.from('filiais').select('nome, sigla').order('nome');
    if (data) {
        data.forEach(f => select.appendChild(new Option(f.sigla || f.nome, f.sigla || f.nome)));
    }
}

async function carregarDados() {
    const btnRefresh = document.getElementById('btn-refresh');
    btnRefresh.classList.add('fa-spin');

    const dtIni = document.getElementById('dataInicial').value;
    const dtFim = document.getElementById('dataFinal').value;
    const filial = document.getElementById('filtroFilial').value;

    try {
        // 1. Buscar Listas Abertas (Lavagem e Engraxe)
        const [resLavagem, resEngraxe] = await Promise.all([
            supabaseClient.from('lavagem_listas').select('*, lavagem_itens(*)').eq('status', 'ABERTA'),
            supabaseClient.from('engraxe_listas').select('*, engraxe_itens(*)').eq('status', 'ABERTA')
        ]);

        // Processar Dados
        const dadosLavagem = resLavagem.data || [];
        const dadosEngraxe = resEngraxe.data || [];

        atualizarKPIs(dadosLavagem, dadosEngraxe);
        renderizarGraficos(dadosLavagem, dadosEngraxe, filial); // Passa o filtro de filial para a função de renderização
        carregarGraficoGastoMensal();
        carregarGraficoGastoAnualLavagem();
        carregarGraficoGastoEngraxe();
        carregarGraficoGastoAnualEngraxe();

        document.getElementById('last-update').textContent = `Atualizado às: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error('Erro ao carregar monitoramento:', error);
    } finally {
        btnRefresh.classList.remove('fa-spin');
    }
}

function atualizarKPIs(lavagem, engraxe) {
    const totalListas = lavagem.length + engraxe.length;
    document.getElementById('kpi-listas-abertas').textContent = totalListas;
}

/**
 * Gera cards individuais para cada lista de lavagem aberta no container dinâmico.
 * @param {Array} lavagem - Array de objetos de listas de lavagem vindos do Supabase.
 */
function atualizarMonitoramentoLavagemPorLista(lavagem) {
    const container = document.getElementById('lavagem-dynamic-container');
    if (!container) return;

    container.innerHTML = '';

    if (lavagem.length === 0) {
        container.innerHTML = `
            <div class="kpi-card glass-card" style="border-left-color: #ccc; opacity: 0.6;">
                <div class="kpi-icon" style="background-color: #eee; color: #999;"><i class="fas fa-shower"></i></div>
                <div class="kpi-info">
                    <h3>Lavagem</h3>
                    <p>0 <small>Pendentes</small></p>
                </div>
            </div>`;
        return;
    }

    lavagem.forEach(lista => {
        const pendentes = (lista.lavagem_itens || []).filter(item => 
            !item.status || ['PENDENTE', 'NAO REALIZADO', 'NÃO REALIZADO'].includes(item.status.toUpperCase())
        ).length;

        const card = document.createElement('div');
        const corClass = pendentes > 5 ? 'orange' : (pendentes > 0 ? 'yellow' : 'green');
        card.className = `kpi-card glass-card card-lavagem ${corClass}`;
        card.style.cursor = 'pointer';
        
        card.innerHTML = `
            <div class="kpi-icon"><i class="fas fa-shower"></i></div>
            <div class="kpi-info">
                <h3>${lista.nome}</h3>
                <p>${pendentes} <small>Pendentes</small></p>
            </div>
        `;

        card.onclick = () => window.location.href = `lavagem.html?id=${lista.id}`;
        container.appendChild(card);
    });
}

/**
 * Gera cards individuais para cada lista de engraxe aberta no container dinâmico.
 * @param {Array} engraxe - Array de objetos de listas de engraxe vindos do Supabase.
 */
function atualizarMonitoramentoEngraxePorLista(engraxe) {
    const container = document.getElementById('engraxe-dynamic-container');
    if (!container) return;

    container.innerHTML = '';

    if (engraxe.length === 0) {
        container.innerHTML = `
            <div class="kpi-card glass-card" style="border-left-color: #ccc; opacity: 0.6;">
                <div class="kpi-icon" style="background-color: #eee; color: #999;"><i class="fas fa-oil-can"></i></div>
                <div class="kpi-info">
                    <h3>Engraxe</h3>
                    <p>0 <small>Pendentes</small></p>
                </div>
            </div>`;
        return;
    }

    engraxe.forEach(lista => {
        const pendentes = (lista.engraxe_itens || []).filter(item => 
            !item.status || item.status.toUpperCase() === 'PENDENTE'
        ).length;

        const card = document.createElement('div');
        // Amarelo se tiver pendência, laranja se tiver mais de 5, verde se estiver zerado
        const corClass = pendentes > 5 ? 'orange' : (pendentes > 0 ? 'yellow' : 'green');
        card.className = `kpi-card glass-card card-engraxe ${corClass}`;
        card.style.cursor = 'pointer';
        
        card.innerHTML = `
            <div class="kpi-icon"><i class="fas fa-oil-can"></i></div>
            <div class="kpi-info">
                <h3>${lista.nome}</h3>
                <p>${pendentes} <small>Pendentes</small></p>
            </div>
        `;

        card.onclick = () => window.location.href = `engraxe.html?id=${lista.id}`;
        container.appendChild(card);
    });
}

function renderizarGraficos(lavagem, engraxe, filialFilter) {
    renderChartProgressoLavagem(lavagem);
    renderChartProgressoEngraxe(engraxe);
    renderChartPizzaLavagem(lavagem);
    renderChartPizzaEngraxe(engraxe);
    renderChartStatus(lavagem, engraxe);
    atualizarMonitoramentoLavagemPorLista(lavagem);
    atualizarMonitoramentoEngraxePorLista(engraxe);
}

async function carregarGraficoGastoMensal() {
    try {
        // Busca itens realizados de listas que já foram finalizadas
        // Ignora os filtros da página para mostrar o acumulado total conforme solicitado
        const { data, error } = await supabaseClient
            .from('lavagem_itens')
            .select('valor, fornecedor, status, lavagem_listas!inner(status)')
            .eq('status', 'REALIZADO')
            .eq('lavagem_listas.status', 'FINALIZADA');

        if (error) throw error;

        // Agrupar dados por Fornecedor
        const resumo = (data || []).reduce((acc, item) => {
            const f = item.fornecedor || 'Não Informado';
            if (!acc[f]) acc[f] = { qtd: 0, valor: 0 };
            acc[f].qtd++;
            acc[f].valor += parseFloat(item.valor || 0);
            return acc;
        }, {});

        const labels = Object.keys(resumo);
        const valores = labels.map(l => resumo[l].valor);

        const ctx = document.getElementById('chartGastoMensalLavagem').getContext('2d');
        if (chartGastoMensal) chartGastoMensal.destroy();

        chartGastoMensal = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Gasto Total (R$)',
                    data: valores,
                    backgroundColor: 'rgba(0, 105, 55, 0.7)',
                    borderColor: '#006937',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            afterLabel: (context) => `Qtd. Lavagens: ${resumo[context.label].qtd}`
                        }
                    },
                    datalabels: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (v) => 'R$ ' + v.toLocaleString('pt-BR') }
                    }
                }
            }
        });
    } catch (e) {
        console.error('Erro ao carregar gráfico de gasto mensal:', e);
    }
}

async function carregarGraficoGastoAnualLavagem() {
    try {
        const anoAtual = new Date().getFullYear();
        // Busca itens realizados de listas que já foram finalizadas dentro do ano atual
        const { data, error } = await supabaseClient
            .from('lavagem_itens')
            .select('valor, status, lavagem_listas!inner(status, data_lista)')
            .eq('status', 'REALIZADO')
            .eq('lavagem_listas.status', 'FINALIZADA')
            .gte('lavagem_listas.data_lista', `${anoAtual}-01-01`)
            .lte('lavagem_listas.data_lista', `${anoAtual}-12-31`);

        if (error) throw error;

        const mesesLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const valoresMensais = new Array(12).fill(0);

        (data || []).forEach(item => {
            const dataStr = item.lavagem_listas.data_lista;
            if (dataStr) {
                const mes = new Date(dataStr + 'T00:00:00').getMonth();
                valoresMensais[mes] += parseFloat(item.valor || 0);
            }
        });

        const ctx = document.getElementById('chartGastoAnualLavagem').getContext('2d');
        if (chartGastoAnualLavagem) chartGastoAnualLavagem.destroy();

        chartGastoAnualLavagem = new Chart(ctx, {
            type: 'line', // Tipo linha para mostrar a evolução temporal
            data: {
                labels: mesesLabels,
                datasets: [{
                    label: `Gasto Lavagem em ${anoAtual} (R$)`,
                    data: valoresMensais,
                    borderColor: '#006937', // Verde Marquespan
                    backgroundColor: 'rgba(0, 105, 55, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#006937'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    datalabels: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (v) => 'R$ ' + v.toLocaleString('pt-BR') }
                    }
                }
            }
        });
    } catch (e) {
        console.error('Erro ao carregar gráfico de gasto anual lavagem:', e);
    }
}

async function carregarGraficoGastoEngraxe() {
    try {
        // Busca itens realizados em listas finalizadas
        const { data, error } = await supabaseClient
            .from('engraxe_itens')
            .select('status, engraxe_listas!inner(status)')
            .in('status', ['OK', 'REALIZADO'])
            .eq('engraxe_listas.status', 'FINALIZADA');

        if (error) throw error;

        const totalQtd = data ? data.length : 0;
        const valorPadrao = 60.00;
        const valorTotal = totalQtd * valorPadrao;

        const ctx = document.getElementById('chartGastoTotalEngraxe').getContext('2d');
        if (chartGastoEngraxe) chartGastoEngraxe.destroy();

        chartGastoEngraxe = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Engraxe Total (Acumulado)'],
                datasets: [{
                    label: 'Investimento Total (R$)',
                    data: [valorTotal],
                    backgroundColor: 'rgba(253, 160, 20, 0.7)', // Laranja para combinar com o tema Engraxe
                    borderColor: '#fd7e14',
                    borderWidth: 1,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            afterLabel: () => `Quantidade: ${totalQtd} veículos`
                        }
                    },
                    datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'top',
                        formatter: (val) => 'R$ ' + val.toLocaleString('pt-BR', {minimumFractionDigits: 2})
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (v) => 'R$ ' + v.toLocaleString('pt-BR') }
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
    } catch (e) {
        console.error('Erro ao carregar gráfico de gasto engraxe:', e);
    }
}

async function carregarGraficoGastoAnualEngraxe() {
    try {
        const anoAtual = new Date().getFullYear();
        // Busca itens realizados em listas finalizadas dentro do ano atual
        const { data, error } = await supabaseClient
            .from('engraxe_itens')
            .select('status, engraxe_listas!inner(status, data_lista)')
            .in('status', ['OK', 'REALIZADO'])
            .eq('engraxe_listas.status', 'FINALIZADA')
            .gte('engraxe_listas.data_lista', `${anoAtual}-01-01`)
            .lte('engraxe_listas.data_lista', `${anoAtual}-12-31`);

        if (error) throw error;

        const mesesLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const valoresMensais = new Array(12).fill(0);

        (data || []).forEach(item => {
            const dataStr = item.engraxe_listas.data_lista;
            if (dataStr) {
                const mes = new Date(dataStr + 'T00:00:00').getMonth();
                valoresMensais[mes] += 60.00;
            }
        });

        const ctx = document.getElementById('chartGastoAnualEngraxe').getContext('2d');
        if (chartGastoAnualEngraxe) chartGastoAnualEngraxe.destroy();

        chartGastoAnualEngraxe = new Chart(ctx, {
            type: 'line', // Tipo linha é melhor para ver a evolução no tempo
            data: {
                labels: mesesLabels,
                datasets: [{
                    label: `Gasto em ${anoAtual} (R$)`,
                    data: valoresMensais,
                    borderColor: '#fd7e14',
                    backgroundColor: 'rgba(253, 126, 20, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#fd7e14'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    datalabels: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (v) => 'R$ ' + v.toLocaleString('pt-BR') }
                    }
                }
            }
        });
    } catch (e) {
        console.error('Erro ao carregar gráfico de gasto anual engraxe:', e);
    }
}

function renderChartProgressoLavagem(lavagem) {
    const ctx = document.getElementById('chartProgressoLavagem').getContext('2d');
    if (chartProgressoLavagem) chartProgressoLavagem.destroy();

    const labels = [];
    const statusKeys = Object.keys(lavagemConfig);
    const dataMatrix = statusKeys.reduce((acc, key) => { acc[key] = []; return acc; }, {});

    lavagem.forEach(lista => {
        labels.push(lista.nome);
        const itens = lista.lavagem_itens || [];
        statusKeys.forEach(key => {
            dataMatrix[key].push(itens.filter(i => i.status === key).length);
        });
    });

    const datasets = statusKeys.map(key => ({
        label: lavagemConfig[key].label,
        data: dataMatrix[key],
        backgroundColor: lavagemConfig[key].color
    }));

    chartProgressoLavagem = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                x: { stacked: true, grid: { display: false } }, 
                y: { stacked: true, grid: { color: '#f0f0f0' } } 
            },
            plugins: { 
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, color: '#333' } } 
            }
        }
    });
}

function renderChartProgressoEngraxe(engraxe) {
    const ctx = document.getElementById('chartProgressoEngraxe').getContext('2d');
    if (chartProgressoEngraxe) chartProgressoEngraxe.destroy();

    const labels = [];
    const statusKeys = Object.keys(engraxeConfig);
    const dataMatrix = statusKeys.reduce((acc, key) => { acc[key] = []; return acc; }, {});

    engraxe.forEach(lista => {
        labels.push(lista.nome);
        const itens = lista.engraxe_itens || [];
        statusKeys.forEach(key => {
            dataMatrix[key].push(itens.filter(i => i.status === key).length);
        });
    });

    const datasets = statusKeys.map(key => ({
        label: engraxeConfig[key].label,
        data: dataMatrix[key],
        backgroundColor: engraxeConfig[key].color
    }));

    chartProgressoEngraxe = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                x: { stacked: true, grid: { display: false } }, 
                y: { stacked: true, grid: { color: '#f0f0f0' } } 
            },
            plugins: { 
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, color: '#333' } } 
            }
        }
    });
}

function renderChartStatus(lavagem, engraxe) {
    const ctx = document.getElementById('chartStatusServicos').getContext('2d');
    if (chartStatus) chartStatus.destroy();

    const summary = {
        'Realizado': { count: 0, color: '#28a745' },
        'Pendente': { count: 0, color: '#dc3545' },
        'Internado': { count: 0, color: '#007bff' },
        'Agendado': { count: 0, color: '#ffc107' },
        'Dispensado': { count: 0, color: '#6c757d' },
        'Em Rota': { count: 0, color: '#17a2b8' }
    };

    [...lavagem, ...engraxe].forEach(lista => {
        const itens = lista.lavagem_itens || lista.engraxe_itens || [];
        itens.forEach(i => {
            const s = i.status;
            if (s === 'REALIZADO' || s === 'OK') summary['Realizado'].count++;
            else if (s === 'PENDENTE') summary['Pendente'].count++;
            else if (s === 'INTERNADO') summary['Internado'].count++;
            else if (s === 'AGENDADO') summary['Agendado'].count++;
            else if (s === 'DISPENSADO' || s === 'PULAR_LAVAGEM') summary['Dispensado'].count++;
            else if (s === 'ROTA') summary['Em Rota'].count++;
        });
    });

    const activeLabels = Object.keys(summary).filter(k => summary[k].count > 0);

    chartStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: activeLabels,
            datasets: [{
                data: activeLabels.map(k => summary[k].count),
                backgroundColor: activeLabels.map(k => summary[k].color)
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, color: '#333' } }
            }
        }
    });
}

/**
 * Renderiza mini-gráficos de pizza para cada lista de Lavagem
 */
function renderChartPizzaLavagem(lavagem) {
    const container = document.getElementById('containerPizzasLavagem');
    if (!container) return;
    
    // Limpa o contêiner e destrói gráficos anteriores
    container.innerHTML = '';
    chartsPizzaLavagem.forEach(c => c.destroy());
    chartsPizzaLavagem = [];
    if (lavagemRotationInterval) clearInterval(lavagemRotationInterval);

    const statusKeys = Object.keys(lavagemConfig);

    lavagem.forEach(lista => {
        const itens = lista.lavagem_itens || [];
        const total = itens.length;
        const data = statusKeys.map(k => itens.filter(i => i.status === k).length);

        const wrapper = document.createElement('div');
        wrapper.className = 'pizza-item-wrapper';
        wrapper.innerHTML = `
            <h4 class="pizza-title" title="${lista.nome}">${lista.nome}</h4>
            <div class="chart-wrapper" style="height: 220px;">
                <canvas></canvas>
            </div>
        `;
        container.appendChild(wrapper);

        const ctx = wrapper.querySelector('canvas').getContext('2d');
        const chart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: statusKeys.map(k => lavagemConfig[k].label),
                datasets: [{
                    data: data,
                    backgroundColor: statusKeys.map(k => lavagemConfig[k].color),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: `Total: ${total}`, font: { size: 14 }, padding: 2 },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 13 },
                        formatter: (value) => value > 0 ? value : ''
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
        chartsPizzaLavagem.push(chart);
    });

    // Lógica de Alternância
    const items = container.querySelectorAll('.pizza-item-wrapper');
    if (items.length > 0) {
        items[0].classList.add('active');
        
        if (items.length > 1) {
            let currentIndex = 0;
            lavagemRotationInterval = setInterval(() => {
                items[currentIndex].classList.remove('active');
                currentIndex = (currentIndex + 1) % items.length;
                items[currentIndex].classList.add('active');
            }, 6000); // Alterna a cada 6 segundos
        }
    }
}

/**
 * Renderiza mini-gráficos de pizza para cada lista de Engraxe
 */
function renderChartPizzaEngraxe(engraxe) {
    const container = document.getElementById('containerPizzasEngraxe');
    if (!container) return;

    container.innerHTML = '';
    chartsPizzaEngraxe.forEach(c => c.destroy());
    chartsPizzaEngraxe = [];
    if (engraxeRotationInterval) clearInterval(engraxeRotationInterval);

    engraxe.forEach(lista => {
        const itens = lista.engraxe_itens || [];
        const done = itens.filter(i => ['REALIZADO', 'OK'].includes(i.status)).length;
        const total = itens.length;
        const pending = total - done;

        const wrapper = document.createElement('div');
        wrapper.className = 'pizza-item-wrapper';
        wrapper.innerHTML = `
            <h4 class="pizza-title" title="${lista.nome}">${lista.nome}</h4>
            <div class="chart-wrapper" style="height: 220px;">
                <canvas></canvas>
            </div>
        `;
        container.appendChild(wrapper);

        const ctx = wrapper.querySelector('canvas').getContext('2d');
        const chart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Concluídos', 'Pendentes'],
                datasets: [{
                    data: [done, pending],
                    backgroundColor: ['#28a745', '#dc3545'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: `Total: ${total}`, font: { size: 14 }, padding: 2 },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 13 },
                        formatter: (value) => value > 0 ? value : ''
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
        chartsPizzaEngraxe.push(chart);
    });

    // Lógica de Alternância
    const items = container.querySelectorAll('.pizza-item-wrapper');
    if (items.length > 0) {
        items[0].classList.add('active');
        
        if (items.length > 1) {
            let currentIndex = 0;
            engraxeRotationInterval = setInterval(() => {
                items[currentIndex].classList.remove('active');
                currentIndex = (currentIndex + 1) % items.length;
                items[currentIndex].classList.add('active');
            }, 6000); // Alterna a cada 6 segundos
        }
    }
}

function iniciarRolagemAutomatica() {
    const wrapper = document.querySelector('.marquee-wrapper');
    if (!wrapper) return;
    let direction = 1;
    let isPaused = false;
    const speed = 1;

    function step() {
        if (!isPaused) {
            if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 1) direction = -1;
            else if (wrapper.scrollLeft <= 0) direction = 1;
            wrapper.scrollLeft += speed * direction;
        }
        requestAnimationFrame(step);
    }

    // Eventos para pausar e retomar a animação
    wrapper.addEventListener('mouseenter', () => isPaused = true);
    wrapper.addEventListener('mouseleave', () => isPaused = false);

    requestAnimationFrame(step);
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}