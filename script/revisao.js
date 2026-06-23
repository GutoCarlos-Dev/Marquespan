import { supabaseClient } from './supabase.js';

const PAGE_ID = 'revisao.html';
const FALLBACK_PAGES = ['coletar-manutencao.html', 'buscar-manutencao.html'];
const PAGE_SIZE = 1000;
const PLATE_BATCH_SIZE = 80;
const AVENCER_KM = 5000;

const state = {
    linhas: [],
    veiculos: [],
    kmPorPlaca: new Map(),
    historico: new Map(),
    renderedLinhas: [],
    sort: { key: 'km_restante', asc: true }
};

let modalItemAtual = null;

const els = {};

document.addEventListener('DOMContentLoaded', async () => {
    cacheEls();
    bindEvents();

    const permitido = await verificarPermissaoPagina();
    if (!permitido) {
        mostrarAcessoNegado();
        return;
    }

    await carregarFiliais();
});

function cacheEls() {
    els.form = document.getElementById('formRevisao');
    els.filtroFilial = document.getElementById('filtroFilial');
    els.filtroBusca = document.getElementById('filtroBusca');
    els.filtroSituacao = document.getElementById('filtroSituacao');
    els.filtroStatus = document.getElementById('filtroStatus');
    els.filtroServico = document.getElementById('filtroServico');
    els.filtroMotor = document.getElementById('filtroMotor');
    els.statusBusca = document.getElementById('statusBusca');
    els.btnFiltrar = document.getElementById('btnFiltrar');
    els.btnExportarXlsx = document.getElementById('btnExportarXlsx');
    els.btnExportarPdf = document.getElementById('btnExportarPdf');
    els.buscaGrid = document.getElementById('buscaGrid');
    els.resultadosPanel = document.getElementById('resultadosPanel');
    els.emptyPanel = document.getElementById('emptyPanel');
    els.tbodyRevisao = document.getElementById('tbodyRevisao');
    els.kpiVeiculos = document.getElementById('kpiVeiculos');
    els.kpiRevisoes = document.getElementById('kpiRevisoes');
    els.kpiAVencer = document.getElementById('kpiAVencer');
    els.kpiVencidas = document.getElementById('kpiVencidas');
    els.modal = document.getElementById('modalRevisao');
    els.modalForm = document.getElementById('formRegistrarServico');
    els.modalDataRealizado = document.getElementById('modalDataRealizado');
    els.modalKmRealizado = document.getElementById('modalKmRealizado');
    els.modalObservacao = document.getElementById('modalObservacao');
    els.btnSalvarModal = document.getElementById('btnSalvarModal');
}

function bindEvents() {
    els.form?.addEventListener('submit', event => {
        event.preventDefault();
        buscarRevisoes();
    });

    els.buscaGrid?.addEventListener('input', renderGrid);
    els.filtroStatus?.addEventListener('change', renderGrid);
    els.filtroServico?.addEventListener('change', renderGrid);
    els.filtroMotor?.addEventListener('change', renderGrid);
    els.btnExportarXlsx?.addEventListener('click', exportarXlsx);
    els.btnExportarPdf?.addEventListener('click', exportarPdf);

    document.querySelectorAll('[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            state.sort = alternarSort(state.sort, th.dataset.sort);
            renderGrid();
        });
    });

    els.tbodyRevisao?.addEventListener('click', event => {
        const btn = event.target.closest('.btn-reg');
        if (!btn) return;
        const idx = parseInt(btn.dataset.idx, 10);
        abrirModal(state.renderedLinhas[idx]);
    });

    document.getElementById('btnFecharModal')?.addEventListener('click', fecharModal);
    document.getElementById('btnCancelarModal')?.addEventListener('click', fecharModal);
    els.modal?.addEventListener('click', event => {
        if (event.target === els.modal) fecharModal();
    });
    els.modalForm?.addEventListener('submit', salvarModal);
}

