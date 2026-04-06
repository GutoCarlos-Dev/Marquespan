import { supabaseClient } from './supabase.js';

const FuncionarioUI = {
    currentFuncaoBeforeEdit: null,
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

        const rh = document.getElementById('funcRH').value;
        const novaFuncao = document.getElementById('funcFuncao').value;
        const dataHoje = new Date().toISOString().split('T')[0];

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

        const payload = {
            rh_registro: rh,
            nome: document.getElementById('funcNome').value,
            nome_completo: document.getElementById('funcNomeCompleto').value,
            data_admissao: document.getElementById('funcAdmissao').value,
            funcao: novaFuncao,
            contato_corp: document.getElementById('funcContatoCorp').value,
            contato_pessoal: document.getElementById('funcContatoPessoal').value,
            status: document.getElementById('funcStatus').value,
            data_desligamento: document.getElementById('funcDesligamento').value || null,
            funcao_anterior: document.getElementById('funcPromocao').value || null,
            data_alteracao_funcao: document.getElementById('funcDataPromocao').value || null,
            id: this.editingIdInput.value || undefined
        };

        try {
            // Se temos um ID, o upsert resolve pelo ID (padrão). 
            // Se não temos, usamos o rh_registro para evitar duplicidade de matrícula.
            const options = this.editingIdInput.value ? {} : { onConflict: 'rh_registro' };
            const { error } = await supabaseClient.from('funcionario').upsert(payload, options);
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
        this.currentFuncaoBeforeEdit = null;
        this.btnSubmit.textContent = 'Salvar Registro';
        this.btnClearForm.classList.add('hidden');
        this.toggleDesligamentoField();
    },

    async renderGrid() {
        const searchTerm = this.searchInput?.value.toLowerCase().trim() || '';
        try {
            let query = supabaseClient.from('funcionario').select('*').order('nome');
            if (searchTerm) {
                query = query.or(`nome.ilike.%${searchTerm}%,nome_completo.ilike.%${searchTerm}%,rh_registro.ilike.%${searchTerm}%,funcao.ilike.%${searchTerm}%`);
            }
            const { data: list, error } = await query;
            if (error) throw error;

            this.tableBody.innerHTML = list.map(f => `
                <tr>
                    <td><strong>${f.rh_registro}</strong></td>
                    <td title="${f.nome_completo || ''}">${f.nome}</td>
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
        this.currentFuncaoBeforeEdit = f.funcao;
        this.editingIdInput.value = f.id;
        document.getElementById('funcRH').value = f.rh_registro;
        document.getElementById('funcNome').value = f.nome;
        document.getElementById('funcNomeCompleto').value = f.nome_completo || '';
        document.getElementById('funcAdmissao').value = f.data_admissao;
        document.getElementById('funcFuncao').value = f.funcao;
        document.getElementById('funcContatoCorp').value = f.contato_corp || '';
        document.getElementById('funcContatoPessoal').value = f.contato_pessoal || '';
        document.getElementById('funcStatus').value = f.status;
        document.getElementById('funcDesligamento').value = f.data_desligamento || '';
        document.getElementById('funcPromocao').value = f.funcao_anterior || '';
        document.getElementById('funcDataPromocao').value = f.data_alteracao_funcao || '';
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