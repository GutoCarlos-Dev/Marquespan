// funcionario.js - Lógica para o módulo de Cadastro de Funcionário
import { supabaseClient } from './supabase.js';

class SupabaseService {
  static async list(table, cols='*', opts={}){
    let q = supabaseClient.from(table).select(cols).order(opts.orderBy||'id',{ascending:!!opts.ascending});
    if(opts.eq) q = q.eq(opts.eq.field, opts.eq.value);
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

const FuncionarioUI = {
    init() {
        this.SupabaseService = SupabaseService;
        this.cache();
        this.bind();
        this.setupInitialState();
    },

    cache() {
        this.section = document.getElementById('sectionCadastrarFuncionario');
        this.form = document.getElementById('formCadastrarFuncionario');
        this.tableBody = document.getElementById('funcionarioTableBody');
        this.btnSubmit = document.getElementById('btnSubmitFuncionario');
        this.btnClearForm = document.getElementById('btnClearFuncionarioForm');
        this.searchInput = document.getElementById('searchFuncionarioInput');
        this.editingIdInput = document.getElementById('funcionarioEditingId');
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

        const ths = this.section?.querySelectorAll('.data-grid thead th[data-field]');
        ths?.forEach(th => {
            const field = th.getAttribute('data-field');
            th.addEventListener('click', () => { this.toggleSort(field) });
        });
    },

    setupInitialState() {
        this._sort = { field: 'nome', ascending: true };
    },

    async handleFormSubmit(e) {
        e.preventDefault();
        const editingId = this.editingIdInput.value;

        const payload = {
            nome: document.getElementById('funcionarioNome').value,
            nome_completo: document.getElementById('funcionarioNomeCompleto').value,
            cpf: document.getElementById('funcionarioCpf').value,
            funcao: document.getElementById('funcionarioFuncao').value,
        };

        if (!payload.nome || !payload.funcao) {
            return alert('Os campos "Nome" e "Função" são obrigatórios.');
        }

        try {
            if (editingId) {
                await this.SupabaseService.update('funcionario', payload, { field: 'id', value: editingId });
                alert('✅ Funcionário atualizado com sucesso!');
            } else {
                await this.SupabaseService.insert('funcionario', payload);
                alert('✅ Funcionário cadastrado com sucesso!');
            }
            this.clearForm();
            this.renderGrid();
        } catch (err) {
            console.error(err);
            alert(`❌ Erro ao ${editingId ? 'atualizar' : 'cadastrar'} funcionário.`);
        }
    },

    clearForm() {
        this.form?.reset();
        this.editingIdInput.value = '';
        this.btnSubmit.textContent = 'Cadastrar Funcionário';
    },

    async loadForEditing(id) {
        try {
            const [funcionario] = await this.SupabaseService.list('funcionario', '*', { eq: { field: 'id', value: id } });
            if (!funcionario) return alert('Funcionário não encontrado.');

            this.editingIdInput.value = id;
            document.getElementById('funcionarioNome').value = funcionario.nome || '';
            document.getElementById('funcionarioNomeCompleto').value = funcionario.nome_completo || '';
            document.getElementById('funcionarioCpf').value = funcionario.cpf || '';
            document.getElementById('funcionarioFuncao').value = funcionario.funcao || '';

            this.btnSubmit.textContent = 'Atualizar Funcionário';
            this.form.scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            console.error('Erro ao carregar funcionário para edição', e);
        }
    },

    async handleTableClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;

        if (btn.classList.contains('btn-delete')) {
            if (confirm('Tem certeza que deseja excluir este funcionário?')) {
                try {
                    await this.SupabaseService.remove('funcionario', { field: 'id', value: id });
                    this.renderGrid();
                } catch (err) {
                    console.error('Erro ao excluir funcionário', err);
                    alert('❌ Não foi possível excluir o funcionário.');
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

        const ths = this.section?.querySelectorAll('.data-grid tbody th[data-field]');
        ths?.forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.field === this._sort.field) {
                th.classList.add(this._sort.ascending ? 'sort-asc' : 'sort-desc');
            }
        });

        try {
            const searchTerm = this.searchInput?.value.trim();
            let queryOptions = { orderBy: this._sort.field, ascending: this._sort.ascending };

            if (searchTerm) {
                queryOptions.or = `nome.ilike.%${searchTerm}%,nome_completo.ilike.%${searchTerm}%,cpf.ilike.%${searchTerm}%,funcao.ilike.%${searchTerm}%`;
            }

            const funcionarios = await this.SupabaseService.list('funcionario', '*', queryOptions);

            this.tableBody.innerHTML = funcionarios.map(f => `
                <tr>
                    <td>${f.nome || ''}</td>
                    <td>${f.nome_completo || ''}</td>
                    <td>${f.cpf || ''}</td>
                    <td>${f.funcao || ''}</td>
                    <td>
                        <button class="btn-edit" data-id="${f.id}">Editar</button>
                        <button class="btn-delete" data-id="${f.id}">Excluir</button>
                    </td>
                </tr>`).join('');
        } catch (e) {
            console.error('Erro ao carregar funcionários', e);
            this.tableBody.innerHTML = `<tr><td colspan="5">Erro ao carregar funcionários.</td></tr>`;
        }
    }
};

// Inicializa a UI quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    FuncionarioUI.init();
    FuncionarioUI.renderGrid(); // Carrega os dados iniciais
});