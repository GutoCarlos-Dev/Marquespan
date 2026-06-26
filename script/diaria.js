import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

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
const DIARIA_NIVEIS_PERMITIDOS = new Set([
    'administrador',
    'gerencia',
    'lider_balanca'
]);

let usuarioLogado = null;
let diariaDadosAtual = [];
let diariaFuncoesCadastroCache = [];
let filiaisCache = [];
let cadastroFinanceiroDiariaCache = [];
let jantaPernoiteDadosAtual = [];
let historicoJantaPernoiteCache = [];

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
    await carregarCadastroFinanceiroDiaria();
    configurarEventos();
    atualizarContextoDiaria();
    aplicarCadastroFinanceiroNaDiaria();
    inicializarJantaPernoite();
});

function getNivelUsuario() {
    return String(usuarioLogado?.nivel || '').trim().toLowerCase();
}

function podeGerenciar() {
    return NIVEIS_GERENCIAMENTO.has(getNivelUsuario());
}

async function verificarPermissaoPagina() {
    return DIARIA_NIVEIS_PERMITIDOS.has(getNivelUsuario());
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
    document.getElementById('diariaBuscaGrid')?.addEventListener('input', renderDiariaTabela);
    document.getElementById('escalaSemana')?.addEventListener('change', atualizarContextoDiaria);
    document.getElementById('escalaFilial')?.addEventListener('change', () => {
        atualizarContextoDiaria();
        aplicarCadastroFinanceiroNaDiaria();
    });
    document.querySelectorAll('[data-diaria-tab]')?.forEach(button => {
        button.addEventListener('click', () => trocarAbaDiaria(button.dataset.diariaTab));
    });
    document.getElementById('formCadastroFinanceiroDiaria')?.addEventListener('submit', salvarCadastroFinanceiroDiaria);
    document.getElementById('btnLimparFinanceiroDiaria')?.addEventListener('click', limparFormularioFinanceiroDiaria);
    document.getElementById('btnCarregarJantaPernoite')?.addEventListener('click', carregarJantaPernoite);
    document.getElementById('btnSalvarJantaPernoite')?.addEventListener('click', salvarJantaPernoite);
    document.getElementById('btnXLSXJantaPernoite')?.addEventListener('click', gerarXLSXJantaPernoite);
    document.getElementById('btnPDFJantaPernoite')?.addEventListener('click', gerarPDFJantaPernoite);
    document.getElementById('btnAtualizarHistoricoJantaPernoite')?.addEventListener('click', carregarHistoricoJantaPernoite);
    document.getElementById('jpFilial')?.addEventListener('change', () => {
        atualizarContextoJantaPernoite();
        carregarHistoricoJantaPernoite();
    });
    document.getElementById('jpData')?.addEventListener('change', atualizarContextoJantaPernoite);
    document.getElementById('jpBuscaFuncionario')?.addEventListener('input', renderJantaPernoiteTabela);
    document.getElementById('tbodyCadastroFinanceiroDiaria')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-financeiro-action]');
        if (!button) return;
        const id = button.dataset.financeiroId;
        if (button.dataset.financeiroAction === 'edit') editarCadastroFinanceiroDiaria(id);
        if (button.dataset.financeiroAction === 'delete') excluirCadastroFinanceiroDiaria(id);
    });
    document.getElementById('tbodyJantaPernoite')?.addEventListener('change', (event) => {
        const toggle = event.target.closest('[data-jp-field]');
        if (!toggle) return;
        atualizarJantaPernoiteManual(toggle.dataset.jpKey, toggle.dataset.jpField, toggle.checked);
    });
    document.querySelectorAll('[data-jp-bulk-field]').forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            aplicarSelecaoJantaPernoiteEmMassa(button.dataset.jpBulkField, button.dataset.jpBulkAction === 'select');
        });
    });
    document.getElementById('tbodyHistoricoJantaPernoite')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-jp-historico-action]');
        if (!button) return;
        const id = button.dataset.jpHistoricoId;
        if (button.dataset.jpHistoricoAction === 'edit') abrirHistoricoJantaPernoite(id);
        if (button.dataset.jpHistoricoAction === 'pdf') gerarPDFHistoricoJantaPernoite(id);
        if (button.dataset.jpHistoricoAction === 'delete') excluirHistoricoJantaPernoite(id);
    });

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
    preencherSelectFinanceiroFilial();
    preencherSelectJantaPernoiteFilial();

    const filialUsuario = usuarioLogado?.filial || '';
    if (filialUsuario && Array.from(selectFilial.options).some(opt => opt.value === filialUsuario)) {
        selectFilial.value = filialUsuario;
    }
    selectFilial.disabled = !podeGerenciar() && Boolean(filialUsuario);
}

function preencherSelectJantaPernoiteFilial() {
    const select = document.getElementById('jpFilial');
    if (!select) return;

    const valorAtual = select.value;
    select.innerHTML = '<option value="">Selecione a Filial</option>' + filiaisCache.map(filial => {
        const value = filial.sigla || filial.nome || '';
        const label = filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome;
        return `<option value="${escapeAttribute(value)}">${escapeAttribute(label)}</option>`;
    }).join('');

    if (valorAtual && Array.from(select.options).some(opt => opt.value === valorAtual)) {
        select.value = valorAtual;
    } else if (usuarioLogado?.filial && Array.from(select.options).some(opt => opt.value === usuarioLogado.filial)) {
        select.value = usuarioLogado.filial;
    }
    select.disabled = !podeGerenciar() && Boolean(usuarioLogado?.filial);
}

function preencherSelectFinanceiroFilial() {
    const select = document.getElementById('financeiroDiariaFilial');
    if (!select) return;

    const valorAtual = select.value;
    select.innerHTML = '<option value="">Selecione a Filial</option>' + filiaisCache.map(filial => {
        const value = filial.sigla || filial.nome || '';
        const label = filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome;
        return `<option value="${escapeAttribute(value)}">${escapeAttribute(label)}</option>`;
    }).join('');

    if (valorAtual && Array.from(select.options).some(opt => opt.value === valorAtual)) {
        select.value = valorAtual;
    } else if (!podeGerenciar() && usuarioLogado?.filial) {
        select.value = usuarioLogado.filial;
    }
    select.disabled = !podeGerenciar() && Boolean(usuarioLogado?.filial);
}

function trocarAbaDiaria(tabId) {
    document.querySelectorAll('[data-diaria-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.diariaTab === tabId);
    });
    document.querySelectorAll('[data-diaria-panel]').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.diariaPanel === tabId);
    });
}

async function carregarCadastroFinanceiroDiaria() {
    try {
        const { data, error } = await supabaseClient
            .from('diaria_cadastro_financeiro')
            .select('id, filial, valor_diaria, valor_janta, valor_per_noite, ultima_alteracao_por, ultima_alteracao_em, created_at')
            .order('filial');

        if (error) throw error;
        cadastroFinanceiroDiariaCache = data || [];
        renderCadastroFinanceiroDiaria();
    } catch (error) {
        cadastroFinanceiroDiariaCache = [];
        renderCadastroFinanceiroDiaria();
        setText('diariaFinanceiroStatus', 'Tabela de cadastro financeiro indisponivel. Aplique o SQL em supabase/2026-06-25_create_diaria_cadastro_financeiro.sql.');
        console.warn('Cadastro financeiro de diaria nao carregado:', error);
    }
}

function getCadastroFinanceiroPorFilial(filial = getFilial()) {
    const filialNormalizada = normalizeString(filial);
    if (!filialNormalizada) return null;
    return cadastroFinanceiroDiariaCache.find(item => normalizeString(item.filial) === filialNormalizada) || null;
}

