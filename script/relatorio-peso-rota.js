import { supabaseClient } from './supabase.js';

const PAGE_ID = 'relatorio-peso-rota.html';
const PESO_ROTA_PAGE_ID = 'peso-rota.html';

const state = {
    dados: [],
    comparativo: [],
    sortComparativo: { key: 'peso_total', asc: false },
    sortDetalhe: { key: 'dia_retorno', asc: true },
    charts: {
        pesoPorRota: null,
        status: null,
        evolucao: null
    }
};

const els = {};

document.addEventListener('DOMContentLoaded', async () => {
    cacheEls();
    bindEvents();

    const permitido = await verificarPermissaoPagina();
    if (!permitido) {
        mostrarAcessoNegado();
        return;
    }

    definirPeriodoPadrao();
    await carregarFiliais();
    await carregarOpcoes();
});

function cacheEls() {
    els.form = document.getElementById('formRelatorioPesoRota');
    els.filtroFilial = document.getElementById('filtroFilial');
    els.dataInicial = document.getElementById('dataInicial');
    els.dataFinal = document.getElementById('dataFinal');
    els.filtroRota = document.getElementById('filtroRota');
    els.filtroPlaca = document.getElementById('filtroPlaca');
    els.filtroMotorista = document.getElementById('filtroMotorista');
    els.filtroSupervisor = document.getElementById('filtroSupervisor');
    els.listaRotas = document.getElementById('listaRotas');
    els.listaPlacas = document.getElementById('listaPlacas');
    els.listaMotoristas = document.getElementById('listaMotoristas');
    els.listaSupervisores = document.getElementById('listaSupervisores');
    els.periodoResumo = document.getElementById('periodoResumo');
    els.resultadosPanel = document.getElementById('resultadosPanel');
    els.emptyPanel = document.getElementById('emptyPanel');
    els.tbodyComparativo = document.getElementById('tbodyComparativo');
    els.tbodyDetalhe = document.getElementById('tbodyDetalhe');
    els.buscaComparativo = document.getElementById('buscaComparativo');
    els.buscaDetalhe = document.getElementById('buscaDetalhe');
    els.btnLimparFiltros = document.getElementById('btnLimparFiltros');
    els.btnExportarXlsx = document.getElementById('btnExportarXlsx');
    els.btnExportarPdf = document.getElementById('btnExportarPdf');
    els.chartPesoPorRota = document.getElementById('chartPesoPorRota');
    els.chartStatus = document.getElementById('chartStatus');
    els.chartEvolucao = document.getElementById('chartEvolucao');
    els.kpiRotas = document.getElementById('kpiRotas');
    els.kpiPesoTotal = document.getElementById('kpiPesoTotal');
    els.kpiUsoMedio = document.getElementById('kpiUsoMedio');
    els.kpiAcima90 = document.getElementById('kpiAcima90');
    els.kpiExcesso = document.getElementById('kpiExcesso');
    els.kpiClientes = document.getElementById('kpiClientes');
}

function bindEvents() {
    els.form?.addEventListener('submit', event => {
        event.preventDefault();
        buscarRelatorio();
    });

    els.btnLimparFiltros?.addEventListener('click', limparFiltros);
    els.btnExportarXlsx?.addEventListener('click', exportarXlsx);
    els.btnExportarPdf?.addEventListener('click', exportarPdf);
    els.buscaComparativo?.addEventListener('input', renderComparativo);
    els.buscaDetalhe?.addEventListener('input', renderDetalhe);
    els.filtroFilial?.addEventListener('change', carregarOpcoes);

    document.querySelectorAll('[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            state.sortComparativo = alternarSort(state.sortComparativo, key);
            renderComparativo();
        });
    });

    document.querySelectorAll('[data-detail-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.detailSort;
            state.sortDetalhe = alternarSort(state.sortDetalhe, key);
            renderDetalhe();
        });
    });
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
        console.error('Erro ao validar permissao do relatorio:', error);
        return false;
    }

    const paginas = data?.paginas_permitidas || [];
    return paginas.includes(PAGE_ID) || paginas.includes(PESO_ROTA_PAGE_ID);
}

function mostrarAcessoNegado() {
    document.body.innerHTML = '<div style="padding:50px;text-align:center"><h1>Acesso negado</h1><p>Voce nao tem permissao para acessar este relatorio.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
}

function definirPeriodoPadrao() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    els.dataInicial.value = formatDateLocal(primeiroDia);
    els.dataFinal.value = formatDateLocal(hoje);
}

