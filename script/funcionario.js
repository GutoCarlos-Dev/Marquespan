import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const FUNCIONARIO_PAGE_ID = 'funcionario.html';
const FUNCIONARIO_PAGE_SIZE = 1000;
const FUNCIONARIO_DOCUMENTOS_BUCKET = 'funcionario_documentos';
const FUNCOES_FALLBACK = [
    'Jovem Aprendiz',
    'Auxiliar de Expedição',
    'Auxiliar de Expedição Noturno',
    'Auxiliar de Transporte',
    'Auxiliar de Logistica',
    'Auxiliar de Logistica ADM',
    'Conferente Noturno',
    'Encarregado Operacional',
    'Encarregado Operacional Noturno',
    'Gerente Operacional',
    'Líder Logística',
    'Líder Logística Noturno',
    'Líder Expedição Noturno',
    'Motorista',
    'Motorista Patio',
    'Motorista Patio Noturno',
    'Motorista Carreta',
    'Motorista Carreta Noturno',
    'Motorista Bitrem',
    'Motorista Munck'
];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function statusClass(status) {
    return String(status || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]/g, '-');
}

function maskCPF(value) {
    let v = value.replace(/[^0-9Xx]/g, '').toUpperCase().slice(0, 11);
    if (v.length > 9) return v.slice(0,3) + '.' + v.slice(3,6) + '.' + v.slice(6,9) + '-' + v.slice(9);
    if (v.length > 6) return v.slice(0,3) + '.' + v.slice(3,6) + '.' + v.slice(6);
    if (v.length > 3) return v.slice(0,3) + '.' + v.slice(3);
    return v;
}

function maskPhone(value) {
    let v = value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) return '(' + v.slice(0,2) + ')' + v.slice(2,7) + '-' + v.slice(7);
    if (v.length > 6)  return '(' + v.slice(0,2) + ')' + v.slice(2,6) + '-' + v.slice(6);
    if (v.length > 2)  return '(' + v.slice(0,2) + ')' + v.slice(2);
    if (v.length > 0)  return '(' + v;
    return v;
}

function formatDateBR(value) {
    return value ? new Date(value + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
}

function isDateBeforeToday(value) {
    if (!value) return false;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    return String(value).slice(0, 10) < today;
}

function normalizeImportKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
}

function cleanImportText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeImportRow(row) {
    const normalized = {};
    Object.entries(row || {}).forEach(([key, value]) => {
        normalized[normalizeImportKey(key)] = value;
    });
    return normalized;
}

function getImportValue(row, keys) {
    for (const key of keys) {
        const value = row[normalizeImportKey(key)];
        if (value !== null && value !== undefined && String(value).trim() !== '') return value;
    }
    return '';
}

function parseImportDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    }
    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
            const month = String(parsed.m).padStart(2, '0');
            const day = String(parsed.d).padStart(2, '0');
            return `${parsed.y}-${month}-${day}`;
        }
    }
    const text = cleanImportText(value);
    if (!text) return null;
    const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    return null;
}

function parseImportBoolean(value, defaultValue = true) {
    const text = normalizeImportKey(value);
    if (!text) return defaultValue;
    if (['SIM', 'S', 'TRUE', 'VERDADEIRO', '1', 'YES'].includes(text)) return true;
    if (['NAO', 'N', 'FALSE', 'FALSO', '0', 'NO'].includes(text)) return false;
    return defaultValue;
}

function lerFuncionarioXlsx(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
            reject(new Error('Biblioteca XLSX nao carregada.'));
            return;
        }

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                resolve(rows.map(normalizeImportRow));
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'));
        reader.readAsArrayBuffer(file);
    });
}

