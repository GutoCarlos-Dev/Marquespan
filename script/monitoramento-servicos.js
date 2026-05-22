import { supabaseClient } from './supabase.js';

const REFRESH_INTERVAL = 60000;
const TIMEZONE_SAO_PAULO = 'America/Sao_Paulo';
const DONE_STATUSES = ['REALIZADO', 'OK', 'DISPENSADO', 'NAO_ENGRAXAR'];
const PENDING_STATUSES = ['', 'PENDENTE', 'NAO REALIZADO', 'NAO_REALIZADO'];

let listasLavagem = [];
let listasEngraxe = [];
let veiculosPorPlaca = new Map();
let servicosChannel = null;
let refreshTimer = null;
let chartStatus = null;
let chartGastoMensalLavagem = null;
let chartGastoAnualLavagem = null;
let chartGastoMensalEngraxe = null;
let chartGastoAnualEngraxe = null;

document.addEventListener('DOMContentLoaded', () => {
    initServicosRealTime();
});

function initServicosRealTime() {
    definirPeriodoInicial();

    document.getElementById('btn-aplicar-filtro')?.addEventListener('click', carregarDados);
    document.getElementById('btn-refresh')?.addEventListener('click', carregarDados);
    document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullScreen);
    document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => window.toggleSidebar && window.toggleSidebar());
    document.getElementById('filtroFilial')?.addEventListener('change', renderDashboard);
    document.getElementById('searchInput')?.addEventListener('input', renderDashboard);

    document.addEventListener('fullscreenchange', atualizarEstadoTelaCheia);

    carregarFiliais();
    carregarDados();
    configurarRealtime();
    iniciarRolagemAutomatica();

    refreshTimer = setInterval(carregarDados, REFRESH_INTERVAL);
}

function definirPeriodoInicial() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    setDateValue('dataInicial', primeiroDia);
    setDateValue('dataFinal', hoje);
}

function setDateValue(id, date) {
    const el = document.getElementById(id);
    if (!el) return;
    const localDate = new Date(date);
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    el.value = localDate.toISOString().split('T')[0];
}

async function carregarFiliais() {
    const select = document.getElementById('filtroFilial');
    if (!select) return;

    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');

        if (error) throw error;

        (data || []).forEach(filial => {
            const valor = filial.sigla || filial.nome;
            if (valor) select.appendChild(new Option(valor, valor));
        });
    } catch (error) {
        console.error('Erro ao carregar filiais:', error);
    }
}

async function carregarDados() {
    const btnRefresh = document.getElementById('btn-refresh');
    btnRefresh?.classList.add('fa-spin');

    try {
        const [resLavagem, resEngraxe] = await Promise.all([
            montarQueryListas('lavagem_listas', 'lavagem_itens(*)'),
            montarQueryListas('engraxe_listas', 'engraxe_itens(*)')
        ]);

        if (resLavagem.error) throw resLavagem.error;
        if (resEngraxe.error) throw resEngraxe.error;

        listasLavagem = normalizarListas(resLavagem.data || [], 'lavagem');
        listasEngraxe = normalizarListas(resEngraxe.data || [], 'engraxe');

        await carregarVeiculos([...listasLavagem, ...listasEngraxe]);
        renderDashboard();
        carregarGraficosFinanceiros();
        atualizarTimestamp();
    } catch (error) {
        console.error('Erro ao carregar monitoramento de servicos:', error);
        renderErro();
    } finally {
        btnRefresh?.classList.remove('fa-spin');
    }
}

function montarQueryListas(tabela, itensSelect) {
    const dataInicial = document.getElementById('dataInicial')?.value;
    const dataFinal = document.getElementById('dataFinal')?.value;
    let query = supabaseClient
        .from(tabela)
        .select(`*, ${itensSelect}`)
        .eq('status', 'ABERTA')
        .order('created_at', { ascending: false });

    if (dataInicial) query = query.gte('data_lista', dataInicial);
    if (dataFinal) query = query.lte('data_lista', dataFinal);

    return query;
}

function normalizarListas(listas, tipo) {
    return listas.map(lista => ({
        ...lista,
        tipo,
        itens: tipo === 'lavagem' ? (lista.lavagem_itens || []) : (lista.engraxe_itens || [])
    }));
}