async function carregarFiliais() {
    const filialUsuario = normalizarTexto(getUsuarioLocal()?.filial);
    if (filialUsuario) {
        els.filtroFilial.innerHTML = '';
        els.filtroFilial.add(new Option(filialUsuario, filialUsuario));
        els.filtroFilial.value = filialUsuario;
        els.filtroFilial.disabled = true;
        return;
    }

    const [filiaisResult, pesosResult] = await Promise.all([
        supabaseClient.from('filiais').select('nome, sigla').order('nome'),
        supabaseClient.from('peso_rota').select('filial').not('filial', 'is', null).limit(1000)
    ]);

    const opcoes = new Map();
    if (!filiaisResult.error) {
        (filiaisResult.data || []).forEach(filial => {
            const value = normalizarTexto(filial.sigla || filial.nome);
            if (value) opcoes.set(value, filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome);
        });
    }

    if (!pesosResult.error) {
        (pesosResult.data || []).forEach(item => {
            const value = normalizarTexto(item.filial);
            if (value && !opcoes.has(value)) opcoes.set(value, value);
        });
    }

    els.filtroFilial.innerHTML = '<option value="">Todas</option>';
    [...opcoes.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }))
        .forEach(([value, label]) => els.filtroFilial.add(new Option(label, value)));
}

async function carregarOpcoes() {
    let query = supabaseClient
        .from('peso_rota')
        .select('rota, placa, motorista, supervisor, filial')
        .order('rota')
        .limit(2000);

    const filial = normalizarTexto(els.filtroFilial?.value);
    if (filial) query = query.eq('filial', filial);

    const { data, error } = await query;
    if (error) {
        console.warn('Nao foi possivel carregar opcoes do relatorio:', error);
        return;
    }

    preencherDatalist(els.listaRotas, data, 'rota');
    preencherDatalist(els.listaPlacas, data, 'placa');
    preencherDatalist(els.listaMotoristas, data, 'motorista');
    preencherDatalist(els.listaSupervisores, data, 'supervisor');
}

