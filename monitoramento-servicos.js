import { supabaseClient } from './supabase.js';

const MonitoramentoServicos = {
    charts: {},
    // Configuração de Status e Cores conforme lavagem.html
    lavagemConfig: {
        'REALIZADO': { color: '#28a745', label: 'Realizado' },
        'PENDENTE': { color: '#dc3545', label: 'Pendente' },
        'INTERNADO': { color: '#007bff', label: 'Internado' },
        'AGENDADO': { color: '#ffc107', label: 'Agendado' },
        'DISPENSADO': { color: '#6c757d', label: 'Dispensado' }
    },
    // Configuração para Engraxe (Baseado no mobile-engraxe.js)
    engraxeConfig: {
        'OK': { color: '#28a745', label: 'Realizado' },
        'PENDENTE': { color: '#dc3545', label: 'Pendente' },
        'INTERNADO': { color: '#007bff', label: 'Internado' },
        'ROTA': { color: '#17a2b8', label: 'Em Rota' }
    },

    async init() {
        this.setupEventListeners();
        this.setDefaultDates();
        await this.carregarFiliais();
        await this.atualizarDashboard();

        // Auto-refresh a cada 5 minutos
        setInterval(() => this.atualizarDashboard(), 300000);
    },

    setupEventListeners() {
        document.getElementById('btn-refresh')?.addEventListener('click', () => this.atualizarDashboard());
        document.getElementById('btn-aplicar-filtro')?.addEventListener('click', () => this.atualizarDashboard());
        document.getElementById('btn-fullscreen')?.addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.toggle('collapsed');
        });
    },

    setDefaultDates() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = now.toISOString().split('T')[0];
        document.getElementById('dataInicial').value = firstDay;
        document.getElementById('dataFinal').value = lastDay;
    },

    async carregarFiliais() {
        const { data } = await supabaseClient.from('filiais').select('sigla').order('sigla');
        const select = document.getElementById('filtroFilial');
        if (data && select) {
            data.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.sigla;
                opt.textContent = f.sigla;
                select.appendChild(opt);
            });
        }
    },

    async atualizarDashboard() {
        const btn = document.getElementById('btn-refresh');
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const filtro = {
                filial: document.getElementById('filtroFilial').value,
                inicio: document.getElementById('dataInicial').value,
                fim: document.getElementById('dataFinal').value
            };

            // 1. Buscar dados de Lavagem
            const { data: itensLavagem } = await supabaseClient
                .from('lavagem_itens')
                .select('status, lavagem_listas!inner(nome, data_lavagem, status_lista, filial)')
                .gte('lavagem_listas.data_lavagem', filtro.inicio)
                .lte('lavagem_listas.data_lavagem', filtro.fim);

            // 2. Buscar dados de Engraxe
            const { data: itensEngraxe } = await supabaseClient
                .from('engraxe_itens')
                .select('status, engraxe_listas!inner(nome, data_lista, status_lista, filial)')
                .gte('engraxe_listas.data_lista', filtro.inicio)
                .lte('engraxe_listas.data_lista', filtro.fim);

            this.renderizarGraficoGeral(itensLavagem, 'chartProgressoLavagem', this.lavagemConfig);
            this.renderizarPizzasPorLista(itensLavagem, 'containerPizzasLavagem', this.lavagemConfig, 'lavagem_listas');
            
            this.renderizarGraficoGeral(itensEngraxe, 'chartProgressoEngraxe', this.engraxeConfig);
            this.renderizarPizzasPorLista(itensEngraxe, 'containerPizzasEngraxe', this.engraxeConfig, 'engraxe_listas');

            this.atualizarKPIs(itensLavagem, itensEngraxe);
            
            document.getElementById('last-update').textContent = `Atualizado às: ${new Date().toLocaleTimeString('pt-BR')}`;
        } catch (err) {
            console.error('Erro ao atualizar dashboard:', err);
        } finally {
            if (btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        }
    },

    renderizarGraficoGeral(dados, canvasId, config) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (this.charts[canvasId]) this.charts[canvasId].destroy();

        const counts = {};
        Object.keys(config).forEach(status => counts[status] = 0);
        
        dados?.forEach(item => {
            if (counts[item.status] !== undefined) counts[item.status]++;
        });

        this.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.values(config).map(c => c.label),
                datasets: [{
                    data: Object.keys(config).map(status => counts[status]),
                    backgroundColor: Object.values(config).map(c => c.color),
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    },

    renderizarPizzasPorLista(dados, containerId, config, relationKey) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        if (!dados || dados.length === 0) {
            container.innerHTML = '<p class="no-data">Sem listas no período.</p>';
            return;
        }

        // Agrupa por lista
        const listas = {};
        dados.forEach(item => {
            const nome = item[relationKey].nome;
            if (!listas[nome]) listas[nome] = { nome, counts: {} };
            listas[nome].counts[item.status] = (listas[nome].counts[item.status] || 0) + 1;
        });

        Object.values(listas).forEach(lista => {
            const div = document.createElement('div');
            div.className = 'mini-chart-card';
            div.innerHTML = `<h4>${lista.nome}</h4><canvas id="chart-${containerId}-${lista.nome.replace(/\s+/g, '')}"></canvas>`;
            container.appendChild(div);

            const ctx = div.querySelector('canvas').getContext('2d');
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: Object.values(config).map(c => c.label),
                    datasets: [{
                        data: Object.keys(config).map(s => lista.counts[s] || 0),
                        backgroundColor: Object.values(config).map(c => c.color)
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } }
                }
            });
        });
    },

    atualizarKPIs(lavagem, engraxe) {
        // Listas Abertas
        const listasLavagem = new Set(lavagem?.filter(i => i.lavagem_listas.status_lista === 'ABERTA').map(i => i.lavagem_listas.nome));
        const listasEngraxe = new Set(engraxe?.filter(i => i.engraxe_listas.status_lista === 'ABERTA').map(i => i.engraxe_listas.nome));
        document.getElementById('kpi-listas-abertas').textContent = listasLavagem.size + listasEngraxe.size;

        // Pendentes
        document.getElementById('kpi-lavagem-pendente').textContent = lavagem?.filter(i => i.status === 'PENDENTE').length || 0;
        document.getElementById('kpi-engraxe-pendente').textContent = engraxe?.filter(i => i.status === 'PENDENTE').length || 0;

        // Realizados hoje
        const hoje = new Date().toISOString().split('T')[0];
        // Nota: Para precisão total, precisaríamos da data de conclusão do item, 
        // aqui estamos estimando pela data da lista ou filtrando se houver campo data_realizado
        const realizadosLavagem = lavagem?.filter(i => i.status === 'REALIZADO').length || 0;
        const realizadosEngraxe = engraxe?.filter(i => i.status === 'OK').length || 0;
        document.getElementById('kpi-realizados-hoje').textContent = realizadosLavagem + realizadosEngraxe;
    },

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            document.querySelector('.container').classList.add('fullscreen-active');
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                document.querySelector('.container').classList.remove('fullscreen-active');
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => MonitoramentoServicos.init());