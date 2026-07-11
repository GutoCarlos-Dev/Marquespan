import { supabaseClient } from './supabase.js';
import { configurarFiltroFilialUsuario, normalizarFilial } from './shared/filtro-filial-usuario.js';

const REFRESH_INTERVAL = 60000;
const TIMEZONE_SAO_PAULO = 'America/Sao_Paulo';

function getDataSaoPaulo(date = new Date()) {
    const partes = new Intl.DateTimeFormat('sv-SE', {
        timeZone: TIMEZONE_SAO_PAULO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});

    return `${partes.year}-${partes.month}-${partes.day}`;
}

function formatarHoraSaoPaulo(value = new Date()) {
    return new Date(value).toLocaleTimeString('pt-BR', {
        timeZone: TIMEZONE_SAO_PAULO,
        hour: '2-digit',
        minute: '2-digit'
    });
}

let registrosRetorno = [];
let veiculosPorPlaca = new Map();
let retornoChannel = null;
let refreshTimer = null;
let listaAguardandoAtual = [];
let exportandoAguardando = false;

document.addEventListener('DOMContentLoaded', async () => {
    const perfil = await configurarFiltroFilialUsuario(document.getElementById('filtroFilial'));
    if (!perfil) return;

    initRetornoRealTime();
});

function initRetornoRealTime() {
    const dataInput = document.getElementById('dataRetorno');
    if (dataInput) dataInput.value = getDataSaoPaulo();

    document.getElementById('btn-aplicar-filtro')?.addEventListener('click', carregarDados);
    document.getElementById('btn-refresh')?.addEventListener('click', carregarDados);
    document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullScreen);
    document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => window.toggleSidebar && window.toggleSidebar());
    document.getElementById('dataRetorno')?.addEventListener('change', carregarDados);
    document.getElementById('filtroFilial')?.addEventListener('change', renderDashboard);
    document.getElementById('searchInput')?.addEventListener('input', renderDashboard);
    document.getElementById('label-exportar-aguardando')?.addEventListener('click', exportarAguardandoXlsx);

    document.addEventListener('fullscreenchange', atualizarEstadoTelaCheia);

    carregarDados();
    configurarRealtime();

    refreshTimer = setInterval(carregarDados, REFRESH_INTERVAL);
}

async function carregarDados() {
    const btnRefresh = document.getElementById('btn-refresh');
    btnRefresh?.classList.add('fa-spin');

    const dataRetorno = document.getElementById('dataRetorno')?.value;
    if (!dataRetorno) {
        btnRefresh?.classList.remove('fa-spin');
        return;
    }

    try {
        const filial = normalizarFilial(document.getElementById('filtroFilial')?.value);
        let query = supabaseClient
            .from('retorno_rota')
            .select('*')
            .eq('data_retorno', dataRetorno)
            .order('rota', { ascending: true });

        if (filial) query = query.eq('filial', filial);

        const { data, error } = await query;
        if (error) throw error;

        registrosRetorno = data || [];
        await carregarVeiculos(registrosRetorno);
        renderDashboard();
        atualizarTimestamp();
    } catch (error) {
        console.error('Erro ao carregar retorno de rota real-time:', error);
        renderErro();
    } finally {
        btnRefresh?.classList.remove('fa-spin');
    }
}

async function carregarVeiculos(registros) {
    const placas = [...new Set(registros.map(item => normalizarPlaca(item.placa)).filter(Boolean))];
    veiculosPorPlaca = new Map();

    if (placas.length === 0) return;

    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('placa, filial, modelo, tipo')
            .in('placa', placas);

        if (error) throw error;

        (data || []).forEach(veiculo => {
            veiculosPorPlaca.set(normalizarPlaca(veiculo.placa), veiculo);
        });
    } catch (error) {
        console.warn('Não foi possível carregar filiais/modelos dos veículos:', error);
    }
}

