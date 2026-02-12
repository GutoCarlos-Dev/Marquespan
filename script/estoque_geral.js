import { supabaseClient } from './supabase.js';

const EstoqueGeralUI = {
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.checkUser();
        this.initTabs();
        
        // Carrega dados iniciais
        this.carregarEstoque();
        this.carregarListaProdutosDatalist();
        this.updateTime();
        setInterval(() => this.updateTime(), 60000);
    },

    cacheDOM() {
        // Abas
        this.tabs = document.querySelectorAll('.painel-btn');
        this.tabContents = document.querySelectorAll('.tab-content');

        // Aba Estoque Atual
        this.gridEstoqueBody = document.getElementById('grid-estoque-body');
        this.filtroCodigo = document.getElementById('filtro-codigo');
        this.filtroNome = document.getElementById('filtro-nome');
        this.btnBuscarEstoque = document.getElementById('btn-buscar-estoque');
        this.btnLimparFiltros = document.getElementById('btn-limpar-filtros');
        this.totalItens = document.getElementById('total-itens');

        // Aba Retirada
        this.retiradaUsuario = document.getElementById('retirada-usuario-logado');
        this.retiradaData = document.getElementById('retirada-data');
        this.retiradaHora = document.getElementById('retirada-hora');
        this.retiradaProdutoInput = document.getElementById('retirada-produto');
        this.retiradaProdutoId = document.getElementById('retirada-produto-id');
        this.retiradaEstoqueAtual = document.getElementById('retirada-estoque-atual');
        this.retiradaQuantidade = document.getElementById('retirada-quantidade');
        this.btnAdicionarItemRetirada = document.getElementById('btn-adicionar-item-retirada');
        this.gridItensRetirada = document.getElementById('grid-itens-retirada');
        this.totalItensRetirada = document.getElementById('total-itens-retirada');
        this.retiradaResponsavel = document.getElementById('retirada-responsavel');
        this.retiradaObservacao = document.getElementById('retirada-observacao');
        this.btnRegistrarSaida = document.getElementById('btn-registrar-saida');
        this.listaProdutosRetirada = document.getElementById('lista-produtos-retirada');

        // Aba Batimento
        this.formBatimento = document.getElementById('form-batimento');
        this.batimentoProdutoInput = document.getElementById('batimento-produto');
        this.batimentoProdutoId = document.getElementById('batimento-produto-id');
        this.batimentoEstoqueAtual = document.getElementById('batimento-estoque-atual');
        this.batimentoNovaQuantidade = document.getElementById('batimento-nova-quantidade');
        this.listaProdutosBatimento = document.getElementById('lista-produtos-batimento');

        // Aba Relatórios
        this.relatorioDataIni = document.getElementById('relatorio-data-ini');
        this.relatorioDataFim = document.getElementById('relatorio-data-fim');
        this.relatorioTipo = document.getElementById('relatorio-tipo');
        this.relatorioBusca = document.getElementById('relatorio-busca'); // Novo campo
        this.btnBuscarRelatorio = document.getElementById('btn-buscar-relatorio');
        this.gridRelatorioBody = document.getElementById('grid-relatorio-body');

        // Variáveis de Estado
        this.carrinhoRetirada = [];
        this.produtosCache = [];
    },

    bindEvents() {
        // Navegação
        this.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.currentTarget));
        });

        // Estoque Atual
        this.btnBuscarEstoque.addEventListener('click', () => this.carregarEstoque());
        this.btnLimparFiltros.addEventListener('click', () => {
            this.filtroCodigo.value = '';
            this.filtroNome.value = '';
            this.carregarEstoque();
        });

        // Retirada - Autocomplete e Seleção
        this.retiradaProdutoInput.addEventListener('input', (e) => this.handleProdutoInput(e, 'retirada'));
        this.retiradaProdutoInput.addEventListener('change', (e) => this.handleProdutoSelect(e, 'retirada'));
        this.btnAdicionarItemRetirada.addEventListener('click', () => this.adicionarItemRetirada());
        this.gridItensRetirada.addEventListener('click', (e) => this.removerItemRetirada(e));
        this.btnRegistrarSaida.addEventListener('click', () => this.registrarSaida());

        // Batimento
        this.batimentoProdutoInput.addEventListener('input', (e) => this.handleProdutoInput(e, 'batimento'));
        this.batimentoProdutoInput.addEventListener('change', (e) => this.handleProdutoSelect(e, 'batimento'));
        this.formBatimento.addEventListener('submit', (e) => this.registrarBatimento(e));

        // Relatórios
        this.btnBuscarRelatorio.addEventListener('click', () => this.carregarRelatorio());
    },

    checkUser() {
        const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
        if (usuario) {
            this.retiradaUsuario.textContent = usuario.nome;
        }
    },

    updateTime() {
        const now = new Date();
        this.retiradaData.textContent = now.toLocaleDateString('pt-BR');
        this.retiradaHora.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    },

    initTabs() {
        // Define datas padrão para relatório (Mês atual)
        const date = new Date();
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        this.relatorioDataIni.value = firstDay.toISOString().split('T')[0];
        this.relatorioDataFim.value = lastDay.toISOString().split('T')[0];
    },

    switchTab(clickedTab) {
        this.tabs.forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        this.tabContents.forEach(c => c.classList.add('hidden'));

        clickedTab.classList.add('active');
        clickedTab.setAttribute('aria-selected', 'true');
        const targetId = clickedTab.dataset.tab;
        document.getElementById(targetId).classList.remove('hidden');

        if (targetId === 'tab-relatorios') {
            this.carregarRelatorio();
        }
    },

    // --- LÓGICA DE ESTOQUE ATUAL ---

    async carregarEstoque() {
        this.gridEstoqueBody.innerHTML = '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';
        
        let query = supabaseClient
            .from('produtos')
            .select('id, codigo_principal, nome, unidade_medida, quantidade_em_estoque')
            .order('nome');

        if (this.filtroCodigo.value.trim()) {
            query = query.ilike('codigo_principal', `%${this.filtroCodigo.value.trim()}%`);
        }
        if (this.filtroNome.value.trim()) {
            query = query.ilike('nome', `%${this.filtroNome.value.trim()}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error(error);
            this.gridEstoqueBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar estoque.</td></tr>';
            return;
        }

        this.gridEstoqueBody.innerHTML = '';
        this.totalItens.textContent = data.length;

        data.forEach(p => {
            const qtd = parseFloat(p.quantidade_em_estoque) || 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.codigo_principal || '-'}</td>
                <td>${p.nome}</td>
                <td>${p.unidade_medida || 'UN'}</td>
                <td style="text-align: center; font-weight: bold; color: ${qtd <= 0 ? 'red' : 'green'}">${qtd}</td>
            `;
            this.gridEstoqueBody.appendChild(tr);
        });
    },

    // --- LÓGICA COMPARTILHADA (PRODUTOS) ---

    async carregarListaProdutosDatalist() {
        const { data } = await supabaseClient
            .from('produtos')
            .select('id, codigo_principal, nome, quantidade_em_estoque')
            .order('nome');
        
        if (data) {
            this.produtosCache = data;
            const options = data.map(p => `<option value="${p.nome} (${p.codigo_principal})" data-id="${p.id}" data-estoque="${p.quantidade_em_estoque}">`).join('');
            this.listaProdutosRetirada.innerHTML = options;
            this.listaProdutosBatimento.innerHTML = options;
        }
    },

    handleProdutoInput(e, context) {
        // Limpa ID se o usuário alterar o texto
        if (context === 'retirada') {
            this.retiradaProdutoId.value = '';
            this.retiradaEstoqueAtual.value = '';
        } else {
            this.batimentoProdutoId.value = '';
            this.batimentoEstoqueAtual.value = '';
        }
    },

    handleProdutoSelect(e, context) {
        const val = e.target.value;
        const listId = context === 'retirada' ? 'lista-produtos-retirada' : 'lista-produtos-batimento';
        const list = document.getElementById(listId);
        
        // Encontra a opção selecionada no datalist
        let selectedOption;
        for (let i = 0; i < list.options.length; i++) {
            if (list.options[i].value === val) {
                selectedOption = list.options[i];
                break;
            }
        }

        if (selectedOption) {
            const id = selectedOption.dataset.id;
            const estoque = selectedOption.dataset.estoque;
            
            if (context === 'retirada') {
                this.retiradaProdutoId.value = id;
                this.retiradaEstoqueAtual.value = estoque;
                this.retiradaQuantidade.focus();
            } else {
                this.batimentoProdutoId.value = id;
                this.batimentoEstoqueAtual.value = estoque;
                this.batimentoNovaQuantidade.focus();
            }
        }
    },

    // --- LÓGICA DE RETIRADA ---

    adicionarItemRetirada() {
        const id = this.retiradaProdutoId.value;
        const nomeCompleto = this.retiradaProdutoInput.value;
        const qtd = parseFloat(this.retiradaQuantidade.value);
        const estoqueAtual = parseFloat(this.retiradaEstoqueAtual.value);

        if (!id || !nomeCompleto) return alert('Selecione um produto válido.');
        if (isNaN(qtd) || qtd <= 0) return alert('Informe uma quantidade válida.');
        if (qtd > estoqueAtual) return alert(`Quantidade indisponível. Estoque atual: ${estoqueAtual}`);

        // Extrai código e nome limpo
        const match = nomeCompleto.match(/(.*) \((.*)\)$/);
        const nome = match ? match[1] : nomeCompleto;
        const codigo = match ? match[2] : '-';

        this.carrinhoRetirada.push({ id, codigo, nome, qtd, estoqueAtual });
        this.renderCarrinhoRetirada();
        
        // Limpa campos
        this.retiradaProdutoInput.value = '';
        this.retiradaProdutoId.value = '';
        this.retiradaEstoqueAtual.value = '';
        this.retiradaQuantidade.value = '';
        this.retiradaProdutoInput.focus();
    },

    removerItemRetirada(e) {
        if (e.target.closest('.btn-remove-item')) {
            const index = e.target.closest('.btn-remove-item').dataset.index;
            this.carrinhoRetirada.splice(index, 1);
            this.renderCarrinhoRetirada();
        }
    },

    renderCarrinhoRetirada() {
        this.gridItensRetirada.innerHTML = '';
        this.carrinhoRetirada.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.codigo}</td>
                <td>${item.nome}</td>
                <td class="text-center">${item.qtd}</td>
                <td class="text-center"><button class="btn-danger btn-sm btn-remove-item" data-index="${index}"><i class="fas fa-trash"></i></button></td>
            `;
            this.gridItensRetirada.appendChild(tr);
        });
        this.totalItensRetirada.textContent = this.carrinhoRetirada.length;
    },

    async registrarSaida() {
        if (this.carrinhoRetirada.length === 0) return alert('Adicione itens para retirada.');
        const responsavel = this.retiradaResponsavel.value.trim();
        if (!responsavel) return alert('Informe o nome do responsável pela retirada.');

        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';
        const observacao = this.retiradaObservacao.value.trim();
        const obsFinal = `Retirado por: ${responsavel}. ${observacao}`;

        try {
            for (const item of this.carrinhoRetirada) {
                const novaQtd = item.estoqueAtual - item.qtd;

                // 1. Atualiza Produto
                const { error: prodError } = await supabaseClient
                    .from('produtos')
                    .update({ quantidade_em_estoque: novaQtd })
                    .eq('id', item.id);
                
                if (prodError) throw prodError;

                // 2. Registra Movimentação
                const { error: movError } = await supabaseClient
                    .from('movimentacoes_estoque')
                    .insert({
                        produto_id: item.id,
                        tipo_movimentacao: 'SAIDA',
                        quantidade: item.qtd,
                        quantidade_anterior: item.estoqueAtual,
                        quantidade_nova: novaQtd,
                        usuario: usuarioLogado,
                        observacao: obsFinal
                    });

                if (movError) throw movError;
            }

            alert('✅ Saída registrada com sucesso!');
            this.carrinhoRetirada = [];
            this.renderCarrinhoRetirada();
            this.retiradaResponsavel.value = '';
            this.retiradaObservacao.value = '';
            
            // Atualiza dados
            this.carregarEstoque();
            this.carregarListaProdutosDatalist();

        } catch (error) {
            console.error(error);
            alert('Erro ao registrar saída: ' + error.message);
        }
    },

    // --- LÓGICA DE BATIMENTO ---

    async registrarBatimento(e) {
        e.preventDefault();
        const id = this.batimentoProdutoId.value;
        const qtdReal = parseFloat(this.batimentoNovaQuantidade.value);
        const estoqueSistema = parseFloat(this.batimentoEstoqueAtual.value);

        if (!id) return alert('Selecione um produto.');
        if (isNaN(qtdReal) || qtdReal < 0) return alert('Informe uma quantidade válida.');

        const diferenca = qtdReal - estoqueSistema;
        if (diferenca === 0) return alert('A quantidade informada é igual ao estoque atual. Nenhuma alteração necessária.');

        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';

        try {
            // 1. Atualiza Produto
            const { error: prodError } = await supabaseClient
                .from('produtos')
                .update({ quantidade_em_estoque: qtdReal })
                .eq('id', id);
            
            if (prodError) throw prodError;

            // 2. Registra Movimentação
            const { error: movError } = await supabaseClient
                .from('movimentacoes_estoque')
                .insert({
                    produto_id: id,
                    tipo_movimentacao: 'BATIMENTO',
                    quantidade: Math.abs(diferenca), // Registra o valor absoluto da diferença
                    quantidade_anterior: estoqueSistema,
                    quantidade_nova: qtdReal,
                    usuario: usuarioLogado,
                    observacao: `Ajuste de Estoque (Batimento). Diferença: ${diferenca > 0 ? '+' : ''}${diferenca}`
                });

            if (movError) throw movError;

            alert('✅ Estoque ajustado com sucesso!');
            this.formBatimento.reset();
            this.batimentoProdutoId.value = '';
            
            this.carregarEstoque();
            this.carregarListaProdutosDatalist();

        } catch (error) {
            console.error(error);
            alert('Erro ao realizar batimento: ' + error.message);
        }
    },

    // --- LÓGICA DE RELATÓRIOS ---

    async carregarRelatorio() {
        this.gridRelatorioBody.innerHTML = '<tr><td colspan="9" class="text-center">Carregando histórico...</td></tr>';

        let query = supabaseClient
            .from('movimentacoes_estoque')
            .select('*, produtos(nome, codigo_principal, unidade_medida)')
            .order('created_at', { ascending: false });

        if (this.relatorioDataIni.value) query = query.gte('created_at', this.relatorioDataIni.value + 'T00:00:00');
        if (this.relatorioDataFim.value) query = query.lte('created_at', this.relatorioDataFim.value + 'T23:59:59');
        if (this.relatorioTipo.value) query = query.eq('tipo_movimentacao', this.relatorioTipo.value);

        const { data, error } = await query;

        if (error) {
            console.error(error);
            this.gridRelatorioBody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro ao carregar relatório.</td></tr>';
            return;
        }

        // Filtro de texto no front-end (para buscar em campos relacionados ou observação)
        const termoBusca = this.relatorioBusca.value.trim().toLowerCase();
        const dadosFiltrados = termoBusca ? data.filter(m => 
            (m.produtos?.nome || '').toLowerCase().includes(termoBusca) ||
            (m.observacao || '').toLowerCase().includes(termoBusca) ||
            (m.produtos?.codigo_principal || '').toLowerCase().includes(termoBusca)
        ) : data;

        if (dadosFiltrados.length === 0) {
            this.gridRelatorioBody.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum registro encontrado.</td></tr>';
            return;
        }

        this.gridRelatorioBody.innerHTML = '';
        dadosFiltrados.forEach(m => {
            const tr = document.createElement('tr');
            const tipoClass = m.tipo_movimentacao === 'ENTRADA' ? 'text-success' : (m.tipo_movimentacao === 'SAIDA' ? 'text-danger' : 'text-warning');
            
            tr.innerHTML = `
                <td>${new Date(m.created_at).toLocaleString('pt-BR')}</td>
                <td>${m.produtos?.nome || 'Produto Excluído'}</td>
                <td class="${tipoClass}" style="font-weight:bold;">${m.tipo_movimentacao}</td>
                <td>${m.quantidade}</td>
                <td>${m.quantidade_anterior}</td>
                <td>${m.quantidade_nova}</td>
                <td>${m.usuario}</td>
                <td style="font-size: 0.85em; color: #555;">${m.observacao || '-'}</td>
                <td>-</td>
            `;
            this.gridRelatorioBody.appendChild(tr);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    EstoqueGeralUI.init();
});