async function carregarVeiculos(listas) {
    const placas = [...new Set(listas.flatMap(lista => lista.itens.map(item => normalizarPlaca(item.placa))).filter(Boolean))];
    veiculosPorPlaca = new Map();

    if (placas.length === 0) return;

    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('placa, filial, modelo, tipo, marca')
            .in('placa', placas);

        if (error) throw error;

        (data || []).forEach(veiculo => {
            veiculosPorPlaca.set(normalizarPlaca(veiculo.placa), veiculo);
        });
    } catch (error) {
        console.warn('Nao foi possivel carregar dados dos veiculos:', error);
    }
}

function configurarRealtime() {
    if (servicosChannel) {
        supabaseClient.removeChannel(servicosChannel);
    }

    servicosChannel = supabaseClient
        .channel('monitoramento-servicos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lavagem_listas' }, carregarDados)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lavagem_itens' }, carregarDados)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'engraxe_listas' }, carregarDados)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'engraxe_itens' }, carregarDados)
        .subscribe((status) => {
            const online = status === 'SUBSCRIBED';
            atualizarStatusRealtime(online ? 'online' : 'offline', online ? 'Online' : 'Conectando');
        });
}

function renderDashboard() {
    const lavagem = filtrarListas(listasLavagem);
    const engraxe = filtrarListas(listasEngraxe);
    const todas = [...lavagem, ...engraxe];
    const statsLavagem = calcularStats(lavagem);
    const statsEngraxe = calcularStats(engraxe);
    const stats = calcularStats(todas);
    const percentual = stats.total ? Math.round((stats.concluidos / stats.total) * 100) : 0;

    setText('kpi-lavagem-concluidos', statsLavagem.concluidos);
    setText('kpi-lavagem-pendentes', statsLavagem.pendentes);
    setText('kpi-lavagem-total', statsLavagem.total);
    setText('kpi-engraxe-concluidos', statsEngraxe.concluidos);
    setText('kpi-engraxe-pendentes', statsEngraxe.pendentes);
    setText('kpi-engraxe-total', statsEngraxe.total);
    setText('count-lavagem-lista', lavagem.length);
    setText('count-engraxe-lista', engraxe.length);
    setText('progress-label', `${percentual}%`);

    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.width = `${percentual}%`;

    renderLista('lista-lavagem', ordenarListas(lavagem), 'lavagem');
    renderLista('lista-engraxe', ordenarListas(engraxe), 'engraxe');
    renderChartStatus(lavagem, engraxe);
}

function filtrarListas(listas) {
    const filial = document.getElementById('filtroFilial')?.value || '';
    const termo = (document.getElementById('searchInput')?.value || '').trim().toUpperCase();

    return listas
        .map(lista => {
            const itensDaFilial = filial ? filtrarItens(lista.itens, filial, '') : lista.itens;
            return {
                ...lista,
                itensDaFilial,
                itensFiltrados: termo ? filtrarItens(itensDaFilial, '', termo) : itensDaFilial
            };
        })
        .filter(lista => {
            if (filial && lista.itensDaFilial.length === 0) return false;
            if (!termo) return true;
            const textoLista = montarTextoLista(lista).toUpperCase();
            return textoLista.includes(termo) || lista.itensFiltrados.length > 0;
        });
}

function filtrarItens(itens, filial, termo) {
    return itens.filter(item => {
        const placa = normalizarPlaca(item.placa);
        const veiculo = veiculosPorPlaca.get(placa);

        if (filial && veiculo?.filial !== filial) return false;
        if (!termo) return true;

        const texto = [
            item.placa,
            item.modelo,
            item.marca,
            item.status,
            item.tipo_lavagem,
            item.fornecedor,
            veiculo?.modelo,
            veiculo?.tipo,
            veiculo?.marca,
            veiculo?.filial
        ].join(' ').toUpperCase();

        return texto.includes(termo);
    });
}

function montarTextoLista(lista) {
    return [
        lista.nome,
        lista.status,
        lista.usuario,
        lista.usuario_criacao,
        lista.fornecedor,
        ...(lista.marcas_presentes || [])
    ].join(' ');
}