async function buscarRelatorio() {
    const dataInicial = els.dataInicial.value;
    const dataFinal = els.dataFinal.value;
    if (!dataInicial || !dataFinal) {
        alert('Informe a data inicial e final.');
        return;
    }
    if (dataInicial > dataFinal) {
        alert('A data inicial nao pode ser maior que a data final.');
        return;
    }

    const btn = els.form.querySelector('button[type="submit"]');
    const htmlOriginal = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
    }

    try {
        let query = supabaseClient
            .from('peso_rota')
            .select('*')
            .gte('dia_retorno', dataInicial)
            .lte('dia_retorno', dataFinal)
            .order('dia_retorno', { ascending: true })
            .order('rota', { ascending: true });

        const filial = normalizarTexto(els.filtroFilial.value);
        const rota = normalizarTexto(els.filtroRota.value);
        const placa = normalizarTexto(els.filtroPlaca.value).toUpperCase();
        const motorista = normalizarTexto(els.filtroMotorista.value);
        const supervisor = normalizarTexto(els.filtroSupervisor.value);

        if (filial) query = query.eq('filial', filial);
        if (rota) query = query.eq('rota', rota);
        if (placa) query = query.ilike('placa', `%${placa}%`);
        if (motorista) query = query.ilike('motorista', `%${motorista}%`);
        if (supervisor) query = query.ilike('supervisor', `%${supervisor}%`);

        const { data, error } = await query;
        if (error) throw error;

        state.dados = (data || []).map(normalizarRegistro);
        state.comparativo = montarComparativo(state.dados);
        renderTudo();
    } catch (error) {
        console.error('Erro ao buscar relatorio de peso de rota:', error);
        alert(`Erro ao buscar relatorio: ${error.message || 'verifique o console.'}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = htmlOriginal;
        }
    }
}

function renderTudo() {
    const temDados = state.dados.length > 0;
    els.resultadosPanel.classList.toggle('hidden', !temDados);
    els.emptyPanel.classList.toggle('hidden', temDados);

    if (!temDados) {
        els.emptyPanel.querySelector('strong').textContent = 'Nenhum registro encontrado';
        els.emptyPanel.querySelector('span').textContent = 'Ajuste o periodo ou remova algum filtro.';
        return;
    }

    els.periodoResumo.textContent = `${formatarData(els.dataInicial.value)} a ${formatarData(els.dataFinal.value)} - ${state.dados.length} lancamento(s)`;
    renderKpis();
    renderComparativo();
    renderDetalhe();
    renderCharts();
}

function renderKpis() {
    const rotas = new Set(state.dados.map(item => item.rota).filter(Boolean));
    const pesoTotal = soma(state.dados, 'peso_carga');
    const clientes = soma(state.dados, 'qtd_clientes');
    const comPercentual = state.dados.filter(item => Number.isFinite(item.status_percentual));
    const usoMedio = comPercentual.length ? soma(comPercentual, 'status_percentual') / comPercentual.length : 0;
    const acima90 = state.dados.filter(item => item.status_percentual > 90 && item.status_percentual <= 100).length;
    const excesso = state.dados.filter(item => item.status_percentual > 100).length;

    els.kpiRotas.textContent = formatInteiro(rotas.size);
    els.kpiPesoTotal.textContent = `${formatNumero(pesoTotal)} kg`;
    els.kpiUsoMedio.textContent = `${formatPercent(usoMedio)}`;
    els.kpiAcima90.textContent = formatInteiro(acima90);
    els.kpiExcesso.textContent = formatInteiro(excesso);
    els.kpiClientes.textContent = formatInteiro(clientes);
}

function renderComparativo() {
    const termo = normalizarBusca(els.buscaComparativo.value);
    const linhas = ordenar([...state.comparativo], state.sortComparativo)
        .filter(item => !termo || normalizarBusca(item.rota).includes(termo));

    els.tbodyComparativo.innerHTML = linhas.map(item => `
        <tr>
            <td>${escapeHtml(item.rota)}</td>
            <td class="numeric">${formatInteiro(item.qtd)}</td>
            <td class="numeric">${formatNumero(item.peso_total)}</td>
            <td class="numeric">${formatNumero(item.peso_medio)}</td>
            <td class="numeric">${statusPercentHtml(item.uso_medio)}</td>
            <td class="numeric">${statusPercentHtml(item.uso_maximo)}</td>
            <td class="numeric">${formatInteiro(item.excesso)}</td>
            <td class="numeric">${formatInteiro(item.qtd_caixas)}</td>
            <td class="numeric">${formatInteiro(item.qtd_clientes)}</td>
        </tr>
    `).join('') || '<tr><td colspan="9">Nenhuma rota encontrada.</td></tr>';
}

function renderDetalhe() {
    const termo = normalizarBusca(els.buscaDetalhe.value);
    const linhas = ordenar([...state.dados], state.sortDetalhe)
        .filter(item => {
            if (!termo) return true;
            return [
                item.dia_retorno,
                item.filial,
                item.rota,
                item.semana,
                item.supervisor,
                item.motorista,
                item.placa,
                item.tipo_veiculo
            ].some(value => normalizarBusca(value).includes(termo));
        });

    els.tbodyDetalhe.innerHTML = linhas.map(item => `
        <tr>
            <td>${formatarData(item.dia_retorno)}</td>
            <td>${escapeHtml(item.filial)}</td>
            <td>${escapeHtml(item.rota)}</td>
            <td>${escapeHtml(item.semana)}</td>
            <td>${escapeHtml(item.supervisor)}</td>
            <td>${escapeHtml(item.motorista)}</td>
            <td>${escapeHtml(item.placa)}</td>
            <td>${escapeHtml(item.tipo_veiculo)}</td>
            <td class="numeric">${formatNumero(item.pbt)}</td>
            <td class="numeric">${formatNumero(item.peso_carga)}</td>
            <td class="numeric">${statusPercentHtml(item.status_percentual)}</td>
            <td class="numeric">${formatInteiro(item.qtd_caixas)}</td>
            <td class="numeric">${formatInteiro(item.qtd_clientes)}</td>
            <td>${escapeHtml((item.horario_chegada || '').slice(0, 5))}</td>
        </tr>
    `).join('') || '<tr><td colspan="14">Nenhum detalhe encontrado.</td></tr>';
}

function renderCharts() {
    const topRotas = [...state.comparativo]
        .sort((a, b) => b.peso_total - a.peso_total)
        .slice(0, 12);

    atualizarChart('pesoPorRota', els.chartPesoPorRota, {
        type: 'bar',
        data: {
            labels: topRotas.map(item => item.rota),
            datasets: [{
                label: 'Peso total',
                data: topRotas.map(item => item.peso_total),
                backgroundColor: '#006937'
            }]
        },
        options: getChartOptions()
    });

    const status = contarStatus(state.dados);
    atualizarChart('status', els.chartStatus, {
        type: 'doughnut',
        data: {
            labels: ['Dentro', 'Acima de 90%', 'Excesso', 'Sem capacidade'],
            datasets: [{
                data: [status.ok, status.alerta, status.excesso, status.semCapacidade],
                backgroundColor: ['#28a745', '#f59f00', '#dc3545', '#6c757d']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });

    const evolucao = montarEvolucao(state.dados);
    atualizarChart('evolucao', els.chartEvolucao, {
        type: 'line',
        data: {
            labels: evolucao.map(item => formatarData(item.data)),
            datasets: [{
                label: 'Peso total',
                data: evolucao.map(item => item.peso_total),
                borderColor: '#006937',
                backgroundColor: 'rgba(0, 105, 55, 0.12)',
                fill: true,
                tension: 0.25
            }]
        },
        options: getChartOptions()
    });
}

function exportarXlsx() {
    if (!state.dados.length || !window.XLSX) return;

    const resumo = state.comparativo.map(item => ({
        Rota: item.rota,
        Lancamentos: item.qtd,
        'Peso Total': item.peso_total,
        'Peso Medio': item.peso_medio,
        'Uso Medio %': item.uso_medio,
        'Maior Uso %': item.uso_maximo,
        Excesso: item.excesso,
        Caixas: item.qtd_caixas,
        Clientes: item.qtd_clientes
    }));

    const detalhe = state.dados.map(item => ({
        'Data Retorno': item.dia_retorno,
        Filial: item.filial,
        Rota: item.rota,
        'Dia Saida': item.semana,
        Supervisor: item.supervisor,
        Motorista: item.motorista,
        Auxiliar: item.auxiliar,
        Placa: item.placa,
        Modelo: item.tipo_veiculo,
        Capacidade: item.pbt,
        Peso: item.peso_carga,
        'Uso %': item.status_percentual,
        Caixas: item.qtd_caixas,
        Clientes: item.qtd_clientes,
        Chegada: item.horario_chegada,
        Descricao: item.descricao
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Comparativo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), 'Detalhamento');
    XLSX.writeFile(wb, `Relatorio_Peso_Rota_${els.dataInicial.value}_${els.dataFinal.value}.xlsx`);
}

async function exportarPdf() {
    if (!state.dados.length) {
        alert('Busque os dados antes de exportar o PDF.');
        return;
    }

    if (!window.jspdf?.jsPDF) {
        alert('Biblioteca jsPDF nao carregada. Verifique sua conexao.');
        return;
    }

    const btn = els.btnExportarPdf;
    const htmlOriginal = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const logoBase64 = await getLogoBase64();
        const pageWidth = doc.internal.pageSize.getWidth();

        desenharCabecalhoPdf(doc, logoBase64, pageWidth);

        const filtros = [
            ['Periodo', `${formatarData(els.dataInicial.value)} a ${formatarData(els.dataFinal.value)}`],
            ['Filial', els.filtroFilial.value || 'Todas'],
            ['Rota', els.filtroRota.value || 'Todas'],
            ['Placa', els.filtroPlaca.value || 'Todas'],
            ['Motorista', els.filtroMotorista.value || 'Todos'],
            ['Supervisor', els.filtroSupervisor.value || 'Todos']
        ];

        doc.autoTable({
            startY: 33,
            head: [['Filtro', 'Valor']],
            body: filtros,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [0, 105, 55], textColor: 255 },
            margin: { left: 10, right: 10 }
        });

        const kpis = getKpisResumo();
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 5,
            head: [['Rotas', 'Peso total', 'Uso medio', 'Acima de 90%', 'Excesso', 'Clientes']],
            body: [[
                formatInteiro(kpis.rotas),
                `${formatNumero(kpis.pesoTotal)} kg`,
                formatPercent(kpis.usoMedio),
                formatInteiro(kpis.acima90),
                formatInteiro(kpis.excesso),
                formatInteiro(kpis.clientes)
            ]],
            theme: 'grid',
            styles: { fontSize: 8, halign: 'center', cellPadding: 2 },
            headStyles: { fillColor: [0, 105, 55], textColor: 255 },
            margin: { left: 10, right: 10 }
        });

        doc.setFontSize(12);
        doc.setTextColor(0, 105, 55);
        doc.text('Comparativo por rota', 10, doc.lastAutoTable.finalY + 9);

        const comparativoOrdenado = ordenar([...state.comparativo], state.sortComparativo);
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 12,
            head: [['Rota', 'Lanc.', 'Peso total', 'Peso medio', 'Uso medio', 'Maior uso', 'Excesso', 'Caixas', 'Clientes']],
            body: comparativoOrdenado.map(item => [
                item.rota,
                formatInteiro(item.qtd),
                formatNumero(item.peso_total),
                formatNumero(item.peso_medio),
                formatPercent(item.uso_medio),
                formatPercent(item.uso_maximo),
                formatInteiro(item.excesso),
                formatInteiro(item.qtd_caixas),
                formatInteiro(item.qtd_clientes)
            ]),
            theme: 'striped',
            styles: { fontSize: 7, cellPadding: 1.8 },
            headStyles: { fillColor: [0, 105, 55], textColor: 255 },
            margin: { left: 10, right: 10 }
        });

        doc.addPage();
        desenharCabecalhoPdf(doc, logoBase64, pageWidth);
        doc.setFontSize(12);
        doc.setTextColor(0, 105, 55);
        doc.text('Detalhamento', 10, 32);

        const detalheOrdenado = ordenar([...state.dados], state.sortDetalhe);
        doc.autoTable({
            startY: 36,
            head: [[
                'Retorno',
                'Filial',
                'Rota',
                'Saida',
                'Supervisor',
                'Motorista',
                'Placa',
                'Modelo',
                'Capacidade',
                'Peso',
                'Uso',
                'Caixas',
                'Clientes',
                'Chegada'
            ]],
            body: detalheOrdenado.map(item => [
                formatarData(item.dia_retorno),
                item.filial,
                item.rota,
                item.semana,
                item.supervisor,
                item.motorista,
                item.placa,
                item.tipo_veiculo,
                formatNumero(item.pbt),
                formatNumero(item.peso_carga),
                formatPercent(item.status_percentual),
                formatInteiro(item.qtd_caixas),
                formatInteiro(item.qtd_clientes),
                (item.horario_chegada || '').slice(0, 5)
            ]),
            theme: 'striped',
            styles: { fontSize: 6.4, cellPadding: 1.4, overflow: 'linebreak' },
            headStyles: { fillColor: [0, 105, 55], textColor: 255 },
            columnStyles: {
                4: { cellWidth: 24 },
                5: { cellWidth: 28 },
                7: { cellWidth: 24 }
            },
            margin: { left: 6, right: 6 }
        });

        adicionarRodapePdf(doc);
        doc.save(`Relatorio_Peso_Rota_${els.dataInicial.value}_${els.dataFinal.value}.pdf`);
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert(`Erro ao gerar PDF: ${error.message || error}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = htmlOriginal;
        }
    }
}

