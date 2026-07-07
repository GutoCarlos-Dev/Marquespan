import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const ProdutoCamaraFriaUI = {
        filialRestrita: '',
        acessoGlobal: true,
        sortState: { key: '', direction: 'asc' },

        init() {
            this.cache();
            this.bind();
            this.aplicarRestricaoFilial();
            this.loadFiliais();
            this.loadTipos();
            this.renderTable();
        },

        cache() {
            this.filtroFilialSelect = document.getElementById('filtroFilial');
            this.filtroNomeInput = document.getElementById('filtroNome');
            this.filtroTipoSelect = document.getElementById('filtroTipo');
            this.btnBuscarProdutos = document.getElementById('btnBuscarProdutos');
            this.btnIncluirProduto = document.getElementById('btnIncluirProduto');

            this.modalProduto = document.getElementById('modalProduto');
            this.form = document.getElementById('formProduto');
            this.editingIdInput = document.getElementById('produtoEditingId');
            this.codigoInput = document.getElementById('produtoCodigo');
            this.nomeInput = document.getElementById('produtoNome');
            this.tipoSelect = document.getElementById('produtoTipo');
            this.pesoCaixaInput = document.getElementById('produtoPesoCaixa');
            this.caixasPaleteInput = document.getElementById('produtoCaixasPalete');
            this.filialSelect = document.getElementById('produtoFilial');
            this.sortableHeaders = document.querySelectorAll('th.sortable');
            this.buscaGridProdutoInput = document.getElementById('buscaGridProduto');
            this.countBadge = document.getElementById('produtosRecordsCount');
            this.tableBody = document.getElementById('tableBodyProdutos');
            this.btnSalvar = document.getElementById('btnSalvarProduto');
            this.btnCloseModalProduto = document.getElementById('btnCloseModalProduto');
            this.btnCancelarProduto = document.getElementById('btnCancelarProduto');
            this.btnAbrirCadastroTipo = document.getElementById('btnAbrirCadastroTipo');

            this.modalTipo = document.getElementById('modalCadastroTipo');
            this.formCadastroTipo = document.getElementById('formCadastroTipo');
            this.cadTipoIdInput = document.getElementById('cadTipoId');
            this.cadTipoNomeInput = document.getElementById('cadTipoNome');
            this.btnCloseCadastroTipo = document.getElementById('btnCloseCadastroTipo');
            this.btnCancelarCadastroTipo = document.getElementById('btnCancelarCadastroTipo');
            this.btnSalvarCadastroTipo = document.getElementById('btnSalvarCadastroTipo');
            this.tbodyTipos = document.getElementById('tbodyTiposCadastrados');
        },

        bind() {
            this.btnBuscarProdutos.addEventListener('click', () => this.renderTable());
            this.filtroNomeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.renderTable();
                }
            });
            this.buscaGridProdutoInput?.addEventListener('input', () => this.renderRows());
            this.btnIncluirProduto.addEventListener('click', () => this.openModalProduto());

            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.tableBody.addEventListener('click', this.handleTableClick.bind(this));
            this.btnCloseModalProduto.addEventListener('click', this.closeModalProduto.bind(this));
            this.btnCancelarProduto.addEventListener('click', this.closeModalProduto.bind(this));
            this.modalProduto.addEventListener('click', (e) => {
                if (e.target === this.modalProduto) this.closeModalProduto();
            });

            this.btnAbrirCadastroTipo.addEventListener('click', this.openCadastroTipoModal.bind(this));
            this.btnCloseCadastroTipo.addEventListener('click', this.closeCadastroTipoModal.bind(this));
            this.btnCancelarCadastroTipo.addEventListener('click', this.closeCadastroTipoModal.bind(this));
            this.modalTipo.addEventListener('click', (e) => {
                if (e.target === this.modalTipo) this.closeCadastroTipoModal();
            });
            this.formCadastroTipo.addEventListener('submit', this.handleCadastroTipoSubmit.bind(this));
            this.tbodyTipos.addEventListener('click', this.handleTiposGridClick.bind(this));

            this.sortableHeaders.forEach(th => {
                th.addEventListener('click', () => this.ordenarPor(th.dataset.sort));
            });
        },

        aplicarRestricaoFilial() {
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            const nivel = String(usuarioLogado?.nivel || '').trim().toLowerCase();
            this.acessoGlobal = ['administrador', 'gerencia'].includes(nivel) || !String(usuarioLogado?.filial || '').trim();
            this.filialRestrita = this.acessoGlobal ? '' : String(usuarioLogado.filial).trim();
        },

        async loadFiliais() {
            try {
                const { data, error } = await supabaseClient
                    .from('filiais')
                    .select('nome, sigla')
                    .order('nome');

                if (error) throw error;

                if (this.filtroFilialSelect) {
                    this.filtroFilialSelect.innerHTML = '<option value="">Todas</option>'
                        + (data || []).map(f => `<option value="${this.escapeHtml(f.sigla || f.nome)}">${this.escapeHtml(f.sigla ? `${f.nome} (${f.sigla})` : f.nome)}</option>`).join('');
                }

                if (this.filialSelect) {
                    this.filialSelect.innerHTML = '<option value="">Todas as Filiais</option>'
                        + (data || []).map(f => `<option value="${this.escapeHtml(f.sigla || f.nome)}">${this.escapeHtml(f.sigla ? `${f.nome} (${f.sigla})` : f.nome)}</option>`).join('');
                }

                if (this.filialRestrita) {
                    this.filtroFilialSelect.value = this.filialRestrita;
                    this.filtroFilialSelect.disabled = true;
                    this.filialSelect.value = this.filialRestrita;
                    this.filialSelect.disabled = true;
                }
            } catch (err) {
                console.error('Erro ao carregar filiais:', err);
            }
        },

        async loadTipos() {
            try {
                const { data, error } = await supabaseClient
                    .from('tipos_produto_camara_fria')
                    .select('id, nome')
                    .eq('ativo', true)
                    .order('nome');

                if (error) throw error;

                const opcoesTipo = (data || []).map(tipo => `<option value="${this.escapeHtml(tipo.nome)}">${this.escapeHtml(tipo.nome)}</option>`).join('');

                const valorAtualForm = this.tipoSelect.value;
                this.tipoSelect.innerHTML = '<option value="">Selecione o Tipo</option>' + opcoesTipo;
                if (valorAtualForm) this.tipoSelect.value = valorAtualForm;

                const valorAtualFiltro = this.filtroTipoSelect.value;
                this.filtroTipoSelect.innerHTML = '<option value="">Todos</option>' + opcoesTipo;
                if (valorAtualFiltro) this.filtroTipoSelect.value = valorAtualFiltro;

                this.tiposCache = data || [];
                this.renderTiposGrid();
            } catch (err) {
                console.error('Erro ao carregar tipos:', err);
            }
        },

        escapeHtml(value) {
            return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },

        parsePeso(value) {
            const normalizado = String(value || '').trim().replace(/\./g, '').replace(',', '.');
            const numero = parseFloat(normalizado);
            return Number.isFinite(numero) ? numero : NaN;
        },

        formatPeso(value) {
            return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        },

        async getProdutos() {
            try {
                let query = supabaseClient.from('produtos_camara_fria').select('*').order('nome', { ascending: true });

                const filialFiltro = this.filialRestrita || this.filtroFilialSelect.value;
                if (filialFiltro) query = query.or(`filial.eq.${filialFiltro},filial.is.null`);

                const nomeFiltro = this.filtroNomeInput.value.trim();
                if (nomeFiltro) query = query.ilike('nome', `%${nomeFiltro}%`);

                const tipoFiltro = this.filtroTipoSelect.value;
                if (tipoFiltro) query = query.eq('tipo', tipoFiltro);

                const { data, error } = await query;
                if (error) throw error;
                return data || [];
            } catch (error) {
                console.error('Erro ao buscar produtos:', error);
                alert('Erro ao carregar a lista de produtos.');
                return [];
            }
        },

        async handleFormSubmit(e) {
            e.preventDefault();

            const pesoCaixaTexto = this.pesoCaixaInput.value.trim();
            let pesoCaixa = null;
            if (pesoCaixaTexto) {
                pesoCaixa = this.parsePeso(pesoCaixaTexto);
                if (Number.isNaN(pesoCaixa) || pesoCaixa <= 0) {
                    alert('Por favor, insira um peso de caixa valido e maior que zero, ou deixe em branco.');
                    this.pesoCaixaInput.focus();
                    return;
                }
            }

            const caixasPorPalete = parseInt(this.caixasPaleteInput.value, 10);
            if (!Number.isFinite(caixasPorPalete) || caixasPorPalete <= 0) {
                alert('Por favor, insira uma quantidade valida de caixas por palete.');
                this.caixasPaleteInput.focus();
                return;
            }

            const payload = {
                codigo: this.codigoInput.value.trim(),
                nome: this.nomeInput.value.trim(),
                tipo: this.tipoSelect.value,
                peso_caixa: pesoCaixa,
                caixas_por_palete: caixasPorPalete,
                filial: this.filialSelect.value || null
            };

            if (this.editingIdInput.value) {
                payload.id = this.editingIdInput.value;
            }

            try {
                const { error } = await supabaseClient.from('produtos_camara_fria').upsert(payload);
                if (error) throw error;

                registrarAuditoria(
                    this.editingIdInput.value ? 'ALTERAR' : 'INCLUIR',
                    'Câmara Fria',
                    `${this.editingIdInput.value ? 'Atualização' : 'Cadastro'} de produto: ${payload.nome}`
                );
                alert(`Produto ${this.editingIdInput.value ? 'atualizado' : 'salvo'} com sucesso!`);
                this.closeModalProduto();
                this.renderTable();
            } catch (error) {
                console.error('Erro ao salvar produto:', error);
                alert('Erro ao salvar produto: ' + error.message);
            }
        },

        async renderTable() {
            this.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';
            const produtos = await this.getProdutos();
            this.produtosCache = produtos;
            this.renderRows();
        },

        ordenarPor(key) {
            const nextDirection = this.sortState.key === key && this.sortState.direction === 'asc' ? 'desc' : 'asc';
            this.sortState = { key, direction: nextDirection };
            this.renderRows();
        },

        getValorOrdenacao(produto, key) {
            if (key === 'peso_caixa' || key === 'caixas_por_palete') {
                return Number(produto[key]) || 0;
            }
            if (key === 'filial') {
                return produto.filial || 'TODAS';
            }
            return String(produto[key] || '');
        },

        renderRows() {
            const termoBusca = String(this.buscaGridProdutoInput?.value || '').trim().toLowerCase();
            const produtos = [...(this.produtosCache || [])].filter(produto => {
                if (!termoBusca) return true;

                const nome = String(produto.nome || '').toLowerCase();
                const codigo = String(produto.codigo || '').toLowerCase();
                return nome.includes(termoBusca) || codigo.includes(termoBusca);
            });
            const { key, direction } = this.sortState;

            if (key) {
                produtos.sort((a, b) => {
                    const valorA = this.getValorOrdenacao(a, key);
                    const valorB = this.getValorOrdenacao(b, key);
                    const resultado = typeof valorA === 'number' && typeof valorB === 'number'
                        ? valorA - valorB
                        : String(valorA).localeCompare(String(valorB), 'pt-BR', { sensitivity: 'base', numeric: true });
                    return direction === 'asc' ? resultado : -resultado;
                });
            }

            this.sortableHeaders.forEach(th => {
                const icon = th.querySelector('i');
                if (!icon) return;
                icon.className = th.dataset.sort === key
                    ? (direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down')
                    : 'fas fa-sort';
            });

            if (this.countBadge) this.countBadge.textContent = `${produtos.length} produto${produtos.length === 1 ? '' : 's'}`;

            this.tableBody.innerHTML = '';

            if (produtos.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="7">Nenhum produto encontrado.</td></tr>';
                return;
            }

            produtos.forEach(produto => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${this.escapeHtml(produto.codigo) || '-'}</td>
                    <td>${this.escapeHtml(produto.nome)}</td>
                    <td>${this.escapeHtml(produto.tipo) || '-'}</td>
                    <td>${produto.peso_caixa != null ? `${this.formatPeso(produto.peso_caixa)} KG` : '-'}</td>
                    <td>${produto.caixas_por_palete ?? '-'}</td>
                    <td>${this.escapeHtml(produto.filial) || 'TODAS'}</td>
                    <td class="actions-cell">
                        <button class="btn-icon edit" data-id="${produto.id}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="btn-icon delete" data-id="${produto.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBody.appendChild(tr);
            });
        },

        handleTableClick(e) {
            const button = e.target.closest('button');
            if (!button) return;

            const id = button.dataset.id;

            if (button.classList.contains('edit')) {
                this.loadForEditing(id);
            } else if (button.classList.contains('delete')) {
                if (confirm('Tem certeza que deseja excluir este produto?')) {
                    this.deleteProduto(id);
                }
            }
        },

        openModalProduto() {
            this.clearForm();
            this.modalProduto.classList.remove('hidden');
        },

        closeModalProduto() {
            this.modalProduto.classList.add('hidden');
            this.clearForm();
        },

        loadForEditing(id) {
            const produto = (this.produtosCache || []).find(item => String(item.id) === String(id));
            if (!produto) return;

            this.editingIdInput.value = produto.id;
            this.codigoInput.value = produto.codigo || '';
            this.nomeInput.value = produto.nome;
            this.tipoSelect.value = produto.tipo || '';
            this.pesoCaixaInput.value = produto.peso_caixa != null ? this.formatPeso(produto.peso_caixa) : '';
            this.caixasPaleteInput.value = produto.caixas_por_palete || '';
            if (!this.filialRestrita) this.filialSelect.value = produto.filial || '';
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Atualizar Produto';
            this.modalProduto.classList.remove('hidden');
        },

        async deleteProduto(id) {
            try {
                const produto = (this.produtosCache || []).find(item => String(item.id) === String(id));
                const { error } = await supabaseClient.from('produtos_camara_fria').delete().eq('id', id);
                if (error) throw error;
                registrarAuditoria('EXCLUIR', 'Câmara Fria', `Exclusão de produto: ${produto?.nome || id}`);
                this.renderTable();
            } catch (error) {
                console.error('Erro ao excluir produto:', error);
                alert('Erro ao excluir produto.');
            }
        },

        clearForm() {
            this.form.reset();
            this.editingIdInput.value = '';
            if (this.filialRestrita) this.filialSelect.value = this.filialRestrita;
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Produto';
            this.codigoInput.focus();
        },

        // --- Cadastro de Tipo (catalogo auxiliar) ---

        openCadastroTipoModal() {
            this.modalTipo.classList.remove('hidden');
        },

        closeCadastroTipoModal() {
            this.modalTipo.classList.add('hidden');
            this.clearCadastroTipoForm();
        },

        clearCadastroTipoForm() {
            this.formCadastroTipo.reset();
            this.cadTipoIdInput.value = '';
            this.btnSalvarCadastroTipo.innerHTML = '<i class="fas fa-save"></i> Salvar Tipo';
        },

        async handleCadastroTipoSubmit(e) {
            e.preventDefault();

            const payload = {
                nome: this.cadTipoNomeInput.value.trim(),
                ativo: true
            };
            if (this.cadTipoIdInput.value) payload.id = this.cadTipoIdInput.value;

            try {
                const { error } = await supabaseClient.from('tipos_produto_camara_fria').upsert(payload);
                if (error) throw error;

                registrarAuditoria(
                    payload.id ? 'ALTERAR' : 'INCLUIR',
                    'Câmara Fria',
                    `${payload.id ? 'Atualização' : 'Cadastro'} de tipo de produto: ${payload.nome}`
                );
                this.clearCadastroTipoForm();
                await this.loadTipos();
            } catch (error) {
                console.error('Erro ao salvar tipo:', error);
                alert('Erro ao salvar tipo: ' + error.message);
            }
        },

        renderTiposGrid() {
            const tipos = this.tiposCache || [];
            this.tbodyTipos.innerHTML = tipos.length
                ? tipos.map(tipo => `
                    <tr>
                        <td>${this.escapeHtml(tipo.nome)}</td>
                        <td class="actions-cell">
                            <button class="btn-icon edit" data-id="${tipo.id}" title="Editar"><i class="fas fa-pen"></i></button>
                            <button class="btn-icon delete" data-id="${tipo.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('')
                : '<tr><td colspan="2" style="text-align:center;">Nenhum tipo cadastrado.</td></tr>';
        },

        handleTiposGridClick(e) {
            const button = e.target.closest('button');
            if (!button) return;

            const id = button.dataset.id;
            const tipo = (this.tiposCache || []).find(item => String(item.id) === String(id));
            if (!tipo) return;

            if (button.classList.contains('edit')) {
                this.cadTipoIdInput.value = tipo.id;
                this.cadTipoNomeInput.value = tipo.nome;
                this.btnSalvarCadastroTipo.innerHTML = '<i class="fas fa-save"></i> Atualizar Tipo';
            } else if (button.classList.contains('delete')) {
                this.deleteTipo(tipo);
            }
        },

        async deleteTipo(tipo) {
            try {
                const { data: emUso, error: erroConsulta } = await supabaseClient
                    .from('produtos_camara_fria')
                    .select('id')
                    .eq('tipo', tipo.nome)
                    .limit(1);
                if (erroConsulta) throw erroConsulta;

                if (emUso && emUso.length > 0) {
                    alert('Este tipo esta em uso por um ou mais produtos e nao pode ser excluido.');
                    return;
                }

                if (!confirm(`Excluir o tipo "${tipo.nome}"?`)) return;

                const { error } = await supabaseClient.from('tipos_produto_camara_fria').delete().eq('id', tipo.id);
                if (error) throw error;

                registrarAuditoria('EXCLUIR', 'Câmara Fria', `Exclusão de tipo de produto: ${tipo.nome}`);
                await this.loadTipos();
            } catch (error) {
                console.error('Erro ao excluir tipo:', error);
                alert('Erro ao excluir tipo: ' + error.message);
            }
        }
    };

    ProdutoCamaraFriaUI.init();
});