function calcularStats(listas) {
    return listas.reduce((acc, lista) => {
        const itens = lista.itensFiltrados || lista.itens || [];
        const resumo = resumirItens(itens);
        acc.total += resumo.total;
        acc.concluidos += resumo.concluidos;
        acc.pendentes += resumo.pendentes;
        return acc;
    }, { total: 0, concluidos: 0, pendentes: 0 });
}

function resumirItens(itens) {
    return (itens || []).reduce((acc, item) => {
        const status = normalizarStatus(item.status);
        acc.total++;

        if (DONE_STATUSES.includes(status)) {
            acc.concluidos++;
        } else if (PENDING_STATUSES.includes(status)) {
            acc.pendentes++;
        } else {
            acc.outros++;
        }

        if (status === 'INTERNADO') acc.internados++;
        if (status === 'AGENDADO') acc.agendados++;
        return acc;
    }, { total: 0, concluidos: 0, pendentes: 0, internados: 0, agendados: 0, outros: 0 });
}

function renderLista(containerId, listas, tipo) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (listas.length === 0) {
        container.innerHTML = `<div class="empty-state">Nenhuma lista de ${tipo === 'lavagem' ? 'lavagem' : 'engraxe'} aberta para os filtros.</div>`;
        return;
    }

    container.innerHTML = listas.map(lista => montarCard(lista, tipo)).join('');
}

function montarCard(lista, tipo) {
    const itens = lista.itensFiltrados || lista.itens || [];
    const resumo = resumirItens(itens);
    const percentual = resumo.total ? Math.round((resumo.concluidos / resumo.total) * 100) : 0;
    const destino = tipo === 'lavagem' ? `lavagem.html?id=${encodeURIComponent(lista.id)}` : `engraxe.html?id=${encodeURIComponent(lista.id)}`;
    const icone = tipo === 'lavagem' ? 'fa-shower' : 'fa-oil-can';
    const data = formatarData(lista.data_lista || lista.created_at);
    const responsavel = lista.usuario_criacao || lista.usuario || 'Usuario N/I';
    const fornecedor = lista.fornecedor ? `<span><i class="fas fa-store"></i> ${escapeHtml(lista.fornecedor)}</span>` : '';
    const marcas = lista.marcas_presentes?.length ? `<span><i class="fas fa-tags"></i> ${escapeHtml(lista.marcas_presentes.join(', '))}</span>` : '';
    const concluidoClass = percentual === 100 && resumo.total > 0 ? 'concluido' : '';

    return `
        <a class="service-card ${tipo} ${concluidoClass}" href="${destino}">
            <div class="service-icon"><i class="fas ${icone}"></i></div>
            <div class="service-main">
                <div class="service-title">
                    <span class="service-name">${escapeHtml(lista.nome || 'Lista sem nome')}</span>
                    <span class="service-date">${escapeHtml(data)}</span>
                </div>
                <div class="service-details">
                    <span><i class="fas fa-user"></i> ${escapeHtml(responsavel)}</span>
                    <span><i class="fas fa-truck"></i> ${resumo.total} veiculos</span>
                    ${fornecedor}
                    ${marcas}
                </div>
                <div class="service-progress">
                    <div class="progress-track">
                        <div class="progress-bar" style="width: ${percentual}%"></div>
                    </div>
                </div>
                <div class="status-chips">
                    <span class="status-chip realizado">${resumo.concluidos} concluidos</span>
                    <span class="status-chip pendente">${resumo.pendentes} pendentes</span>
                    ${resumo.internados ? `<span class="status-chip internado">${resumo.internados} internados</span>` : ''}
                    ${resumo.agendados ? `<span class="status-chip agendado">${resumo.agendados} agendados</span>` : ''}
                    ${resumo.outros ? `<span class="status-chip">${resumo.outros} outros</span>` : ''}
                </div>
            </div>
            <div class="service-status">
                Progresso
                <strong>${percentual}%</strong>
            </div>
        </a>
    `;
}

function ordenarListas(listas) {
    return [...listas].sort((a, b) => {
        const statsA = resumirItens(a.itensFiltrados || a.itens || []);
        const statsB = resumirItens(b.itensFiltrados || b.itens || []);
        const pendentesDiff = statsB.pendentes - statsA.pendentes;
        if (pendentesDiff !== 0) return pendentesDiff;
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { numeric: true });
    });
}

