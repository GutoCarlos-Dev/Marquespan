import { supabaseClient } from './supabase.js';
import XLSX from "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";
import { registrarAuditoria } from './auditoria-utils.js';

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
        this.btnEstoqueMinimo = document.getElementById('btn-estoque-minimo');
        this.estoqueMinimoCount = document.getElementById('estoque-minimo-count');
        this.modalEstoqueMinimo = document.getElementById('modalEstoqueMinimo');
        this.modalEstoqueMinimoBody = document.getElementById('modal-estoque-minimo-body');
        this.btnCloseModalEstoqueMinimo = document.getElementById('btnCloseModalEstoqueMinimo');
        this.btnExportarEstoqueXLSX = document.getElementById('btnExportarEstoqueXLSX');
        this.btnExportarEstoquePDF = document.getElementById('btnExportarEstoquePDF');
        this.btnFecharModalEstoqueMinimo = document.getElementById('btnFecharModalEstoqueMinimo');
        this.estoqueAtualData = [];

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
        this.btnModeloRequisicao = document.getElementById('btn-modelo-requisicao');

        // Aba Gerenciar Produtos
        this.formProduto = document.getElementById('formCadastrarProduto');
        this.produtoEditingId = document.getElementById('produtoEditingId');
        this.btnSubmitProduto = document.getElementById('btnSubmitProduto');
        this.btnClearProdutoForm = document.getElementById('btnClearProdutoForm');
        this.searchProdutoTab = document.getElementById('searchProdutoTab');
        this.gridProdutosTabBody = document.getElementById('produtos-tab-body');
        this.produtoPrateleira = document.getElementById('produtoPrateleira');
        this.produtoLocalizacao = document.getElementById('produtoLocalizacao');
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
        this.btnEstoqueMinimo?.addEventListener('click', () => this.abrirModalEstoqueMinimo());
        this.btnCloseModalEstoqueMinimo?.addEventListener('click', () => this.fecharModalEstoqueMinimo());
        this.btnExportarEstoqueXLSX?.addEventListener('click', () => this.exportarEstoqueXLSX());
        this.btnExportarEstoquePDF?.addEventListener('click', () => this.exportarEstoquePDF());
        this.btnFecharModalEstoqueMinimo?.addEventListener('click', () => this.fecharModalEstoqueMinimo());
        window.addEventListener('click', (e) => {
            if (e.target === this.modalEstoqueMinimo) {
                this.fecharModalEstoqueMinimo();
            }
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
        if (this.btnModeloRequisicao) this.btnModeloRequisicao.addEventListener('click', () => this.gerarPdfModeloRequisicao());

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
        this.gridEstoqueBody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
        
        let query = supabaseClient
            .from('produtos')
            .select('id, codigo_principal, nome, unidade_medida, quantidade_em_estoque, quantidade_minima')
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
            this.gridEstoqueBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar estoque.</td></tr>';
            return;
        }

        this.gridEstoqueBody.innerHTML = '';
        this.estoqueAtualData = data || [];
        const lowStockItems = this.estoqueAtualData.filter(p => {
            const qtd = parseFloat(p.quantidade_em_estoque) || 0;
            const minimo = parseFloat(p.quantidade_minima) || 0;
            return qtd <= minimo;
        });
        this.totalItens.textContent = this.estoqueAtualData.length;
        this.estoqueMinimoCount.textContent = lowStockItems.length;
        this.btnEstoqueMinimo.disabled = lowStockItems.length === 0;
        this.btnEstoqueMinimo.style.opacity = lowStockItems.length === 0 ? '0.65' : '1';

        this.estoqueAtualData.forEach(p => {
            const qtd = parseFloat(p.quantidade_em_estoque) || 0;
            const minimo = parseFloat(p.quantidade_minima) || 0;
            const isCritical = qtd <= minimo;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.codigo_principal || '-'}</td>
                <td>${p.nome}</td>
                <td>${p.unidade_medida || 'UN'}</td>
                <td style="text-align: center; font-weight: bold; color: ${qtd <= 0 ? '#dc3545' : '#28a745'}">${qtd}</td>
                <td style="text-align: center; font-weight: bold; color: ${isCritical ? '#dc3545' : '#444'}">${minimo}</td>
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
            let query = supabaseClient.from('produtos').select('*, prateleiras(nome)'); // Localização agora é campo direto do produto
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
                    <td>${p.localizacao || '-'}</td>
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
            localizacao: this.produtoLocalizacao?.value.trim().toUpperCase() || null,
            prateleira_id: this.produtoPrateleira.value || null
        };

        try {
            const { error } = await supabaseClient.from('produtos').upsert({ id: id || undefined, ...payload });
            if (error) throw error;

            registrarAuditoria(id ? 'ALTERAR' : 'INCLUIR', 'Estoque', `${id ? 'Alteração' : 'Inclusão'} do produto: ${payload.nome}`);
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
                if (this.produtoLocalizacao) this.produtoLocalizacao.value = p.localizacao || '';
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
        if (this.produtoLocalizacao) this.produtoLocalizacao.value = '';
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

    abrirModalEstoqueMinimo() {
        const lowStockItems = (this.estoqueAtualData || []).filter(p => {
            const qtd = parseFloat(p.quantidade_em_estoque) || 0;
            const minimo = parseFloat(p.quantidade_minima) || 0;
            return qtd <= minimo;
        });
        if (!this.modalEstoqueMinimo || !this.modalEstoqueMinimoBody) return;

        this.modalEstoqueMinimoBody.innerHTML = lowStockItems.length
            ? lowStockItems.map(p => {
                const qtd = parseFloat(p.quantidade_em_estoque) || 0;
                const minimo = parseFloat(p.quantidade_minima) || 0;
                return `
                    <tr>
                        <td>${p.codigo_principal || '-'}</td>
                        <td>${p.nome}</td>
                        <td style="text-align: center; font-weight: bold; color: ${qtd <= 0 ? '#dc3545' : '#28a745'}">${qtd}</td>
                        <td style="text-align: center; font-weight: bold; color: ${minimo >= qtd ? '#dc3545' : '#444'}">${minimo}</td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="4" style="text-align:center; color:#666;">Nenhum item em estoque mínimo ou abaixo.</td></tr>';

        this.modalEstoqueMinimo.classList.remove('hidden');
    },

    fecharModalEstoqueMinimo() {
        this.modalEstoqueMinimo?.classList.add('hidden');
    },

    async getLogoBase64PDF() {
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
    },

    exportarEstoqueXLSX() {
        const lowStockItems = (this.estoqueAtualData || []).filter(p => {
            const qtd = parseFloat(p.quantidade_em_estoque) || 0;
            const minimo = parseFloat(p.quantidade_minima) || 0;
            return qtd <= minimo;
        });

        if (!lowStockItems || lowStockItems.length === 0) {
            alert('Nenhum item em estoque mínimo para exportar.');
            return;
        }

        const ws = XLSX.utils.json_to_sheet(lowStockItems.map(p => ({
            'Código': p.codigo_principal || '-',
            'Produto': p.nome || '-',
            'Unidade': p.unidade_medida || 'UN',
            'Estoque Atual': parseFloat(p.quantidade_em_estoque) || 0,
            'Quantidade Mínima': parseFloat(p.quantidade_minima) || 0
        })));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Estoque Mínimo');
        XLSX.writeFile(wb, `Estoque_Minimo_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    async exportarEstoquePDF() {
        const lowStockItems = (this.estoqueAtualData || []).filter(p => {
            const qtd = parseFloat(p.quantidade_em_estoque) || 0;
            const minimo = parseFloat(p.quantidade_minima) || 0;
            return qtd <= minimo;
        });

        if (!lowStockItems || lowStockItems.length === 0) {
            alert('Nenhum item em estoque mínimo para exportar.');
            return;
        }

        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Biblioteca jsPDF não carregada. Verifique sua conexão.');
            return;
        }

        const btn = this.btnExportarEstoquePDF;
        const originalText = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const logoBase64 = await this.getLogoBase64PDF();
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            const nomeUsuario = usuarioLogado?.nome || 'Sistema';

            // Cabeçalho com logo
            if (logoBase64) {
                doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);
            }

            doc.setFontSize(16);
            doc.setTextColor(0, 105, 55);
            doc.text('Itens com Estoque Mínimo', 60, 18);

            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(`Gerado por: ${nomeUsuario}`, 14, 29);
            doc.text(`Registros: ${lowStockItems.length}`, 14, 34);
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 39);

            // Tabela
            const columns = ['Código', 'Produto', 'Unidade', 'Estoque Atual', 'Mínimo'];
            const rows = lowStockItems.map(p => [
                p.codigo_principal || '-',
                p.nome || '-',
                p.unidade_medida || 'UN',
                parseFloat(p.quantidade_em_estoque) || 0,
                parseFloat(p.quantidade_minima) || 0
            ]);

            doc.autoTable({
                head: [columns],
                body: rows,
                startY: 45,
                theme: 'grid',
                headStyles: { fillColor: [0, 105, 55], textColor: 255, fontSize: 9 },
                styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
                alternateRowStyles: { fillColor: [245, 247, 246] },
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 80 },
                    2: { cellWidth: 20 },
                    3: { cellWidth: 25, halign: 'right' },
                    4: { cellWidth: 25, halign: 'right' }
                }
            });

            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                const pageHeight = doc.internal.pageSize.getHeight();
                const pageText = `Página ${i} de ${pageCount}`;
                doc.text(pageText, 14, pageHeight - 8);
            }

            doc.save(`Estoque_Minimo_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err) {
            console.error('Erro ao exportar PDF:', err);
            alert('Erro ao gerar PDF: ' + (err.message || err));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    },

    // --- LÓGICA DE PRATELEIRAS ---

    async renderPrateleirasGrid() {
        const term = this.searchPrateleiraTab.value.trim().toLowerCase();
        this.gridPrateleirasTabBody.innerHTML = '<tr><td colspan="2" class="text-center">Carregando...</td></tr>';

        try {
            let query = supabaseClient.from('prateleiras').select('*');
            if (term) {
                query = query.ilike('nome', `%${term}%`);
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
                    <td style="text-align: center;">
                        <button class="btn-icon edit btn-edit-prateleira" data-id="${p.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete btn-delete-prateleira" data-id="${p.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`).join('');

            this.updatePrateleirasSortIcons(); // Atualiza os ícones após renderizar
        } catch (err) {
            console.error('Erro ao listar prateleiras:', err);
            this.gridPrateleirasTabBody.innerHTML = '<tr><td colspan="2" class="text-center text-danger">Erro ao carregar lista.</td></tr>';
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
            nome: this.prateleiraNome.value.trim().toUpperCase()
        };

        try {
            const { error } = await supabaseClient.from('prateleiras').upsert({ id: id || undefined, ...payload });
            if (error) throw error;

            registrarAuditoria(id ? 'ALTERAR' : 'INCLUIR', 'Estoque', `${id ? 'Alteração' : 'Inclusão'} de prateleira: ${payload.nome}`);
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

            registrarAuditoria('INCLUIR', 'Estoque', `Saída de ${this.carrinhoRetirada.length} item(ns) por ${responsavel}`);
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

    async gerarPdfModeloRequisicao() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('Biblioteca jsPDF nao carregada. Recarregue a pagina e tente novamente.');
            return;
        }

        const btn = this.btnModeloRequisicao;
        const originalText = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const logoBase64 = await this.getLogoBase64PDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 10;
            const halfHeight = pageHeight / 2;

            const drawField = (label, x, y, width) => {
                doc.setFontSize(7);
                doc.setTextColor(80);
                doc.text(label, x, y);
                doc.setDrawColor(70);
                doc.setLineWidth(0.15);
                doc.line(x, y + 5, x + width, y + 5);
            };

            const drawBoxField = (label, x, y, width, height) => {
                doc.setFontSize(7);
                doc.setTextColor(80);
                doc.text(label, x, y);
                doc.setDrawColor(110);
                doc.setLineWidth(0.15);
                doc.rect(x, y + 2, width, height);
            };

            const drawRequisicao = (top, viaLabel) => {
                const left = margin;
                const usableWidth = pageWidth - (margin * 2);
                const bottom = top + halfHeight - 8;

                doc.setDrawColor(0, 105, 55);
                doc.setLineWidth(0.45);
                doc.roundedRect(left, top + 5, usableWidth, halfHeight - 15, 2, 2);

                if (logoBase64) {
                    doc.setFillColor(255, 255, 255);
                    doc.rect(left + 4, top + 8, 36, 12, 'F');
                    doc.addImage(logoBase64, 'JPEG', left + 5, top + 9, 34, 9);
                }

                doc.setTextColor(0, 105, 55);
                doc.setFontSize(13);
                doc.setFont(undefined, 'bold');
                doc.text('REQUISICAO DE PECAS - ESTOQUE', pageWidth / 2, top + 14, { align: 'center' });

                doc.setFontSize(7);
                doc.setTextColor(90);
                doc.setFont(undefined, 'normal');
                doc.text(viaLabel, pageWidth - margin - 4, top + 10, { align: 'right' });
                doc.text('N.: __________________', pageWidth - margin - 4, top + 16, { align: 'right' });

                const y1 = top + 27;
                drawField('DATA', left + 5, y1, 34);
                drawField('SOLICITANTE', left + 45, y1, 62);
                drawField('SETOR', left + 113, y1, 37);
                drawField('VEICULO / EQUIPAMENTO', left + 156, y1, 31);

                const y2 = top + 40;
                drawField('CENTRO DE CUSTO / OBRA', left + 5, y2, 54);
                drawField('AUTORIZADO POR', left + 65, y2, 61);
                drawField('PRIORIDADE', left + 132, y2, 27);
                drawField('OS / ROTA', left + 165, y2, 22);

                doc.autoTable({
                    startY: top + 51,
                    margin: { left: left + 5, right: left + 5 },
                    tableWidth: usableWidth - 10,
                    theme: 'grid',
                    head: [['CODIGO', 'DESCRICAO DA PECA / MATERIAL', 'UN', 'QTD', 'RETIRADO']],
                    body: Array.from({ length: 7 }, () => ['', '', '', '', '']),
                    styles: { fontSize: 7, cellPadding: 1.2, minCellHeight: 6, textColor: [30, 30, 30], lineWidth: 0.12 },
                    headStyles: { fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold', halign: 'center' },
                    columnStyles: {
                        0: { cellWidth: 24 },
                        1: { cellWidth: 88 },
                        2: { cellWidth: 14, halign: 'center' },
                        3: { cellWidth: 16, halign: 'center' },
                        4: { cellWidth: 36 }
                    }
                });

                const obsY = Math.min((doc.lastAutoTable?.finalY || top + 98) + 5, bottom - 26);
                drawBoxField('OBSERVACOES / MOTIVO DA REQUISICAO', left + 5, obsY, usableWidth - 10, 12);

                const sigY = bottom - 8;
                doc.setDrawColor(70);
                doc.setLineWidth(0.18);
                doc.line(left + 8, sigY, left + 58, sigY);
                doc.line(left + 74, sigY, left + 124, sigY);
                doc.line(left + 140, sigY, left + 190, sigY);
                doc.setFontSize(7);
                doc.setTextColor(80);
                doc.text('Solicitante', left + 33, sigY + 4, { align: 'center' });
                doc.text('Almoxarifado', left + 99, sigY + 4, { align: 'center' });
                doc.text('Autorizacao', left + 165, sigY + 4, { align: 'center' });
            };

            drawRequisicao(0, '1a VIA - ESTOQUE');
            doc.setDrawColor(130);
            doc.setLineDashPattern([2, 2], 0);
            doc.line(margin, halfHeight, pageWidth - margin, halfHeight);
            doc.setLineDashPattern([], 0);
            doc.setFontSize(7);
            doc.setTextColor(120);
            doc.text('CORTE AQUI', pageWidth / 2, halfHeight - 2, { align: 'center' });
            drawRequisicao(halfHeight, '2a VIA - SOLICITANTE');

            doc.save(`Modelo_Requisicao_Pecas_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err) {
            console.error('Erro ao gerar modelo de requisicao:', err);
            alert('Erro ao gerar modelo de requisicao: ' + (err.message || err));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    },

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

            registrarAuditoria('ALTERAR', 'Estoque', `Ajuste de estoque (batimento) produto ID ${id}: ${diferenca > 0 ? '+' : ''}${diferenca}`);
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

        const columns = ['Produto', 'Qtd', 'Saldo Anterior', 'Saldo Novo', 'Veiculo'];
        const rows = [[
            movimentacao.produtos?.nome || 'Produto Excluído',
            (movimentacao.quantidade || 0).toLocaleString('pt-BR'),
            (movimentacao.quantidade_anterior || 0).toLocaleString('pt-BR'),
            (movimentacao.quantidade_nova || 0).toLocaleString('pt-BR'),
            movimentacao.veiculo || '-'
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
