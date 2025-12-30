import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const TanqueUI = {
        
        init() {
            this.cache();
            this.bind();
            this.renderTable();
        },

        cache() {
            this.form = document.getElementById('formTanque');
            this.editingIdInput = document.getElementById('tanqueEditingId');
            this.nomeInput = document.getElementById('tanqueNome');
            this.capacidadeInput = document.getElementById('tanqueCapacidade');
            this.tipoCombustivelSelect = document.getElementById('tanqueTipoCombustivel');
            this.tableBody = document.getElementById('tableBodyTanques');
            this.btnSalvar = document.getElementById('btnSalvarTanque');
            this.btnLimpar = document.getElementById('btnLimparForm');
        },

        bind() {
            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.tableBody.addEventListener('click', this.handleTableClick.bind(this));
            this.btnLimpar.addEventListener('click', this.clearForm.bind(this));
        },

        async getTanques() {
            try {
                const { data, error } = await supabaseClient
                    .from('tanques')
                    .select('*')
                    .order('nome', { ascending: true });
                
                if (error) throw error;
                return data || [];
            } catch (error) {
                console.error('Erro ao buscar tanques:', error);
                alert('Erro ao carregar a lista de tanques.');
                return [];
            }
        },

        async handleFormSubmit(e) {
            e.preventDefault();

            // Converte o valor para um formato numérico padrão, removendo pontos e trocando vírgula por ponto.
            const capacidadeString = this.capacidadeInput.value.replace(/\./g, '').replace(',', '.');
            const capacidadeValue = parseFloat(capacidadeString);

            // Validação para garantir que a capacidade é um número válido e positivo.
            if (isNaN(capacidadeValue) || capacidadeValue <= 0) {
                alert('Por favor, insira uma capacidade válida e maior que zero.');
                this.capacidadeInput.focus();
                return;
            }

            const payload = {
                nome: this.nomeInput.value,
                capacidade: capacidadeValue,
                tipo_combustivel: this.tipoCombustivelSelect.value
            };

            // Se estiver editando, adiciona o ID ao payload
            if (this.editingIdInput.value) {
                payload.id = parseInt(this.editingIdInput.value, 10);
            }

            try {
                const { error } = await supabaseClient.from('tanques').upsert(payload);
                if (error) throw error;

                alert(`Tanque ${this.editingIdInput.value ? 'atualizado' : 'salvo'} com sucesso!`);
                this.clearForm();
                this.renderTable();
            } catch (error) {
                console.error('Erro ao salvar tanque:', error);
                alert('Erro ao salvar tanque: ' + error.message);
            }
        },

        async renderTable() {
            this.tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando...</td></tr>';
            const tanques = await this.getTanques();
            this.tableBody.innerHTML = '';

            if (tanques.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="4">Nenhum tanque cadastrado.</td></tr>';
                return;
            }

            tanques.forEach(tanque => {
                const tr = document.createElement('tr');

                tr.innerHTML = `
                    <td>${tanque.nome}</td>
                    <td>${tanque.capacidade.toLocaleString('pt-BR')} L</td>
                    <td>${tanque.tipo_combustivel || '-'}</td>
                    <td class="actions-cell">
                        <button class="btn-edit" data-id="${tanque.id}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="btn-delete" data-id="${tanque.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBody.appendChild(tr);
            });
        },

        handleTableClick(e) {
            const button = e.target.closest('button');
            if (!button) return;

            const id = parseInt(button.dataset.id, 10);

            if (button.classList.contains('btn-edit')) {
                this.loadForEditing(id);
            } else if (button.classList.contains('btn-delete')) {
                if (confirm('Tem certeza que deseja excluir este tanque?')) {
                    this.deleteTanque(id);
                }
            }
        },

        async loadForEditing(id) {
            try {
                const { data: tanque, error } = await supabaseClient
                    .from('tanques')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;
                if (!tanque) return;

                this.editingIdInput.value = tanque.id;
                this.nomeInput.value = tanque.nome;
                // Formata o número para o padrão brasileiro (ex: 7500.5 vira "7.500,5") para exibição.
                this.capacidadeInput.value = (tanque.capacidade || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                this.tipoCombustivelSelect.value = tanque.tipo_combustivel || "";
                this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Atualizar Tanque';
                this.form.scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error('Erro ao carregar tanque para edição:', error);
                alert('Erro ao carregar dados do tanque.');
            }
        },

        async deleteTanque(id) {
            try {
                const { error } = await supabaseClient.from('tanques').delete().eq('id', id);
                if (error) throw error;
                this.renderTable();
            } catch (error) {
                console.error('Erro ao excluir tanque:', error);
                alert('Erro ao excluir tanque.');
            }
        },

        clearForm() {
            this.form.reset();
            this.editingIdInput.value = '';
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Tanque';
            this.nomeInput.focus();
        }
    };

    TanqueUI.init();
});