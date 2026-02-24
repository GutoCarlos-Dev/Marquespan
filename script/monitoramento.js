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
let chartEmManutencaoAtual = null;

// Cores padrão dos status
const STATUS_COLORS = {
    'FINALIZADO': '#28a745',       // Verde Escuro
    'PENDENTE': '#dc3545',         // Vermelho Escuro
    'INTERNADO': '#007bff',        // Azul Escuro
    'CHECK-IN OFICINA': '#ffc107', // Amarelo Escuro
    'CHECK-IN ROTA': '#fd7e14',    // Laranja Escuro
    'FINALIZADO ROTA': '#006400'   // Verde Muito Escuro
};

// Intervalo de atualização automática (30 segundos)
const REFRESH_INTERVAL = 30000;
let refreshTimer;

document.addEventListener('DOMContentLoaded', () => {
    randomizarGraficos(); // Embaralha a ordem antes de iniciar
    initDashboard();
    carregarFiliais();
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

    // Adiciona tooltip explicativo ao card de Total de Manutenções
    const kpiCardTotalQtd = document.getElementById('kpi-total-qtd')?.parentElement;
    if (kpiCardTotalQtd) {
        kpiCardTotalQtd.title = "Soma total de serviços com status 'Finalizado', 'Internado', 'Check-in Oficina' e 'Check-in Rota' no período selecionado.";
    }

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
    const filial = document.getElementById('filtroFilial').value;
    const statusEl = document.getElementById('filtroStatus');
    const status = statusEl ? statusEl.value : '';

    carregarTotalFrota(filial); // Busca total da frota
    carregarDadosEstoque(); // Busca dados de estoque para o novo gráfico
    const kpiCounts = await carregarKPIsDetalhados(dtIni, dtFim, filial, status); // Busca KPIs com contagem exata e aguarda retorno
    carregarEmManutencaoAtual(filial); // Carrega gráfico geral filtrado apenas por filial

    try {
        // Busca dados unindo checklist (itens), cabeçalho (data/placa) e oficinas (nome)
        let query = supabaseClient
            .from('coletas_manutencao_checklist')
            .select(`
                *,
                coletas_manutencao!inner (
                    id,
                    data_hora,
                    placa,
                    veiculos!inner (
                        filial
                    )
                ),
                oficinas (
                    nome
                )
            `)
            .gte('coletas_manutencao.data_hora', `${dtIni}T00:00:00`)
            .lte('coletas_manutencao.data_hora', `${dtFim}T23:59:59`)
            .limit(10000); // Aumenta o limite para garantir que os gráficos recebam todos os dados

        if (filial) {
            query = query.eq('coletas_manutencao.veiculos.filial', filial);
        }
        if (status) {
            if (status === 'PENDENTE') {
                query = query.in('status', ['PENDENTE', 'NAO REALIZADO', 'NÃO REALIZADO']);
            } else if (status === 'FINALIZADO') {
                query = query.in('status', ['FINALIZADO', 'OK']);
            } else {
                query = query.eq('status', status);
            }
        }

        const { data, error } = await query;

        if (error) throw error;

        // atualizarKPIs(data); // Removido: KPIs agora são carregados por carregarKPIsDetalhados
        atualizarGraficos(data, kpiCounts);
        
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

async function carregarKPIsDetalhados(dtIni, dtFim, filial, status) {
    let counts = { 
        pendentes: 0, 
        internados: 0,
        finalizados: 0,
        checkinOficina: 0,
        checkinRota: 0,
        finalizadoRota: 0
    };
    try {
        // Helper function to apply the global status filter consistently
        const applyStatusFilter = (query) => {
            if (!status) return query; // No filter, return original
            if (status === 'PENDENTE') {
                return query.in('coletas_manutencao_checklist.status', ['PENDENTE', 'NAO REALIZADO', 'NÃO REALIZADO']);
            } else if (status === 'FINALIZADO') {
                return query.in('coletas_manutencao_checklist.status', ['FINALIZADO', 'OK']);
            } else {
                return query.eq('coletas_manutencao_checklist.status', status);
            }
        };

        // 1. Total Pendentes (Contar Itens/Serviços)
        // Filtro igual ao da página de coleta: Status PENDENTE (incluindo variações)
        let queryPendentes = supabaseClient
            .from('coletas_manutencao_checklist')
            .select('*, coletas_manutencao!inner(id, veiculos!inner(filial))', { count: 'exact', head: true })
            .in('status', ['PENDENTE', 'NAO REALIZADO', 'NÃO REALIZADO']);

        if (filial) queryPendentes = queryPendentes.eq('coletas_manutencao.veiculos.filial', filial);
        if (status) queryPendentes = applyStatusFilter(queryPendentes);

        const { count: countPendentes, error: errPendentes } = await queryPendentes;

        if (!errPendentes) {
            document.getElementById('kpi-pendentes').textContent = countPendentes || 0;
            counts.pendentes = countPendentes || 0;
        }

        // 2. Veículos Internados (Contar Itens)
        // Removido filtro de data para mostrar o total GERAL (Status Atual)
        let queryInternados = supabaseClient
            .from('coletas_manutencao_checklist')
            .select('*, coletas_manutencao!inner(id, veiculos!inner(filial))', { count: 'exact', head: true })
            .eq('status', 'INTERNADO');

        if (filial) queryInternados = queryInternados.eq('coletas_manutencao.veiculos.filial', filial);
        if (status) queryInternados = applyStatusFilter(queryInternados);

        const { count: countInternados, error: errInternados } = await queryInternados;

        if (!errInternados) {
            document.getElementById('kpi-internados').textContent = countInternados || 0;
            counts.internados = countInternados || 0;
        }

        // --- NOVOS CONTADORES PARA O GRÁFICO DE STATUS (PERÍODO SELECIONADO) ---

        // FINALIZADO (inclui OK)
        let queryFinalizadosPeriodo = supabaseClient
            .from('coletas_manutencao_checklist')
            .select('*, coletas_manutencao!inner(id, veiculos!inner(filial))', { count: 'exact', head: true })
            .in('status', ['FINALIZADO', 'OK'])
            .gte('coletas_manutencao.data_hora', `${dtIni}T00:00:00`)
            .lte('coletas_manutencao.data_hora', `${dtFim}T23:59:59`);

        if (filial) queryFinalizadosPeriodo = queryFinalizadosPeriodo.eq('coletas_manutencao.veiculos.filial', filial);
        if (status) queryFinalizadosPeriodo = applyStatusFilter(queryFinalizadosPeriodo);
        const { count: countFinalizadosPeriodo } = await queryFinalizadosPeriodo;
        counts.finalizados = countFinalizadosPeriodo || 0;

        // CHECK-IN OFICINA (Status Atual - Sem filtro de data)
        let queryCheckinOficina = supabaseClient
            .from('coletas_manutencao_checklist')
            .select('*, coletas_manutencao!inner(id, veiculos!inner(filial))', { count: 'exact', head: true })
            .eq('status', 'CHECK-IN OFICINA');

        if (filial) queryCheckinOficina = queryCheckinOficina.eq('coletas_manutencao.veiculos.filial', filial);
        if (status) queryCheckinOficina = applyStatusFilter(queryCheckinOficina);
        const { count: countCheckinOficina } = await queryCheckinOficina;
        counts.checkinOficina = countCheckinOficina || 0;
        
        // Atualiza o card no DOM
        const kpiCheckinOficina = document.getElementById('kpi-checkin-oficina');
        if (kpiCheckinOficina) kpiCheckinOficina.textContent = countCheckinOficina || 0;

        // CHECK-IN ROTA (Status Atual - Sem filtro de data)
        let queryCheckinRota = supabaseClient
            .from('coletas_manutencao_checklist')
            .select('*, coletas_manutencao!inner(id, veiculos!inner(filial))', { count: 'exact', head: true })
            .eq('status', 'CHECK-IN ROTA');

        if (filial) queryCheckinRota = queryCheckinRota.eq('coletas_manutencao.veiculos.filial', filial);
        if (status) queryCheckinRota = applyStatusFilter(queryCheckinRota);
        const { count: countCheckinRota } = await queryCheckinRota;
        counts.checkinRota = countCheckinRota || 0;

        // Atualiza o card no DOM
        const kpiCheckinRota = document.getElementById('kpi-checkin-rota');
        if (kpiCheckinRota) kpiCheckinRota.textContent = countCheckinRota || 0;

        // FINALIZADO ROTA
        let queryFinalizadoRota = supabaseClient
            .from('coletas_manutencao_checklist')
            .select('*, coletas_manutencao!inner(id, veiculos!inner(filial))', { count: 'exact', head: true })
            .eq('status', 'FINALIZADO ROTA')
            .gte('coletas_manutencao.data_hora', `${dtIni}T00:00:00`)
            .lte('coletas_manutencao.data_hora', `${dtFim}T23:59:59`);

        if (filial) queryFinalizadoRota = queryFinalizadoRota.eq('coletas_manutencao.veiculos.filial', filial);
        if (status) queryFinalizadoRota = applyStatusFilter(queryFinalizadoRota);
        const { count: countFinalizadoRota } = await queryFinalizadoRota;
        counts.finalizadoRota = countFinalizadoRota || 0;

        // 3. Finalizados Hoje (Contar Itens)
        // Usa a data atual do sistema para filtrar "Hoje"
        // Formata a data como 'YYYY-MM-DD' para evitar problemas de fuso horário.
        // O Supabase interpretará como o dia inteiro na timezone do banco (UTC).
        const hojeStr = new Date().toISOString().split('T')[0];

        let queryFinalizados = supabaseClient
            .from('coletas_manutencao_checklist')
            .select('*, coletas_manutencao!inner(id, veiculos!inner(filial))', { count: 'exact', head: true })
            .in('status', ['FINALIZADO', 'FINALIZADO ROTA', 'OK'])
            .gte('coletas_manutencao.data_hora', `${hojeStr}T00:00:00`)
            .lte('coletas_manutencao.data_hora', `${hojeStr}T23:59:59`);

        if (filial) queryFinalizados = queryFinalizados.eq('coletas_manutencao.veiculos.filial', filial);
        if (status) queryFinalizados = applyStatusFilter(queryFinalizados);

        const { count: countFinalizados, error: errFinalizados } = await queryFinalizados;

        if (!errFinalizados) {
            document.getElementById('kpi-finalizados-hoje').textContent = countFinalizados || 0;
        }

        // 4. Total Manutenções (Soma de status específicos no período)
        const statusesParaContar = ['CHECK-IN OFICINA', 'CHECK-IN ROTA', 'INTERNADO', 'FINALIZADO', 'OK'];
        let queryManutencoes = supabaseClient
            .from('coletas_manutencao_checklist')
            .select('id, coletas_manutencao!inner(data_hora, veiculos!inner(filial))', { count: 'exact', head: true })
            .in('status', statusesParaContar)
            .gte('coletas_manutencao.data_hora', `${dtIni}T00:00:00`)
            .lte('coletas_manutencao.data_hora', `${dtFim}T23:59:59`);

        if (filial) {
            queryManutencoes = queryManutencoes.eq('coletas_manutencao.veiculos.filial', filial);
        }

        const { count: countManutencoes, error: errManutencoes } = await queryManutencoes;

        if (!errManutencoes) {
            document.getElementById('kpi-total-qtd').textContent = countManutencoes || 0;
        }

        // 5. Gasto Total (Soma dos valores)
        
        let totalValor = 0;
        let from = 0;
        const step = 1000; // Ajustado para 1000 (limite padrão do Supabase) para evitar parada prematura
        let keepFetching = true;

        while (keepFetching) {
            let queryValores = supabaseClient
                .from('coletas_manutencao_checklist')
                .select('valor, coletas_manutencao!inner(id, veiculos!inner(filial))')
                .gte('coletas_manutencao.data_hora', `${dtIni}T00:00:00`)
                .lte('coletas_manutencao.data_hora', `${dtFim}T23:59:59`)
                .range(from, from + step - 1);

            if (filial) queryValores = queryValores.eq('coletas_manutencao.veiculos.filial', filial);
            if (status) queryValores = applyStatusFilter(queryValores);

            const { data: dataValores, error: errValores } = await queryValores;

            if (errValores) {
                console.error('Erro ao calcular gasto total:', errValores);
                keepFetching = false;
            } else {
                if (dataValores && dataValores.length > 0) {
                    totalValor += dataValores.reduce((acc, item) => acc + (parseFloat(item.valor) || 0), 0);
                    if (dataValores.length < step) keepFetching = false;
                    else from += step;
                } else {
                    keepFetching = false;
                }
            }
        }
        document.getElementById('kpi-total-valor').textContent = totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    } catch (error) {
        console.error('Erro ao carregar KPIs detalhados:', error);
    }
    return counts;
}

async function carregarTotalFrota(filial) {
    try {
        let query = supabaseClient
            .from('veiculos')
            .select('*', { count: 'exact', head: true })
            .neq('tipo', 'SEMI-REBOQUE'); // Exclui SEMI-REBOQUE da contagem principal

        if (filial) query = query.eq('filial', filial);

        const { count, error } = await query;

        if (error) throw error;

        const kpi = document.getElementById('kpi-total-frota');
        if (kpi) kpi.textContent = count;
    } catch (error) {
        console.error('Erro ao carregar total da frota:', error);
    }
}

async function carregarFiliais() {
    const select = document.getElementById('filtroFilial');
    if (!select) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');
            
        if (data) {
            data.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.sigla || f.nome;
                opt.textContent = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Erro ao carregar filiais", err);
    }
}

function atualizarGraficos(data, kpiCounts) {
    renderChartEvolucao(data);
    renderChartTopPlacas(data);
    renderChartOficinas(data);
    renderChartStatus(data, kpiCounts);
    renderChartTopServicosFreq(data);
    renderChartTopServicosCusto(data);
    renderChartPendentesInternados(data, kpiCounts);
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

async function carregarEmManutencaoAtual(filial) {
    try {
        let query;
        
        if (filial) {
            // Se tem filial, precisa do join para filtrar
            query = supabaseClient
                .from('coletas_manutencao_checklist')
                .select('status, coletas_manutencao!inner(veiculos!inner(filial))')
                .in('status', ['INTERNADO', 'CHECK-IN OFICINA', 'CHECK-IN ROTA'])
                .eq('coletas_manutencao.veiculos.filial', filial);
        } else {
            // Se não tem filial, busca direto (mais rápido e evita problemas com joins)
            query = supabaseClient
                .from('coletas_manutencao_checklist')
                .select('status')
                .in('status', ['INTERNADO', 'CHECK-IN OFICINA', 'CHECK-IN ROTA']);
        }

        const { data, error } = await query;

        if (error) throw error;

        const counts = {
            'INTERNADO': 0,
            'CHECK-IN OFICINA': 0,
            'CHECK-IN ROTA': 0
        };

        if (data) {
            data.forEach(item => {
                const s = item.status;
                if (counts[s] !== undefined) {
                    counts[s]++;
                }
            });
        }

        renderChartEmManutencaoAtual(counts);

    } catch (error) {
        console.error('Erro ao carregar Em Manutenção Atual:', error);
    }
}

function renderChartEmManutencaoAtual(counts) {
    const ctx = document.getElementById('chartEmManutencaoAtual');
    if (!ctx) return;
    
    if (chartEmManutencaoAtual) chartEmManutencaoAtual.destroy();

    const total = counts['INTERNADO'] + counts['CHECK-IN OFICINA'] + counts['CHECK-IN ROTA'];

    chartEmManutencaoAtual = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['INTERNADO', 'CHECK-IN OFICINA', 'CHECK-IN ROTA'],
            datasets: [{
                data: [counts['INTERNADO'], counts['CHECK-IN OFICINA'], counts['CHECK-IN ROTA']],
                backgroundColor: [
                    STATUS_COLORS['INTERNADO'], 
                    STATUS_COLORS['CHECK-IN OFICINA'], 
                    STATUS_COLORS['CHECK-IN ROTA']
                ],
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
                    labels: { font: { size: 12 } }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold' },
                    formatter: (value) => value > 0 ? value : ''
                },
                title: {
                    display: true,
                    text: `Total: ${total}`,
                    font: { size: 16 },
                    position: 'top'
                }
            },
            cutout: '60%'
        },
        plugins: [ChartDataLabels]
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
            let dataStr = 'N/A';
            if (item.coletas_manutencao.data_hora) {
                const isoDate = item.coletas_manutencao.data_hora.split('T')[0];
                const [ano, mes, dia] = isoDate.split('-');
                dataStr = `${dia}/${mes}/${ano}`;
            }
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

function renderChartStatus(data, kpiCounts) {
    const contagem = {};

    if (kpiCounts) {
        // Usa os valores exatos do banco de dados
        if (kpiCounts.pendentes > 0) contagem['PENDENTE'] = kpiCounts.pendentes;
        if (kpiCounts.internados > 0) contagem['INTERNADO'] = kpiCounts.internados;
        if (kpiCounts.finalizados > 0) contagem['FINALIZADO'] = kpiCounts.finalizados;
        if (kpiCounts.checkinOficina > 0) contagem['CHECK-IN OFICINA'] = kpiCounts.checkinOficina;
        if (kpiCounts.checkinRota > 0) contagem['CHECK-IN ROTA'] = kpiCounts.checkinRota;
        if (kpiCounts.finalizadoRota > 0) contagem['FINALIZADO ROTA'] = kpiCounts.finalizadoRota;
    } else {
        // Fallback para contagem local (caso kpiCounts não esteja disponível)
        data.forEach(item => {
            let status = (item.status || 'N/A').toUpperCase();
            
            // Normalização de status para consistência com os KPIs
            if (status === 'NAO REALIZADO' || status === 'NÃO REALIZADO') status = 'PENDENTE';
            if (status === 'OK') status = 'FINALIZADO';

            if (!contagem[status]) contagem[status] = 0;
            contagem[status]++;
        });
    }

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

function renderChartPendentesInternados(data, kpiCounts) {
    // Contagem total de Pendentes e Internados
    let totalPendente = 0;
    let totalInternado = 0;

    if (kpiCounts) {
        // Usa os valores exatos dos KPIs se disponíveis
        totalPendente = kpiCounts.pendentes;
        totalInternado = kpiCounts.internados;
    } else {
        data.forEach(item => {
            const s = (item.status || '').toUpperCase();
            if (s === 'PENDENTE' || s === 'NAO REALIZADO' || s === 'NÃO REALIZADO') totalPendente++;
            if (s === 'INTERNADO') totalInternado++;
        });
    }

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