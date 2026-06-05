import { supabaseClient } from './supabase.js';
import { calcularEstoqueAtual } from './abastecimento/estoque-service.js';

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
let retornosRecebimento = [];
let veiculosRecebimentoPorPlaca = new Map();
let estoqueTanques = new Map();
let abastecimentoChannel = null;
let retornoChannel = null;
let refreshTimer = null;
let wakeLockSentinel = null;

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
    document.addEventListener('visibilitychange', restaurarWakeLockQuandoVisivel);

    carregarFiliais();
    carregarDados();
    configurarRealtime();
    ativarBloqueioDescansoTela();

    refreshTimer = setInterval(carregarDados, REFRESH_INTERVAL);
}

async function ativarBloqueioDescansoTela() {
    if (!('wakeLock' in navigator)) {
        console.warn('Wake Lock API nao suportada neste navegador.');
        return;
    }

    try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
        });
    } catch (error) {
        console.warn('Nao foi possivel manter a tela ativa:', error);
    }
}

function restaurarWakeLockQuandoVisivel() {
    if (document.visibilityState === 'visible' && !wakeLockSentinel) {
        ativarBloqueioDescansoTela();
    }
}

async function liberarBloqueioDescansoTela() {
    if (!wakeLockSentinel) return;

    try {
        await wakeLockSentinel.release();
    } catch (error) {
        console.warn('Nao foi possivel liberar o bloqueio de descanso da tela:', error);
    } finally {
        wakeLockSentinel = null;
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
        const [resSaidas, resRetornos, estoqueAtual] = await Promise.all([
            supabaseClient
                .from('saidas_combustivel')
                .select('*, bicos(bombas(tanque_id, tanques(id, nome, tipo_combustivel, filial, capacidade)))')
                .gte('data_hora', intervalo.inicio)
                .lte('data_hora', intervalo.fim)
                .order('data_hora', { ascending: false }),
            supabaseClient
                .from('retorno_rota')
                .select('id, data_retorno, placa, rota, nome_mot, hora_mot, operador_recebimento')
                .eq('data_retorno', dataAbastecimento),
            calcularEstoqueAtual(supabaseClient)
        ]);

        if (resSaidas.error) throw resSaidas.error;
        if (resRetornos.error) throw resRetornos.error;

        saidasCombustivel = resSaidas.data || [];
        retornosRecebimento = resRetornos.data || [];
        estoqueTanques = new Map((estoqueAtual || []).map(tanque => [Number(tanque.id), tanque]));
        await carregarVeiculosRecebimento(retornosRecebimento);
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
    if (retornoChannel) {
        supabaseClient.removeChannel(retornoChannel);
    }

    abastecimentoChannel = supabaseClient
        .channel('monitoramento-abastecimento-interno')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'saidas_combustivel' }, () => {
            carregarDados();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'abastecimentos' }, () => {
            carregarDados();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tanques' }, () => {
            carregarDados();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bombas' }, () => {
            carregarDados();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bicos' }, () => {
            carregarDados();
        })
        .subscribe((status) => {
            const online = status === 'SUBSCRIBED';
            atualizarStatusRealtime(online ? 'online' : 'offline', online ? 'Online' : 'Conectando');
        });

    retornoChannel = supabaseClient
        .channel('monitoramento-abastecimento-interno-retorno')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'retorno_rota' }, () => {
            carregarDados();
        })
        .subscribe();
}

function renderDashboard() {
    const dados = filtrarRegistros(saidasCombustivel);
    const veiculos = agruparPorVeiculo(dados);
    const origens = agruparPorOrigem(dados);
    const faltamAbastecer = calcularFaltamAbastecer(retornosRecebimento, veiculos);
    const totalLitros = dados.reduce((sum, item) => sum + parseNumero(item.qtd_litros), 0);
    const rotas = new Set(dados.map(item => String(item.rota || '').trim()).filter(Boolean));

    setText('kpi-veiculos', veiculos.length);
    setText('kpi-litros', `${formatarLitros(totalLitros)} L`);
    setText('kpi-lancamentos', dados.length);
    setText('kpi-rotas', rotas.size);
    setText('kpi-faltam-abastecer', faltamAbastecer.length);
    setText('count-veiculos-lista', veiculos.length);
    setText('count-faltam-lista', faltamAbastecer.length);
    setText('count-origens-lista', origens.length);

    renderListaVeiculos(veiculos);
    renderListaFaltamAbastecer(faltamAbastecer);
    renderListaOrigens(origens);
}

