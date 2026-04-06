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
        this.histFuncContainer = document.getElementById('historicoFuncaoContainer');
        this.histFuncTableBody = document.getElementById('histFuncTableBody');
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
        if (this.histFuncTableBody) {
            this.histFuncTableBody.addEventListener('dblclick', (e) => this.handleHistoricoDblClick(e));
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

            if (this.editingIdInput.value) await this.carregarHistoricoFuncao(rh);
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
        if (this.histFuncContainer) this.histFuncContainer.classList.add('hidden');
        if (this.histFuncTableBody) this.histFuncTableBody.innerHTML = '';
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
                        <td data-key="funcao_anterior">${h.funcao_anterior}</td>
                        <td data-key="funcao_nova">${h.funcao_nova}</td>
                        <td data-key="data_mudanca" data-value="${h.data_mudanca || ''}">${h.data_mudanca ? new Date(h.data_mudanca + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                    </tr>
                `).join('');
            } else {
                this.histFuncContainer.classList.add('hidden');
            }
        } catch (err) { console.error('Erro ao carregar histórico de função:', err); }
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
        await this.carregarHistoricoFuncao(f.rh_registro);
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