function normalizarStatus(status) {
    return String(status || '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizarPlaca(placa) {
    return String(placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function formatarData(value) {
    if (!value) return '-';
    const data = String(value).split('T')[0];
    const match = data.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '-';
    return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatarHoraSaoPaulo(value = new Date()) {
    return new Date(value).toLocaleTimeString('pt-BR', {
        timeZone: TIMEZONE_SAO_PAULO,
        hour: '2-digit',
        minute: '2-digit'
    });
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function atualizarTimestamp() {
    const el = document.getElementById('last-update');
    if (el) el.textContent = `Atualizado as: ${formatarHoraSaoPaulo()}`;
}

function atualizarStatusRealtime(status, texto) {
    const el = document.getElementById('realtime-status');
    if (!el) return;

    el.classList.toggle('online', status === 'online');
    el.classList.toggle('offline', status !== 'online');
    el.innerHTML = `<i class="fas fa-circle"></i> ${texto}`;
}

function renderErro() {
    const mensagem = '<div class="empty-state">Erro ao carregar dados dos servicos.</div>';
    const lavagem = document.getElementById('lista-lavagem');
    const engraxe = document.getElementById('lista-engraxe');
    if (lavagem) lavagem.innerHTML = mensagem;
    if (engraxe) engraxe.innerHTML = mensagem;
}

function carregarGraficosFinanceiros() {
    if (typeof Chart === 'undefined') return;

    carregarGraficoGastoMensalLavagem();
    carregarGraficoGastoAnualLavagem();
    carregarGraficoGastoMensalEngraxe();
    carregarGraficoGastoAnualEngraxe();
}

function renderChartStatus(lavagem, engraxe) {
    if (typeof Chart === 'undefined') return;

    const canvas = document.getElementById('chartStatusServicos');
    if (!canvas) return;

    const summary = {
        Realizado: { count: 0, color: '#28a745' },
        Pendente: { count: 0, color: '#fd7e14' },
        Internado: { count: 0, color: '#007bff' },
        Agendado: { count: 0, color: '#ffc107' },
        Dispensado: { count: 0, color: '#6c757d' },
        Outros: { count: 0, color: '#17a2b8' }
    };

    [...lavagem, ...engraxe].forEach(lista => {
        (lista.itensFiltrados || lista.itens || []).forEach(item => {
            const status = normalizarStatus(item.status);
            if (DONE_STATUSES.includes(status)) summary.Realizado.count++;
            else if (PENDING_STATUSES.includes(status)) summary.Pendente.count++;
            else if (status === 'INTERNADO') summary.Internado.count++;
            else if (status === 'AGENDADO') summary.Agendado.count++;
            else if (status === 'DISPENSADO' || status === 'PULAR_LAVAGEM') summary.Dispensado.count++;
            else summary.Outros.count++;
        });
    });

    const activeLabels = Object.keys(summary).filter(key => summary[key].count > 0);
    const labels = activeLabels.length ? activeLabels : ['Sem dados'];
    const valores = activeLabels.length ? activeLabels.map(key => summary[key].count) : [1];
    const cores = activeLabels.length ? activeLabels.map(key => summary[key].color) : ['#e9ecef'];

    if (chartStatus) chartStatus.destroy();

    chartStatus = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: valores,
                backgroundColor: cores,
                borderWidth: 1
            }]
        },
        options: criarOpcoesGrafico({
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, color: '#333' } },
                tooltip: { enabled: activeLabels.length > 0 },
                datalabels: { display: false }
            }
        })
    });
}