async function verificarPermissaoPagina() {
    const usuario = getUsuarioLocal();
    const nivel = getNivelUsuario(usuario);
    if (!nivel) return false;
    if (nivel === 'administrador') return true;

    const { data, error } = await supabaseClient
        .from('nivel_permissoes')
        .select('paginas_permitidas')
        .eq('nivel', nivel)
        .maybeSingle();

    if (error) {
        console.error('Erro ao validar permissao da pagina Revisao:', error);
        return false;
    }

    const paginas = data?.paginas_permitidas || [];
    return paginas.includes(PAGE_ID) || FALLBACK_PAGES.some(page => paginas.includes(page));
}

function mostrarAcessoNegado() {
    document.body.innerHTML = '<div style="padding:50px;text-align:center"><h1>Acesso negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
}

async function carregarFiliais() {
    const filialUsuario = normalizarTexto(getUsuarioLocal()?.filial).toUpperCase();
    if (filialUsuario) {
        els.filtroFilial.innerHTML = '';
        els.filtroFilial.add(new Option(filialUsuario, filialUsuario));
        els.filtroFilial.value = filialUsuario;
        els.filtroFilial.disabled = true;
        return;
    }

    const [filiaisResult, veiculosResult] = await Promise.all([
        supabaseClient.from('filiais').select('nome, sigla').order('nome'),
        supabaseClient.from('veiculos').select('filial').not('filial', 'is', null).limit(1000)
    ]);

    const opcoes = new Map();
    if (!filiaisResult.error) {
        (filiaisResult.data || []).forEach(filial => {
            const value = normalizarTexto(filial.sigla || filial.nome).toUpperCase();
            if (value) opcoes.set(value, filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome);
        });
    }
    if (!veiculosResult.error) {
        (veiculosResult.data || []).forEach(item => {
            const value = normalizarTexto(item.filial).toUpperCase();
            if (value && !opcoes.has(value)) opcoes.set(value, value);
        });
    }

    els.filtroFilial.innerHTML = '<option value="">Todas</option>';
    [...opcoes.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }))
        .forEach(([value, label]) => els.filtroFilial.add(new Option(label, value)));
}

async function buscarRevisoes() {
    setLoading(true, 'Buscando frota...');
    try {
        const veiculos = await buscarVeiculos();
        state.veiculos = veiculos;

        if (!veiculos.length) {
            state.linhas = [];
            renderTudo();
            setStatus('Nenhum veiculo encontrado para os filtros.');
            return;
        }

        const placas = veiculos.map(v => v.placa);

        setLoading(true, `Buscando maior KM em abastecimentos para ${veiculos.length} veiculo(s)...`);
        const kmPorPlaca = await buscarMaiorKmPorPlaca(placas);
        state.kmPorPlaca = kmPorPlaca;

        setLoading(true, 'Buscando historico de revisoes...');
        const historico = await buscarHistorico(placas);
        state.historico = historico;

        state.linhas = veiculos.flatMap(veiculo =>
            montarLinhasVeiculo(veiculo, kmPorPlaca.get(normalizarPlaca(veiculo.placa)), historico)
        );

        popularFiltroServico();
        renderTudo();
        setStatus(`${veiculos.length} veiculo(s) e ${state.linhas.length} revisao(oes) calculados.`);
    } catch (error) {
        console.error('Erro ao buscar revisoes:', error);
        alert('Erro ao buscar revisoes: ' + (error.message || error));
        setStatus('Erro ao buscar revisoes.');
    } finally {
        setLoading(false);
    }
}

async function buscarVeiculos() {
    const filial = normalizarTexto(els.filtroFilial?.value).toUpperCase();
    const busca = normalizarBusca(els.filtroBusca?.value);
    const situacao = els.filtroSituacao?.value || 'ATIVOS';

    const veiculos = await buscarTodos(() => {
        let query = supabaseClient
            .from('veiculos')
            .select('id, placa, filial, modelo, modelo_versao, tipo, situacao, tipo_motor, anofab, anomod')
            .order('placa');
        if (filial) query = query.eq('filial', filial);
        if (situacao && situacao !== 'ATIVOS') query = query.eq('situacao', situacao);
        return query;
    });

    return veiculos.filter(veiculo => {
        if (situacao === 'ATIVOS') {
            const sit = normalizarBusca(veiculo.situacao || 'ativo');
            if (sit === 'INATIVO') return false;
        }
        if (!busca) return true;
        const texto = normalizarBusca([
            veiculo.placa,
            veiculo.modelo,
            veiculo.modelo_versao,
            veiculo.tipo,
            veiculo.tipo_motor
        ].join(' '));
        return texto.includes(busca);
    });
}