function configurarRealtime() {
    if (retornoChannel) {
        supabaseClient.removeChannel(retornoChannel);
    }

    retornoChannel = supabaseClient
        .channel('monitoramento-retorno-rota')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'retorno_rota' }, () => {
            carregarDados();
        })
        .subscribe((status) => {
            const online = status === 'SUBSCRIBED';
            atualizarStatusRealtime(online ? 'online' : 'offline', online ? 'Online' : 'Conectando');
        });
}

function renderDashboard() {
    const dados = filtrarRegistros(registrosRetorno);
    const chegaram = dados.filter(veiculoChegou);
    const aguardando = dados.filter(item => !veiculoChegou(item));
    const atrasados = chegaram.filter(item => (item.hora_mot || '') >= '20:00');
    const percentual = dados.length ? Math.round((chegaram.length / dados.length) * 100) : 0;

    setText('kpi-total', dados.length);
    setText('kpi-chegaram', chegaram.length);
    setText('kpi-aguardando', aguardando.length);
    setText('kpi-atrasados', atrasados.length);
    setText('count-aguardando-lista', aguardando.length);
    setText('count-chegaram-lista', chegaram.length);
    setText('progress-label', `${percentual}%`);

    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.width = `${percentual}%`;

    listaAguardandoAtual = ordenarAguardando(aguardando);
    renderLista('lista-aguardando', listaAguardandoAtual, false);
    renderLista('lista-chegaram', ordenarChegaram(chegaram), true);
}

function filtrarRegistros(registros) {
    const filial = normalizarFilial(document.getElementById('filtroFilial')?.value);
    const termo = (document.getElementById('searchInput')?.value || '').trim().toUpperCase();

    return registros.filter(item => {
        const placa = normalizarPlaca(item.placa);
        const veiculo = veiculosPorPlaca.get(placa);

        if (filial && normalizarFilial(item.filial) !== filial) return false;

        if (!termo) return true;

        const texto = [
            item.placa,
            item.rota,
            item.status_rota,
            item.nome_mot,
            item.nome_aux,
            item.operador_recebimento,
            item.filial,
            veiculo?.modelo,
            veiculo?.filial
        ].join(' ').toUpperCase();

        return texto.includes(termo);
    });
}

function renderLista(containerId, itens, chegou) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (itens.length === 0) {
        container.innerHTML = `<div class="empty-state">Nenhum caminhão ${chegou ? 'registrado como chegado' : 'aguardando chegada'}.</div>`;
        return;
    }

    container.innerHTML = itens.map(item => montarCard(item, chegou)).join('');
}

function montarCard(item, chegou) {
    const placa = normalizarPlaca(item.placa) || '-';
    const veiculo = veiculosPorPlaca.get(placa);
    const hora = item.hora_mot || '-';
    const isAtrasado = chegou && item.hora_mot && item.hora_mot >= '20:00';
    const classe = chegou ? (isAtrasado ? 'chegou atrasado' : 'chegou') : 'aguardando';
    const statusTexto = chegou ? 'Chegada' : 'Status';
    const statusValor = chegou ? hora : (item.status_rota || 'Aguardando');

    return `
        <article class="truck-card ${classe}">
            <div class="truck-icon"><i class="fas fa-truck"></i></div>
            <div class="truck-main">
                <div class="truck-title">
                    <span class="truck-placa">${escapeHtml(placa)}</span>
                    <span class="truck-rota">Rota ${escapeHtml(item.rota || '-')}</span>
                </div>
                <div class="truck-details">
                    <span><i class="fas fa-user"></i> ${escapeHtml(item.nome_mot || 'Motorista não informado')}</span>
                    <span><i class="fas fa-user-plus"></i> ${escapeHtml(item.nome_aux || 'Sem auxiliar')}</span>
                    <span><i class="fas fa-building"></i> ${escapeHtml(item.filial || veiculo?.filial || 'Filial N/I')}</span>
                    ${item.operador_recebimento ? `<span><i class="fas fa-clipboard-check"></i> ${escapeHtml(item.operador_recebimento)}</span>` : ''}
                </div>
            </div>
            <div class="truck-status">
                ${escapeHtml(statusTexto)}
                <strong>${escapeHtml(statusValor)}</strong>
            </div>
        </article>
    `;
}