async function carregarGraficoGastoMensalLavagem() {
    const canvas = document.getElementById('chartGastoMensalLavagem');
    if (!canvas || typeof Chart === 'undefined') return;

    try {
        const { data, error } = await supabaseClient
            .from('lavagem_itens')
            .select('valor, fornecedor, status, lavagem_listas!inner(status)')
            .in('status', ['REALIZADO', 'OK'])
            .eq('lavagem_listas.status', 'FINALIZADA');

        if (error) throw error;

        const resumo = (data || []).reduce((acc, item) => {
            const fornecedor = item.fornecedor || 'Nao informado';
            if (!acc[fornecedor]) acc[fornecedor] = { qtd: 0, valor: 0 };
            acc[fornecedor].qtd++;
            acc[fornecedor].valor += Number(item.valor || 0);
            return acc;
        }, {});

        const labels = Object.keys(resumo);
        const valores = labels.map(label => resumo[label].valor);

        if (chartGastoMensalLavagem) chartGastoMensalLavagem.destroy();

        chartGastoMensalLavagem = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Sem dados'],
                datasets: [{
                    label: 'Gasto Total (R$)',
                    data: valores.length ? valores : [0],
                    backgroundColor: 'rgba(0, 105, 55, 0.72)',
                    borderColor: '#006937',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: criarOpcoesGrafico({
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            afterLabel: context => resumo[context.label] ? `Qtd. Lavagens: ${resumo[context.label].qtd}` : ''
                        }
                    },
                    datalabels: { display: false }
                },
                scales: criarEscalasMoeda()
            })
        });
    } catch (error) {
        console.error('Erro ao carregar grafico de gasto mensal lavagem:', error);
    }
}

async function carregarGraficoGastoAnualLavagem() {
    const canvas = document.getElementById('chartGastoAnualLavagem');
    if (!canvas || typeof Chart === 'undefined') return;

    try {
        const anoAtual = new Date().getFullYear();
        const { data, error } = await supabaseClient
            .from('lavagem_listas')
            .select('data_lista, status, lavagem_itens(valor, status)')
            .eq('status', 'FINALIZADA')
            .gte('data_lista', `${anoAtual}-01-01`)
            .lte('data_lista', `${anoAtual}-12-31`);

        if (error) throw error;

        const valoresMensais = new Array(12).fill(0);
        (data || []).forEach(lista => {
            const dataObj = parseSupabaseDateValue(lista.data_lista);
            if (!dataObj) return;

            const totalLista = (lista.lavagem_itens || []).reduce((sum, item) => {
                return ['REALIZADO', 'OK'].includes(normalizarStatus(item.status)) ? sum + Number(item.valor || 0) : sum;
            }, 0);

            valoresMensais[dataObj.getUTCMonth()] += totalLista;
        });

        if (chartGastoAnualLavagem) chartGastoAnualLavagem.destroy();

        chartGastoAnualLavagem = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: getMesesLabels(),
                datasets: [{
                    label: `Gasto Lavagem em ${anoAtual} (R$)`,
                    data: valoresMensais,
                    borderColor: '#006937',
                    backgroundColor: 'rgba(0, 105, 55, 0.12)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointBackgroundColor: '#006937'
                }]
            },
            options: criarOpcoesGrafico({
                plugins: { legend: { display: false }, datalabels: { display: false } },
                scales: criarEscalasMoeda()
            })
        });
    } catch (error) {
        console.error('Erro ao carregar grafico de gasto anual lavagem:', error);
    }
}

async function carregarGraficoGastoMensalEngraxe() {
    const canvas = document.getElementById('chartGastoTotalEngraxe');
    if (!canvas || typeof Chart === 'undefined') return;

    try {
        const { data, error } = await supabaseClient
            .from('engraxe_itens')
            .select('status, engraxe_listas!inner(status)')
            .in('status', ['OK', 'REALIZADO'])
            .eq('engraxe_listas.status', 'FINALIZADA');

        if (error) throw error;

        const totalQtd = (data || []).length;
        const valorTotal = totalQtd * 60;

        if (chartGastoMensalEngraxe) chartGastoMensalEngraxe.destroy();

        chartGastoMensalEngraxe = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Engraxe Total'],
                datasets: [{
                    label: 'Investimento Total (R$)',
                    data: [valorTotal],
                    backgroundColor: 'rgba(253, 126, 20, 0.72)',
                    borderColor: '#fd7e14',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: criarOpcoesGrafico({
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { afterLabel: () => `Quantidade: ${totalQtd} veiculos` } },
                    datalabels: {
                        display: typeof ChartDataLabels !== 'undefined',
                        anchor: 'end',
                        align: 'top',
                        formatter: value => formatarMoeda(value)
                    }
                },
                scales: criarEscalasMoeda()
            }),
            plugins: typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : []
        });
    } catch (error) {
        console.error('Erro ao carregar grafico de gasto mensal engraxe:', error);
    }
}

