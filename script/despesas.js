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
        this.formaPagamentoSelect = document.getElementById('despesaFormaPagamento');

        // Tabela e busca
        this.tableBody = document.getElementById('despesaTableBody');
        this.searchInput = document.getElementById('searchDespesaInput');

        // Datalists
        this.rotasList = document.getElementById('rotasList');
        this.hoteisList = document.getElementById('hoteisList');
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
        this.qtdDiariasInput.addEventListener('input', () => this.calcularValorTotal());
        this.valorDiariaInput.addEventListener('input', () => this.calcularValorTotal());
        this.valorEnergiaInput.addEventListener('input', () => this.calcularValorTotal());

        // Listener para o novo botão de adicionar hotel
        this.btnAdicionarHotel.addEventListener('click', () => this.abrirCadastroHotel());

        // Listener para carregar tipos de quarto quando um hotel é selecionado
        document.getElementById('despesaHotelInput').addEventListener('change', (e) => {
            this.loadTiposQuarto(e.target.value.trim());
            this.btnGerenciarQuartos.disabled = !e.target.value;
        });

        // Listeners do Modal de Quartos
        this.btnGerenciarQuartos.addEventListener('click', () => this.abrirModalQuartos());
        this.btnCloseModalQuartos.addEventListener('click', () => this.fecharModalQuartos());
        this.btnSalvarNovoQuarto.addEventListener('click', () => this.salvarNovoQuarto());
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modalQuartos) this.fecharModalQuartos();
        });

        this.listaQuartosEdicao.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-delete-quarto');
            if (btn) this.excluirQuarto(btn.dataset.id);
        });
    },

    async loadInitialData() {
        this.renderGrid();
        this.loadDatalists();
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

    async handleFormSubmit(e) {
        e.preventDefault();

        // Pega o valor total calculado e converte de volta para número
        const valorTotalString = this.valorTotalInput.value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        const valorTotal = parseFloat(valorTotalString) || 0;

        try {
            // --- Correção: Buscar IDs antes de salvar ---
            const hotelNome = document.getElementById('despesaHotelInput').value;
            const func1Nome = document.getElementById('despesaFuncionario1Input').value;
            const func2Nome = document.getElementById('despesaFuncionario2Input').value;

            const { data: hotel } = await supabaseClient.from('hoteis').select('id').eq('nome', hotelNome).single();
            if (!hotel) throw new Error(`Hotel "${hotelNome}" não encontrado no cadastro.`);

            const { data: func1 } = await supabaseClient.from('funcionario').select('id').eq('nome', func1Nome).single();
            if (!func1) throw new Error(`Funcionário "${func1Nome}" não encontrado no cadastro.`);

            let func2Id = null;
            if (func2Nome) {
                const { data: func2 } = await supabaseClient.from('funcionario').select('id').eq('nome', func2Nome).single();
                if (!func2) throw new Error(`Funcionário "${func2Nome}" não encontrado no cadastro.`);
                func2Id = func2.id;
            }

            const payload = {
                id: this.editingIdInput.value || undefined,
                numero_rota: document.getElementById('despesaRotaInput').value,
                id_hotel: hotel.id, // Salva o ID do hotel
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
        }
    },

    clearForm() {
        this.form.reset();
        this.editingIdInput.value = '';
        this.btnSubmit.textContent = 'Cadastrar Despesa';
        this.valorTotalInput.value = ''; // Limpa o campo de valor total
        this.tipoQuartoSelect.innerHTML = '<option value="">-- Selecione um hotel primeiro --</option>';
        this.tipoQuartoSelect.disabled = true;
        this.btnGerenciarQuartos.disabled = true;
        this.formaPagamentoSelect.value = "";
    },

    async loadForEditing(id) {
        try {
            // Correção: A sintaxe do select foi ajustada para o padrão do Supabase.
            // Assumindo que as colunas de chave estrangeira são id_hotel, id_funcionario1, id_funcionario2.
            // A sintaxe correta é: nome_da_tabela_relacionada(colunas)
            const { data: despesa, error } = await supabaseClient
                .from('despesas')
                .select('*, hoteis(nome), funcionario1:id_funcionario1(nome), funcionario2:id_funcionario2(nome)')
                .eq('id', id).single();
            if (error) throw error;

            this.editingIdInput.value = despesa.id;
            document.getElementById('despesaRotaInput').value = despesa.numero_rota;
            // Correção: Adiciona verificação para evitar erro se a relação não retornar dados.
            // O Supabase retorna o objeto da relação com o nome da tabela (ex: hoteis) ou o alias que demos (ex: funcionario1).
            document.getElementById('despesaHotelInput').value = despesa.hoteis?.nome || ''; // Correto
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
            this.formaPagamentoSelect.value = despesa.forma_pagamento || "";

            // Carrega os tipos de quarto e seleciona o correto
            await this.loadTiposQuarto(despesa.hoteis?.nome, despesa.tipo_quarto); // Correto

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
                // A busca por funcionário precisa de uma view ou RPC para funcionar com `or`. Simplificando por enquanto.
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
        try {
            // Carregar Rotas
            const { data: rotas, error: rotasError } = await supabaseClient.from('rotas').select('numero').order('numero', { ascending: true });
            if (rotasError) throw rotasError;
            this.rotasList.innerHTML = rotas.map(r => `<option value="${r.numero}"></option>`).join('');

            // Carregar Hotéis
            const { data: hoteis, error: hoteisError } = await supabaseClient.from('hoteis').select('nome').order('nome', { ascending: true });
            if (hoteisError) throw hoteisError;
            this.hoteisList.innerHTML = hoteis.map(h => `<option value="${h.nome}"></option>`).join('');

            // Carregar Funcionários (Motoristas) para o campo 1
            const { data: motoristas, error: motoristasError } = await supabaseClient
                .from('funcionario')
                .select('nome')
                .eq('funcao', 'Motorista') // Filtra apenas por motoristas
                .order('nome', { ascending: true });
            if (motoristasError) throw motoristasError;
            this.funcionarios1List.innerHTML = motoristas.map(f => `<option value="${f.nome}"></option>`).join('');

            // Carregar Funcionários (Auxiliares) para o campo 2
            const { data: auxiliares, error: auxiliaresError } = await supabaseClient
                .from('funcionario')
                .select('nome')
                .eq('funcao', 'Auxiliar') // Filtra apenas por auxiliares
                .order('nome', { ascending: true });
            if (auxiliaresError) throw auxiliaresError;
            this.funcionarios2List.innerHTML = auxiliares.map(f => `<option value="${f.nome}"></option>`).join('');

        } catch (err) {
            console.error('Erro ao carregar datalists:', err);
            alert('❌ Não foi possível carregar as listas de sugestões. Verifique o console.');
        }
    },

    async loadTiposQuarto(nomeHotel, selectedTipo) {
        // Lógica para carregar os tipos de quarto de um hotel específico
        this.tipoQuartoSelect.disabled = true;
        this.tipoQuartoSelect.innerHTML = '<option value="">Carregando...</option>';

        if (!nomeHotel) {
            this.tipoQuartoSelect.innerHTML = '<option value="">-- Selecione um hotel primeiro --</option>';
            return;
        }

        try {
            // 1. Busca o ID do hotel pelo nome para garantir a referência correta (Padrão do Hotel)
            const { data: hotel, error: hotelError } = await supabaseClient
                .from('hoteis')
                .select('id')
                .eq('nome', nomeHotel.trim())
                .single();

            if (hotelError || !hotel) {
                this.tipoQuartoSelect.innerHTML = '<option value="">Hotel não encontrado</option>';
                return;
            }

            // 2. Busca os quartos vinculados a esse ID (Mesma lógica usada no modal e na página de hotéis)
            const { data: quartos, error: quartosError } = await supabaseClient
                .from('hotel_quartos')
                .select('nome_quarto')
                .eq('id_hotel', hotel.id)
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
        const hotelNome = document.getElementById('despesaHotelInput').value.trim();
        if (!hotelNome) {
            alert('Selecione um hotel primeiro.');
            return;
        }

        try {
            const { data: hotel, error } = await supabaseClient.from('hoteis').select('id, nome').eq('nome', hotelNome).single();
            if (error || !hotel) throw new Error('Hotel não encontrado.');

            this.currentHotelId = hotel.id;
            this.tituloHotelQuartos.textContent = `Gerenciar Quartos: ${hotel.nome}`;
            this.modalQuartos.style.display = 'block';
            this.listarQuartosNoModal();
        } catch (err) {
            console.error(err);
            alert('Erro ao carregar dados do hotel.');
        }
    },

    fecharModalQuartos() {
        this.modalQuartos.style.display = 'none';
        this.novoTipoQuartoInput.value = '';
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
                    <button type="button" class="btn-delete-quarto" data-id="${q.id}" style="background: #dc3545; color: white; border: none; border-radius: 4px; padding: 2px 8px; cursor: pointer;"><i class="fas fa-trash"></i></button>
                `;
                this.listaQuartosEdicao.appendChild(li);
            });
        } catch (err) {
            console.error(err);
            this.listaQuartosEdicao.innerHTML = '<li>Erro ao listar quartos.</li>';
        }
    },

    async salvarNovoQuarto() {
        const nomeQuarto = this.novoTipoQuartoInput.value.trim();
        if (!nomeQuarto || !this.currentHotelId) return;

        try {
            const { error } = await supabaseClient.from('hotel_quartos').insert({ id_hotel: this.currentHotelId, nome_quarto: nomeQuarto });
            if (error) throw error;

            this.novoTipoQuartoInput.value = '';
            await this.listarQuartosNoModal();
            // Atualiza o select principal
            const hotelNome = document.getElementById('despesaHotelInput').value;
            this.loadTiposQuarto(hotelNome, nomeQuarto);
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
            const hotelNome = document.getElementById('despesaHotelInput').value;
            this.loadTiposQuarto(hotelNome);
        } catch (err) {
            console.error(err);
            alert('Erro ao excluir quarto.');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    DespesasUI.init();
});