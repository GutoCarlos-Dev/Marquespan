// hotel.js - Lógica para o módulo de Cadastro de Hotel
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

const HotelUI = {
    init() {
        this.SupabaseService = SupabaseService;
        this.cache();
        this.bind();
        this.setupInitialState();
    },

    cache() {
        this.section = document.getElementById('sectionCadastrarHotel');
        this.form = document.getElementById('formCadastrarHotel');
        this.tableBody = document.getElementById('hotelTableBody');
        this.btnSubmit = document.getElementById('btnSubmitHotel');
        this.btnClearForm = document.getElementById('btnClearHotelForm');
        this.searchInput = document.getElementById('searchHotelInput');
        this.editingIdInput = document.getElementById('hotelEditingId');
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
            nome: document.getElementById('hotelNome').value,
            cnpj: document.getElementById('hotelCnpj').value,
            endereco: document.getElementById('hotelEndereco').value,
            telefone: document.getElementById('hotelTelefone').value,
            responsavel: document.getElementById('hotelResponsavel').value,
        };

        if (!payload.nome || !payload.endereco) {
            return alert('Os campos "Nome do Hotel" e "Endereço" são obrigatórios.');
        }

        try {
            if (editingId) {
                await this.SupabaseService.update('hotel', payload, { field: 'id', value: editingId });
                alert('✅ Hotel atualizado com sucesso!');
            } else {
                await this.SupabaseService.insert('hotel', payload);
                alert('✅ Hotel cadastrado com sucesso!');
            }
            this.clearForm();
            this.renderGrid();
        } catch (err) {
            console.error(err);
            alert(`❌ Erro ao ${editingId ? 'atualizar' : 'cadastrar'} hotel.`);
        }
    },

    clearForm() {
        this.form?.reset();
        this.editingIdInput.value = '';
        this.btnSubmit.textContent = 'Cadastrar Hotel';
    },

    async loadForEditing(id) {
        try {
            const [hotel] = await this.SupabaseService.list('hotel', '*', { eq: { field: 'id', value: id } });
            if (!hotel) return alert('Hotel não encontrado.');

            this.editingIdInput.value = id;
            document.getElementById('hotelNome').value = hotel.nome || '';
            document.getElementById('hotelCnpj').value = hotel.cnpj || '';
            document.getElementById('hotelEndereco').value = hotel.endereco || '';
            document.getElementById('hotelTelefone').value = hotel.telefone || '';
            document.getElementById('hotelResponsavel').value = hotel.responsavel || '';

            this.btnSubmit.textContent = 'Atualizar Hotel';
            this.form.scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            console.error('Erro ao carregar hotel para edição', e);
        }
    },

    async handleTableClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;

        if (btn.classList.contains('btn-delete')) {
            if (confirm('Tem certeza que deseja excluir este hotel?')) {
                try {
                    await this.SupabaseService.remove('hotel', { field: 'id', value: id });
                    this.renderGrid();
                } catch (err) {
                    console.error('Erro ao excluir hotel', err);
                    alert('❌ Não foi possível excluir o hotel.');
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
                queryOptions.or = `nome.ilike.%${searchTerm}%,cnpj.ilike.%${searchTerm}%,responsavel.ilike.%${searchTerm}%`;
            }

            const hoteis = await this.SupabaseService.list('hotel', '*', queryOptions);

            this.tableBody.innerHTML = hoteis.map(h => `
                <tr>
                    <td>${h.nome || ''}</td>
                    <td>${h.cnpj || ''}</td>
                    <td>${h.endereco || ''}</td>
                    <td>${h.telefone || ''}</td>
                    <td>${h.responsavel || ''}</td>
                    <td>
                        <button class="btn-edit" data-id="${h.id}">Editar</button>
                        <button class="btn-delete" data-id="${h.id}">Excluir</button>
                    </td>
                </tr>`).join('');
        } catch (e) {
            console.error('Erro ao carregar hotéis', e);
            this.tableBody.innerHTML = `<tr><td colspan="6">Erro ao carregar hotéis.</td></tr>`;
        }
    }
};

// Inicializa a UI quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    HotelUI.init();
    HotelUI.renderGrid(); // Carrega os dados iniciais
});