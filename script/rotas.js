// rotas.js - Lógica para o módulo de Cadastro de Rotas
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

const RotasUI = {
    init() {
        this.SupabaseService = SupabaseService;
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

        // Atualiza os indicadores de ordenação nos cabeçalhos
        const ths = this.section?.querySelectorAll('.data-grid thead th[data-field]');
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
                const searchConditions = [
                    `semana.ilike.%${searchTerm}%`,
                    `responsavel.ilike.%${searchTerm}%`,
                    `supervisor.ilike.%${searchTerm}%`,
                ];
                // Se o termo de busca for um número, também busca no campo 'numero'
                if (!isNaN(searchTerm)) {
                    searchConditions.push(`numero.eq.${searchTerm}`);
                }
                queryOptions.or = searchConditions.join(',');
            }

            const rotas = await this.SupabaseService.list('rotas', '*', queryOptions);

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
                </tr>`;
            }).join('');
        } catch (e) {
            console.error('Erro ao carregar rotas', e);
            this.tableBody.innerHTML = `<tr><td colspan="7">Erro ao carregar rotas.</td></tr>`;
        }
    }
};

// Inicializa a UI quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    RotasUI.init();
    RotasUI.renderGrid(); // Carrega os dados iniciais
});
