import { supabaseClient } from './supabase.js';

let chartProgressoLavagem = null;
let chartProgressoEngraxe = null;
let chartsPizzaLavagem = []; 
let chartsPizzaEngraxe = [];
let chartStatus = null;

const REFRESH_INTERVAL = 300000; // 5 minutos

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
        const header = document.querySelector('.glass-header');
        if (document.fullscreenElement) {
            container.classList.add('fullscreen-active');
            if (header) header.classList.add('hidden');
            if (menuContainer) menuContainer.classList.add('hidden');
        } else {
            container.classList.remove('fullscreen-active');
            if (header) header.classList.remove('hidden');
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
        renderizarGraficos(dadosLavagem, dadosEngraxe);

        document.getElementById('last-update').textContent = `Atualizado às: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error('Erro ao carregar monitoramento:', error);
    } finally {
        btnRefresh.classList.remove('fa-spin');
    }
}

function atualizarKPIs(lavagem, engraxe) {
    const totalListas = lavagem.length + engraxe.length;
    
    const lavagemPendentes = lavagem.reduce((acc, lista) => 
        acc + lista.lavagem_itens.filter(i => i.status === 'PENDENTE').length, 0);
    
    const engraxePendentes = engraxe.reduce((acc, lista) => 
        acc + lista.engraxe_itens.filter(i => i.status === 'PENDENTE').length, 0);

    const hojeStr = new Date().toISOString().split('T')[0];
    const realizadosHoje = 
        lavagem.reduce((acc, lista) => acc + lista.lavagem_itens.filter(i => i.status === 'REALIZADO' && i.data_realizado?.startsWith(hojeStr)).length, 0) +
        engraxe.reduce((acc, lista) => acc + lista.engraxe_itens.filter(i => i.status === 'OK' && i.data_realizado?.startsWith(hojeStr)).length, 0);

    document.getElementById('kpi-listas-abertas').textContent = totalListas;
    document.getElementById('kpi-lavagem-pendente').textContent = lavagemPendentes;
    document.getElementById('kpi-engraxe-pendente').textContent = engraxePendentes;
    document.getElementById('kpi-realizados-hoje').textContent = realizadosHoje;
}

function renderizarGraficos(lavagem, engraxe) {
    renderChartProgressoLavagem(lavagem);
    renderChartProgressoEngraxe(engraxe);
    renderChartPizzaLavagem(lavagem);
    renderChartPizzaEngraxe(engraxe);
    renderChartStatus(lavagem, engraxe);
}

function renderChartProgressoLavagem(lavagem) {
    const ctx = document.getElementById('chartProgressoLavagem').getContext('2d');
    if (chartProgressoLavagem) chartProgressoLavagem.destroy();

    const labels = [];
    const concluidos = [];
    const pendentes = [];

    lavagem.forEach(lista => {
        labels.push(lista.nome);
        const itens = lista.lavagem_itens || [];
        const done = itens.filter(i => ['REALIZADO', 'OK'].includes(i.status)).length;
        const pending = itens.length - done;
        concluidos.push(done);
        pendentes.push(pending);
    });

    chartProgressoLavagem = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Concluídos', data: concluidos, backgroundColor: '#28a745' },
                { label: 'Pendentes', data: pendentes, backgroundColor: '#dc3545' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                x: { stacked: true, grid: { display: false } }, 
                y: { stacked: true, grid: { color: '#f0f0f0' } } 
            },
            plugins: { legend: { labels: { color: '#333' } } }
        }
    });
}

function renderChartProgressoEngraxe(engraxe) {
    const ctx = document.getElementById('chartProgressoEngraxe').getContext('2d');
    if (chartProgressoEngraxe) chartProgressoEngraxe.destroy();

    const labels = [];
    const concluidos = [];
    const pendentes = [];

    engraxe.forEach(lista => {
        labels.push(lista.nome);
        const itens = lista.engraxe_itens || [];
        const done = itens.filter(i => ['REALIZADO', 'OK'].includes(i.status)).length;
        const pending = itens.length - done;
        concluidos.push(done);
        pendentes.push(pending);
    });

    chartProgressoEngraxe = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Concluídos', data: concluidos, backgroundColor: '#28a745' },
                { label: 'Pendentes', data: pendentes, backgroundColor: '#dc3545' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                x: { stacked: true, grid: { display: false } }, 
                y: { stacked: true, grid: { color: '#f0f0f0' } } 
            },
            plugins: { legend: { labels: { color: '#333' } } }
        }
    });
}

function renderChartStatus(lavagem, engraxe) {
    const ctx = document.getElementById('chartStatusServicos').getContext('2d');
    if (chartStatus) chartStatus.destroy();

    let sRealizado = 0, sPendente = 0, sAgendado = 0, sInternado = 0;

    [...lavagem, ...engraxe].forEach(lista => {
        const itens = lista.lavagem_itens || lista.engraxe_itens || [];
        itens.forEach(i => {
            if (['REALIZADO', 'OK'].includes(i.status)) sRealizado++;
            else if (i.status === 'PENDENTE') sPendente++;
            else if (i.status === 'AGENDADO') sAgendado++;
            else if (i.status === 'INTERNADO') sInternado++;
        });
    });

    chartStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Realizado', 'Pendente', 'Agendado', 'Internado'],
            datasets: [{
                data: [sRealizado, sPendente, sAgendado, sInternado],
                backgroundColor: ['#28a745', '#dc3545', '#ffc107', '#007bff']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
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

    lavagem.forEach(lista => {
        const itens = lista.lavagem_itens || [];
        const done = itens.filter(i => ['REALIZADO', 'OK'].includes(i.status)).length;
        const total = itens.length;
        const pending = total - done;

        const wrapper = document.createElement('div');
        wrapper.className = 'pizza-item-wrapper';
        wrapper.innerHTML = `
            <h4 class="pizza-title" title="${lista.nome}">${lista.nome}</h4>
            <div class="chart-wrapper" style="height: 150px;">
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
                    title: { display: true, text: `Total: ${total}`, font: { size: 12 }, padding: 2 },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 11 },
                        formatter: (value) => value > 0 ? value : ''
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
        chartsPizzaLavagem.push(chart);
    });
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

    engraxe.forEach(lista => {
        const itens = lista.engraxe_itens || [];
        const done = itens.filter(i => ['REALIZADO', 'OK'].includes(i.status)).length;
        const total = itens.length;
        const pending = total - done;

        const wrapper = document.createElement('div');
        wrapper.className = 'pizza-item-wrapper';
        wrapper.innerHTML = `
            <h4 class="pizza-title" title="${lista.nome}">${lista.nome}</h4>
            <div class="chart-wrapper" style="height: 150px;">
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
                    title: { display: true, text: `Total: ${total}`, font: { size: 12 }, padding: 2 },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 11 },
                        formatter: (value) => value > 0 ? value : ''
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
        chartsPizzaEngraxe.push(chart);
    });
}

function iniciarRolagemAutomatica() {
    const wrapper = document.querySelector('.marquee-wrapper');
    if (!wrapper) return;
    let direction = 1;
    const speed = 1;
    function step() {
        if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 1) direction = -1;
        else if (wrapper.scrollLeft <= 0) direction = 1;
        wrapper.scrollLeft += speed * direction;
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}