function desenharCabecalhoPdf(doc, logoBase64, pageWidth) {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setDrawColor(220, 226, 222);
    doc.line(10, 28, pageWidth - 10, 28);

    if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 10, 7, 44, 14);
    }

    doc.setTextColor(0, 105, 55);
    doc.setFontSize(15);
    doc.text('Relatorio de Peso de Rota', pageWidth / 2, 12, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(90, 100, 112);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 18, { align: 'center' });
}

function adicionarRodapePdf(doc) {
    const totalPaginas = doc.internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let i = 1; i <= totalPaginas; i += 1) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(`Pagina ${i} de ${totalPaginas}`, pageWidth - 10, pageHeight - 6, { align: 'right' });
        doc.text('Marquespan - Relatorio de Peso de Rota', 10, pageHeight - 6);
    }
}

function getKpisResumo() {
    const rotas = new Set(state.dados.map(item => item.rota).filter(Boolean));
    const pesoTotal = soma(state.dados, 'peso_carga');
    const clientes = soma(state.dados, 'qtd_clientes');
    const comPercentual = state.dados.filter(item => Number.isFinite(item.status_percentual));
    const usoMedio = comPercentual.length ? soma(comPercentual, 'status_percentual') / comPercentual.length : 0;
    const acima90 = state.dados.filter(item => item.status_percentual > 90 && item.status_percentual <= 100).length;
    const excesso = state.dados.filter(item => item.status_percentual > 100).length;

    return {
        rotas: rotas.size,
        pesoTotal,
        usoMedio,
        acima90,
        excesso,
        clientes
    };
}