function baixarRelatorioImportacaoFuncionario(linhas) {
    const blob = new Blob([linhas.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_importacao_funcionarios_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

const FuncionarioUI = {
    currentFuncaoBeforeEdit: null,
    sortConfig: { column: 'nome', direction: 'asc' }, // Estado inicial da ordenação
    listData: [], // Armazena os dados atuais da grid para exportação
    usuarioAtual: null,
    isAdministrador: false,
    isGerencia: false,
    isLiderBalanca: false,
    acessoTotal: false,
    funcoesFiltroDisponiveis: [],
    async init() {
        this.cache();
        const acessoPermitido = await this.verificarPermissaoPagina();
        if (!acessoPermitido) return;
        this.aplicarPermissoesAcesso();
        this.bind();
        await this.carregarFiliais();
        await this.carregarFuncoes();
        this.renderGrid();
    },

    cache() {
        this.form = document.getElementById('formCadastrarFuncionario');
        this.modalFuncionario = document.getElementById('modalFuncionario');
        this.btnOpenFuncionarioModal = document.getElementById('btnOpenFuncionarioModal');
        this.btnCloseFuncionarioModal = document.getElementById('btnCloseFuncionarioModal');
        this.btnAbrirCadastroFuncao = document.getElementById('btnAbrirCadastroFuncao');
        this.modalCadastroFuncao = document.getElementById('modalCadastroFuncao');
        this.formCadastroFuncao = document.getElementById('formCadastroFuncao');
        this.cadFuncaoId = document.getElementById('cadFuncaoId');
        this.btnSalvarCadastroFuncao = document.getElementById('btnSalvarCadastroFuncao');
        this.btnCloseCadastroFuncao = document.getElementById('btnCloseCadastroFuncao');
        this.btnCancelarCadastroFuncao = document.getElementById('btnCancelarCadastroFuncao');
        this.tbodyFuncoesCadastradas = document.getElementById('tbodyFuncoesCadastradas');
        this.tableBody = document.getElementById('funcTableBody');
        this.btnSubmit = document.getElementById('btnSubmitFunc');
        this.btnClearForm = document.getElementById('btnClearFuncForm');
        this.searchInput = document.getElementById('searchFuncInput');
        this.editingIdInput = document.getElementById('funcEditingId');
        this.statusSelect = document.getElementById('funcStatus');
        this.groupDesligamento = document.getElementById('groupDesligamento');
        this.histFuncContainer = document.getElementById('historicoFuncaoContainer');
        this.histFuncTableBody = document.getElementById('histFuncTableBody');
        this.statusFilterDisplay = document.getElementById('statusFilterDisplay');
        this.statusFilterOptions = document.getElementById('statusFilterOptions');
        this.statusFilterText = document.getElementById('statusFilterText');
        this.funcaoFilterDisplay = document.getElementById('funcaoFilterDisplay');
        this.funcaoFilterOptions = document.getElementById('funcaoFilterOptions');
        this.funcaoFilterText = document.getElementById('funcaoFilterText');
        this.funcaoFilterList = document.getElementById('funcaoFilterList');
        this.btnLimparFuncaoFilter = document.getElementById('btnLimparFuncaoFilter');
        this.monthFilter = document.getElementById('monthFilter');
        this.admissaoMonthYearFilter = document.getElementById('admissaoMonthYearFilter');
        this.demissaoMonthYearFilter = document.getElementById('demissaoMonthYearFilter');
        this.cnhVencFilter = document.getElementById('cnhVencFilter');
        this.tipoEscalaFilter = document.getElementById('tipoEscalaFilter');
        this.equipeEscalaFilter = document.getElementById('equipeEscalaFilter');
        this.filialSelect = document.getElementById('funcFilial');
        this.filialFilter = document.getElementById('filialFilter');
        this.funcaoSelect = document.getElementById('funcFuncao');
        this.btnExportXLSX = document.getElementById('btnExportXLSX');
        this.btnExportPDF = document.getElementById('btnExportPDF');
        this.btnDownloadModeloImportacao = document.getElementById('btnDownloadModeloImportacao');
        this.btnImportXLSX = document.getElementById('btnImportXLSX');
        this.fileImportFuncionarioXLSX = document.getElementById('fileImportFuncionarioXLSX');
        this.diariaSelect = document.getElementById('funcDiaria');
        this.escalaAtivaSelect = document.getElementById('funcEscalaAtiva');
        this.tipoEscalaSelect = document.getElementById('funcTipoEscala');
        this.equipeEscalaSelect = document.getElementById('funcEquipeEscala');
        this.funcDocumentosInput = document.getElementById('funcDocumentos');
        this.funcDocumentosList = document.getElementById('funcDocumentosList');
        this.funcDocumentosHint = document.getElementById('funcDocumentosHint');
        this.funcSummaryBody = document.getElementById('funcSummaryBody'); // Novo cache para o corpo da tabela de resumo
        this.gridCount = document.getElementById('countFuncGrid');
        this.filterCount = document.getElementById('funcFilterCount');
    },

    usuarioTemAcessoTotal() {
        return this.isAdministrador || this.isGerencia || this.isGerenciaTmg || this.isLiderBalanca;
    },

    aplicarPermissoesAcesso() {
        this.acessoTotal = this.usuarioTemAcessoTotal();
        document.body.classList.toggle('funcionario-acesso-total', this.acessoTotal);
        document.body.classList.toggle('funcionario-somente-leitura', !this.acessoTotal);

        if (this.acessoTotal) return;

        [
            this.btnOpenFuncionarioModal,
            this.btnDownloadModeloImportacao,
            this.btnImportXLSX,
            this.btnAbrirCadastroFuncao,
            this.btnSubmit,
            this.btnSalvarCadastroFuncao
        ].forEach(el => {
            if (el) el.style.display = 'none';
        });

        if (this.funcDocumentosInput) this.funcDocumentosInput.disabled = true;
    },

    // Adiciona o campo Data de Nascimento ao cache
    bind() {
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
        if (this.btnOpenFuncionarioModal) {
            this.btnOpenFuncionarioModal.addEventListener('click', () => {
                if (!this.acessoTotal) return;
                this.clearForm({ fecharModal: false });
                this.openFuncionarioModal();
            });
        }
        if (this.btnCloseFuncionarioModal) {
            this.btnCloseFuncionarioModal.addEventListener('click', () => this.clearForm());
        }
        if (this.modalFuncionario) {
            this.modalFuncionario.addEventListener('click', (event) => {
                if (event.target === this.modalFuncionario) this.clearForm();
            });
        }
        if (this.btnClearForm) {
            this.btnClearForm.addEventListener('click', () => this.clearForm());
        }
        if (this.btnAbrirCadastroFuncao) {
            this.btnAbrirCadastroFuncao.addEventListener('click', () => {
                if (!this.acessoTotal) return;
                this.openCadastroFuncaoModal();
            });
        }
        if (this.formCadastroFuncao) {
            this.formCadastroFuncao.addEventListener('submit', (e) => this.handleCadastroFuncaoSubmit(e));
        }
        if (this.btnCloseCadastroFuncao) {
            this.btnCloseCadastroFuncao.addEventListener('click', () => this.closeCadastroFuncaoModal());
        }
        if (this.btnCancelarCadastroFuncao) {
            this.btnCancelarCadastroFuncao.addEventListener('click', () => {
                this.resetCadastroFuncaoForm();
                this.closeCadastroFuncaoModal();
            });
        }
        if (this.modalCadastroFuncao) {
            this.modalCadastroFuncao.addEventListener('click', (event) => {
                if (event.target === this.modalCadastroFuncao) this.closeCadastroFuncaoModal();
            });
        }
        if (this.tbodyFuncoesCadastradas) {
            this.tbodyFuncoesCadastradas.addEventListener('click', (event) => {
                const editButton = event.target.closest('.btn-edit-funcao');
                const deleteButton = event.target.closest('.btn-delete-funcao');
                if (!this.acessoTotal && (editButton || deleteButton)) return;
                if (editButton) {
                    this.prepararEdicaoFuncao(editButton.dataset);
                    return;
                }
                if (deleteButton) {
                    this.deleteFuncao(deleteButton.dataset);
                }
            });
        }
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.renderGrid());
        }
        if (this.monthFilter) {
            this.monthFilter.addEventListener('change', () => this.renderGrid());
        }
        if (this.admissaoMonthYearFilter) {
            this.admissaoMonthYearFilter.addEventListener('change', () => this.renderGrid());
        }
        if (this.demissaoMonthYearFilter) {
            this.demissaoMonthYearFilter.addEventListener('change', () => this.renderGrid());
        }
        if (this.cnhVencFilter) {
            this.cnhVencFilter.addEventListener('change', () => this.renderGrid());
        }
        if (this.tipoEscalaFilter) {
            this.tipoEscalaFilter.addEventListener('change', () => this.renderGrid());
        }
        if (this.equipeEscalaFilter) {
            this.equipeEscalaFilter.addEventListener('change', () => this.renderGrid());
        }
        if (this.filialFilter) {
            this.filialFilter.addEventListener('change', () => this.renderGrid());
        }
        if (this.statusSelect) {
            this.statusSelect.addEventListener('change', () => this.toggleDesligamentoField());
        }
        if (this.histFuncTableBody) {
            this.histFuncTableBody.addEventListener('dblclick', (e) => this.handleHistoricoDblClick(e));
        }
        if (this.funcDocumentosInput) {
            this.funcDocumentosInput.addEventListener('change', () => this.renderDocumentosSelecionados());
        }
        if (this.funcDocumentosList) {
            this.funcDocumentosList.addEventListener('click', (event) => {
                const downloadButton = event.target.closest('.btn-download-documento');
                const deleteButton = event.target.closest('.btn-delete-documento');

                if (downloadButton?.dataset.id) this.baixarDocumentoFuncionario(downloadButton.dataset.id);
                if (deleteButton?.dataset.id) this.excluirDocumentoFuncionario(deleteButton.dataset.id);
            });
        }
        
        if (this.btnExportXLSX) {
            this.btnExportXLSX.addEventListener('click', () => this.exportToXLSX());
        }
        if (this.btnExportPDF) {
            this.btnExportPDF.addEventListener('click', () => this.exportToPDF());
        }
        if (this.btnDownloadModeloImportacao) {
            this.btnDownloadModeloImportacao.addEventListener('click', () => {
                if (!this.acessoTotal) return;
                this.downloadModeloImportacao();
            });
        }
        if (this.btnImportXLSX && this.fileImportFuncionarioXLSX) {
            this.btnImportXLSX.addEventListener('click', () => {
                if (!this.acessoTotal) return;
                this.fileImportFuncionarioXLSX.click();
            });
            this.fileImportFuncionarioXLSX.addEventListener('change', event => {
                if (!this.acessoTotal) return;
                this.importFromXLSX(event);
            });
        }
        
        // Listeners para o filtro de status
        if (this.statusFilterDisplay) {
            this.statusFilterDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                this.statusFilterOptions.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!this.statusFilterDisplay.contains(e.target) && !this.statusFilterOptions.contains(e.target)) {
                    this.statusFilterOptions.classList.add('hidden');
                }
            });
            this.statusFilterOptions.querySelectorAll('.status-checkbox').forEach(cb => {
                cb.addEventListener('change', () => {
                    this.updateStatusFilterText();
                    this.renderGrid();
                });
            });
        }

        // Listeners para ordenação da tabela principal
        if (this.funcaoFilterDisplay && this.funcaoFilterOptions) {
            this.funcaoFilterDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                this.funcaoFilterOptions.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!this.funcaoFilterDisplay.contains(e.target) && !this.funcaoFilterOptions.contains(e.target)) {
                    this.funcaoFilterOptions.classList.add('hidden');
                }
            });
        }

        if (this.funcaoFilterList) {
            this.funcaoFilterList.addEventListener('change', (event) => {
                if (!event.target.classList.contains('funcao-filter-checkbox')) return;
                this.updateFuncaoFilterText();
                this.renderGrid();
            });
        }

        if (this.btnLimparFuncaoFilter) {
            this.btnLimparFuncaoFilter.addEventListener('click', () => {
                this.clearFuncaoFilter();
                this.renderGrid();
            });
        }

        document.querySelectorAll('#sectionCadastrarFuncionarios .data-grid thead th[data-sort]').forEach(th => {
            const column = th.dataset.sort;
            th.addEventListener('click', () => this.handleSort(column));
        });

        if (this.tableBody) {
            this.tableBody.addEventListener('click', (event) => {
                const viewButton = event.target.closest('.btn-view');
                const editButton = event.target.closest('.btn-edit');
                const deleteButton = event.target.closest('.btn-delete');

                // Visualizar funciona para qualquer usuario com acesso a pagina, mesmo em modo
                // somente-leitura - so Editar/Excluir continuam exigindo acesso total.
                if (viewButton?.dataset.id) this.loadForViewing(viewButton.dataset.id);
                if (!this.acessoTotal && (editButton || deleteButton)) return;
                if (editButton?.dataset.id) this.loadForEditing(editButton.dataset.id);
                if (deleteButton?.dataset.id) this.deleteFuncionario(deleteButton.dataset.id);
            });
        }

        // Máscaras de formatação
        const cpfInput = document.getElementById('funcCPF');
        if (cpfInput) {
            cpfInput.addEventListener('input', () => { cpfInput.value = maskCPF(cpfInput.value); });
        }
        const contatoCorp = document.getElementById('funcContatoCorp');
        if (contatoCorp) {
            contatoCorp.addEventListener('input', () => { contatoCorp.value = maskPhone(contatoCorp.value); });
        }
        const contatoPessoal = document.getElementById('funcContatoPessoal');
        if (contatoPessoal) {
            contatoPessoal.addEventListener('input', () => { contatoPessoal.value = maskPhone(contatoPessoal.value); });
        }
    },

    async verificarPermissaoPagina() {
        this.usuarioAtual = JSON.parse(localStorage.getItem('usuarioLogado'));
        const nivel = this.usuarioAtual?.nivel?.toLowerCase();
        this.isAdministrador = nivel === 'administrador';
        this.isGerencia = nivel === 'gerencia';
        this.isGerenciaTmg = nivel === 'gerencia_tmg';
        this.isLiderBalanca = nivel === 'lider_balanca';
        this.acessoTotal = this.usuarioTemAcessoTotal();

        if (!nivel) {
            window.location.href = 'index.html';
            return false;
        }

        if (this.acessoTotal) return true;

        try {
            const { data, error } = await supabaseClient
                .from('nivel_permissoes')
                .select('paginas_permitidas')
                .eq('nivel', nivel)
                .single();

            if (error) throw error;

            const paginasPermitidas = data?.paginas_permitidas || [];
            if (paginasPermitidas.includes(FUNCIONARIO_PAGE_ID)) return true;
        } catch (error) {
            console.error('Erro ao validar permissao da pagina de funcionarios:', error);
        }

        document.body.innerHTML = '<div style="text-align: center; padding: 50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
        return false;
    },

    getFilialUsuarioRestrita() {
        if (this.usuarioTemAcessoGlobal()) return '';
        return String(this.usuarioAtual?.filial || '').trim();
    },

    usuarioTemAcessoGlobal() {
        return this.isAdministrador || this.isGerencia || this.isLiderBalanca || !String(this.usuarioAtual?.filial || '').trim();
    },

    usuarioPodeAcessarFilial(filial) {
        const filialRestrita = this.getFilialUsuarioRestrita();
        if (!filialRestrita) return this.usuarioTemAcessoGlobal();
        return String(filial || '').trim().toUpperCase() === filialRestrita.toUpperCase();
    },

    aplicarFiltroFilialRestrita(query) {
        const filialRestrita = this.getFilialUsuarioRestrita();
        return filialRestrita ? query.eq('filial', filialRestrita) : query;
    },

    bloquearSeSemFilialUsuario() {
        if (this.usuarioTemAcessoGlobal() || this.getFilialUsuarioRestrita()) return false;
        alert('Seu usuario nao possui filial definida. Solicite o ajuste do cadastro para acessar funcionarios.');
        return true;
    },

    updateStatusFilterText() {
        const checked = Array.from(this.statusFilterOptions.querySelectorAll('.status-checkbox:checked'));
        if (checked.length === 0) {
            this.statusFilterText.textContent = 'Nenhum';
        } else if (checked.length === 5) {
            this.statusFilterText.textContent = 'Todos';
        } else if (checked.length <= 2) {
            this.statusFilterText.textContent = checked.map(cb => cb.parentElement.textContent.trim()).join(', ');
        } else {
            this.statusFilterText.textContent = `${checked.length} selecionados`;
        }
    },

    openFuncionarioModal(somenteLeitura = false) {
        if (!somenteLeitura) {
            if (!this.acessoTotal) return;
            if (this.bloquearSeSemFilialUsuario()) return;
        }
        if (!this.modalFuncionario) return;
        this.modalFuncionario.classList.remove('hidden');
        document.body.classList.add('funcionario-modal-open');
        if (!somenteLeitura) setTimeout(() => document.getElementById('funcRH')?.focus(), 0);
    },

    closeFuncionarioModal() {
        if (!this.modalFuncionario) return;
        this.modalFuncionario.classList.add('hidden');
        if (this.modalCadastroFuncao?.classList.contains('hidden')) {
            document.body.classList.remove('funcionario-modal-open');
        }
    },

    async openCadastroFuncaoModal() {
        if (!this.acessoTotal) return;
        if (!this.modalCadastroFuncao) return;
        this.resetCadastroFuncaoForm();
        this.modalCadastroFuncao.classList.remove('hidden');
        document.body.classList.add('funcionario-modal-open');
        if (this.tbodyFuncoesCadastradas) {
            this.tbodyFuncoesCadastradas.innerHTML = '<tr><td colspan="2" style="text-align:center;">Carregando funções...</td></tr>';
        }
        await this.carregarFuncoes(this.funcaoSelect?.value || '');
        setTimeout(() => document.getElementById('cadFuncaoNome')?.focus(), 0);
    },

    closeCadastroFuncaoModal() {
        if (!this.modalCadastroFuncao) return;
        this.modalCadastroFuncao.classList.add('hidden');
        if (this.modalFuncionario?.classList.contains('hidden')) {
            document.body.classList.remove('funcionario-modal-open');
        }
    },

    resetCadastroFuncaoForm() {
        this.formCadastroFuncao?.reset();
        if (this.cadFuncaoId) this.cadFuncaoId.value = '';
        if (this.btnSalvarCadastroFuncao) {
            this.btnSalvarCadastroFuncao.innerHTML = '<i class="fas fa-save"></i> Salvar Função';
        }
    },

    async carregarFuncoes(selectedValue = '') {
        const atual = selectedValue || this.funcaoSelect?.value || '';

        try {
            const { data, error } = await supabaseClient
                .from('funcionario_funcoes')
                .select('id, nome, ativo')
                .order('nome');

            if (error) throw error;

            const funcoes = (data || []).filter(funcao => funcao.ativo !== false);
            const nomes = funcoes.map(funcao => funcao.nome).filter(Boolean);
            this.preencherSelectFuncoes(nomes.length ? nomes : FUNCOES_FALLBACK, atual);
            this.preencherFiltroFuncoes(nomes.length ? nomes : FUNCOES_FALLBACK);
            this.renderFuncoesGrid(funcoes.length ? funcoes : this.getFuncoesFallbackGrid());
        } catch (error) {
            console.warn('Erro ao carregar cadastro de funcoes:', error);
            this.preencherSelectFuncoes(FUNCOES_FALLBACK, atual);
            this.preencherFiltroFuncoes(FUNCOES_FALLBACK);
            this.renderFuncoesGrid(this.getFuncoesFallbackGrid());
        }
    },

    getFuncoesFallbackGrid() {
        const opcoesSelect = Array.from(this.funcaoSelect?.options || [])
            .map(option => option.value)
            .filter(Boolean);
        const nomes = opcoesSelect.length ? opcoesSelect : FUNCOES_FALLBACK;
        return nomes.map(nome => ({ nome }));
    },

    renderFuncoesGrid(funcoes) {
        if (!this.tbodyFuncoesCadastradas) return;

        if (!funcoes || funcoes.length === 0) {
            this.tbodyFuncoesCadastradas.innerHTML = '<tr><td colspan="2" style="text-align:center;">Nenhuma função cadastrada.</td></tr>';
            return;
        }

        this.tbodyFuncoesCadastradas.innerHTML = funcoes
            .slice()
            .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
            .map(funcao => {
                return `
                    <tr>
                        <td>${escapeHtml(funcao.nome)}</td>
                        <td>
                            <button type="button"
                                class="btn-icon edit btn-edit-funcao"
                                title="Editar função"
                                data-id="${escapeHtml(funcao.id || '')}"
                                data-nome="${escapeHtml(funcao.nome || '')}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button type="button"
                                class="btn-icon delete btn-delete-funcao"
                                title="Excluir função"
                                data-id="${escapeHtml(funcao.id || '')}"
                                data-nome="${escapeHtml(funcao.nome || '')}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            })
            .join('');
    },

    prepararEdicaoFuncao(dataset) {
        if (!this.acessoTotal) return;
        if (this.cadFuncaoId) this.cadFuncaoId.value = dataset.id || '';
        const nomeInput = document.getElementById('cadFuncaoNome');
        if (nomeInput) nomeInput.value = dataset.nome || '';
        if (this.btnSalvarCadastroFuncao) {
            this.btnSalvarCadastroFuncao.innerHTML = '<i class="fas fa-save"></i> Atualizar Função';
        }
        nomeInput?.focus();
    },

    async deleteFuncao(dataset) {
        if (!this.acessoTotal) return;
        const id = dataset.id || '';
        const nome = dataset.nome || '';

        if (!id) {
            alert('Esta função ainda não está salva no cadastro e não pode ser excluída.');
            return;
        }

        if (!nome) {
            alert('Não foi possível identificar a função para exclusão.');
            return;
        }

        try {
            const funcionariosVinculados = await this.buscarFuncionariosPaginado({
                select: 'rh_registro, nome, filial, funcao',
                applyFilters: (query) => query.eq('funcao', nome)
            });

            if (funcionariosVinculados.length > 0) {
                const linhas = funcionariosVinculados
                    .slice(0, 20)
                    .map(funcionario => `RH ${funcionario.rh_registro || '-'} - ${funcionario.nome || '-'} (${funcionario.filial || 'SP'})`)
                    .join('\n');
                const restante = funcionariosVinculados.length > 20
                    ? `\n... e mais ${funcionariosVinculados.length - 20} colaborador(es).`
                    : '';

                alert(`Não foi possível excluir a função "${nome}".\n\nEla está configurada nos seguintes colaboradores:\n${linhas}${restante}\n\nRemova ou altere a função desses colaboradores antes de excluir.`);
                return;
            }

            if (!confirm(`Deseja realmente excluir a função "${nome}"?`)) return;

            const { error } = await supabaseClient
                .from('funcionario_funcoes')
                .delete()
                .eq('id', id);

            if (error) throw error;

            if (this.cadFuncaoId?.value === id) {
                this.resetCadastroFuncaoForm();
            }

            await this.carregarFuncoes('');
            alert('Função excluída com sucesso!');
        } catch (error) {
            console.error('Erro ao excluir função:', error);
            alert('Erro ao excluir função: ' + (error.message || error));
        }
    },

    preencherSelectFuncoes(funcoes, selectedValue = '') {
        if (!this.funcaoSelect) return;

        const nomes = [];
        const vistos = new Set();
        funcoes.forEach(funcao => {
            const nome = String(funcao || '').trim();
            const key = nome.toUpperCase();
            if (!nome || vistos.has(key)) return;
            vistos.add(key);
            nomes.push(nome);
        });

        if (selectedValue && !vistos.has(String(selectedValue).toUpperCase())) {
            nomes.push(selectedValue);
        }

        this.funcaoSelect.innerHTML = '<option value="" disabled>-- Selecione --</option>' + nomes
            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
            .map(nome => `<option value="${escapeHtml(nome)}">${escapeHtml(nome)}</option>`)
            .join('');

        this.funcaoSelect.value = selectedValue || '';
    },

    preencherFiltroFuncoes(funcoes) {
        if (!this.funcaoFilterList) return;

        const selecionadas = new Set(this.getFuncoesFiltroSelecionadas());
        const nomes = [];
        const vistos = new Set();

        funcoes.forEach(funcao => {
            const nome = String(funcao || '').trim();
            const key = nome.toUpperCase();
            if (!nome || vistos.has(key)) return;
            vistos.add(key);
            nomes.push(nome);
        });

        this.funcoesFiltroDisponiveis = nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
        this.funcaoFilterList.innerHTML = this.funcoesFiltroDisponiveis
            .map(nome => {
                const checked = selecionadas.has(nome) ? 'checked' : '';
                return `
                    <label class="dropdown-item">
                        <input type="checkbox" class="funcao-filter-checkbox" value="${escapeHtml(nome)}" ${checked}>
                        ${escapeHtml(nome)}
                    </label>
                `;
            })
            .join('');

        this.updateFuncaoFilterText();
    },

    getFuncoesFiltroSelecionadas() {
        return Array.from(this.funcaoFilterList?.querySelectorAll('.funcao-filter-checkbox:checked') || [])
            .map(cb => cb.value);
    },

    updateFuncaoFilterText() {
        if (!this.funcaoFilterText) return;
        const selecionadas = this.getFuncoesFiltroSelecionadas();

        if (selecionadas.length === 0) {
            this.funcaoFilterText.textContent = 'Todas';
        } else if (selecionadas.length === 1) {
            this.funcaoFilterText.textContent = selecionadas[0];
        } else {
            this.funcaoFilterText.textContent = `${selecionadas.length} selecionadas`;
        }
    },

    clearFuncaoFilter() {
        this.funcaoFilterList?.querySelectorAll('.funcao-filter-checkbox:checked').forEach(cb => {
            cb.checked = false;
        });
        this.updateFuncaoFilterText();
    },

    async handleCadastroFuncaoSubmit(e) {
        e.preventDefault();
        if (!this.acessoTotal) return;

        const nome = document.getElementById('cadFuncaoNome')?.value.trim();
        const id = this.cadFuncaoId?.value || '';

        if (!nome) return alert('Informe o nome da função.');
        try {
            const payload = {
                nome,
                ativo: true
            };

            const request = id
                ? supabaseClient.from('funcionario_funcoes').update(payload).eq('id', id)
                : supabaseClient.from('funcionario_funcoes').upsert(payload, { onConflict: 'nome' });

            const { error } = await request;

            if (error) throw error;

            await this.carregarFuncoes(nome);
            this.resetCadastroFuncaoForm();
            alert(id ? 'Função atualizada com sucesso!' : 'Função cadastrada com sucesso!');
        } catch (error) {
            console.error('Erro ao cadastrar função:', error);
            alert('Erro ao cadastrar função: ' + (error.message || error));
        }
    },

    async carregarFiliais() {
        const opcoesPadrao = [{ value: 'SP', label: 'SP' }];

        try {
            const { data, error } = await supabaseClient
                .from('filiais')
                .select('nome, sigla')
                .order('nome');

            if (error) throw error;

            const opcoes = (data || [])
                .map(filial => ({
                    value: (filial.sigla || filial.nome || '').trim(),
                    label: filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome
                }))
                .filter(filial => filial.value);

            this.preencherSelectFiliais(opcoes.length ? opcoes : opcoesPadrao);
        } catch (error) {
            console.warn('Erro ao carregar filiais para funcionarios:', error);
            this.preencherSelectFiliais(opcoesPadrao);
        }
    },

    preencherSelectFiliais(opcoes) {
        const filialRestrita = this.getFilialUsuarioRestrita();
        const filialPadrao = filialRestrita || this.usuarioAtual?.filial || 'SP';
        const unicas = [];
        const vistos = new Set();

        opcoes.forEach(opcao => {
            const value = String(opcao.value || '').trim();
            if (!value || vistos.has(value)) return;
            vistos.add(value);
            unicas.push({ value, label: opcao.label || value });
        });

        if (filialRestrita && !vistos.has(filialRestrita)) {
            unicas.unshift({ value: filialRestrita, label: filialRestrita });
            vistos.add(filialRestrita);
        }
        if (!filialRestrita && !vistos.has('SP')) unicas.unshift({ value: 'SP', label: 'SP' });

        if (this.filialSelect) {
            this.filialSelect.innerHTML = unicas
                .map(opcao => `<option value="${escapeHtml(opcao.value)}">${escapeHtml(opcao.label)}</option>`)
                .join('');
            this.filialSelect.value = vistos.has(filialPadrao) ? filialPadrao : 'SP';
            this.filialSelect.disabled = Boolean(filialRestrita);
        }

        if (this.filialFilter) {
            this.filialFilter.innerHTML = (filialRestrita ? '' : '<option value="">Todas</option>') + unicas
                .filter(opcao => !filialRestrita || String(opcao.value).toUpperCase() === filialRestrita.toUpperCase())
                .map(opcao => `<option value="${escapeHtml(opcao.value)}">${escapeHtml(opcao.label)}</option>`)
                .join('');
            this.filialFilter.value = filialRestrita && vistos.has(filialPadrao) ? filialPadrao : '';
            this.filialFilter.disabled = Boolean(filialRestrita);
        }
    },

    toggleDesligamentoField() {
        if (this.statusSelect.value === 'Desligado' || this.statusSelect.value === 'Transferido') {
            this.groupDesligamento.classList.remove('hidden');
        } else {
            this.groupDesligamento.classList.add('hidden');
            document.getElementById('funcDesligamento').value = '';
        }
    },

    getDocumentosSelecionados() {
        return Array.from(this.funcDocumentosInput?.files || []);
    },

    formatarTamanhoArquivo(bytes) {
        const tamanho = Number(bytes || 0);
        if (tamanho < 1024) return `${tamanho} B`;
        if (tamanho < 1024 * 1024) return `${(tamanho / 1024).toFixed(1)} KB`;
        return `${(tamanho / (1024 * 1024)).toFixed(1)} MB`;
    },

    getNomeArquivoSeguro(nome) {
        return String(nome || 'documento')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'documento';
    },

    renderDocumentosSelecionados() {
        const arquivos = this.getDocumentosSelecionados();
        if (!this.funcDocumentosHint) return;

        if (!arquivos.length) {
            this.funcDocumentosHint.textContent = 'Selecione um ou mais arquivos para anexar ao salvar.';
            return;
        }

        this.funcDocumentosHint.textContent = `${arquivos.length} arquivo(s) selecionado(s): ${arquivos.map(file => file.name).join(', ')}`;
        this.renderDocumentosFuncionario(this.funcionarioDocumentosAtuais || []);
    },

    renderDocumentosFuncionario(documentos = []) {
        if (!this.funcDocumentosList) return;

        const pendentes = this.getDocumentosSelecionados();
        const pendentesHtml = pendentes.length
            ? `
                <div class="func-documentos-section-title">Pendentes para salvar</div>
                ${pendentes.map(file => `
                    <div class="func-documento-item pending">
                        <span class="func-documento-name"><i class="fas fa-hourglass-half"></i> ${escapeHtml(file.name)}</span>
                        <span class="func-documento-size">${this.formatarTamanhoArquivo(file.size)}</span>
                    </div>
                `).join('')}
            `
            : '';

        const anexadosHtml = documentos.length
            ? `
                <div class="func-documentos-section-title">Anexados</div>
                ${documentos.map(doc => `
                    <div class="func-documento-item" data-id="${escapeHtml(doc.id)}">
                        <span class="func-documento-name" title="${escapeHtml(doc.nome_arquivo)}"><i class="fas fa-file-alt"></i> ${escapeHtml(doc.nome_arquivo)}</span>
                        <span class="func-documento-size">${this.formatarTamanhoArquivo(doc.tamanho)}</span>
                        <button type="button" class="btn-icon edit btn-download-documento" data-id="${escapeHtml(doc.id)}" title="Baixar documento"><i class="fas fa-download"></i></button>
                        ${this.acessoTotal ? `<button type="button" class="btn-icon delete btn-delete-documento" data-id="${escapeHtml(doc.id)}" title="Excluir documento"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                `).join('')}
            `
            : '';

        this.funcDocumentosList.innerHTML = anexadosHtml || pendentesHtml
            ? `${anexadosHtml}${pendentesHtml}`
            : '<div class="func-documentos-empty">Nenhum documento anexado.</div>';
    },

    async carregarDocumentosFuncionario(funcionarioId) {
        if (!this.funcDocumentosList) return;
        if (!funcionarioId) {
            this.renderDocumentosFuncionario([]);
            return;
        }

        this.funcDocumentosList.innerHTML = '<div class="func-documentos-empty">Carregando documentos...</div>';
        try {
            const { data, error } = await supabaseClient
                .from('funcionario_documentos')
                .select('*')
                .eq('funcionario_id', funcionarioId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.funcionarioDocumentosAtuais = data || [];
            this.renderDocumentosFuncionario(this.funcionarioDocumentosAtuais);
        } catch (error) {
            console.error('Erro ao carregar documentos do funcionario:', error);
            this.funcDocumentosList.innerHTML = '<div class="func-documentos-empty error">Nao foi possivel carregar documentos. Verifique o SQL de documentos.</div>';
        }
    },

    async anexarDocumentosFuncionario(funcionarioId) {
        const arquivos = this.getDocumentosSelecionados();
        if (!funcionarioId || arquivos.length === 0) return 0;

        const usuario = this.usuarioAtual || {};
        let anexados = 0;

        for (const arquivo of arquivos) {
            const caminho = `${funcionarioId}/${Date.now()}-${crypto.randomUUID()}-${this.getNomeArquivoSeguro(arquivo.name)}`;

            const { error: uploadError } = await supabaseClient.storage
                .from(FUNCIONARIO_DOCUMENTOS_BUCKET)
                .upload(caminho, arquivo, {
                    contentType: arquivo.type || 'application/octet-stream',
                    upsert: false
                });
            if (uploadError) throw uploadError;

            const payload = {
                funcionario_id: funcionarioId,
                nome_arquivo: arquivo.name,
                caminho_arquivo: caminho,
                tipo_arquivo: arquivo.type || null,
                tamanho: arquivo.size || null,
                usuario_id: usuario.auth_user_id || null,
                usuario_nome: usuario.nome || usuario.nomecompleto || 'Sistema'
            };

            const { error: insertError } = await supabaseClient
                .from('funcionario_documentos')
                .insert(payload);

            if (insertError) {
                await supabaseClient.storage.from(FUNCIONARIO_DOCUMENTOS_BUCKET).remove([caminho]);
                throw insertError;
            }

            anexados++;
        }

        this.funcDocumentosInput.value = '';
        this.renderDocumentosSelecionados();
        await this.carregarDocumentosFuncionario(funcionarioId);
        return anexados;
    },

    async baixarDocumentoFuncionario(documentoId) {
        try {
            const { data: documento, error } = await supabaseClient
                .from('funcionario_documentos')
                .select('nome_arquivo, caminho_arquivo')
                .eq('id', documentoId)
                .single();

            if (error) throw error;

            const { data: signed, error: signedError } = await supabaseClient.storage
                .from(FUNCIONARIO_DOCUMENTOS_BUCKET)
                .createSignedUrl(documento.caminho_arquivo, 60);

            if (signedError) throw signedError;

            const response = await fetch(signed.signedUrl);
            if (!response.ok) {
                throw new Error('Nao foi possivel carregar o arquivo para download.');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = documento.nome_arquivo || 'documento';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erro ao baixar documento:', error);
            alert('Nao foi possivel baixar o documento: ' + (error.message || error));
        }
    },

    async excluirDocumentoFuncionario(documentoId) {
        if (!this.acessoTotal) return;
        if (!confirm('Deseja remover este documento do colaborador?')) return;

        try {
            const { data: documento, error } = await supabaseClient
                .from('funcionario_documentos')
                .select('funcionario_id, caminho_arquivo')
                .eq('id', documentoId)
                .single();

            if (error) throw error;

            const { error: deleteError } = await supabaseClient
                .from('funcionario_documentos')
                .delete()
                .eq('id', documentoId);

            if (deleteError) throw deleteError;

            await supabaseClient.storage
                .from(FUNCIONARIO_DOCUMENTOS_BUCKET)
                .remove([documento.caminho_arquivo]);

            await this.carregarDocumentosFuncionario(documento.funcionario_id);
        } catch (error) {
            console.error('Erro ao excluir documento:', error);
            alert('Nao foi possivel excluir o documento: ' + (error.message || error));
        }
    },

    async handleFormSubmit(e) {
        e.preventDefault();
        if (!this.acessoTotal) return;
        if (this.bloquearSeSemFilialUsuario()) return;

        const rh = document.getElementById('funcRH').value;
        const novaFuncao = document.getElementById('funcFuncao').value;
        const dataHoje = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
        const filialPermitida = this.getFilialUsuarioRestrita();

        if (this.editingIdInput.value) {
            let permissaoQuery = supabaseClient
                .from('funcionario')
                .select('id, filial')
                .eq('id', this.editingIdInput.value);
            permissaoQuery = this.aplicarFiltroFilialRestrita(permissaoQuery);
            const { data: funcionarioPermitido, error: permissaoError } = await permissaoQuery.maybeSingle();
            if (permissaoError) {
                console.error('Erro ao validar filial do funcionario:', permissaoError);
                alert('Nao foi possivel validar a filial do funcionario.');
                return;
            }
            if (!funcionarioPermitido || !this.usuarioPodeAcessarFilial(funcionarioPermitido.filial)) {
                alert('Voce nao tem permissao para alterar funcionarios de outra filial.');
                return;
            }
        }

        // Lógica de Histórico: Se estiver editando e a função mudou, registra na tabela de histórico
        if (this.editingIdInput.value && this.currentFuncaoBeforeEdit && this.currentFuncaoBeforeEdit !== novaFuncao) {
            await supabaseClient.from('funcionario_historico_funcao').insert({
                rh_registro: rh,
                funcao_anterior: this.currentFuncaoBeforeEdit,
                funcao_nova: novaFuncao,
                data_mudanca: dataHoje
            });

            // Atualiza os campos do formulário para que o payload salve a informação correta na tabela principal
            document.getElementById('funcPromocao').value = this.currentFuncaoBeforeEdit;
            document.getElementById('funcDataPromocao').value = dataHoje;
        }

        const cnhNumero = document.getElementById('funcCNHNumero').value.trim();
        const cnhCategoria = document.getElementById('funcCNHCategoria').value.trim();
        const cnhVencimento = document.getElementById('funcCNHVencimento').value;
        const temDadosCNH = Boolean(cnhNumero || cnhCategoria || cnhVencimento);

        const payload = {
            rh_registro: rh,
            nome: document.getElementById('funcNome').value,
            nome_completo: document.getElementById('funcNomeCompleto').value,
            data_nascimento: document.getElementById('funcDataNascimento').value || null, // Adiciona data de nascimento
            cpf: document.getElementById('funcCPF').value,
            cnh_numero: cnhNumero || null,
            cnh_categoria: cnhCategoria || null,
            cnh_vencimento: cnhVencimento || null,
            data_admissao: document.getElementById('funcAdmissao').value,
            filial: filialPermitida || document.getElementById('funcFilial').value || 'SP',
            funcao: novaFuncao,
            tipo_escala: document.getElementById('funcTipoEscala')?.value || 'Normal',
            equipe_escala: document.getElementById('funcEquipeEscala')?.value || null,
            contato_corp: document.getElementById('funcContatoCorp').value,
            contato_pessoal: document.getElementById('funcContatoPessoal').value,
            status: document.getElementById('funcStatus').value,
            recebe_diaria: document.getElementById('funcDiaria').value !== 'false',
            escala_ativa: document.getElementById('funcEscalaAtiva')?.value !== 'false',
            data_desligamento: document.getElementById('funcDesligamento').value || null,
            funcao_anterior: document.getElementById('funcPromocao').value || null,
            data_alteracao_funcao: document.getElementById('funcDataPromocao').value || null,
            id: this.editingIdInput.value || undefined
        };

        if (!this.usuarioPodeAcessarFilial(payload.filial)) {
            alert('Voce nao tem permissao para salvar funcionarios de outra filial.');
            return;
        }

        try {
            // Se temos um ID, o upsert resolve pelo ID (padrão). 
            // Se não temos, usamos o rh_registro para evitar duplicidade de matrícula.
            const salvarPayload = async (payloadSalvar) => {
                if (this.editingIdInput.value) {
                    const updatePayload = { ...payloadSalvar };
                    delete updatePayload.id;
                    let query = supabaseClient.from('funcionario').update(updatePayload).eq('id', this.editingIdInput.value);
                    query = this.aplicarFiltroFilialRestrita(query);
                    const result = await query.select('id').maybeSingle();
                    if (!result.error && !result.data) {
                        return { error: new Error('Funcionario nao encontrado na filial permitida.') };
                    }
                    return result;
                }

                const insertPayload = { ...payloadSalvar };
                delete insertPayload.id;
                return supabaseClient.from('funcionario').insert(insertPayload).select('id').single();
            };

            let resultadoSalvamento = await salvarPayload(payload);
            let { data: funcionarioSalvo, error } = resultadoSalvamento;
            const erroCNHSchema = error && /cnh_|schema cache|column/i.test(String(error.message || error));
            if (erroCNHSchema && !temDadosCNH) {
                const payloadSemCNH = { ...payload };
                delete payloadSemCNH.cnh_numero;
                delete payloadSemCNH.cnh_categoria;
                delete payloadSemCNH.cnh_vencimento;
                resultadoSalvamento = await salvarPayload(payloadSemCNH);
                ({ data: funcionarioSalvo, error } = resultadoSalvamento);
            }
            const erroEscalaAtivaSchema = error && /escala_ativa|schema cache|column/i.test(String(error.message || error));
            if (erroEscalaAtivaSchema) {
                const payloadSemEscalaAtiva = { ...payload };
                delete payloadSemEscalaAtiva.escala_ativa;
                if (erroCNHSchema && !temDadosCNH) {
                    delete payloadSemEscalaAtiva.cnh_numero;
                    delete payloadSemEscalaAtiva.cnh_categoria;
                    delete payloadSemEscalaAtiva.cnh_vencimento;
                }
                resultadoSalvamento = await salvarPayload(payloadSemEscalaAtiva);
                ({ data: funcionarioSalvo, error } = resultadoSalvamento);
            }
            if (error) throw error;

            const funcionarioId = funcionarioSalvo?.id || this.editingIdInput.value;
            let anexados = 0;
            let erroDocumentos = '';
            try {
                anexados = await this.anexarDocumentosFuncionario(funcionarioId);
            } catch (documentoError) {
                console.error('Erro ao anexar documentos do funcionario:', documentoError);
                erroDocumentos = documentoError?.message || String(documentoError || '');
            }

            if (this.editingIdInput.value) await this.carregarHistoricoFuncao(rh);
            await this.renderSummary();
            registrarAuditoria(
                this.editingIdInput.value ? 'ALTERAR' : 'INCLUIR',
                'Funcionário',
                `${this.editingIdInput.value ? 'Alteração' : 'Inclusão'} do colaborador ${payload.nome} (RH: ${payload.rh_registro})${anexados ? ` com ${anexados} documento(s) anexado(s)` : ''}`
            );
            alert(erroDocumentos
                ? `✅ Colaborador salvo com sucesso, mas os documentos nao foram anexados: ${erroDocumentos}`
                : '✅ Colaborador salvo com sucesso!'
            );
            this.clearForm();
            this.closeFuncionarioModal();
            this.renderGrid();
        } catch (err) {
            console.error('Erro ao salvar funcionário:', err);
            const detalhe = String(err?.message || err || '');
            const complemento = /tipo_escala|equipe_escala/i.test(detalhe)
                ? '\n\nAplique o SQL supabase/2026-06-30_add_funcionario_tipo_equipe_escala.sql e recarregue o schema do Supabase.'
                : /cnh_|schema cache|column/i.test(detalhe)
                ? '\n\nAplique o SQL pendente da coluna informada em supabase/ e recarregue o schema do Supabase.'
                : '';
            alert(`❌ Erro ao salvar registro: ${detalhe}${complemento}`);
        }
    },

    clearForm(options = {}) {
        const { fecharModal = true } = options;
        this.setFormReadOnly(false); // Garante que o formulário volte a ficar editável ao sair do modo Visualizar
        this.form?.reset();
        this.editingIdInput.value = '';
        this.currentFuncaoBeforeEdit = null;
        this.btnSubmit.textContent = 'Salvar Registro';
        this.toggleDesligamentoField();
        if (this.filialSelect) {
            const filialPadrao = this.getFilialUsuarioRestrita() || this.usuarioAtual?.filial || 'SP';
            this.filialSelect.value = Array.from(this.filialSelect.options).some(opt => opt.value === filialPadrao)
                ? filialPadrao
                : 'SP';
            this.filialSelect.disabled = Boolean(this.getFilialUsuarioRestrita());
        }
        if (this.histFuncContainer) this.histFuncContainer.classList.add('hidden');
        if (this.histFuncTableBody) this.histFuncTableBody.innerHTML = '';
        if (this.funcDocumentosInput) this.funcDocumentosInput.value = '';
        if (this.funcDocumentosHint) this.funcDocumentosHint.textContent = 'Selecione um ou mais arquivos para anexar ao salvar.';
        this.funcionarioDocumentosAtuais = [];
        this.renderDocumentosFuncionario([]);
        if (this.escalaAtivaSelect) this.escalaAtivaSelect.value = 'true';
        if (this.tipoEscalaSelect) this.tipoEscalaSelect.value = 'Normal';
        if (this.equipeEscalaSelect) this.equipeEscalaSelect.value = '';
        if (fecharModal) this.closeFuncionarioModal();
    },

    async buscarFuncionariosPaginado({ select = '*', applyFilters = null, orderColumn = null, orderAscending = true } = {}) {
        const todos = [];
        let inicio = 0;

        while (true) {
            let query = supabaseClient
                .from('funcionario')
                .select(select);

            query = this.aplicarFiltroFilialRestrita(query);

            if (typeof applyFilters === 'function') {
                query = applyFilters(query);
            }

            if (orderColumn) {
                query = query.order(orderColumn, { ascending: orderAscending });
            }

            const { data, error } = await query.range(inicio, inicio + FUNCIONARIO_PAGE_SIZE - 1);
            if (error) throw error;

            const lote = data || [];
            todos.push(...lote);

            if (lote.length < FUNCIONARIO_PAGE_SIZE) break;
            inicio += FUNCIONARIO_PAGE_SIZE;
        }

        return todos;
    },

    async renderGrid() {
        if (!this.usuarioTemAcessoGlobal() && !this.getFilialUsuarioRestrita()) {
            this.listData = [];
            if (this.tableBody) this.tableBody.innerHTML = '<tr><td colspan="13" style="text-align:center;">Seu usuario nao possui filial definida.</td></tr>';
            if (this.gridCount) this.gridCount.textContent = '(0)';
            if (this.filterCount) this.filterCount.textContent = 'Quantidade listada: 0';
            this.renderSummary([]);
            return;
        }

        const searchTerm = this.searchInput?.value.toLowerCase().trim() || '';
        const selectedStatuses = Array.from(this.statusFilterOptions?.querySelectorAll('.status-checkbox:checked') || []).map(cb => cb.value);
        const selectedMonth = this.monthFilter?.value || '';
        const selectedAdmissaoMonthYear = this.admissaoMonthYearFilter?.value || '';
        const selectedDemissaoMonthYear = this.demissaoMonthYearFilter?.value || '';
        const selectedCnhVenc = this.cnhVencFilter?.value || '';
        const selectedFilial = this.filialFilter?.value || '';
        const selectedTipoEscala = this.tipoEscalaFilter?.value || '';
        const selectedEquipeEscala = this.equipeEscalaFilter?.value || '';
        const selectedFuncoes = this.getFuncoesFiltroSelecionadas();

        try {
            let list = await this.buscarFuncionariosPaginado({
                select: '*',
                orderColumn: this.sortConfig.column,
                orderAscending: this.sortConfig.direction === 'asc',
                applyFilters: (query) => {
                    if (selectedStatuses.length > 0) {
                        query = query.in('status', selectedStatuses);
                    } else {
                        query = query.in('status', []); // Mostra nada se nenhum estiver marcado
                    }

                    if (searchTerm) {
                        query = query.or(`nome.ilike.%${searchTerm}%,nome_completo.ilike.%${searchTerm}%,rh_registro.ilike.%${searchTerm}%,funcao.ilike.%${searchTerm}%`);
                    }

                    if (selectedFilial) {
                        query = query.eq('filial', selectedFilial);
                    }

                    if (selectedFuncoes.length > 0) {
                        query = query.in('funcao', selectedFuncoes);
                    }

                    if (selectedTipoEscala) {
                        query = query.eq('tipo_escala', selectedTipoEscala);
                    }

                    if (selectedEquipeEscala) {
                        query = query.eq('equipe_escala', selectedEquipeEscala);
                    }

                    return query;
                }
            });

            // Filtro de mês (realizado no cliente para simplificar a lógica de data)
            if (selectedMonth) {
                list = list.filter(f => {
                    if (!f.data_nascimento) return false;
                    const mes = f.data_nascimento.split('-')[1];
                    return mes === selectedMonth;
                });
            }

            // Filtro de mes/ano de admissao (YYYY-MM)
            if (selectedAdmissaoMonthYear) {
                list = list.filter(f => {
                    if (!f.data_admissao) return false;
                    return f.data_admissao.slice(0, 7) === selectedAdmissaoMonthYear;
                });
            }

            // Filtro de mes/ano de demissao (YYYY-MM)
            if (selectedDemissaoMonthYear) {
                list = list.filter(f => {
                    if (!f.data_desligamento) return false;
                    return f.data_desligamento.slice(0, 7) === selectedDemissaoMonthYear;
                });
            }

            if (selectedCnhVenc === 'vencida') {
                list = list.filter(f => isDateBeforeToday(f.cnh_vencimento));
            } else if (selectedCnhVenc === 'em_dia') {
                list = list.filter(f => !isDateBeforeToday(f.cnh_vencimento));
            }

            this.listData = list; // Atualiza cache para exportação
            if (this.gridCount) {
                this.gridCount.textContent = `(${list.length})`;
            }
            if (this.filterCount) {
                this.filterCount.textContent = `Quantidade listada: ${list.length}`;
            }
            
            this.tableBody.innerHTML = list.map(f => {
                const cnhVencida = isDateBeforeToday(f.cnh_vencimento);
                const cnhVencimentoTexto = formatDateBR(f.cnh_vencimento);
                return `
                    <tr>
                        <td><strong>${escapeHtml(f.rh_registro)}</strong></td>
                        <td>${escapeHtml(f.filial || 'SP')}</td>
                        <td title="${escapeHtml(f.nome_completo || '')}">${escapeHtml(f.nome)}</td>
                        <td>${formatDateBR(f.data_nascimento)}</td>
                        <td>${escapeHtml(f.funcao)}</td>
                        <td>${escapeHtml(f.cnh_numero || '-')}</td>
                        <td>${escapeHtml(f.cnh_categoria || '-')}</td>
                        <td class="${cnhVencida ? 'func-cnh-vencida' : ''}" title="${cnhVencida ? 'CNH vencida' : ''}">${escapeHtml(cnhVencimentoTexto)}</td>
                        <td title="${f.data_admissao ? this.calculateTenure(f.data_admissao) : ''}">${formatDateBR(f.data_admissao)}</td>
                        <td>${escapeHtml(f.contato_corp || '-')}</td>
                        <td><span class="status-badge status-${statusClass(f.status)}">${escapeHtml(f.status)}</span></td>
                        <td>${f.escala_ativa === false ? 'NAO' : 'SIM'}</td>
                        <td>
                            <button class="btn-icon view btn-view" data-id="${escapeHtml(f.id)}" title="Visualizar"><i class="fas fa-eye"></i></button>
                            <button class="btn-icon edit btn-edit" data-id="${escapeHtml(f.id)}" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn-icon delete btn-delete" data-id="${escapeHtml(f.id)}" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
            this.renderSummary(list);
            this.updateSortIcons(); // Atualiza os ícones após renderizar
        } catch (e) { console.error('Erro ao carregar grid:', e); }
    },

    handleSort(column) {
        // Se a coluna clicada for a mesma, inverte a direção
        if (this.sortConfig.column === column) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // Se for uma nova coluna, define como padrão ascendente
            this.sortConfig.column = column;
            this.sortConfig.direction = 'asc';
        }
        this.updateSortIcons();
        this.renderGrid(); // Re-renderiza a grid com a nova ordenação
    },

    updateSortIcons() {
        // Remove todos os ícones de ordenação
        document.querySelectorAll('#sectionCadastrarFuncionarios .data-grid thead th i').forEach(icon => {
            icon.className = 'fas fa-sort'; // Ícone neutro
        });

        // Adiciona o ícone correto à coluna ativa
        const activeHeader = document.querySelector(`#sectionCadastrarFuncionarios .data-grid thead th[data-sort="${this.sortConfig.column}"] i`);
        if (activeHeader) {
            activeHeader.className = this.sortConfig.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    },

    async handleHistoricoDblClick(e) {
        const td = e.target.closest('td');
        const tr = td?.closest('tr');
        if (!td || !tr || !tr.dataset.id) return;

        const key = td.dataset.key;
        if (!key) return;

        if (td.querySelector('input')) return;

        const originalValue = key === 'data_mudanca' ? td.dataset.value : td.textContent.trim();
        const input = document.createElement('input');
        input.type = key === 'data_mudanca' ? 'date' : 'text';
        input.className = 'glass-input';
        input.value = originalValue || '';
        input.style.width = '100%';
        input.style.padding = '2px 5px';
        input.style.height = 'auto';

        td.innerHTML = '';
        td.appendChild(input);
        input.focus();

        const save = async () => {
            const newValue = input.value.trim();
            const rh = document.getElementById('funcRH').value;
            if (newValue === originalValue) {
                this.carregarHistoricoFuncao(rh);
                return;
            }

            try {
                const { error } = await supabaseClient.from('funcionario_historico_funcao').update({ [key]: newValue || null }).eq('id', tr.dataset.id);
                if (error) throw error;
                this.carregarHistoricoFuncao(rh);
            } catch (err) {
                console.error('Erro ao atualizar histórico:', err);
                this.carregarHistoricoFuncao(rh);
            }
        };

        input.onblur = save;
        input.onkeydown = (ev) => {
            if (ev.key === 'Enter') input.blur();
            if (ev.key === 'Escape') { input.value = originalValue; input.blur(); }
        };
    },

    async carregarHistoricoFuncao(rh) {
        if (!this.histFuncTableBody) return;
        
        try {
            const { data, error } = await supabaseClient
                .from('funcionario_historico_funcao')
                .select('*')
                .eq('rh_registro', rh)
                .order('data_mudanca', { ascending: false });

            if (error) throw error;

            if (data && data.length > 0) {
                this.histFuncContainer.classList.remove('hidden');
                this.histFuncTableBody.innerHTML = data.map(h => `
                    <tr data-id="${h.id}">
                        <td data-key="funcao_anterior">${escapeHtml(h.funcao_anterior)}</td>
                        <td data-key="funcao_nova">${escapeHtml(h.funcao_nova)}</td>
                        <td data-key="data_mudanca" data-value="${h.data_mudanca || ''}">${h.data_mudanca ? new Date(h.data_mudanca + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                    </tr>
                `).join('');
            } else {
                this.histFuncContainer.classList.add('hidden');
            }
        } catch (err) { console.error('Erro ao carregar histórico de função:', err); }
    },

    /**
     * Calcula a duração entre a data de admissão e a data atual em anos, meses e dias.
     * @param {string} admissionDateStr - Data de admissão no formato YYYY-MM-DD.
     * @returns {string} Duração formatada (ex: "3 anos, 5 meses, 10 dias").
     */
    calculateTenure(admissionDateStr) {
        if (!admissionDateStr) return '';

        const admission = new Date(admissionDateStr + 'T00:00:00'); // Garante que a data seja interpretada corretamente
        const today = new Date();

        let years = today.getFullYear() - admission.getFullYear();
        let months = today.getMonth() - admission.getMonth();
        let days = today.getDate() - admission.getDate();

        if (days < 0) {
            months--;
            const prevMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
            days = prevMonthLastDay - admission.getDate() + today.getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }

        const result = [];
        if (years > 0) result.push(`${years} ano${years > 1 ? 's' : ''}`);
        if (months > 0) result.push(`${months} mês${months > 1 ? 'es' : ''}`);
        if (days > 0) result.push(`${days} dia${days > 1 ? 's' : ''}`);

        return result.length > 0 ? result.join(', ') : 'Menos de 1 dia';
    },

    async renderSummary(sourceList = null) {
        if (!this.funcSummaryBody) return;

        try {
            let list = sourceList;
            if (!Array.isArray(list)) {
                list = await this.buscarFuncionariosPaginado({
                    select: 'funcao, status, filial',
                    applyFilters: (query) => {
                        if (this.filialFilter?.value) query = query.eq('filial', this.filialFilter.value);
                        return query;
                    }
                });
            }

            const summaryData = {}; 
            const grandTotals = { 'Ativo': 0, 'Desligado': 0, 'Transferido': 0, 'Ferias': 0, 'Afastado': 0, 'Total': 0 };

            list.forEach(f => {
                const funcao = f.funcao || 'Não Definida';
                const status = f.status || 'Ativo'; 

                if (!summaryData[funcao]) {
                    summaryData[funcao] = { 'Ativo': 0, 'Desligado': 0, 'Transferido': 0, 'Ferias': 0, 'Afastado': 0, 'Total': 0 };
                }

                if (summaryData[funcao][status] !== undefined) summaryData[funcao][status]++;
                if (grandTotals[status] !== undefined) grandTotals[status]++;

                // A coluna "Total" agora contabiliza apenas funcionários ativos (exclui desligados e transferidos)
                if (status !== 'Desligado' && status !== 'Transferido') {
                    summaryData[funcao]['Total']++;
                    grandTotals['Total']++;
                }
            });

            this.funcSummaryBody.innerHTML = '';
            Object.keys(summaryData)
                .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
                .forEach(funcao => {
                const data = summaryData[funcao];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${escapeHtml(funcao)}</strong></td>
                    <td>${data['Ativo']}</td>
                    <td>${data['Desligado']}</td>
                    <td>${data['Transferido']}</td>
                    <td>${data['Ferias']}</td>
                    <td>${data['Afastado']}</td>
                    <td><strong>${data['Total']}</strong></td>
                `;
                this.funcSummaryBody.appendChild(tr);
            });
            this.funcSummaryBody.innerHTML += `
                <tr style="font-weight: bold; background-color: rgba(0,0,0,0.05);">
                    <td>TOTAIS GERAIS</td>
                    <td>${grandTotals['Ativo']}</td>
                    <td>${grandTotals['Desligado']}</td>
                    <td>${grandTotals['Transferido']}</td>
                    <td>${grandTotals['Ferias']}</td>
                    <td>${grandTotals['Afastado']}</td>
                    <td>${grandTotals['Total']}</td>
                </tr>`;
        } catch (e) { console.error('Erro ao carregar resumo:', e); }
    },

    async preencherFormularioFuncionario(f) {
        if (this.funcDocumentosInput) this.funcDocumentosInput.value = '';
        if (this.funcDocumentosHint) this.funcDocumentosHint.textContent = 'Selecione um ou mais arquivos para anexar ao salvar.';
        this.currentFuncaoBeforeEdit = f.funcao;
        this.editingIdInput.value = f.id;
        document.getElementById('funcRH').value = f.rh_registro;
        document.getElementById('funcNome').value = f.nome;
        document.getElementById('funcNomeCompleto').value = f.nome_completo || '';
        document.getElementById('funcDataNascimento').value = f.data_nascimento || ''; // Preenche data de nascimento
        document.getElementById('funcCPF').value = f.cpf || '';
        document.getElementById('funcCNHNumero').value = f.cnh_numero || '';
        document.getElementById('funcCNHCategoria').value = f.cnh_categoria || '';
        document.getElementById('funcCNHVencimento').value = f.cnh_vencimento || '';
        document.getElementById('funcAdmissao').value = f.data_admissao;
        document.getElementById('funcFilial').value = f.filial || 'SP';
        document.getElementById('funcFuncao').value = f.funcao;
        document.getElementById('funcTipoEscala').value = f.tipo_escala || 'Normal';
        document.getElementById('funcEquipeEscala').value = f.equipe_escala || '';
        document.getElementById('funcContatoCorp').value = f.contato_corp || '';
        document.getElementById('funcContatoPessoal').value = f.contato_pessoal || '';
        document.getElementById('funcStatus').value = f.status;
        document.getElementById('funcDiaria').value = f.recebe_diaria !== false ? 'true' : 'false';
        document.getElementById('funcEscalaAtiva').value = f.escala_ativa === false ? 'false' : 'true';
        document.getElementById('funcDesligamento').value = f.data_desligamento || '';
        document.getElementById('funcPromocao').value = f.funcao_anterior || '';
        document.getElementById('funcDataPromocao').value = f.data_alteracao_funcao || '';
        this.toggleDesligamentoField();
        await this.carregarHistoricoFuncao(f.rh_registro);
        await this.carregarDocumentosFuncionario(f.id);
    },

    async loadForEditing(id) {
        if (!this.acessoTotal) return;
        let query = supabaseClient.from('funcionario').select('*').eq('id', id);
        query = this.aplicarFiltroFilialRestrita(query);
        const { data: f } = await query.maybeSingle();
        if (!f) return;
        if (!this.usuarioPodeAcessarFilial(f.filial)) {
            alert('Voce nao tem permissao para alterar funcionarios de outra filial.');
            return;
        }
        await this.preencherFormularioFuncionario(f);
        this.setFormReadOnly(false);
        this.btnSubmit.textContent = 'Atualizar Registro';
        this.openFuncionarioModal();
    },

    // Abre o mesmo formulário em modo somente-leitura, sem exigir acesso de edição - permite
    // ver o cadastro completo do colaborador sem risco de alterar nada por engano.
    async loadForViewing(id) {
        let query = supabaseClient.from('funcionario').select('*').eq('id', id);
        query = this.aplicarFiltroFilialRestrita(query);
        const { data: f } = await query.maybeSingle();
        if (!f) return;
        if (!this.usuarioPodeAcessarFilial(f.filial)) {
            alert('Voce nao tem permissao para visualizar funcionarios de outra filial.');
            return;
        }
        await this.preencherFormularioFuncionario(f);
        this.setFormReadOnly(true);
        this.openFuncionarioModal(true);
    },

    // Alterna o formulário entre editável e somente-leitura (usado ao abrir para Visualizar e
    // desfeito ao fechar o modal / abrir para Incluir ou Editar).
    setFormReadOnly(somenteLeitura) {
        if (this.form) {
            this.form.querySelectorAll('input, select, textarea').forEach(el => {
                if (el.id === 'funcEditingId') return;
                el.disabled = somenteLeitura;
            });
        }
        if (this.btnAbrirCadastroFuncao) this.btnAbrirCadastroFuncao.disabled = somenteLeitura;
        if (this.btnSubmit) this.btnSubmit.classList.toggle('hidden', somenteLeitura);
        if (this.btnClearForm) this.btnClearForm.textContent = somenteLeitura ? 'Fechar' : 'Cancelar';
        const tituloModal = document.getElementById('funcionarioModalTitulo');
        if (tituloModal) {
            tituloModal.innerHTML = somenteLeitura
                ? '<i class="fas fa-eye"></i> Visualizar Colaborador'
                : '<i class="fas fa-user-plus"></i> Formulário do Colaborador';
        }
    },

    async deleteFuncionario(id) {
        if (!this.acessoTotal) return;
        if (confirm('Deseja realmente excluir este colaborador?')) {
            const func = this.listData.find(f => String(f.id) === String(id));
            if (!func || !this.usuarioPodeAcessarFilial(func.filial)) {
                alert('Voce nao tem permissao para excluir funcionarios de outra filial.');
                return;
            }
            const nomeFuncionario = func ? `${func.nome} (RH: ${func.rh_registro})` : `ID ${id}`;
            let query = supabaseClient.from('funcionario').delete().eq('id', id);
            query = this.aplicarFiltroFilialRestrita(query);
            await query;
            registrarAuditoria('EXCLUIR', 'Funcionário', `Exclusão do colaborador ${nomeFuncionario}`);
            await this.renderGrid();
        }
    },

    getPayloadImportacaoFuncionario(row, { existente = false } = {}) {
        const rh = cleanImportText(getImportValue(row, ['RH Registro', 'RH', 'Nº Identificador (RH)', 'N Identificador RH', 'RH_REGISTRO']));
        const filialRestrita = this.getFilialUsuarioRestrita();
        const filialPadrao = filialRestrita || this.usuarioAtual?.filial || 'SP';
        const payload = { rh_registro: rh };

        const textFields = [
            ['nome', ['Nome', 'Nome Curto', 'Nome Curto (Exibição)']],
            ['nome_completo', ['Nome Completo']],
            ['cpf', ['CPF']],
            ['filial', ['Filial']],
            ['funcao', ['Função', 'Funcao', 'Função Atual']],
            ['tipo_escala', ['Tipo Escala', 'Tipo']],
            ['equipe_escala', ['Equipe Escala', 'Equipe']],
            ['contato_corp', ['Contato Corp', 'Contato Corporativo']],
            ['contato_pessoal', ['Contato Pessoal']],
            ['status', ['Status']],
            ['funcao_anterior', ['Função Anterior', 'Funcao Anterior']],
            ['cnh_numero', ['Nº CNH', 'Numero CNH', 'CNH']],
            ['cnh_categoria', ['Categoria CNH', 'Categoria', 'Cat.']]
        ];

        textFields.forEach(([field, keys]) => {
            const value = cleanImportText(getImportValue(row, keys));
            if (value) payload[field] = value;
        });

        const dateFields = [
            ['data_nascimento', ['Data Nascimento', 'Nascimento']],
            ['data_admissao', ['Data Admissão', 'Data Admissao', 'Admissão', 'Admissao']],
            ['data_desligamento', ['Data Desligamento', 'Desligamento']],
            ['data_alteracao_funcao', ['Data Alt. Função', 'Data Alt Funcao', 'Data Alteracao Funcao']],
            ['cnh_vencimento', ['Vencimento CNH', 'Venc. CNH', 'Venc CNH', 'CNH Vencimento']]
        ];

        dateFields.forEach(([field, keys]) => {
            const raw = getImportValue(row, keys);
            if (raw) {
                const parsedDate = parseImportDate(raw);
                if (!parsedDate) throw new Error(`Data invalida no campo ${keys[0]}.`);
                payload[field] = parsedDate;
            }
        });

        const diariaRaw = getImportValue(row, ['Diária', 'Diaria', 'Recebe Diaria', 'Recebe Diária']);
        if (diariaRaw !== '') payload.recebe_diaria = parseImportBoolean(diariaRaw, true);
        const escalaRaw = getImportValue(row, ['Escalar', 'Escalar?', 'Aparece na Escala', 'Escala Ativa']);
        if (escalaRaw !== '') payload.escala_ativa = parseImportBoolean(escalaRaw, true);

        if (!payload.rh_registro) throw new Error('Campo RH Registro/Nº Identificador (RH) nao informado.');

        if (filialRestrita) payload.filial = filialRestrita;
        if (!this.usuarioPodeAcessarFilial(payload.filial || filialPadrao)) {
            throw new Error('Usuario sem permissao para importar funcionario de outra filial.');
        }

        if (!existente) {
            payload.filial = payload.filial || filialPadrao;
            payload.status = payload.status || 'Ativo';
            payload.tipo_escala = payload.tipo_escala || 'Normal';
            payload.recebe_diaria = payload.recebe_diaria ?? true;
            payload.escala_ativa = payload.escala_ativa ?? true;
            if (!payload.nome) throw new Error('Campo Nome nao informado.');
            if (!payload.nome_completo) payload.nome_completo = payload.nome;
            if (!payload.funcao) throw new Error('Campo Funcao nao informado.');
            if (!payload.data_admissao) throw new Error('Campo Data Admissao nao informado ou invalido.');
        }

        if (payload.status) {
            const statusMap = {
                ATIVO: 'Ativo',
                DESLIGADO: 'Desligado',
                TRANSFERIDO: 'Transferido',
                FERIAS: 'Ferias',
                AFASTADO: 'Afastado'
            };
            payload.status = statusMap[normalizeImportKey(payload.status)] || payload.status;
        }

        if (payload.tipo_escala) {
            const tipoMap = {
                NORMAL: 'Normal',
                '12X36': '12X36',
                '12 X 36': '12X36'
            };
            payload.tipo_escala = tipoMap[normalizeImportKey(payload.tipo_escala)] || payload.tipo_escala;
        }

        if (payload.equipe_escala) {
            const equipeMap = {
                AD: 'AD',
                BD: 'BD',
                AN: 'AN',
                BN: 'BN',
                DIURNO: 'Diurno',
                NOTURNO: 'Noturno'
            };
            payload.equipe_escala = equipeMap[normalizeImportKey(payload.equipe_escala)] || payload.equipe_escala;
        }

        Object.keys(payload).forEach(key => {
            if (payload[key] === '') delete payload[key];
        });

        return payload;
    },

    async importFromXLSX(event) {
        if (!this.acessoTotal) {
            if (event?.target) event.target.value = '';
            return;
        }
        const file = event.target.files?.[0];
        if (!file) return;
        if (this.bloquearSeSemFilialUsuario()) {
            event.target.value = '';
            return;
        }

        const startedAt = new Date();
        const report = [
            'RELATORIO DE IMPORTACAO DE FUNCIONARIOS',
            `Arquivo: ${file.name}`,
            `Data/Hora: ${startedAt.toLocaleString('pt-BR')}`,
            '',
            'Campos aceitos: RH Registro/RH/Nº Identificador (RH), Filial, Nome, Nome Completo, CPF, Nº CNH, Categoria CNH, Vencimento CNH, Data Nascimento, Data Admissao, Funcao, Tipo Escala, Equipe Escala, Contato Corp, Contato Pessoal, Status, Diaria, Data Desligamento, Funcao Anterior, Data Alt. Funcao.',
            ''
        ];

        let incluidos = 0;
        let atualizados = 0;
        let rejeitados = 0;

        try {
            const rows = await lerFuncionarioXlsx(file);
            if (!rows.length) throw new Error('Arquivo vazio.');

            const rhsArquivo = new Set();
            let existentesQuery = supabaseClient
                .from('funcionario')
                .select('rh_registro');
            existentesQuery = this.aplicarFiltroFilialRestrita(existentesQuery);
            const { data: existentes, error: buscaError } = await existentesQuery;
            if (buscaError) throw buscaError;

            const rhsExistentes = new Set((existentes || []).map(item => cleanImportText(item.rh_registro)).filter(Boolean));

            for (let index = 0; index < rows.length; index += 1) {
                const rowNumber = index + 2;
                const row = rows[index];
                const rh = cleanImportText(getImportValue(row, ['RH Registro', 'RH', 'Nº Identificador (RH)', 'N Identificador RH', 'RH_REGISTRO']));

                try {
                    if (!rh) throw new Error('Campo RH Registro/Nº Identificador (RH) nao informado.');
                    if (rhsArquivo.has(rh)) throw new Error(`RH ${rh} duplicado no arquivo.`);
                    rhsArquivo.add(rh);

                    const existente = rhsExistentes.has(rh);
                    const payload = this.getPayloadImportacaoFuncionario(row, { existente });

                    if (existente) {
                        const payloadUpdate = { ...payload };
                        delete payloadUpdate.rh_registro;
                        if (Object.keys(payloadUpdate).length === 0) throw new Error('Nenhum campo para atualizar.');
                        let updateQuery = supabaseClient.from('funcionario').update(payloadUpdate).eq('rh_registro', rh);
                        updateQuery = this.aplicarFiltroFilialRestrita(updateQuery);
                        let { data: updatedRow, error } = await updateQuery.select('id').maybeSingle();
                        if (error && /escala_ativa|schema cache|column/i.test(String(error.message || error))) {
                            delete payloadUpdate.escala_ativa;
                            let retryUpdateQuery = supabaseClient.from('funcionario').update(payloadUpdate).eq('rh_registro', rh);
                            retryUpdateQuery = this.aplicarFiltroFilialRestrita(retryUpdateQuery);
                            ({ data: updatedRow, error } = await retryUpdateQuery.select('id').maybeSingle());
                        }
                        if (error) throw error;
                        if (!updatedRow) throw new Error('Funcionario nao encontrado na filial permitida.');
                        atualizados += 1;
                        report.push(`LINHA ${rowNumber} | RH ${rh} | ATUALIZADO`);
                    } else {
                        let { error } = await supabaseClient.from('funcionario').insert(payload);
                        if (error && /escala_ativa|schema cache|column/i.test(String(error.message || error))) {
                            const payloadSemEscalaAtiva = { ...payload };
                            delete payloadSemEscalaAtiva.escala_ativa;
                            ({ error } = await supabaseClient.from('funcionario').insert(payloadSemEscalaAtiva));
                        }
                        if (error) throw error;
                        incluidos += 1;
                        rhsExistentes.add(rh);
                        report.push(`LINHA ${rowNumber} | RH ${rh} | INCLUIDO`);
                    }
                } catch (error) {
                    rejeitados += 1;
                    report.push(`LINHA ${rowNumber} | RH ${rh || '-'} | NAO IMPORTADO | Motivo: ${error.message || error}`);
                }
            }

            report.push('');
            report.push(`Resumo: ${incluidos} incluido(s), ${atualizados} atualizado(s), ${rejeitados} nao importado(s).`);
            baixarRelatorioImportacaoFuncionario(report);
            registrarAuditoria('IMPORTAR', 'Funcionário', `Importacao XLSX de funcionarios: ${incluidos} incluidos, ${atualizados} atualizados, ${rejeitados} rejeitados.`);
            alert(`Importacao concluida.\nIncluidos: ${incluidos}\nAtualizados: ${atualizados}\nNao importados: ${rejeitados}`);
            await this.renderSummary();
            await this.renderGrid();
        } catch (error) {
            report.push(`ERRO GERAL: ${error.message || error}`);
            baixarRelatorioImportacaoFuncionario(report);
            alert('Erro ao importar funcionarios. O relatorio TXT foi gerado com o detalhe.');
        } finally {
            event.target.value = '';
        }
    },

    downloadModeloImportacao() {
        if (typeof XLSX === 'undefined') {
            alert('Biblioteca XLSX nao carregada.');
            return;
        }

        const headers = [
            'RH Registro',
            'Filial',
            'Nome',
            'Nome Completo',
            'CPF',
            'Nº CNH',
            'Categoria CNH',
            'Vencimento CNH',
            'Data Nascimento',
            'Data Admissão',
            'Função',
            'Tipo Escala',
            'Equipe Escala',
            'Contato Corp',
            'Contato Pessoal',
            'Status',
            'Diária',
            'Escalar',
            'Data Desligamento',
            'Função Anterior',
            'Data Alt. Função'
        ];

        const exemplo = {
            'RH Registro': '123456',
            'Filial': this.usuarioAtual?.filial || 'SP',
            'Nome': 'NOME CURTO',
            'Nome Completo': 'NOME COMPLETO DO FUNCIONARIO',
            'CPF': '000.000.000-00',
            'Nº CNH': '00000000000',
            'Categoria CNH': 'AB',
            'Vencimento CNH': '31/12/2026',
            'Data Nascimento': '01/01/1990',
            'Data Admissão': '01/01/2026',
            'Função': 'Motorista',
            'Tipo Escala': 'Normal',
            'Equipe Escala': '',
            'Contato Corp': '(00)00000-0000',
            'Contato Pessoal': '(00)00000-0000',
            'Status': 'Ativo',
            'Diária': 'SIM',
            'Escalar': 'SIM',
            'Data Desligamento': '',
            'Função Anterior': '',
            'Data Alt. Função': ''
        };

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet([exemplo], { header: headers });
        ws['!cols'] = headers.map(header => ({ wch: Math.max(header.length + 4, 16) }));
        XLSX.utils.book_append_sheet(wb, ws, 'Modelo Funcionarios');
        XLSX.writeFile(wb, `modelo_importacao_funcionarios_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    /**
     * Exporta os dados atuais da grid para XLSX
     */
    exportToXLSX() {
        if (!this.listData || this.listData.length === 0) return alert('Não há dados para exportar.');

        const dataToExport = this.listData.map(f => ({
            'RH Registro': f.rh_registro,
            'Filial': f.filial || 'SP',
            'Nome': f.nome,
            'Nome Completo': f.nome_completo,
            'CPF': f.cpf || '-',
            'Nº CNH': f.cnh_numero || '-',
            'Categoria CNH': f.cnh_categoria || '-',
            'Vencimento CNH': formatDateBR(f.cnh_vencimento),
            'Data Nascimento': formatDateBR(f.data_nascimento),
            'Data Admissão': formatDateBR(f.data_admissao),
            'Função': f.funcao,
            'Tipo Escala': f.tipo_escala || 'Normal',
            'Equipe Escala': f.equipe_escala || '-',
            'Contato Corp': f.contato_corp || '-',
            'Contato Pessoal': f.contato_pessoal || '-',
            'Status': f.status,
            'Diária': f.recebe_diaria !== false ? 'SIM' : 'NÃO',
            'Escalar': f.escala_ativa === false ? 'NAO' : 'SIM',
            'Data Desligamento': formatDateBR(f.data_desligamento),
            'Função Anterior': f.funcao_anterior || '-',
            'Data Alt. Função': formatDateBR(f.data_alteracao_funcao)
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        XLSX.utils.book_append_sheet(wb, ws, "Funcionários");
        XLSX.writeFile(wb, `Quadro_Funcionarios_${new Date().toISOString().split('T')[0]}.xlsx`);
    },

    /**
     * Exporta os dados atuais da grid para PDF com padrão visual do sistema
     */
    async exportToPDF() {
        if (!this.listData || this.listData.length === 0) return alert('Não há dados para exportar.');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4'); // Alterado para Vertical (Portrait)

        // Função para garantir logo com fundo branco (padrão world-class)
        const getLogoBase64 = async () => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = 'logo.png';
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg'));
                };
                img.onerror = () => resolve(null);
            });
        };

        const logo = await getLogoBase64();
        if (logo) doc.addImage(logo, 'JPEG', 14, 10, 40, 12);

        doc.setFontSize(18);
        doc.setTextColor(0, 105, 55); // Verde Marquespan
        doc.text('Lista de Funcionários', 60, 18);

        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 196, 18, { align: 'right' }); // Ajustado para margem da folha vertical

        const headers = [['RH', 'Filial', 'Nome', 'Nasc.', 'CNH', 'Cat.', 'Venc. CNH', 'Admissão', 'Função', 'Status']];
        const rows = this.listData.map(f => [
            f.rh_registro,
            f.filial || 'SP',
            f.nome,
            f.data_nascimento ? new Date(f.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}) : '-',
            f.cnh_numero || '-',
            f.cnh_categoria || '-',
            formatDateBR(f.cnh_vencimento),
            formatDateBR(f.data_admissao),
            f.funcao,
            f.status
        ]);

        doc.autoTable({
            head: headers,
            body: rows,
            startY: 25,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55], fontSize: 7 }, // Fonte reduzida no cabeçalho
            styles: { fontSize: 6, cellPadding: 1.5 }, // Fonte reduzida e menos padding no corpo
            alternateRowStyles: { fillColor: [245, 245, 245] },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 6 && isDateBeforeToday(this.listData[data.row.index]?.cnh_vencimento)) {
                    data.cell.styles.textColor = [220, 53, 69];
                    data.cell.styles.fontStyle = 'bold';
                }
                if (data.section === 'body' && data.column.index === 9) { // Coluna Status
                    const status = data.cell.raw;
                    if (status === 'Ativo') data.cell.styles.textColor = [40, 167, 69];
                    if (status === 'Desligado') data.cell.styles.textColor = [220, 53, 69];
                }
            }
        });

        doc.save(`Quadro_Funcionarios_${new Date().toISOString().split('T')[0]}.pdf`);
    }
};

window.FuncionarioUI = FuncionarioUI;
document.addEventListener('DOMContentLoaded', () => FuncionarioUI.init());
