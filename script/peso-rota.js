import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const TIMEZONE_SAO_PAULO = 'America/Sao_Paulo';
const SEMANAS = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO'];
const DIAS_RETORNO = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO', 'EXTRA', 'AVULSA'];
const SEMANA_DIA_OFFSET = {
    SEGUNDA: 0,
    TERÇA: 1,
    QUARTA: 2,
    QUINTA: 3,
    SEXTA: 4,
    SABADO: 5,
    DOMINGO: 6
};
const PLANILHAS_DIAS_SEMANA = [
    'SEGUNDA',
    'TERÇA',
    'TERCA',
    'QUARTA',
    'QUINTA',
    'SEXTA',
    'SABADO',
    'SÁBADO',
    'DOMINGO'
];
const CAMPOS_GRID = [
    'rota',
    'semana',
    'supervisor',
    'motorista',
    'auxiliar',
    'placa',
    'tipo_veiculo',
    'pbt',
    'peso_carga',
    'qtd_caixas',
    'qtd_clientes',
    'dia_semana_retorno',
    'horario_chegada',
    'descricao'
];
const COLUNAS_COLAGEM = {
    rota: ['ROTA', 'NUMERO ROTA', 'NUMERO DA ROTA'],
    semana: ['SEMANA', 'DIA DA SEMANA', 'DIA SEMANA'],
    supervisor: ['SUPERVISOR'],
    motorista: ['MOTORISTA', 'MOT'],
    auxiliar: ['AUXILIAR', 'AJUDANTE', 'AUX'],
    placa: ['PLACA', 'VEICULO'],
    tipo_veiculo: ['MODELO', 'TIPO', 'TIPO VEICULO', 'TIPO DO VEICULO'],
    pbt: ['PBT', 'CAPACIDADE CARGA', 'CAPACIDADE DE CARGA', 'CAPACIDADE'],
    peso_carga: ['PESO', 'PESO CARGA', 'PESO DA CARGA'],
    qtd_caixas: ['QTD CAIXAS', 'QTDE CAIXAS', 'CAIXAS'],
    qtd_clientes: ['QTD CLIENTES', 'QTDE CLIENTES', 'CLIENTES'],
    dia_semana_retorno: ['DIA RETORNO', 'DIA SEMANA RETORNO', 'DIA DA SEMANA RETORNO'],
    horario_chegada: ['HORARIO CHEGADA', 'HORA CHEGADA', 'CHEGADA'],
    descricao: ['DESCRICAO', 'OBS', 'OBSERVACAO']
};

const CAMPO_CAPACIDADE_GRID = 'pbt';
const PESO_ROTA_ON_CONFLICT = 'dia_retorno,rota,filial';
const PESO_ROTA_BACKUP_VERSAO = '1';
const PESO_ROTA_BACKUP_ABA_CONTEXTO = 'CONTEXTO';
const PESO_ROTA_BACKUP_ABA_DADOS = 'PESO_ROTA';
const PESO_ROTA_BACKUP_COLUNAS = [
    ['FILIAL', 'filial'],
    ['SEMANA ANO', 'semana_ano'],
    ['DIA DA SEMANA', 'semana'],
    ['ROTA', 'rota'],
    ['SUPERVISOR', 'supervisor'],
    ['MOTORISTA', 'motorista'],
    ['AUXILIAR', 'auxiliar'],
    ['PLACA', 'placa'],
    ['MODELO', 'tipo_veiculo'],
    ['CAPACIDADE DE CARGA', 'pbt'],
    ['PESO DA CARGA', 'peso_carga'],
    ['QTD CAIXAS', 'qtd_caixas'],
    ['QTD CLIENTES', 'qtd_clientes'],
    ['STATUS', 'status'],
    ['DIA RETORNO', 'dia_semana_retorno'],
    ['DATA RETORNO', 'dia_retorno'],
    ['HORARIO CHEGADA', 'horario_chegada'],
    ['DESCRICAO', 'descricao']
];

let gridData = [];
let rotasBase = [];
let veiculosPorPlaca = new Map();
let sortConfig = { key: 'rota', asc: true };
let lastSelectedRowIndex = null;
let resizingColumn = null;

function getUserFilial() {
    try {
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        return normalizarTexto(usuarioLogado?.filial);
    } catch (error) {
        console.error('Erro ao identificar a filial do usuário:', error);
        return '';
    }
}

function getUsuarioLogadoNome() {
    try {
        const u = JSON.parse(localStorage.getItem('usuarioLogado'));
        return u?.nome || u?.usuario_login || u?.email || 'Sistema';
    } catch {
        return 'Sistema';
    }
}

const ORDEM_DIAS_ROTA = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO', 'DOMINGO'];
const CLASSES_DIA_RETORNO = [
    'dia-retorno-segunda',
    'dia-retorno-terca',
    'dia-retorno-quarta',
    'dia-retorno-quinta',
    'dia-retorno-sexta',
    'dia-retorno-sabado',
    'dia-retorno-domingo',
    'dia-retorno-extra',
    'dia-retorno-avulsa'
];

document.addEventListener('DOMContentLoaded', async () => {
    const filtroSemanaAno = document.getElementById('filtroSemanaAno');
    if (filtroSemanaAno && !filtroSemanaAno.value) filtroSemanaAno.value = getSemanaAnoAtual();

    bindEvents();
    setupResizableColumns();
    await carregarFiliaisFiltro();
    await carregarDados();
});

function bindEvents() {
    document.getElementById('btnToggleMenuLateralPesoRota')?.addEventListener('click', toggleMenuLateralPesoRota);
    document.getElementById('btnCarregarRotas')?.addEventListener('click', carregarDados);
    document.getElementById('btnAdicionarLinha')?.addEventListener('click', adicionarLinha);
    document.getElementById('btnImportarRoteiro')?.addEventListener('click', () => {
        document.getElementById('inputImportarRoteiro')?.click();
    });
    document.getElementById('btnImportarEscalaOnline')?.addEventListener('click', importarEscalaOnlinePeso);
    document.getElementById('btnImportarRetornoRota')?.addEventListener('click', importarRetornoRota);
    document.getElementById('inputImportarRoteiro')?.addEventListener('change', importarRoteiroPeso);
    document.getElementById('btnExportarBackupXlsx')?.addEventListener('click', exportarBackupPesoRotaXlsx);
    document.getElementById('btnSalvarTudo')?.addEventListener('click', salvarTudo);
    document.getElementById('btnExcluirSelecionados')?.addEventListener('click', excluirSelecionados);
    document.getElementById('filtroSemana')?.addEventListener('change', renderGrid);
    document.getElementById('filtroDiaRetorno')?.addEventListener('change', renderGrid);
    document.getElementById('filtroFilial')?.addEventListener('change', carregarDados);
    document.getElementById('filtroSemanaAno')?.addEventListener('change', carregarDados);
    document.getElementById('searchInput')?.addEventListener('input', renderGrid);

    document.getElementById('selectAllRows')?.addEventListener('change', (event) => {
        document.querySelectorAll('#tbodyPesoRota .row-select').forEach(checkbox => {
            checkbox.checked = event.target.checked;
        });
        atualizarContadorSelecionados();
    });

    document.querySelectorAll('#gridPesoRota thead th[data-sort]').forEach(th => {
        th.addEventListener('click', () => ordenarPor(th.dataset.sort));
    });

    document.addEventListener('mousemove', handleColumnResizeMove);
    document.addEventListener('mouseup', stopColumnResize);

    const tbody = document.getElementById('tbodyPesoRota');
    tbody?.addEventListener('focus',   handleGridFocusDecimal,   true);
    tbody?.addEventListener('keydown', handleGridArrowNavigation);
    tbody?.addEventListener('keydown', handleGridKeydownDecimal);
    tbody?.addEventListener('paste',   handleGridPasteDecimal);
    tbody?.addEventListener('input',   handleGridInput);
    tbody?.addEventListener('change',  handleGridChange);
    tbody?.addEventListener('click',   handleGridClick);
    tbody?.addEventListener('paste',   handlePaste);

    document.addEventListener('keydown', handleSalvarTudoShortcut);
}

function handleSalvarTudoShortcut(event) {
    const key = String(event.key || '').toLowerCase();
    if (key !== 's' || (!event.ctrlKey && !event.metaKey) || event.altKey) return;

    event.preventDefault();

    const btn = document.getElementById('btnSalvarTudo');
    if (btn?.disabled) return;

    salvarTudo();
}

function toggleMenuLateralPesoRota() {
    document.body.classList.toggle('peso-rota-menu-oculto');
    const oculto = document.body.classList.contains('peso-rota-menu-oculto');
    const btn = document.getElementById('btnToggleMenuLateralPesoRota');

    if (btn) {
        const title = oculto ? 'Mostrar menu lateral' : 'Ocultar menu lateral';
        btn.title = title;
        btn.setAttribute('aria-label', title);
    }
}

function setupResizableColumns() {
    const table = document.getElementById('gridPesoRota');
    if (!table) return;

    table.querySelectorAll('thead th').forEach((th, index) => {
        if (th.querySelector('.column-resizer')) return;

        const savedWidth = localStorage.getItem(getColumnWidthKey(index));
        if (savedWidth) aplicarLarguraColuna(index, Number(savedWidth));

        const resizer = document.createElement('span');
        resizer.className = 'column-resizer';
        resizer.title = 'Arraste para ajustar a largura da coluna';
        resizer.addEventListener('mousedown', (event) => startColumnResize(event, index, th));
        resizer.addEventListener('dblclick', (event) => {
            event.stopPropagation();
            localStorage.removeItem(getColumnWidthKey(index));
            limparLarguraColuna(index);
        });
        th.appendChild(resizer);
    });
}

function startColumnResize(event, columnIndex, th) {
    event.preventDefault();
    event.stopPropagation();

    resizingColumn = {
        columnIndex,
        startX: event.clientX,
        startWidth: th.getBoundingClientRect().width
    };
    document.body.classList.add('resizing-column');
}

function handleColumnResizeMove(event) {
    if (!resizingColumn) return;

    const nextWidth = Math.max(42, resizingColumn.startWidth + event.clientX - resizingColumn.startX);
    aplicarLarguraColuna(resizingColumn.columnIndex, nextWidth);
}

function stopColumnResize() {
    if (!resizingColumn) return;

    const th = document.querySelector(`#gridPesoRota thead th:nth-child(${resizingColumn.columnIndex + 1})`);
    if (th) {
        localStorage.setItem(getColumnWidthKey(resizingColumn.columnIndex), String(Math.round(th.getBoundingClientRect().width)));
    }

    resizingColumn = null;
    document.body.classList.remove('resizing-column');
}

function aplicarLarguraColuna(columnIndex, width) {
    const cells = document.querySelectorAll(`#gridPesoRota tr > *:nth-child(${columnIndex + 1})`);
    cells.forEach(cell => {
        cell.style.width = `${width}px`;
        cell.style.minWidth = `${width}px`;
        cell.style.maxWidth = `${width}px`;
    });
}

function limparLarguraColuna(columnIndex) {
    const cells = document.querySelectorAll(`#gridPesoRota tr > *:nth-child(${columnIndex + 1})`);
    cells.forEach(cell => {
        cell.style.width = '';
        cell.style.minWidth = '';
        cell.style.maxWidth = '';
    });
}

function getColumnWidthKey(columnIndex) {
    return `peso-rota-col-width-${columnIndex}`;
}

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

