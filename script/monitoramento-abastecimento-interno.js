import { supabaseClient } from './supabase.js';

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

function getIntervaloDiaSaoPaulo(data) {
    return {
        inicio: `${data}T00:00:00-03:00`,
        fim: `${data}T23:59:59-03:00`
    };
}

let saidasCombustivel = [];
let abastecimentoChannel = null;
let refreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    initAbastecimentoRealTime();
});

function initAbastecimentoRealTime() {
    const dataInput = document.getElementById('dataAbastecimento');
    if (dataInput) dataInput.value = getDataSaoPaulo();

    document.getElementById('btn-aplicar-filtro')?.addEventListener('click', carregarDados);
    document.getElementById('btn-refresh')?.addEventListener('click', carregarDados);
    document.getElementById('btn-fullscreen')?.addEventListener('click', toggleFullScreen);
    document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => window.toggleSidebar && window.toggleSidebar());
    document.getElementById('dataAbastecimento')?.addEventListener('change', carregarDados);
    document.getElementById('filtroFilial')?.addEventListener('change', renderDashboard);
    document.getElementById('searchInput')?.addEventListener('input', renderDashboard);

    document.addEventListener('fullscreenchange', atualizarEstadoTelaCheia);

    carregarFiliais();
    carregarDados();
    configurarRealtime();

    refreshTimer = setInterval(carregarDados, REFRESH_INTERVAL);
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

    const dataAbastecimento = document.getElementById('dataAbastecimento')?.value;
    if (!dataAbastecimento) {
        btnRefresh?.classList.remove('fa-spin');
        return;
    }

    try {
        const intervalo = getIntervaloDiaSaoPaulo(dataAbastecimento);
        const { data, error } = await supabaseClient
            .from('saidas_combustivel')
            .select('*, bicos(bombas(tanques(nome, tipo_combustivel, filial)))')
            .gte('data_hora', intervalo.inicio)
            .lte('data_hora', intervalo.fim)
            .order('data_hora', { ascending: false });

        if (error) throw error;

        saidasCombustivel = data || [];
        renderDashboard();
        atualizarTimestamp();
    } catch (error) {
        console.error('Erro ao carregar abastecimento interno real-time:', error);
        renderErro();
    } finally {
        btnRefresh?.classList.remove('fa-spin');
    }
}

function configurarRealtime() {
    if (abastecimentoChannel) {
        supabaseClient.removeChannel(abastecimentoChannel);
    }

    abastecimentoChannel = supabaseClient
        .channel('monitoramento-abastecimento-interno')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'saidas_combustivel' }, () => {
            carregarDados();
        })
        .subscribe((status) => {
            const online = status === 'SUBSCRIBED';
            atualizarStatusRealtime(online ? 'online' : 'offline', online ? 'Online' : 'Conectando');
        });
}

function renderDashboard() {
    const dados = filtrarRegistros(saidasCombustivel);
    const veiculos = agruparPorVeiculo(dados);
    const origens = agruparPorOrigem(dados);
    const totalLitros = dados.reduce((sum, item) => sum + parseNumero(item.qtd_litros), 0);
    const rotas = new Set(dados.map(item => String(item.rota || '').trim()).filter(Boolean));

    setText('kpi-veiculos', veiculos.length);
    setText('kpi-litros', `${formatarLitros(totalLitros)} L`);
    setText('kpi-lancamentos', dados.length);
    setText('kpi-rotas', rotas.size);
    setText('count-veiculos-lista', veiculos.length);
    setText('count-origens-lista', origens.length);

    renderListaVeiculos(veiculos);
    renderListaOrigens(origens);
}

function filtrarRegistros(registros) {
    const filial = document.getElementById('filtroFilial')?.value || '';
    const termo = (document.getElementById('searchInput')?.value || '').trim().toUpperCase();

    return registros.filter(item => {
        const tanque = obterTanque(item);
        if (filial && tanque?.filial !== filial) return false;

        if (!termo) return true;

        const texto = [
            item.veiculo_placa,
            item.rota,
            item.motorista,
            item.usuario,
            item.km_atual,
            tanque?.nome,
            tanque?.tipo_combustivel,
            tanque?.filial
        ].join(' ').toUpperCase();

        return texto.includes(termo);
    });
}

function agruparPorVeiculo(registros) {
    const mapa = new Map();

    registros.forEach(item => {
        const placa = normalizarPlaca(item.veiculo_placa) || 'SEM PLACA';
        const atual = mapa.get(placa) || {
            placa,
            litros: 0,
            lancamentos: 0,
            rotas: new Set(),
            motoristas: new Set(),
            usuarios: new Set(),
            tanques: new Set(),
            ultimaData: null,
            ultimoKm: null
        };

        const tanque = obterTanque(item);
        atual.litros += parseNumero(item.qtd_litros);
        atual.lancamentos += 1;
        if (item.rota) atual.rotas.add(item.rota);
        if (item.motorista) atual.motoristas.add(item.motorista);
        if (item.usuario) atual.usuarios.add(item.usuario);
        if (tanque?.nome) atual.tanques.add(tanque.nome);
        if (item.km_atual) atual.ultimoKm = item.km_atual;
        if (!atual.ultimaData || new Date(item.data_hora) > new Date(atual.ultimaData)) {
            atual.ultimaData = item.data_hora;
        }

        mapa.set(placa, atual);
    });

    return Array.from(mapa.values()).sort((a, b) => new Date(b.ultimaData || 0) - new Date(a.ultimaData || 0));
}

