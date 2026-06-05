import { supabaseClient } from './supabase.js';

const DIARIA_PAGE_ID = 'diaria.html';
const ESCALA_PAGE_ID = 'escala.html';
const IMPORT_DAYS = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
const CACHE_DATAS = {};
const diariaSortState = { key: 'nome', direction: 'asc' };
const NIVEIS_GERENCIAMENTO = new Set([
    'administrador',
    'gerencia',
    'balanca',
    'equipe_noturno',
    'adm_logistica',
    'logistica'
]);

let usuarioLogado = null;
let diariaDadosAtual = [];
let diariaFuncoesCadastroCache = [];
let filiaisCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado) {
        alert('Acesso negado. Por favor, faca login.');
        window.location.href = 'index.html';
        return;
    }

    const acessoPermitido = await verificarPermissaoPagina();
    if (!acessoPermitido) {
        document.body.innerHTML = '<div style="text-align:center; padding:50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
        return;
    }

    preencherCacheDatas();
    carregarSemanas();
    await carregarFiliais();
    configurarEventos();
    atualizarContextoDiaria();
});

function getNivelUsuario() {
    return String(usuarioLogado?.nivel || '').toLowerCase();
}

function podeGerenciar() {
    return NIVEIS_GERENCIAMENTO.has(getNivelUsuario());
}

async function verificarPermissaoPagina() {
    if (getNivelUsuario() === 'administrador') return true;

    try {
        const { data, error } = await supabaseClient
            .from('nivel_permissoes')
            .select('paginas_permitidas')
            .eq('nivel', getNivelUsuario())
            .single();

        if (error) throw error;
        const paginas = data?.paginas_permitidas || [];
        return paginas.includes(DIARIA_PAGE_ID) || paginas.includes(ESCALA_PAGE_ID);
    } catch (error) {
        console.error('Erro ao validar permissao da pagina diaria:', error);
        return false;
    }
}

function configurarEventos() {
    document.getElementById('btnToggleMenuLateralEscala')?.addEventListener('click', toggleMenuLateral);
    document.getElementById('btnCalcularDiaria')?.addEventListener('click', carregarDiaria);
    document.getElementById('btnSalvarDiaria')?.addEventListener('click', salvarDiariaSemana);
    document.getElementById('btnXLSXDiaria')?.addEventListener('click', gerarXLSXDiaria);
    document.getElementById('btnPDFDiaria')?.addEventListener('click', gerarPDFDiaria);
    document.getElementById('diariaValorSemana')?.addEventListener('input', recalcularDiariaComValorAtual);
    document.getElementById('diariaFiltroStatus')?.addEventListener('change', renderDiariaTabela);
    document.getElementById('diariaFiltroFuncao')?.addEventListener('change', renderDiariaTabela);
    document.getElementById('escalaSemana')?.addEventListener('change', atualizarContextoDiaria);
    document.getElementById('escalaFilial')?.addEventListener('change', atualizarContextoDiaria);

    document.querySelector('.diaria-table')?.addEventListener('click', (event) => {
        const sortButton = event.target.closest('[data-diaria-sort]');
        if (sortButton) {
            const key = sortButton.dataset.diariaSort;
            diariaSortState.direction = diariaSortState.key === key && diariaSortState.direction === 'asc' ? 'desc' : 'asc';
            diariaSortState.key = key;
            renderDiariaTabela();
            return;
        }

        const pagarToggle = event.target.closest('.diaria-pagar-toggle');
        if (pagarToggle) {
            atualizarPagamentoManualDiaria(pagarToggle.dataset.diariaKey, pagarToggle.checked);
        }
    });
}

function toggleMenuLateral() {
    document.body.classList.toggle('escala-menu-oculto');
    const btn = document.getElementById('btnToggleMenuLateralEscala');
    const oculto = document.body.classList.contains('escala-menu-oculto');
    if (btn) {
        btn.title = oculto ? 'Mostrar menu lateral' : 'Ocultar menu lateral';
        btn.setAttribute('aria-label', btn.title);
    }
}

function getFilial() {
    return (document.getElementById('escalaFilial')?.value || usuarioLogado?.filial || '').trim();
}

function exigirFilial() {
    if (getFilial()) return true;
    alert('Selecione uma filial.');
    return false;
}

function aplicarFiltroFilial(query) {
    const filial = getFilial();
    return filial ? query.eq('filial', filial) : query;
}

