// rotas.js - Lógica para o módulo de Cadastro de Rotas
// Importa o SupabaseService que já existe no scriptcompras.js
// (Assumindo que SupabaseService e UI serão expostos globalmente ou importados)

const RotasUI = {
    init(supabaseService, uiObject) {
        this.SupabaseService = supabaseService;
        this.UI = uiObject; // Referência ao objeto UI principal
        this.cache();
        this.bind();
        this.setupInitialState();
    },

    cache() {
        this.section = document.getElementById('sectionCadastrarRotas');
        this.form = document.getElementById('formCadastrarRota');
        this.tableBody = document.getElementById('rotasTableBody');
        this.btnSubmit = document.getElementById('btnSubmitRota');
        this.btnClearForm = document.getElementById('btnClearRotaForm');
        this.searchInput = document.getElementById('searchRotaInput');
        this.editingIdInput = document.getElementById('rotaEditingId');
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
        }
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.renderGrid());
        }

        // Adiciona listeners para ordenação dos cabeçalhos da tabela
        const ths = this.section?.querySelectorAll('.data-grid thead th[data-field]');
        ths?.forEach(th => {
            const field = th.getAttribute('data-field');
            th.addEventListener('click', () => { this.toggleSort(field) });
        });
    },

    setupInitialState() {
        this._sort = { field: 'numero', ascending: true };
    },

    async handleFormSubmit(e) {
        e.preventDefault();
        const editingId = this.editingIdInput.value;

        const payload = {
            numero: parseInt(document.getElementById('rotaNumero').value),
            semana: document.getElementById('rotaSemana').value,
            responsavel: document.getElementById('rotaResponsavel').value,
            supervisor: document.getElementById('rotaSupervisor').value,
            cidades: document.getElementById('rotaCidades').value,
            dias: parseInt(document.getElementById('rotaDias').value),
        };

        if (!payload.numero || !payload.semana || !payload.responsavel || !payload.cidades || !payload.dias) {
            return alert('Todos os campos da rota são obrigatórios.');
        }

        try {
            if (editingId) {
                await this.SupabaseService.update('rotas', payload, { field: 'id', value: editingId });
                alert('✅ Rota atualizada com sucesso!');
            } else {
                await this.SupabaseService.insert('rotas', payload);
                alert('✅ Rota cadastrada com sucesso!');
            }
            this.clearForm();
            this.renderGrid();
        } catch (err) {
            console.error(err);
            alert(`❌ Erro ao ${editingId ? 'atualizar' : 'cadastrar'} rota.`);
        }
    },

    clearForm() {
        this.form?.reset();
        this.editingIdInput.value = '';
        this.btnSubmit.textContent = 'Cadastrar Rota';
    },

    async loadForEditing(id) {
        try {
            const [rota] = await this.SupabaseService.list('rotas', '*', { eq: { field: 'id', value: id } });
            if (!rota) return alert('Rota não encontrada.');

            this.editingIdInput.value = id;
            document.getElementById('rotaNumero').value = rota.numero || '';
            document.getElementById('rotaSemana').value = rota.semana || '';
            document.getElementById('rotaResponsavel').value = rota.responsavel || '';
            document.getElementById('rotaSupervisor').value = rota.supervisor || '';
            document.getElementById('rotaCidades').value = rota.cidades || '';
            document.getElementById('rotaDias').value = rota.dias || '';

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
            if (confirm('Tem certeza que deseja excluir esta rota?')) {
                try {
                    await this.SupabaseService.remove('rotas', { field: 'id', value: id });
                    this.renderGrid();
                } catch (err) {
                    console.error('Erro ao excluir rota', err);
                    alert('❌ Não foi possível excluir a rota.');
                }
            }
        } else if (btn.classList.contains('btn-edit')) {
            this.loadForEditing(id);
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

    async renderGrid() {
        if (!this.tableBody) return;
        try {
            const searchTerm = this.searchInput?.value.trim();
            let queryOptions = { orderBy: this._sort.field, ascending: this._sort.ascending };

            if (searchTerm) {
                // Para buscar em múltiplos campos, o Supabase precisaria de uma função ou `or`
                // Por simplicidade, vamos buscar em 'responsavel' e 'cidades'
                queryOptions.or = `responsavel.ilike.%${searchTerm}%,cidades.ilike.%${searchTerm}%`;
            }

            const rotas = await this.SupabaseService.list('rotas', '*', queryOptions);
            this.tableBody.innerHTML = rotas.map(r => `
                <tr>
                    <td>${r.numero || ''}</td>
                    <td>${r.semana || ''}</td>
                    <td>${r.responsavel || ''}</td>
                    <td>${r.supervisor || ''}</td>
                    <td>${r.cidades || ''}</td>
                    <td>${r.dias || ''}</td>
                    <td>
                        <button class="btn-edit" data-id="${r.id}">Editar</button>
                        <button class="btn-delete" data-id="${r.id}">Excluir</button>
                    </td>
                </tr>`).join('');
        } catch (e) {
            console.error('Erro ao carregar rotas', e);
            this.tableBody.innerHTML = `<tr><td colspan="7">Erro ao carregar rotas.</td></tr>`;
        }
    }
};