async function buscarMaiorKmPorPlaca(placas) {
    const mapa = new Map();
    const placasValidas = [...new Set(placas.flatMap(variantesPlaca).filter(Boolean))];

    for (let i = 0; i < placasValidas.length; i += PLATE_BATCH_SIZE) {
        const lote = placasValidas.slice(i, i + PLATE_BATCH_SIZE);
        setStatus(`Buscando KM: lote ${Math.floor(i / PLATE_BATCH_SIZE) + 1} de ${Math.ceil(placasValidas.length / PLATE_BATCH_SIZE)}...`);

        const [internos, externos] = await Promise.all([
            buscarTodos(() => supabaseClient
                .from('saidas_combustivel')
                .select('veiculo_placa, km_atual, data_hora')
                .in('veiculo_placa', lote)
                .not('km_atual', 'is', null)
                .order('km_atual', { ascending: false })),
            buscarTodos(() => supabaseClient
                .from('abastecimento_externo')
                .select('veiculo_placa, km_atual, data_hora')
                .in('veiculo_placa', lote)
                .not('km_atual', 'is', null)
                .order('km_atual', { ascending: false }))
        ]);

        registrarKms(mapa, internos, 'Interno');
        registrarKms(mapa, externos, 'Externo');
    }

    return mapa;
}

function registrarKms(mapa, registros, fonte) {
    (registros || []).forEach(registro => {
        const placa = normalizarPlaca(registro.veiculo_placa);
        const km = parseNumero(registro.km_atual);
        if (!placa || km <= 0) return;

        const atual = mapa.get(placa);
        if (!atual || km > atual.km) {
            mapa.set(placa, {
                km,
                fonte,
                data_hora: registro.data_hora || null
            });
        }
    });
}

