// despesas.js - Lógica para o módulo de Cadastro de Despesas
import { supabaseClient } from './supabase.js';

class SupabaseService {
  static async list(table, cols = '*', opts = {}) {
    let q = supabaseClient.from(table).select(cols).order(opts.orderBy || 'id', { ascending: !!opts.ascending });
    if (opts.eq) q = q.eq(opts.eq.field, opts.eq.value);
    if (opts.ilike) q = q.ilike(opts.ilike.field, opts.ilike.value);
    if (opts.or) q = q.or(opts.or);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  static async insert(table, payload) {
    const { data, error } = await supabaseClient.from(table).insert(payload).select();
    if (error) throw error;
    return data;
  }

  static async update(table, payload, key) {
    const { data, error } = await supabaseClient.from(table).update(payload).eq(key.field, key.value).select();
    if (error) throw error;
    return data;
  }

  static async remove(table, key) {
    const { data, error } = await supabaseClient.from(table).delete().eq(key.field, key.value);
    if (error) throw error;
    return data;
  }
}

const DespesasUI = {
  init() {
    this.SupabaseService = SupabaseService;
    this.cache();
    this.bind();
    this.setupInitialState();
    this.populateSelects();
  },

  cache() {
    this.section = document.getElementById('sectionCadastrarDespesa');
    this.form = document.getElementById('formCadastrarDespesa');
    this.tableBody = document.getElementById('despesaTableBody');
    this.btnSubmit = document.getElementById('btnSubmitDespesa');
    this.btnClearForm = document.getElementById('btnClearDespesaForm');
    this.searchInput = document.getElementById('searchDespesaInput');
    this.editingIdInput = document.getElementById('despesaEditingId');

    // Campos do formulário
    this.diariasInput = document.getElementById('despesaDiarias');
    this.valorDiariaInput = document.getElementById('despesaValorDiaria');
    this.valorTotalInput = document.getElementById('despesaValorTotal');
  },

  bind() {
    this.form?.addEventListener('submit', (e) => this.handleFormSubmit(e));
    this.btnClearForm?.addEventListener('click', () => this.clearForm());
    this.tableBody?.addEventListener('click', (e) => this.handleTableClick(e));
    this.searchInput?.addEventListener('input', () => this.renderGrid());

    // Listeners para cálculo automático
    this.diariasInput?.addEventListener('input', () => this.calculateTotal());
    this.valorDiariaInput?.addEventListener('input', () => this.calculateTotal());

    const ths = this.section?.querySelectorAll('.data-grid thead th[data-field]');
    ths?.forEach(th => {
      const field = th.getAttribute('data-field');
      th.addEventListener('click', () => { this.toggleSort(field) });
    });
  },

  setupInitialState() {
    this._sort = { field: 'data_checkin', ascending: false };
  },

  async populateSelects() {
    try {
      const [rotas, hoteis, funcionarios] = await Promise.all([
        this.SupabaseService.list('rotas', 'id, numero', { orderBy: 'numero' }),
        this.SupabaseService.list('hotel', 'id, nome', { orderBy: 'nome' }),
        this.SupabaseService.list('funcionario', 'id, nome', { orderBy: 'nome' })
      ]);

      this.fillSelect('despesaRota', rotas, 'numero', 'numero', 'Selecione uma Rota');
      this.fillSelect('despesaHotel', hoteis, 'id', 'nome', 'Selecione um Hotel');
      this.fillSelect('despesaFuncionario1', funcionarios, 'id', 'nome', 'Selecione o Funcionário 1');
      this.fillSelect('despesaFuncionario2', funcionarios, 'id', 'nome', 'Selecione o Funcionário 2 (Opcional)');

    } catch (error) {
      console.error("Erro ao popular seletores:", error);
      alert("Não foi possível carregar os dados para os formulários. Verifique a conexão e tente novamente.");
    }
  },

  fillSelect(selectId, data, valueField, textField, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = `<option value="">-- ${placeholder} --</option>`;
    data.forEach(item => {
      const option = document.createElement('option');
      option.value = item[valueField];
      option.textContent = item[textField];
      select.appendChild(option);
    });
  },

  calculateTotal() {
    const diarias = parseFloat(this.diariasInput.value) || 0;
    const valorDiaria = parseFloat(this.valorDiariaInput.value) || 0;
    const total = diarias * valorDiaria;
    this.valorTotalInput.value = total.toFixed(2);
  },

  async handleFormSubmit(e) {
    e.preventDefault();
    const editingId = this.editingIdInput.value;

    const payload = {
      numero_rota: document.getElementById('despesaRota').value,
      id_hotel: document.getElementById('despesaHotel').value,
      id_funcionario1: document.getElementById('despesaFuncionario1').value,
      id_funcionario2: document.getElementById('despesaFuncionario2').value || null,
      tipo_quarto: document.getElementById('despesaTipoQuarto').value,
      qtd_diarias: parseInt(document.getElementById('despesaDiarias').value),
      data_reserva: document.getElementById('despesaDataReserva').value || null,
      voucher: document.getElementById('despesaVoucher').value,
      data_checkin: document.getElementById('despesaCheckin').value,
      data_checkout: document.getElementById('despesaCheckout').value,
      valor_diaria: parseFloat(document.getElementById('despesaValorDiaria').value),
      valor_total: parseFloat(document.getElementById('despesaValorTotal').value),
    };

    // Simples validação
    if (!payload.numero_rota || !payload.id_hotel || !payload.id_funcionario1 || !payload.data_checkin || !payload.data_checkout) {
      return alert('Por favor, preencha todos os campos obrigatórios.');
    }

    try {
      if (editingId) {
        await this.SupabaseService.update('despesas', payload, { field: 'id', value: editingId });
        alert('✅ Despesa atualizada com sucesso!');
      } else {
        await this.SupabaseService.insert('despesas', payload);
        alert('✅ Despesa cadastrada com sucesso!');
      }
      this.clearForm();
      this.renderGrid();
    } catch (err) {
      console.error(err);
      alert(`❌ Erro ao ${editingId ? 'atualizar' : 'cadastrar'} despesa.`);
    }
  },

  clearForm() {
    this.form?.reset();
    this.editingIdInput.value = '';
    this.btnSubmit.textContent = 'Cadastrar Despesa';
    this.valorTotalInput.value = '';
  },

  async loadForEditing(id) {
    try {
      const [despesa] = await this.SupabaseService.list('despesas', '*', { eq: { field: 'id', value: id } });
      if (!despesa) return alert('Despesa não encontrada.');

      this.editingIdInput.value = id;
      document.getElementById('despesaRota').value = despesa.numero_rota || '';
      document.getElementById('despesaHotel').value = despesa.id_hotel || '';
      document.getElementById('despesaFuncionario1').value = despesa.id_funcionario1 || '';
      document.getElementById('despesaFuncionario2').value = despesa.id_funcionario2 || '';
      document.getElementById('despesaTipoQuarto').value = despesa.tipo_quarto || '';
      document.getElementById('despesaDiarias').value = despesa.qtd_diarias || '';
      document.getElementById('despesaDataReserva').value = despesa.data_reserva || '';
      document.getElementById('despesaVoucher').value = despesa.voucher || '';
      document.getElementById('despesaCheckin').value = despesa.data_checkin || '';
      document.getElementById('despesaCheckout').value = despesa.data_checkout || '';
      document.getElementById('despesaValorDiaria').value = despesa.valor_diaria || '';
      document.getElementById('despesaValorTotal').value = despesa.valor_total || '';

      this.btnSubmit.textContent = 'Atualizar Despesa';
      this.form.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      console.error('Erro ao carregar despesa para edição', e);
    }
  },

  async handleTableClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains('btn-delete')) {
      if (confirm('Tem certeza que deseja excluir esta despesa?')) {
        try {
          await this.SupabaseService.remove('despesas', { field: 'id', value: id });
          this.renderGrid();
        } catch (err) {
          console.error('Erro ao excluir despesa', err);
          alert('❌ Não foi possível excluir a despesa.');
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
      // Consulta complexa com joins
      const selectQuery = `
        id,
        numero_rota,
        hotel!inner ( nome ),
        funcionario1:funcionario!despesas_id_funcionario1_fkey ( nome ),
        valor_total,
        data_checkin
      `;

      let query = supabaseClient.from('despesas').select(selectQuery).order(this._sort.field, { ascending: this._sort.ascending });
      
      if (searchTerm) {
        const searchConditions = [
          `hotel.nome.ilike.%${searchTerm}%`,
          `funcionario1.nome.ilike.%${searchTerm}%`
        ];
        if (!isNaN(searchTerm)) {
          searchConditions.push(`numero_rota.eq.${searchTerm}`);
        }
        query = query.or(searchConditions.join(','), { foreignTable: 'hotel' });
        query = query.or(searchConditions.join(','), { foreignTable: 'funcionario1' });
      }

      const { data: despesas, error } = await query;
      if (error) throw error;

      this.tableBody.innerHTML = despesas.map(d => `
        <tr>
          <td>${d.numero_rota || ''}</td>
          <td>${d.hotel?.nome || 'N/A'}</td>
          <td>${d.funcionario1?.nome || 'N/A'}</td>
          <td>${d.valor_total ? `R$ ${d.valor_total.toFixed(2)}` : ''}</td>
          <td>${d.data_checkin ? new Date(d.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</td>
          <td>
            <button class="btn-edit" data-id="${d.id}">Editar</button>
            <button class="btn-delete" data-id="${d.id}">Excluir</button>
          </td>
        </tr>`).join('');
    } catch (e) {
      console.error('Erro ao carregar despesas', e);
      this.tableBody.innerHTML = `<tr><td colspan="6">Erro ao carregar despesas.</td></tr>`;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  DespesasUI.init();
  DespesasUI.renderGrid();
});