function aplicarCadastroFinanceiroNaDiaria() {
    const cadastro = getCadastroFinanceiroPorFilial();
    const inputValor = document.getElementById('diariaValorSemana');
    if (!cadastro || !inputValor) return;
    inputValor.value = formatNumeroMoedaInput(Number(cadastro.valor_diaria || 0) * 5);
    recalcularDiariaComValorAtual();
}

function renderCadastroFinanceiroDiaria() {
    const tbody = document.getElementById('tbodyCadastroFinanceiroDiaria');
    if (!tbody) return;

    if (cadastroFinanceiroDiariaCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum cadastro financeiro encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = cadastroFinanceiroDiariaCache.map(item => `
        <tr>
            <td>${escapeAttribute(item.filial)}</td>
            <td>${formatMoedaBR(item.valor_diaria)}</td>
            <td>${formatMoedaBR(item.valor_janta)}</td>
            <td>${formatMoedaBR(item.valor_per_noite)}</td>
            <td>${formatCadastroFinanceiroAlteracao(item)}</td>
            <td>
                <div class="diaria-financeiro-row-actions">
                    <button type="button" data-financeiro-action="edit" data-financeiro-id="${escapeAttribute(item.id)}" title="Editar">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button type="button" data-financeiro-action="delete" data-financeiro-id="${escapeAttribute(item.id)}" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function formatCadastroFinanceiroAlteracao(item) {
    const data = item.ultima_alteracao_em || item.created_at;
    const usuario = item.ultima_alteracao_por || '-';
    if (!data) return escapeAttribute(usuario);
    return `${formatDataHoraBR(data)}<br><small>${escapeAttribute(usuario)}</small>`;
}

async function salvarCadastroFinanceiroDiaria(event) {
    event.preventDefault();

    const id = document.getElementById('financeiroDiariaId')?.value || '';
    const filial = document.getElementById('financeiroDiariaFilial')?.value || '';
    const valorDiaria = parseMoedaBR(document.getElementById('financeiroDiariaValor')?.value);
    const valorJanta = parseMoedaBR(document.getElementById('financeiroJantaValor')?.value);
    const valorPerNoite = parseMoedaBR(document.getElementById('financeiroPernoiteValor')?.value);

    if (!filial) return alert('Selecione a filial.');
    if (valorDiaria <= 0) return alert('Informe o valor da diaria.');
    if (valorJanta < 0 || valorPerNoite < 0) return alert('Os valores de janta e per noite nao podem ser negativos.');

    const existente = id ? null : getCadastroFinanceiroPorFilial(filial);
    const payload = comAuditoria({
        filial,
        valor_diaria: valorDiaria,
        valor_janta: valorJanta,
        valor_per_noite: valorPerNoite
    });

    try {
        if (id || existente?.id) {
            const { error } = await supabaseClient
                .from('diaria_cadastro_financeiro')
                .update(payload)
                .eq('id', id || existente.id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('diaria_cadastro_financeiro')
                .insert(payload);
            if (error) throw error;
        }

        registrarAuditoria('INCLUIR', 'Diaria', `Cadastro financeiro de diaria - Filial: ${filial}`);
        await carregarCadastroFinanceiroDiaria();
        limparFormularioFinanceiroDiaria();
        aplicarCadastroFinanceiroNaDiaria();
        setText('diariaFinanceiroStatus', 'Cadastro financeiro salvo com sucesso.');
    } catch (error) {
        console.error('Erro ao salvar cadastro financeiro da diaria:', error);
        alert('Erro ao salvar cadastro financeiro. Detalhe: ' + error.message);
    }
}

function editarCadastroFinanceiroDiaria(id) {
    const item = cadastroFinanceiroDiariaCache.find(row => row.id === id);
    if (!item) return;

    setValue('financeiroDiariaId', item.id);
    setValue('financeiroDiariaFilial', item.filial);
    setValue('financeiroDiariaValor', formatNumeroMoedaInput(item.valor_diaria));
    setValue('financeiroJantaValor', formatNumeroMoedaInput(item.valor_janta));
    setValue('financeiroPernoiteValor', formatNumeroMoedaInput(item.valor_per_noite));
    setText('diariaFinanceiroStatus', `Editando cadastro financeiro da filial ${item.filial}.`);
    trocarAbaDiaria('cadastro-financeiro');
}

async function excluirCadastroFinanceiroDiaria(id) {
    const item = cadastroFinanceiroDiariaCache.find(row => row.id === id);
    if (!item) return;
    if (!confirm(`Excluir cadastro financeiro da filial ${item.filial}?`)) return;

    try {
        const { error } = await supabaseClient
            .from('diaria_cadastro_financeiro')
            .delete()
            .eq('id', id);
        if (error) throw error;

        registrarAuditoria('EXCLUIR', 'Diaria', `Cadastro financeiro de diaria - Filial: ${item.filial}`);
        await carregarCadastroFinanceiroDiaria();
        limparFormularioFinanceiroDiaria();
        setText('diariaFinanceiroStatus', 'Cadastro financeiro excluido com sucesso.');
    } catch (error) {
        console.error('Erro ao excluir cadastro financeiro da diaria:', error);
        alert('Erro ao excluir cadastro financeiro. Detalhe: ' + error.message);
    }
}

function limparFormularioFinanceiroDiaria() {
    setValue('financeiroDiariaId', '');
    setValue('financeiroDiariaFilial', !podeGerenciar() ? (usuarioLogado?.filial || '') : '');
    setValue('financeiroDiariaValor', '');
    setValue('financeiroJantaValor', '');
    setValue('financeiroPernoiteValor', '');
    setText('diariaFinanceiroStatus', 'Cadastre os valores por filial.');
}

function inicializarJantaPernoite() {
    const inputData = document.getElementById('jpData');
    if (inputData && !inputData.value) {
        inputData.value = new Date().toISOString().slice(0, 10);
    }
    atualizarContextoJantaPernoite();
    carregarHistoricoJantaPernoite();
}

function getJantaPernoiteFilial() {
    return (document.getElementById('jpFilial')?.value || usuarioLogado?.filial || '').trim();
}

function getJantaPernoiteData() {
    return (document.getElementById('jpData')?.value || '').trim();
}

function exigirFiltroJantaPernoite() {
    if (!getJantaPernoiteFilial()) {
        alert('Selecione uma filial.');
        return false;
    }
    if (!getJantaPernoiteData()) {
        alert('Selecione a data da escala.');
        return false;
    }
    return true;
}

function atualizarContextoJantaPernoite() {
    const filial = getJantaPernoiteFilial();
    const data = getJantaPernoiteData();
    const cadastro = getCadastroFinanceiroPorFilial(filial);
    setText('jpContexto', filial && data
        ? `${formatDataISOBR(data)} - ${filial}${cadastro ? '' : ' | Cadastro financeiro nao encontrado para a filial.'}`
        : 'Selecione a data e a filial para buscar a escala.');
    setText('jpValorJanta', formatMoedaBR(cadastro?.valor_janta || 0));
    setText('jpValorPernoite', formatMoedaBR(cadastro?.valor_per_noite || 0));
    atualizarResumoJantaPernoite();
}

async function carregarHistoricoJantaPernoite() {
    const tbody = document.getElementById('tbodyHistoricoJantaPernoite');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Carregando historico...</td></tr>';

    try {
        let query = supabaseClient
            .from('diaria_janta_pernoite')
            .select('id, data_ref, filial, total_funcionarios, total_janta, total_per_noite, total_desconto, total_pagar, ultima_alteracao_por, ultima_alteracao_em, created_at')
            .order('data_ref', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(80);

        const filial = getJantaPernoiteFilial();
        if (filial) query = query.eq('filial', filial);

        const { data, error } = await query;
        if (error) throw error;

        historicoJantaPernoiteCache = data || [];
        renderHistoricoJantaPernoite();
    } catch (error) {
        historicoJantaPernoiteCache = [];
        console.warn('Historico de janta e pernoite nao carregado:', error);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#dc3545;">Erro ao carregar historico.</td></tr>';
    }
}

function renderHistoricoJantaPernoite() {
    const tbody = document.getElementById('tbodyHistoricoJantaPernoite');
    if (!tbody) return;

    if (historicoJantaPernoiteCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum historico salvo encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = historicoJantaPernoiteCache.map(item => `
        <tr>
            <td>${formatDataISOBR(item.data_ref)}</td>
            <td>${escapeAttribute(item.filial)}</td>
            <td>${Number(item.total_funcionarios || 0)}</td>
            <td>${formatMoedaBR(item.total_janta)}</td>
            <td>${formatMoedaBR(item.total_per_noite)}</td>
            <td>${formatMoedaBR(item.total_desconto)}</td>
            <td>${formatMoedaBR(item.total_pagar)}</td>
            <td>${formatCadastroFinanceiroAlteracao(item)}</td>
            <td>
                <div class="diaria-financeiro-row-actions">
                    <button type="button" data-jp-historico-action="edit" data-jp-historico-id="${escapeAttribute(item.id)}" title="Abrir para editar">
                        <i class="fas fa-folder-open"></i>
                    </button>
                    <button type="button" data-jp-historico-action="pdf" data-jp-historico-id="${escapeAttribute(item.id)}" title="Gerar PDF">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                    <button type="button" data-jp-historico-action="delete" data-jp-historico-id="${escapeAttribute(item.id)}" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function buscarLancamentoJantaPernoite(id) {
    const { data, error } = await supabaseClient
        .from('diaria_janta_pernoite')
        .select('*, diaria_janta_pernoite_itens(*)')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

function mapearItensHistoricoJantaPernoite(lancamento) {
    return (lancamento?.diaria_janta_pernoite_itens || []).map(item => recalcularItemJantaPernoite({
        key: normalizeString(item.funcionario_nome || item.nome_completo || item.cpf),
        nome: cleanImportValue(item.funcionario_nome),
        nomeCompleto: cleanImportValue(item.nome_completo),
        cpf: cleanImportValue(item.cpf),
        funcao: cleanImportValue(item.funcao),
        tipo: cleanImportValue(item.tipo_funcionario),
        rota: cleanImportValue(item.rota),
        placa: cleanImportValue(item.placa),
        motivoFalta: cleanImportValue(item.motivo_desconto),
        faltou: Boolean(item.faltou),
        pagaJanta: Boolean(item.paga_janta),
        pagaPerNoite: Boolean(item.paga_per_noite),
        desconto: Boolean(item.desconto),
        valorJanta: Number(lancamento.valor_janta || item.valor_janta || 0),
        valorPerNoite: Number(lancamento.valor_per_noite || item.valor_per_noite || 0)
    })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function abrirHistoricoJantaPernoite(id) {
    try {
        const lancamento = await buscarLancamentoJantaPernoite(id);
        setValue('jpFilial', lancamento.filial || '');
        setValue('jpData', String(lancamento.data_ref || '').slice(0, 10));
        setValue('jpBuscaFuncionario', '');

        jantaPernoiteDadosAtual = mapearItensHistoricoJantaPernoite(lancamento);
        renderJantaPernoiteTabela();
        atualizarContextoJantaPernoite();
        setText('jpContexto', `Historico aberto para edicao: ${formatDataISOBR(lancamento.data_ref)} - ${lancamento.filial}`);
    } catch (error) {
        console.error('Erro ao abrir historico de janta e pernoite:', error);
        alert('Erro ao abrir historico. Detalhe: ' + error.message);
    }
}

async function gerarPDFHistoricoJantaPernoite(id) {
    try {
        const lancamento = await buscarLancamentoJantaPernoite(id);
        const dados = mapearItensHistoricoJantaPernoite(lancamento);
        await gerarPDFJantaPernoiteComDados({
            dados,
            dataRef: lancamento.data_ref,
            filial: lancamento.filial,
            totalPagar: Number(lancamento.total_pagar || 0),
            totalDesconto: Number(lancamento.total_desconto || 0),
            nomeArquivo: `Janta_Pernoite_${lancamento.data_ref}_${lancamento.filial}`.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_') + '.pdf'
        });
    } catch (error) {
        console.error('Erro ao gerar PDF do historico de janta e pernoite:', error);
        alert('Erro ao gerar PDF do historico. Detalhe: ' + error.message);
    }
}

async function excluirHistoricoJantaPernoite(id) {
    const item = historicoJantaPernoiteCache.find(row => row.id === id);
    if (!item) return;
    if (!confirm(`Excluir o historico de ${formatDataISOBR(item.data_ref)} - ${item.filial}?`)) return;

    try {
        const { error } = await supabaseClient
            .from('diaria_janta_pernoite')
            .delete()
            .eq('id', id);

        if (error) throw error;

        registrarAuditoria('EXCLUIR', 'Diaria', `Janta e pernoite - Data: ${formatDataISOBR(item.data_ref)}, Filial: ${item.filial}`);
        await carregarHistoricoJantaPernoite();
        alert('Historico excluido com sucesso.');
    } catch (error) {
        console.error('Erro ao excluir historico de janta e pernoite:', error);
        alert('Erro ao excluir historico. Detalhe: ' + error.message);
    }
}

async function carregarJantaPernoite() {
    if (!exigirFiltroJantaPernoite()) return;

    const tbody = document.getElementById('tbodyJantaPernoite');
    if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Carregando escala...</td></tr>';

    const filial = getJantaPernoiteFilial();
    const dataRef = getJantaPernoiteData();
    const cadastro = getCadastroFinanceiroPorFilial(filial);

    try {
        const [resEscala, resFaltas, resFuncionarios, resLancamento] = await Promise.all([
            supabaseClient
                .from('escala')
                .select('data_escala, filial, rota, placa, motorista, auxiliar, tipo_escala')
                .eq('filial', filial)
                .eq('data_escala', dataRef)
                .order('rota'),
            supabaseClient
                .from('faltas_afastamentos')
                .select('motorista_ausente, motivo_motorista, auxiliar_ausente, motivo_auxiliar, data_escala')
                .eq('filial', filial)
                .eq('data_escala', dataRef),
            supabaseClient
                .from('funcionario')
                .select('nome, nome_completo, cpf, funcao, status, filial')
                .eq('filial', filial),
            supabaseClient
                .from('diaria_janta_pernoite')
                .select('id, diaria_janta_pernoite_itens(*)')
                .eq('filial', filial)
                .eq('data_ref', dataRef)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
        ]);

        if (resEscala.error) throw resEscala.error;
        if (resFaltas.error) throw resFaltas.error;
        if (resFuncionarios.error) throw resFuncionarios.error;
        if (resLancamento.error) throw resLancamento.error;

        const funcionariosAtivos = criarMapaFuncionariosAtivos(
            (resFuncionarios.data || []).filter(funcionario => isFuncionarioElegivelDiaria(funcionario, filial))
        );
        const faltas = criarMapaFaltasJantaPernoite(resFaltas.data || []);
        const salvos = new Map((resLancamento.data?.diaria_janta_pernoite_itens || [])
            .map(item => [normalizeString(item.funcionario_nome), item]));

        jantaPernoiteDadosAtual = montarItensJantaPernoite({
            escala: resEscala.data || [],
            funcionariosAtivos,
            faltas,
            salvos,
            valorJanta: Number(cadastro?.valor_janta || 0),
            valorPerNoite: Number(cadastro?.valor_per_noite || 0)
        });

        renderJantaPernoiteTabela();
        atualizarContextoJantaPernoite();
    } catch (error) {
        console.error('Erro ao carregar janta e pernoite:', error);
        jantaPernoiteDadosAtual = [];
        if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:#dc3545;">Erro ao carregar janta e pernoite. Verifique se o SQL da tabela foi aplicado.</td></tr>';
        atualizarResumoJantaPernoite();
    }
}

function criarMapaFuncionariosAtivos(funcionarios) {
    const map = new Map();
    funcionarios.forEach(funcionario => {
        const keys = getPessoaDiariaKeys(funcionario.nome, funcionario.nome_completo, funcionario.cpf);
        keys.forEach(key => {
            if (key) map.set(key, funcionario);
        });
    });
    return map;
}

function criarMapaFaltasJantaPernoite(rows) {
    const map = new Map();
    rows.forEach(row => {
        [
            { nome: row.motorista_ausente, motivo: row.motivo_motorista },
            { nome: row.auxiliar_ausente, motivo: row.motivo_auxiliar }
        ].forEach(item => {
            const key = normalizeString(item.nome);
            if (key) map.set(key, cleanImportValue(item.motivo) || 'FALTA');
        });
    });
    return map;
}

function montarItensJantaPernoite({ escala, funcionariosAtivos, faltas, salvos, valorJanta, valorPerNoite }) {
    const itens = new Map();

    escala.forEach(row => {
        [
            { nome: row.motorista, tipo: 'MOTORISTA' },
            { nome: row.auxiliar, tipo: 'AUXILIAR' }
        ].forEach(pessoa => {
            const nomeEscala = cleanImportValue(pessoa.nome);
            const key = normalizeString(nomeEscala);
            if (!key || itens.has(key)) return;

            const funcionario = funcionariosAtivos.get(key);
            if (!funcionario) return;

            const salvo = salvos.get(key);
            const motivoFalta = faltas.get(key) || '';
            const desconto = salvo ? Boolean(salvo.desconto) : Boolean(motivoFalta);
            const item = recalcularItemJantaPernoite({
                key,
                nome: cleanImportValue(funcionario.nome) || nomeEscala,
                nomeCompleto: cleanImportValue(funcionario.nome_completo),
                cpf: cleanImportValue(funcionario.cpf),
                funcao: cleanImportValue(funcionario.funcao),
                tipo: pessoa.tipo,
                rota: cleanImportValue(row.rota),
                placa: cleanImportValue(row.placa),
                motivoFalta,
                faltou: Boolean(motivoFalta),
                pagaJanta: salvo ? Boolean(salvo.paga_janta) : !desconto,
                pagaPerNoite: salvo ? Boolean(salvo.paga_per_noite) : !desconto,
                desconto,
                valorJanta,
                valorPerNoite
            });
            itens.set(key, item);
        });
    });

    return Array.from(itens.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function recalcularItemJantaPernoite(item) {
    item.pagaJanta = Boolean(item.pagaJanta) && !item.desconto;
    item.pagaPerNoite = Boolean(item.pagaPerNoite) && !item.desconto;
    item.valorJantaPagar = item.pagaJanta ? Number(item.valorJanta || 0) : 0;
    item.valorPerNoitePagar = item.pagaPerNoite ? Number(item.valorPerNoite || 0) : 0;
    item.valorDesconto = item.desconto ? Number(item.valorJanta || 0) + Number(item.valorPerNoite || 0) : 0;
    item.valorPagar = item.valorJantaPagar + item.valorPerNoitePagar;
    item.status = item.desconto ? 'DESCONTO' : 'APTO';
    return item;
}

function atualizarJantaPernoiteManual(key, field, checked) {
    const item = jantaPernoiteDadosAtual.find(row => row.key === key);
    if (!item) return;

    if (field === 'janta') item.pagaJanta = checked;
    if (field === 'pernoite') item.pagaPerNoite = checked;
    if (field === 'desconto') {
        item.desconto = checked;
        if (checked) {
            item.pagaJanta = false;
            item.pagaPerNoite = false;
        }
    }

    recalcularItemJantaPernoite(item);
    renderJantaPernoiteTabela();
}

function getJantaPernoiteTermoBusca() {
    return normalizeString(document.getElementById('jpBuscaFuncionario')?.value || '');
}

function getJantaPernoiteDadosFiltrados() {
    const termo = getJantaPernoiteTermoBusca();
    if (!termo) return jantaPernoiteDadosAtual;

    return jantaPernoiteDadosAtual.filter(item => [
        item.nome,
        item.nomeCompleto,
        item.cpf,
        item.funcao,
        item.tipo,
        item.rota,
        item.placa
    ].some(value => normalizeString(value).includes(termo)));
}

function aplicarSelecaoJantaPernoiteEmMassa(field, checked) {
    const keysVisiveis = new Set(getJantaPernoiteDadosFiltrados().map(item => item.key));
    if (keysVisiveis.size === 0) return;

    jantaPernoiteDadosAtual.forEach(item => {
        if (!keysVisiveis.has(item.key)) return;
        if (field === 'janta') item.pagaJanta = checked;
        if (field === 'pernoite') item.pagaPerNoite = checked;
        if (checked) item.desconto = false;
        recalcularItemJantaPernoite(item);
    });
    renderJantaPernoiteTabela();
}

function renderJantaPernoiteTabela() {
    const tbody = document.getElementById('tbodyJantaPernoite');
    if (!tbody) return;

    const dadosFiltrados = getJantaPernoiteDadosFiltrados();

    if (jantaPernoiteDadosAtual.length === 0 || dadosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;">${jantaPernoiteDadosAtual.length === 0 ? 'Nenhum funcionario ativo escalado para os filtros selecionados.' : 'Nenhum funcionario encontrado para a busca.'}</td></tr>`;
        atualizarResumoJantaPernoite();
        return;
    }

    tbody.innerHTML = dadosFiltrados.map(item => `
        <tr>
            <td>${escapeAttribute(item.nome)}</td>
            <td>${escapeAttribute(item.nomeCompleto)}</td>
            <td>${escapeAttribute(item.cpf)}</td>
            <td>${escapeAttribute(item.funcao)}</td>
            <td>${escapeAttribute(item.tipo)}</td>
            <td>${escapeAttribute(item.rota)}</td>
            <td>${escapeAttribute(item.placa)}</td>
            <td><input type="checkbox" class="diaria-jp-toggle" data-jp-key="${escapeAttribute(item.key)}" data-jp-field="janta" ${item.pagaJanta ? 'checked' : ''}></td>
            <td><input type="checkbox" class="diaria-jp-toggle" data-jp-key="${escapeAttribute(item.key)}" data-jp-field="pernoite" ${item.pagaPerNoite ? 'checked' : ''}></td>
            <td>
                <input type="checkbox" class="diaria-jp-toggle" data-jp-key="${escapeAttribute(item.key)}" data-jp-field="desconto" ${item.desconto ? 'checked' : ''} title="${escapeAttribute(item.motivoFalta || 'Marcar desconto')}">
                <span class="diaria-status ${item.desconto ? 'bloqueado' : 'apto'}">${escapeAttribute(item.status)}</span>
            </td>
            <td>${formatMoedaBR(item.valorPagar)}</td>
        </tr>
    `).join('');

    atualizarResumoJantaPernoite();
}

function atualizarResumoJantaPernoite() {
    const totalPagar = jantaPernoiteDadosAtual.reduce((sum, item) => sum + Number(item.valorPagar || 0), 0);
    const totalDesconto = jantaPernoiteDadosAtual.reduce((sum, item) => sum + Number(item.valorDesconto || 0), 0);
    setText('jpTotalPagar', formatMoedaBR(totalPagar));
    setText('jpTotalDesconto', formatMoedaBR(totalDesconto));
}

async function salvarJantaPernoite() {
    if (!exigirFiltroJantaPernoite()) return;
    if (jantaPernoiteDadosAtual.length === 0) return alert('Busque a escala antes de salvar.');

    const filial = getJantaPernoiteFilial();
    const dataRef = getJantaPernoiteData();
    const cadastro = getCadastroFinanceiroPorFilial(filial);

    await atualizarPlacaRotaJantaPernoiteDaEscala(filial, dataRef);

    const itens = jantaPernoiteDadosAtual.map(item => ({
        funcionario_nome: item.nome,
        nome_completo: item.nomeCompleto,
        cpf: item.cpf,
        funcao: item.funcao,
        tipo_funcionario: item.tipo,
        rota: item.rota,
        placa: item.placa,
        status_lancamento: item.status,
        motivo_desconto: item.motivoFalta,
        faltou: item.faltou,
        paga_janta: item.pagaJanta,
        paga_per_noite: item.pagaPerNoite,
        desconto: item.desconto,
        valor_janta: item.valorJantaPagar,
        valor_per_noite: item.valorPerNoitePagar,
        valor_desconto: item.valorDesconto,
        valor_total: item.valorPagar
    }));

    try {
        const payload = comAuditoria({
            data_ref: dataRef,
            filial,
            valor_janta: Number(cadastro?.valor_janta || 0),
            valor_per_noite: Number(cadastro?.valor_per_noite || 0),
            total_funcionarios: itens.length,
            total_janta: itens.reduce((sum, item) => sum + Number(item.valor_janta || 0), 0),
            total_per_noite: itens.reduce((sum, item) => sum + Number(item.valor_per_noite || 0), 0),
            total_desconto: itens.reduce((sum, item) => sum + Number(item.valor_desconto || 0), 0),
            total_pagar: itens.reduce((sum, item) => sum + Number(item.valor_total || 0), 0)
        });

        const { data: existente, error: buscaError } = await supabaseClient
            .from('diaria_janta_pernoite')
            .select('id')
            .eq('data_ref', dataRef)
            .eq('filial', filial)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (buscaError) throw buscaError;

        let lancamento = existente;
        if (existente?.id) {
            const { data, error } = await supabaseClient
                .from('diaria_janta_pernoite')
                .update(payload)
                .eq('id', existente.id)
                .select('id')
                .single();
            if (error) throw error;
            lancamento = data;
        } else {
            const { data, error } = await supabaseClient
                .from('diaria_janta_pernoite')
                .insert(payload)
                .select('id')
                .single();
            if (error) throw error;
            lancamento = data;
        }

        const { error: deleteError } = await supabaseClient
            .from('diaria_janta_pernoite_itens')
            .delete()
            .eq('lancamento_id', lancamento.id);
        if (deleteError) throw deleteError;

        const { error: insertError } = await supabaseClient
            .from('diaria_janta_pernoite_itens')
            .insert(itens.map(item => comAuditoria({ ...item, lancamento_id: lancamento.id })));
        if (insertError) throw insertError;

        registrarAuditoria('INCLUIR', 'Diaria', `Janta e pernoite - Data: ${formatDataISOBR(dataRef)}, Filial: ${filial}`);
        await carregarHistoricoJantaPernoite();
        alert('Janta e pernoite salvos com sucesso.');
    } catch (error) {
        console.error('Erro ao salvar janta e pernoite:', error);
        alert('Erro ao salvar janta e pernoite. Detalhe: ' + error.message);
    }
}

async function atualizarPlacaRotaJantaPernoiteDaEscala(filial, dataRef) {
    try {
        const { data, error } = await supabaseClient
            .from('escala')
            .select('rota, placa, motorista, auxiliar')
            .eq('filial', filial)
            .eq('data_escala', dataRef);

        if (error) throw error;

        const escalaPorFuncionario = new Map();
        (data || []).forEach(row => {
            [
                { nome: row.motorista, tipo: 'MOTORISTA' },
                { nome: row.auxiliar, tipo: 'AUXILIAR' }
            ].forEach(pessoa => {
                const key = normalizeString(pessoa.nome);
                if (!key || escalaPorFuncionario.has(key)) return;
                escalaPorFuncionario.set(key, {
                    rota: cleanImportValue(row.rota),
                    placa: cleanImportValue(row.placa),
                    tipo: pessoa.tipo
                });
            });
        });

        jantaPernoiteDadosAtual.forEach(item => {
            const escala = escalaPorFuncionario.get(item.key)
                || escalaPorFuncionario.get(normalizeString(item.nomeCompleto))
                || escalaPorFuncionario.get(normalizeString(item.nome));
            if (!escala) return;
            item.rota = escala.rota || item.rota;
            item.placa = escala.placa || item.placa;
            item.tipo = escala.tipo || item.tipo;
        });
    } catch (error) {
        console.warn('Nao foi possivel atualizar placa/rota pela escala antes de salvar:', error);
    }
}

function getJantaPernoiteExportRows() {
    return jantaPernoiteDadosAtual.map(item => ({
        FUNCIONARIO: item.nome,
        'NOME COMPLETO': item.nomeCompleto,
        CPF: item.cpf,
        FUNCAO: item.funcao,
        TIPO: item.tipo,
        ROTA: item.rota,
        PLACA: item.placa,
        JANTA: item.pagaJanta ? 'SIM' : 'NAO',
        'PER NOITE': item.pagaPerNoite ? 'SIM' : 'NAO',
        DESCONTO: item.desconto ? 'SIM' : 'NAO',
        MOTIVO: item.motivoFalta,
        'VALOR A PAGAR': item.valorPagar
    }));
}

function gerarXLSXJantaPernoite() {
    if (typeof XLSX === 'undefined') return alert('Biblioteca XLSX nao carregada.');
    if (jantaPernoiteDadosAtual.length === 0) return alert('Nenhum dado para gerar XLSX.');

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(getJantaPernoiteExportRows());
    XLSX.utils.book_append_sheet(wb, ws, 'Janta Pernoite');
    XLSX.writeFile(wb, getJantaPernoiteNomeArquivo('xlsx'));
}

async function gerarPDFJantaPernoite() {
    if (jantaPernoiteDadosAtual.length === 0) return alert('Nenhum dado para gerar PDF.');
    if (!window.jspdf?.jsPDF) return alert('Biblioteca jsPDF nao carregada.');

    const totalPagar = jantaPernoiteDadosAtual.reduce((sum, item) => sum + Number(item.valorPagar || 0), 0);
    const totalDesconto = jantaPernoiteDadosAtual.reduce((sum, item) => sum + Number(item.valorDesconto || 0), 0);
    await gerarPDFJantaPernoiteComDados({
        dados: jantaPernoiteDadosAtual,
        dataRef: getJantaPernoiteData(),
        filial: getJantaPernoiteFilial(),
        totalPagar,
        totalDesconto,
        nomeArquivo: getJantaPernoiteNomeArquivo('pdf')
    });
}

async function gerarPDFJantaPernoiteComDados({ dados, dataRef, filial, totalPagar, totalDesconto, nomeArquivo }) {
    if (!dados || dados.length === 0) return alert('Nenhum dado para gerar PDF.');
    if (!window.jspdf?.jsPDF) return alert('Biblioteca jsPDF nao carregada.');

    const dadosPagos = dados.filter(item => Number(item.valorPagar || 0) > 0);
    if (dadosPagos.length === 0) return alert('Nenhum funcionario com valor a pagar para gerar PDF.');

    const totalPagarPDF = dadosPagos.reduce((sum, item) => sum + Number(item.valorPagar || 0), 0);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const logoBase64 = await getLogoBase64DiariaPDF();
    const nomeUsuario = getUsuarioAuditoria();
    const titulo = `Janta e Pernoite - ${formatDataISOBR(dataRef)} - ${filial}`;
    const subtitulo = `Total a pagar: ${formatMoedaBR(totalPagarPDF)} | Registros pagos: ${dadosPagos.length}`;

    doc.autoTable({
        startY: 38,
        margin: { top: 38, left: 14, right: 14, bottom: 14 },
        head: [['FUNCIONARIO', 'NOME COMPLETO', 'CPF', 'FUNCAO', 'TIPO', 'ROTA', 'PLACA', 'JANTA', 'PER NOITE', 'DESCONTO', 'VALOR']],
        body: dadosPagos.map(item => [
            item.nome,
            item.nomeCompleto,
            item.cpf,
            item.funcao,
            item.tipo,
            item.rota,
            item.placa,
            item.pagaJanta ? 'SIM' : 'NAO',
            item.pagaPerNoite ? 'SIM' : 'NAO',
            item.desconto ? 'SIM' : 'NAO',
            formatMoedaBR(item.valorPagar)
        ]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [0, 105, 55] },
        didDrawPage: () => {
            desenharCabecalhoJantaPernoitePDF(doc, { logoBase64, titulo, subtitulo, nomeUsuario });
        }
    });

    doc.save(nomeArquivo || getJantaPernoiteNomeArquivo('pdf'));
}

async function getLogoBase64DiariaPDF() {
    const caminhos = ['logo.png', 'img/logonavegador.png'];
    for (const caminho of caminhos) {
        try {
            const response = await fetch(caminho);
            if (!response.ok) continue;
            const blob = await response.blob();
            return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch {
            // Tenta o proximo caminho.
        }
    }
    return null;
}

function getFormatoImagemPDF(base64) {
    const value = String(base64 || '');
    if (value.startsWith('data:image/png')) return 'PNG';
    if (value.startsWith('data:image/webp')) return 'WEBP';
    return 'JPEG';
}

function desenharCabecalhoJantaPernoitePDF(doc, { logoBase64, titulo, subtitulo, nomeUsuario }) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, 34, 'F');
    doc.setDrawColor(220, 232, 226);
    doc.line(14, 32, pageWidth - 14, 32);

    if (logoBase64) {
        doc.addImage(logoBase64, getFormatoImagemPDF(logoBase64), 14, 8, 38, 12);
    }

    doc.setTextColor(31, 51, 40);
    doc.setFontSize(15);
    doc.text(titulo, 60, 13);
    doc.setFontSize(9);
    doc.text(subtitulo, 60, 20);
    doc.text(`Gerado por: ${nomeUsuario}`, 60, 26);

    doc.setFontSize(8);
    doc.setTextColor(100, 115, 107);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pageHeight - 8);
    doc.text(`Pagina ${pageNumber}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
    doc.setTextColor(0, 0, 0);
}

function getJantaPernoiteNomeArquivo(ext) {
    const dataRef = getJantaPernoiteData() || 'DATA';
    const filial = getJantaPernoiteFilial() || 'FILIAL';
    const nome = `Janta_Pernoite_${dataRef}_${filial}`.replace(/[^a-z0-9_-]+/gi, '_').replace(/_+/g, '_');
    return `${nome}.${ext}`;
}

function atualizarContextoDiaria() {
    const semana = document.getElementById('escalaSemana')?.value || '';
    const filial = getFilial();
    const semanaReferencia = getSemanaAnteriorNome(semana);
    const contexto = document.getElementById('diariaContexto');
    if (contexto) {
        contexto.textContent = semana && filial
            ? `${semana} - ${filial}${semanaReferencia ? ` | Ref.: ferias/afast. semana atual; faltas ${semanaReferencia}` : ''}`
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
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Carregando...</td></tr>';

    try {
        const valorSemana = parseMoedaBR(document.getElementById('diariaValorSemana')?.value);
        const semanaReferencia = getSemanaAnteriorNome(semana);
        const datasSemanaAtual = getDatasSemanaISO(semana);
        const datasSemanaAnterior = getDatasSemanaISO(semanaReferencia);
        const datasConsultaAtual = datasSemanaAtual.length ? datasSemanaAtual : ['0001-01-01'];
        const datasConsultaAnterior = datasSemanaAnterior.length ? datasSemanaAnterior : ['0001-01-01'];

        const [, resFuncionarios, resFaltasSemanaAtual, resFaltasSemanaAnterior, resEscala, resEscalaReserva] = await Promise.all([
            carregarFuncoesCadastroDiaria(),
            supabaseClient
                .from('funcionario')
                .select('nome, nome_completo, cpf, funcao, status, filial, recebe_diaria')
                .eq('filial', getFilial())
                .neq('recebe_diaria', false)
                .order('nome'),
            aplicarFiltroFilial(supabaseClient
                .from('faltas_afastamentos')
                .select('motorista_ausente, motivo_motorista, auxiliar_ausente, motivo_auxiliar, data_escala')
                .in('data_escala', datasConsultaAtual)),
            aplicarFiltroFilial(supabaseClient
                .from('faltas_afastamentos')
                .select('motorista_ausente, motivo_motorista, auxiliar_ausente, motivo_auxiliar, data_escala')
                .in('data_escala', datasConsultaAnterior)),
            aplicarFiltroFilial(supabaseClient
                .from('escala')
                .select('motorista, auxiliar, data_escala')
                .in('data_escala', datasConsultaAtual)
                .not('tipo_escala', 'eq', 'RESERVA')),
            aplicarFiltroFilial(supabaseClient
                .from('escala')
                .select('motorista, auxiliar, data_escala')
                .in('data_escala', datasConsultaAtual)
                .eq('tipo_escala', 'RESERVA'))
        ]);

        if (resFuncionarios.error) throw resFuncionarios.error;
        if (resFaltasSemanaAtual.error) throw resFaltasSemanaAtual.error;
        if (resFaltasSemanaAnterior.error) throw resFaltasSemanaAnterior.error;
        if (resEscala.error) throw resEscala.error;
        if (resEscalaReserva.error) throw resEscalaReserva.error;

        const nomeDiariaMap = new Map();
        const funcionarioKeysMap = new Map();
        const filialSelecionada = getFilial();
        const funcionariosAtivos = (resFuncionarios.data || [])
            .filter(funcionario => isFuncionarioElegivelDiaria(funcionario, filialSelecionada));

        funcionariosAtivos.forEach(funcionario => {
            const nomeCurto = cleanImportValue(funcionario.nome) || cleanImportValue(funcionario.nome_completo);
            if (!nomeCurto) return;
            const keysFuncionario = getFuncionarioDiariaKeys(funcionario);
            const keyPrincipal = normalizeString(nomeCurto);
            if (keyPrincipal) funcionarioKeysMap.set(keyPrincipal, keysFuncionario);
            [funcionario.nome, funcionario.nome_completo].forEach(nome => {
                const key = normalizeString(nome);
                if (key) nomeDiariaMap.set(key, nomeCurto);
            });
        });

        const getNomeDiaria = (nome) => nomeDiariaMap.get(normalizeString(nome)) || cleanImportValue(nome);
        const getKeysDiaria = (nome) => {
            const nomeDiaria = getNomeDiaria(nome);
            const keyPrincipal = normalizeString(nomeDiaria);
            return funcionarioKeysMap.get(keyPrincipal) || getPessoaDiariaKeys(nome);
        };
        const funcionariosEscalados = new Set();
        const funcionariosReserva = new Set();

        (resEscala.data || []).forEach(row => {
            [row.motorista, row.auxiliar].forEach(nome => {
                getKeysDiaria(nome).forEach(key => funcionariosEscalados.add(key));
            });
        });

        (resEscalaReserva.data || []).forEach(row => {
            [row.motorista, row.auxiliar].forEach(nome => {
                getKeysDiaria(nome).forEach(key => funcionariosReserva.add(key));
            });
        });

        const ausencias = new Map();
        registrarAusenciasDiaria(resFaltasSemanaAtual.data, ausencias, getNomeDiaria, getKeysDiaria, isStatusAtualDiaria);
        registrarAusenciasDiaria(resFaltasSemanaAnterior.data, ausencias, getNomeDiaria, getKeysDiaria, isFaltaSemanaAnteriorDiaria);

        const funcionariosRestricao = new Set();
        (resFaltasSemanaAtual.data || []).forEach(row => {
            [
                { nome: row.motorista_ausente, motivo: row.motivo_motorista },
                { nome: row.auxiliar_ausente, motivo: row.motivo_auxiliar }
            ].forEach(item => {
                if (!isRestricaoDiaria(item.motivo)) return;
                const nome = getNomeDiaria(item.nome);
                if (!nome) return;
                getKeysDiaria(nome).forEach(key => funcionariosRestricao.add(key));
            });
        });

        const funcionarios = funcionariosAtivos
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
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum funcionario encontrado para a filial.</td></tr>';
            atualizarFiltroFuncaoDiaria();
            atualizarResumoDiaria();
            return;
        }

        diariaDadosAtual = funcionarios.map(funcionario => {
            const key = normalizeString(funcionario.nome);
            const keysFuncionario = getPessoaDiariaKeys(funcionario.nome, funcionario.nomeCompleto, funcionario.cpf);
            const ausencia = mergeAusenciasDiaria(keysFuncionario, ausencias);
            const temAusenciaReferencia = Boolean(ausencia);
            const estaEscalado = keysFuncionario.some(keyItem => funcionariosEscalados.has(keyItem));
            const estaEmReserva = !estaEscalado && keysFuncionario.some(keyItem => funcionariosReserva.has(keyItem));
            const estaEmRestricao = !estaEscalado && !estaEmReserva && keysFuncionario.some(keyItem => funcionariosRestricao.has(keyItem));
            const foraEscala = !temAusenciaReferencia && datasSemanaAtual.length > 0 && !estaEscalado && !estaEmReserva && !estaEmRestricao;
            const diasDesconto = ausencia ? Math.min(5, ausencia.dias.size) : 0;
            const descontoAnterior = 0;
            const datasFalta = ausencia ? [...ausencia.dias].sort().map(formatDataISOBR) : [];
            const motivosAusencia = ausencia ? [...ausencia.motivos] : [];
            if (foraEscala) motivosAusencia.unshift('FORA DA ESCALA');

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
                motivosAusencia,
                diasDesconto,
                descontoAnterior,
                valorPagar: 0,
                valorDesconto: 0,
                recebe: true,
                foraEscala,
                estaEmReserva,
                estaEmRestricao,
                pagarManual: !foraEscala,
                semanaReferencia
            }, valorSemana);
        });

        atualizarFiltroFuncaoDiaria();
        renderDiariaTabela();
    } catch (error) {
        console.error('Erro ao carregar diaria:', error);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#dc3545;">Erro ao carregar diaria.</td></tr>';
    }
}

function registrarAusenciasDiaria(rows, ausencias, getNomeDiaria, getKeysDiaria, deveRegistrarMotivo) {
    (rows || []).forEach(row => {
            [
                { nome: row.motorista_ausente, motivo: row.motivo_motorista },
                { nome: row.auxiliar_ausente, motivo: row.motivo_auxiliar }
            ].forEach(item => {
                const nome = getNomeDiaria(item.nome);
                if (!nome) return;
                const keys = getKeysDiaria(nome);
                const motivo = cleanImportValue(item.motivo) || 'FALTA';
                if (!deveRegistrarMotivo(motivo)) return;
                keys.forEach(key => {
                    if (!ausencias.has(key)) ausencias.set(key, { dias: new Set(), motivos: new Set() });
                    ausencias.get(key).dias.add(String(row.data_escala || '').slice(0, 10));
                    ausencias.get(key).motivos.add(motivo);
                });
            });
        });
}

function getPrimaryMotivoAusencia(motivosAusencia, diasDesconto) {
    if (!motivosAusencia || motivosAusencia.length === 0) {
        return diasDesconto > 0 ? 'FALTA' : '';
    }
    const priority = ['FERIAS', 'AFAST', 'INSS', 'AUSENTE', 'FALTA', 'FORA DA ESCALA'];
    for (const p of priority) {
        const found = motivosAusencia.find(m => normalizeString(m).includes(p));
        if (found) return normalizeString(found);
    }
    return normalizeString(motivosAusencia[0]) || 'FALTA';
}

function isStatusAtualDiaria(value) {
    const status = normalizeString(value);
    return status.includes('FERIAS') || status.includes('AFAST');
}

function isFaltaSemanaAnteriorDiaria(value) {
    return normalizeString(value).includes('FALTA');
}

function isRestricaoDiaria(value) {
    return normalizeString(value).includes('RESTR');
}

function getFuncionarioDiariaKeys(funcionario) {
    return getPessoaDiariaKeys(funcionario?.nome, funcionario?.nome_completo, funcionario?.cpf);
}

function getPessoaDiariaKeys(...values) {
    return [...new Set(values
        .map(value => normalizeString(value))
        .filter(Boolean))];
}

function mergeAusenciasDiaria(keys, ausenciasMap) {
    const matches = keys.map(key => ausenciasMap.get(key)).filter(Boolean);
    if (matches.length === 0) return null;

    const merged = { dias: new Set(), motivos: new Set() };
    matches.forEach(ausencia => {
        ausencia.dias.forEach(dia => merged.dias.add(dia));
        ausencia.motivos.forEach(motivo => merged.motivos.add(motivo));
    });
    return merged;
}

function recalcularItemDiaria(item, valorSemana) {
    const valorDia = valorSemana / 5;
    const statusCadastro = cleanImportValue(item.statusCadastro);
    const temStatusCadastroAusencia = statusCadastro && isStatusAusenciaDiaria(statusCadastro);
    const diasDesconto = Number(item.diasDesconto || 0);
    const descontoAnterior = Number(item.descontoAnterior || 0);
    // Bloqueio HARD: cadastro com ausencia ou 5+ dias de falta — checkbox desabilitado, nao pode pagar
    // Bloqueio SOFT: fora da escala — checkbox habilitado, usuario pode autorizar manualmente
    const bloqueioHard = temStatusCadastroAusencia || diasDesconto >= 5;
    const pagarManual = item.pagarManual !== false;
    const temAusenciaFaltas = (item.motivosAusencia && item.motivosAusencia.length > 0) || diasDesconto > 0;

    item.bloqueioStatus = bloqueioHard;
    item.recebe = !bloqueioHard && pagarManual;
    item.valorDesconto = Math.max(0, diasDesconto * valorDia);
    item.valorPagar = item.recebe ? Math.max(0, valorSemana - item.valorDesconto - descontoAnterior) : 0;

    if (bloqueioHard || !pagarManual) {
        if (temStatusCadastroAusencia) {
            item.status = statusCadastro;
            item.descricaoStatus = statusCadastro;
        } else if (temAusenciaFaltas) {
            item.status = getPrimaryMotivoAusencia(item.motivosAusencia, diasDesconto);
            const referencia = getReferenciaStatusDiaria(item.status);
            item.descricaoStatus = item.datasFalta.length
                ? `${item.status} ${referencia}: ${item.datasFalta.join(', ')}`
                : `Ausencia registrada ${referencia}: ${item.status}`;
        } else if (item.foraEscala) {
            item.status = 'FORA DA ESCALA';
            item.descricaoStatus = 'Funcionario nao localizado na escala da semana anterior.';
        } else if (item.estaEmReserva) {
            item.status = 'RESERVA';
            item.descricaoStatus = 'Pagamento de diaria desmarcado (em reserva na escala).';
        } else if (item.estaEmRestricao) {
            item.status = 'RESTRICAO';
            item.descricaoStatus = 'Pagamento de diaria desmarcado (restricao na escala).';
        } else {
            item.status = 'NAO PAGAR';
            item.descricaoStatus = 'Pagamento de diaria desmarcado.';
        }
    } else {
        if (diasDesconto > 0) {
            item.status = getPrimaryMotivoAusencia(item.motivosAusencia, diasDesconto);
            item.descricaoStatus = `Desconto ${getReferenciaStatusDiaria(item.status)} por ${item.motivosAusencia.length ? item.motivosAusencia.join(', ') : 'ausencia'}: ${item.datasFalta.join(', ')}`;
        } else if (item.foraEscala) {
            item.status = 'FORA DA ESCALA';
            item.descricaoStatus = 'Funcionario nao localizado na escala da semana anterior.';
        } else if (item.estaEmReserva) {
            item.status = 'RESERVA';
            item.descricaoStatus = 'Apto para receber diaria (em reserva na escala).';
        } else if (item.estaEmRestricao) {
            item.status = 'RESTRICAO';
            item.descricaoStatus = 'Apto para receber diaria (restricao na escala).';
        } else {
            item.status = 'APTO';
            item.descricaoStatus = 'Apto para receber diaria.';
        }
    }

    return item;
}

function getReferenciaStatusDiaria(status) {
    const normalized = normalizeString(status);
    if (normalized.includes('FALTA')) return 'da semana anterior';
    if (normalized.includes('FERIAS') || normalized.includes('AFAST')) return 'da semana atual';
    if (normalized.includes('FORA DA ESCALA')) return 'da semana atual';
    return 'da referencia da escala';
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
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum funcionario encontrado para os filtros selecionados.</td></tr>';
        atualizarResumoDiaria();
        return;
    }

    tbody.innerHTML = dadosOrdenados.map(item => {
        const temDescontoSemanaAnterior = Number(item.valorDesconto || 0) > 0 || Number(item.diasDesconto || 0) > 0;
        const statusClass = temDescontoSemanaAnterior ? 'bloqueado' : (item.recebe ? 'apto' : 'bloqueado');
        return `
        <tr data-nome="${escapeAttribute(item.nome)}" data-funcao="${escapeAttribute(item.funcao)}" data-status="${escapeAttribute(item.status)}">
            <td>${escapeAttribute(item.nome)}</td>
            <td>${escapeAttribute(item.nomeCompleto)}</td>
            <td>${escapeAttribute(item.cpf)}</td>
            <td>${escapeAttribute(item.funcao)}</td>
            <td style="text-align:center;"><input type="checkbox" class="diaria-pagar-toggle" data-diaria-key="${escapeAttribute(item.key)}" ${item.recebe ? 'checked' : ''} ${item.bloqueioStatus ? 'disabled' : ''} title="${item.bloqueioStatus ? 'Bloqueado por falta, afastamento, ferias ou fora da escala na semana anterior' : 'Marcar para pagar diaria'}"></td>
            <td><span class="diaria-status ${statusClass}" title="${escapeAttribute(item.descricaoStatus || item.status)}">${escapeAttribute(item.status)}</span></td>
            <td>${item.diasDesconto}</td>
            <td>${formatMoedaBR(item.valorPagar)}</td>
            <td class="${temDescontoSemanaAnterior ? 'diaria-desconto-alerta' : ''}">${formatMoedaBR(item.valorDesconto)}</td>
        </tr>
    `;
    }).join('');

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

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function getDiariaFuncoesSelecionadas() {
    const select = document.getElementById('diariaFiltroFuncao');
    if (!select) return [];
    return Array.from(select.selectedOptions).map(opt => normalizeString(opt.value)).filter(Boolean);
}

function getDiariaStatusSelecionados() {
    const select = document.getElementById('diariaFiltroStatus');
    if (!select) return [];
    return Array.from(select.selectedOptions).map(opt => normalizeString(opt.value)).filter(Boolean);
}

function getDiariaDadosExportacao() {
    const statusSelecionados = getDiariaStatusSelecionados();
    const funcoesSelecionadas = getDiariaFuncoesSelecionadas();
    const termoBusca = normalizeString(document.getElementById('diariaBuscaGrid')?.value || '');
    const dadosFiltrados = diariaDadosAtual.filter(item => {
        const statusItem = normalizeString(item.status);
        const statusOk = statusSelecionados.length === 0 || statusSelecionados.some(status => statusItem.includes(status));
        const funcaoOk = funcoesSelecionadas.length === 0 || funcoesSelecionadas.includes(normalizeString(item.funcao));
        const buscaOk = !termoBusca || [
            item.nomeCompleto,
            item.cpf,
            item.funcao
        ].some(valor => normalizeString(valor).includes(termoBusca));
        return statusOk && funcaoOk && buscaOk;
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

        registrarAuditoria('INCLUIR', 'Diária', `Registro de diária - Semana: ${semana}, Filial: ${getFilial()}`);
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
        [`Valor semanal: ${formatMoedaBR(resumo.valorSemana)}`, `Valor por dia: ${formatMoedaBR(resumo.valorDia)}`, `Total a pagar: ${formatMoedaBR(resumo.totalPagar)}`, `Desconto sem. anterior: ${formatMoedaBR(resumo.totalDesconto)}`],
        [],
        ['FUNCIONARIO', 'NOME COMPLETO', 'CPF', 'FUNCAO', 'PAGAR', 'STATUS', 'DESCRICAO', 'DIAS DESC.', 'VALOR A PAGAR', 'DESC. SEM. ANTERIOR'],
        ...dados.map(item => [
            item.nome,
            item.nomeCompleto,
            item.cpf,
            item.funcao,
            item.recebe ? 'SIM' : 'NAO',
            item.status,
            item.descricaoStatus,
            item.diasDesconto,
            item.valorPagar,
            item.valorDesconto
        ])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
        { wch: 24 }, { wch: 34 }, { wch: 16 }, { wch: 30 }, { wch: 10 },
        { wch: 18 }, { wch: 42 }, { wch: 12 }, { wch: 16 }, { wch: 18 }
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
    doc.text(`Valor semanal: ${formatMoedaBR(resumo.valorSemana)} | Valor por dia: ${formatMoedaBR(resumo.valorDia)} | Total a pagar: ${formatMoedaBR(resumo.totalPagar)} | Desconto sem. anterior: ${formatMoedaBR(resumo.totalDesconto)}`, 14, 21);

    doc.autoTable({
        startY: 27,
        head: [['FUNCIONARIO', 'NOME COMPLETO', 'CPF', 'FUNCAO', 'PAGAR', 'STATUS', 'DESCRICAO', 'DIAS DESC.', 'VALOR A PAGAR', 'DESC. SEM. ANTERIOR']],
        body: dados.map(item => [
            item.nome,
            item.nomeCompleto,
            item.cpf,
            item.funcao,
            item.recebe ? 'SIM' : 'NAO',
            item.status,
            item.descricaoStatus,
            item.diasDesconto,
            formatMoedaBR(item.valorPagar),
            formatMoedaBR(item.valorDesconto)
        ]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [0, 105, 55] },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 36 },
            3: { cellWidth: 34 },
            5: { cellWidth: 23 },
            6: { cellWidth: 48 }
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
        || status.includes('FORA DA ESCALA')
        || status.includes('FERIAS')
        || status.includes('AFAST')
        || status.includes('AUSENTE')
        || status.includes('INSS');
}

function isFuncionarioAtivoDiaria(status) {
    return normalizeString(status) === 'ATIVO';
}

function isFuncionarioElegivelDiaria(funcionario, filial) {
    if (!funcionario || !isFuncionarioAtivoDiaria(funcionario.status)) return false;
    const filialSelecionada = normalizeString(filial);
    if (!filialSelecionada) return true;
    return normalizeString(funcionario.filial) === filialSelecionada;
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

function formatNumeroMoedaInput(value) {
    return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDataISOBR(dataISO) {
    const value = String(dataISO || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
}

function formatDataHoraBR(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeAttribute(value);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
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
