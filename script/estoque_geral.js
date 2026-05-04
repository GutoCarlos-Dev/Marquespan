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
        this.carregarPrateleirasNoSelect();
        this.carregarVeiculosRetirada();
        this.updateSortIcons();
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
        this.retiradaVeiculo = document.getElementById('retirada-veiculo');
        this.retiradaObservacao = document.getElementById('retirada-observacao');
        this.btnRegistrarSaida = document.getElementById('btn-registrar-saida');
        this.btnGerarPdfSaida = document.getElementById('btn-gerar-pdf-saida');

        // Aba Gerenciar Produtos
        this.formProduto = document.getElementById('formCadastrarProduto');
        this.produtoEditingId = document.getElementById('produtoEditingId');
        this.btnSubmitProduto = document.getElementById('btnSubmitProduto');
        this.btnClearProdutoForm = document.getElementById('btnClearProdutoForm');
        this.searchProdutoTab = document.getElementById('searchProdutoTab');
        this.gridProdutosTabBody = document.getElementById('produtos-tab-body');
        this.produtoPrateleira = document.getElementById('produtoPrateleira');
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

        // Aba Prateleiras
        this.formPrateleira = document.getElementById('formCadastrarPrateleira');
        this.prateleiraEditingId = document.getElementById('prateleiraEditingId');
        this.prateleiraNome = document.getElementById('prateleiraNome');
        this.prateleiraLocalizacao = document.getElementById('prateleiraLocalizacao');
        this.btnSubmitPrateleira = document.getElementById('btnSubmitPrateleira');
        this.btnClearPrateleiraForm = document.getElementById('btnClearPrateleiraForm');
        this.searchPrateleiraTab = document.getElementById('searchPrateleiraTab');
        this.gridPrateleirasTabBody = document.getElementById('prateleiras-tab-body');

        // Variáveis de Estado
        this.carrinhoRetirada = [];
        this.produtosCache = [];
        this.prateleirasCache = [];
        this._prateleirasSort = { field: 'nome', ascending: true }; // Estado inicial da ordenação de prateleiras
        this._produtosSort = { field: 'nome', ascending: true };
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

        // Gerenciar Produtos
        this.formProduto.addEventListener('submit', (e) => this.handleProdutoFormSubmit(e));
        this.btnClearProdutoForm.addEventListener('click', () => this.clearProdutoForm());
        this.searchProdutoTab.addEventListener('input', () => this.renderProdutosGrid());

        // Adiciona listeners para ordenação dos cabeçalhos da tabela de produtos
        const prodHeaders = document.querySelectorAll('#tab-produtos thead th[data-field]');
        prodHeaders.forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.field;
                if (this._produtosSort.field === field) {
                    this._produtosSort.ascending = !this._produtosSort.ascending;
                } else {
                    this._produtosSort.field = field;
                    this._produtosSort.ascending = true;
                }
                this.updateSortIcons();
                this.renderProdutosGrid();
            });
        });
        this.gridProdutosTabBody.addEventListener('click', (e) => this.handleProdutoTableClick(e));

        // Prateleiras
        if (this.formPrateleira) this.formPrateleira.addEventListener('submit', (e) => this.handlePrateleiraFormSubmit(e));
        if (this.btnClearPrateleiraForm) this.btnClearPrateleiraForm.addEventListener('click', () => this.clearPrateleiraForm());
        if (this.searchPrateleiraTab) this.searchPrateleiraTab.addEventListener('input', () => this.renderPrateleirasGrid());
        
        // Adiciona listeners para ordenação dos cabeçalhos da tabela de prateleiras
        const prateleirasHeaders = document.querySelectorAll('#tab-prateleiras thead th[data-field]');
        prateleirasHeaders.forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.field;
                if (this._prateleirasSort.field === field) {
                    this._prateleirasSort.ascending = !this._prateleirasSort.ascending;
                } else {
                    this._prateleirasSort.field = field;
                    this._prateleirasSort.ascending = true;
                }
                this.updatePrateleirasSortIcons(); // Atualiza ícones e re-renderiza
                this.renderPrateleirasGrid();
            });
        });
        if (this.gridPrateleirasTabBody) this.gridPrateleirasTabBody.addEventListener('click', (e) => this.handlePrateleiraTableClick(e));

        this.btnRegistrarSaida.addEventListener('click', () => this.registrarSaida());
        if (this.btnGerarPdfSaida) this.btnGerarPdfSaida.addEventListener('click', () => this.gerarPdfSaida());

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
        if (targetId === 'tab-produtos') {
            this.renderProdutosGrid();
        }
        if (targetId === 'tab-prateleiras') {
            this.renderPrateleirasGrid();
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
                <td style="text-align: center; font-weight: bold; color: ${qtd <= 0 ? '#dc3545' : '#28a745'}">${qtd}</td>
            `;
            this.gridEstoqueBody.appendChild(tr);
        });
    },

    // --- LÓGICA COMPARTILHADA (PRODUTOS) ---

    async carregarListaProdutosDatalist() {
        const { data } = await supabaseClient
            .from('produtos')
            .select('*') // Busca todos os campos para cache completo (id, codigo, nome, estoque, unidade, minima, etc)
            .order('nome');
        
        if (data) {
            this.produtosCache = data;
            const options = data.map(p => `<option value="${p.nome} (${p.codigo_principal})" data-id="${p.id}" data-estoque="${p.quantidade_em_estoque}">`).join('');
            this.listaProdutosRetirada.innerHTML = options;
            this.listaProdutosBatimento.innerHTML = options;
        }
    },

    // --- LÓGICA DE GERENCIAMENTO DE PRODUTOS (Master Data) ---

    async renderProdutosGrid() {
        const term = this.searchProdutoTab.value.trim().toLowerCase();
        this.gridProdutosTabBody.innerHTML = '<tr><td colspan="10" class="text-center">Carregando...</td></tr>';

        try {
            let query = supabaseClient.from('produtos').select('*, prateleiras(nome, localizacao)');
            if (term) {
                query = query.or(`nome.ilike.%${term}%,codigo_principal.ilike.%${term}%`);
            }

            // Aplica a ordenação configurada
            if (this._produtosSort.field.includes('.')) {
                const [table, col] = this._produtosSort.field.split('.');
                query = query.order(col, { foreignTable: table, ascending: this._produtosSort.ascending });
            } else {
                query = query.order(this._produtosSort.field, { ascending: this._produtosSort.ascending });
            }

            const { data, error } = await query;
            if (error) throw error;

            this.gridProdutosTabBody.innerHTML = (data || []).map(p => {
                const status = p.status || 'Ativo';
                const isInactive = status === 'Inativo';
                const btnLabel = isInactive ? 'Ativar' : 'Inativar';
                const btnClass = isInactive ? 'btn-green' : 'btn-orange';
                const rowStyle = isInactive ? 'style="opacity: 0.6; background-color: #f9f9f9;"' : '';

                return `
                <tr ${rowStyle}>
                    <td>${p.codigo_principal || '-'}</td>
                    <td>${p.codigo_secundario || '-'}</td>
                    <td>${p.nome}</td>
                    <td>${p.unidade_medida || 'UN'}</td>
                    <td>${p.prateleiras?.nome || '-'}</td>
                    <td>${p.prateleiras?.localizacao || '-'}</td>
                    <td style="text-align: center; font-weight: bold;">${p.quantidade_minima || 0}</td>
                    <td><span class="status-badge ${isInactive ? 'status-inativo' : 'status-ativo'}">${status}</span></td>
                    <td style="text-align: center;">
                        <button class="btn-icon edit btn-edit-prod" data-id="${p.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon btn-toggle-status" data-id="${p.id}" data-status="${status}" title="${btnLabel}"><i class="fas fa-power-off"></i></button>
                    </td>
                </tr>`;
            }).join('');

        } catch (err) {
            console.error('Erro ao listar produtos:', err);
            this.gridProdutosTabBody.innerHTML = '<tr><td colspan="10" class="text-center text-danger">Erro ao carregar lista.</td></tr>';
        }
    },

    updateSortIcons() {
        const headers = document.querySelectorAll('#tab-produtos thead th[data-field] i');
        headers.forEach(icon => {
            icon.className = 'fas fa-sort'; // Reset
            const th = icon.closest('th');
            if (th && th.dataset.field === this._produtosSort.field) {
                icon.className = this._produtosSort.ascending ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    async handleProdutoFormSubmit(e) {
        e.preventDefault();
        const id = this.produtoEditingId.value;
        const payload = {
            codigo_principal: document.getElementById('produtoCodigo1').value.trim(),
            codigo_secundario: document.getElementById('produtoCodigo2').value.trim(),
            nome: document.getElementById('produtoNome').value.trim().toUpperCase(),
            unidade_medida: document.getElementById('produtoUnidade').value.trim().toUpperCase(),
            quantidade_minima: parseFloat(document.getElementById('produtoQtdMinima').value) || 0,
            prateleira_id: this.produtoPrateleira.value || null
        };

        try {
            const { error } = await supabaseClient.from('produtos').upsert({ id: id || undefined, ...payload });
            if (error) throw error;

            alert('✅ Produto salvo com sucesso!');
            this.clearProdutoForm();
            this.renderProdutosGrid();
            this.carregarListaProdutosDatalist(); // Atualiza sugestões em outras abas
        } catch (err) {
            alert('Erro ao salvar produto: ' + err.message);
        }
    },

    handleProdutoTableClick(e) {
        const btnEdit = e.target.closest('.btn-edit-prod');
        const btnStatus = e.target.closest('.btn-toggle-status');

        if (btnEdit) {
            const p = this.produtosCache.find(x => x.id == btnEdit.dataset.id);
            if (p) {
                this.produtoEditingId.value = p.id;
                document.getElementById('produtoCodigo1').value = p.codigo_principal || '';
                document.getElementById('produtoCodigo2').value = p.codigo_secundario || '';
                document.getElementById('produtoNome').value = p.nome || '';
                document.getElementById('produtoUnidade').value = p.unidade_medida || '';
                document.getElementById('produtoQtdMinima').value = p.quantidade_minima || 0;
                this.produtoPrateleira.value = p.prateleira_id || '';
                this.btnSubmitProduto.innerHTML = '<i class="fas fa-sync"></i> Atualizar';
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        if (btnStatus) {
            const id = btnStatus.dataset.id;
            const currentStatus = btnStatus.dataset.status;
            const newStatus = currentStatus === 'Inativo' ? 'Ativo' : 'Inativo';
            if (confirm(`Deseja alterar o status para ${newStatus}?`)) {
                supabaseClient.from('produtos').update({ status: newStatus }).eq('id', id).then(() => {
                    this.renderProdutosGrid();
                    this.carregarListaProdutosDatalist();
                });
            }
        }
    },

    clearProdutoForm() {
        this.formProduto.reset();
        this.produtoEditingId.value = '';
        document.getElementById('produtoQtdMinima').value = '0';
        this.produtoPrateleira.value = '';
        this.btnSubmitProduto.innerHTML = '<i class="fas fa-save"></i> Salvar';
    },

    async carregarPrateleirasNoSelect() {
        try {
            const { data, error } = await supabaseClient.from('prateleiras').select('*').order('nome');
            if (error) throw error;
            
            if (this.produtoPrateleira) {
                this.produtoPrateleira.innerHTML = '<option value="">Selecione uma prateleira</option>' + 
                    (data || []).map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
            }
        } catch (err) {
            console.error('Erro ao carregar select de prateleiras:', err);
        }
    },

    // --- LÓGICA DE PRATELEIRAS ---

    async renderPrateleirasGrid() {
        const term = this.searchPrateleiraTab.value.trim().toLowerCase();
        this.gridPrateleirasTabBody.innerHTML = '<tr><td colspan="3" class="text-center">Carregando...</td></tr>';

        try {
            let query = supabaseClient.from('prateleiras').select('*');
            if (term) {
                query = query.or(`nome.ilike.%${term}%,localizacao.ilike.%${term}%`);
            }

            const { data, error } = await query; // Busca os dados sem ordenação no DB
            if (error) throw error;

            this.prateleirasCache = data || [];
            
            // Aplica ordenação no lado do cliente
            const sortedData = [...this.prateleirasCache].sort((a, b) => {
                const field = this._prateleirasSort.field;
                const valA = String(a[field] || '').toLowerCase();
                const valB = String(b[field] || '').toLowerCase();

                // Usa localeCompare com numeric: true para ordenação alfanumérica correta
                const comparison = valA.localeCompare(valB, undefined, { numeric: true });

                return this._prateleirasSort.ascending ? comparison : -comparison;
            });

            this.gridPrateleirasTabBody.innerHTML = sortedData.map(p => `
                <tr>
                    <td>${p.nome}</td>
                    <td>${p.localizacao || '-'}</td>
                    <td style="text-align: center;">
                        <button class="btn-icon edit btn-edit-prateleira" data-id="${p.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete btn-delete-prateleira" data-id="${p.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`).join('');

            this.updatePrateleirasSortIcons(); // Atualiza os ícones após renderizar
        } catch (err) {
            console.error('Erro ao listar prateleiras:', err);
            this.gridPrateleirasTabBody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Erro ao carregar lista.</td></tr>';
        }
    },

    updatePrateleirasSortIcons() {
        const headers = document.querySelectorAll('#tab-prateleiras thead th[data-field] i');
        headers.forEach(icon => {
            icon.className = 'fas fa-sort'; // Reset para ícone neutro
            const th = icon.closest('th');
            if (th && th.dataset.field === this._prateleirasSort.field) {
                icon.className = this._prateleirasSort.ascending ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    async handlePrateleiraFormSubmit(e) {
        e.preventDefault();
        const id = this.prateleiraEditingId.value;
        const payload = {
            nome: this.prateleiraNome.value.trim().toUpperCase(),
            localizacao: this.prateleiraLocalizacao.value.trim().toUpperCase()
        };

        try {
            const { error } = await supabaseClient.from('prateleiras').upsert({ id: id || undefined, ...payload });
            if (error) throw error;

            alert('✅ Prateleira salva com sucesso!');
            this.clearPrateleiraForm();
            this.renderPrateleirasGrid();
            this.carregarPrateleirasNoSelect();
        } catch (err) {
            alert('Erro ao salvar prateleira: ' + err.message);
        }
    },

    handlePrateleiraTableClick(e) {
        const btnEdit = e.target.closest('.btn-edit-prateleira');
        const btnDelete = e.target.closest('.btn-delete-prateleira');

        if (btnEdit) {
            const p = this.prateleirasCache.find(x => x.id == btnEdit.dataset.id);
            if (p) {
                this.prateleiraEditingId.value = p.id;
                this.prateleiraNome.value = p.nome || '';
                this.prateleiraLocalizacao.value = p.localizacao || '';
                this.btnSubmitPrateleira.innerHTML = '<i class="fas fa-sync"></i> Atualizar';
            }
        }

        if (btnDelete) {
            const id = btnDelete.dataset.id;
            if (confirm('Deseja realmente excluir esta prateleira?')) {
                supabaseClient.from('prateleiras').delete().eq('id', id).then(() => {
                    this.renderPrateleirasGrid();
                    this.carregarPrateleirasNoSelect();
                });
            }
        }
    },

    clearPrateleiraForm() {
        this.formPrateleira.reset();
        this.prateleiraEditingId.value = '';
        this.btnSubmitPrateleira.innerHTML = '<i class="fas fa-save"></i> Salvar';
    },

    async carregarVeiculosRetirada() {
        try {
            const { data, error } = await supabaseClient
                .from('veiculos')
                .select('placa')
                .neq('situacao', 'inativo')
                .order('placa');

            if (error) throw error;

            const datalist = document.getElementById('lista-veiculos-retirada');
            if (datalist) {
                datalist.innerHTML = (data || []).map(v => `<option value="${v.placa}">`).join('');
            }
        } catch (err) {
            console.error('Erro ao carregar veículos para retirada:', err);
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
        const veiculo = this.retiradaVeiculo.value.trim().toUpperCase();

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
                        observacao: obsFinal,
                        veiculo: veiculo || null
                    });

                if (movError) throw movError;
            }

            // Salva dados para o PDF antes de limpar o carrinho
            this.dadosUltimaSaida = {
                itens: JSON.parse(JSON.stringify(this.carrinhoRetirada)),
                responsavel,
                veiculo,
                observacao,
                usuario: usuarioLogado,
                data: new Date()
            };

            alert('✅ Saída registrada com sucesso!');
            
            if (this.btnGerarPdfSaida) {
                this.btnGerarPdfSaida.disabled = false;
                this.btnGerarPdfSaida.style.cursor = 'pointer';
                this.btnGerarPdfSaida.classList.remove('btn-muted');
                this.btnGerarPdfSaida.classList.add('btn-blue');
            }

            this.carrinhoRetirada = [];
            this.renderCarrinhoRetirada();
            this.retiradaResponsavel.value = '';
            this.retiradaVeiculo.value = '';
            this.retiradaObservacao.value = '';
            
            // Atualiza dados
            this.carregarEstoque();
            this.carregarListaProdutosDatalist();

        } catch (error) {
            console.error(error);
            alert('Erro ao registrar saída: ' + error.message);
        }
    },

    async gerarPdfSaida() {
        if (!this.dadosUltimaSaida) return;
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const data = this.dadosUltimaSaida;

        // --- LOGO ---
        const getLogoBase64 = async () => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = 'logo.png';
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg'));
                };
                img.onerror = () => resolve(null);
            });
        };
        const logoBase64 = await getLogoBase64();
        if (logoBase64) {
            doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);
        }
        // --- FIM LOGO ---

        // Cabeçalho
        doc.setFontSize(18);
        doc.setTextColor(0, 105, 55);
        doc.text('Comprovante de Retirada de Estoque', 14, 30);
        
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(`Data: ${data.data.toLocaleString('pt-BR')}`, 14, 40);
        doc.text(`Responsável pela Retirada: ${data.responsavel}`, 14, 46);
        
        let currentY = 52;
        if (data.veiculo) {
            doc.text(`Veículo: ${data.veiculo}`, 14, currentY);
            currentY += 6;
        }
        
        doc.text(`Registrado por: ${data.usuario}`, 14, currentY);
        currentY += 6;

        if(data.observacao) {
            doc.text(`Observação: ${data.observacao}`, 14, currentY);
            currentY += 6;
        }

        const columns = ['Código', 'Produto', 'Qtd'];
        const rows = data.itens.map(i => [i.codigo, i.nome, i.qtd]);

        doc.autoTable({
            startY: currentY,
            head: [columns],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55] }
        });
        
        const finalTableY = doc.lastAutoTable.finalY + 20;
        doc.setLineWidth(1.0);
        doc.line(14, finalTableY, 100, finalTableY);
        doc.text('Assinatura', 48, finalTableY + 5);

        doc.save(`retirada_${Date.now()}.pdf`);
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
        
        // Variáveis para o resumo
        let totalEntrada = 0;
        let totalSaida = 0;
        let totalBatimento = 0;

        dadosFiltrados.forEach(m => {
            const tr = document.createElement('tr');
            const tipoClass = m.tipo_movimentacao === 'ENTRADA' ? 'text-success' : (m.tipo_movimentacao === 'SAIDA' ? 'text-danger' : 'text-warning');
            
            // Cálculos do resumo
            if (m.tipo_movimentacao === 'ENTRADA') totalEntrada += (parseFloat(m.quantidade) || 0);
            if (m.tipo_movimentacao === 'SAIDA') totalSaida += (parseFloat(m.quantidade) || 0);
            if (m.tipo_movimentacao === 'BATIMENTO') totalBatimento++; // Conta quantos ajustes foram feitos
            
            tr.innerHTML = `
                <td>${new Date(m.created_at).toLocaleString('pt-BR')}</td>
                <td>${m.produtos?.nome || 'Produto Excluído'}</td>
                <td class="${tipoClass}" style="font-weight:bold;">${m.tipo_movimentacao}</td>
                <td>${m.quantidade}</td>
                <td>${m.quantidade_anterior}</td>
                <td>${m.quantidade_nova}</td>
                <td>${m.veiculo || '-'}</td>
                <td>${m.usuario}</td>
                <td style="font-size: 0.85em; color: #555;">${m.observacao || '-'}</td>
                <td style="text-align: center;">
                    <button class="btn-glass btn-sm btn-pdf" title="Reimprimir PDF" style="color: #dc3545; cursor: pointer;">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                </td>
            `;
            
            const btnPdf = tr.querySelector('.btn-pdf');
            if (btnPdf) btnPdf.addEventListener('click', () => this.gerarPdfMovimentacao(m));

            this.gridRelatorioBody.appendChild(tr);
        });

        // Atualiza os cards de resumo
        document.getElementById('resumo-entrada').textContent = totalEntrada.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        document.getElementById('resumo-saida').textContent = totalSaida.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        document.getElementById('resumo-batimento').textContent = totalBatimento;
    },

    async gerarPdfMovimentacao(movimentacao) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // --- LOGO ---
        const getLogoBase64 = async () => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = 'logo.png';
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg'));
                };
                img.onerror = () => resolve(null);
            });
        };
        const logoBase64 = await getLogoBase64();
        if (logoBase64) {
            doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);
        }
        // --- FIM LOGO ---

        // Cabeçalho
        doc.setFontSize(18);
        doc.setTextColor(0, 105, 55);
        doc.text('Comprovante de Movimentação', 14, 30);
        
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(`Data: ${new Date(movimentacao.created_at).toLocaleString('pt-BR')}`, 14, 40);
        doc.text(`Tipo: ${movimentacao.tipo_movimentacao}`, 14, 46);
        doc.text(`Usuário: ${movimentacao.usuario}`, 14, 52);
        
        let startY = 60;
        if(movimentacao.observacao) {
            const splitObs = doc.splitTextToSize(`Observação: ${movimentacao.observacao}`, 180);
            doc.text(splitObs, 14, 58);
            startY = 58 + (splitObs.length * 5) + 5;
        }

        const columns = ['Produto', 'Qtd', 'Saldo Anterior', 'Saldo Novo'];
        const rows = [[
            movimentacao.produtos?.nome || 'Produto Excluído',
            (movimentacao.quantidade || 0).toLocaleString('pt-BR'),
            (movimentacao.quantidade_anterior || 0).toLocaleString('pt-BR'),
            (movimentacao.quantidade_nova || 0).toLocaleString('pt-BR')
        ]];

        doc.autoTable({
            startY: startY,
            head: [columns],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55] },
            styles: { halign: 'center' }
        });
        
        const finalY = doc.lastAutoTable.finalY + 20;
        doc.setLineWidth(1.0);
        doc.line(14, finalY, 100, finalY);
        doc.text('Assinatura', 48, finalY + 5);

        doc.save(`movimentacao_${movimentacao.id}.pdf`);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    EstoqueGeralUI.init();
});