async function getLogoBase64() {
    try {
        const response = await fetch('logo.png');
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn('Nao foi possivel carregar o logo para o PDF:', error);
        return '';
    }
}

function limparFiltros() {
    const filialUsuario = normalizarTexto(getUsuarioLocal()?.filial);
    definirPeriodoPadrao();
    if (!filialUsuario) els.filtroFilial.value = '';
    els.filtroRota.value = '';
    els.filtroPlaca.value = '';
    els.filtroMotorista.value = '';
    els.filtroSupervisor.value = '';
    els.buscaComparativo.value = '';
    els.buscaDetalhe.value = '';
    carregarOpcoes();
}

function montarComparativo(dados) {
    const mapa = new Map();

    dados.forEach(item => {
        const key = item.rota || '-';
        const atual = mapa.get(key) || {
            rota: key,
            qtd: 0,
            peso_total: 0,
            peso_medio: 0,
            uso_medio: 0,
            uso_maximo: 0,
            excesso: 0,
            qtd_caixas: 0,
            qtd_clientes: 0,
            _uso_total: 0,
            _uso_qtd: 0
        };

        atual.qtd += 1;
        atual.peso_total += item.peso_carga || 0;
        atual.qtd_caixas += item.qtd_caixas || 0;
        atual.qtd_clientes += item.qtd_clientes || 0;
        if (Number.isFinite(item.status_percentual)) {
            atual._uso_total += item.status_percentual;
            atual._uso_qtd += 1;
            atual.uso_maximo = Math.max(atual.uso_maximo, item.status_percentual);
            if (item.status_percentual > 100) atual.excesso += 1;
        }

        mapa.set(key, atual);
    });

    return [...mapa.values()].map(item => ({
        ...item,
        peso_medio: item.qtd ? item.peso_total / item.qtd : 0,
        uso_medio: item._uso_qtd ? item._uso_total / item._uso_qtd : 0
    }));
}