function formatDateLocal(date) {
    const ano = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function excelDateToISO(value) {
    if (!value) return '';

    if (value instanceof Date) {
        return formatDateLocal(value);
    }

    if (typeof value === 'number' && window.XLSX?.SSF) {
        const data = window.XLSX.SSF.parse_date_code(value);
        if (!data) return '';
        return `${data.y}-${String(data.m).padStart(2, '0')}-${String(data.d).padStart(2, '0')}`;
    }

    const texto = String(value).trim();
    const matchBR = texto.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (matchBR) {
        const dia = matchBR[1].padStart(2, '0');
        const mes = matchBR[2].padStart(2, '0');
        const ano = matchBR[3].length === 2 ? `20${matchBR[3]}` : matchBR[3];
        return `${ano}-${mes}-${dia}`;
    }

    const data = new Date(texto);
    return Number.isNaN(data.getTime()) ? '' : formatDateLocal(data);
}

function getSemanaAnoAtual(date = new Date()) {
    const base = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const diaSemana = base.getUTCDay() || 7;
    base.setUTCDate(base.getUTCDate() + 4 - diaSemana);

    const ano = base.getUTCFullYear();
    const inicioAno = new Date(Date.UTC(ano, 0, 1));
    const semana = Math.ceil((((base - inicioAno) / 86400000) + 1) / 7);
    return `${ano}-W${String(semana).padStart(2, '0')}`;
}

function getSemanaAnoDaData(dataIso) {
    if (!dataIso) return getSemanaAnoSelecionada();
    const [ano, mes, dia] = dataIso.split('-').map(Number);
    return getSemanaAnoAtual(new Date(ano, mes - 1, dia));
}

function getSemanaAnoSelecionada() {
    return document.getElementById('filtroSemanaAno')?.value || getSemanaAnoAtual();
}

function getSemanaNomeEscala(semanaAno = getSemanaAnoSelecionada()) {
    const [anoTexto, semanaTexto] = String(semanaAno || '').split('-W');
    const semana = Number(semanaTexto);
    const ano = Number(anoTexto);
    if (!semana || !ano) return '';
    return `SEMANA ${String(semana).padStart(2, '0')} - ${ano}`;
}

function getFilialSelecionada() {
    const filialUsuario = getUserFilial();
    if (filialUsuario) return filialUsuario;
    return normalizarTexto(document.getElementById('filtroFilial')?.value);
}

function getFilialRegistro(row = {}) {
    const filialUsuario = getUserFilial();
    if (filialUsuario) return filialUsuario;
    return normalizarTexto(row.filial || getFilialSelecionada());
}

async function carregarFiliaisFiltro() {
    const select = document.getElementById('filtroFilial');
    if (!select) return;

    const filialUsuario = getUserFilial();
    if (filialUsuario) {
        select.innerHTML = '';
        select.add(new Option(filialUsuario, filialUsuario));
        select.value = filialUsuario;
        select.disabled = true;
        return;
    }

    try {
        const [filiaisResult, rotasResult] = await Promise.all([
            supabaseClient
                .from('filiais')
                .select('nome, sigla')
                .order('nome', { ascending: true }),
            supabaseClient
                .from('rotas')
                .select('filial')
                .not('filial', 'is', null)
        ]);

        if (filiaisResult.error) throw filiaisResult.error;
        if (rotasResult.error) throw rotasResult.error;

        const opcoes = new Map();
        (filiaisResult.data || []).forEach(filial => {
            const value = normalizarTexto(filial.sigla || filial.nome);
            if (!value) return;
            opcoes.set(value, filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome);
        });

        (rotasResult.data || []).forEach(rota => {
            const value = normalizarTexto(rota.filial);
            if (value && !opcoes.has(value)) opcoes.set(value, value);
        });

        const valorAtual = select.value;
        select.innerHTML = '<option value="">Todas</option>';
        [...opcoes.entries()]
            .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }))
            .forEach(([value, label]) => select.add(new Option(label, value)));

        if (valorAtual && opcoes.has(valorAtual)) select.value = valorAtual;
    } catch (error) {
        console.warn('Erro ao carregar filiais para o filtro:', error);
    }
}

function getPeriodoSemanaAno(semanaAno) {
    const [anoTexto, semanaTexto] = String(semanaAno || getSemanaAnoAtual()).split('-W');
    const ano = Number(anoTexto);
    const semana = Number(semanaTexto);
    const quatroJaneiro = new Date(Date.UTC(ano, 0, 4));
    const diaSemana = quatroJaneiro.getUTCDay() || 7;
    const inicio = new Date(quatroJaneiro);
    inicio.setUTCDate(quatroJaneiro.getUTCDate() - diaSemana + 1 + ((semana - 1) * 7));

    const fim = new Date(inicio);
    fim.setUTCDate(inicio.getUTCDate() + 6);

    return {
        inicio: formatDateUTC(inicio),
        fim: formatDateUTC(fim)
    };
}

function getDataDaSemana(semanaAno, semanaNome) {
    const periodo = getPeriodoSemanaAno(semanaAno);
    const offset = SEMANA_DIA_OFFSET[normalizarSemana(semanaNome)] ?? 0;
    const data = parseDateUTC(periodo.inicio);
    data.setUTCDate(data.getUTCDate() + offset);
    return formatDateUTC(data);
}

function getDiaSemanaPorData(dataIso) {
    if (!dataIso) return '';

    const dias = {
        1: 'SEGUNDA',
        2: 'TERÇA',
        3: 'QUARTA',
        4: 'QUINTA',
        5: 'SEXTA',
        6: 'SABADO',
        7: 'DOMINGO'
    };
    const data = parseDateUTC(dataIso);
    const diaSemana = data.getUTCDay() || 7;
    return dias[diaSemana] || '';
}

function parseDateUTC(dataIso) {
    const [ano, mes, dia] = String(dataIso).split('-').map(Number);
    return new Date(Date.UTC(ano, mes - 1, dia));
}

function formatDateUTC(date) {
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
}

function normalizarTexto(value) {
    return String(value || '').trim();
}

function normalizarUpper(value) {
    return normalizarTexto(value).toUpperCase();
}

function normalizarSemana(value) {
    const semana = normalizarUpper(value)
        .replace('TERCA', 'TERÇA')
        .replace('TERÃ‡A', 'TERÇA')
        .replace('SÃBADO', 'SABADO');

    return semana.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'SABADO'
        ? 'SABADO'
        : semana;
}

function normalizarBusca(value) {
    return normalizarUpper(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace('TERÃ‡A', 'TERCA')
        .replace('SÃBADO', 'SABADO');
}

function normalizarRota(value) {
    const textoOriginal = normalizarTexto(value);
    const textoNumerico = textoOriginal.replace(',', '.');

    if (/^\d+(\.0+)?$/.test(textoNumerico)) {
        return String(parseInt(textoNumerico, 10));
    }

    const textoBusca = normalizarBusca(textoOriginal);
    return textoBusca.replace(/[^A-Z0-9]/g, '');
}

function normalizarPlaca(value) {
    return normalizarUpper(value).replace(/[^A-Z0-9]/g, '');
}

function getVariantesPlaca(value) {
    const placa = normalizarPlaca(value);
    if (!placa) return [];

    const variantes = [placa];
    if (placa.length > 3) variantes.push(`${placa.slice(0, 3)}-${placa.slice(3)}`);

    return [...new Set(variantes)];
}

function cacheVeiculo(veiculo) {
    if (!veiculo?.placa) return;
    veiculosPorPlaca.set(normalizarPlaca(veiculo.placa), veiculo);
}

function limparPlacaImportada(value) {
    const texto = String(value || '').trim();
    const primeiraParte = texto.split('- VM')[0]
        .split(' - ')[0]
        .split(' ')[0];

    return primeiraParte
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase();
}

function parseNumero(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const texto = String(value).trim().replace(/\s/g, '');
    if (!texto) return null;

    const normalizado = texto.replace(/[^\d,.-]/g, '');
    const ultimoPonto = normalizado.lastIndexOf('.');
    const ultimaVirgula = normalizado.lastIndexOf(',');
    let numeroTexto = normalizado;

    if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
        const separadorDecimal = ultimoPonto > ultimaVirgula ? '.' : ',';
        const separadorMilhar = separadorDecimal === '.' ? ',' : '.';
        numeroTexto = normalizado
            .replace(new RegExp(`\\${separadorMilhar}`, 'g'), '')
            .replace(separadorDecimal, '.');
    } else if (ultimaVirgula >= 0) {
        numeroTexto = normalizado.replace(/\./g, '').replace(',', '.');
    } else if (ultimoPonto >= 0) {
        const casasDepoisDoPonto = normalizado.length - ultimoPonto - 1;
        numeroTexto = casasDepoisDoPonto === 3
            ? normalizado.replace(/\./g, '')
            : normalizado;
    }

    const numero = Number(numeroTexto);
    return Number.isFinite(numero) ? numero : null;
}