async function buscarTodos(buildQuery) {
    const dados = [];
    let from = 0;

    while (true) {
        const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        dados.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return dados;
}

async function buscarHistorico(placas) {
    if (!placas.length) return new Map();

    const placasNorm = [...new Set(placas.flatMap(variantesPlaca).filter(Boolean))];
    const { data, error } = await supabaseClient
        .from('revisao_historico')
        .select('placa, servico, km_realizado, data_realizado')
        .in('placa', placasNorm)
        .order('km_realizado', { ascending: false });

    if (error) {
        console.error('Erro ao buscar historico de revisao:', error);
        return new Map();
    }

    const mapa = new Map();
    for (const reg of (data || [])) {
        const chave = `${normalizarPlaca(reg.placa)}|${reg.servico}`;
        if (!mapa.has(chave)) mapa.set(chave, reg);
    }
    return mapa;
}

function montarLinhasVeiculo(veiculo, kmInfo, historico) {
    const kmAtual = kmInfo?.km || 0;
    const perfil = classificarVeiculo(veiculo, kmAtual);
    const regras = obterRegrasRevisao(perfil, kmAtual);

    if (!regras.length) {
        regras.push({
            servico: 'Regra nao classificada',
            intervalo: 0,
            regra: 'Modelo/motor sem regra automatica',
            local: '-',
            observacao: 'Verificar cadastro de modelo e tipo de motor.'
        });
    }

    return regras.map(regra => {
        const chave = `${normalizarPlaca(veiculo.placa)}|${regra.servico}`;
        const ultimoReg = historico?.get(chave) || null;
        const ultimoKm = ultimoReg?.km_realizado || null;
        const ultimaData = ultimoReg?.data_realizado || null;

        const proximoKm = calcularProximoKm(kmAtual, regra.intervalo, regra.kmFixo, ultimoKm);
        const kmRestante = proximoKm ? proximoKm - kmAtual : null;
        const status = calcularStatus(kmRestante, kmAtual, regra.kmFixo, ultimoKm);

        return {
            filial: veiculo.filial || '-',
            placa: normalizarPlaca(veiculo.placa),
            modelo: [veiculo.modelo, veiculo.modelo_versao].filter(Boolean).join(' ') || veiculo.tipo || '-',
            tipo_motor: perfil.euro,
            km_atual: kmAtual,
            garantia: perfil.garantiaLabel,
            categoria: perfil.categoriaLabel,
            servico: regra.servico,
            regra: regra.regra,
            proximo_km: proximoKm || null,
            km_restante: kmRestante,
            local_execucao: regra.local,
            status,
            fonte_km: kmInfo ? `${kmInfo.fonte}${kmInfo.data_hora ? ` - ${formatarData(kmInfo.data_hora)}` : ''}` : 'Sem abastecimento',
            observacao: [perfil.observacao, regra.observacao].filter(Boolean).join(' | '),
            ultimo_km_realizado: ultimoKm,
            ultimo_data_realizado: ultimaData
        };
    });
}

function classificarVeiculo(veiculo, kmAtual) {
    const textoModelo = normalizarBusca([veiculo.modelo, veiculo.modelo_versao, veiculo.tipo].join(' '));
    const euro = detectarEuro(veiculo);
    const isFH540 = /\bFH\s*540\b/.test(textoModelo) || textoModelo.includes('FH540');
    const isAccelo = textoModelo.includes('ACCELO');
    const categoria = isFH540 ? 'FH540' : isAccelo ? 'ACCELO' : 'DEMAIS';

    let garantia = false;
    let garantiaLabel = 'Sem garantia';
    let observacao = '';

    if (categoria === 'FH540') {
        garantia = kmAtual <= 200000;
        garantiaLabel = garantia ? (kmAtual > 100000 ? 'Garantia parcial' : 'Com garantia') : 'Sem garantia';
        observacao = garantia
            ? 'Garantia FH 540: 2 anos ou 200.000 KM; apos 100.000 KM somente trem de forca/filtros secos.'
            : 'Garantia FH 540 encerrada por KM superior a 200.000.';
    } else if (categoria === 'ACCELO') {
        garantia = kmAtual <= 100000;
        garantiaLabel = garantia ? 'Com garantia' : 'Sem garantia';
        observacao = garantia
            ? 'Garantia Accelo: 1 ano ou 100.000 KM, qual chegar primeiro.'
            : 'Garantia Accelo encerrada por KM superior a 100.000.';
    } else {
        observacao = 'Garantia nao aplicada para demais modelos neste relatorio.';
    }

    observacao += ' Data de inicio de garantia nao localizada no cadastro; calculo baseado no KM.';

    return {
        categoria,
        categoriaLabel: categoria === 'FH540' ? 'FH 540' : categoria === 'ACCELO' ? 'Accelo' : 'Demais',
        euro,
        garantia,
        garantiaLabel,
        observacao
    };
}

function obterRegrasRevisao(perfil, kmAtual) {
    if (perfil.categoria === 'FH540') return regrasFh540(perfil, kmAtual);
    if (perfil.categoria === 'ACCELO') return regrasAccelo(perfil, kmAtual);
    return regrasDemais(perfil);
}

function regrasFh540(perfil, kmAtual) {
    const regras = [];
    const euro6 = perfil.euro === 'EURO 6';

    regras.push({
        servico: 'Oleo motor, filtros combustivel e racor',
        intervalo: euro6 ? 40000 : 30000,
        regra: euro6 ? 'Euro 6 a cada 40.000 KM' : 'Euro 5 a cada 30.000 KM',
        local: perfil.garantia ? 'Concessionaria' : 'Oficina/Concessionaria'
    });

    if (euro6) {
        regras.push({
            servico: 'Intermediaria filtros combustivel e racor',
            intervalo: 20000,
            regra: 'Euro 6 intermediaria a cada 20.000 KM',
            local: 'Concessionaria'
        });
    }

    if (perfil.garantia && kmAtual <= 100000) {
        regras.push({
            servico: 'Oleo diferencial e cambio',
            kmFixo: 100000,
            regra: 'Ate 100.000 KM',
            local: 'Concessionaria'
        });
    } else if (!perfil.garantia || kmAtual > 100000) {
        regras.push({
            servico: perfil.garantia ? 'Trem de forca: cambio/diferencial e filtros secos' : 'Oleo diferencial',
            kmFixo: 100000,
            regra: 'Apos 100.000 KM',
            local: 'Concessionaria',
            observacao: perfil.garantia ? 'Garantia parcial apos 100.000 KM.' : ''
        });
    }

    return regras;
}

function regrasDemais(perfil) {
    const euro6 = perfil.euro === 'EURO 6';
    const regras = [{
        servico: 'Oleo motor, filtros combustivel e racor',
        intervalo: euro6 ? 50000 : 15000,
        regra: euro6 ? 'Euro 6 a cada 50.000 KM' : 'Euro 5 a cada 15.000 KM',
        local: euro6 ? 'Concessionaria' : 'Oficina externa'
    }];

    if (euro6) {
        regras.push({
            servico: 'Intermediaria filtros combustivel e racor',
            intervalo: 25000,
            regra: 'Euro 6 intermediaria a cada 25.000 KM',
            local: 'Concessionaria'
        });
    }

    regras.push({
        servico: 'Oleo diferencial e cambio',
        kmFixo: 100000,
        regra: 'Apos 100.000 KM',
        local: euro6 ? 'Concessionaria' : 'Oficina externa'
    });

    return regras;
}

function regrasAccelo(perfil, kmAtual) {
    const euro6 = perfil.euro === 'EURO 6';
    const regras = [];

    if (perfil.garantia && euro6) {
        regras.push({
            servico: 'Revisao Accelo Euro 6',
            intervalo: kmAtual <= 90000 ? 30000 : 15000,
            regra: kmAtual <= 90000 ? 'Euro 6 ate 90.000 KM' : 'Euro 6 apos 90.000 KM',
            local: kmAtual <= 90000 ? 'Concessionaria' : 'Oficina externa'
        });
        regras.push({
            servico: 'Intermediaria oleo motor, filtros combustivel e racor',
            intervalo: 25000,
            regra: 'Euro 6 intermediaria a cada 25.000 KM',
            local: 'Concessionaria'
        });
        return regras;
    }

    regras.push({
        servico: 'Revisao Accelo',
        intervalo: euro6 ? 15000 : 10000,
        regra: euro6 ? 'Euro 6 a cada 15.000 KM' : 'Euro 5 a cada 10.000 KM',
        local: 'Oficina externa'
    });

    return regras;
}

function calcularProximoKm(kmAtual, intervalo, kmFixo, ultimoKm) {
    if (kmFixo) {
        if (ultimoKm && ultimoKm >= kmFixo) return null;
        return kmFixo;
    }
    if (!intervalo) return 0;
    if (ultimoKm) return ultimoKm + intervalo;
    return Math.ceil((kmAtual + 1) / intervalo) * intervalo;
}

function calcularStatus(kmRestante, kmAtual, kmFixo, ultimoKm) {
    if (kmFixo && ultimoKm && ultimoKm >= kmFixo) return 'Concluido';
    if (kmRestante === null) return 'Informativo';
    if (kmFixo && kmAtual >= kmFixo) return 'Vencida';
    if (kmRestante <= 0) return 'Vencida';
    if (kmRestante <= AVENCER_KM) return 'A vencer';
    return 'Em dia';
}

function renderTudo() {
    renderKpis();
    renderGrid();
    els.resultadosPanel.classList.toggle('hidden', !state.linhas.length);
    els.emptyPanel.classList.toggle('hidden', !!state.linhas.length);
}

function renderKpis() {
    const vencidas = state.linhas.filter(item => item.status === 'Vencida').length;
    const aVencer = state.linhas.filter(item => item.status === 'A vencer').length;
    els.kpiVeiculos.textContent = formatInteiro(state.veiculos.length);
    els.kpiRevisoes.textContent = formatInteiro(state.linhas.length);
    els.kpiAVencer.textContent = formatInteiro(aVencer);
    els.kpiVencidas.textContent = formatInteiro(vencidas);
}

function renderGrid() {
    const termo = normalizarBusca(els.buscaGrid?.value);
    const filtroStatus = els.filtroStatus?.value || '';
    const filtroServico = els.filtroServico?.value || '';
    const filtroMotor = els.filtroMotor?.value || '';

    const dados = ordenar([...state.linhas], state.sort).filter(item => {
        if (filtroStatus && item.status !== filtroStatus) return false;
        if (filtroServico && item.servico !== filtroServico) return false;
        if (filtroMotor && item.tipo_motor !== filtroMotor) return false;
        if (!termo) return true;
        return normalizarBusca(Object.values(item).join(' ')).includes(termo);
    });

    state.renderedLinhas = dados;

    els.tbodyRevisao.innerHTML = dados.map((item, idx) => `
        <tr>
            <td>${escapeHtml(item.filial)}</td>
            <td>${escapeHtml(item.placa)}</td>
            <td title="${escapeHtml(item.modelo)}">${escapeHtml(item.modelo)}</td>
            <td>${escapeHtml(item.tipo_motor)}</td>
            <td>${formatInteiro(item.km_atual)}</td>
            <td title="${escapeHtml(item.garantia)}">${escapeHtml(item.garantia)}</td>
            <td title="${escapeHtml(item.servico)}">${escapeHtml(item.servico)}</td>
            <td title="${escapeHtml(item.regra)}">${escapeHtml(item.regra)}</td>
            <td>${item.proximo_km ? formatInteiro(item.proximo_km) : '-'}</td>
            <td>${item.km_restante === null ? '-' : formatInteiro(item.km_restante)}</td>
            <td title="${escapeHtml(item.local_execucao)}">${escapeHtml(item.local_execucao)}</td>
            <td>${statusHtml(item.status)}</td>
            <td title="${escapeHtml(item.fonte_km)}">${escapeHtml(item.fonte_km)}</td>
            <td title="${escapeHtml(item.observacao)}">${escapeHtml(item.observacao)}</td>
            <td title="${item.ultimo_km_realizado ? formatInteiro(item.ultimo_km_realizado) + (item.ultimo_data_realizado ? ' em ' + formatarData(item.ultimo_data_realizado) : '') : ''}">${item.ultimo_km_realizado ? formatInteiro(item.ultimo_km_realizado) : '-'}</td>
            <td><button class="btn-icon btn-reg" data-idx="${idx}" title="Registrar servico realizado"><i class="fas fa-wrench"></i></button></td>
        </tr>
    `).join('');
}

function popularFiltroServico() {
    if (!els.filtroServico) return;
    const servicos = [...new Set(state.linhas.map(l => l.servico))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
    );
    const current = els.filtroServico.value;
    els.filtroServico.innerHTML = '<option value="">Todos</option>';
    servicos.forEach(s => els.filtroServico.add(new Option(s, s)));
    if (current && servicos.includes(current)) els.filtroServico.value = current;
}

function abrirModal(item) {
    if (!item) return;
    modalItemAtual = item;

    document.getElementById('modalPlaca').textContent = item.placa;
    document.getElementById('modalModelo').textContent = item.modelo;
    document.getElementById('modalMotor').textContent = item.tipo_motor;
    document.getElementById('modalKmAtualDisplay').textContent = formatInteiro(item.km_atual);
    document.getElementById('modalServicoDisplay').textContent = item.servico;
    document.getElementById('modalRegraDisplay').textContent = item.regra;

    const boxUltimo = document.getElementById('modalUltimoRegistro');
    if (item.ultimo_km_realizado) {
        document.getElementById('modalUltimoTexto').textContent =
            `Ultimo registro: ${formatInteiro(item.ultimo_km_realizado)} km em ${formatarData(item.ultimo_data_realizado)}`;
        boxUltimo.classList.remove('hidden');
    } else {
        boxUltimo.classList.add('hidden');
    }

    if (els.modalDataRealizado) els.modalDataRealizado.value = formatDateLocal(new Date());
    if (els.modalKmRealizado) els.modalKmRealizado.value = item.km_atual || '';
    if (els.modalObservacao) els.modalObservacao.value = '';

    els.modal?.classList.remove('hidden');
    els.modalKmRealizado?.focus();
}

function fecharModal() {
    els.modal?.classList.add('hidden');
    modalItemAtual = null;
}

async function salvarModal(event) {
    event.preventDefault();
    if (!modalItemAtual) return;

    const kmRealizado = parseInt(els.modalKmRealizado?.value, 10);
    const dataRealizado = els.modalDataRealizado?.value;
    const observacao = els.modalObservacao?.value?.trim() || null;

    if (!kmRealizado || !dataRealizado) return;

    if (els.btnSalvarModal) {
        els.btnSalvarModal.disabled = true;
        els.btnSalvarModal.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        const usuario = getUsuarioLocal();
        const { error } = await supabaseClient
            .from('revisao_historico')
            .insert({
                placa: modalItemAtual.placa,
                servico: modalItemAtual.servico,
                km_realizado: kmRealizado,
                data_realizado: dataRealizado,
                observacao,
                usuario_email: usuario?.email || null
            });

        if (error) throw error;

        const chave = `${modalItemAtual.placa}|${modalItemAtual.servico}`;
        state.historico.set(chave, {
            placa: modalItemAtual.placa,
            servico: modalItemAtual.servico,
            km_realizado: kmRealizado,
            data_realizado: dataRealizado
        });

        state.linhas = state.veiculos.flatMap(v =>
            montarLinhasVeiculo(v, state.kmPorPlaca.get(normalizarPlaca(v.placa)), state.historico)
        );

        renderKpis();
        renderGrid();
        fecharModal();
    } catch (err) {
        console.error('Erro ao salvar registro:', err);
        alert('Erro ao salvar: ' + (err.message || err));
    } finally {
        if (els.btnSalvarModal) {
            els.btnSalvarModal.disabled = false;
            els.btnSalvarModal.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }
}

function exportarXlsx() {
    if (!state.linhas.length || !window.XLSX) return;

    const rows = state.linhas.map(item => ({
        Filial: item.filial,
        Placa: item.placa,
        Modelo: item.modelo,
        Motor: item.tipo_motor,
        'KM atual': item.km_atual,
        Garantia: item.garantia,
        Servico: item.servico,
        Regra: item.regra,
        'Proximo KM': item.proximo_km || '',
        'KM restante': item.km_restante ?? '',
        Local: item.local_execucao,
        Status: item.status,
        'Fonte KM': item.fonte_km,
        Observacao: item.observacao,
        'Ult. KM realizado': item.ultimo_km_realizado || '',
        'Ult. data realizado': item.ultimo_data_realizado ? formatarData(item.ultimo_data_realizado) : ''
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Revisao');
    XLSX.writeFile(wb, `Revisao_${formatDateLocal(new Date())}.xlsx`);
}

async function exportarPdf() {
    if (!state.linhas.length) return;
    if (!window.jspdf?.jsPDF) {
        alert('Biblioteca jsPDF nao carregada. Verifique sua conexao.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const logoBase64 = await getLogoBase64();
    const pageWidth = doc.internal.pageSize.getWidth();
    desenharCabecalhoPdf(doc, logoBase64, pageWidth);

    doc.autoTable({
        startY: 27,
        head: [[
            'Filial', 'Placa', 'Modelo', 'Motor', 'KM atual', 'Garantia',
            'Servico', 'Regra', 'Prox. KM', 'Restante', 'Local', 'Status', 'Ult. KM'
        ]],
        body: state.linhas.map(item => [
            item.filial,
            item.placa,
            item.modelo,
            item.tipo_motor,
            formatInteiro(item.km_atual),
            item.garantia,
            item.servico,
            item.regra,
            item.proximo_km ? formatInteiro(item.proximo_km) : '-',
            item.km_restante === null ? '-' : formatInteiro(item.km_restante),
            item.local_execucao,
            item.status,
            item.ultimo_km_realizado ? formatInteiro(item.ultimo_km_realizado) : '-'
        ]),
        styles: { fontSize: 6.5, cellPadding: 1.4, halign: 'center', valign: 'middle' },
        headStyles: { fillColor: [0, 105, 55], textColor: 255 },
        alternateRowStyles: { fillColor: [246, 248, 246] },
        didDrawPage: data => {
            if (data.pageNumber > 1) desenharCabecalhoPdf(doc, logoBase64, pageWidth);
        },
        margin: { top: 27, left: 6, right: 6, bottom: 10 }
    });

    doc.save(`Revisao_${formatDateLocal(new Date())}.pdf`);
}

function desenharCabecalhoPdf(doc, logoBase64, pageWidth) {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, 24, 'F');
    doc.setDrawColor(220, 226, 222);
    doc.line(8, 24, pageWidth - 8, 24);
    if (logoBase64) doc.addImage(logoBase64, 'PNG', 10, 6, 42, 13);
    doc.setFontSize(14);
    doc.setTextColor(0, 83, 44);
    doc.text('Relatorio de Revisao', pageWidth / 2, 11, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 17, { align: 'center' });
}

async function getLogoBase64() {
    try {
        const response = await fetch('logo.png');
        const blob = await response.blob();
        return await new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn('Nao foi possivel carregar o logo para o PDF:', error);
        return null;
    }
}

function detectarEuro(veiculo) {
    const texto = normalizarBusca([veiculo.tipo_motor, veiculo.modelo, veiculo.modelo_versao, veiculo.tipo].join(' '));
    if (texto.includes('EURO 6') || texto.includes('EURO6')) return 'EURO 6';
    if (texto.includes('EURO 5') || texto.includes('EURO5')) return 'EURO 5';

    const ano = parseInteiro(veiculo.anomod || veiculo.anofab);
    return ano >= 2023 ? 'EURO 6' : 'EURO 5';
}

function statusHtml(status) {
    const classes = {
        'Vencida': 'status-vencido',
        'A vencer': 'status-alerta',
        'Informativo': 'status-info',
        'Concluido': 'status-concluido'
    };
    const cls = classes[status] || 'status-ok';
    return `<span class="status-pill ${cls}">${escapeHtml(status)}</span>`;
}

function setLoading(loading, message = '') {
    if (els.btnFiltrar) {
        els.btnFiltrar.disabled = loading;
        els.btnFiltrar.innerHTML = loading
            ? '<i class="fas fa-spinner fa-spin"></i> Filtrando...'
            : '<i class="fas fa-search"></i> Filtrar';
    }
    if (message) setStatus(message);
}

function setStatus(message) {
    if (els.statusBusca) els.statusBusca.textContent = message;
}

function alternarSort(config, key) {
    return { key, asc: config.key === key ? !config.asc : true };
}

function ordenar(data, config) {
    const { key, asc } = config;
    return data.sort((a, b) => {
        const va = a[key];
        const vb = b[key];
        const na = Number(va);
        const nb = Number(vb);
        let result;
        if (Number.isFinite(na) && Number.isFinite(nb)) {
            result = na - nb;
        } else {
            result = String(va || '').localeCompare(String(vb || ''), 'pt-BR', { numeric: true });
        }
        return asc ? result : -result;
    });
}

function getUsuarioLocal() {
    try {
        return JSON.parse(localStorage.getItem('usuarioLogado') || 'null') || {};
    } catch {
        return {};
    }
}

function getNivelUsuario(usuario = getUsuarioLocal()) {
    return String(usuario?.nivel || '').trim().toLowerCase();
}

function normalizarTexto(value) {
    return String(value || '').trim();
}

function normalizarPlaca(value) {
    return normalizarTexto(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function variantesPlaca(value) {
    const texto = normalizarTexto(value).toUpperCase();
    const placa = normalizarPlaca(texto);
    const variantes = new Set([texto, placa]);
    if (placa.length === 7) variantes.add(`${placa.slice(0, 3)}-${placa.slice(3)}`);
    return [...variantes].filter(Boolean);
}

function normalizarBusca(value) {
    return normalizarTexto(value)
        .toUpperCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

function parseNumero(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const texto = String(value).trim();
    const numero = texto.includes(',')
        ? Number(texto.replace(/\./g, '').replace(',', '.'))
        : Number(texto);
    return Number.isFinite(numero) ? numero : 0;
}

function parseInteiro(value) {
    const numero = Number.parseInt(value, 10);
    return Number.isFinite(numero) ? numero : 0;
}

function formatDateLocal(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function formatarData(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toLocaleDateString('pt-BR');
}

function formatInteiro(value) {
    return (Number(value) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