function ordenarAguardando(itens) {
    return [...itens].sort((a, b) => String(a.rota || '').localeCompare(String(b.rota || ''), undefined, { numeric: true }));
}

function ordenarChegaram(itens) {
    return [...itens].sort((a, b) => String(b.hora_mot || '').localeCompare(String(a.hora_mot || '')));
}

async function exportarAguardandoXlsx() {
    if (exportandoAguardando) return;

    if (typeof XLSX === 'undefined') {
        alert('A biblioteca de exportação (XLSX) não foi carregada.');
        return;
    }
    if (listaAguardandoAtual.length === 0) {
        alert('Não há veículos aguardando chegada para exportar.');
        return;
    }

    if (!confirm(`Buscar a localização de ${listaAguardandoAtual.length} veículo(s) aguardando e gerar o XLSX? Isso pode levar alguns instantes.`)) {
        return;
    }

    exportandoAguardando = true;
    const label = document.getElementById('label-exportar-aguardando');
    const textoOriginal = label?.innerHTML;
    label?.classList.add('exportando');

    try {
        const linhas = [];

        for (let indice = 0; indice < listaAguardandoAtual.length; indice += 1) {
            const item = listaAguardandoAtual[indice];
            if (label) {
                label.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Localizando ${indice + 1}/${listaAguardandoAtual.length}...`;
            }

            const placa = normalizarPlaca(item.placa);
            const veiculo = veiculosPorPlaca.get(placa);
            let localizacao = 'Não localizado';

            try {
                if (placa.length === 7) {
                    const { data, error } = await supabaseClient.functions.invoke('localizacao-veiculo', {
                        body: { placa }
                    });
                    if (!error && data?.success && data?.data?.endereco) {
                        localizacao = data.data.endereco;
                    }
                }
            } catch (error) {
                console.error('Erro ao localizar veículo:', item.placa, error);
            }

            linhas.push({
                'PLACA': placa || item.placa || '-',
                'TIPO': veiculo?.tipo || veiculo?.modelo || '-',
                'ROTA': item.rota || '-',
                'MOTORISTA': item.nome_mot || 'Não informado',
                'AUXILIAR': item.nome_aux || 'Não informado',
                'LOCALIZAÇÃO': localizacao
            });
        }

        const ws = XLSX.utils.json_to_sheet(linhas);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'AGUARDANDO');
        const dataRetorno = document.getElementById('dataRetorno')?.value || getDataSaoPaulo();
        XLSX.writeFile(wb, `retorno_rota_aguardando_${dataRetorno}.xlsx`);
    } finally {
        exportandoAguardando = false;
        label?.classList.remove('exportando');
        if (label && textoOriginal) label.innerHTML = textoOriginal;
    }
}

function veiculoChegou(item) {
    return Boolean((item.operador_recebimento && item.operador_recebimento.trim()) || item.hora_mot);
}

function normalizarPlaca(placa) {
    return String(placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function atualizarTimestamp() {
    const el = document.getElementById('last-update');
    if (el) el.textContent = `Atualizado às: ${formatarHoraSaoPaulo()}`;
}

function atualizarStatusRealtime(status, texto) {
    const el = document.getElementById('realtime-status');
    if (!el) return;

    el.classList.toggle('online', status === 'online');
    el.classList.toggle('offline', status !== 'online');
    el.innerHTML = `<i class="fas fa-circle"></i> ${texto}`;
}

function renderErro() {
    const mensagem = '<div class="empty-state">Erro ao carregar dados do retorno de rota.</div>';
    const aguardando = document.getElementById('lista-aguardando');
    const chegaram = document.getElementById('lista-chegaram');
    if (aguardando) aguardando.innerHTML = mensagem;
    if (chegaram) chegaram.innerHTML = mensagem;
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
    if (retornoChannel) supabaseClient.removeChannel(retornoChannel);
    if (refreshTimer) clearInterval(refreshTimer);
});
