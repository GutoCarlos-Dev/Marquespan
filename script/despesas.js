// script/despesas.js - Lógica para o módulo de Cadastro de Despesas
import { supabaseClient } from './supabase.js';

const DespesasUI = {
    init() {
        this.cache();
        this.sortField = 'data_checkin'; // Campo padrão
        this.sortAsc = false; // Ordem padrão (descendente)
        this.editingQuartoId = null;
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
        this.checkinInput = document.getElementById('despesaCheckin');
        this.checkoutInput = document.getElementById('despesaCheckout');
        this.formaPagamentoSelect = document.getElementById('despesaFormaPagamento');

        // Tabela e busca
        this.tableBody = document.getElementById('despesaTableBody');
        this.searchInput = document.getElementById('searchDespesaInput');

        // Dropdowns Multiselect
        this.despesaRotaDisplay = document.getElementById('despesaRotaDisplay');
        this.despesaRotaOptions = document.getElementById('despesaRotaOptions');
        this.despesaRotaText = document.getElementById('despesaRotaText');
        this.despesaHotelDisplay = document.getElementById('despesaHotelDisplay');
        this.despesaHotelOptions = document.getElementById('despesaHotelOptions');
        this.despesaHotelText = document.getElementById('despesaHotelText');

        this.funcionarios1List = document.getElementById('funcionarios1List');
        this.funcionarios2List = document.getElementById('funcionarios2List');
        this.btnAdicionarHotel = document.getElementById('btnAdicionarHotel');
        this.tipoQuartoSelect = document.getElementById('despesaTipoQuarto');

        // Modal Gerenciar Quartos
        this.btnGerenciarQuartos = document.getElementById('btnGerenciarQuartos');
        this.modalQuartos = document.getElementById('modalGerenciarQuartos');
        this.btnCloseModalQuartos = document.getElementById('closeModalQuartos');
        this.tituloHotelQuartos = document.getElementById('tituloHotelQuartos');
        this.novoTipoQuartoInput = document.getElementById('novoTipoQuartoInput');
        this.btnSalvarNovoQuarto = document.getElementById('btnSalvarNovoQuarto');
        this.listaQuartosEdicao = document.getElementById('listaQuartosEdicao');
    },

    bind() {
        this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.btnClearForm.addEventListener('click', () => this.clearForm());
        this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
        this.searchInput.addEventListener('input', () => this.renderGrid());

        // ** Adiciona os listeners para o cálculo automático do valor total **
        this.qtdDiariasInput.addEventListener('input', () => {
            this.calcularValorTotal();
            this.calcularCheckout();
        });
        this.valorDiariaInput.addEventListener('input', () => this.calcularValorTotal());
        this.valorEnergiaInput.addEventListener('input', () => this.calcularValorTotal());
        this.checkinInput.addEventListener('input', () => this.calcularCheckout());

        // Listener para o novo botão de adicionar hotel
        this.btnAdicionarHotel.addEventListener('click', () => this.abrirCadastroHotel());

        // Listener para carregar tipos de quarto quando um hotel é selecionado
        // Como agora é multiselect, vamos monitorar mudanças nos checkboxes de hotel
        // Se houver apenas 1 hotel selecionado, carrega os quartos. Se mais de 1 ou 0, desabilita.
        // A lógica será tratada dentro do evento de change do container de opções.
        this.despesaHotelOptions.addEventListener('change', () => {
            this.handleHotelSelectionChange();
        });

        // Listeners do Modal de Quartos
        this.btnGerenciarQuartos.addEventListener('click', () => this.abrirModalQuartos());
        this.btnCloseModalQuartos.addEventListener('click', () => this.fecharModalQuartos());
        this.btnSalvarNovoQuarto.addEventListener('click', () => this.salvarNovoQuarto());
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modalQuartos) this.fecharModalQuartos();
        });

        this.listaQuartosEdicao.addEventListener('click', (e) => {
            const btnDelete = e.target.closest('.btn-delete-quarto');
            const btnEdit = e.target.closest('.btn-edit-quarto');
            if (btnDelete) this.excluirQuarto(btnDelete.dataset.id);
            if (btnEdit) this.prepararEdicaoQuarto(btnEdit.dataset.id, btnEdit.dataset.nome);
        });

        // Evento de clique para ordenação das colunas
        document.querySelectorAll('th[data-key]').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.key));
        });

        // Inicializa eventos dos Multiselects
        this.setupMultiselect(this.despesaRotaDisplay, this.despesaRotaOptions, this.despesaRotaText, 'rota-checkbox', 'btnLimparSelecaoRota');
        this.setupMultiselect(this.despesaHotelDisplay, this.despesaHotelOptions, this.despesaHotelText, 'hotel-checkbox', 'btnLimparSelecaoHotel');
    },

    setupMultiselect(display, options, textSpan, checkboxClass, clearBtnId) {
        // Toggle visibility
        display.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = options.classList.contains('hidden');
            // Fecha outros dropdowns se houver
            document.querySelectorAll('.glass-dropdown').forEach(d => d.classList.add('hidden'));
            if (isHidden) options.classList.remove('hidden');
        });

        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            if (!display.contains(e.target) && !options.contains(e.target)) {
                options.classList.add('hidden');
            }
        });

        // Atualizar texto ao selecionar
        options.addEventListener('change', (e) => {
            if (e.target.classList.contains(checkboxClass)) {
                this.updateMultiselectText(options, textSpan, checkboxClass);
            }
        });

        // Botão Limpar
        const btnClear = document.getElementById(clearBtnId);
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                const checkboxes = options.querySelectorAll(`.${checkboxClass}`);
                checkboxes.forEach(cb => cb.checked = false);
                this.updateMultiselectText(options, textSpan, checkboxClass);
                // Dispara evento de change para atualizar dependências (ex: quartos)
                options.dispatchEvent(new Event('change'));
            });
        }
    },

    updateMultiselectText(optionsContainer, textSpan, checkboxClass) {
        const checked = Array.from(optionsContainer.querySelectorAll(`.${checkboxClass}:checked`));
        if (checked.length === 0) {
            textSpan.textContent = 'Selecione...';
        } else if (checked.length === 1) {
            // Pega o texto do label pai
            textSpan.textContent = checked[0].parentElement.textContent.trim();
        } else {
            textSpan.textContent = `${checked.length} selecionados`;
        }
    },

    async loadInitialData() {
        this.renderGrid();
        await this.loadDatalists();
    },

    abrirCadastroHotel() {
        // Redireciona para a página de hotéis, passando a página atual como parâmetro para retorno
        window.location.href = `hotel.html?redirect=despesas.html`;
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

    /**
     * Calcula a data de checkout com base na data de check-in e na quantidade de diárias.
     */
    calcularCheckout() {
        const checkinDate = this.checkinInput.value;
        const diarias = parseInt(this.qtdDiariasInput.value);

        // Verifica se a data de check-in é válida e se a quantidade de diárias é um número positivo
        if (checkinDate && !isNaN(diarias) && diarias > 0) {
            // Cria um objeto Date a partir da string 'YYYY-MM-DD' para evitar problemas de fuso horário
            const data = new Date(checkinDate + 'T00:00:00');
            
            // Adiciona o número de diárias à data de check-in
            data.setDate(data.getDate() + diarias);
            
            // Formata a data de volta para 'YYYY-MM-DD' e a define no campo de checkout
            this.checkoutInput.value = data.toISOString().split('T')[0];
        } else {
            this.checkoutInput.value = ''; // Limpa o campo se os dados forem inválidos
        }
    },

    async handleFormSubmit(e) {
        e.preventDefault();

        // Bloqueia o botão para evitar duplo clique
        if (this.btnSubmit.disabled) return;
        
        const originalText = this.btnSubmit.innerHTML;
        this.btnSubmit.disabled = true;
        this.btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        // Pega o valor total calculado e converte de volta para número
        const valorTotalString = this.valorTotalInput.value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        const valorTotal = parseFloat(valorTotalString) || 0;

        try {
            // --- Correção: Buscar IDs antes de salvar ---
            // Pega valores dos multiselects
            const rotasSelecionadas = this.getSelectedValues(this.despesaRotaOptions, 'rota-checkbox');
            const hoteisSelecionados = this.getSelectedValues(this.despesaHotelOptions, 'hotel-checkbox'); // Retorna IDs

            const func1NomeCompleto = document.getElementById('despesaFuncionario1Input').value;
            const func2NomeCompleto = document.getElementById('despesaFuncionario2Input').value;

            const { data: func1 } = await supabaseClient.from('funcionario').select('id').eq('nome_completo', func1NomeCompleto).single();
            if (!func1) throw new Error(`Funcionário "${func1NomeCompleto}" não encontrado no cadastro.`);

            let func2Id = null;
            if (func2NomeCompleto) {
                const { data: func2 } = await supabaseClient.from('funcionario').select('id').eq('nome_completo', func2NomeCompleto).single();
                if (!func2) throw new Error(`Funcionário "${func2NomeCompleto}" não encontrado no cadastro.`);
                func2Id = func2.id;
            }

            // Lógica para Hotel: O banco espera um único ID (id_hotel).
            // Se o usuário selecionar múltiplos, usaremos o primeiro como principal.
            // (Idealmente o banco deveria suportar N:N, mas mantendo a estrutura atual)
            const hotelId = hoteisSelecionados.length > 0 ? hoteisSelecionados[0] : null;
            if (!hotelId) throw new Error("Selecione pelo menos um hotel.");

            const payload = {
                id: this.editingIdInput.value || undefined,
                numero_rota: rotasSelecionadas.join(', '), // Salva rotas como string separada por vírgula
                id_hotel: hotelId, // Salva o ID do primeiro hotel selecionado
                id_funcionario1: func1.id, // Salva o ID do funcionário 1
                id_funcionario2: func2Id, // Salva o ID do funcionário 2
                tipo_quarto: this.tipoQuartoSelect.value,
                qtd_diarias: parseInt(this.qtdDiariasInput.value),
                data_reserva: document.getElementById('despesaDataReserva').value || null,
                nota_fiscal: document.getElementById('despesaNotaFiscal').value || null,
                observacao: document.getElementById('despesaObservacao').value || null,
                data_checkin: document.getElementById('despesaCheckin').value,
                data_checkout: document.getElementById('despesaCheckout').value,
                valor_diaria: parseFloat(this.valorDiariaInput.value),
                valor_energia: parseFloat(this.valorEnergiaInput.value) || 0,
                valor_total: valorTotal,
                forma_pagamento: this.formaPagamentoSelect.value
            };
            // --- Fim da Correção ---

            const { error } = await supabaseClient.from('despesas').upsert(payload);
            if (error) throw error;

            alert('✅ Despesa salva com sucesso!');
            this.clearForm();
            this.renderGrid();
        } catch (err) {
            console.error('Erro ao salvar despesa:', err);
            alert(`❌ Erro ao salvar despesa: ${err.message}`);
            // Restaura o botão apenas em caso de erro, pois clearForm já reseta em caso de sucesso
            this.btnSubmit.disabled = false;
            this.btnSubmit.innerHTML = originalText;
        } finally {
            // Em caso de sucesso, clearForm já reabilita o botão.
            // Em caso de erro, restauramos acima.
            // Se precisar garantir, podemos reabilitar aqui se ainda estiver desabilitado e não foi limpo.
            if (this.btnSubmit.disabled && this.editingIdInput.value) {
                 this.btnSubmit.disabled = false;
            }
        }
    },

    getSelectedValues(container, checkboxClass) {
        const checkboxes = container.querySelectorAll(`.${checkboxClass}:checked`);
        return Array.from(checkboxes).map(cb => cb.value);
    },

    clearForm() {
        this.form.reset();
        this.editingIdInput.value = '';
        // Restaura o botão com o ícone de spinner oculto
        this.btnSubmit.innerHTML = '<i class="fas fa-save"></i> Salvar Despesa';
        this.btnClearForm.innerHTML = '<i class="fas fa-eraser"></i> Limpar';
        this.btnSubmit.disabled = false;
        this.valorTotalInput.value = ''; // Limpa o campo de valor total
        this.tipoQuartoSelect.innerHTML = '<option value="">-- Selecione um hotel primeiro --</option>';
        this.tipoQuartoSelect.disabled = true;
        this.btnGerenciarQuartos.disabled = true;
        this.formaPagamentoSelect.value = "";
        
        // Limpa Multiselects
        this.despesaRotaOptions.querySelectorAll('.rota-checkbox').forEach(cb => cb.checked = false);
        this.updateMultiselectText(this.despesaRotaOptions, this.despesaRotaText, 'rota-checkbox');
        
        this.despesaHotelOptions.querySelectorAll('.hotel-checkbox').forEach(cb => cb.checked = false);
        this.updateMultiselectText(this.despesaHotelOptions, this.despesaHotelText, 'hotel-checkbox');
        
    },

    async loadForEditing(id) {
        try {
            // Correção: A sintaxe do select foi ajustada para o padrão do Supabase.
            // Assumindo que as colunas de chave estrangeira são id_hotel, id_funcionario1, id_funcionario2.
            // A sintaxe correta é: nome_da_tabela_relacionada(colunas)
            const { data: despesa, error } = await supabaseClient
                .from('despesas')
                .select('*, hoteis(nome), funcionario1:id_funcionario1(nome_completo), funcionario2:id_funcionario2(nome_completo)')
                .eq('id', id).single();
            if (error) throw error;

            this.editingIdInput.value = despesa.id;
            
            // Preenche Rota (Multiselect)
            const rotas = (despesa.numero_rota || '').split(',').map(s => s.trim());
            this.despesaRotaOptions.querySelectorAll('.rota-checkbox').forEach(cb => {
                cb.checked = rotas.includes(cb.value);
            });
            this.updateMultiselectText(this.despesaRotaOptions, this.despesaRotaText, 'rota-checkbox');

            // Preenche Hotel (Multiselect)
            // O banco só guarda 1 ID, então selecionamos esse ID
            if (despesa.id_hotel) {
                const hotelCb = this.despesaHotelOptions.querySelector(`.hotel-checkbox[value="${despesa.id_hotel}"]`);
                if (hotelCb) hotelCb.checked = true;
            }
            this.updateMultiselectText(this.despesaHotelOptions, this.despesaHotelText, 'hotel-checkbox');
            this.handleHotelSelectionChange(); // Atualiza quartos

            document.getElementById('despesaFuncionario1Input').value = despesa.funcionario1?.nome_completo || '';
            document.getElementById('despesaFuncionario2Input').value = despesa.funcionario2?.nome_completo || '';
            this.qtdDiariasInput.value = despesa.qtd_diarias;
            document.getElementById('despesaDataReserva').value = despesa.data_reserva;
            document.getElementById('despesaNotaFiscal').value = despesa.nota_fiscal;
            document.getElementById('despesaObservacao').value = despesa.observacao;
            document.getElementById('despesaCheckin').value = despesa.data_checkin;
            document.getElementById('despesaCheckout').value = despesa.data_checkout;
            this.valorDiariaInput.value = despesa.valor_diaria;
            this.valorEnergiaInput.value = despesa.valor_energia || 0;
            this.formaPagamentoSelect.value = despesa.forma_pagamento || "";

            // Carrega os tipos de quarto e seleciona o correto
            await this.loadTiposQuarto(despesa.hoteis?.nome, despesa.tipo_quarto); // Correto

            this.calcularValorTotal(); // Recalcula o total ao carregar
            this.btnSubmit.innerHTML = '<i class="fas fa-save"></i> Atualizar Despesa';
            this.btnClearForm.innerHTML = '<i class="fas fa-times"></i> Cancelar';
            this.form.scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            console.error('Erro ao carregar despesa para edição:', err);
        }
    },

    async handleTableClick(e) {
        const target = e.target;
        const id = target.closest('button')?.dataset.id;
        
        if (!id) return;

        if (target.closest('.btn-delete')) {
            if (confirm('Tem certeza que deseja excluir esta despesa?')) {
                try {
                    await supabaseClient.from('despesas').delete().eq('id', id);
                    this.renderGrid();
                } catch (err) {
                    alert('❌ Não foi possível excluir a despesa: ' + err.message);
                }
            }
        } else if (target.closest('.btn-edit')) {
            this.loadForEditing(id);
        }
    },

    handleSort(field) {
        if (this.sortField === field) {
            this.sortAsc = !this.sortAsc; // Inverte a ordem se for o mesmo campo
        } else {
            this.sortField = field;
            this.sortAsc = true; // Padrão ascendente para novo campo
        }
        this.renderGrid();
    },

    async renderGrid() {
        // Lógica para buscar e renderizar a tabela de despesas
        try {
            const searchTerm = this.searchInput.value.trim();
            let query; // Mover a declaração da query para cá

            if (searchTerm) {
                // Solução para a busca com 'OR' em múltiplas tabelas relacionadas
                // 1. Busca os IDs de cada condição separadamente
                const [
                    { data: rotaData, error: rotaError },
                    { data: hotelData, error: hotelError },
                    { data: func1Data, error: func1Error },
                    { data: func2Data, error: func2Error }
                ] = await Promise.all([
                    supabaseClient.from('despesas').select('id').ilike('numero_rota', `%${searchTerm}%`),
                    supabaseClient.from('despesas').select('id, hoteis!inner(id)').ilike('hoteis.nome', `%${searchTerm}%`),
                    supabaseClient.from('despesas').select('id, funcionario1:id_funcionario1!inner(id)').ilike('funcionario1.nome_completo', `%${searchTerm}%`),
                    supabaseClient.from('despesas').select('id, funcionario2:id_funcionario2!inner(id)').ilike('funcionario2.nome_completo', `%${searchTerm}%`)
                ]);

                if (rotaError || hotelError || func1Error || func2Error) {
                    console.error('Erro em uma das buscas parciais:', { rotaError, hotelError, func1Error, func2Error });
                    throw new Error('Ocorreu um erro durante a busca.');
                }

                // 2. Junta todos os IDs encontrados, sem duplicatas
                const ids = new Set([
                    ...(rotaData || []).map(d => d.id),
                    ...(hotelData || []).map(d => d.id),
                    ...(func1Data || []).map(d => d.id),
                    ...(func2Data || []).map(d => d.id)
                ]);

                const matchingIds = Array.from(ids);

                if (matchingIds.length === 0) {
                    this.tableBody.innerHTML = `<tr><td colspan="6">Nenhum resultado encontrado para "${searchTerm}".</td></tr>`;
                    return;
                }

                // 3. Busca os dados completos usando os IDs encontrados
                query = supabaseClient
                    .from('despesas')
                    .select('id, numero_rota, valor_total, data_checkin, hoteis(nome), funcionario1:id_funcionario1(nome_completo), funcionario2:id_funcionario2(nome_completo)')
                    .in('id', matchingIds);

            } else {
                // Query original quando não há busca
                query = supabaseClient
                    .from('despesas')
                    .select('id, numero_rota, valor_total, data_checkin, hoteis(nome), funcionario1:id_funcionario1(nome_completo), funcionario2:id_funcionario2(nome_completo)');
            }

            // Aplica a ordenação dinâmica baseada no estado atual
            if (this.sortField === 'hotel.nome') {
                query = query.order('nome', { foreignTable: 'hoteis', ascending: this.sortAsc });
            } else if (this.sortField === 'funcionario1.nome') {
                query = query.order('nome_completo', { foreignTable: 'funcionario1', ascending: this.sortAsc });
            } else {
                query = query.order(this.sortField, { ascending: this.sortAsc });
            }

            const { data: despesas, error } = await query;
            
            // Atualiza os ícones visuais na tabela
            this.updateSortIcons();

            if (error) throw error;

            this.tableBody.innerHTML = despesas.map(d => `
                <tr>
                    <td>${d.numero_rota}</td>
                    <td>${d.hoteis?.nome || 'N/A'}</td>
                    <td>
                        ${d.funcionario1?.nome_completo || 'N/A'}
                        ${d.funcionario2?.nome_completo ? `<br><small>${d.funcionario2.nome_completo}</small>` : ''}
                    </td>
                    <td>${(d.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${new Date(d.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>
                        <button class="btn-icon edit btn-edit" data-id="${d.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete btn-delete" data-id="${d.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Erro ao renderizar grid de despesas:', err);
            this.tableBody.innerHTML = `<tr><td colspan="6">Erro ao carregar dados.</td></tr>`;
        }
    },

    updateSortIcons() {
        document.querySelectorAll('th[data-key] i').forEach(icon => {
            icon.className = 'fas fa-sort'; // Ícone neutro
            const th = icon.closest('th');
            if (th.dataset.key === this.sortField) {
                icon.className = this.sortAsc ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    async loadDatalists() {
        // Lógica para carregar as opções dos datalists (rotas, hoteis, funcionarios)
        try {
            // Carregar Rotas
            const { data: rotas, error: rotasError } = await supabaseClient.from('rotas').select('numero').order('numero', { ascending: true });
            if (rotasError) throw rotasError;
            
            // Popula Dropdown de Rotas
            this.despesaRotaOptions.querySelectorAll('label').forEach(l => l.remove()); // Limpa anteriores
            rotas.forEach(r => {
                const label = document.createElement('label');
                label.className = 'dropdown-item';
                label.innerHTML = `<input type="checkbox" class="rota-checkbox" value="${r.numero}"> ${r.numero}`;
                this.despesaRotaOptions.appendChild(label);
            });

            // Carregar Hotéis
            const { data: hoteis, error: hoteisError } = await supabaseClient.from('hoteis').select('id, nome').order('nome', { ascending: true });
            if (hoteisError) throw hoteisError;
            this.despesaHotelOptions.querySelectorAll('label').forEach(l => l.remove());
            hoteis.forEach(h => {
                const label = document.createElement('label');
                label.className = 'dropdown-item';
                label.innerHTML = `<input type="checkbox" class="hotel-checkbox" value="${h.id}"> ${h.nome}`;
                this.despesaHotelOptions.appendChild(label);
            });

            // Carregar Funcionários (Motoristas) para o campo 1
            const { data: motoristas, error: motoristasError } = await supabaseClient
                .from('funcionario')
                .select('nome_completo')
                .eq('funcao', 'Motorista') // Filtra apenas por motoristas
                .order('nome_completo', { ascending: true });
            if (motoristasError) throw motoristasError;
            this.funcionarios1List.innerHTML = motoristas.map(f => `<option value="${f.nome_completo}"></option>`).join('');

            // Carregar Funcionários (Auxiliares) para o campo 2
            const { data: auxiliares, error: auxiliaresError } = await supabaseClient
                .from('funcionario')
                .select('nome_completo')
                .eq('funcao', 'Auxiliar') // Filtra apenas por auxiliares
                .order('nome_completo', { ascending: true });
            if (auxiliaresError) throw auxiliaresError;
            this.funcionarios2List.innerHTML = auxiliares.map(f => `<option value="${f.nome_completo}"></option>`).join('');

        } catch (err) {
            console.error('Erro ao carregar datalists:', err);
            alert('❌ Não foi possível carregar as listas de sugestões. Verifique o console.');
        }
    },

    handleHotelSelectionChange() {
        const selectedIds = this.getSelectedValues(this.despesaHotelOptions, 'hotel-checkbox');
        
        if (selectedIds.length === 1) {
            // Se apenas 1 hotel selecionado, carrega os quartos dele
            this.loadTiposQuarto(selectedIds[0]);
            this.btnGerenciarQuartos.disabled = false;
        } else {
            // Se 0 ou >1, desabilita seleção de quarto (pois quarto depende de 1 hotel específico)
            this.tipoQuartoSelect.innerHTML = '<option value="">Selecione apenas um hotel</option>';
            this.tipoQuartoSelect.disabled = true;
            this.btnGerenciarQuartos.disabled = true;
        }
    },

    async loadTiposQuarto(hotelId, selectedTipo) {
        // Lógica para carregar os tipos de quarto de um hotel específico
        this.tipoQuartoSelect.disabled = true;
        this.tipoQuartoSelect.innerHTML = '<option value="">Carregando...</option>';

        try {
            // 2. Busca os quartos vinculados a esse ID (Mesma lógica usada no modal e na página de hotéis)
            const { data: quartos, error: quartosError } = await supabaseClient
                .from('hotel_quartos')
                .select('nome_quarto')
                .eq('id_hotel', hotelId)
                .order('nome_quarto');

            if (quartosError) throw quartosError;

            this.tipoQuartoSelect.innerHTML = '<option value="" disabled selected>-- Selecione o quarto --</option>';
            quartos.forEach(q => {
                this.tipoQuartoSelect.add(new Option(q.nome_quarto, q.nome_quarto));
            });

            if (selectedTipo) this.tipoQuartoSelect.value = selectedTipo;
            this.tipoQuartoSelect.disabled = false;
        } catch (err) {
            console.error('Erro ao carregar tipos de quarto:', err);
            this.tipoQuartoSelect.innerHTML = '<option value="">Erro ao carregar quartos</option>';
        }
    },

    // --- Funções do Modal de Gerenciamento de Quartos ---

    async abrirModalQuartos() {
        const selectedIds = this.getSelectedValues(this.despesaHotelOptions, 'hotel-checkbox');
        if (selectedIds.length !== 1) {
            alert('Selecione exatamente um hotel para gerenciar quartos.');
            return;
        }
        const hotelId = selectedIds[0];

        try {
            const { data: hotel, error } = await supabaseClient.from('hoteis').select('id, nome').eq('id', hotelId).single();
            if (error || !hotel) throw new Error('Hotel não encontrado.');

            this.currentHotelId = hotel.id;
            this.tituloHotelQuartos.textContent = `Gerenciar Quartos: ${hotel.nome}`;
            this.modalQuartos.classList.remove('hidden');
            this.listarQuartosNoModal();
        } catch (err) {
            console.error(err);
            alert('Erro ao carregar dados do hotel.');
        }
    },

    fecharModalQuartos() {
        this.modalQuartos.classList.add('hidden');
        this.novoTipoQuartoInput.value = '';
        this.editingQuartoId = null;
        this.btnSalvarNovoQuarto.innerHTML = '<i class="fas fa-plus"></i>';
    },

    async listarQuartosNoModal() {
        if (!this.currentHotelId) return;
        this.listaQuartosEdicao.innerHTML = '<li>Carregando...</li>';

        try {
            const { data: quartos, error } = await supabaseClient
                .from('hotel_quartos')
                .select('*')
                .eq('id_hotel', this.currentHotelId)
                .order('nome_quarto');

            if (error) throw error;

            this.listaQuartosEdicao.innerHTML = '';
            if (quartos.length === 0) {
                this.listaQuartosEdicao.innerHTML = '<li>Nenhum quarto cadastrado.</li>';
                return;
            }

            quartos.forEach(q => {
                const li = document.createElement('li');
                li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;';
                li.innerHTML = `
                    <span>${q.nome_quarto}</span>
                    <div>
                        <button type="button" class="btn-icon edit btn-edit-quarto" data-id="${q.id}" data-nome="${q.nome_quarto}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button type="button" class="btn-icon delete btn-delete-quarto" data-id="${q.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </div>
                `;
                this.listaQuartosEdicao.appendChild(li);
            });
        } catch (err) {
            console.error(err);
            this.listaQuartosEdicao.innerHTML = '<li>Erro ao listar quartos.</li>';
        }
    },

    prepararEdicaoQuarto(id, nome) {
        this.editingQuartoId = id;
        this.novoTipoQuartoInput.value = nome;
        this.btnSalvarNovoQuarto.innerHTML = '<i class="fas fa-check"></i>';
        this.novoTipoQuartoInput.focus();
    },

    async salvarNovoQuarto() {
        const nomeQuarto = this.novoTipoQuartoInput.value.trim();
        if (!nomeQuarto || !this.currentHotelId) return;

        try {
            if (this.editingQuartoId) {
                const { error } = await supabaseClient
                    .from('hotel_quartos')
                    .update({ nome_quarto: nomeQuarto })
                    .eq('id', this.editingQuartoId);
                if (error) throw error;
                this.editingQuartoId = null;
                this.btnSalvarNovoQuarto.innerHTML = '<i class="fas fa-plus"></i>';
            } else {
                const { error } = await supabaseClient.from('hotel_quartos').insert({ id_hotel: this.currentHotelId, nome_quarto: nomeQuarto });
                if (error) throw error;
            }

            this.novoTipoQuartoInput.value = '';
            await this.listarQuartosNoModal();
            // Atualiza o select principal
            this.loadTiposQuarto(this.currentHotelId, nomeQuarto);
        } catch (err) {
            console.error(err);
            alert('Erro ao salvar quarto.');
        }
    },

    async excluirQuarto(id) {
        if (!confirm('Tem certeza que deseja excluir este tipo de quarto?')) return;

        try {
            const { error } = await supabaseClient.from('hotel_quartos').delete().eq('id', id);
            if (error) throw error;

            await this.listarQuartosNoModal();
            // Atualiza o select principal
            this.loadTiposQuarto(this.currentHotelId);
        } catch (err) {
            console.error(err);
            alert('Erro ao excluir quarto.');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    DespesasUI.init();
});
