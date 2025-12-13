// script/despesas.js - Lógica para o módulo de Cadastro de Despesas
import { supabaseClient } from './supabase.js';

const DespesasUI = {
    init() {
        this.cache();
        this.bind();
        this.loadInitialData();
    },

    cache() {
        // Formulário e campos
        this.form = document.getElementById('formCadastrarDespesa');
        this.editingIdInput = document.getElementById('despesaEditingId');
        this.btnSubmit = document.getElementById('btnSubmitDespesa');
        this.btnClearForm = document.getElementById('btnClearDespesaForm');

        // Campos para cálculo
        this.qtdDiariasInput = document.getElementById('despesaDiarias');
        this.valorDiariaInput = document.getElementById('despesaValorDiaria');
        this.valorEnergiaInput = document.getElementById('despesaValorEnergia');
        this.valorTotalInput = document.getElementById('despesaValorTotal');

        // Tabela e busca
        this.tableBody = document.getElementById('despesaTableBody');
        this.searchInput = document.getElementById('searchDespesaInput');

        // Datalists
        this.rotasList = document.getElementById('rotasList');
        this.hoteisList = document.getElementById('hoteisList');
        this.funcionarios1List = document.getElementById('funcionarios1List');
        this.funcionarios2List = document.getElementById('funcionarios2List');
        this.tipoQuartoSelect = document.getElementById('despesaTipoQuarto');
    },

    bind() {
        this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.btnClearForm.addEventListener('click', () => this.clearForm());
        this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
        this.searchInput.addEventListener('input', () => this.renderGrid());

        // ** Adiciona os listeners para o cálculo automático do valor total **
        this.qtdDiariasInput.addEventListener('input', () => this.calcularValorTotal());
        this.valorDiariaInput.addEventListener('input', () => this.calcularValorTotal());
        this.valorEnergiaInput.addEventListener('input', () => this.calcularValorTotal());

        // Listener para carregar tipos de quarto quando um hotel é selecionado
        document.getElementById('despesaHotelInput').addEventListener('change', (e) => this.loadTiposQuarto(e.target.value));
    },

    async loadInitialData() {
        this.renderGrid();
        this.loadDatalists();
    },

    /**
     * Calcula o valor total com base na diária, energia e quantidade de dias.
     */
    calcularValorTotal() {
        const qtdDiarias = parseFloat(this.qtdDiariasInput.value) || 0;
        const valorDiaria = parseFloat(this.valorDiariaInput.value) || 0;
        const valorEnergia = parseFloat(this.valorEnergiaInput.value) || 0;

        // Fórmula corrigida: (Valor da Diária * Quantidade de Diárias) + Valor da Energia
        const valorTotal = (valorDiaria * qtdDiarias) + valorEnergia;

        // Formata o valor como moeda brasileira (BRL) e exibe no campo
        this.valorTotalInput.value = valorTotal.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    },

    async handleFormSubmit(e) {
        e.preventDefault();

        // Pega o valor total calculado e converte de volta para número
        const valorTotalString = this.valorTotalInput.value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        const valorTotal = parseFloat(valorTotalString) || 0;

        const payload = {
            id: this.editingIdInput.value || undefined,
            numero_rota: document.getElementById('despesaRotaInput').value,
            hotel_nome: document.getElementById('despesaHotelInput').value, // Assumindo que você vai relacionar pelo nome
            funcionario1_nome: document.getElementById('despesaFuncionario1Input').value,
            funcionario2_nome: document.getElementById('despesaFuncionario2Input').value || null,
            tipo_quarto: this.tipoQuartoSelect.value,
            qtd_diarias: parseInt(this.qtdDiariasInput.value),
            data_reserva: document.getElementById('despesaDataReserva').value || null,
            nota_fiscal: document.getElementById('despesaNotaFiscal').value || null,
            observacao: document.getElementById('despesaObservacao').value || null,
            data_checkin: document.getElementById('despesaCheckin').value,
            data_checkout: document.getElementById('despesaCheckout').value,
            valor_diaria: parseFloat(this.valorDiariaInput.value),
            valor_energia: parseFloat(this.valorEnergiaInput.value) || 0,
            valor_total: valorTotal // Usa o valor já calculado e formatado
        };

        try {
            // Lógica para buscar IDs de hotel e funcionários antes de salvar
            // Ex: const { data: hotel } = await supabaseClient.from('hoteis').select('id').eq('nome', payload.hotel_nome).single();
            // payload.hotel_id = hotel.id;

            const { error } = await supabaseClient.from('despesas').upsert(payload);
            if (error) throw error;

            alert('✅ Despesa salva com sucesso!');
            this.clearForm();
            this.renderGrid();
        } catch (err) {
            console.error('Erro ao salvar despesa:', err);
            alert(`❌ Erro ao salvar despesa: ${err.message}`);
        }
    },

    clearForm() {
        this.form.reset();
        this.editingIdInput.value = '';
        this.btnSubmit.textContent = 'Cadastrar Despesa';
        this.valorTotalInput.value = ''; // Limpa o campo de valor total
        this.tipoQuartoSelect.innerHTML = '<option value="">-- Selecione um hotel primeiro --</option>';
        this.tipoQuartoSelect.disabled = true;
    },

    async loadForEditing(id) {
        try {
            // Correção: A sintaxe do select foi ajustada para o padrão do Supabase.
            // Assumindo que as colunas de chave estrangeira são id_hotel, id_funcionario1, id_funcionario2.
            // A sintaxe correta é: nome_da_tabela_relacionada(colunas)
            const { data: despesa, error } = await supabaseClient
                .from('despesas')
                .select('*, hoteis(nome), funcionario1:id_funcionario1(nome), funcionario2:id_funcionario2(nome)') // Mantive a sintaxe que você tinha, mas adicionei checagens abaixo
                .eq('id', id).single();
            if (error) throw error;

            this.editingIdInput.value = despesa.id;
            document.getElementById('despesaRotaInput').value = despesa.numero_rota;
            // Correção: Adiciona verificação para evitar erro se a relação não retornar dados.
            // O Supabase retorna o objeto da relação com o nome da tabela (ex: hoteis) ou o alias que demos (ex: funcionario1).
            document.getElementById('despesaHotelInput').value = despesa.hoteis?.nome || '';
            document.getElementById('despesaFuncionario1Input').value = despesa.funcionario1?.nome || '';
            document.getElementById('despesaFuncionario2Input').value = despesa.funcionario2?.nome || '';
            this.qtdDiariasInput.value = despesa.qtd_diarias;
            document.getElementById('despesaDataReserva').value = despesa.data_reserva;
            document.getElementById('despesaNotaFiscal').value = despesa.nota_fiscal;
            document.getElementById('despesaObservacao').value = despesa.observacao;
            document.getElementById('despesaCheckin').value = despesa.data_checkin;
            document.getElementById('despesaCheckout').value = despesa.data_checkout;
            this.valorDiariaInput.value = despesa.valor_diaria;
            this.valorEnergiaInput.value = despesa.valor_energia || 0;

            // Carrega os tipos de quarto e seleciona o correto
            await this.loadTiposQuarto(despesa.hoteis?.nome, despesa.tipo_quarto);

            this.calcularValorTotal(); // Recalcula o total ao carregar
            this.btnSubmit.textContent = 'Atualizar Despesa';
            this.form.scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            console.error('Erro ao carregar despesa para edição:', err);
        }
    },

    async handleTableClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;

        if (btn.classList.contains('btn-delete')) {
            if (confirm('Tem certeza que deseja excluir esta despesa?')) {
                try {
                    await supabaseClient.from('despesas').delete().eq('id', id);
                    this.renderGrid();
                } catch (err) {
                    alert('❌ Não foi possível excluir a despesa.');
                }
            }
        } else if (btn.classList.contains('btn-edit')) {
            this.loadForEditing(id);
        }
    },

    async renderGrid() {
        // Lógica para buscar e renderizar a tabela de despesas
        try {
            const searchTerm = this.searchInput.value.trim();
            // Correção: A sintaxe do select foi ajustada para o padrão do Supabase.
            // Assumindo que as colunas de chave estrangeira são id_hotel e id_funcionario1.
            // A sintaxe correta é: nome_da_tabela_relacionada(colunas)
            let query = supabaseClient
                .from('despesas')
                .select('id, numero_rota, valor_total, data_checkin, hoteis(nome), funcionario1:id_funcionario1(nome), funcionario2:id_funcionario2(nome)');

            if (searchTerm) {
                // Correção: A busca em tabelas relacionadas usa a sintaxe `tabela_relacionada.coluna.ilike...`
                // Adicionando a busca por nome de funcionário também.
                query = query.or(`numero_rota.ilike.%${searchTerm}%,hoteis.nome.ilike.%${searchTerm}%,funcionario1.nome.ilike.%${searchTerm}%,funcionario2.nome.ilike.%${searchTerm}%`);
            }

            const { data: despesas, error } = await query.order('data_checkin', { ascending: false });
            if (error) throw error;

            this.tableBody.innerHTML = despesas.map(d => `
                <tr>
                    <td>${d.numero_rota}</td>
                    <td>${d.hoteis?.nome || 'N/A'}</td> 
                    <td>
                        ${d.funcionario1?.nome || 'N/A'}
                        ${d.funcionario2?.nome ? `<br><small>${d.funcionario2.nome}</small>` : ''}
                    </td>
                    <td>${(d.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${new Date(d.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>
                        <button class="btn-edit" data-id="${d.id}">Editar</button>
                        <button class="btn-delete" data-id="${d.id}">Excluir</button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Erro ao renderizar grid de despesas:', err);
            this.tableBody.innerHTML = `<tr><td colspan="6">Erro ao carregar dados.</td></tr>`;
        }
    },

    async loadDatalists() {
        // Lógica para carregar as opções dos datalists (rotas, hoteis, funcionarios)
    },

    async loadTiposQuarto(nomeHotel, selectedTipo) {
        // Lógica para carregar os tipos de quarto de um hotel específico
    }
};

document.addEventListener('DOMContentLoaded', () => {
    DespesasUI.init();
});