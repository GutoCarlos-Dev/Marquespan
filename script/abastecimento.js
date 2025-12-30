import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const AbastecimentoUI = {
        init() {
            this.cache();
            this.bind();
            this.loadTanques();
            this.renderTable();
            
            // Define a data de hoje como padrão
            this.dataInput.valueAsDate = new Date();
        },

        cache() {
            this.form = document.getElementById('formAbastecimento');
            this.editingIdInput = document.getElementById('abastecimentoEditingId');
            this.dataInput = document.getElementById('absData');
            this.notaInput = document.getElementById('absNota');
            this.tanqueSelect = document.getElementById('absTanque');
            this.qtdInput = document.getElementById('absQtd');
            this.vlrLitroInput = document.getElementById('absVlrLitro');
            this.totalInput = document.getElementById('absTotal');
            this.tableBody = document.getElementById('tableBodyAbastecimentos');
            this.btnSalvar = document.getElementById('btnSalvarAbs');
            this.btnLimpar = document.getElementById('btnLimparAbs');
        },

        bind() {
            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.tableBody.addEventListener('click', this.handleTableClick.bind(this));
            this.btnLimpar.addEventListener('click', this.clearForm.bind(this));
            
            // Cálculo automático do total
            this.qtdInput.addEventListener('input', this.calculateTotal.bind(this));
            this.vlrLitroInput.addEventListener('input', this.calculateTotal.bind(this));
        },

        calculateTotal() {
            const qtd = parseFloat(this.qtdInput.value) || 0;
            const vlr = parseFloat(this.vlrLitroInput.value) || 0;
            const total = qtd * vlr;
            
            this.totalInput.value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        },

        async loadTanques() {
            try {
                const { data, error } = await supabaseClient
                    .from('tanques')
                    .select('id, nome, tipo_combustivel')
                    .order('nome');

                if (error) throw error;

                this.tanqueSelect.innerHTML = '<option value="">-- Selecione --</option>';
                data.forEach(tanque => {
                    const option = document.createElement('option');
                    option.value = tanque.id;
                    option.textContent = `${tanque.nome} (${tanque.tipo_combustivel})`;
                    this.tanqueSelect.appendChild(option);
                });
            } catch (error) {
                console.error('Erro ao carregar tanques:', error);
                this.tanqueSelect.innerHTML = '<option value="">Erro ao carregar</option>';
            }
        },

        async getAbastecimentos() {
            try {
                // Faz join com a tabela de tanques para pegar o nome
                const { data, error } = await supabaseClient
                    .from('abastecimentos')
                    .select('*, tanques(nome)')
                    .order('data', { ascending: false });
                
                if (error) throw error;
                return data || [];
            } catch (error) {
                console.error('Erro ao buscar abastecimentos:', error);
                return [];
            }
        },

        async handleFormSubmit(e) {
            e.preventDefault();

            const qtd = parseFloat(this.qtdInput.value);
            const vlr = parseFloat(this.vlrLitroInput.value);

            if (qtd <= 0 || vlr <= 0) {
                alert('Quantidade e Valor por Litro devem ser maiores que zero.');
                return;
            }

            const payload = {
                data: this.dataInput.value,
                numero_nota: this.notaInput.value,
                tanque_id: parseInt(this.tanqueSelect.value),
                qtd_litros: qtd,
                valor_litro: vlr,
                valor_total: qtd * vlr
            };

            if (this.editingIdInput.value) {
                payload.id = parseInt(this.editingIdInput.value);
            }

            try {
                const { error } = await supabaseClient.from('abastecimentos').upsert(payload);
                if (error) throw error;

                alert(`Abastecimento ${this.editingIdInput.value ? 'atualizado' : 'registrado'} com sucesso!`);
                this.clearForm();
                this.renderTable();
            } catch (error) {
                console.error('Erro ao salvar:', error);
                alert('Erro ao salvar abastecimento: ' + error.message);
            }
        },

        async renderTable() {
            this.tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';
            const registros = await this.getAbastecimentos();
            this.tableBody.innerHTML = '';

            if (registros.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="6">Nenhum registro encontrado.</td></tr>';
                return;
            }

            registros.forEach(reg => {
                const tr = document.createElement('tr');
                const dataFormatada = new Date(reg.data + 'T00:00:00').toLocaleDateString('pt-BR');
                const totalFormatado = (reg.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const vlrLitroFormatado = (reg.valor_litro || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const tanqueNome = reg.tanques ? reg.tanques.nome : 'Tanque excluído';

                tr.innerHTML = `
                    <td>${dataFormatada}</td>
                    <td>${tanqueNome}</td>
                    <td>${reg.qtd_litros.toLocaleString('pt-BR')} L</td>
                    <td>${vlrLitroFormatado}</td>
                    <td>${totalFormatado}</td>
                    <td class="actions-cell">
                        <button class="btn-edit" data-id="${reg.id}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="btn-delete" data-id="${reg.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBody.appendChild(tr);
            });
        },

        async handleTableClick(e) {
            const button = e.target.closest('button');
            if (!button) return;
            const id = parseInt(button.dataset.id);

            if (button.classList.contains('btn-edit')) {
                const { data, error } = await supabaseClient.from('abastecimentos').select('*').eq('id', id).single();
                if (!error && data) {
                    this.editingIdInput.value = data.id;
                    this.dataInput.value = data.data;
                    this.notaInput.value = data.numero_nota;
                    this.tanqueSelect.value = data.tanque_id;
                    this.qtdInput.value = data.qtd_litros;
                    this.vlrLitroInput.value = data.valor_litro;
                    this.calculateTotal();
                    this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Atualizar';
                }
            } else if (button.classList.contains('btn-delete')) {
                if (confirm('Deseja excluir este registro?')) {
                    await supabaseClient.from('abastecimentos').delete().eq('id', id);
                    this.renderTable();
                }
            }
        },

        clearForm() {
            this.form.reset();
            this.editingIdInput.value = '';
            this.dataInput.valueAsDate = new Date();
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Registrar Entrada';
        }
    };

    AbastecimentoUI.init();
});