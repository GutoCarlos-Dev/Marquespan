// rotas.js - Lógica para o módulo de Cadastro de Rotas
import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const ROTAS_PAGE_ID = 'rotas.html';

class SupabaseService {
  static async list(table, cols='*', opts={}){
    let q = supabaseClient.from(table).select(cols).order(opts.orderBy||'id',{ascending:!!opts.ascending});
    if(opts.eq) q = q.eq(opts.eq.field, opts.eq.value);
    if(Array.isArray(opts.eqList)) {
      opts.eqList.forEach(filter => {
        if (filter?.field && filter.value !== undefined && filter.value !== null && filter.value !== '') {
          q = q.eq(filter.field, filter.value);
        }
      });
    }
    if(opts.ilike) q = q.ilike(opts.ilike.field, opts.ilike.value);
    if(opts.or) q = q.or(opts.or);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  static async insert(table, payload){
    const { data, error } = await supabaseClient.from(table).insert(payload).select();
    if (error) throw error;
    return data;
  }

  static async update(table, payload, key){
    const { data, error } = await supabaseClient.from(table).update(payload).eq(key.field, key.value).select();
    if (error) throw error;
    return data;
  }

  static async remove(table, key){
    const { data, error } = await supabaseClient.from(table).delete().eq(key.field, key.value);
    if (error) throw error;
    return data;
  }
}

const RotasUI = {
    async init() {
        const acessoPermitido = await this.verificarPermissaoPagina();
        if (!acessoPermitido) return;

        this.SupabaseService = SupabaseService;
        this.cache();
        this.aplicarModoAcesso();
        this.setupFiltroGridFilial();
        this.bind();
        this.setupInitialState();
        this.carregarSupervisores();
        this.carregarFiliais(); // Carrega as filiais ao iniciar
        this.renderGrid();
    },

    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
        } catch {
            return null;
        }
    },

    normalizarNivel(nivel) {
        return String(nivel || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    },

    usuarioTemAcessoTotal() {
        const nivel = this.normalizarNivel(this.getCurrentUser()?.nivel);
        return nivel === 'administrador' || nivel === 'gerencia' || nivel === 'gerencia_tmg';
    },

    usuarioSomenteVisualiza() {
        return !this.usuarioTemAcessoTotal();
    },

    getFilialUsuario() {
        return String(this.getCurrentUser()?.filial || '').trim().toUpperCase();
    },

    // gerencia_tmg tem acesso total (igual gerencia) mas so enxerga a propria Filial —
    // diferente de administrador/gerencia, que enxergam todas. Restricao de filial e
    // independente do acesso de edicao.
    usuarioRestritoPorFilial() {
        const nivel = this.normalizarNivel(this.getCurrentUser()?.nivel);
        if (nivel === 'administrador' || nivel === 'gerencia') return false;
        return Boolean(this.getFilialUsuario());
    },

    aplicarModoAcesso() {
        if (!this.usuarioSomenteVisualiza()) return;

        const form = document.getElementById('formCadastrarRota');
        if (form) form.style.display = 'none';

        const formTitle = document.querySelector('#sectionCadastrarRotas > h3');
        if (formTitle) formTitle.style.display = 'none';

        const bulkActions = document.getElementById('rotasBulkActions');
        if (bulkActions) bulkActions.style.display = 'none';

        const selectAll = document.getElementById('selectAllRotas');
        if (selectAll) selectAll.disabled = true;
    },

    async verificarPermissaoPagina() {
        const usuario = this.getCurrentUser();
        const nivel = this.normalizarNivel(usuario?.nivel);

        if (!nivel) {
            window.location.href = 'index.html';
            return false;
        }

        if (nivel === 'administrador' || nivel === 'gerencia') {
            return true;
        }

        try {
            const { data, error } = await supabaseClient
                .from('nivel_permissoes')
                .select('paginas_permitidas')
                .eq('nivel', nivel)
                .single();

            if (error) throw error;

            if ((data?.paginas_permitidas || []).includes(ROTAS_PAGE_ID)) {
                return true;
            }
        } catch (error) {
            console.error('Erro ao verificar permissao da pagina de rotas:', error);
        }

        document.body.innerHTML = `
            <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:Arial,sans-serif;">
                <div>
                    <h1 style="margin-bottom:12px;">Acesso negado</h1>
                    <p>Voce nao tem permissao para acessar a pagina de rotas.</p>
                    <a href="menu.html" style="display:inline-block;margin-top:16px;color:#2563eb;">Voltar ao menu</a>
                </div>
            </div>
        `;
        return false;
    },

    cache() {
        this.section = document.getElementById('sectionCadastrarRotas');
        this.form = document.getElementById('formCadastrarRota');
        this.tableBody = document.getElementById('rotasTableBody');
        this.btnSubmit = document.getElementById('btnSubmitRota');
        this.btnClearForm = document.getElementById('btnClearRotaForm');
        this.searchInput = document.getElementById('searchRotaInput');
        this.rotaSummary = document.getElementById('rotaSummary');
        this.editingIdInput = document.getElementById('rotaEditingId');
        this.supervisorSelect = document.getElementById('rotaSupervisor');
        this.filialSelect = document.getElementById('rotaFilial'); // Novo campo Filial
        this.filtroGridFilial = document.getElementById('filtroGridFilial');
        this.filtroGridSemana = document.getElementById('filtroGridSemana');
        this.filtroGridSupervisor = document.getElementById('filtroGridSupervisor');
        this.filtroGridStatus = document.getElementById('filtroGridStatus');
        this.rotasBulkActions = document.getElementById('rotasBulkActions');
        this.rotasSelecionadasCount = document.getElementById('rotasSelecionadasCount');
        this.bulkStatusRotas = document.getElementById('bulkStatusRotas');
        this.btnAplicarStatusRotas = document.getElementById('btnAplicarStatusRotas');
        this.selectAllRotas = document.getElementById('selectAllRotas');

        // Botão e input de importação
        this.btnImportarLista = document.getElementById('btnImportarLista');
        this.importFileInput = document.getElementById('importFile');
        this.btnExportarXLSX = document.getElementById('btnExportarXLSX');
    },

    bind() {
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
        if (this.btnClearForm) {
            this.btnClearForm.addEventListener('click', () => this.clearForm());
        }
        if (this.tableBody) {
            this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
            this.tableBody.addEventListener('click', (e) => this.handleRotaCheckboxClick(e));
            this.tableBody.addEventListener('change', () => this.updateRotasBulkState());
        }
        if (this.selectAllRotas) {
            this.selectAllRotas.addEventListener('change', () => this.toggleTodasRotasVisiveis());
        }
        if (this.btnAplicarStatusRotas) {
            this.btnAplicarStatusRotas.addEventListener('click', () => this.aplicarStatusRotasSelecionadas());
        }
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.renderGrid());
        }
        if (this.filtroGridFilial) {
            this.filtroGridFilial.addEventListener('change', () => this.renderGrid());
        }
        if (this.filtroGridSemana) {
            this.filtroGridSemana.addEventListener('change', () => this.renderGrid());
        }
        if (this.filtroGridSupervisor) {
            this.filtroGridSupervisor.addEventListener('change', () => this.renderGrid());
        }
        if (this.filtroGridStatus) {
            this.filtroGridStatus.addEventListener('change', () => this.renderGrid());
        }

        // Eventos de importação
        if (this.btnImportarLista) {
            this.btnImportarLista.addEventListener('click', () => this.handleImportClick());
            this.importFileInput.addEventListener('change', (e) => this.handleFileImport(e));
        }

        if (this.btnExportarXLSX) {
            this.btnExportarXLSX.addEventListener('click', () => this.exportToExcel());
        }

        // Adiciona listeners para ordenação dos cabeçalhos da tabela
        const ths = this.section?.querySelectorAll('.data-grid thead th[data-field]');
        ths?.forEach(th => {
            const field = th.getAttribute('data-field');
            th.addEventListener('click', () => { this.toggleSort(field) });
        });
    },

    setupFiltroGridFilial() {
        if (!this.searchInput || document.getElementById('filtroGridFilial')) {
            this.filtroGridFilial = document.getElementById('filtroGridFilial');
            this.filtroGridSemana = document.getElementById('filtroGridSemana');
            this.filtroGridSupervisor = document.getElementById('filtroGridSupervisor');
            this.filtroGridStatus = document.getElementById('filtroGridStatus');
            return;
        }

        const searchGroup = this.searchInput.closest('.form-group') || this.searchInput.parentElement;
        if (!searchGroup?.parentNode) return;

        const filtrosContainer = document.createElement('div');
        filtrosContainer.className = 'rotas-grid-filtros';

        const filtroGroup = document.createElement('div');
        filtroGroup.className = 'form-group';

        const label = document.createElement('label');
        label.htmlFor = 'filtroGridFilial';
        label.textContent = 'Filial';

        const select = document.createElement('select');
        select.id = 'filtroGridFilial';
        select.className = 'glass-input';
        select.innerHTML = '<option value="">Todas</option>';

        filtroGroup.appendChild(label);
        filtroGroup.appendChild(select);

        const semanaGroup = document.createElement('div');
        semanaGroup.className = 'form-group';

        const semanaLabel = document.createElement('label');
        semanaLabel.htmlFor = 'filtroGridSemana';
        semanaLabel.textContent = 'Semana';

        const semanaSelect = document.createElement('select');
        semanaSelect.id = 'filtroGridSemana';
        semanaSelect.className = 'glass-input';
        semanaSelect.innerHTML = `
            <option value="">Todas</option>
            <option value="SEGUNDA">SEGUNDA</option>
            <option value="TERÇA">TERÇA</option>
            <option value="QUARTA">QUARTA</option>
            <option value="QUINTA">QUINTA</option>
            <option value="SEXTA">SEXTA</option>
            <option value="EXTRA">EXTRA</option>
            <option value="AVULSA">AVULSA</option>
        `;

        semanaGroup.appendChild(semanaLabel);
        semanaGroup.appendChild(semanaSelect);

        const supervisorGroup = document.createElement('div');
        supervisorGroup.className = 'form-group';

        const supervisorLabel = document.createElement('label');
        supervisorLabel.htmlFor = 'filtroGridSupervisor';
        supervisorLabel.textContent = 'Supervisor';

        const supervisorSelect = document.createElement('select');
        supervisorSelect.id = 'filtroGridSupervisor';
        supervisorSelect.className = 'glass-input';
        supervisorSelect.innerHTML = '<option value="">Todos</option>';

        supervisorGroup.appendChild(supervisorLabel);
        supervisorGroup.appendChild(supervisorSelect);

        const statusGroup = document.createElement('div');
        statusGroup.className = 'form-group';

        const statusLabel = document.createElement('label');
        statusLabel.htmlFor = 'filtroGridStatus';
        statusLabel.textContent = 'Status';

        const statusSelect = document.createElement('select');
        statusSelect.id = 'filtroGridStatus';
        statusSelect.className = 'glass-input';
        statusSelect.innerHTML = `
            <option value="">Todos</option>
            <option value="ATIVA">ATIVA</option>
            <option value="INATIVA">INATIVA</option>
        `;

        statusGroup.appendChild(statusLabel);
        statusGroup.appendChild(statusSelect);

        filtrosContainer.append(filtroGroup, semanaGroup, supervisorGroup, statusGroup);
        searchGroup.parentNode.insertBefore(filtrosContainer, searchGroup);
        this.filtroGridFilial = select;
        this.filtroGridSemana = semanaSelect;
        this.filtroGridSupervisor = supervisorSelect;
        this.filtroGridStatus = statusSelect;
    },

    setupInitialState() {
        this._sort = { field: 'numero', ascending: true };
        this.displayedRotas = []; // Armazena os dados filtrados para exportação
    },

    async carregarSupervisores() {
        try {
            // Busca a lista de supervisores ativos da base de supervisores
            const { data, error } = await supabaseClient
                .from('supervisores') // Tabela alimentada pela página supervisor.html
                .select('nome')
                .eq('status', 'ATIVO');
            
            if (error) throw error;

            if (this.supervisorSelect && data) {
                this.supervisorSelect.innerHTML = '<option value="">Selecione o Supervisor</option>';
                const supervisores = [...new Set(data.map(s => s.nome).filter(Boolean))].sort();
                supervisores.forEach(sup => {
                    this.supervisorSelect.add(new Option(sup, sup));
                });
            }
            if (this.filtroGridSupervisor && data) {
                const valorAtual = this.filtroGridSupervisor.value;
                this.filtroGridSupervisor.innerHTML = '<option value="">Todos</option>';
                const supervisores = [...new Set(data.map(s => s.nome).filter(Boolean))].sort();
                supervisores.forEach(sup => {
                    this.filtroGridSupervisor.add(new Option(sup, sup));
                });
                if (valorAtual && Array.from(this.filtroGridSupervisor.options).some(opt => opt.value === valorAtual)) {
                    this.filtroGridSupervisor.value = valorAtual;
                }
            }
        } catch (err) {
            console.error('Erro ao carregar lista de supervisores:', err);
        }
    },

    async carregarFiliais() {
        const filialUsuario = this.getFilialUsuario();
        const restringirFilial = this.usuarioRestritoPorFilial();

        try {
            const { data, error } = await supabaseClient
                .from('filiais')
                .select('nome, sigla')
                .order('nome', { ascending: true });

            if (error) throw error;

            const filiais = restringirFilial
                ? (data || []).filter(f => String(f.sigla || f.nome || '').trim().toUpperCase() === filialUsuario)
                : (data || []);

            if (this.filialSelect) {
                this.filialSelect.innerHTML = '<option value="">Selecione a Filial</option>';
                filiais.forEach(f => {
                    const value = f.sigla || f.nome;
                    this.filialSelect.add(new Option(f.sigla ? `${f.nome} (${f.sigla})` : f.nome, value));
                });
            }

            if (this.filtroGridFilial) {
                this.filtroGridFilial.innerHTML = restringirFilial ? '' : '<option value="">Todas</option>';
                filiais.forEach(f => {
                    const value = f.sigla || f.nome;
                    this.filtroGridFilial.add(new Option(f.sigla ? `${f.nome} (${f.sigla})` : f.nome, value));
                });
            }

            if (restringirFilial) {
                [this.filialSelect, this.filtroGridFilial].filter(Boolean).forEach(sel => {
                    if (!Array.from(sel.options).some(o => String(o.value).trim().toUpperCase() === filialUsuario)) {
                        sel.add(new Option(filialUsuario, filialUsuario));
                    }
                    sel.value = filialUsuario;
                    sel.disabled = true;
                });
            }
        } catch (err) {
            console.error('Erro ao carregar lista de filiais:', err);
        }
    },

    async handleFormSubmit(e) {
        e.preventDefault();
        if (this.usuarioSomenteVisualiza()) {
            alert('Seu nivel de acesso permite somente visualizar as rotas.');
            return;
        }

        const editingId = this.editingIdInput.value;
        const payload = {
            numero: document.getElementById('rotaNumero').value.trim(),
            semana: document.getElementById('rotaSemana').value,
            supervisor: document.getElementById('rotaSupervisor').value,
            responsavel: document.getElementById('rotaSupervisor').value || '',
            cidades: document.getElementById('rotaCidades').value.trim(),
            dias: parseInt(document.getElementById('rotaDias').value, 10) || 0,
            status: document.getElementById('rotaStatus').value,
            filial: document.getElementById('rotaFilial').value
        };

        if (!payload.numero || !payload.semana || !payload.status || !payload.cidades || !payload.dias) {
            return alert('Todos os campos da rota sao obrigatorios.');
        }

        try {
            const { error } = editingId
                ? await supabaseClient.from('rotas').update(payload).eq('id', editingId)
                : await supabaseClient.from('rotas').upsert(payload, { onConflict: 'numero' });
            if (error) throw error;

            registrarAuditoria(editingId ? 'ALTERAR' : 'INCLUIR', 'Rotas', `${editingId ? 'Alteracao' : 'Inclusao'} da rota no ${payload.numero}`);
            alert('Rota salva com sucesso!');
            this.clearForm();
            await this.renderGrid();
        } catch (err) {
            console.error('Erro ao salvar rota:', err);
            alert(`Erro ao salvar rota: ${err.message}`);
        }
    },
    clearForm() {
        this.form?.reset();
        this.editingIdInput.value = '';
        this.btnSubmit.textContent = 'Cadastrar Rota';
    },

    async loadForEditing(id) {
        try {
            const { data: rota, error } = await supabaseClient.from('rotas').select('*').eq('id', id).single();
            if (error) throw error;
            if (!rota) return alert('Rota não encontrada.');

            this.editingIdInput.value = rota.id;
            document.getElementById('rotaNumero').value = rota.numero || '';
            document.getElementById('rotaSemana').value = rota.semana || '';
            document.getElementById('rotaSupervisor').value = rota.supervisor || '';
            document.getElementById('rotaCidades').value = rota.cidades || '';
            document.getElementById('rotaDias').value = rota.dias || '';
            document.getElementById('rotaStatus').value = rota.status || 'ATIVA';
            document.getElementById('rotaFilial').value = rota.filial || ''; // Preenche Filial

            this.btnSubmit.textContent = 'Atualizar Rota';
            this.form.scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            console.error('Erro ao carregar rota para edição', e);
        }
    },

    async handleTableClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;

        if (btn.classList.contains('btn-delete')) {
            if (this.usuarioSomenteVisualiza()) {
                alert('Seu nivel de acesso permite somente visualizar as rotas.');
                return;
            }
            if (confirm('Tem certeza que deseja excluir esta rota?')) {
                try {
                    const rotaExcluida = this._data?.find(r => r.id == id);
                    await this.SupabaseService.remove('rotas', { field: 'id', value: id });
                    registrarAuditoria('EXCLUIR', 'Rotas', `Exclusão da rota nº ${rotaExcluida?.numero || id}`);
                    this.renderGrid();
                } catch (err) {
                    console.error('Erro ao excluir rota', err);
                    alert('❌ Não foi possível excluir a rota.');
                }
            }
        } else if (btn.classList.contains('btn-edit')) {
            if (this.usuarioSomenteVisualiza()) {
                alert('Seu nivel de acesso permite somente visualizar as rotas.');
                return;
            }
            this.loadForEditing(id);
        }
    },

    getRotasSelecionadas() {
        return Array.from(this.tableBody?.querySelectorAll('.rota-select-checkbox:checked') || [])
            .map(input => input.value)
            .filter(Boolean);
    },

    handleRotaCheckboxClick(e) {
        const checkbox = e.target.closest('.rota-select-checkbox');
        if (!checkbox) return;

        const checkboxes = Array.from(this.tableBody?.querySelectorAll('.rota-select-checkbox') || []);
        const currentIndex = checkboxes.indexOf(checkbox);
        if (currentIndex < 0) return;

        if (e.shiftKey && this.lastRotaCheckboxIndex !== undefined && this.lastRotaCheckboxIndex !== null) {
            const start = Math.min(this.lastRotaCheckboxIndex, currentIndex);
            const end = Math.max(this.lastRotaCheckboxIndex, currentIndex);
            const checked = checkbox.checked;

            checkboxes.slice(start, end + 1).forEach(input => {
                input.checked = checked;
            });
        }

        this.lastRotaCheckboxIndex = currentIndex;
        this.updateRotasBulkState();
    },

    updateRotasBulkState() {
        const checkboxes = Array.from(this.tableBody?.querySelectorAll('.rota-select-checkbox') || []);
        const selecionadas = checkboxes.filter(input => input.checked);

        if (this.rotasSelecionadasCount) {
            const total = selecionadas.length;
            this.rotasSelecionadasCount.textContent = `${total} ${total === 1 ? 'rota selecionada' : 'rotas selecionadas'}`;
        }

        if (this.selectAllRotas) {
            this.selectAllRotas.checked = checkboxes.length > 0 && selecionadas.length === checkboxes.length;
            this.selectAllRotas.indeterminate = selecionadas.length > 0 && selecionadas.length < checkboxes.length;
        }

        if (this.btnAplicarStatusRotas) {
            this.btnAplicarStatusRotas.disabled = selecionadas.length === 0;
        }
    },

    toggleTodasRotasVisiveis() {
        const checked = Boolean(this.selectAllRotas?.checked);
        this.tableBody?.querySelectorAll('.rota-select-checkbox').forEach(input => {
            input.checked = checked;
        });
        this.updateRotasBulkState();
    },

    async aplicarStatusRotasSelecionadas() {
        if (this.usuarioSomenteVisualiza()) {
            alert('Seu nivel de acesso permite somente visualizar as rotas.');
            return;
        }

        const ids = this.getRotasSelecionadas();
        const status = this.bulkStatusRotas?.value;

        if (!ids.length) {
            alert('Selecione pelo menos uma rota.');
            return;
        }

        if (!status) {
            alert('Escolha se deseja ativar ou inativar as rotas selecionadas.');
            return;
        }

        const acao = status === 'ATIVA' ? 'ativar' : 'inativar';
        if (!confirm(`Deseja ${acao} ${ids.length} rota(s) selecionada(s)?`)) return;

        const originalText = this.btnAplicarStatusRotas?.innerHTML;
        if (this.btnAplicarStatusRotas) {
            this.btnAplicarStatusRotas.disabled = true;
            this.btnAplicarStatusRotas.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando...';
        }

        try {
            const { error } = await supabaseClient
                .from('rotas')
                .update({ status })
                .in('id', ids);

            if (error) throw error;

            registrarAuditoria('ALTERAR', 'Rotas', `${status === 'ATIVA' ? 'Ativacao' : 'Inativacao'} em lote de ${ids.length} rota(s)`);
            alert(`${ids.length} rota(s) ${status === 'ATIVA' ? 'ativada(s)' : 'inativada(s)'} com sucesso!`);
            if (this.bulkStatusRotas) this.bulkStatusRotas.value = '';
            if (this.selectAllRotas) {
                this.selectAllRotas.checked = false;
                this.selectAllRotas.indeterminate = false;
            }
            await this.renderGrid();
        } catch (err) {
            console.error('Erro ao atualizar rotas em lote:', err);
            alert('Erro ao atualizar rotas selecionadas: ' + err.message);
        } finally {
            if (this.btnAplicarStatusRotas) {
                this.btnAplicarStatusRotas.innerHTML = originalText;
                this.updateRotasBulkState();
            }
        }
    },

    toggleSort(field) {
        if (this._sort.field === field) {
            this._sort.ascending = !this._sort.ascending;
        } else {
            this._sort.field = field;
            this._sort.ascending = true;
        }
        this.renderGrid();
    },

    handleImportClick() {
        if (this.usuarioSomenteVisualiza()) {
            alert('Seu nivel de acesso permite somente visualizar as rotas.');
            return;
        }
        this.importFileInput.click();
    },

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                if (json.length === 0) {
                    alert('A planilha está vazia ou em um formato inválido.');
                    return;
                }

                await this.processImportedData(json);

            } catch (error) {
                console.error('Erro ao processar o arquivo XLSX:', error);
                alert('Ocorreu um erro ao ler a planilha. Verifique se o formato está correto.');
            } finally {
                // Limpa o valor do input para permitir a importação do mesmo arquivo novamente
                this.importFileInput.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    },

    async processImportedData(importedRows) {
        if (!confirm(`Foram encontradas ${importedRows.length} rotas na planilha. Deseja continuar?\n\nAtenção:\n1. Rotas existentes (pelo número) serão ATUALIZADAS.\n2. Rotas novas serão CADASTRADAS.`)) {
            return;
        }

        const upsertPayload = importedRows.map(row => {
            // Vazio, em branco (só espaços) ou ausente -> ATIVA. Também normaliza a caixa
            // (ex.: "ativa"/"Inativa" na planilha) para bater com os valores usados no sistema.
            const statusPlanilha = String(row.STATUS ?? '').trim().toUpperCase();

            return {
                numero: row.ROTA,
                semana: row.SEMANA,
                supervisor: row.SUPERVISOR,
                responsavel: row.RESPONSAVEL || row.RESPONSÁVEL || row.SUPERVISOR || '',
                cidades: row.CIDADES,
                dias: row.DIAS,
                status: statusPlanilha || 'ATIVA',
                filial: row.FILIAL // Novo campo Filial
            };
        }).filter(r => r.numero); // Garante que a rota tenha um número

        if (upsertPayload.length === 0) {
            alert("Nenhuma rota válida encontrada na planilha para importar.");
            return;
        }

        // Confere a sessão ANTES de tentar gravar — evita mandar a planilha inteira pro banco
        // só pra descobrir, via um "permission denied", que o login expirou nessa aba (comum
        // quando há mais de uma aba aberta: o refresh token de uma invalida o da outra).
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            alert('Sua sessão expirou. Atualize a página (F5) e faça login novamente antes de importar.');
            return;
        }

        try {
            // O método 'upsert' do Supabase faz exatamente o que precisamos:
            // Insere se não existir, atualiza se existir, com base na chave primária ou em uma constraint.
            // Assumindo que 'numero' é a chave primária ou tem uma constraint UNIQUE.
            const { error } = await supabaseClient
                .from('rotas')
                .upsert(upsertPayload, { onConflict: 'numero' });

            if (error) throw error;

            alert(`Importação concluída com sucesso! ${upsertPayload.length} rotas foram processadas.`);
            this.renderGrid();
        } catch (error) {
            console.error('Erro detalhado no processamento:', error);

            const mensagem = String(error.message || '');
            if (mensagem.toLowerCase().includes('permission denied') || error.code === '42501') {
                alert(
                    'Não foi possível gravar as rotas: acesso negado pelo banco.\n\n' +
                    'Isso costuma acontecer quando a sessão expirou nesta aba (ex.: outra aba do sistema ' +
                    'foi aberta e "tomou" a sessão). Atualize a página (F5), faça login novamente e tente ' +
                    'importar de novo.\n\nSe o erro persistir mesmo após relogar, seu nível de acesso pode ' +
                    'não ter permissão para editar Rotas — fale com o administrador.'
                );
            } else {
                alert('Erro ao processar os dados e atualizar o banco: ' + error.message);
            }
        }
    },

    async renderGrid() {
        if (!this.tableBody) return;

        // Atualiza os indicadores de ordenação nos cabeçalhos
        const ths = this.section?.querySelectorAll('.data-grid thead th[data-field]');
        ths?.forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.field === this._sort.field) {
                th.classList.add(this._sort.ascending ? 'sort-asc' : 'sort-desc');
            }
        });

        let rotas = [];
        try {
            const searchTerm = this.searchInput?.value.trim();
            const filialUsuario = this.getFilialUsuario();
            const restringirFilial = this.usuarioRestritoPorFilial();
            const filialFiltro = restringirFilial ? filialUsuario : (this.filtroGridFilial?.value || '');
            const semanaFiltro = this.filtroGridSemana?.value || '';
            const supervisorFiltro = this.filtroGridSupervisor?.value || '';
            const statusFiltro = this.filtroGridStatus?.value || '';
            let queryOptions = { orderBy: this._sort.field, ascending: this._sort.ascending };

            const eqList = [];
            if (filialFiltro) {
                eqList.push({ field: 'filial', value: filialFiltro });
            }
            if (semanaFiltro) {
                eqList.push({ field: 'semana', value: semanaFiltro });
            }
            if (supervisorFiltro) {
                eqList.push({ field: 'supervisor', value: supervisorFiltro });
            }
            if (statusFiltro) {
                eqList.push({ field: 'status', value: statusFiltro });
            }
            if (eqList.length) {
                queryOptions.eqList = eqList;
            }

            if (searchTerm) {
                const searchConditions = [
                    `numero.ilike.%${searchTerm}%`,
                    `filial.ilike.%${searchTerm}%`,
                    `supervisor.ilike.%${searchTerm}%`,
                    `cidades.ilike.%${searchTerm}%`,
                    `status.ilike.%${searchTerm}%`
                ];
                queryOptions.or = searchConditions.join(',');
            }
            rotas = await this.SupabaseService.list('rotas', '*', queryOptions);
            
            // Armazena no estado para permitir exportação do que está visível
            this.displayedRotas = rotas;

            const dayClassMap = {
                'SEGUNDA': 'semana-segunda',
                'TERÇA': 'semana-terca',
                'QUARTA': 'semana-quarta',
                'QUINTA': 'semana-quinta',
                'SEXTA': 'semana-sexta',
            };

            this.tableBody.innerHTML = rotas.map(r => {
                const rowClass = dayClassMap[r.semana] || '';
                return `
                <tr class="${rowClass}">
                    <td class="rotas-select-col">
                        ${this.usuarioSomenteVisualiza() ? '' : `<input type="checkbox" class="rota-select-checkbox" value="${r.id}" aria-label="Selecionar rota ${r.numero || ''}">`}
                    </td>
                    <td>${r.filial || ''}</td> <!-- Nova primeira coluna -->
                    <td>${r.numero || ''}</td>
                    <td>${r.semana || ''}</td>
                    <td>${r.supervisor || ''}</td>
                    <td>${r.cidades || ''}</td>
                    <td>${r.dias || ''}</td>
                    <td><span class="status-badge ${r.status === 'INATIVA' ? 'status-inativa' : 'status-ativa'}">${r.status || 'ATIVA'}</span></td>
                    <td>
                        ${this.usuarioSomenteVisualiza() ? '' : `
                        <button class="btn-edit" data-id="${r.id}">Editar</button>
                        <button class="btn-delete" data-id="${r.id}">Excluir</button>
                        `}
                    </td>
                </tr>`;
            }).join('');
            this.lastRotaCheckboxIndex = null;
            this.updateRotasBulkState();
        } catch (e) {
            console.error('Erro ao carregar rotas', e);
            this.tableBody.innerHTML = `<tr><td colspan="9">Erro ao carregar rotas.</td></tr>`;
        }

        // Renderiza o resumo após carregar o grid
        this.renderSummary(rotas);
    },

    exportToExcel() {
        if (!this.displayedRotas || this.displayedRotas.length === 0) {
            return alert('Não há dados filtrados para exportar. Realize uma busca primeiro.');
        }

        // Mapeia para colunas amigáveis em português
        const dataToExport = this.displayedRotas.map(r => ({
            'FILIAL': r.filial || '-',
            'NÚMERO DA ROTA': r.numero || '-',
            'SEMANA': r.semana || '-',
            'SUPERVISOR': r.supervisor || '-',
            'CIDADES ATENDIDAS': r.cidades || '-',
            'QTD DIAS': r.dias || 0,
            'STATUS': r.status || 'ATIVA'
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Rotas_Cadastradas");

        // Define larguras automáticas básicas para as colunas
        ws['!cols'] = [
            { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 40 }, { wch: 10 }, { wch: 12 }
        ];

        const dataAtual = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Marquespan_Cadastro_Rotas_${dataAtual}.xlsx`);
    },

    renderSummary(rotas) {
        if (!this.rotaSummary) return;

        const summaryData = {};

        rotas.forEach(rota => {
            const supervisor = rota.supervisor || 'Não Atribuído';
            if (!summaryData[supervisor]) {
                summaryData[supervisor] = {
                    quantidadeRotas: 0,
                    totalDias: 0
                };
            }
            summaryData[supervisor].quantidadeRotas++;
            summaryData[supervisor].totalDias += (rota.dias || 0);
        });

        // --- Cálculos para o totalizador ---
        const totalSupervisores = Object.keys(summaryData).length;
        const totalRotas = rotas.length; // Mais simples que somar, é só pegar o total de rotas
        const totalGeralDias = Object.values(summaryData).reduce((sum, data) => sum + data.totalDias, 0);

        let summaryHtml = `
            <h3>Resumo por Supervisor</h3>
            <table>
                <thead>
                    <tr>
                        <th>Supervisor</th>
                        <th>Quantidade de Rotas</th>
                        <th>Total de Dias</th>
                    </tr>
                </thead>
                <tbody>
        `;
        for (const supervisor in summaryData) {
            summaryHtml += `
                <tr>
                    <td>${supervisor}</td>
                    <td>${summaryData[supervisor].quantidadeRotas}</td>
                    <td>${summaryData[supervisor].totalDias}</td>
                </tr>
            `;
        }
        summaryHtml += `
                </tbody>
                <tfoot>
                    <tr class="summary-total">
                        <td><strong>${totalSupervisores} Supervisor(es)</strong></td>
                        <td><strong>${totalRotas} Rota(s)</strong></td>
                        <td><strong>${totalGeralDias} Dia(s)</strong></td>
                    </tr>
                </tfoot>
            </table>`;
        this.rotaSummary.innerHTML = summaryHtml;
    }
};

// Inicializa a UI quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    RotasUI.init();
});
