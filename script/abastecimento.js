import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const AbastecimentoUI = {
        init() {
            this.tanquesDisponiveis = [];
            this.initTabs();
            this.cache();
            this.bind();
            this.loadTanques();
            this.renderTable();
            
            // Define a data de hoje como padrão
            this.dataInput.valueAsDate = new Date();
        },

        initTabs() {
            const buttons = document.querySelectorAll('#menu-abastecimento .painel-btn');
            const sections = document.querySelectorAll('.main-content .section');

            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    buttons.forEach(b => b.classList.remove('active'));
                    sections.forEach(s => s.classList.add('hidden'));

                    btn.classList.add('active');
                    const targetId = btn.getAttribute('data-secao');
                    document.getElementById(targetId)?.classList.remove('hidden');
                });
            });
        },

        cache() {
            this.form = document.getElementById('formAbastecimento');
            this.editingIdInput = document.getElementById('abastecimentoEditingId');
            this.dataInput = document.getElementById('absData');
            this.notaInput = document.getElementById('absNota');
            this.qtdTotalNotaInput = document.getElementById('absQtdTotalNota');
            this.vlrLitroInput = document.getElementById('absVlrLitro');
            this.totalInput = document.getElementById('absTotal');
            this.tableBody = document.getElementById('tableBodyAbastecimentos');
            this.btnSalvar = document.getElementById('btnSalvarAbs');
            this.btnLimpar = document.getElementById('btnLimparAbs');
            this.distribuicaoContainer = document.getElementById('distribuicao-container');
            this.btnAdicionarTanque = document.getElementById('btnAdicionarTanque');
            this.litrosRestantesValor = document.getElementById('litros-restantes-valor');
        },

        bind() {
            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.tableBody.addEventListener('click', this.handleTableClick.bind(this));
            this.btnLimpar.addEventListener('click', this.clearForm.bind(this));
            
            // Cálculo automático do total
            this.qtdTotalNotaInput.addEventListener('input', this.calculateTotal.bind(this));
            this.vlrLitroInput.addEventListener('input', this.calculateTotal.bind(this));

            this.btnAdicionarTanque.addEventListener('click', () => this.adicionarLinhaTanque());
            this.distribuicaoContainer.addEventListener('input', this.updateLitrosRestantes.bind(this));
            this.distribuicaoContainer.addEventListener('click', this.handleDistribuicaoClick.bind(this));
        },

        calculateTotal() {
            const qtd = parseFloat(this.qtdTotalNotaInput.value) || 0;
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

                this.tanquesDisponiveis = data || [];
                this.adicionarLinhaTanque(); // Adiciona a primeira linha automaticamente
            } catch (error) {
                console.error('Erro ao carregar tanques:', error);
            }
        },

        adicionarLinhaTanque(tanqueId = '', qtd = '') {
            const row = document.createElement('div');
            row.className = 'distribuicao-row';

            const select = document.createElement('select');
            select.className = 'tanque-select';
            select.innerHTML = '<option value="">-- Selecione um Tanque --</option>';
            this.tanquesDisponiveis.forEach(t => {
                const option = new Option(`${t.nome} (${t.tipo_combustivel})`, t.id);
                select.add(option);
            });
            select.value = tanqueId;

            const inputQtd = document.createElement('input');
            inputQtd.type = 'number';
            inputQtd.className = 'tanque-qtd';
            inputQtd.placeholder = 'Litros';
            inputQtd.step = '0.01';
            inputQtd.min = '0.01';
            inputQtd.value = qtd;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn-remove-tanque';
            removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
            removeBtn.title = 'Remover linha';

            row.appendChild(select);
            row.appendChild(inputQtd);
            row.appendChild(removeBtn);

            this.distribuicaoContainer.appendChild(row);
            this.updateLitrosRestantes();
        },

        updateLitrosRestantes() {
            const totalNota = parseFloat(this.qtdTotalNotaInput.value) || 0;
            let totalDistribuido = 0;
            this.distribuicaoContainer.querySelectorAll('.tanque-qtd').forEach(input => {
                totalDistribuido += parseFloat(input.value) || 0;
            });

            const restantes = totalNota - totalDistribuido;
            this.litrosRestantesValor.textContent = restantes.toFixed(2);
            this.litrosRestantesValor.className = restantes < 0 ? 'negativo' : 'positivo';
        },

        async getAbastecimentos() {
            try {
                // Faz join com a tabela de tanques para pegar o nome
                const { data, error } = await supabaseClient
                    .from('abastecimentos')
                    .select('*, tanques(nome, tipo_combustivel)')
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

            const totalNota = parseFloat(this.qtdTotalNotaInput.value);
            const vlr = parseFloat(this.vlrLitroInput.value);
            const notaFiscal = this.notaInput.value;

            if (totalNota <= 0 || vlr <= 0) {
                alert('Quantidade Total e Valor por Litro devem ser maiores que zero.');
                return;
            }

            const linhas = this.distribuicaoContainer.querySelectorAll('.distribuicao-row');
            if (linhas.length === 0) {
                alert('Adicione pelo menos um tanque para a distribuição.');
                return;
            }

            const payloads = [];
            const tanquesUsados = new Set();
            let totalDistribuido = 0;

            for (const linha of linhas) {
                const tanqueId = linha.querySelector('.tanque-select').value;
                const qtd = parseFloat(linha.querySelector('.tanque-qtd').value);

                if (!tanqueId || isNaN(qtd) || qtd <= 0) {
                    alert('Todas as linhas de distribuição devem ter um tanque e uma quantidade válida.');
                    return;
                }
                if (tanquesUsados.has(tanqueId)) {
                    alert('Não é permitido selecionar o mesmo tanque mais de uma vez.');
                    return;
                }

                tanquesUsados.add(tanqueId);
                totalDistribuido += qtd;

                payloads.push({
                    data: this.dataInput.value,
                    numero_nota: notaFiscal,
                    tanque_id: parseInt(tanqueId),
                    qtd_litros: qtd,
                    valor_litro: vlr,
                    valor_total: qtd * vlr
                });
            }

            if (Math.abs(totalDistribuido - totalNota) > 0.001) {
                alert(`A soma dos litros distribuídos (${totalDistribuido.toFixed(2)} L) não corresponde à Quantidade Total da Nota (${totalNota.toFixed(2)} L).`);
                return;
            }

            try {
                // Se estiver editando, primeiro apaga os registros antigos da mesma nota
                if (this.editingIdInput.value) {
                    const { error: deleteError } = await supabaseClient.from('abastecimentos').delete().eq('numero_nota', this.editingIdInput.value);
                    if (deleteError) throw deleteError;
                }

                const { error } = await supabaseClient.from('abastecimentos').insert(payloads);
                if (error) throw error;

                alert(`Abastecimento ${this.editingIdInput.value ? 'atualizado' : 'registrado'} com sucesso!`);
                this.clearForm();
                this.renderTable();
            } catch (error) {
                console.error('Erro ao salvar:', error);
                alert('Erro ao salvar abastecimento: ' + error.message + '. Se estiver atualizando, os dados antigos podem ter sido removidos.');
            }
        },

        async renderTable() {
            this.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';
            const registros = await this.getAbastecimentos();
            this.tableBody.innerHTML = '';

            if (registros.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="7">Nenhum registro encontrado.</td></tr>';
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
                    <td>${reg.numero_nota}</td>
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

        handleDistribuicaoClick(e) {
            const removeBtn = e.target.closest('.btn-remove-tanque');
            if (removeBtn) {
                removeBtn.closest('.distribuicao-row').remove();
                this.updateLitrosRestantes();
            }
        },

        async handleTableClick(e) {
            const button = e.target.closest('button');
            if (!button) return;
            const id = parseInt(button.dataset.id);

            if (button.classList.contains('btn-edit')) {
                const { data: registroClicado } = await supabaseClient.from('abastecimentos').select('numero_nota').eq('id', id).single();
                if (!registroClicado) return;

                const { data: todosRegistrosDaNota, error } = await supabaseClient.from('abastecimentos').select('*').eq('numero_nota', registroClicado.numero_nota);
                if (error || !todosRegistrosDaNota || todosRegistrosDaNota.length === 0) {
                    alert('Erro ao carregar dados para edição.');
                    return;
                }

                this.clearForm(false); // Limpa o formulário sem resetar a data
                this.distribuicaoContainer.innerHTML = ''; // Limpa as linhas de tanque

                const primeiroRegistro = todosRegistrosDaNota[0];
                const qtdTotal = todosRegistrosDaNota.reduce((sum, reg) => sum + reg.qtd_litros, 0);

                this.editingIdInput.value = primeiroRegistro.numero_nota; // Armazena a nota fiscal para a lógica de update
                this.dataInput.value = primeiroRegistro.data;
                this.notaInput.value = primeiroRegistro.numero_nota;
                this.vlrLitroInput.value = primeiroRegistro.valor_litro;
                this.qtdTotalNotaInput.value = qtdTotal;

                todosRegistrosDaNota.forEach(reg => {
                    this.adicionarLinhaTanque(reg.tanque_id, reg.qtd_litros);
                });

                this.calculateTotal();
                this.updateLitrosRestantes();
                this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Atualizar';
                this.form.scrollIntoView({ behavior: 'smooth' });

            } else if (button.classList.contains('btn-delete')) {
                const { data: registroClicado } = await supabaseClient.from('abastecimentos').select('numero_nota').eq('id', id).single();
                if (confirm(`Deseja excluir TODOS os lançamentos da nota fiscal "${registroClicado.numero_nota}"?`)) {
                    await supabaseClient.from('abastecimentos').delete().eq('numero_nota', registroClicado.numero_nota);
                    this.calculateTotal();
                    this.renderTable();
                }
            }
        },

        clearForm(resetDate = true) {
            this.form.reset();
            this.editingIdInput.value = '';
            if (resetDate) this.dataInput.valueAsDate = new Date();
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Registrar Entrada';
            this.distribuicaoContainer.innerHTML = '';
            this.adicionarLinhaTanque(); // Adiciona a primeira linha de volta
        }
    };

    AbastecimentoUI.init();
});