function getUsuarioAuditoria() {
    return usuarioLogado?.nome || usuarioLogado?.nomecompleto || usuarioLogado?.nome_completo || usuarioLogado?.usuario_login || usuarioLogado?.email || 'Sistema';
}

function comAuditoria(payload = {}) {
    return {
        ...payload,
        ultima_alteracao_por: getUsuarioAuditoria(),
        ultima_alteracao_em: new Date().toISOString()
    };
}

function preencherCacheDatas() {
    const baseDate = new Date(Date.UTC(2025, 11, 28));

    for (let i = 1; i <= 53; i++) {
        const nomeSemana = `SEMANA ${String(i).padStart(2, '0')} - 2026`;
        const startOfWeek = addDays(baseDate, (i - 1) * 7);
        CACHE_DATAS[nomeSemana] = {
            DOMINGO: addDays(startOfWeek, 0),
            SEGUNDA: addDays(startOfWeek, 1),
            TERCA: addDays(startOfWeek, 2),
            QUARTA: addDays(startOfWeek, 3),
            QUINTA: addDays(startOfWeek, 4),
            SEXTA: addDays(startOfWeek, 5),
            SABADO: addDays(startOfWeek, 6)
        };
    }
}

function addDays(date, days) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function carregarSemanas() {
    const selectSemana = document.getElementById('escalaSemana');
    if (!selectSemana) return;

    const baseDate = new Date(Date.UTC(2025, 11, 28));
    const hoje = new Date();
    const diffDays = Math.floor((hoje - baseDate) / (1000 * 60 * 60 * 24));
    let semanaAtual = Math.floor(diffDays / 7) + 1;
    if (semanaAtual < 1) semanaAtual = 1;
    if (semanaAtual > 53) semanaAtual = 53;

    selectSemana.innerHTML = '';
    for (let i = 1; i <= 53; i++) {
        const nome = `SEMANA ${String(i).padStart(2, '0')} - 2026`;
        selectSemana.appendChild(new Option(nome, nome));
    }
    selectSemana.value = `SEMANA ${String(semanaAtual).padStart(2, '0')} - 2026`;
}

async function carregarFiliais() {
    const selectFilial = document.getElementById('escalaFilial');
    if (!selectFilial) return;

    const { data, error } = await supabaseClient
        .from('filiais')
        .select('nome, sigla')
        .order('nome');

    if (error) {
        console.error('Erro ao carregar filiais:', error);
        return;
    }

    filiaisCache = podeGerenciar()
        ? (data || [])
        : (data || []).filter(filial => (filial.sigla || filial.nome || '') === (usuarioLogado?.filial || ''));

    selectFilial.innerHTML = '<option value="">Selecione a Filial</option>' + filiaisCache.map(filial => {
        const value = filial.sigla || filial.nome || '';
        const label = filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome;
        return `<option value="${escapeAttribute(value)}">${escapeAttribute(label)}</option>`;
    }).join('');

    const filialUsuario = usuarioLogado?.filial || '';
    if (filialUsuario && Array.from(selectFilial.options).some(opt => opt.value === filialUsuario)) {
        selectFilial.value = filialUsuario;
    }
    selectFilial.disabled = !podeGerenciar() && Boolean(filialUsuario);
}

function atualizarContextoDiaria() {
    const semana = document.getElementById('escalaSemana')?.value || '';
    const filial = getFilial();
    const contexto = document.getElementById('diariaContexto');
    if (contexto) {
        contexto.textContent = semana && filial
            ? `${semana} - ${filial}`
            : 'Selecione a semana e a filial para calcular.';
    }
}

async function carregarFuncoesCadastroDiaria() {
    try {
        const { data, error } = await supabaseClient
            .from('funcionario_funcoes')
            .select('nome, ativo')
            .eq('ativo', true)
            .order('nome');

        if (error) throw error;
        diariaFuncoesCadastroCache = (data || []).map(item => cleanImportValue(item.nome)).filter(Boolean);
    } catch (error) {
        diariaFuncoesCadastroCache = [];
        console.warn('Cadastro de funcoes da diaria nao carregado:', error);
    }
}