function agruparPorOrigem(registros) {
    const mapa = new Map();

    registros.forEach(item => {
        const tanque = obterTanque(item);
        const nomeTanque = tanque?.nome || 'Tanque N/I';
        const tipo = tanque?.tipo_combustivel || 'Combustível N/I';
        const filial = tanque?.filial || 'Filial N/I';
        const chave = `${filial}|${nomeTanque}|${tipo}`;
        const atual = mapa.get(chave) || {
            nomeTanque,
            tipo,
            filial,
            litros: 0,
            lancamentos: 0,
            veiculos: new Set()
        };

        atual.litros += parseNumero(item.qtd_litros);
        atual.lancamentos += 1;
        if (item.veiculo_placa) atual.veiculos.add(normalizarPlaca(item.veiculo_placa));
        mapa.set(chave, atual);
    });

    return Array.from(mapa.values()).sort((a, b) => b.litros - a.litros);
}

function renderListaVeiculos(veiculos) {
    const container = document.getElementById('lista-veiculos');
    if (!container) return;

    if (veiculos.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhum veículo abastecido para os filtros selecionados.</div>';
        return;
    }

    container.innerHTML = veiculos.map(item => `
        <article class="fuel-card">
            <div class="fuel-icon"><i class="fas fa-truck"></i></div>
            <div class="fuel-main">
                <div class="fuel-title">
                    <span class="fuel-placa">${escapeHtml(item.placa)}</span>
                    <span class="fuel-rota">Rota ${escapeHtml(joinSet(item.rotas) || '-')}</span>
                </div>
                <div class="fuel-details">
                    <span><i class="fas fa-user"></i> ${escapeHtml(joinSet(item.motoristas) || 'Motorista N/I')}</span>
                    <span><i class="fas fa-clock"></i> ${escapeHtml(formatarHora(item.ultimaData))}</span>
                    <span><i class="fas fa-gauge-high"></i> KM ${escapeHtml(item.ultimoKm || '-')}</span>
                    <span><i class="fas fa-gas-pump"></i> ${escapeHtml(joinSet(item.tanques) || 'Tanque N/I')}</span>
                </div>
            </div>
            <div class="fuel-total">
                Litros
                <strong>${formatarLitros(item.litros)} L</strong>
            </div>
        </article>
    `).join('');
}

function renderListaOrigens(origens) {
    const container = document.getElementById('lista-origens');
    if (!container) return;

    if (origens.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma origem de abastecimento encontrada.</div>';
        return;
    }

    container.innerHTML = origens.map(item => `
        <article class="fuel-card origem">
            <div class="fuel-icon"><i class="fas fa-oil-can"></i></div>
            <div class="fuel-main">
                <div class="fuel-title">
                    <span class="fuel-placa">${escapeHtml(item.nomeTanque)}</span>
                </div>
                <div class="fuel-details">
                    <span><i class="fas fa-droplet"></i> ${escapeHtml(item.tipo)}</span>
                    <span><i class="fas fa-building"></i> ${escapeHtml(item.filial)}</span>
                    <span><i class="fas fa-truck"></i> ${item.veiculos.size} veículo(s)</span>
                    <span><i class="fas fa-receipt"></i> ${item.lancamentos} lançamento(s)</span>
                </div>
            </div>
            <div class="fuel-total">
                Litros
                <strong>${formatarLitros(item.litros)} L</strong>
            </div>
        </article>
    `).join('');
}

function obterTanque(item) {
    return item?.bicos?.bombas?.tanques || null;
}

function normalizarPlaca(placa) {
    return String(placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function parseNumero(valor) {
    const numero = parseFloat(String(valor || '0').replace(',', '.'));
    return Number.isFinite(numero) ? numero : 0;
}

function formatarLitros(valor) {
    return parseNumero(valor).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatarHora(value) {
    if (!value) return '--:--';
    const data = new Date(value);
    if (Number.isNaN(data.getTime())) return '--:--';
    return formatarHoraSaoPaulo(data);
}

function joinSet(set) {
    return Array.from(set || []).filter(Boolean).join(', ');
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
    const mensagem = '<div class="empty-state">Erro ao carregar dados de abastecimento interno.</div>';
    const veiculos = document.getElementById('lista-veiculos');
    const origens = document.getElementById('lista-origens');
    if (veiculos) veiculos.innerHTML = mensagem;
    if (origens) origens.innerHTML = mensagem;
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
    if (abastecimentoChannel) supabaseClient.removeChannel(abastecimentoChannel);
    if (refreshTimer) clearInterval(refreshTimer);
});