async function carregarGraficoGastoAnualEngraxe() {
    const canvas = document.getElementById('chartGastoAnualEngraxe');
    if (!canvas || typeof Chart === 'undefined') return;

    try {
        const anoAtual = new Date().getFullYear();
        const { data, error } = await supabaseClient
            .from('engraxe_itens')
            .select('status, engraxe_listas!inner(status, data_lista)')
            .in('status', ['OK', 'REALIZADO'])
            .eq('engraxe_listas.status', 'FINALIZADA')
            .gte('engraxe_listas.data_lista', `${anoAtual}-01-01`)
            .lte('engraxe_listas.data_lista', `${anoAtual}-12-31`);

        if (error) throw error;

        const valoresMensais = new Array(12).fill(0);
        (data || []).forEach(item => {
            const dataObj = parseSupabaseDateValue(item.engraxe_listas?.data_lista);
            if (dataObj) valoresMensais[dataObj.getUTCMonth()] += 60;
        });

        if (chartGastoAnualEngraxe) chartGastoAnualEngraxe.destroy();

        chartGastoAnualEngraxe = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: getMesesLabels(),
                datasets: [{
                    label: `Gasto Engraxe em ${anoAtual} (R$)`,
                    data: valoresMensais,
                    borderColor: '#fd7e14',
                    backgroundColor: 'rgba(253, 126, 20, 0.12)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointBackgroundColor: '#fd7e14'
                }]
            },
            options: criarOpcoesGrafico({
                plugins: { legend: { display: false }, datalabels: { display: false } },
                scales: criarEscalasMoeda()
            })
        });
    } catch (error) {
        console.error('Erro ao carregar grafico de gasto anual engraxe:', error);
    }
}

function iniciarRolagemAutomatica() {
    const wrapper = document.querySelector('.marquee-wrapper');
    if (!wrapper) return;

    let direction = 1;
    let isPaused = false;
    const speed = 0.8;

    function step() {
        if (!isPaused && wrapper.scrollWidth > wrapper.clientWidth) {
            if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 1) direction = -1;
            else if (wrapper.scrollLeft <= 0) direction = 1;
            wrapper.scrollLeft += speed * direction;
        }
        requestAnimationFrame(step);
    }

    wrapper.addEventListener('mouseenter', () => { isPaused = true; });
    wrapper.addEventListener('mouseleave', () => { isPaused = false; });
    wrapper.addEventListener('touchstart', () => { isPaused = true; }, { passive: true });
    wrapper.addEventListener('touchend', () => { isPaused = false; }, { passive: true });

    requestAnimationFrame(step);
}

function criarOpcoesGrafico(overrides = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        ...overrides
    };
}

function criarEscalasMoeda() {
    return {
        y: {
            beginAtZero: true,
            ticks: { callback: value => formatarMoeda(value) }
        },
        x: {
            ticks: { color: '#333' },
            grid: { display: false }
        }
    };
}

function parseSupabaseDateValue(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
}

function getMesesLabels() {
    return ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
}

function formatarMoeda(value) {
    return `R$ ${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(error => {
            console.error(`Erro ao entrar em tela cheia: ${error.message}`);
        });
    } else if (document.exitFullscreen) {
        document.exitFullscreen();
    }
}

function atualizarEstadoTelaCheia() {
    const btn = document.getElementById('btn-fullscreen');
    const container = document.querySelector('.container');
    const header = document.querySelector('.glass-header');
    const menuContainer = document.getElementById('menu-container');
    const sidebar = document.getElementById('sidebar');

    if (document.fullscreenElement) {
        if (btn) btn.innerHTML = '<i class="fas fa-compress"></i>';
        container?.classList.add('fullscreen-active');
        header?.classList.add('hidden');
        menuContainer?.classList.add('hidden');
        sidebar?.classList.add('hidden');
    } else {
        if (btn) btn.innerHTML = '<i class="fas fa-expand"></i>';
        container?.classList.remove('fullscreen-active');
        header?.classList.remove('hidden');
        menuContainer?.classList.remove('hidden');
        sidebar?.classList.remove('hidden');
        sidebar?.classList.remove('mobile-open');
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

window.addEventListener('beforeunload', () => {
    if (servicosChannel) supabaseClient.removeChannel(servicosChannel);
    if (refreshTimer) clearInterval(refreshTimer);
});