function getFuncoesFiltroDiaria() {
    const funcoesDados = diariaDadosAtual.map(item => cleanImportValue(item.funcao)).filter(Boolean);
    return [...new Set([...diariaFuncoesCadastroCache, ...funcoesDados])]
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

function atualizarFiltroFuncaoDiaria() {
    const select = document.getElementById('diariaFiltroFuncao');
    if (!select) return;

    const valoresAtuais = new Set(Array.from(select.selectedOptions).map(opt => opt.value));
    const funcoes = getFuncoesFiltroDiaria();

    select.innerHTML = funcoes
        .map(funcao => `<option value="${escapeAttribute(funcao)}">${escapeAttribute(funcao)}</option>`)
        .join('');

    Array.from(select.options).forEach(option => {
        option.selected = valoresAtuais.has(option.value);
    });
}

async function carregarDiaria() {
    const semana = document.getElementById('escalaSemana')?.value;
    const tbody = document.getElementById('tbodyDiaria');
    if (!semana || !tbody) return;
    if (!exigirFilial()) return;

    atualizarContextoDiaria();
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Carregando...</td></tr>';

    try {
        const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
        const datasSemana = getDatasSemanaISO(semana);

        const [, resFuncionarios, resFaltas, resEscala] = await Promise.all([
            carregarFuncoesCadastroDiaria(),
            supabaseClient
                .from('funcionario')
                .select('nome, nome_completo, cpf, funcao, status, filial, recebe_diaria')
                .neq('recebe_diaria', false)
                .order('nome'),
            aplicarFiltroFilial(supabaseClient
                .from('faltas_afastamentos')
                .select('motorista_ausente, motivo_motorista, auxiliar_ausente, motivo_auxiliar, data_escala')
                .in('data_escala', datasSemana)),
            aplicarFiltroFilial(supabaseClient
                .from('escala')
                .select('motorista, auxiliar')
                .in('data_escala', datasSemana)
                .not('tipo_escala', 'eq', 'RESERVA'))
        ]);

        if (resFuncionarios.error) throw resFuncionarios.error;
        if (resFaltas.error) throw resFaltas.error;
        if (resEscala.error) throw resEscala.error;

        const descontosAnteriores = await carregarDescontosDiariaAnterior(semana);
        const nomeDiariaMap = new Map();

        (resFuncionarios.data || []).forEach(funcionario => {
            const nomeCurto = cleanImportValue(funcionario.nome) || cleanImportValue(funcionario.nome_completo);
            if (!nomeCurto) return;
            [funcionario.nome, funcionario.nome_completo].forEach(nome => {
                const key = normalizeString(nome);
                if (key) nomeDiariaMap.set(key, nomeCurto);
            });
        });

        const getNomeDiaria = (nome) => nomeDiariaMap.get(normalizeString(nome)) || cleanImportValue(nome);
        const funcionariosEscalados = new Set();

        (resEscala.data || []).forEach(row => {
            [row.motorista, row.auxiliar].forEach(nome => {
                const nomeDiaria = getNomeDiaria(nome);
                const key = normalizeString(nomeDiaria);
                if (key) funcionariosEscalados.add(key);
            });
        });

        const ausencias = new Map();
        (resFaltas.data || []).forEach(row => {
            [
                { nome: row.motorista_ausente, motivo: row.motivo_motorista },
                { nome: row.auxiliar_ausente, motivo: row.motivo_auxiliar }
            ].forEach(item => {
                const nome = getNomeDiaria(item.nome);
                if (!nome) return;
                const key = normalizeString(nome);
                const motivo = cleanImportValue(item.motivo) || 'FALTA';
                if (!isStatusAusenciaDiaria(motivo) && cleanImportValue(item.motivo)) return;
                if (!ausencias.has(key)) ausencias.set(key, { dias: new Set(), motivos: new Set() });
                ausencias.get(key).dias.add(String(row.data_escala || '').slice(0, 10));
                ausencias.get(key).motivos.add(motivo);
            });
        });

        const filialSelecionada = normalizeString(getFilial());
        const funcionarios = (resFuncionarios.data || [])
            .filter(funcionario => !filialSelecionada || normalizeString(funcionario.filial || getFilial()) === filialSelecionada)
            .map(funcionario => {
                const nome = getNomeDiaria(funcionario.nome || funcionario.nome_completo);
                return {
                    nome,
                    nomeCompleto: cleanImportValue(funcionario.nome_completo),
                    cpf: cleanImportValue(funcionario.cpf),
                    funcao: cleanImportValue(funcionario.funcao),
                    statusCadastro: cleanImportValue(funcionario.status)
                };
            })
            .filter(funcionario => funcionario.nome)
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        if (funcionarios.length === 0) {
            diariaDadosAtual = [];
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum funcionario encontrado para a filial.</td></tr>';
            atualizarFiltroFuncaoDiaria();
            atualizarResumoDiaria();
            return;
        }

        diariaDadosAtual = funcionarios.map(funcionario => {
            const key = normalizeString(funcionario.nome);
            const ausencia = ausencias.get(key);
            const diasDesconto = ausencia ? ausencia.dias.size : 0;
            const descontoAnterior = descontosAnteriores.get(key) || 0;
            const datasFalta = ausencia ? [...ausencia.dias].sort().map(formatDataISOBR) : [];
            const foraEscala = !funcionariosEscalados.has(key);

            return recalcularItemDiaria({
                key,
                nome: funcionario.nome,
                nomeCompleto: funcionario.nomeCompleto,
                cpf: funcionario.cpf,
                funcao: funcionario.funcao,
                statusCadastro: funcionario.statusCadastro,
                status: 'APTO',
                descricaoStatus: '',
                datasFalta,
                motivosAusencia: ausencia ? [...ausencia.motivos] : [],
                diasDesconto,
                descontoAnterior,
                valorPagar: 0,
                valorDesconto: 0,
                recebe: true,
                foraEscala,
                pagarManual: !foraEscala
            }, valorSemana);
        });

        atualizarFiltroFuncaoDiaria();
        renderDiariaTabela();
    } catch (error) {
        console.error('Erro ao carregar diaria:', error);
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#dc3545;">Erro ao carregar diaria.</td></tr>';
    }
}

function recalcularItemDiaria(item, valorSemana) {
    const valorDia = valorSemana / 5;
    const statusCadastro = cleanImportValue(item.statusCadastro);
    const temStatusCadastroAusencia = statusCadastro && isStatusAusenciaDiaria(statusCadastro);
    const diasDesconto = Number(item.diasDesconto || 0);
    const descontoAnterior = Number(item.descontoAnterior || 0);
    const bloqueioStatus = temStatusCadastroAusencia || item.foraEscala || diasDesconto >= 5;
    const pagarManual = item.pagarManual !== false;

    item.bloqueioStatus = bloqueioStatus;
    item.recebe = !bloqueioStatus && pagarManual;
    item.valorDesconto = Math.max(0, diasDesconto * valorDia);
    item.valorPagar = item.recebe ? Math.max(0, valorSemana - item.valorDesconto - descontoAnterior) : 0;

    if (bloqueioStatus || !pagarManual) {
        item.status = temStatusCadastroAusencia
            ? statusCadastro
            : (item.foraEscala ? 'FORA DA ESCALA' : (diasDesconto >= 5 ? 'BLOQUEADO' : 'NAO PAGAR'));
        item.descricaoStatus = item.foraEscala
            ? 'Funcionario nao localizado na escala da semana selecionada.'
            : (temStatusCadastroAusencia ? statusCadastro : 'Pagamento de diaria desmarcado ou bloqueado.');
    } else {
        item.status = 'APTO';
        item.descricaoStatus = item.datasFalta.length
            ? `Desconto por ${item.motivosAusencia.length ? item.motivosAusencia.join(', ') : 'ausencia'}: ${item.datasFalta.join(', ')}`
            : 'Apto para receber diaria.';
    }

    return item;
}

function recalcularDiariaComValorAtual() {
    if (diariaDadosAtual.length === 0) {
        atualizarResumoDiaria();
        return;
    }

    const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
    diariaDadosAtual.forEach(item => recalcularItemDiaria(item, valorSemana));
    renderDiariaTabela();
}

function atualizarPagamentoManualDiaria(key, pagarManual) {
    const item = diariaDadosAtual.find(row => row.key === key);
    if (!item) return;
    item.pagarManual = pagarManual;
    const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
    recalcularItemDiaria(item, valorSemana);
    renderDiariaTabela();
}

function renderDiariaTabela() {
    const tbody = document.getElementById('tbodyDiaria');
    if (!tbody) return;

    const dadosOrdenados = getDiariaDadosExportacao();
    document.querySelectorAll('[data-diaria-sort] i').forEach(icon => {
        const button = icon.closest('[data-diaria-sort]');
        const ativo = button?.dataset.diariaSort === diariaSortState.key;
        icon.className = ativo
            ? (diariaSortState.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down')
            : 'fas fa-sort';
    });

    if (dadosOrdenados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum funcionario encontrado para os filtros selecionados.</td></tr>';
        atualizarResumoDiaria();
        return;
    }

    tbody.innerHTML = dadosOrdenados.map(item => `
        <tr data-nome="${escapeAttribute(item.nome)}" data-funcao="${escapeAttribute(item.funcao)}" data-status="${escapeAttribute(item.status)}">
            <td>${escapeAttribute(item.nome)}</td>
            <td>${escapeAttribute(item.nomeCompleto)}</td>
            <td>${escapeAttribute(item.cpf)}</td>
            <td>${escapeAttribute(item.funcao)}</td>
            <td style="text-align:center;"><input type="checkbox" class="diaria-pagar-toggle" data-diaria-key="${escapeAttribute(item.key)}" ${item.recebe ? 'checked' : ''} ${item.bloqueioStatus ? 'disabled' : ''} title="${item.bloqueioStatus ? 'Bloqueado por falta, afastamento, ferias ou fora da escala' : 'Marcar para pagar diaria'}"></td>
            <td><span class="diaria-status ${item.recebe ? 'apto' : 'bloqueado'}" title="${escapeAttribute(item.descricaoStatus || item.status)}">${escapeAttribute(item.status)}</span></td>
            <td>${item.diasDesconto}</td>
            <td>${formatMoedaBR(item.descontoAnterior)}</td>
            <td>${formatMoedaBR(item.valorPagar)}</td>
            <td>${formatMoedaBR(item.valorDesconto)}</td>
        </tr>
    `).join('');

    atualizarResumoDiaria();
}

function atualizarResumoDiaria() {
    const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
    const dados = getDiariaDadosExportacao();
    const totalDesconto = dados.reduce((sum, item) => sum + Number(item.valorDesconto || 0), 0);
    const totalPagar = dados.reduce((sum, item) => sum + Number(item.valorPagar || 0), 0);

    setText('diariaValorDia', formatMoedaBR(valorSemana / 5));
    setText('diariaTotalDesconto', formatMoedaBR(totalDesconto));
    setText('diariaTotalPagar', formatMoedaBR(totalPagar));
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function getDiariaFuncoesSelecionadas() {
    const select = document.getElementById('diariaFiltroFuncao');
    if (!select) return [];
    return Array.from(select.selectedOptions).map(opt => normalizeString(opt.value)).filter(Boolean);
}

function getDiariaDadosExportacao() {
    const filtroStatus = document.getElementById('diariaFiltroStatus')?.value || '';
    const funcoesSelecionadas = getDiariaFuncoesSelecionadas();
    const dadosFiltrados = diariaDadosAtual.filter(item => {
        const statusOk = !filtroStatus || (filtroStatus === 'APTO' ? item.recebe : !item.recebe);
        const funcaoOk = funcoesSelecionadas.length === 0 || funcoesSelecionadas.includes(normalizeString(item.funcao));
        return statusOk && funcaoOk;
    });
    return ordenarDiariaDados(dadosFiltrados);
}

function ordenarDiariaDados(dados) {
    const direction = diariaSortState.direction === 'desc' ? -1 : 1;
    const key = diariaSortState.key || 'nome';
    return [...dados].sort((a, b) => {
        const aValue = a[key];
        const bValue = b[key];
        if (typeof aValue === 'number' || typeof bValue === 'number') {
            return ((Number(aValue) || 0) - (Number(bValue) || 0)) * direction;
        }
        return String(aValue || '').localeCompare(String(bValue || ''), 'pt-BR', { sensitivity: 'base' }) * direction;
    });
}

async function carregarDescontosDiariaAnterior(semana) {
    const semanaAnterior = getSemanaAnteriorNome(semana);
    if (!semanaAnterior || !getFilial()) return new Map();

    try {
        const { data: diaria, error } = await supabaseClient
            .from('escala_diarias')
            .select('id')
            .eq('semana_nome', semanaAnterior)
            .eq('filial', getFilial())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !diaria?.id) return new Map();

        const { data: itens, error: itensError } = await supabaseClient
            .from('escala_diaria_itens')
            .select('funcionario_nome, valor_desconto')
            .eq('diaria_id', diaria.id);

        if (itensError) throw itensError;

        const map = new Map();
        (itens || []).forEach(item => {
            const key = normalizeString(item.funcionario_nome);
            if (key) map.set(key, Number(item.valor_desconto || 0));
        });
        return map;
    } catch (error) {
        console.warn('Descontos anteriores de diaria nao carregados:', error);
        return new Map();
    }
}

function getSemanaAnteriorNome(semana) {
    const datasSemana = CACHE_DATAS[semana];
    const domingo = datasSemana?.DOMINGO;
    if (!domingo) return '';
    const alvo = addDays(domingo, -7).toISOString().split('T')[0];
    return Object.keys(CACHE_DATAS).find(nomeSemana => {
        const datas = CACHE_DATAS[nomeSemana];
        return IMPORT_DAYS.some(dia => datas?.[dia]?.toISOString().split('T')[0] === alvo);
    }) || '';
}

async function salvarDiariaSemana() {
    const semana = document.getElementById('escalaSemana')?.value;
    if (!semana) return alert('Selecione uma semana.');
    if (!exigirFilial()) return;

    const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
    if (valorSemana <= 0) return alert('Informe o valor da diaria semanal.');
    if (diariaDadosAtual.length === 0) return alert('Calcule a diaria antes de salvar.');

    const itens = diariaDadosAtual.map(item => ({
        funcionario_nome: item.nome,
        funcao: item.funcao,
        status_diaria: item.status,
        dias_desconto: item.diasDesconto,
        desconto_anterior: item.descontoAnterior,
        valor_pagar: item.valorPagar,
        valor_desconto: item.valorDesconto,
        recebe_diaria: item.recebe
    }));

    try {
        const diariaPayload = comAuditoria({
            semana_nome: semana,
            filial: getFilial(),
            valor_diaria: valorSemana,
            valor_dia: valorSemana / 5,
            dias_base: 5,
            data_inicio: getDatasSemanaISO(semana)[0] || null,
            data_fim: getDatasSemanaISO(semana).at(-1) || null,
            total_funcionarios: itens.length,
            total_pagar: itens.reduce((sum, item) => sum + Number(item.valor_pagar || 0), 0),
            total_desconto: itens.reduce((sum, item) => sum + Number(item.valor_desconto || 0), 0),
            total_aptos: itens.filter(item => item.recebe_diaria).length,
            total_bloqueados: itens.filter(item => !item.recebe_diaria).length
        });

        const { data: diariaExistente, error: buscaError } = await supabaseClient
            .from('escala_diarias')
            .select('id')
            .eq('semana_nome', semana)
            .eq('filial', getFilial())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (buscaError) throw buscaError;

        let diaria = diariaExistente;
        if (diariaExistente?.id) {
            const { data, error } = await supabaseClient
                .from('escala_diarias')
                .update(diariaPayload)
                .eq('id', diariaExistente.id)
                .select('id')
                .single();
            if (error) throw error;
            diaria = data;
        } else {
            const { data, error } = await supabaseClient
                .from('escala_diarias')
                .insert(diariaPayload)
                .select('id')
                .single();
            if (error) throw error;
            diaria = data;
        }

        if (!diaria?.id) throw new Error('Diaria nao retornou ID para salvar os itens.');

        const { error: deleteError } = await supabaseClient
            .from('escala_diaria_itens')
            .delete()
            .eq('diaria_id', diaria.id);
        if (deleteError) throw deleteError;

        const { error: insertError } = await supabaseClient
            .from('escala_diaria_itens')
            .insert(itens.map(item => comAuditoria({ ...item, diaria_id: diaria.id })));
        if (insertError) throw insertError;

        alert('Diaria registrada com sucesso.');
    } catch (error) {
        console.error('Erro ao salvar diaria:', error);
        alert('Erro ao salvar diaria. Verifique se o script SQL da tabela escala_diarias foi aplicado. Detalhe: ' + error.message);
    }
}

function gerarXLSXDiaria() {
    if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX nao carregada.');
    const dados = getDiariaDadosExportacao();
    if (dados.length === 0) return alert('Nenhum dado para gerar XLSX.');

    const resumo = getDiariaResumoExportacao(dados);
    const semana = document.getElementById('escalaSemana')?.value || '';
    const filial = getFilial();
    const wsData = [
        [`DIARIA - ${semana} - ${filial}`],
        [`Valor semanal: ${formatMoedaBR(resumo.valorSemana)}`, `Valor por dia: ${formatMoedaBR(resumo.valorDia)}`, `Total a pagar: ${formatMoedaBR(resumo.totalPagar)}`, `Desconto prox. semana: ${formatMoedaBR(resumo.totalDesconto)}`],
        [],
        ['FUNCIONARIO', 'NOME COMPLETO', 'CPF', 'FUNCAO', 'PAGAR', 'STATUS', 'DESCRICAO', 'DIAS DESC.', 'DESC. ANTERIOR', 'VALOR A PAGAR', 'DESC. PROX. SEMANA'],
        ...dados.map(item => [
            item.nome,
            item.nomeCompleto,
            item.cpf,
            item.funcao,
            item.recebe ? 'SIM' : 'NAO',
            item.status,
            item.descricaoStatus,
            item.diasDesconto,
            item.descontoAnterior,
            item.valorPagar,
            item.valorDesconto
        ])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
        { wch: 24 }, { wch: 34 }, { wch: 16 }, { wch: 30 }, { wch: 10 },
        { wch: 18 }, { wch: 42 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Diaria');
    XLSX.writeFile(wb, getDiariaNomeArquivo('xlsx'));
}

function gerarPDFDiaria() {
    const dados = getDiariaDadosExportacao();
    if (dados.length === 0) return alert('Nenhum dado para gerar PDF.');
    if (!window.jspdf?.jsPDF) return alert('Biblioteca jsPDF nao carregada.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const resumo = getDiariaResumoExportacao(dados);
    const semana = document.getElementById('escalaSemana')?.value || '';
    const filial = getFilial();

    doc.setFontSize(15);
    doc.text(`Diaria - ${semana} - ${filial}`, 14, 14);
    doc.setFontSize(9);
    doc.text(`Valor semanal: ${formatMoedaBR(resumo.valorSemana)} | Valor por dia: ${formatMoedaBR(resumo.valorDia)} | Total a pagar: ${formatMoedaBR(resumo.totalPagar)} | Desconto prox. semana: ${formatMoedaBR(resumo.totalDesconto)}`, 14, 21);

    doc.autoTable({
        startY: 27,
        head: [['FUNCIONARIO', 'NOME COMPLETO', 'CPF', 'FUNCAO', 'PAGAR', 'STATUS', 'DIAS DESC.', 'DESC. ANTERIOR', 'VALOR A PAGAR', 'DESC. PROX. SEMANA']],
        body: dados.map(item => [
            item.nome,
            item.nomeCompleto,
            item.cpf,
            item.funcao,
            item.recebe ? 'SIM' : 'NAO',
            item.status,
            item.diasDesconto,
            formatMoedaBR(item.descontoAnterior),
            formatMoedaBR(item.valorPagar),
            formatMoedaBR(item.valorDesconto)
        ]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [0, 105, 55] },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 36 },
            3: { cellWidth: 34 },
            5: { cellWidth: 23 }
        }
    });

    doc.save(getDiariaNomeArquivo('pdf'));
}

function getDiariaResumoExportacao(dados) {
    const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
    return {
        valorSemana,
        valorDia: valorSemana / 5,
        totalDesconto: dados.reduce((sum, item) => sum + Number(item.valorDesconto || 0), 0),
        totalPagar: dados.reduce((sum, item) => sum + Number(item.valorPagar || 0), 0)
    };
}

function getDiariaNomeArquivo(ext) {
    const semana = document.getElementById('escalaSemana')?.value || 'SEMANA';
    const filial = getFilial() || 'FILIAL';
    const nome = `Diaria_${semana}_${filial}`.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_');
    return `${nome}.${ext}`;
}

function getDatasSemanaISO(semana) {
    const datas = CACHE_DATAS[semana];
    if (!datas) return [];
    return IMPORT_DAYS.map(dia => datas[dia]?.toISOString().split('T')[0]).filter(Boolean);
}

function isStatusAusenciaDiaria(value) {
    const status = normalizeString(value);
    return status.includes('FALTA')
        || status.includes('FERIAS')
        || status.includes('AFAST')
        || status.includes('AUSENTE')
        || status.includes('INSS');
}

function parseMoedaBR(value) {
    if (value === null || value === undefined) return 0;
    const normalized = String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
}

function formatMoedaBR(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDataISOBR(dataISO) {
    const value = String(dataISO || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
}

function cleanImportValue(value, { keepZero = false } = {}) {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (!keepZero && (text === '0' || normalizeString(text) === 'SYSTEM.XML.XMLELEMENT')) return '';
    return text;
}

function normalizeString(value) {
    return String(value || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

function escapeAttribute(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
