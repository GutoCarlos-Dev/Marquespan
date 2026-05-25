import { supabaseClient } from './supabase.js';

const TIMEZONE_SAO_PAULO = 'America/Sao_Paulo';
const SEMANAS = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'EXTRA', 'AVULSA'];
const SEMANA_DIA_OFFSET = {
    SEGUNDA: 0,
    TERÇA: 1,
    QUARTA: 2,
    QUINTA: 3,
    SEXTA: 4
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

let gridData = [];
let rotasBase = [];
let veiculosPorPlaca = new Map();
let sortConfig = { key: 'rota', asc: true };
let lastSelectedRowIndex = null;
let resizingColumn = null;

document.addEventListener('DOMContentLoaded', async () => {
    const filtroSemanaAno = document.getElementById('filtroSemanaAno');
    if (filtroSemanaAno && !filtroSemanaAno.value) filtroSemanaAno.value = getSemanaAnoAtual();

    bindEvents();
    setupResizableColumns();
    await carregarDados();
});

function bindEvents() {
    document.getElementById('btnToggleMenuLateralPesoRota')?.addEventListener('click', toggleMenuLateralPesoRota);
    document.getElementById('btnCarregarRotas')?.addEventListener('click', carregarDados);
    document.getElementById('btnAdicionarLinha')?.addEventListener('click', adicionarLinha);
    document.getElementById('btnImportarRoteiro')?.addEventListener('click', () => {
        document.getElementById('inputImportarRoteiro')?.click();
    });
    document.getElementById('btnImportarRetornoRota')?.addEventListener('click', importarRetornoRota);
    document.getElementById('inputImportarRoteiro')?.addEventListener('change', importarRoteiroPeso);
    document.getElementById('btnSalvarTudo')?.addEventListener('click', salvarTudo);
    document.getElementById('btnExcluirSelecionados')?.addEventListener('click', excluirSelecionados);
    document.getElementById('filtroSemana')?.addEventListener('change', renderGrid);
    document.getElementById('filtroSemanaAno')?.addEventListener('change', carregarDados);
    document.getElementById('searchInput')?.addEventListener('input', renderGrid);

    document.getElementById('selectAllRows')?.addEventListener('change', (event) => {
        document.querySelectorAll('#tbodyPesoRota .row-select').forEach(checkbox => {
            checkbox.checked = event.target.checked;
        });
    });

    document.querySelectorAll('#gridPesoRota thead th[data-sort]').forEach(th => {
        th.addEventListener('click', () => ordenarPor(th.dataset.sort));
    });

    document.addEventListener('mousemove', handleColumnResizeMove);
    document.addEventListener('mouseup', stopColumnResize);

    const tbody = document.getElementById('tbodyPesoRota');
    tbody?.addEventListener('input', handleGridInput);
    tbody?.addEventListener('change', handleGridChange);
    tbody?.addEventListener('click', handleGridClick);
    tbody?.addEventListener('paste', handlePaste);
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
    return normalizarUpper(value)
        .replace('TERCA', 'TERÇA')
        .replace('TERÃ‡A', 'TERÇA');
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
    const apenasDigitos = textoBusca.replace(/\D/g, '');
    if (apenasDigitos) return String(parseInt(apenasDigitos, 10));

    return textoBusca.replace(/[^A-Z0-9]/g, '');
}

function normalizarPlaca(value) {
    return normalizarUpper(value).replace(/[^A-Z0-9]/g, '');
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
    const numero = Number(String(value).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(numero) ? numero : null;
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
    return `${data}|${String(row.rota || '').trim()}`;
}

async function carregarDados() {
    const tbody = document.getElementById('tbodyPesoRota');
    if (tbody) tbody.innerHTML = `<tr><td colspan="16" class="loading-cell">Carregando...</td></tr>`;

    try {
        const semanaAno = getSemanaAnoSelecionada();
        const periodo = getPeriodoSemanaAno(semanaAno);
        const [rotasResult, pesosResult] = await Promise.all([
            supabaseClient
                .from('rotas')
                .select('numero, semana, supervisor')
                .order('numero', { ascending: true }),
            supabaseClient
                .from('peso_rota')
                .select('*')
                .gte('dia_retorno', periodo.inicio)
                .lte('dia_retorno', periodo.fim)
                .order('rota', { ascending: true })
        ]);

        if (rotasResult.error) throw rotasResult.error;
        if (pesosResult.error) throw pesosResult.error;

        rotasBase = rotasResult.data || [];
        gridData = mesclarRotasComPesos(rotasBase, pesosResult.data || [], semanaAno);

        await preencherVeiculosDasLinhas();
        renderGrid();
    } catch (error) {
        console.error('Erro ao carregar peso de rota:', error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="16" class="loading-cell error-cell">Erro ao carregar dados. Verifique se a tabela peso_rota foi criada/atualizada.</td></tr>`;
        }
    }
}

function mesclarRotasComPesos(rotas, pesos, semanaAno) {
    const pesosPorChave = new Map((pesos || []).map(item => [getChaveLinha(item), item]));
    const linhas = [];
    const chavesIncluidas = new Set();

    (rotas || []).forEach(rota => {
        const numeroRota = String(rota.numero || '').trim();
        const semana = normalizarSemana(rota.semana);
        const diaRetorno = getDataDaSemana(semanaAno, semana);
        const chave = `${diaRetorno}|${numeroRota}`;
        const salvo = pesosPorChave.get(chave);

        linhas.push(criarLinha({
            rota: numeroRota,
            semana,
            supervisor: rota.supervisor || '',
            dia_retorno: diaRetorno,
            semana_ano: semanaAno,
            ...salvo
        }));
        chavesIncluidas.add(chave);
    });

    (pesos || []).forEach(item => {
        const chave = getChaveLinha(item);
        if (!chavesIncluidas.has(chave)) {
            linhas.push(criarLinha({ ...item, semana_ano: item.semana_ano || semanaAno }));
        }
    });

    return linhas;
}

function criarLinha(data = {}) {
    const semanaAno = data.semana_ano || getSemanaAnoSelecionada();
    const semana = normalizarSemana(data.semana);
    const diaRetorno = data.dia_retorno || getDataDaSemana(semanaAno, semana);
    const row = {
        id: data.id || null,
        rota: normalizarTexto(data.rota),
        semana,
        semana_ano: semanaAno,
        dia_semana_retorno: normalizarSemana(data.dia_semana_retorno || semana || getDiaSemanaPorData(diaRetorno)),
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
        descricao: normalizarTexto(data.descricao)
    };

    row.status_percentual = calcularPercentual(row);
    return row;
}

async function preencherVeiculosDasLinhas() {
    const placas = [...new Set(gridData.map(row => row.placa).filter(Boolean))];
    if (placas.length === 0) return;

    const placasNaoCarregadas = placas.filter(placa => !veiculosPorPlaca.has(placa));
    if (placasNaoCarregadas.length > 0) {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('placa, tipo, pbt')
            .in('placa', placasNaoCarregadas);

        if (error) {
            console.warn('Erro ao buscar veiculos:', error);
        } else {
            (data || []).forEach(veiculo => {
                veiculosPorPlaca.set(normalizarPlaca(veiculo.placa), veiculo);
            });
        }
    }

    gridData.forEach(preencherVeiculoNaLinha);
}

function preencherVeiculoNaLinha(row) {
    if (!row.placa) return;
    const veiculo = veiculosPorPlaca.get(row.placa);
    if (!veiculo) return;

    row.tipo_veiculo = row.tipo_veiculo || normalizarUpper(veiculo.tipo);
    row.pbt = row.pbt || parseNumero(veiculo.pbt);
    row.status_percentual = calcularPercentual(row);
}

function renderGrid() {
    const tbody = document.getElementById('tbodyPesoRota');
    if (!tbody) return;

    const linhas = getLinhasVisiveis();
    if (linhas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="16" class="loading-cell">Nenhuma rota encontrada.</td></tr>`;
        atualizarContadores();
        return;
    }

    tbody.innerHTML = linhas.map(({ row, index }) => renderLinha(row, index)).join('');
    aplicarLargurasSalvas();
    atualizarContadores();
}

function aplicarLargurasSalvas() {
    document.querySelectorAll('#gridPesoRota thead th').forEach((_, index) => {
        const savedWidth = localStorage.getItem(getColumnWidthKey(index));
        if (savedWidth) aplicarLarguraColuna(index, Number(savedWidth));
    });
}

function getLinhasVisiveis() {
    const filtroSemana = normalizarSemana(document.getElementById('filtroSemana')?.value);
    const busca = normalizarUpper(document.getElementById('searchInput')?.value);

    const linhas = gridData
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => {
            const semanaOk = !filtroSemana || normalizarSemana(row.semana) === filtroSemana;
            const buscaOk = !busca || CAMPOS_GRID.some(campo => normalizarUpper(row[campo]).includes(busca));
            return semanaOk && buscaOk;
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

function renderLinha(row, index) {
    const status = getStatus(row);
    return `
        <tr data-row-index="${index}">
            <td class="select-col"><input type="checkbox" class="row-select" data-row-index="${index}"></td>
            <td class="col-rota">${inputText(index, 'rota', row.rota)}</td>
            <td class="col-semana">${selectSemana(index, row.semana)}</td>
            <td class="col-supervisor">${inputText(index, 'supervisor', row.supervisor)}</td>
            <td class="col-motorista">${inputText(index, 'motorista', row.motorista)}</td>
            <td class="col-auxiliar">${inputText(index, 'auxiliar', row.auxiliar)}</td>
            <td class="col-placa">${inputText(index, 'placa', row.placa, 'input-uppercase')}</td>
            <td class="col-tipo">${inputText(index, 'tipo_veiculo', row.tipo_veiculo, '', true)}</td>
            <td class="col-pbt">${inputNumber(index, 'pbt', row.pbt)}</td>
            <td class="col-peso">${inputNumber(index, 'peso_carga', row.peso_carga)}</td>
            <td class="col-qtd">${inputNumber(index, 'qtd_caixas', row.qtd_caixas, false, '1')}</td>
            <td class="col-qtd">${inputNumber(index, 'qtd_clientes', row.qtd_clientes, false, '1')}</td>
            <td class="col-status"><span class="peso-status ${status.classe}" data-status-row="${index}">${status.texto}</span></td>
            <td class="col-data">${selectDiaRetorno(index, row.dia_semana_retorno)}</td>
            <td class="col-hora">${inputTime(index, 'horario_chegada', row.horario_chegada)}</td>
            <td class="col-descricao">${textarea(index, 'descricao', row.descricao)}</td>
        </tr>
    `;
}

function inputText(index, field, value, extraClass = '', readonly = false) {
    return `<input type="text" data-row-index="${index}" data-field="${field}" class="${extraClass}" value="${escapeHtml(value)}" ${readonly ? 'readonly' : ''}>`;
}

function inputNumber(index, field, value, readonly = false, step = '0.01') {
    return `<input type="number" data-row-index="${index}" data-field="${field}" value="${value ?? ''}" step="${step}" min="0" ${readonly ? 'readonly' : ''}>`;
}

function inputDate(index, field, value) {
    return `<input type="date" data-row-index="${index}" data-field="${field}" value="${escapeHtml(value || '')}">`;
}

function inputTime(index, field, value) {
    return `<input type="time" data-row-index="${index}" data-field="${field}" value="${escapeHtml(value || '')}">`;
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
    const options = [''].concat(SEMANAS).map(semana => {
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

    if (['pbt', 'peso_carga'].includes(field)) {
        row[field] = parseNumero(value);
        row.status_percentual = calcularPercentual(row);
        atualizarStatusLinha(rowIndex);
    } else if (['qtd_caixas', 'qtd_clientes'].includes(field)) {
        row[field] = parseInteiro(value);
    } else {
        row[field] = value;
    }

    if (field === 'semana') {
        row.dia_retorno = getDataDaSemana(row.semana_ano || getSemanaAnoSelecionada(), value);
        row.dia_semana_retorno = value;
        const tr = document.querySelector(`#tbodyPesoRota tr[data-row-index="${rowIndex}"]`);
        const diaSelect = tr?.querySelector('[data-field="dia_semana_retorno"]');
        if (diaSelect) diaSelect.value = row.dia_semana_retorno;
    }

    if (field === 'dia_semana_retorno') {
        row.dia_retorno = getDataDaSemana(row.semana_ano || getSemanaAnoSelecionada(), value);
    }
}

async function handleGridChange(event) {
    const field = event.target?.dataset?.field;
    if (!field) return;

    const rowIndex = Number(event.target.dataset.rowIndex);
    const row = gridData[rowIndex];
    if (!row) return;

    if (field === 'placa') {
        await buscarEPreencherVeiculo(row, rowIndex);
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
}

async function buscarEPreencherVeiculo(row, rowIndex) {
    if (!row.placa) return;

    if (!veiculosPorPlaca.has(row.placa)) {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('placa, tipo, pbt')
            .eq('placa', row.placa)
            .maybeSingle();

        if (error) {
            console.warn('Erro ao buscar veiculo:', error);
            return;
        }

        if (data) veiculosPorPlaca.set(row.placa, data);
    }

    preencherVeiculoNaLinha(row);
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

function atualizarContadores() {
    const contadores = { ok: 0, alerta: 0, excesso: 0 };
    gridData.forEach(row => {
        const status = getStatus(row);
        if (status.classe === 'status-ok') contadores.ok += 1;
        if (status.classe === 'status-alerta') contadores.alerta += 1;
        if (status.classe === 'status-excesso') contadores.excesso += 1;
    });

    const countOk = document.getElementById('count-ok');
    const countAlerta = document.getElementById('count-alerta');
    const countExcesso = document.getElementById('count-excesso');
    if (countOk) countOk.textContent = contadores.ok;
    if (countAlerta) countAlerta.textContent = contadores.alerta;
    if (countExcesso) countExcesso.textContent = contadores.excesso;
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
    gridData.push(criarLinha({
        semana: 'SEGUNDA',
        semana_ano: getSemanaAnoSelecionada(),
        dia_retorno: getDataDaSemana(getSemanaAnoSelecionada(), 'SEGUNDA')
    }));
    renderGrid();
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
        await atualizarPbtVeiculosEmBranco();

        let payload = gridData
            .filter(row => normalizarTexto(row.rota))
            .map(row => prepararPayload(row));

        if (payload.length === 0) {
            alert('Nenhuma rota preenchida para salvar.');
            return;
        }

        marcarLinhas('saving');
        let { data, error } = await supabaseClient
            .from('peso_rota')
            .upsert(payload, { onConflict: 'dia_retorno,rota' })
            .select();

        if (error && isErroColunaOpcional(error)) {
            console.warn('Coluna opcional ausente no Supabase. Salvando sem campos opcionais.', error);
            payload = payload.map(({ semana_ano, dia_semana_retorno, ...item }) => item);
            const retry = await supabaseClient
                .from('peso_rota')
                .upsert(payload, { onConflict: 'dia_retorno,rota' })
                .select();

            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        atualizarIdsSalvos(data || []);
        marcarLinhas('saved-success');
        setTimeout(() => limparMarcacoesLinhas(), 1600);
        alert('Peso de rota salvo com sucesso.');
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

function isErroColunaOpcional(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('semana_ano') || message.includes('dia_semana_retorno');
}

async function atualizarPbtVeiculosEmBranco() {
    const linhasComPbt = gridData.filter(row => row.placa && parseNumero(row.pbt) !== null);
    const placasProcessadas = new Set();

    for (const row of linhasComPbt) {
        if (placasProcessadas.has(row.placa)) continue;
        placasProcessadas.add(row.placa);

        let veiculo = veiculosPorPlaca.get(row.placa);
        if (!veiculo) {
            const { data, error } = await supabaseClient
                .from('veiculos')
                .select('placa, tipo, pbt')
                .eq('placa', row.placa)
                .maybeSingle();

            if (error) throw error;
            if (!data) continue;

            veiculo = data;
            veiculosPorPlaca.set(row.placa, veiculo);
        }

        if (parseNumero(veiculo.pbt) !== null) continue;

        const novoPbt = parseNumero(row.pbt);
        const { error } = await supabaseClient
            .from('veiculos')
            .update({ pbt: novoPbt })
            .eq('placa', row.placa);

        if (error) throw error;

        veiculosPorPlaca.set(row.placa, {
            ...veiculo,
            pbt: novoPbt
        });
    }
}

function prepararPayload(row) {
    const status = getStatus(row);
    const payload = {
        rota: normalizarTexto(row.rota),
        semana: normalizarSemana(row.semana) || null,
        semana_ano: getSemanaAnoDaData(row.dia_retorno),
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
        updated_at: new Date().toISOString()
    };

    return payload;
}

function atualizarIdsSalvos(data) {
    const idsPorChave = new Map((data || []).map(item => [`${item.dia_retorno}|${item.rota}`, item.id]));
    gridData.forEach(row => {
        const id = idsPorChave.get(`${row.dia_retorno}|${row.rota}`);
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
            const { error } = await supabaseClient
                .from('peso_rota')
                .delete()
                .in('id', idsParaExcluir);

            if (error) throw error;
        }

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
        auxiliar: encontrarIndice(['AUXILIAR', 'AJUDANTE', 'AUX'])
    };
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

        if (!confirm(`Importar ${importados.length} linha(s) do roteiro?\nAbas: ${abasUsadas.join(', ')}`)) {
            return;
        }

        const resultado = aplicarImportacaoRoteiro(importados);
        await preencherVeiculosDasLinhas();
        renderGrid();

        alert(`Importacao concluida. ${resultado.aplicadas} linha(s) preenchida(s) na grade.`);
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

    importados.forEach(item => {
        const rotaImportada = normalizarRota(item.rota);
        const semanaImportada = normalizarSemana(item.semana);

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
        row.dia_semana_retorno = semanaImportada;
        row.dia_retorno = item.dia_retorno;
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

    (retornos || []).forEach(item => {
        const rota = normalizarRota(item.rota);
        const data = item.data_retorno;
        if (!rota || !data) return;

        const chaveRotaData = getChaveRetornoRotaData(data, rota);
        if (!porRotaData.has(chaveRotaData)) porRotaData.set(chaveRotaData, []);
        porRotaData.get(chaveRotaData).push(item);

        const motorista = normalizarBusca(item.nome_mot);
        if (motorista) {
            porRotaMotoristaData.set(getChaveRetorno(data, rota, motorista), item);
        }
    });

    return { porRotaMotoristaData, porRotaData };
}

function escolherRetornoParaLinha(row, indicesRetorno, dataEsperada) {
    const rota = normalizarRota(row.rota);
    const motorista = normalizarBusca(row.motorista);
    if (!rota || !dataEsperada) return null;

    if (motorista) {
        return indicesRetorno.porRotaMotoristaData.get(getChaveRetorno(dataEsperada, rota, motorista)) || null;
    }

    const candidatos = indicesRetorno.porRotaData.get(getChaveRetornoRotaData(dataEsperada, rota)) || [];
    return candidatos.length === 1 ? candidatos[0] : null;
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
        const semanaSelecionada = normalizarSemana(document.getElementById('filtroSemana')?.value);
        const periodo = getPeriodoSemanaAno(semanaAno);
        const dataSelecionada = semanaSelecionada ? getDataDaSemana(semanaAno, semanaSelecionada) : null;

        let query = supabaseClient
            .from('retorno_rota')
            .select('rota, data_retorno, nome_mot, hora_mot, hora_aux, hora_terceiro')
            .order('data_retorno', { ascending: true });

        if (dataSelecionada) {
            query = query.eq('data_retorno', dataSelecionada);
        } else {
            query = query.gte('data_retorno', periodo.inicio).lte('data_retorno', periodo.fim);
        }

        const { data, error } = await query;
        if (error) throw error;

        const indicesRetorno = indexarRetornosRota(data || []);

        if ((data || []).length === 0) {
            const periodoTexto = dataSelecionada ? `${semanaSelecionada} (${dataSelecionada})` : `semana ${semanaAno}`;
            alert(`Nenhum retorno de rota encontrado para ${periodoTexto}.`);
            return;
        }

        let aplicadas = 0;
        let semRetorno = 0;
        let ignoradasPorSemana = 0;

        gridData.forEach(row => {
            if (!normalizarRota(row.rota)) return;

            const semanaLinha = normalizarSemana(row.semana || row.dia_semana_retorno);
            if (semanaSelecionada && semanaLinha !== semanaSelecionada) {
                ignoradasPorSemana += 1;
                return;
            }

            const dataEsperada = dataSelecionada ||
                getDataDaSemana(row.semana_ano || semanaAno, row.dia_semana_retorno || row.semana);
            const retorno = escolherRetornoParaLinha(row, indicesRetorno, dataEsperada);
            if (!retorno) {
                semRetorno += 1;
                return;
            }

            row.dia_retorno = retorno.data_retorno;
            row.semana_ano = getSemanaAnoDaData(retorno.data_retorno);
            row.dia_semana_retorno = getDiaSemanaPorData(retorno.data_retorno);
            row.horario_chegada = normalizarHoraRetorno(retorno);
            aplicadas += 1;
        });

        renderGrid();
        alert(`Importacao de retorno concluida.\nRotas atualizadas: ${aplicadas}\nSem retorno encontrado: ${semRetorno}\nIgnoradas por outro dia da semana: ${ignoradasPorSemana}`);
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

    const text = event.clipboardData?.getData('text');
    if (!text || !text.includes('\t')) return;

    event.preventDefault();
    const linhas = text.replace(/\r/g, '').split('\n').filter(linha => linha.length > 0);

    linhas.forEach((linha, offsetLinha) => {
        const rowIndex = startRowIndex + offsetLinha;
        while (!gridData[rowIndex]) {
            gridData.push(criarLinha({
                semana: 'SEGUNDA',
                semana_ano: getSemanaAnoSelecionada(),
                dia_retorno: getDataDaSemana(getSemanaAnoSelecionada(), 'SEGUNDA')
            }));
        }

        const valores = linha.split('\t');
        valores.forEach((valor, offsetColuna) => {
            const campo = CAMPOS_GRID[startColumnIndex + offsetColuna];
            if (!campo) return;
            aplicarValorNaLinha(gridData[rowIndex], campo, valor);
        });
    });

    await preencherVeiculosDasLinhas();
    renderGrid();
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
        row.dia_retorno = getDataDaSemana(row.semana_ano || getSemanaAnoSelecionada(), row[campo]);
        row.dia_semana_retorno = row[campo];
    } else if (campo === 'dia_semana_retorno') {
        row[campo] = normalizarSemana(valor);
        row.dia_retorno = getDataDaSemana(row.semana_ano || getSemanaAnoSelecionada(), row[campo]);
    } else if (campo === 'dia_retorno') {
        row[campo] = normalizarTexto(valor);
        row.semana_ano = getSemanaAnoDaData(row[campo]);
        row.dia_semana_retorno = getDiaSemanaPorData(row[campo]);
    } else if (['supervisor', 'motorista', 'auxiliar', 'tipo_veiculo'].includes(campo)) {
        row[campo] = normalizarUpper(valor);
    } else {
        row[campo] = normalizarTexto(valor);
    }

    row.status_percentual = calcularPercentual(row);
}
