import { supabaseClient } from './supabase.js';

const SupervisorUI = {
    supervisorEditingId: null,
    data: [], // Armazena todos os supervisores carregados
    filteredData: [], // Armazena os supervisores atualmente filtrados/exibidos
    sortConfig: { key: 'nome', asc: true },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.carregarSupervisores();
    },

    cacheDOM() {
        this.formCadastrarSupervisor = document.getElementById('formCadastrarSupervisor');
        this.supervisorNome = document.getElementById('supervisorNome');
        this.supervisorNomeCompleto = document.getElementById('supervisorNomeCompleto');
        this.supervisorUf = document.getElementById('supervisorUf');
        this.supervisorStatus = document.getElementById('supervisorStatus');
        this.supervisorIdHidden = document.getElementById('supervisorEditingId');
        this.btnSubmitSupervisor = document.getElementById('btnSubmitSupervisor');
        this.btnClearSupervisorForm = document.getElementById('btnClearSupervisorForm');
        this.searchSupervisorInput = document.getElementById('searchSupervisorInput');
        this.supervisorTableBody = document.getElementById('supervisorTableBody');
        this.supervisorSummary = document.getElementById('supervisorSummary');
        this.btnImportarLista = document.getElementById('btnImportarLista');
        this.importFile = document.getElementById('importFile');
    },

    bindEvents() {
        this.formCadastrarSupervisor.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.btnClearSupervisorForm.addEventListener('click', () => this.clearForm());
        this.searchSupervisorInput.addEventListener('input', () => this.renderGrid());
        this.btnImportarLista?.addEventListener('click', () => this.importFile.click());
        this.importFile?.addEventListener('change', (e) => this.handleImport(e));

        // Ordenação nos cabeçalhos
        document.querySelectorAll('.data-grid thead th[data-field]').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.field));
        });
    },

    async carregarSupervisores() {
        this.supervisorTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando supervisores...</td></tr>';
        try {
            const { data, error } = await supabaseClient
                .from('supervisores')
                .select('*')
                .order('nome');

            if (error) throw error;

            this.data = data || [];
            this.renderGrid();
        } catch (err) {
            console.error('Erro ao carregar supervisores:', err);
            this.supervisorTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Erro ao carregar lista.</td></tr>';
        }
    },

    renderGrid() {
        const searchTerm = this.searchSupervisorInput.value.toUpperCase();
        
        this.filteredData = this.data.filter(item => {
            return (item.nome || '').toUpperCase().includes(searchTerm) ||
                   (item.nome_completo || '').toUpperCase().includes(searchTerm) ||
                   (item.uf || '').toUpperCase().includes(searchTerm) ||
                   (item.status || '').toUpperCase().includes(searchTerm);
        });

        // Ordenação Dinâmica
        this.filteredData.sort((a, b) => {
            let valA = a[this.sortConfig.key] || '';
            let valB = b[this.sortConfig.key] || '';
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return this.sortConfig.asc ? -1 : 1;
            if (valA > valB) return this.sortConfig.asc ? 1 : -1;
            return 0;
        });

        this.supervisorTableBody.innerHTML = this.filteredData.map(item => `
            <tr>
                <td>${item.nome}</td>
                <td>${item.nome_completo || '-'}</td>
                <td>${item.uf || '-'}</td>
                <td style="text-align:center;">
                    <span class="badge ${item.status === 'ATIVO' ? 'status-em-dia' : 'status-dispensado'}">${item.status}</span>
                </td>
                <td style="text-align:center;">
                    <button class="btn-icon edit" onclick="window.SupervisorUI.editarSupervisor('${item.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" onclick="window.SupervisorUI.excluirSupervisor('${item.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');

        this.renderSummary();
        this.updateSortIcons();
    },

    handleSort(key) {
        if (this.sortConfig.key === key) {
            this.sortConfig.asc = !this.sortConfig.asc;
        } else {
            this.sortConfig.key = key;
            this.sortConfig.asc = true;
        }
        this.renderGrid();
    },

    updateSortIcons() {
        document.querySelectorAll('th[data-field] i').forEach(icon => {
            icon.className = 'fas fa-sort';
            const th = icon.closest('th');
            if (th.dataset.field === this.sortConfig.key) {
                icon.className = this.sortConfig.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    renderSummary() {
        const ativos = this.filteredData.filter(s => s.status === 'ATIVO').length;
        const inativos = this.filteredData.filter(s => s.status === 'INATIVO').length;
        this.supervisorSummary.innerHTML = `<strong>Total: ${this.filteredData.length}</strong> | Ativos: ${ativos} | Inativos: ${inativos}`;
    },

    async handleFormSubmit(e) {
        e.preventDefault();
        const id = this.supervisorIdHidden.value;
        const payload = {
            nome: this.supervisorNome.value.trim().toUpperCase(),
            nome_completo: this.supervisorNomeCompleto.value.trim().toUpperCase(),
            uf: this.supervisorUf.value.trim().toUpperCase(),
            status: this.supervisorStatus.value,
            updated_at: new Date().toISOString()
        };

        try {
            if (id) {
                const { error } = await supabaseClient.from('supervisores').update(payload).eq('id', id);
                if (error) throw error;
                alert('✅ Supervisor atualizado com sucesso!');
            } else {
                const { error } = await supabaseClient.from('supervisores').insert([payload]);
                if (error) throw error;
                alert('✅ Supervisor cadastrado com sucesso!');
            }
            this.clearForm();
            this.carregarSupervisores();
        } catch (err) {
            console.error('Erro ao salvar supervisor:', err);
            alert('❌ Erro ao salvar: ' + err.message);
        }
    },

    editarSupervisor(id) {
        const supervisor = this.data.find(s => s.id === id);
        if (!supervisor) return;

        this.supervisorIdHidden.value = supervisor.id;
        this.supervisorNome.value = supervisor.nome;
        this.supervisorNomeCompleto.value = supervisor.nome_completo || '';
        this.supervisorUf.value = supervisor.uf || '';
        this.supervisorStatus.value = supervisor.status;

        this.btnSubmitSupervisor.innerHTML = '<i class="fas fa-save"></i> Atualizar';
        this.btnClearSupervisorForm.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async excluirSupervisor(id) {
        if (!confirm('Deseja realmente excluir este supervisor?')) return;

        try {
            const { error } = await supabaseClient.from('supervisores').delete().eq('id', id);
            if (error) throw error;
            alert('✅ Supervisor excluído com sucesso!');
            this.carregarSupervisores();
        } catch (err) {
            console.error('Erro ao excluir supervisor:', err);
            alert('❌ Erro ao excluir: ' + err.message);
        }
    },

    clearForm() {
        this.formCadastrarSupervisor.reset();
        this.supervisorIdHidden.value = '';
        this.btnSubmitSupervisor.innerHTML = '<i class="fas fa-save"></i> Salvar';
        this.btnClearSupervisorForm.classList.add('hidden');
    },

    async handleImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                
                const processed = jsonData.map(row => ({
                    nome: String(row.NOME || '').trim().toUpperCase(),
                    nome_completo: String(row['NOME COMPLETO'] || row.NOME_COMPLETO || row.NOME || '').trim().toUpperCase(),
                    uf: String(row.UF || '').trim().toUpperCase(),
                    status: String(row.STATUS || 'ATIVO').trim().toUpperCase() === 'INATIVO' ? 'INATIVO' : 'ATIVO'
                })).filter(s => s.nome);

                const { error } = await supabaseClient.from('supervisores').upsert(processed, { onConflict: 'nome' });
                if (error) throw error;
                alert(`✅ Importação concluída! ${processed.length} supervisores processados.`);
                this.carregarSupervisores();
            } catch (err) { alert('❌ Erro na importação: ' + err.message); }
            finally { this.importFile.value = ''; }
        };
        reader.readAsArrayBuffer(file);
    }
};

window.SupervisorUI = SupervisorUI;
document.addEventListener('DOMContentLoaded', () => SupervisorUI.init());