function montarEvolucao(dados) {
    const mapa = new Map();
    dados.forEach(item => {
        const key = item.dia_retorno || '';
        if (!key) return;
        const atual = mapa.get(key) || { data: key, peso_total: 0 };
        atual.peso_total += item.peso_carga || 0;
        mapa.set(key, atual);
    });
    return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
}

function contarStatus(dados) {
    return dados.reduce((acc, item) => {
        if (!Number.isFinite(item.status_percentual) || !item.pbt) acc.semCapacidade += 1;
        else if (item.status_percentual > 100) acc.excesso += 1;
        else if (item.status_percentual > 90) acc.alerta += 1;
        else acc.ok += 1;
        return acc;
    }, { ok: 0, alerta: 0, excesso: 0, semCapacidade: 0 });
}

function normalizarRegistro(item) {
    return {
        ...item,
        filial: normalizarTexto(item.filial),
        rota: normalizarTexto(item.rota),
        semana: normalizarTexto(item.semana),
        supervisor: normalizarTexto(item.supervisor),
        motorista: normalizarTexto(item.motorista),
        auxiliar: normalizarTexto(item.auxiliar),
        placa: normalizarTexto(item.placa),
        tipo_veiculo: normalizarTexto(item.tipo_veiculo),
        pbt: parseNumero(item.pbt),
        peso_carga: parseNumero(item.peso_carga),
        qtd_caixas: parseInteiro(item.qtd_caixas),
        qtd_clientes: parseInteiro(item.qtd_clientes),
        status_percentual: parseNumero(item.status_percentual)
    };
}

function preencherDatalist(el, data, field) {
    const valores = [...new Set((data || [])
        .map(item => normalizarTexto(item[field]))
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

    el.innerHTML = valores.map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
}

function atualizarChart(key, canvas, config) {
    if (!canvas || !window.Chart) return;
    if (state.charts[key]) state.charts[key].destroy();
    state.charts[key] = new Chart(canvas, config);
}

function getChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: { beginAtZero: true }
        }
    };
}

function statusPercentHtml(value) {
    if (!Number.isFinite(value) || value <= 0) return '<span class="status-pill status-ok">0%</span>';
    const classe = value > 100 ? 'status-excesso' : value > 90 ? 'status-alerta' : 'status-ok';
    return `<span class="status-pill ${classe}">${formatPercent(value)}</span>`;
}

function alternarSort(config, key) {
    return {
        key,
        asc: config.key === key ? !config.asc : true
    };
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

function normalizarBusca(value) {
    return normalizarTexto(value)
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
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

function soma(data, field) {
    return data.reduce((total, item) => total + (Number(item[field]) || 0), 0);
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
    const [ano, mes, dia] = String(value).slice(0, 10).split('-');
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : value;
}

function formatNumero(value) {
    return (Number(value) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatPercent(value) {
    return `${(Number(value) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    })}%`;
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