async function carregarVeiculosRecebimento(registros) {
    const placas = [...new Set((registros || []).map(item => normalizarPlaca(item.placa)).filter(Boolean))];
    veiculosRecebimentoPorPlaca = new Map();

    if (placas.length === 0) return;

    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('placa, filial, modelo')
            .in('placa', placas);

        if (error) throw error;

        (data || []).forEach(veiculo => {
            veiculosRecebimentoPorPlaca.set(normalizarPlaca(veiculo.placa), veiculo);
        });
    } catch (error) {
        console.warn('Nao foi possivel carregar dados dos veiculos recebidos:', error);
    }
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
        const tanqueId = tanque?.id || item?.bicos?.bombas?.tanque_id || null;
        const nomeTanque = tanque?.nome || 'Tanque N/I';
        const tipo = tanque?.tipo_combustivel || 'Combustível N/I';
        const filial = tanque?.filial || 'Filial N/I';
        const chave = tanqueId || `${filial}|${nomeTanque}|${tipo}`;
        const estoqueInfo = tanqueId ? estoqueTanques.get(Number(tanqueId)) : null;
        const atual = mapa.get(chave) || {
            tanqueId,
            nomeTanque,
            tipo,
            filial,
            capacidade: parseNumero(tanque?.capacidade ?? estoqueInfo?.capacidade),
            estoqueAtual: parseNumero(estoqueInfo?.estoque_atual),
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

function calcularFaltamAbastecer(retornos, veiculosAbastecidos) {
    const placasAbastecidas = new Set((veiculosAbastecidos || []).map(item => normalizarPlaca(item.placa)));
    const filial = document.getElementById('filtroFilial')?.value || '';
    const termo = (document.getElementById('searchInput')?.value || '').trim().toUpperCase();
    const mapa = new Map();

    (retornos || []).forEach(item => {
        const placa = normalizarPlaca(item.placa);
        if (!placa || placasAbastecidas.has(placa)) return;

        const veiculo = veiculosRecebimentoPorPlaca.get(placa);
        if (filial && veiculo?.filial !== filial) return;

        const recebido = Boolean((item.operador_recebimento && item.operador_recebimento.trim()) || item.hora_mot);
        if (!recebido) return;

        if (termo) {
            const texto = [
                item.placa,
                item.rota,
                item.nome_mot,
                item.operador_recebimento,
                veiculo?.modelo,
                veiculo?.filial
            ].join(' ').toUpperCase();
            if (!texto.includes(termo)) return;
        }

        if (!mapa.has(placa)) {
            mapa.set(placa, {
                placa,
                rota: item.rota || '',
                motorista: item.nome_mot || '',
                horaRetorno: item.hora_mot || '',
                operador: item.operador_recebimento || '',
                filial: veiculo?.filial || '',
                modelo: veiculo?.modelo || ''
            });
        }
    });

    return Array.from(mapa.values()).sort((a, b) => {
        const rotaCompare = String(a.rota || '').localeCompare(String(b.rota || ''), undefined, { numeric: true });
        return rotaCompare || a.placa.localeCompare(b.placa);
    });
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
                ${montarBarraTanque(item)}
            </div>
            <div class="fuel-total">
                Litros
                <strong>${formatarLitros(item.litros)} L</strong>
            </div>
        </article>
    `).join('');
}

function montarBarraTanque(item) {
    const capacidade = parseNumero(item.capacidade);
    const estoqueAtual = parseNumero(item.estoqueAtual);
    const percentual = capacidade > 0 ? (estoqueAtual / capacidade) * 100 : 0;
    const largura = Math.max(0, Math.min(100, percentual));
    const percentualLabel = capacidade > 0 ? `${percentual.toFixed(0)}%` : '--%';
    const capacidadeLabel = capacidade > 0 ? `${formatarLitros(capacidade)} L` : 'capacidade N/I';

    return `
        <div class="tank-level">
            <div class="tank-level-meta">
                <span>${formatarLitros(estoqueAtual)} L / ${capacidadeLabel}</span>
                <strong>${percentualLabel}</strong>
            </div>
            <div class="tank-level-bar">
                <span style="width: ${largura}%"></span>
            </div>
        </div>
    `;
}

function renderListaFaltamAbastecer(itens) {
    const container = document.getElementById('lista-faltam-abastecer');
    if (!container) return;

    if (itens.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhum veiculo recebido pendente de abastecimento.</div>';
        return;
    }

    container.innerHTML = itens.map(item => `
        <article class="fuel-card pendente">
            <div class="fuel-icon"><i class="fas fa-truck"></i></div>
            <div class="fuel-main">
                <div class="fuel-title">
                    <span class="fuel-placa">${escapeHtml(item.placa)}</span>
                    <span class="fuel-rota">Rota ${escapeHtml(item.rota || '-')}</span>
                </div>
                <div class="fuel-details">
                    <span><i class="fas fa-user"></i> ${escapeHtml(item.motorista || 'Motorista N/I')}</span>
                    <span><i class="fas fa-clock"></i> Recebido ${escapeHtml(item.horaRetorno || '--:--')}</span>
                    <span><i class="fas fa-building"></i> ${escapeHtml(item.filial || 'Filial N/I')}</span>
                    <span><i class="fas fa-clipboard-check"></i> ${escapeHtml(item.operador || 'Recebimento')}</span>
                </div>
            </div>
            <div class="fuel-total pendente-status">
                Status
                <strong>Pendente</strong>
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
    const faltam = document.getElementById('lista-faltam-abastecer');
    const origens = document.getElementById('lista-origens');
    if (veiculos) veiculos.innerHTML = mensagem;
    if (faltam) faltam.innerHTML = mensagem;
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
    if (retornoChannel) supabaseClient.removeChannel(retornoChannel);
    if (refreshTimer) clearInterval(refreshTimer);
    liberarBloqueioDescansoTela();
});