function formatarDecimalBR(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseInteiro(value) {
    const numero = parseNumero(value);
    return numero === null ? null : Math.trunc(numero);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function getChaveLinha(row) {
    const data = row.dia_retorno || getDataDaSemana(row.semana_ano || getSemanaAnoSelecionada(), row.semana);
    return `${data}|${String(row.rota || '').trim()}|${getFilialRegistro(row)}`;
}

function somarDiasIso(dataIso, dias) {
    if (!dataIso) return '';

    const [ano, mes, dia] = String(dataIso).split('-').map(Number);
    if (!ano || !mes || !dia) return '';

    const data = new Date(Date.UTC(ano, mes - 1, dia));
    data.setUTCDate(data.getUTCDate() + Number(dias || 0));
    return data.toISOString().slice(0, 10);
}

function calcularDataRetornoPrevista(semanaAno, semana, diasRota) {
    const dataSaida = getDataDaSemana(semanaAno, semana);
    if (!dataSaida) return '';

    const dias = Math.max(parseInteiro(diasRota) || 1, 1);
    return somarDiasIso(dataSaida, dias - 1);
}

function getDataRetornoPorDia(semanaAno, diaSaida, diaRetorno) {
    const dataSaida = getDataDaSemana(semanaAno, diaSaida);
    const offsetSaida = SEMANA_DIA_OFFSET[normalizarSemana(diaSaida)];
    const offsetRetorno = SEMANA_DIA_OFFSET[normalizarSemana(diaRetorno)];
    if (!dataSaida || offsetSaida === undefined || offsetRetorno === undefined) return '';

    const diasAteRetorno = (offsetRetorno - offsetSaida + 7) % 7;
    return somarDiasIso(dataSaida, diasAteRetorno);
}

function getSemanaAnoOperacional(item) {
    const semanaSalva = normalizarTexto(item?.semana_ano);
    const diaRetorno = normalizarTexto(item?.dia_retorno);
    const offsetSaida = SEMANA_DIA_OFFSET[normalizarSemana(item?.semana)];
    const offsetRetorno = SEMANA_DIA_OFFSET[getDiaSemanaPorData(diaRetorno)];

    if (!diaRetorno || offsetSaida === undefined || offsetRetorno === undefined) {
        return semanaSalva || getSemanaAnoDaData(diaRetorno);
    }

    const semanaRetorno = getSemanaAnoDaData(diaRetorno);
    if (semanaSalva && semanaSalva !== semanaRetorno) return semanaSalva;

    // Registros antigos gravavam a semana do retorno. Quando o retorno
    // cruza o domingo, a semana operacional pertence à saída anterior.
    if (offsetSaida > offsetRetorno) {
        return getSemanaAnoDaData(somarDiasIso(diaRetorno, -7));
    }

    return semanaSalva || semanaRetorno;
}

function temRetornoImportado(row) {
    return Boolean(
        row?.id
        || row?._retorno_manual
        || normalizarTexto(row?.horario_chegada)
    );
}

function aplicarRetornoPrevisto(row) {
    if (!row) return;

    const diaRetorno = calcularDataRetornoPrevista(row.semana_ano || getSemanaAnoSelecionada(), row.semana, row.dias_rota);
    row.dia_retorno = diaRetorno || getDataDaSemana(row.semana_ano || getSemanaAnoSelecionada(), row.semana);
    row.dia_semana_retorno = getDiaSemanaPorData(row.dia_retorno) || normalizarSemana(row.semana);
}

async function carregarDados() {
    const tbody = document.getElementById('tbodyPesoRota');
    if (tbody) tbody.innerHTML = `<tr><td colspan="17" class="loading-cell">Carregando...</td></tr>`;

    try {
        veiculosPorPlaca.clear();
        const semanaAno = getSemanaAnoSelecionada();
        const filial = getFilialSelecionada();
        const periodo = getPeriodoSemanaAno(semanaAno);
        let rotasQuery = supabaseClient
            .from('rotas')
            .select('numero, semana, supervisor, dias, filial')
            .order('numero', { ascending: true });

        if (filial) {
            rotasQuery = rotasQuery.eq('filial', filial);
        }

        let pesosQuery = supabaseClient
                .from('peso_rota')
                .select('*')
                .gte('dia_retorno', periodo.inicio)
                .lte('dia_retorno', somarDiasIso(periodo.fim, 6))
                .order('rota', { ascending: true });

        if (filial) {
            pesosQuery = pesosQuery.eq('filial', filial);
        }

        const [rotasResult, pesosResult] = await Promise.all([
            rotasQuery,
            pesosQuery
        ]);

        if (rotasResult.error) throw rotasResult.error;
        if (pesosResult.error) throw pesosResult.error;

        rotasBase = rotasResult.data || [];
        const pesosDaSemana = (pesosResult.data || []).filter(item =>
            getSemanaAnoOperacional(item) === semanaAno
        );
        gridData = mesclarRotasComPesos(rotasBase, pesosDaSemana, semanaAno, !filial);

        await preencherVeiculosDasLinhas();
        renderGrid();
    } catch (error) {
        console.error('Erro ao carregar peso de rota:', error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="17" class="loading-cell error-cell">Erro ao carregar dados. Verifique se a tabela peso_rota foi criada/atualizada.</td></tr>`;
        }
    }
}

function mesclarRotasComPesos(rotas, pesos, semanaAno, incluirPesosSemCadastro = true) {
    const pesosPorRota = criarMapaPesosPorRota(pesos);
    const rotasPorNumero = new Map((rotas || []).map(rota => [
        getChavePesoRota(rota.numero, rota.filial, rota.semana),
        rota
    ]));
    const linhas = [];
    const rotasIncluidas = new Set();

    (rotas || []).forEach(rota => {
        const numeroRota = String(rota.numero || '').trim();
        const chaveRota = getChavePesoRota(numeroRota, rota.filial, rota.semana);
        if (!chaveRota || rotasIncluidas.has(chaveRota)) return;

        const semana = normalizarSemana(rota.semana);
        const diaRetornoPrevisto = calcularDataRetornoPrevista(semanaAno, semana, rota.dias);
        const salvo = escolherPesoSalvo(pesosPorRota.get(chaveRota), diaRetornoPrevisto);
        const manterRetornoSalvo = Boolean(salvo?.dia_retorno);
        const diaRetorno = manterRetornoSalvo ? salvo.dia_retorno : diaRetornoPrevisto;

        linhas.push(criarLinha({
            ...salvo,
            rota: numeroRota,
            filial: rota.filial || salvo?.filial || getFilialSelecionada(),
            semana,
            dias_rota: rota.dias,
            supervisor: salvo?.supervisor || rota.supervisor || '',
            dia_retorno: diaRetorno,
            dia_semana_retorno: manterRetornoSalvo ? (salvo?.dia_semana_retorno || getDiaSemanaPorData(diaRetorno)) : getDiaSemanaPorData(diaRetorno),
            semana_ano: semanaAno
        }));
        rotasIncluidas.add(chaveRota);
    });

    if (incluirPesosSemCadastro) {
        (pesos || []).forEach(item => {
            const chaveRota = getChavePesoRota(item.rota, item.filial, item.semana);
            if (chaveRota && !rotasIncluidas.has(chaveRota)) {
                const rotaBase = rotasPorNumero.get(chaveRota);
                linhas.push(criarLinha({
                    ...item,
                    semana_ano: semanaAno,
                    dias_rota: item.dias_rota ?? rotaBase?.dias
                }));
                rotasIncluidas.add(chaveRota);
            }
        });
    }

    return linhas;
}

function criarMapaPesosPorRota(pesos) {
    const mapa = new Map();

    (pesos || []).forEach(item => {
        const chaveRota = getChavePesoRota(item.rota, item.filial, item.semana);
        if (!chaveRota) return;

        const registros = mapa.get(chaveRota) || [];
        registros.push(item);
        mapa.set(chaveRota, registros);
    });

    return mapa;
}

function escolherPesoSalvo(registros, diaRetornoPrevisto) {
    if (!Array.isArray(registros) || registros.length === 0) return null;

    return registros.reduce((melhor, candidato) => {
        if (!melhor) return candidato;

        const distanciaMelhor = getDistanciaDias(melhor.dia_retorno, diaRetornoPrevisto);
        const distanciaCandidato = getDistanciaDias(candidato.dia_retorno, diaRetornoPrevisto);

        if (distanciaCandidato < distanciaMelhor) return candidato;
        if (distanciaCandidato > distanciaMelhor) return melhor;
        return deveSubstituirPesoSalvo(melhor, candidato) ? candidato : melhor;
    }, null);
}

function getDistanciaDias(dataA, dataB) {
    const timestampA = Date.parse(dataA || '');
    const timestampB = Date.parse(dataB || '');
    if (!Number.isFinite(timestampA) || !Number.isFinite(timestampB)) return Number.POSITIVE_INFINITY;
    return Math.abs(Math.round((timestampA - timestampB) / 86400000));
}

function getChaveRotaFilial(rota, filial) {
    const chaveRota = normalizarRota(rota);
    if (!chaveRota) return '';
    return `${chaveRota}|${normalizarTexto(filial || getFilialSelecionada())}`;
}

function getChavePesoRota(rota, filial, semana) {
    const chaveRotaFilial = getChaveRotaFilial(rota, filial);
    if (!chaveRotaFilial) return '';
    return `${chaveRotaFilial}|${normalizarSemana(semana)}`;
}

function deveSubstituirPesoSalvo(atual, candidato) {
    const dataAtual = Date.parse(atual?.updated_at || atual?.created_at || '');
    const dataCandidato = Date.parse(candidato?.updated_at || candidato?.created_at || '');

    if (Number.isFinite(dataAtual) || Number.isFinite(dataCandidato)) {
        return (Number.isFinite(dataCandidato) ? dataCandidato : 0) >= (Number.isFinite(dataAtual) ? dataAtual : 0);
    }

    const scoreAtual = contarCamposPreenchidos(atual);
    const scoreCandidato = contarCamposPreenchidos(candidato);
    return scoreCandidato >= scoreAtual;
}

function contarCamposPreenchidos(item) {
    return Object.values(item || {}).filter(value => value !== null && value !== undefined && String(value).trim() !== '').length;
}

function criarLinha(data = {}) {
    const semanaAno = data.semana_ano || getSemanaAnoSelecionada();
    const semana = normalizarSemana(data.semana);
    const diasRota = parseInteiro(data.dias_rota ?? data.dias);
    const diaRetorno = data.dia_retorno || calcularDataRetornoPrevista(semanaAno, semana, diasRota);
    const row = {
        id: data.id || null,
        filial: getUserFilial() || normalizarTexto(data.filial || getFilialSelecionada()),
        rota: normalizarTexto(data.rota),
        semana,
        semana_ano: semanaAno,
        dia_semana_retorno: normalizarSemana(data.dia_semana_retorno || getDiaSemanaPorData(diaRetorno) || semana),
        dias_rota: diasRota,
        supervisor: normalizarUpper(data.supervisor),
        motorista: normalizarUpper(data.motorista),
        auxiliar: normalizarUpper(data.auxiliar),
        placa: normalizarPlaca(data.placa),
        tipo_veiculo: normalizarUpper(data.tipo_veiculo),
        pbt: parseNumero(data.pbt),
        peso_carga: parseNumero(data.peso_carga),
        qtd_caixas: parseInteiro(data.qtd_caixas),
        qtd_clientes: parseInteiro(data.qtd_clientes),
        status_percentual: parseNumero(data.status_percentual),
        dia_retorno: diaRetorno,
        horario_chegada: normalizarTexto(data.horario_chegada).slice(0, 5),
        descricao: normalizarTexto(data.descricao),
        ultima_alteracao_por: data.ultima_alteracao_por || null,
        ultima_alteracao_em: data.ultima_alteracao_em || null,
        _original_dia_retorno: data.dia_retorno || null,
        _retorno_manual: false
    };

    row.status_percentual = calcularPercentual(row);
    return row;
}

async function preencherVeiculosDasLinhas() {
    const placas = [...new Set(gridData.map(row => row.placa).filter(Boolean))];
    if (placas.length === 0) return;

    const placasNaoCarregadas = placas.filter(placa => !veiculosPorPlaca.has(placa));
    const placasConsulta = [...new Set(placasNaoCarregadas.flatMap(getVariantesPlaca))];
    if (placasConsulta.length > 0) {
        let queryVeiculos = supabaseClient
            .from('veiculos')
            .select('id, placa, modelo, tipo, capacidade_carga')
            .in('placa', placasConsulta);

        const filial = getFilialSelecionada();
        if (filial) queryVeiculos = queryVeiculos.eq('filial', filial);

        const { data, error } = await queryVeiculos;

        if (error) {
            console.warn('Erro ao buscar veiculos:', error);
        } else {
            (data || []).forEach(cacheVeiculo);
        }
    }

    gridData.forEach(preencherVeiculoNaLinha);
}

async function preencherDadosVeiculoDasLinhasPorPlaca(linhas) {
    const placas = [...new Set((linhas || []).map(row => row.placa).filter(Boolean))];
    if (placas.length === 0) return { modelosPreenchidos: 0, capacidadesPreenchidas: 0 };

    const placasNaoCarregadas = placas.filter(placa => !veiculosPorPlaca.has(placa));
    const placasConsulta = [...new Set(placasNaoCarregadas.flatMap(getVariantesPlaca))];
    if (placasConsulta.length > 0) {
        let queryVeiculos = supabaseClient
            .from('veiculos')
            .select('id, placa, modelo, tipo, capacidade_carga')
            .in('placa', placasConsulta);

        const filial = getFilialSelecionada();
        if (filial) queryVeiculos = queryVeiculos.eq('filial', filial);

        const { data, error } = await queryVeiculos;

        if (error) {
            console.warn('Erro ao buscar dados dos veiculos:', error);
        } else {
            (data || []).forEach(cacheVeiculo);
        }
    }

    let modelosPreenchidos = 0;
    let capacidadesPreenchidas = 0;
    (linhas || []).forEach(row => {
        if (!row.placa) return;
        const veiculo = veiculosPorPlaca.get(row.placa);
        if (!veiculo) return;

        const modelo = normalizarUpper(veiculo.modelo || veiculo.tipo);
        const capacidadeCarga = getCapacidadeCargaVeiculo(veiculo);

        if (modelo && row.tipo_veiculo !== modelo) {
            row.tipo_veiculo = modelo;
            row._dirty = true;
            modelosPreenchidos += 1;
        }

        if (capacidadeCarga !== null && row.pbt !== capacidadeCarga) {
            row.pbt = capacidadeCarga;
            row.status_percentual = calcularPercentual(row);
            row._dirty = true;
            capacidadesPreenchidas += 1;
        }
    });

    return { modelosPreenchidos, capacidadesPreenchidas };
}

function preencherVeiculoNaLinha(row, substituirValores = false) {
    if (!row.placa) return;
    const veiculo = veiculosPorPlaca.get(row.placa);
    if (!veiculo) return;

    const modelo = normalizarUpper(veiculo.modelo || veiculo.tipo);
    const capacidadeCarga = getCapacidadeCargaVeiculo(veiculo);

    row.tipo_veiculo = substituirValores ? modelo : (row.tipo_veiculo || modelo);
    if (capacidadeCarga !== null) {
        row.pbt = substituirValores ? capacidadeCarga : (row.pbt || capacidadeCarga);
    }
    row.status_percentual = calcularPercentual(row);
    row._dirty = true;
}

function renderGrid() {
    const tbody = document.getElementById('tbodyPesoRota');
    if (!tbody) return;

    const linhas = getLinhasVisiveis();
    if (linhas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="17" class="loading-cell">Nenhuma rota encontrada.</td></tr>`;
        atualizarContadores();
        return;
    }

    tbody.innerHTML = linhas.map(({ row, index }) => renderLinha(row, index)).join('');
    aplicarLargurasSalvas();
    atualizarContadores();
    atualizarContadorSelecionados();
}

function aplicarLargurasSalvas() {
    document.querySelectorAll('#gridPesoRota thead th').forEach((_, index) => {
        const savedWidth = localStorage.getItem(getColumnWidthKey(index));
        if (savedWidth) aplicarLarguraColuna(index, Number(savedWidth));
    });
}

function getLinhasVisiveis() {
    const filtroSemana = normalizarSemana(document.getElementById('filtroSemana')?.value);
    const filtroDiaRetorno = normalizarSemana(document.getElementById('filtroDiaRetorno')?.value);
    const busca = normalizarUpper(document.getElementById('searchInput')?.value);

    const linhas = gridData
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => {
            const semanaOk = !filtroSemana || normalizarSemana(row.semana) === filtroSemana;
            const retornoOk = !filtroDiaRetorno
                || normalizarSemana(row.dia_semana_retorno || getDiaSemanaPorData(row.dia_retorno)) === filtroDiaRetorno;
            const buscaOk = !busca || CAMPOS_GRID.some(campo => normalizarUpper(row[campo]).includes(busca));
            return semanaOk && retornoOk && buscaOk;
        });

    return ordenarLinhas(linhas);
}

function ordenarLinhas(linhas) {
    if (!sortConfig.key) return linhas;

    return [...linhas].sort((a, b) => {
        const valorA = a.row[sortConfig.key];
        const valorB = b.row[sortConfig.key];

        if (typeof valorA === 'number' || typeof valorB === 'number') {
            return (Number(valorA || 0) - Number(valorB || 0)) * (sortConfig.asc ? 1 : -1);
        }

        return String(valorA || '').localeCompare(String(valorB || ''), 'pt-BR', { numeric: true }) * (sortConfig.asc ? 1 : -1);
    });
}

function formatarAuditoria(por, em) {
    if (!por && !em) return '<span class="audit-vazio">Não salvo</span>';
    const data = em ? new Date(em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    return `<span class="audit-usuario">${escapeHtml(por || '')}</span>${data ? `<span class="audit-data">${data}</span>` : ''}`;
}

function renderLinha(row, index) {
    const status = getStatus(row);
    const retornoStatus = getStatusPrazoRetorno(row);
    const horarioChegadaAlerta = isHorarioChegadaAlerta(row.horario_chegada);
    const classeDiaRetorno = getClasseDiaRetorno(row.dia_semana_retorno);
    return `
        <tr data-row-index="${index}" class="${retornoStatus ? `retorno-${retornoStatus}` : ''}">
            <td class="select-col"><input type="checkbox" class="row-select" data-row-index="${index}"></td>
            <td class="col-rota">${inputText(index, 'rota', row.rota)}</td>
            <td class="col-semana">${selectSemana(index, row.semana)}</td>
            <td class="col-supervisor">${inputText(index, 'supervisor', row.supervisor)}</td>
            <td class="col-motorista">${inputText(index, 'motorista', row.motorista)}</td>
            <td class="col-auxiliar">${inputText(index, 'auxiliar', row.auxiliar)}</td>
            <td class="col-placa">${inputText(index, 'placa', row.placa, 'input-uppercase')}</td>
            <td class="col-tipo">${inputText(index, 'tipo_veiculo', row.tipo_veiculo, '', true)}</td>
            <td class="col-pbt">${inputDecimal(index, 'pbt', row.pbt)}</td>
            <td class="col-peso">${inputDecimal(index, 'peso_carga', row.peso_carga)}</td>
            <td class="col-qtd">${inputNumber(index, 'qtd_caixas', row.qtd_caixas, false, '1')}</td>
            <td class="col-qtd">${inputNumber(index, 'qtd_clientes', row.qtd_clientes, false, '1')}</td>
            <td class="col-status"><span class="peso-status ${status.classe}" data-status-row="${index}">${status.texto}</span></td>
            <td class="col-data dia-retorno-cell ${classeDiaRetorno} ${retornoStatus ? `retorno-${retornoStatus}-cell` : ''}">${selectDiaRetorno(index, row.dia_semana_retorno)}</td>
            <td class="col-hora ${horarioChegadaAlerta ? 'horario-chegada-alerta' : ''}">${inputTime(index, 'horario_chegada', row.horario_chegada)}</td>
            <td class="col-descricao">${textarea(index, 'descricao', row.descricao)}</td>
            <td class="col-auditoria">${formatarAuditoria(row.ultima_alteracao_por, row.ultima_alteracao_em)}</td>
        </tr>
    `;
}

function getStatusPrazoRetorno(row) {
    const semana = normalizarSemana(row.semana);
    const diaRetorno = normalizarSemana(row.dia_semana_retorno);
    const diasRota = parseInteiro(row.dias_rota) || 1;
    if (!semana || !diaRetorno) return '';

    const dataSaida = getDataDaSemana(row.semana_ano || getSemanaAnoSelecionada(), semana);
    if (dataSaida && row.dia_retorno) {
        const diferencaDias = Math.round((Date.parse(row.dia_retorno) - Date.parse(dataSaida)) / 86400000);
        if (Number.isFinite(diferencaDias)) {
            if (diferencaDias < 0) return 'antecipado';
            if (diferencaDias > Math.max(diasRota, 1) - 1) return 'atrasado';
            return '';
        }
    }

    const inicio = ORDEM_DIAS_ROTA.indexOf(semana);
    const retorno = ORDEM_DIAS_ROTA.indexOf(diaRetorno);
    if (inicio === -1 || retorno === -1) return '';

    const limite = inicio + Math.max(diasRota, 1) - 1;
    if (retorno < inicio) return 'antecipado';
    if (retorno > limite) return 'atrasado';
    return '';
}

function getClasseDiaRetorno(value) {
    const dia = normalizarSemana(value);
    const mapa = {
        SEGUNDA: 'dia-retorno-segunda',
        'TERÇA': 'dia-retorno-terca',
        QUARTA: 'dia-retorno-quarta',
        QUINTA: 'dia-retorno-quinta',
        SEXTA: 'dia-retorno-sexta',
        SABADO: 'dia-retorno-sabado',
        DOMINGO: 'dia-retorno-domingo',
        EXTRA: 'dia-retorno-extra',
        AVULSA: 'dia-retorno-avulsa'
    };
    return mapa[dia] || '';
}

function inputText(index, field, value, extraClass = '', readonly = false) {
    return `<input type="text" data-row-index="${index}" data-field="${field}" class="${extraClass}" value="${escapeHtml(value)}" ${readonly ? 'readonly' : ''}>`;
}

function inputNumber(index, field, value, readonly = false, step = '0.01') {
    return `<input type="number" data-row-index="${index}" data-field="${field}" value="${value ?? ''}" step="${step}" min="0" ${readonly ? 'readonly' : ''}>`;
}

function inputDecimal(index, field, value, readonly = false) {
    const displayValue = formatarDecimalBR(value);
    const readonlyAttr = readonly ? 'readonly style="background:#f0f0f0; cursor:not-allowed;"' : '';
    return `<input type="text" inputmode="decimal" data-row-index="${index}" data-field="${field}" value="${displayValue}" ${readonlyAttr}>`;
}

function inputDate(index, field, value) {
    return `<input type="date" data-row-index="${index}" data-field="${field}" value="${escapeHtml(value || '')}">`;
}

function inputTime(index, field, value) {
    return `<input type="time" data-row-index="${index}" data-field="${field}" value="${escapeHtml(value || '')}">`;
}

function isHorarioChegadaAlerta(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return false;

    const hora = Number(match[1]);
    const minuto = Number(match[2]);
    if (!Number.isFinite(hora) || !Number.isFinite(minuto)) return false;

    return hora > 20 || (hora === 20 && minuto >= 0);
}

function textarea(index, field, value) {
    return `<textarea data-row-index="${index}" data-field="${field}" rows="1">${escapeHtml(value)}</textarea>`;
}

function selectSemana(index, value) {
    const atual = normalizarSemana(value);
    const options = [''].concat(SEMANAS).map(semana => {
        const label = semana || '-';
        return `<option value="${escapeHtml(semana)}" ${atual === semana ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    return `<select data-row-index="${index}" data-field="semana">${options}</select>`;
}

function selectDiaRetorno(index, value) {
    const atual = normalizarSemana(value);
    const options = [''].concat(DIAS_RETORNO).map(semana => {
        const label = semana || '-';
        return `<option value="${escapeHtml(semana)}" ${atual === semana ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    return `<select data-row-index="${index}" data-field="dia_semana_retorno">${options}</select>`;
}

function getStatus(row) {
    const percentual = calcularPercentual(row);
    if (percentual === null) {
        return { texto: '-', classe: 'status-sem-dados', percentual: null };
    }

    if (percentual > 100) {
        return { texto: `${formatPercent(percentual)}%`, classe: 'status-excesso', percentual };
    }

    if (percentual >= 90) {
        return { texto: `${formatPercent(percentual)}%`, classe: 'status-alerta', percentual };
    }

    return { texto: `${formatPercent(percentual)}%`, classe: 'status-ok', percentual };
}

function calcularPercentual(row) {
    const pbt = parseNumero(row.pbt);
    const peso = parseNumero(row.peso_carga);
    if (!pbt || !peso) return null;
    return Number(((peso / pbt) * 100).toFixed(2));
}

function formatPercent(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

const CAMPOS_DECIMAL_GRID = ['pbt', 'peso_carga'];

function _isDecimalField(field) { return CAMPOS_DECIMAL_GRID.includes(field); }

function _formatDecimalInput(el, raw) {
    el.dataset.rawDigits = raw;
    el.value = raw ? (parseInt(raw, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

function handleGridFocusDecimal(e) {
    const target = e.target;
    if (!_isDecimalField(target?.dataset?.field)) return;
    target.dataset.rawDigits = target.value.replace(/\D/g, '');
}

// ── Navegação por setas (estilo planilha) ──────────────────────────────────────
function handleGridArrowNavigation(e) {
    const target = e.target;
    if (!target?.dataset?.field) return;

    const key = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const tag  = target.tagName;
    const type = target.type || '';
    const isSelect   = tag === 'SELECT';
    const isDate     = tag === 'INPUT' && type === 'date';
    const isTime     = tag === 'INPUT' && type === 'time';
    const isTextLike = (tag === 'INPUT' && (type === 'text' || type === '')) ||
                       (tag === 'INPUT' && target.inputMode === 'decimal') ||
                       tag === 'TEXTAREA';

    // Enter → confirma e desce uma linha
    if (key === 'Enter') {
        e.preventDefault();
        _gridNavRow(target, 1);
        return;
    }

    // ↑ ↓ → navegam entre linhas (mantém coluna)
    // Para select/date/time, deixa o comportamento nativo alterar o valor
    if (key === 'ArrowUp' || key === 'ArrowDown') {
        if (isSelect || isDate || isTime) return;
        e.preventDefault();
        _gridNavRow(target, key === 'ArrowDown' ? 1 : -1);
        return;
    }

    // ← → → navegam entre células da mesma linha
    // Para inputs de texto: só navega quando o cursor está no limite do conteúdo
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
        if (isTextLike) {
            const pos = target.selectionStart ?? 0;
            const len = target.value.length;
            if (key === 'ArrowLeft'  && pos > 0)  return;
            if (key === 'ArrowRight' && pos < len) return;
        }
        e.preventDefault();
        _gridNavCell(target, key === 'ArrowRight' ? 1 : -1);
    }
}

function _gridNavRow(el, direction) {
    const field   = el.dataset.field;
    const allRows = Array.from(document.querySelectorAll('#tbodyPesoRota tr[data-row-index]'));
    const curTr   = el.closest('tr');
    const curIdx  = allRows.indexOf(curTr);
    const nextTr  = allRows[curIdx + direction];
    if (!nextTr) return;
    const next = nextTr.querySelector(`[data-field="${field}"]:not([readonly])`);
    if (next) _gridFocusCell(next);
}

function _gridNavCell(el, direction) {
    const tr = el.closest('tr');
    if (!tr) return;
    const cells = Array.from(tr.querySelectorAll('[data-field]'))
        .filter(c => c.tagName !== 'SPAN' && !c.readOnly);
    const idx = cells.indexOf(el);
    if (idx === -1) return;
    const next = cells[idx + direction];
    if (next) _gridFocusCell(next);
}

function _gridFocusCell(el) {
    el.focus();
    if (el.tagName === 'INPUT' && el.type !== 'date' && el.type !== 'time') {
        el.select();
    }
}
// ──────────────────────────────────────────────────────────────────────────────

function handleGridKeydownDecimal(e) {
    const target = e.target;
    if (!_isDecimalField(target?.dataset?.field)) return;
    if (e.ctrlKey || e.metaKey || e.key === 'Tab' || e.key === 'Enter' || e.key === 'Escape' || e.key.startsWith('Arrow')) return;

    const isDigit  = e.key >= '0' && e.key <= '9';
    const isBack   = e.key === 'Backspace';
    const isDel    = e.key === 'Delete';
    if (!isDigit && !isBack && !isDel) return;

    e.preventDefault();
    let raw = target.dataset.rawDigits || '';
    if (isDigit) raw += e.key;
    else if (isBack)  raw = raw.slice(0, -1);
    else if (isDel)   raw = '';

    _formatDecimalInput(target, raw);
    target.dispatchEvent(new Event('input', { bubbles: true }));
}

function handleGridPasteDecimal(e) {
    const target = e.target;
    if (!_isDecimalField(target?.dataset?.field)) return;
    const clipboard = e.clipboardData || window.clipboardData;
    const clipboardText = clipboard?.getData('text/plain') || clipboard?.getData('text') || '';
    if (!clipboardText || /[\t\r\n]/.test(clipboardText)) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // evita que handlePaste genérico também processe
    const valor = parseNumero(clipboardText);
    target.value = Number.isFinite(valor)
        ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '';
    target.dataset.rawDigits = target.value.replace(/\D/g, '');
    target.dispatchEvent(new Event('input', { bubbles: true }));
}

function handleGridInput(event) {
    const field = event.target?.dataset?.field;
    if (!field) return;

    const rowIndex = Number(event.target.dataset.rowIndex);
    const row = gridData[rowIndex];
    if (!row) return;

    let value = event.target.value;
    if (['supervisor', 'motorista', 'auxiliar', 'placa', 'tipo_veiculo', 'semana', 'dia_semana_retorno'].includes(field)) {
        value = field === 'placa' ? normalizarPlaca(value) : (['semana', 'dia_semana_retorno'].includes(field) ? normalizarSemana(value) : normalizarUpper(value));
        event.target.value = value;
    }

    if (_isDecimalField(field)) {
        row[field] = parseNumero(event.target.value);
        row.status_percentual = calcularPercentual(row);
        atualizarStatusLinha(rowIndex);
    } else if (['qtd_caixas', 'qtd_clientes'].includes(field)) {
        row[field] = parseInteiro(value);
    } else {
        row[field] = value;
    }
    row._dirty = true;

    if (field === 'semana') {
        aplicarRetornoPrevisto(row);
        const tr = document.querySelector(`#tbodyPesoRota tr[data-row-index="${rowIndex}"]`);
        const diaSelect = tr?.querySelector('[data-field="dia_semana_retorno"]');
        if (diaSelect) diaSelect.value = row.dia_semana_retorno;
        atualizarCorDiaRetorno(rowIndex);
        atualizarStatusPrazoRetorno(rowIndex);
    }

    if (field === 'dia_semana_retorno') {
        row.dia_retorno = getDataRetornoPorDia(
            row.semana_ano || getSemanaAnoSelecionada(),
            row.semana,
            value
        ) || row.dia_retorno;
        row._retorno_manual = true;
        atualizarCorDiaRetorno(rowIndex);
        atualizarStatusPrazoRetorno(rowIndex);
    }

    if (field === 'horario_chegada') {
        atualizarAlertaHorarioChegada(rowIndex);
    }
}

async function handleGridChange(event) {
    const field = event.target?.dataset?.field;
    if (!field) return;

    const rowIndex = Number(event.target.dataset.rowIndex);
    const row = gridData[rowIndex];
    if (!row) return;

    row._dirty = true;

    if (field === 'placa') {
        await buscarEPreencherVeiculo(row, rowIndex);
    }

    if (field === 'pbt') {
        await salvarCapacidadeCargaVeiculo(row, rowIndex);
    }
}

function handleGridClick(event) {
    if (!event.target.classList.contains('row-select')) return;

    const rowIndex = Number(event.target.dataset.rowIndex);
    if (event.shiftKey && lastSelectedRowIndex !== null) {
        const inicio = Math.min(lastSelectedRowIndex, rowIndex);
        const fim = Math.max(lastSelectedRowIndex, rowIndex);
        document.querySelectorAll('#tbodyPesoRota .row-select').forEach(checkbox => {
            const current = Number(checkbox.dataset.rowIndex);
            if (current >= inicio && current <= fim) checkbox.checked = event.target.checked;
        });
    }

    lastSelectedRowIndex = rowIndex;
    atualizarContadorSelecionados();
}

async function buscarEPreencherVeiculo(row, rowIndex) {
    if (!row.placa) return;

    if (!veiculosPorPlaca.has(row.placa)) {
        let queryVeiculo = supabaseClient
            .from('veiculos')
            .select('id, placa, modelo, tipo, capacidade_carga')
            .in('placa', getVariantesPlaca(row.placa));

        const filial = getFilialSelecionada();
        if (filial) queryVeiculo = queryVeiculo.eq('filial', filial);

        const { data, error } = await queryVeiculo
            .limit(1)
            .maybeSingle();

        if (error) {
            console.warn('Erro ao buscar veiculo:', error);
            return;
        }

        if (data) cacheVeiculo(data);
    }

    preencherVeiculoNaLinha(row, true);
    atualizarCamposVeiculo(rowIndex);
    atualizarStatusLinha(rowIndex);
}

function atualizarCamposVeiculo(rowIndex) {
    const row = gridData[rowIndex];
    const tr = document.querySelector(`#tbodyPesoRota tr[data-row-index="${rowIndex}"]`);
    if (!row || !tr) return;

    const tipoInput = tr.querySelector('[data-field="tipo_veiculo"]');
    const pbtInput = tr.querySelector('[data-field="pbt"]');
    if (tipoInput) tipoInput.value = row.tipo_veiculo || '';
    if (pbtInput) pbtInput.value = row.pbt ?? '';
}

function atualizarStatusLinha(rowIndex) {
    const row = gridData[rowIndex];
    if (!row) return;

    const status = getStatus(row);
    row.status_percentual = status.percentual;

    const statusEl = document.querySelector(`[data-status-row="${rowIndex}"]`);
    if (statusEl) {
        statusEl.className = `peso-status ${status.classe}`;
        statusEl.textContent = status.texto;
    }
    atualizarContadores();
}

function atualizarAlertaHorarioChegada(rowIndex) {
    const row = gridData[rowIndex];
    const tr = document.querySelector(`#tbodyPesoRota tr[data-row-index="${rowIndex}"]`);
    const horaCell = tr?.querySelector('.col-hora');
    if (!row || !horaCell) return;

    horaCell.classList.toggle('horario-chegada-alerta', isHorarioChegadaAlerta(row.horario_chegada));
}

function atualizarContadores() {
    const contadores = { ok: 0, alerta: 0, excesso: 0, retornoAtrasado: 0, retornoAntecipado: 0 };
    const rotasPorStatus = { ok: [], alerta: [], excesso: [], retornoAtrasado: [], retornoAntecipado: [] };
    getLinhasVisiveis().forEach(({ row }) => {
        const status = getStatus(row);
        const rota = normalizarTexto(row.rota) || '-';
        const statusRetorno = getStatusPrazoRetorno(row);
        if (status.classe === 'status-ok') {
            contadores.ok += 1;
            rotasPorStatus.ok.push(rota);
        }
        if (status.classe === 'status-alerta') {
            contadores.alerta += 1;
            rotasPorStatus.alerta.push(rota);
        }
        if (status.classe === 'status-excesso') {
            contadores.excesso += 1;
            rotasPorStatus.excesso.push(rota);
        }
        if (statusRetorno === 'atrasado') {
            contadores.retornoAtrasado += 1;
            rotasPorStatus.retornoAtrasado.push(rota);
        }
        if (statusRetorno === 'antecipado') {
            contadores.retornoAntecipado += 1;
            rotasPorStatus.retornoAntecipado.push(rota);
        }
    });

    const countOk = document.getElementById('count-ok');
    const countAlerta = document.getElementById('count-alerta');
    const countExcesso = document.getElementById('count-excesso');
    const countRetornoAtrasado = document.getElementById('count-retorno-atrasado');
    const countRetornoAntecipado = document.getElementById('count-retorno-antecipado');
    if (countOk) countOk.textContent = contadores.ok;
    if (countAlerta) countAlerta.textContent = contadores.alerta;
    if (countExcesso) countExcesso.textContent = contadores.excesso;
    if (countRetornoAtrasado) countRetornoAtrasado.textContent = contadores.retornoAtrasado;
    if (countRetornoAntecipado) countRetornoAntecipado.textContent = contadores.retornoAntecipado;

    atualizarTooltipContador('count-ok', 'Rotas dentro da capacidade', rotasPorStatus.ok);
    atualizarTooltipContador('count-alerta', 'Rotas acima de 90%', rotasPorStatus.alerta);
    atualizarTooltipContador('count-excesso', 'Rotas em excesso', rotasPorStatus.excesso);
    atualizarTooltipContador('count-retorno-atrasado', 'Rotas com retorno atrasado', rotasPorStatus.retornoAtrasado);
    atualizarTooltipContador('count-retorno-antecipado', 'Rotas com retorno antecipado', rotasPorStatus.retornoAntecipado);
}

function atualizarContadorSelecionados() {
    const total = document.querySelectorAll('#tbodyPesoRota .row-select:checked').length;
    const badge = document.getElementById('countSelecionados');
    const countSpan = document.getElementById('count-selecionados');
    if (!badge || !countSpan) return;
    if (total > 0) {
        countSpan.textContent = total;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

function atualizarTooltipContador(counterId, titulo, rotas) {
    const badge = document.getElementById(counterId)?.closest('.badge');
    if (!badge) return;

    const rotasUnicas = [...new Set(rotas.filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b), 'pt-BR', { numeric: true })
    );
    const lista = rotasUnicas.length ? rotasUnicas.join(', ') : 'Nenhuma rota';
    badge.title = `${titulo}: ${lista}`;
    badge.setAttribute('aria-label', `${titulo}: ${lista}`);
}

function ordenarPor(key) {
    if (sortConfig.key === key) {
        sortConfig.asc = !sortConfig.asc;
    } else {
        sortConfig = { key, asc: true };
    }
    renderGrid();
}

function adicionarLinha() {
    const filtroSemana = normalizarSemana(document.getElementById('filtroSemana')?.value);
    const semana = filtroSemana || 'SEGUNDA';
    const searchInput = document.getElementById('searchInput');
    if (searchInput?.value) searchInput.value = '';

    const row = criarLinha({
        semana,
        semana_ano: getSemanaAnoSelecionada(),
        dia_retorno: calcularDataRetornoPrevista(getSemanaAnoSelecionada(), semana, 1)
    });
    row._dirty = true;

    gridData.push(row);
    renderGrid();

    const rowIndex = gridData.length - 1;
    document.querySelector(`#tbodyPesoRota tr[data-row-index="${rowIndex}"] [data-field="rota"]`)?.focus();
}

async function salvarTudo() {
    const btn = document.getElementById('btnSalvarTudo');
    const textoOriginal = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        await preencherVeiculosDasLinhas();

        const linhasParaSalvar = gridData
            .filter(row => row._dirty && normalizarTexto(row.rota))
            .filter(row => row.id || temDadosPreenchidos(row));

        const atualizacoesData = linhasParaSalvar.filter(row =>
            row.id
            && row._original_dia_retorno
            && row.dia_retorno !== row._original_dia_retorno
        );
        const idsAtualizados = new Set(atualizacoesData.map(row => row.id));
        let payload = deduplicarPayloadPorRota(
            linhasParaSalvar
                .filter(row => !idsAtualizados.has(row.id))
                .map(row => prepararPayload(row))
        );

        if (payload.length === 0 && atualizacoesData.length === 0) {
            alert('Nenhuma alteração para salvar.');
            return;
        }

        const payloadAtualizacoes = atualizacoesData.map(row => prepararPayload(row));
        const semFilial = [...payload, ...payloadAtualizacoes]
            .filter(item => !item.filial)
            .map(item => item.rota)
            .filter(Boolean);
        if (semFilial.length > 0) {
            alert(`Selecione uma filial antes de salvar estas rotas: ${semFilial.slice(0, 8).join(', ')}${semFilial.length > 8 ? '...' : ''}`);
            return;
        }

        marcarLinhas('saving');
        const dadosAtualizados = [];
        for (let index = 0; index < atualizacoesData.length; index += 1) {
            const row = atualizacoesData[index];
            const payloadAtualizacao = payloadAtualizacoes[index];
            const { data: conflito, error: erroConflito } = await supabaseClient
                .from('peso_rota')
                .select('id')
                .eq('dia_retorno', payloadAtualizacao.dia_retorno)
                .eq('rota', payloadAtualizacao.rota)
                .eq('filial', payloadAtualizacao.filial)
                .neq('id', row.id)
                .limit(1)
                .maybeSingle();

            if (erroConflito) throw erroConflito;

            const idDestino = conflito?.id || row.id;
            const { data: atualizado, error: erroAtualizacao } = await supabaseClient
                .from('peso_rota')
                .update(payloadAtualizacao)
                .eq('id', idDestino)
                .select()
                .single();

            if (erroAtualizacao) throw erroAtualizacao;

            if (conflito?.id) {
                const { error: erroExclusaoAntigo } = await supabaseClient
                    .from('peso_rota')
                    .delete()
                    .eq('id', row.id);
                if (erroExclusaoAntigo) throw erroExclusaoAntigo;
            }

            dadosAtualizados.push(atualizado);
        }

        let data = [];
        let error = null;
        if (payload.length > 0) {
            const resultadoUpsert = await supabaseClient
                .from('peso_rota')
                .upsert(payload, { onConflict: PESO_ROTA_ON_CONFLICT })
                .select();
            data = resultadoUpsert.data || [];
            error = resultadoUpsert.error;
        }

        if (error && isErroColunaOpcional(error)) {
            console.warn('Coluna opcional ausente no Supabase. Salvando sem campos opcionais.', error);
            payload = payload.map(({ semana_ano, dia_semana_retorno, ultima_alteracao_por, ultima_alteracao_em, ...item }) => item);
            const retry = await supabaseClient
                .from('peso_rota')
                .upsert(payload, { onConflict: PESO_ROTA_ON_CONFLICT })
                .select();

            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        data = [...dadosAtualizados, ...(data || [])];
        const totalEnviado = payload.length + payloadAtualizacoes.length;
        if (data.length !== totalEnviado) {
            throw new Error(`O banco confirmou ${data.length} de ${totalEnviado} linha(s) enviadas.`);
        }

        atualizarIdsSalvos(data || []);
        gridData.forEach(row => { row._dirty = false; });
        await carregarDados();
        registrarAuditoria('ALTERAR', 'Peso de Rota', `${data.length} linha(s) de peso de rota salvas`);
        alert(`${data.length} linha(s) de peso de rota salvas e conferidas no banco.`);
    } catch (error) {
        console.error('Erro ao salvar peso de rota:', error);
        marcarLinhas('saved-error');
        alert(`Erro ao salvar: ${error.message || 'verifique o console.'}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }
}

function temDadosPreenchidos(row) {
    return !!(
        normalizarTexto(row.motorista) ||
        normalizarTexto(row.auxiliar) ||
        normalizarPlaca(row.placa) ||
        parseNumero(row.peso_carga) ||
        parseNumero(row.pbt)
    );
}

function deduplicarPayloadPorRota(payload) {
    return Array.from((payload || []).reduce((mapa, item) => {
        const chaveRota = `${item.dia_retorno}|${getChaveRotaFilial(item.rota, item.filial)}`;
        if (chaveRota) mapa.set(chaveRota, item);
        return mapa;
    }, new Map()).values());
}

function isErroColunaOpcional(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('semana_ano') || message.includes('dia_semana_retorno') || message.includes('ultima_alteracao');
}

function getCapacidadeCargaVeiculo(veiculo) {
    return parseNumero(veiculo?.capacidade_carga);
}

async function buscarVeiculoPorPlaca(placa) {
    const placaNormalizada = normalizarPlaca(placa);
    if (!placaNormalizada) return null;

    const veiculoCache = veiculosPorPlaca.get(placaNormalizada);
    if (veiculoCache) return veiculoCache;

    let queryVeiculo = supabaseClient
        .from('veiculos')
        .select('id, placa, modelo, tipo, capacidade_carga')
        .in('placa', getVariantesPlaca(placaNormalizada));

    const filial = getFilialSelecionada();
    if (filial) queryVeiculo = queryVeiculo.eq('filial', filial);

    const { data, error } = await queryVeiculo
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (data) cacheVeiculo(data);
    return data || null;
}

async function salvarCapacidadeCargaVeiculo(row, rowIndex = null) {
    const novaCapacidade = parseNumero(row?.pbt);
    if (!row?.placa || novaCapacidade === null) return;

    const veiculo = await buscarVeiculoPorPlaca(row.placa);
    if (!veiculo) {
        console.warn(`Veiculo nao encontrado para atualizar capacidade de carga: ${row.placa}`);
        return;
    }

    const capacidadeAtual = getCapacidadeCargaVeiculo(veiculo);
    if (capacidadeAtual === novaCapacidade) return;

    const { data, error } = await supabaseClient
        .from('veiculos')
        .update({ capacidade_carga: novaCapacidade })
        .eq('id', veiculo.id)
        .select('id, placa, modelo, tipo, capacidade_carga')
        .single();

    if (error) throw error;

    cacheVeiculo(data || {
        ...veiculo,
        capacidade_carga: novaCapacidade
    });

    row.pbt = novaCapacidade;
    if (rowIndex !== null) atualizarCamposVeiculo(rowIndex);
}

async function sincronizarCapacidadeCargaVeiculos() {
    const linhasComPbt = gridData.filter(row => row.placa && parseNumero(row.pbt) !== null);
    const placasProcessadas = new Set();

    for (const row of linhasComPbt) {
        if (placasProcessadas.has(row.placa)) continue;
        placasProcessadas.add(row.placa);
        await salvarCapacidadeCargaVeiculo(row);
    }
}

function prepararPayload(row) {
    const status = getStatus(row);
    const payload = {
        rota: normalizarTexto(row.rota),
        filial: getFilialRegistro(row) || null,
        semana: normalizarSemana(row.semana) || null,
        semana_ano: row.semana_ano || getSemanaAnoSelecionada(),
        dia_semana_retorno: normalizarSemana(row.dia_semana_retorno || row.semana || getDiaSemanaPorData(row.dia_retorno)) || null,
        supervisor: normalizarUpper(row.supervisor) || null,
        motorista: normalizarUpper(row.motorista) || null,
        auxiliar: normalizarUpper(row.auxiliar) || null,
        placa: normalizarPlaca(row.placa) || null,
        tipo_veiculo: normalizarUpper(row.tipo_veiculo) || null,
        pbt: parseNumero(row.pbt),
        peso_carga: parseNumero(row.peso_carga),
        qtd_caixas: parseInteiro(row.qtd_caixas),
        qtd_clientes: parseInteiro(row.qtd_clientes),
        status_percentual: status.percentual,
        dia_retorno: row.dia_retorno || getDataDaSemana(getSemanaAnoSelecionada(), row.semana),
        horario_chegada: row.horario_chegada || null,
        descricao: normalizarTexto(row.descricao) || null,
        updated_at: new Date().toISOString(),
        ultima_alteracao_por: getUsuarioLogadoNome(),
        ultima_alteracao_em: new Date().toISOString()
    };

    return payload;
}

function atualizarIdsSalvos(data) {
    const idsPorChave = new Map((data || []).map(item => [`${item.dia_retorno}|${item.rota}|${getFilialRegistro(item)}`, item.id]));
    gridData.forEach(row => {
        const id = idsPorChave.get(`${row.dia_retorno}|${row.rota}|${getFilialRegistro(row)}`);
        if (id) row.id = id;
    });
}

function marcarLinhas(className) {
    document.querySelectorAll('#tbodyPesoRota tr').forEach(tr => {
        tr.classList.remove('saving', 'saved-success', 'saved-error');
        tr.classList.add(className);
    });
}

function limparMarcacoesLinhas() {
    document.querySelectorAll('#tbodyPesoRota tr').forEach(tr => {
        tr.classList.remove('saving', 'saved-success', 'saved-error');
    });
}

async function excluirSelecionados() {
    const indices = getSelectedRowIndexes();
    if (indices.length === 0) {
        alert('Selecione uma ou mais linhas para excluir.');
        return;
    }

    if (!confirm(`Excluir ${indices.length} linha(s) selecionada(s)?`)) return;

    const idsParaExcluir = indices.map(index => gridData[index]?.id).filter(Boolean);

    try {
        if (idsParaExcluir.length > 0) {
            let queryExclusao = supabaseClient
                .from('peso_rota')
                .delete()
                .in('id', idsParaExcluir);

            const filial = getFilialSelecionada();
            if (filial) queryExclusao = queryExclusao.eq('filial', filial);

            const { error } = await queryExclusao;

            if (error) throw error;
        }

        registrarAuditoria('EXCLUIR', 'Peso de Rota', `Exclusão de ${idsParaExcluir.length} linha(s) de peso de rota`);
        gridData = gridData.filter((_, index) => !indices.includes(index));
        renderGrid();
    } catch (error) {
        console.error('Erro ao excluir linhas:', error);
        alert(`Erro ao excluir: ${error.message || 'verifique o console.'}`);
    }
}

function getSelectedRowIndexes() {
    return Array.from(document.querySelectorAll('#tbodyPesoRota .row-select:checked'))
        .map(checkbox => Number(checkbox.dataset.rowIndex))
        .filter(index => Number.isInteger(index))
        .sort((a, b) => b - a);
}

function getContextoBackupPesoRota() {
    return {
        filial: getFilialSelecionada(),
        semanaAno: getSemanaAnoSelecionada(),
        diaSemana: normalizarSemana(document.getElementById('filtroSemana')?.value)
    };
}

function validarContextoEspecificoBackupPesoRota() {
    const contexto = getContextoBackupPesoRota();
    if (!contexto.filial) {
        alert('Selecione uma filial especifica antes de importar ou exportar o XLSX.');
        return null;
    }
    if (!contexto.semanaAno) {
        alert('Selecione a Semana Ano antes de importar ou exportar o XLSX.');
        return null;
    }
    if (!contexto.diaSemana) {
        alert('Selecione um Dia da Semana especifico antes de importar ou exportar o XLSX.');
        return null;
    }
    return contexto;
}

function getNomeArquivoBackupPesoRota(contexto) {
    const filial = normalizarBusca(contexto.filial).replace(/[^A-Z0-9]+/g, '_');
    const dia = normalizarBusca(contexto.diaSemana).replace(/[^A-Z0-9]+/g, '_');
    return `Peso_Rota_${filial}_${contexto.semanaAno}_${dia}.xlsx`;
}

function exportarBackupPesoRotaXlsx() {
    if (!window.XLSX) {
        alert('Biblioteca XLSX nao carregada. Recarregue a pagina e tente novamente.');
        return;
    }

    const contexto = validarContextoEspecificoBackupPesoRota();
    if (!contexto) return;

    const linhas = gridData.filter(row =>
        normalizarBusca(getFilialRegistro(row)) === normalizarBusca(contexto.filial)
        && normalizarSemana(row.semana) === contexto.diaSemana
        && (row.semana_ano || getSemanaAnoDaData(row.dia_retorno)) === contexto.semanaAno
    );

    if (linhas.length === 0) {
        alert('Nao ha linhas neste contexto para exportar.');
        return;
    }

    const dados = linhas.map(row => {
        const registro = {};
        PESO_ROTA_BACKUP_COLUNAS.forEach(([, campo]) => {
            if (campo === 'status') return;
            registro[campo] = row[campo] ?? '';
        });
        registro.filial = contexto.filial;
        registro.semana_ano = contexto.semanaAno;
        registro.semana = contexto.diaSemana;
        registro.status = getStatus(row).texto;
        return Object.fromEntries(PESO_ROTA_BACKUP_COLUNAS.map(([cabecalho, campo]) => [cabecalho, registro[campo] ?? '']));
    });

    const contextoRows = [
        ['CHAVE', 'VALOR'],
        ['TIPO_ARQUIVO', 'PESO_ROTA_BACKUP'],
        ['VERSAO', PESO_ROTA_BACKUP_VERSAO],
        ['FILIAL', contexto.filial],
        ['SEMANA_ANO', contexto.semanaAno],
        ['DIA_SEMANA', contexto.diaSemana],
        ['TOTAL_LINHAS', linhas.length],
        ['EXPORTADO_EM', new Date().toISOString()]
    ];

    const workbook = window.XLSX.utils.book_new();
    const sheetContexto = window.XLSX.utils.aoa_to_sheet(contextoRows);
    const sheetDados = window.XLSX.utils.json_to_sheet(dados, {
        header: PESO_ROTA_BACKUP_COLUNAS.map(([cabecalho]) => cabecalho)
    });

    sheetContexto['!cols'] = [{ wch: 20 }, { wch: 35 }];
    sheetDados['!cols'] = PESO_ROTA_BACKUP_COLUNAS.map(([cabecalho]) => ({
        wch: Math.max(12, Math.min(35, cabecalho.length + 4))
    }));

    window.XLSX.utils.book_append_sheet(workbook, sheetContexto, PESO_ROTA_BACKUP_ABA_CONTEXTO);
    window.XLSX.utils.book_append_sheet(workbook, sheetDados, PESO_ROTA_BACKUP_ABA_DADOS);
    window.XLSX.writeFile(workbook, getNomeArquivoBackupPesoRota(contexto));
}

function getDiaSemanaDaAba(nomeAba) {
    const nome = normalizarBusca(nomeAba);
    const dia = PLANILHAS_DIAS_SEMANA.find(item => nome.includes(normalizarBusca(item)));
    return dia ? normalizarSemana(dia) : '';
}

function encontrarLinhaCabecalhoRoteiro(linhas) {
    for (let i = 0; i < linhas.length; i++) {
        const linhaNormalizada = (linhas[i] || []).map(normalizarBusca);
        const temPlaca = linhaNormalizada.includes('PLACA');
        const temMotorista = linhaNormalizada.includes('MOTORISTA');
        const temAuxiliar = linhaNormalizada.includes('AUXILIAR');

        if (temPlaca && temMotorista && temAuxiliar) return i;
    }

    return -1;
}

function mapearColunasRoteiro(cabecalho) {
    const normalizado = (cabecalho || []).map(normalizarBusca);
    const encontrarIndice = (termos) => normalizado.findIndex(coluna => termos.some(termo => coluna === termo || coluna.includes(termo)));

    return {
        rota: encontrarIndice(['ROTA']),
        placa: encontrarIndice(['PLACA', 'VEICULO']),
        motorista: encontrarIndice(['MOTORISTA', 'MOT']),
        auxiliar: encontrarIndice(['AUXILIAR', 'AJUDANTE', 'AUX']),
        status: encontrarIndice(['STA', 'STAT', 'STATUS'])
    };
}

function isStatusRetornoRoteiro(status) {
    const normalized = normalizarBusca(status);
    return normalized === 'R' || normalized.includes('RETORNO');
}

async function importarRoteiroPeso(event) {
    const input = event.target;
    const arquivo = input.files?.[0];
    input.value = '';

    if (!arquivo) return;

    if (!window.XLSX) {
        alert('Biblioteca XLSX nao carregada. Recarregue a pagina e tente novamente.');
        return;
    }

    try {
        const buffer = await arquivo.arrayBuffer();
        const workbook = window.XLSX.read(buffer, {
            type: 'array',
            cellDates: true
        });

        const importados = [];
        const abasUsadas = [];
        let ignoradasPorStatusP = 0;
        const semanaSelecionada = normalizarSemana(document.getElementById('filtroSemana')?.value);

        for (const nomeAba of workbook.SheetNames) {
            const semana = getDiaSemanaDaAba(nomeAba);
            if (!semana) continue;
            if (semanaSelecionada && semana !== semanaSelecionada) continue;

            const sheet = workbook.Sheets[nomeAba];
            const dataPlanilha = excelDateToISO(sheet?.G4?.v);
            if (!dataPlanilha) continue;

            const linhas = window.XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                defval: ''
            });

            const linhaCabecalhoIndex = encontrarLinhaCabecalhoRoteiro(linhas);
            if (linhaCabecalhoIndex === -1) {
                throw new Error(`Nao encontrei as colunas PLACA, MOTORISTA e AUXILIAR na aba ${nomeAba}.`);
            }

            const colunas = mapearColunasRoteiro(linhas[linhaCabecalhoIndex]);
            if (colunas.rota === -1 || colunas.placa === -1 || colunas.motorista === -1 || colunas.auxiliar === -1) {
                throw new Error(`A aba ${nomeAba} nao possui todas as colunas obrigatorias.`);
            }

            const primeiraLinhaDados = Math.max(linhaCabecalhoIndex + 1, 4);
            for (let i = primeiraLinhaDados; i < linhas.length; i++) {
                const linha = linhas[i] || [];
                const statusImportacao = colunas.status >= 0 ? normalizarBusca(linha[colunas.status]) : '';
                if (statusImportacao === 'P') {
                    ignoradasPorStatusP += 1;
                    continue;
                }

                const rota = normalizarTexto(linha[colunas.rota] ?? linha[3]);
                const placa = limparPlacaImportada(linha[colunas.placa] ?? linha[2]);
                const motorista = normalizarUpper(linha[colunas.motorista] ?? linha[5]);
                const auxiliar = normalizarUpper(linha[colunas.auxiliar] ?? linha[6]);

                if (!rota && !placa && !motorista && !auxiliar) continue;
                if (!rota) continue;

                importados.push({
                    rota,
                    semana,
                    semana_ano: getSemanaAnoDaData(dataPlanilha),
                    dia_retorno: dataPlanilha,
                    status: statusImportacao,
                    placa,
                    motorista,
                    auxiliar
                });
            }

            abasUsadas.push(`${nomeAba} (${dataPlanilha})`);
        }

        if (importados.length === 0) {
            const detalhe = semanaSelecionada ? ` para ${semanaSelecionada}` : '';
            alert(`Nenhuma linha valida foi encontrada nas abas de roteiro${detalhe}.`);
            return;
        }

        const semanaAnoImportada = importados[0].semana_ano;
        const filtroSemanaAno = document.getElementById('filtroSemanaAno');
        if (filtroSemanaAno && filtroSemanaAno.value !== semanaAnoImportada) {
            filtroSemanaAno.value = semanaAnoImportada;
            await carregarDados();
        }

        const detalheIgnoradas = ignoradasPorStatusP > 0 ? `\nIgnoradas com STA/STAT = P: ${ignoradasPorStatusP}` : '';
        if (!confirm(`Importar ${importados.length} linha(s) do roteiro?\nAbas: ${abasUsadas.join(', ')}${detalheIgnoradas}`)) {
            return;
        }

        const resultado = aplicarImportacaoRoteiro(importados);
        await preencherVeiculosDasLinhas();
        renderGrid();

        alert(`Importacao concluida. ${resultado.aplicadas} linha(s) preenchida(s) na grade.${detalheIgnoradas}`);
    } catch (error) {
        console.error('Erro ao importar roteiro:', error);
        alert(`Erro ao importar roteiro: ${error.message || 'verifique o console.'}`);
    }
}

function aplicarImportacaoRoteiro(importados) {
    let rotasNaoEncontradas = 0;
    let aplicadas = 0;
    const semanaSelecionada = normalizarSemana(document.getElementById('filtroSemana')?.value);
    const rotasNaoEncontradasExemplo = [];
    const rotasComSaida = new Set();
    const retornoPorRota = new Map();

    importados.forEach(item => {
        const rotaImportada = normalizarRota(item.rota);
        if (!rotaImportada) return;

        if (isStatusRetornoRoteiro(item.status)) {
            const retornoAtual = retornoPorRota.get(rotaImportada);
            if (!retornoAtual || String(item.dia_retorno || '') > retornoAtual) {
                retornoPorRota.set(rotaImportada, item.dia_retorno);
            }
        } else {
            rotasComSaida.add(rotaImportada);
        }
    });

    importados.forEach(item => {
        const rotaImportada = normalizarRota(item.rota);
        const semanaImportada = normalizarSemana(item.semana);
        const retornoImportado = retornoPorRota.get(rotaImportada);

        if (isStatusRetornoRoteiro(item.status) && rotasComSaida.has(rotaImportada)) {
            return;
        }

        let row = gridData.find(linha =>
            normalizarRota(linha.rota) === rotaImportada &&
            (!semanaSelecionada || normalizarSemana(linha.semana) === semanaSelecionada) &&
            (semanaSelecionada || normalizarSemana(linha.semana) === semanaImportada)
        );

        if (!row && semanaSelecionada) {
            row = gridData.find(linha => normalizarRota(linha.rota) === rotaImportada);
        }

        if (!row) {
            rotasNaoEncontradas += 1;
            if (rotasNaoEncontradasExemplo.length < 8) {
                rotasNaoEncontradasExemplo.push(`${item.rota} -> ${rotaImportada || '-'}`);
            }
            return;
        }

        row.semana_ano = item.semana_ano;
        row.semana = semanaImportada || row.semana;
        if (!temRetornoImportado(row)) {
            if (retornoImportado) {
                row.dia_retorno = retornoImportado;
                row.dia_semana_retorno = getDiaSemanaPorData(retornoImportado) || row.dia_semana_retorno;
            } else {
                aplicarRetornoPrevisto(row);
            }
        }
        row.placa = item.placa || row.placa;
        row.motorista = item.motorista || row.motorista;
        row.auxiliar = item.auxiliar || row.auxiliar;
        row.status_percentual = calcularPercentual(row);
        aplicadas += 1;
    });

    if (rotasNaoEncontradas > 0) {
        const exemplos = rotasNaoEncontradasExemplo.length ? `\nExemplos: ${rotasNaoEncontradasExemplo.join(', ')}` : '';
        alert(`${rotasNaoEncontradas} rota(s) do roteiro nao foram encontradas na grade e foram ignoradas.${exemplos}`);
    }

    return { aplicadas, rotasNaoEncontradas };
}

async function importarEscalaOnlinePeso() {
    const btn = document.getElementById('btnImportarEscalaOnline');
    const textoOriginal = btn?.innerHTML;
    const filial = getFilialSelecionada();
    const semanaAno = getSemanaAnoSelecionada();
    const diaSaida = normalizarSemana(document.getElementById('filtroSemana')?.value);
    const semanaEscala = getSemanaNomeEscala(semanaAno);

    if (!filial) {
        alert('Selecione uma filial especifica antes de importar a escala online.');
        return;
    }

    if (!semanaAno || !semanaEscala) {
        alert('Selecione a Semana Ano antes de importar a escala online.');
        return;
    }

    if (!diaSaida) {
        alert('Selecione um Dia de Saida especifico antes de importar a escala online.');
        return;
    }

    const dataEscala = getDataDaSemana(semanaAno, diaSaida);
    if (!dataEscala) {
        alert('Nao foi possivel identificar a data da escala para os filtros selecionados.');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';
    }

    try {
        const { data, error } = await supabaseClient
            .from('escala')
            .select('data_escala, semana_nome, filial, rota, placa, motorista, auxiliar')
            .eq('filial', filial)
            .eq('data_escala', dataEscala)
            .order('rota', { ascending: true });

        if (error) throw error;

        const linhasEscala = (data || []).filter(item =>
            normalizarRota(item.rota)
        );
        if (linhasEscala.length === 0) {
            alert(`Nenhum registro encontrado na escala online para ${filial}, ${semanaEscala}, ${diaSaida} (${dataEscala}).`);
            return;
        }

        const escalaPorRota = new Map();
        linhasEscala.forEach(item => {
            const chave = normalizarRota(item.rota);
            const atual = escalaPorRota.get(chave);
            const scoreAtual = contarCamposPreenchidos(atual);
            const scoreNovo = contarCamposPreenchidos(item);
            if (!atual || scoreNovo >= scoreAtual) escalaPorRota.set(chave, item);
        });

        let aplicadas = 0;
        let semCorrespondencia = 0;
        const rotasNaoEncontradas = [];
        const linhasAplicadas = [];

        gridData.forEach(row => {
            if (normalizarBusca(getFilialRegistro(row)) !== normalizarBusca(filial)) return;
            if (normalizarSemana(row.semana) !== diaSaida) return;

            const chave = normalizarRota(row.rota);
            if (!chave) return;

            const item = escalaPorRota.get(chave);
            if (!item) {
                semCorrespondencia += 1;
                if (rotasNaoEncontradas.length < 8) rotasNaoEncontradas.push(row.rota);
                return;
            }

            const placa = normalizarPlaca(item.placa);
            const motorista = normalizarUpper(item.motorista);
            const auxiliar = normalizarUpper(item.auxiliar);
            const alterou = row.placa !== placa || row.motorista !== motorista || row.auxiliar !== auxiliar;

            row.placa = placa;
            row.motorista = motorista;
            row.auxiliar = auxiliar;
            if (alterou) row._dirty = true;
            aplicadas += 1;
            linhasAplicadas.push(row);
        });

        const { modelosPreenchidos, capacidadesPreenchidas } = await preencherDadosVeiculoDasLinhasPorPlaca(linhasAplicadas);
        renderGrid();

        const detalheNaoEncontradas = semCorrespondencia > 0
            ? `\nRotas da grade sem correspondencia na escala: ${semCorrespondencia}${rotasNaoEncontradas.length ? `\nExemplos: ${rotasNaoEncontradas.join(', ')}` : ''}`
            : '';
        alert(`Importacao da escala online concluida.\n${aplicadas} linha(s) preenchida(s) com placa, motorista e auxiliar.\n${modelosPreenchidos} modelo(s) preenchido(s) pela placa.\n${capacidadesPreenchidas} capacidade(s) de carga preenchida(s) pela placa.${detalheNaoEncontradas}`);
    } catch (error) {
        console.error('Erro ao importar escala online:', error);
        alert(`Erro ao importar escala online: ${error.message || 'verifique o console.'}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }
}

function normalizarHoraRetorno(item) {
    const hora = item?.hora_mot || item?.hora_aux || item?.hora_terceiro || '';
    const match = String(hora).match(/\d{1,2}:\d{2}/);
    return match ? match[0].padStart(5, '0') : '';
}

function getChaveRetorno(data, rota, motorista) {
    return `${data}|${normalizarRota(rota)}|${normalizarBusca(motorista)}`;
}

function getChaveRetornoRotaData(data, rota) {
    return `${data}|${normalizarRota(rota)}`;
}

function indexarRetornosRota(retornos) {
    const porRotaMotoristaData = new Map();
    const porRotaData = new Map();
    const porRota = new Map();

    (retornos || []).forEach(item => {
        const rota = normalizarRota(item.rota);
        const data = item.data_retorno;
        if (!rota || !data) return;

        if (!porRota.has(rota)) porRota.set(rota, []);
        porRota.get(rota).push(item);

        const chaveRotaData = getChaveRetornoRotaData(data, rota);
        if (!porRotaData.has(chaveRotaData)) porRotaData.set(chaveRotaData, []);
        porRotaData.get(chaveRotaData).push(item);

        const motorista = normalizarBusca(item.nome_mot);
        if (motorista) {
            porRotaMotoristaData.set(getChaveRetorno(data, rota, motorista), item);
        }
    });

    return { porRotaMotoristaData, porRotaData, porRota };
}

function escolherRetornoPorMotorista(candidatos, motorista) {
    if (!motorista) return null;

    return candidatos.find(item => {
        const motoristaRetorno = normalizarBusca(item.nome_mot);
        return motoristaRetorno && (motoristaRetorno.includes(motorista) || motorista.includes(motoristaRetorno));
    }) || null;
}

function escolherRetornoMaisProximo(candidatos, dataEsperada) {
    if (candidatos.length <= 1 || !dataEsperada) return candidatos[0] || null;

    const dataBase = Date.parse(`${dataEsperada}T00:00:00Z`);
    return [...candidatos].sort((a, b) => {
        const diffA = Math.abs(Date.parse(`${a.data_retorno}T00:00:00Z`) - dataBase);
        const diffB = Math.abs(Date.parse(`${b.data_retorno}T00:00:00Z`) - dataBase);
        return diffA - diffB;
    })[0] || null;
}

function escolherRetornoParaLinha(row, indicesRetorno, dataEsperada, permitirForaData = false) {
    const rota = normalizarRota(row.rota);
    const motorista = normalizarBusca(row.motorista);
    if (!rota || !dataEsperada) return null;

    const candidatos = indicesRetorno.porRotaData.get(getChaveRetornoRotaData(dataEsperada, rota)) || [];

    if (motorista) {
        const exato = indicesRetorno.porRotaMotoristaData.get(getChaveRetorno(dataEsperada, rota, motorista));
        if (exato) return exato;

        const parecido = escolherRetornoPorMotorista(candidatos, motorista);
        if (parecido) return parecido;
    }

    if (candidatos.length === 1) return candidatos[0];
    if (!permitirForaData) return null;

    const candidatosPorRota = indicesRetorno.porRota.get(rota) || [];
    const retornoPorMotorista = escolherRetornoPorMotorista(candidatosPorRota, motorista);
    if (retornoPorMotorista) return retornoPorMotorista;

    return escolherRetornoMaisProximo(candidatosPorRota, dataEsperada);
}

function atualizarCamposRetornoLinha(rowIndex, row) {
    const tr = document.querySelector(`#tbodyPesoRota tr[data-row-index="${rowIndex}"]`);
    if (!tr) return;

    const diaSelect = tr.querySelector('[data-field="dia_semana_retorno"]');
    const horaInput = tr.querySelector('[data-field="horario_chegada"]');

    if (diaSelect) diaSelect.value = row.dia_semana_retorno || '';
    if (horaInput) horaInput.value = row.horario_chegada || '';
    atualizarCorDiaRetorno(rowIndex);
    atualizarStatusPrazoRetorno(rowIndex);
    atualizarAlertaHorarioChegada(rowIndex);
}

function atualizarCorDiaRetorno(rowIndex) {
    const row = gridData[rowIndex];
    const td = document.querySelector(`#tbodyPesoRota tr[data-row-index="${rowIndex}"] .dia-retorno-cell`);
    if (!row || !td) return;

    td.classList.remove(...CLASSES_DIA_RETORNO);
    const classe = getClasseDiaRetorno(row.dia_semana_retorno);
    if (classe) td.classList.add(classe);
}

function atualizarStatusPrazoRetorno(rowIndex) {
    const row = gridData[rowIndex];
    const tr = document.querySelector(`#tbodyPesoRota tr[data-row-index="${rowIndex}"]`);
    if (!row || !tr) return;

    tr.classList.remove('retorno-atrasado', 'retorno-antecipado');
    tr.querySelectorAll('.retorno-atrasado-cell, .retorno-antecipado-cell').forEach(cell => {
        cell.classList.remove('retorno-atrasado-cell', 'retorno-antecipado-cell');
    });

    const retornoStatus = getStatusPrazoRetorno(row);
    if (!retornoStatus) {
        atualizarContadores();
        return;
    }

    tr.classList.add(`retorno-${retornoStatus}`);
    const diaRetornoCell = tr.querySelector('.dia-retorno-cell');
    if (diaRetornoCell) diaRetornoCell.classList.add(`retorno-${retornoStatus}-cell`);
    atualizarContadores();
}

async function importarRetornoRota() {
    const btn = document.getElementById('btnImportarRetornoRota');
    const textoOriginal = btn?.innerHTML;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';
    }

    try {
        const semanaAno = getSemanaAnoSelecionada();
        const diaSaidaSelecionado = normalizarSemana(document.getElementById('filtroSemana')?.value);
        const diaRetornoSelecionado = normalizarSemana(document.getElementById('filtroDiaRetorno')?.value);
        const periodo = getPeriodoSemanaAno(semanaAno);
        const dataSaidaSelecionada = diaSaidaSelecionado ? getDataDaSemana(semanaAno, diaSaidaSelecionado) : null;

        let query = supabaseClient
            .from('retorno_rota')
            .select('rota, data_retorno, nome_mot, hora_mot, hora_aux, hora_terceiro, filial')
            .order('data_retorno', { ascending: true });

        const filial = getFilialSelecionada();
        if (filial) {
            query = query.eq('filial', filial);
        }

        if (dataSaidaSelecionada) {
            query = query.gte('data_retorno', dataSaidaSelecionada).lte('data_retorno', somarDiasIso(dataSaidaSelecionada, 6));
        } else {
            query = query.gte('data_retorno', periodo.inicio).lte('data_retorno', somarDiasIso(periodo.fim, 6));
        }

        const { data, error } = await query;
        if (error) throw error;

        const indicesRetorno = indexarRetornosRota(data || []);

        if ((data || []).length === 0) {
            const periodoTexto = dataSaidaSelecionada
                ? `saídas de ${diaSaidaSelecionado} a partir de ${dataSaidaSelecionada}`
                : `semana operacional ${semanaAno}`;
            alert(`Nenhum retorno de rota encontrado para ${periodoTexto}.`);
            return;
        }

        let aplicadas = 0;
        let aplicadasComHorario = 0;
        let semRetorno = 0;
        let ignoradasPorSemana = 0;

        gridData.forEach((row, rowIndex) => {
            if (!normalizarRota(row.rota)) return;

            const diaSaidaLinha = normalizarSemana(row.semana);
            const diaRetornoLinha = normalizarSemana(row.dia_semana_retorno || getDiaSemanaPorData(row.dia_retorno));
            if (diaSaidaSelecionado && diaSaidaLinha !== diaSaidaSelecionado) {
                ignoradasPorSemana += 1;
                return;
            }
            if (diaRetornoSelecionado && diaRetornoLinha !== diaRetornoSelecionado) {
                ignoradasPorSemana += 1;
                return;
            }

            const dataEsperada = row.dia_retorno ||
                calcularDataRetornoPrevista(row.semana_ano || semanaAno, row.semana, row.dias_rota);
            const retorno = escolherRetornoParaLinha(
                row,
                indicesRetorno,
                dataEsperada,
                !diaSaidaSelecionado && !diaRetornoSelecionado
            );
            if (!retorno) {
                semRetorno += 1;
                return;
            }

            row.dia_retorno = retorno.data_retorno;
            row.dia_semana_retorno = getDiaSemanaPorData(retorno.data_retorno);
            row.horario_chegada = normalizarHoraRetorno(retorno);
            aplicadas += 1;
            if (row.horario_chegada) aplicadasComHorario += 1;
            atualizarCamposRetornoLinha(rowIndex, row);
        });

        renderGrid();
        alert(`Importacao de retorno concluida.\nRotas atualizadas: ${aplicadas}\nCom horario preenchido: ${aplicadasComHorario}\nSem retorno encontrado: ${semRetorno}\nIgnoradas pelos filtros de saída/retorno: ${ignoradasPorSemana}`);
    } catch (error) {
        console.error('Erro ao importar retorno de rota:', error);
        alert(`Erro ao importar retorno de rota: ${error.message || 'verifique o console.'}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }
}

async function handlePaste(event) {
    const target = event.target;
    const field = target?.dataset?.field;
    if (!field) return;

    const startRowIndex = Number(target.dataset.rowIndex);
    const startColumnIndex = CAMPOS_GRID.indexOf(field);
    if (startColumnIndex === -1) return;

    const matriz = getMatrizColagem(event.clipboardData);
    if (matriz.length === 0) return;
    if (matriz.length === 1 && matriz[0].length === 1) return;

    event.preventDefault();
    const { linhas, campos } = prepararColagemGrid(matriz, startColumnIndex);
    if (linhas.length === 0 || campos.length === 0) return;

    const indicesVisiveis = getLinhasVisiveis().map(({ index }) => index);
    const posicaoInicial = indicesVisiveis.indexOf(startRowIndex);
    const semanaDestino = normalizarSemana(document.getElementById('filtroSemana')?.value)
        || normalizarSemana(gridData[startRowIndex]?.semana)
        || 'SEGUNDA';

    linhas.forEach((valores, offsetLinha) => {
        let rowIndex = posicaoInicial >= 0
            ? indicesVisiveis[posicaoInicial + offsetLinha]
            : startRowIndex + offsetLinha;

        if (!Number.isInteger(rowIndex)) {
            gridData.push(criarLinha({
                semana: semanaDestino,
                semana_ano: getSemanaAnoSelecionada(),
                dia_retorno: getDataDaSemana(getSemanaAnoSelecionada(), semanaDestino)
            }));
            rowIndex = gridData.length - 1;
            indicesVisiveis.push(rowIndex);
        }

        valores.forEach((valor, offsetColuna) => {
            const campo = campos[offsetColuna];
            if (!campo) return;
            aplicarValorNaLinha(gridData[rowIndex], campo, valor);
        });
    });

    await preencherVeiculosDasLinhas();
    renderGrid();
}

function getMatrizColagem(clipboardData) {
    const texto = clipboardData?.getData('text/plain') || clipboardData?.getData('text') || '';
    const matrizTexto = parseClipboardTable(texto);
    const temBlocoTexto = matrizTexto.length > 1 || matrizTexto.some(linha => linha.length > 1);
    if (temBlocoTexto) return matrizTexto;

    const html = clipboardData?.getData('text/html');
    const matrizHtml = parseClipboardHtmlTable(html);
    if (matrizHtml.length > 0) return matrizHtml;

    return matrizTexto;
}

function parseClipboardHtmlTable(html) {
    if (!html || typeof DOMParser === 'undefined') return [];

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return [];

    return Array.from(table.querySelectorAll('tr'))
        .map(tr => Array.from(tr.querySelectorAll('th,td')).map(td => normalizarTexto(td.textContent)))
        .filter(valores => valores.some(valor => normalizarTexto(valor)));
}

function parseClipboardTable(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const linhas = normalized
        .split('\n')
        .filter((linha, index, array) => linha.length > 0 || index < array.length - 1)
        .filter(linha => linha.trim() !== '');

    if (linhas.length === 0) return [];

    const separador = detectarSeparadorColagem(linhas);
    return linhas
        .map(linha => parseLinhaColagem(linha, separador))
        .filter(valores => valores.some(valor => normalizarTexto(valor)));
}

function detectarSeparadorColagem(linhas) {
    const candidatos = ['\t', ';', ','];
    const pontuacoes = candidatos.map(separador => ({
        separador,
        colunas: linhas.reduce((total, linha) => total + parseLinhaColagem(linha, separador).length, 0)
    }));
    pontuacoes.sort((a, b) => b.colunas - a.colunas);
    return pontuacoes[0].colunas > linhas.length ? pontuacoes[0].separador : /\s{2,}/;
}

function parseLinhaColagem(linha, separador) {
    if (separador instanceof RegExp) {
        return String(linha).split(separador).map(valor => valor.trim());
    }

    if (separador === '\t') {
        return String(linha).split('\t').map(valor => valor.trim());
    }

    const valores = [];
    let atual = '';
    let emAspas = false;

    for (let i = 0; i < linha.length; i++) {
        const char = linha[i];
        const next = linha[i + 1];
        if (char === '"' && next === '"') {
            atual += '"';
            i++;
        } else if (char === '"') {
            emAspas = !emAspas;
        } else if (char === separador && !emAspas) {
            valores.push(atual.trim());
            atual = '';
        } else {
            atual += char;
        }
    }

    valores.push(atual.trim());
    return valores;
}

function prepararColagemGrid(matriz, startColumnIndex) {
    matriz = normalizarMatrizColagem(matriz);

    const camposCabecalho = detectarCamposCabecalho(matriz[0]);
    if (camposCabecalho.length > 0) {
        return {
            campos: camposCabecalho,
            linhas: matriz.slice(1)
        };
    }

    const camposBlocoNumerico = detectarCamposBlocoNumerico(matriz, startColumnIndex);
    if (camposBlocoNumerico.length > 0) {
        return {
            campos: camposBlocoNumerico,
            linhas: matriz.map(linha => linha.slice(0, camposBlocoNumerico.length))
        };
    }

    return {
        campos: CAMPOS_GRID.slice(startColumnIndex, startColumnIndex + Math.max(...matriz.map(linha => linha.length))),
        linhas: matriz
    };
}

function normalizarMatrizColagem(matriz) {
    let linhas = (matriz || [])
        .map(linha => Array.isArray(linha) ? linha : [])
        .filter(linha => linha.some(valor => normalizarTexto(valor)));

    if (linhas.length === 0) return [];

    while (linhas.every(linha => normalizarTexto(linha[0]) === '')) {
        linhas = linhas.map(linha => linha.slice(1));
    }

    while (linhas.every(linha => normalizarTexto(linha[linha.length - 1]) === '')) {
        linhas = linhas.map(linha => linha.slice(0, -1));
    }

    return linhas;
}

function detectarCamposCabecalho(linha) {
    const campos = (linha || []).map(valor => getCampoPorCabecalho(valor));
    const reconhecidos = campos.filter(Boolean).length;
    return reconhecidos >= 2 ? campos : [];
}

function getCampoPorCabecalho(value) {
    const header = normalizarBusca(value);
    if (!header) return '';

    return Object.entries(COLUNAS_COLAGEM).find(([, aliases]) =>
        aliases.some(alias => header === normalizarBusca(alias) || header.includes(normalizarBusca(alias)))
    )?.[0] || '';
}

function detectarCamposBlocoNumerico(matriz, startColumnIndex) {
    const startField = CAMPOS_GRID[startColumnIndex];
    const colunasPorLinha = matriz.map(linha => linha.filter(valor => normalizarTexto(valor) !== '').length);
    const minColunas = Math.min(...colunasPorLinha);
    if (!Number.isFinite(minColunas) || minColunas < 2) return [];

    const todasNumericas = matriz.every(linha =>
        linha.slice(0, minColunas).every(valor => isValorNumericoColagem(valor))
    );
    if (!todasNumericas) return [];

    if (startField === CAMPO_CAPACIDADE_GRID) {
        return [CAMPO_CAPACIDADE_GRID, 'peso_carga', 'qtd_caixas', 'qtd_clientes'].slice(0, minColunas);
    }

    if (startField === 'peso_carga' && minColunas >= 4) {
        return [CAMPO_CAPACIDADE_GRID, 'peso_carga', 'qtd_caixas', 'qtd_clientes'].slice(0, minColunas);
    }

    if (startField === 'peso_carga') {
        return ['peso_carga', 'qtd_caixas', 'qtd_clientes'].slice(0, minColunas);
    }

    if (startField === 'qtd_caixas') {
        return ['qtd_caixas', 'qtd_clientes'].slice(0, minColunas);
    }

    return [];
}

function isValorNumericoColagem(value) {
    const texto = normalizarTexto(value);
    if (!texto) return false;
    return /^-?\d{1,3}([.,]\d{3})*([.,]\d+)?$|^-?\d+([.,]\d+)?$/.test(texto);
}

function aplicarValorNaLinha(row, campo, valor) {
    if (['pbt', 'peso_carga'].includes(campo)) {
        row[campo] = parseNumero(valor);
    } else if (['qtd_caixas', 'qtd_clientes'].includes(campo)) {
        row[campo] = parseInteiro(valor);
    } else if (campo === 'placa') {
        row[campo] = normalizarPlaca(valor);
    } else if (campo === 'semana') {
        row[campo] = normalizarSemana(valor);
        if (!temRetornoImportado(row)) aplicarRetornoPrevisto(row);
    } else if (campo === 'dia_semana_retorno') {
        row[campo] = normalizarSemana(valor);
        row.dia_retorno = getDataRetornoPorDia(
            row.semana_ano || getSemanaAnoSelecionada(),
            row.semana,
            row[campo]
        ) || row.dia_retorno;
        row._retorno_manual = true;
    } else if (campo === 'dia_retorno') {
        row[campo] = normalizarTexto(valor);
        row.dia_semana_retorno = getDiaSemanaPorData(row[campo]);
    } else if (['supervisor', 'motorista', 'auxiliar', 'tipo_veiculo'].includes(campo)) {
        row[campo] = normalizarUpper(valor);
    } else {
        row[campo] = normalizarTexto(valor);
    }

    row.status_percentual = calcularPercentual(row);
}
