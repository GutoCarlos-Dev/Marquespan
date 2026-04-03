import { supabaseClient } from './supabase.js';

const FuncionarioUI = {
    init() {
        this.cache();
        this.bind();
        this.renderGrid();
    },

    cache() {
        this.form = document.getElementById('formCadastrarFuncionario');
        this.tableBody = document.getElementById('funcTableBody');
        this.btnSubmit = document.getElementById('btnSubmitFunc');
        this.btnClearForm = document.getElementById('btnClearFuncForm');
        this.searchInput = document.getElementById('searchFuncInput');
        this.editingIdInput = document.getElementById('funcEditingId');
        this.statusSelect = document.getElementById('funcStatus');
        this.groupDesligamento = document.getElementById('groupDesligamento');
    },

    bind() {
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
        if (this.btnClearForm) {
            this.btnClearForm.addEventListener('click', () => this.clearForm());
        }
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.renderGrid());
        }
        if (this.statusSelect) {
            this.statusSelect.addEventListener('change', () => this.toggleDesligamentoField());
        }
    },

    toggleDesligamentoField() {
        if (this.statusSelect.value === 'Desligado') {
            this.groupDesligamento.classList.remove('hidden');
        } else {
            this.groupDesligamento.classList.add('hidden');
            document.getElementById('funcDesligamento').value = '';
        }
    },

    async handleFormSubmit(e) {
        e.preventDefault();

        const payload = {
            rh_registro: document.getElementById('funcRH').value,
            nome: document.getElementById('funcNome').value,
            data_admissao: document.getElementById('funcAdmissao').value,
            funcao: document.getElementById('funcFuncao').value,
            contato_corp: document.getElementById('funcContatoCorp').value,
            contato_pessoal: document.getElementById('funcContatoPessoal').value,
            status: document.getElementById('funcStatus').value,
            data_desligamento: document.getElementById('funcDesligamento').value || null,
            promocao_funcao: document.getElementById('funcPromocao').value || null,
            data_promocao: document.getElementById('funcDataPromocao').value || null,
            id: this.editingIdInput.value || undefined
        };

        try {
            const { error } = await supabaseClient.from('funcionario').upsert(payload, { onConflict: 'rh_registro' });
            if (error) throw error;

            alert('✅ Colaborador salvo com sucesso!');
            this.clearForm();
            this.renderGrid();
        } catch (err) {
            console.error('Erro ao salvar funcionário:', err);
            alert(`❌ Erro ao salvar registro: ${err.message}`);
        }
    },

    clearForm() {
        this.form?.reset();
        this.editingIdInput.value = '';
        this.btnSubmit.textContent = 'Salvar Registro';
        this.btnClearForm.classList.add('hidden');
        this.toggleDesligamentoField();
    },

    async renderGrid() {
        const searchTerm = this.searchInput?.value.toLowerCase().trim() || '';
        try {
            let query = supabaseClient.from('funcionario').select('*').order('nome');
            if (searchTerm) {
                query = query.or(`nome.ilike.%${searchTerm}%,rh_registro.ilike.%${searchTerm}%,funcao.ilike.%${searchTerm}%`);
            }
            const { data: list, error } = await query;
            if (error) throw error;

            this.tableBody.innerHTML = list.map(f => `
                <tr>
                    <td><strong>${f.rh_registro}</strong></td>
                    <td>${f.nome}</td>
                    <td>${f.funcao}</td>
                    <td>${f.data_admissao ? new Date(f.data_admissao).toLocaleDateString('pt-BR') : '-'}</td>
                    <td>${f.contato_corp || f.contato_pessoal || '-'}</td>
                    <td><span class="status-badge status-${f.status.toLowerCase()}">${f.status}</span></td>
                    <td>
                        <button class="btn-icon edit" onclick="window.FuncionarioUI.loadForEditing('${f.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" onclick="window.FuncionarioUI.deleteFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (e) { console.error('Erro ao carregar grid:', e); }
    },

    async loadForEditing(id) {
        const { data: f } = await supabaseClient.from('funcionario').select('*').eq('id', id).single();
        if (!f) return;
        this.editingIdInput.value = f.id;
        document.getElementById('funcRH').value = f.rh_registro;
        document.getElementById('funcNome').value = f.nome;
        document.getElementById('funcAdmissao').value = f.data_admissao;
        document.getElementById('funcFuncao').value = f.funcao;
        document.getElementById('funcContatoCorp').value = f.contato_corp || '';
        document.getElementById('funcContatoPessoal').value = f.contato_pessoal || '';
        document.getElementById('funcStatus').value = f.status;
        document.getElementById('funcDesligamento').value = f.data_desligamento || '';
        document.getElementById('funcPromocao').value = f.promocao_funcao || '';
        document.getElementById('funcDataPromocao').value = f.data_promocao || '';
        this.toggleDesligamentoField();
        this.btnSubmit.textContent = 'Atualizar Registro';
        this.btnClearForm.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async deleteFuncionario(id) {
        if (confirm('Deseja realmente excluir este colaborador?')) {
            await supabaseClient.from('funcionario').delete().eq('id', id);
            this.renderGrid();
        }
    }
};

window.FuncionarioUI = FuncionarioUI;
document.addEventListener('DOMContentLoaded', () => FuncionarioUI.init());