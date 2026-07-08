import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const DIA_SEMANA_TODOS = '__TODOS__';

document.addEventListener('DOMContentLoaded', () => {
    const EstoqueCamaraFriaUI = {
        filialRestrita: '',
        acessoGlobal: true,
        produtosCache: [],
        estoqueCache: new Map(),
        saidasCache: new Map(),
        contagensResumo: null,
        fabricasCache: [],
        buscaTotalContagem: '',
        sortTotalContagem: { campo: 'produto', direcao: 'asc' },

        init() {
            this.cache();
            this.bind();
            this.aplicarRestricaoFilial();
            this.definirSemanaAtual();
            this.definirDiaSemanaAtual();
            this.loadFiliais();
            this.loadFabricas();
        },

        cache() {
            this.filialSelect = document.getElementById('estoqueFilial');
            this.semanaInput = document.getElementById('estoqueSemana');
            this.diaSemanaSelect = document.getElementById('estoqueDiaSemana');
            this.fabricaSelect = document.getElementById('estoqueFabrica');
            this.btnCarregar = document.getElementById('btnCarregarEstoque');
            this.btnPDF = document.getElementById('btnEstoquePDF');
            this.btnXLSX = document.getElementById('btnEstoqueXLSX');
            this.btnAbrirCadastroFabrica = document.getElementById('btnAbrirCadastroFabrica');
            this.tableBody = document.getElementById('tableBodyEstoqueCamara');
            this.buscaTotalInput = document.getElementById('buscaTotalContagem');
            this.totalTable = document.querySelector('.estoque-total-table');
            this.recordsCount = document.getElementById('estoqueRecordsCount');
            this.kpiTotalCaixas = document.getElementById('kpiTotalCaixas');
            this.kpiTotalPaletes = document.getElementById('kpiTotalPaletes');
            this.kpiPesoTotal = document.getElementById('kpiPesoTotal');
            this.kpiProdutosRegistrados = document.getElementById('kpiProdutosRegistrados');

            this.modalFabrica = document.getElementById('modalCadastroFabrica');
            this.formFabrica = document.getElementById('formCadastroFabrica');
            this.fabricaEditingId = document.getElementById('fabricaEditingId');
            this.fabricaFilial = document.getElementById('fabricaFilial');
            this.fabricaNome = document.getElementById('fabricaNome');
            this.btnCloseCadastroFabrica = document.getElementById('btnCloseCadastroFabrica');
            this.btnCancelarCadastroFabrica = document.getElementById('btnCancelarCadastroFabrica');
            this.btnSalvarCadastroFabrica = document.getElementById('btnSalvarCadastroFabrica');
            this.tbodyFabricas = document.getElementById('tbodyFabricasCadastradas');
        },

        bind() {
            this.btnCarregar.addEventListener('click', () => this.carregarLancamento());
            this.btnPDF.addEventListener('click', () => this.exportarPDF());
            this.btnXLSX.addEventListener('click', () => this.exportarXLSX());
            this.filialSelect.addEventListener('change', async () => {
                this.fabricaSelect.value = '__TODAS__';
                if (this.fabricaFilial) this.fabricaFilial.value = this.filialSelect.value;
                await this.loadFabricas();
                if (this.formularioBaseValido(false)) this.carregarLancamento();
            });
            [this.semanaInput, this.diaSemanaSelect, this.fabricaSelect].forEach(el => {
                el.addEventListener('change', () => {
                    if (this.formularioBaseValido(false)) this.carregarLancamento();
                });
            });
            if (this.buscaTotalInput) {
                this.buscaTotalInput.addEventListener('input', () => {
                    this.buscaTotalContagem = this.normalizarTexto(this.buscaTotalInput.value);
                    this.filtrarTotalContagem();
                });
            }
            if (this.totalTable) {
                this.totalTable.addEventListener('click', (e) => {
                    const btn = e.target.closest('.estoque-sort-btn');
                    if (btn) this.ordenarTotalContagem(btn.dataset.sort);
                });
            }

            this.btnAbrirCadastroFabrica.addEventListener('click', () => this.openCadastroFabrica());
            this.btnCloseCadastroFabrica.addEventListener('click', () => this.closeCadastroFabrica());
            this.btnCancelarCadastroFabrica.addEventListener('click', () => this.closeCadastroFabrica());
            this.modalFabrica.addEventListener('click', (e) => {
                if (e.target === this.modalFabrica) this.closeCadastroFabrica();
            });
            this.formFabrica.addEventListener('submit', this.handleFabricaSubmit.bind(this));
            this.tbodyFabricas.addEventListener('click', this.handleFabricasGridClick.bind(this));
        },

        aplicarRestricaoFilial() {
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            const nivel = String(usuarioLogado?.nivel || '').trim().toLowerCase();
            this.acessoGlobal = ['administrador', 'gerencia'].includes(nivel) || !String(usuarioLogado?.filial || '').trim();
            this.filialRestrita = this.acessoGlobal ? '' : String(usuarioLogado.filial).trim();
        },

        definirSemanaAtual() {
            const hoje = new Date();
            const data = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
            const dia = data.getUTCDay() || 7;
            data.setUTCDate(data.getUTCDate() + 4 - dia);
            const ano = data.getUTCFullYear();
            const inicioAno = new Date(Date.UTC(ano, 0, 1));
            const semana = Math.ceil((((data - inicioAno) / 86400000) + 1) / 7);
            this.semanaInput.value = `${ano}-W${String(semana).padStart(2, '0')}`;
        },

        definirDiaSemanaAtual() {
            const dias = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
            this.diaSemanaSelect.value = dias[new Date().getDay()] || 'SEGUNDA';
        },

        async loadFiliais() {
            try {
                const { data, error } = await supabaseClient
                    .from('filiais')
                    .select('nome, sigla')
                    .order('nome');
                if (error) throw error;

                this.filialSelect.innerHTML = '<option value="">Selecione</option>'
                    + (data || []).map(f => `<option value="${this.escapeHtml(f.sigla || f.nome)}">${this.escapeHtml(f.sigla ? `${f.nome} (${f.sigla})` : f.nome)}</option>`).join('');
                if (this.fabricaFilial) {
                    this.fabricaFilial.innerHTML = '<option value="">Selecione</option>'
                        + (data || []).map(f => `<option value="${this.escapeHtml(f.sigla || f.nome)}">${this.escapeHtml(f.sigla ? `${f.nome} (${f.sigla})` : f.nome)}</option>`).join('');
                }

                if (this.filialRestrita) {
                    if (!Array.from(this.filialSelect.options).some(o => o.value === this.filialRestrita)) {
                        this.filialSelect.add(new Option(this.filialRestrita, this.filialRestrita));
                    }
                    this.filialSelect.value = this.filialRestrita;
                    this.filialSelect.disabled = true;
                    if (this.fabricaFilial) {
                        this.fabricaFilial.value = this.filialRestrita;
                        this.fabricaFilial.disabled = true;
                    }
                }

                await this.loadFabricas();
                if (this.formularioBaseValido(false)) this.carregarLancamento();
            } catch (error) {
                console.error('Erro ao carregar filiais:', error);
            }
        },

        async loadFabricas() {
            try {
                let query = supabaseClient
                    .from('fabricas_camara_fria')
                    .select('id, filial, nome, ativo')
                    .eq('ativo', true)
                    .order('nome');
                if (this.filialSelect.value) query = query.eq('filial', this.filialSelect.value);

                const { data, error } = await query;
                if (error) throw error;

                this.fabricasCache = data || [];
                const valorAtual = this.fabricaSelect.value;
                this.fabricaSelect.innerHTML = '<option value="__TODAS__">Todas</option>'
                    + this.fabricasCache.map(f => `<option value="${f.id}">${this.escapeHtml(f.nome)}</option>`).join('');
                if (valorAtual && this.fabricasCache.some(f => String(f.id) === String(valorAtual))) {
                    this.fabricaSelect.value = valorAtual;
                } else {
                    this.fabricaSelect.value = '__TODAS__';
                }

                this.renderFabricasGrid();
            } catch (error) {
                console.error('Erro ao carregar fabricas:', error);
                alert('Erro ao carregar fabricas.');
            }
        },

        formularioBaseValido(mostrarAlerta = true) {
            if (!this.filialSelect.value || !this.semanaInput.value || !this.diaSemanaSelect.value || !this.fabricaSelect.value) {
                if (mostrarAlerta) alert('Preencha Filial, Semana, Dia da Semana e Fabrica.');
                return false;
            }
            return true;
        },

        async carregarLancamento() {
            if (!this.formularioBaseValido()) return;
            this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Carregando...</td></tr>';

            try {
                const filial = this.filialSelect.value;
                const [produtosResult, contagemResumo, saidasResumo] = await Promise.all([
                    this.buscarProdutos(filial),
                    this.buscarTotaisContagem(),
                    this.buscarSaidasCarregamento()
                ]);

                if (produtosResult.error) throw produtosResult.error;

                this.produtosCache = produtosResult.data || [];
                this.estoqueCache = contagemResumo.totaisPorProduto;
                this.saidasCache = saidasResumo.totaisPorProduto;
                this.contagensResumo = contagemResumo;
                this.renderProdutos();
            } catch (error) {
                console.error('Erro ao carregar estoque semanal:', error);
                this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#dc3545;">Erro ao carregar estoque.</td></tr>';
            }
        },

        buscarProdutos(filial) {
            let query = supabaseClient
                .from('produtos_camara_fria')
                .select('id, codigo, nome, tipo, peso_caixa, caixas_por_palete, filial')
                .eq('ativo', true)
                .order('nome');

            if (filial) query = query.or(`filial.eq.${filial},filial.is.null`);
            return query;
        },

        async buscarTotaisContagem() {
            let contagensQuery = supabaseClient
                .from('contagens_camara_fria')
                .select('id, fabrica_id, status')
                .eq('filial', this.filialSelect.value)
                .eq('semana', this.semanaInput.value);

            if (this.diaSemanaSelect.value !== DIA_SEMANA_TODOS) {
                contagensQuery = contagensQuery.eq('dia_semana', this.diaSemanaSelect.value);
            }

            if (this.fabricaSelect.value !== '__TODAS__') {
                contagensQuery = contagensQuery.eq('fabrica_id', this.fabricaSelect.value);
            }

            const { data: contagens, error: contagensError } = await contagensQuery;
            if (contagensError) throw contagensError;

            const contagemIds = (contagens || []).map(contagem => contagem.id);
            const totaisPorProduto = new Map();
            if (contagemIds.length === 0) {
                return { totaisPorProduto, totalContagens: 0 };
            }

            const { data: itens, error: itensError } = await supabaseClient
                .from('contagem_camara_fria_itens')
                .select('contagem_id, produto_id, quantidade_caixas')
                .in('contagem_id', contagemIds);
            if (itensError) throw itensError;

            (itens || []).forEach(item => {
                const produtoId = String(item.produto_id);
                const atual = totaisPorProduto.get(produtoId) || {
                    produto_id: produtoId,
                    quantidade_caixas: 0,
                    contagemIds: new Set()
                };
                atual.quantidade_caixas += Number(item.quantidade_caixas) || 0;
                atual.contagemIds.add(String(item.contagem_id));
                totaisPorProduto.set(produtoId, atual);
            });

            return { totaisPorProduto, totalContagens: contagemIds.length };
        },

        async buscarSaidasCarregamento() {
            const periodo = this.getPeriodoCarregamentoSelecionado();
            const totaisPorProduto = new Map();
            if (!periodo) return { totaisPorProduto, totalCarregamentos: 0 };

            let query = supabaseClient
                .from('carregamentos_camara_fria')
                .select('id')
                .eq('filial', this.filialSelect.value);

            if (periodo.data) {
                query = query.eq('data_carregamento', periodo.data);
            } else {
                query = query
                    .gte('data_carregamento', periodo.inicio)
                    .lte('data_carregamento', periodo.fim);
            }

            if (this.fabricaSelect.value !== '__TODAS__') {
                query = query.eq('fabrica_id', this.fabricaSelect.value);
            }

            const { data: carregamentos, error: carregamentosError } = await query;
            if (carregamentosError) throw carregamentosError;

            const carregamentoIds = (carregamentos || []).map(item => item.id);
            if (carregamentoIds.length === 0) {
                return { totaisPorProduto, totalCarregamentos: 0 };
            }

            const { data: lancamentos, error: lancamentosError } = await supabaseClient
                .from('carregamento_camara_fria_lancamentos')
                .select('produto_id, quantidade_caixas')
                .in('carregamento_id', carregamentoIds);
            if (lancamentosError) throw lancamentosError;

            (lancamentos || []).forEach(item => {
                const produtoId = String(item.produto_id);
                const atual = totaisPorProduto.get(produtoId) || {
                    produto_id: produtoId,
                    quantidade_caixas: 0
                };
                atual.quantidade_caixas += Number(item.quantidade_caixas) || 0;
                totaisPorProduto.set(produtoId, atual);
            });

            return { totaisPorProduto, totalCarregamentos: carregamentoIds.length };
        },

        getPeriodoCarregamentoSelecionado() {
            const inicio = this.getInicioSemanaISO(this.semanaInput.value);
            if (!inicio) return null;

            const fim = new Date(inicio);
            fim.setUTCDate(inicio.getUTCDate() + 6);

            if (this.diaSemanaSelect.value === DIA_SEMANA_TODOS) {
                return {
                    inicio: this.formatDateISO(inicio),
                    fim: this.formatDateISO(fim)
                };
            }

            const offsets = {
                SEGUNDA: 0,
                TERCA: 1,
                QUARTA: 2,
                QUINTA: 3,
                SEXTA: 4,
                SABADO: 5,
                DOMINGO: 6
            };
            const offset = offsets[this.diaSemanaSelect.value];
            if (offset == null) return null;

            const data = new Date(inicio);
            data.setUTCDate(inicio.getUTCDate() + offset);
            return { data: this.formatDateISO(data) };
        },

        getInicioSemanaISO(value) {
            const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
            if (!match) return null;

            const year = Number(match[1]);
            const week = Number(match[2]);
            const jan4 = new Date(Date.UTC(year, 0, 4));
            const jan4Day = jan4.getUTCDay() || 7;
            const mondayWeek1 = new Date(jan4);
            mondayWeek1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
            const target = new Date(mondayWeek1);
            target.setUTCDate(mondayWeek1.getUTCDate() + ((week - 1) * 7));
            return target;
        },

        formatDateISO(date) {
            return date.toISOString().slice(0, 10);
        },

        renderProdutos() {
            if (this.recordsCount) {
                this.recordsCount.textContent = `${this.produtosCache.length} produto${this.produtosCache.length === 1 ? '' : 's'}`;
            }

            if (this.produtosCache.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Nenhum produto cadastrado para esta filial.</td></tr>';
                this.atualizarTotais();
                return;
            }

            const produtosOrdenados = this.getProdutosOrdenados();
            this.tableBody.innerHTML = produtosOrdenados.map(produto => {
                const estoque = this.estoqueCache.get(String(produto.id));
                const saida = this.saidasCache.get(String(produto.id));
                const caixas = Number(estoque?.quantidade_caixas) || 0;
                const saidaCaixas = Number(saida?.quantidade_caixas) || 0;
                const saldoCaixas = caixas - saidaCaixas;
                const caixasPorPalete = Number(produto.caixas_por_palete) || 0;
                const quantidades = this.calcularQuantidadesPelasCaixas(caixas, caixasPorPalete);
                const contagensProduto = estoque?.contagemIds?.size || 0;
                const pesoTotal = caixas * (Number(produto.peso_caixa) || 0);
                const textoBusca = this.normalizarTexto(`${produto.codigo || ''} ${produto.nome || ''} ${produto.tipo || ''}`);
                return `
                    <tr data-produto-id="${produto.id}"
                        data-codigo="${this.escapeHtml(produto.codigo || '-')}"
                        data-produto="${this.escapeHtml(produto.nome || '-')}"
                        data-tipo="${this.escapeHtml(produto.tipo || '-')}"
                        data-paletes="${quantidades.paletes}"
                        data-caixas-avulsas="${quantidades.caixasAvulsas}"
                        data-total-caixas="${caixas}"
                        data-saida-caixas="${saidaCaixas}"
                        data-saldo-caixas="${saldoCaixas}"
                        data-peso-total="${pesoTotal}"
                        data-contagens="${contagensProduto || 0}"
                        data-peso-caixa="${produto.peso_caixa || 0}"
                        data-total-paletes="${quantidades.paletes}"
                        data-search="${this.escapeHtml(textoBusca)}">
                        <td>${this.escapeHtml(produto.codigo) || '-'}</td>
                        <td>
                            <strong>${this.escapeHtml(produto.nome)}</strong>
                            <div class="produto-meta">CAIXAS/PALETE: ${this.escapeHtml(produto.caixas_por_palete || 0)}</div>
                        </td>
                        <td>${this.escapeHtml(produto.tipo) || '-'}</td>
                        <td class="estoque-total-paletes">${quantidades.paletes}</td>
                        <td class="estoque-caixas-avulsas">${quantidades.caixasAvulsas}</td>
                        <td class="estoque-qtd-caixas">${caixas}</td>
                        <td class="estoque-saida-caixas">${saidaCaixas}</td>
                        <td class="estoque-saldo-caixas">${saldoCaixas}</td>
                        <td class="estoque-peso-total">${this.formatPeso(pesoTotal)} KG</td>
                        <td>${contagensProduto || '-'}</td>
                    </tr>
                `;
            }).join('');

            this.filtrarTotalContagem();
            this.atualizarTotais();
            this.atualizarIconesOrdenacao();
        },

        getProdutosOrdenados() {
            const campo = this.sortTotalContagem.campo;
            const direcao = this.sortTotalContagem.direcao === 'desc' ? -1 : 1;
            return [...this.produtosCache].sort((a, b) => {
                const valorA = this.getValorOrdenacaoProduto(a, campo);
                const valorB = this.getValorOrdenacaoProduto(b, campo);
                if (typeof valorA === 'number' && typeof valorB === 'number') {
                    return (valorA - valorB) * direcao;
                }
                return String(valorA).localeCompare(String(valorB), 'pt-BR', {
                    numeric: true,
                    sensitivity: 'base'
                }) * direcao;
            });
        },

        getValorOrdenacaoProduto(produto, campo) {
            const estoque = this.estoqueCache.get(String(produto.id));
            const caixas = Number(estoque?.quantidade_caixas) || 0;
            const saida = this.saidasCache.get(String(produto.id));
            const saidaCaixas = Number(saida?.quantidade_caixas) || 0;
            const caixasPorPalete = Number(produto.caixas_por_palete) || 0;
            const quantidades = this.calcularQuantidadesPelasCaixas(caixas, caixasPorPalete);
            const contagensProduto = estoque?.contagemIds?.size || 0;
            const pesoTotal = caixas * (Number(produto.peso_caixa) || 0);

            const valores = {
                codigo: produto.codigo || '',
                produto: produto.nome || '',
                tipo: produto.tipo || '',
                paletes: quantidades.paletes,
                caixas_avulsas: quantidades.caixasAvulsas,
                total_caixas: caixas,
                saida_caixas: saidaCaixas,
                saldo_caixas: caixas - saidaCaixas,
                peso_total: pesoTotal,
                contagens: contagensProduto
            };
            return valores[campo] ?? '';
        },

        ordenarTotalContagem(campo) {
            if (!campo) return;
            if (this.sortTotalContagem.campo === campo) {
                this.sortTotalContagem.direcao = this.sortTotalContagem.direcao === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortTotalContagem = { campo, direcao: 'asc' };
            }
            this.renderProdutos();
        },

        atualizarIconesOrdenacao() {
            if (!this.totalTable) return;
            this.totalTable.querySelectorAll('.estoque-sort-btn').forEach(btn => {
                const icon = btn.querySelector('i');
                const ativo = btn.dataset.sort === this.sortTotalContagem.campo;
                btn.classList.toggle('active', ativo);
                if (!icon) return;
                icon.className = ativo
                    ? `fas fa-sort-${this.sortTotalContagem.direcao === 'asc' ? 'up' : 'down'}`
                    : 'fas fa-sort';
            });
        },

        filtrarTotalContagem() {
            const termo = this.buscaTotalContagem || '';
            const linhas = Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'));
            let visiveis = 0;

            linhas.forEach(tr => {
                const exibir = !termo || String(tr.dataset.search || '').includes(termo);
                tr.hidden = !exibir;
                if (exibir) visiveis++;
            });

            if (this.recordsCount) {
                const total = linhas.length;
                this.recordsCount.textContent = termo
                    ? `${visiveis} de ${total} produto${total === 1 ? '' : 's'}`
                    : `${total} produto${total === 1 ? '' : 's'}`;
            }
        },

        atualizarLinha(tr) {
            if (!tr) return;
            const caixas = this.getCaixasLinha(tr);
            const pesoCaixa = Number(tr.dataset.pesoCaixa) || 0;
            const pesoTotal = caixas * pesoCaixa;
            const cellPeso = tr.querySelector('.estoque-peso-total');
            if (cellPeso) cellPeso.textContent = `${this.formatPeso(pesoTotal)} KG`;
            this.atualizarTotais();
        },

        atualizarTotais() {
            const linhas = Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'));
            let totalPaletes = 0;
            let totalCaixas = 0;
            let totalPeso = 0;
            let produtosRegistrados = 0;

            linhas.forEach(tr => {
                const caixas = this.getCaixasLinha(tr);
                const paletes = parseInt(tr.dataset.totalPaletes || '0', 10);
                const pesoCaixa = Number(tr.dataset.pesoCaixa) || 0;

                if (caixas > 0) produtosRegistrados++;
                totalPaletes += Number.isFinite(paletes) ? paletes : 0;
                totalCaixas += caixas;
                totalPeso += caixas * pesoCaixa;
            });

            if (this.kpiTotalPaletes) this.kpiTotalPaletes.textContent = String(totalPaletes);
            this.kpiTotalCaixas.textContent = String(totalCaixas);
            this.kpiPesoTotal.textContent = `${this.formatPeso(totalPeso)} KG`;
            this.kpiProdutosRegistrados.textContent = String(produtosRegistrados);
        },

        getCaixasLinha(tr) {
            const value = tr.dataset.totalCaixas;
            const numero = parseInt(value, 10);
            return Number.isFinite(numero) && numero >= 0 ? numero : 0;
        },

        calcularQuantidadesPelasCaixas(caixas, caixasPorPalete) {
            const totalCaixas = Number(caixas) || 0;
            const capacidadePalete = Number(caixasPorPalete) || 0;
            if (!totalCaixas) {
                return { paletes: 0, caixasAvulsas: 0 };
            }
            if (!capacidadePalete) {
                return { paletes: 0, caixasAvulsas: totalCaixas };
            }
            return {
                paletes: Math.floor(totalCaixas / capacidadePalete),
                caixasAvulsas: totalCaixas % capacidadePalete
            };
        },

        getLinhasExportacao() {
            return Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'))
                .filter(tr => !tr.hidden)
                .map(tr => ({
                    codigo: tr.dataset.codigo || '-',
                    produto: tr.dataset.produto || '-',
                    tipo: tr.dataset.tipo || '-',
                    paletes: Number(tr.dataset.paletes) || 0,
                    caixas: Number(tr.dataset.caixasAvulsas) || 0,
                    totalCaixas: Number(tr.dataset.totalCaixas) || 0,
                    saidaCaixas: Number(tr.dataset.saidaCaixas) || 0,
                    saldoCaixas: Number(tr.dataset.saldoCaixas) || 0,
                    pesoTotal: Number(tr.dataset.pesoTotal) || 0,
                    contagens: Number(tr.dataset.contagens) || 0
                }));
        },

        getContextoExportacao() {
            const fabricaLabel = this.fabricaSelect.value === '__TODAS__'
                ? 'Todas'
                : (this.fabricaSelect.options[this.fabricaSelect.selectedIndex]?.text || '-');
            return {
                filial: this.filialSelect.value || '-',
                semana: this.formatSemanaDisplay(this.semanaInput.value),
                dia: this.formatDiaSemana(this.diaSemanaSelect.value),
                fabrica: fabricaLabel
            };
        },

        getTotaisExportacao(linhas) {
            return linhas.reduce((acc, item) => {
                acc.paletes += item.paletes;
                acc.caixas += item.caixas;
                acc.totalCaixas += item.totalCaixas;
                acc.saidaCaixas += item.saidaCaixas;
                acc.saldoCaixas += item.saldoCaixas;
                acc.peso += item.pesoTotal;
                if (item.totalCaixas > 0) acc.produtos += 1;
                return acc;
            }, { paletes: 0, caixas: 0, totalCaixas: 0, saidaCaixas: 0, saldoCaixas: 0, peso: 0, produtos: 0 });
        },

        exportarPDF() {
            const linhas = this.getLinhasExportacao();
            if (linhas.length === 0) return alert('Carregue o grid antes de gerar o PDF.');
            if (!window.jspdf?.jsPDF) return alert('Biblioteca jsPDF nao carregada.');
            this.abrirModalOrientacaoPDF();
        },

        abrirModalOrientacaoPDF() {
            let modal = document.getElementById('modalOrientacaoEstoquePDF');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'modalOrientacaoEstoquePDF';
                modal.className = 'estoque-pdf-orientacao-modal hidden';
                modal.innerHTML = `
                    <div class="estoque-pdf-orientacao-card">
                        <h3><i class="fas fa-file-pdf"></i> Gerar PDF</h3>
                        <p>Escolha a orientação do relatório.</p>
                        <div class="estoque-pdf-orientacao-actions">
                            <button type="button" class="btn-glass btn-blue" data-orientacao="portrait"><i class="fas fa-file-alt"></i> Vertical</button>
                            <button type="button" class="btn-glass btn-green" data-orientacao="landscape"><i class="fas fa-image"></i> Horizontal</button>
                        </div>
                        <button type="button" class="estoque-pdf-orientacao-cancelar">Cancelar</button>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.addEventListener('click', (e) => {
                    const orientacaoBtn = e.target.closest('[data-orientacao]');
                    if (orientacaoBtn) {
                        modal.classList.add('hidden');
                        this.gerarPDFComOrientacao(orientacaoBtn.dataset.orientacao);
                        return;
                    }
                    if (e.target === modal || e.target.closest('.estoque-pdf-orientacao-cancelar')) {
                        modal.classList.add('hidden');
                    }
                });
            }
            modal.classList.remove('hidden');
        },

        async gerarPDFComOrientacao(orientacao = 'landscape') {
            const linhas = this.getLinhasExportacao();
            if (linhas.length === 0) return alert('Carregue o grid antes de gerar o PDF.');
            if (!window.jspdf?.jsPDF) return alert('Biblioteca jsPDF nao carregada.');

            const contexto = this.getContextoExportacao();
            const totais = this.getTotaisExportacao(linhas);
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: orientacao, unit: 'mm', format: 'a4' });
            const logo = await this.getLogoBase64PDF();
            const tituloX = orientacao === 'portrait' ? 14 : 60;
            const logoWidth = orientacao === 'portrait' ? 36 : 42;
            const logoHeight = orientacao === 'portrait' ? 12 : 14;
            const titleY = orientacao === 'portrait' ? 28 : 15;
            const infoY = orientacao === 'portrait' ? 35 : 22;
            const totalY = orientacao === 'portrait' ? 41 : 28;
            const tableY = orientacao === 'portrait' ? 48 : 34;

            if (logo) doc.addImage(logo, 'JPEG', 12, 8, logoWidth, logoHeight);
            doc.setFontSize(15);
            doc.setTextColor(0, 105, 55);
            doc.text('TOTAL DA CONTAGEM - CAMARA FRIA', tituloX, titleY);
            doc.setFontSize(9);
            doc.setTextColor(40);
            doc.text(`Filial: ${contexto.filial} | Semana: ${contexto.semana} | Dia: ${contexto.dia} | Fabrica: ${contexto.fabrica}`, tituloX, infoY);
            doc.text(`Paletes: ${totais.paletes} | Caixas: ${totais.caixas} | Total: ${totais.totalCaixas} | Saida: ${totais.saidaCaixas} | Saldo: ${totais.saldoCaixas} | Peso: ${this.formatPeso(totais.peso)} KG`, tituloX, totalY);

            doc.autoTable({
                head: [['Codigo', 'Produto', 'Tipo', 'Paletes', 'Caixas', 'Total Caixas', 'Saida', 'Saldo', 'Peso Total', 'Contagens']],
                body: linhas.map(item => [
                    item.codigo,
                    item.produto,
                    item.tipo,
                    String(item.paletes),
                    String(item.caixas),
                    String(item.totalCaixas),
                    String(item.saidaCaixas),
                    String(item.saldoCaixas),
                    `${this.formatPeso(item.pesoTotal)} KG`,
                    String(item.contagens)
                ]),
                startY: tableY,
                theme: 'grid',
                headStyles: { fillColor: [0, 105, 55], textColor: [255, 255, 255], halign: 'center', fontSize: 8 },
                bodyStyles: { fillColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [238, 248, 241] },
                styles: { fontSize: orientacao === 'portrait' ? 7 : 8, cellPadding: 2, halign: 'center' },
                columnStyles: { 1: { halign: 'left', cellWidth: orientacao === 'portrait' ? 38 : 68 } }
            });

            doc.save(this.getNomeArquivoExportacao('pdf'));
        },

        exportarXLSX() {
            const linhas = this.getLinhasExportacao();
            if (linhas.length === 0) return alert('Carregue o grid antes de gerar o XLSX.');
            if (!window.XLSX) return alert('Biblioteca XLSX nao carregada.');

            const contexto = this.getContextoExportacao();
            const totais = this.getTotaisExportacao(linhas);
            const dados = [
                ['TOTAL DA CONTAGEM - CAMARA FRIA'],
                [`Filial: ${contexto.filial}`, `Semana: ${contexto.semana}`, `Dia: ${contexto.dia}`, `Fabrica: ${contexto.fabrica}`],
                [`Paletes: ${totais.paletes}`, `Caixas: ${totais.caixas}`, `Total Caixas: ${totais.totalCaixas}`, `Saida: ${totais.saidaCaixas}`, `Saldo: ${totais.saldoCaixas}`, `Peso: ${this.formatPeso(totais.peso)} KG`, `Produtos: ${totais.produtos}`],
                [],
                ['Codigo', 'Produto', 'Tipo', 'Paletes', 'Caixas', 'Total Caixas', 'Saida', 'Saldo', 'Peso Total', 'Contagens'],
                ...linhas.map(item => [
                    item.codigo,
                    item.produto,
                    item.tipo,
                    item.paletes,
                    item.caixas,
                    item.totalCaixas,
                    item.saidaCaixas,
                    item.saldoCaixas,
                    item.pesoTotal,
                    item.contagens
                ])
            ];

            const ws = window.XLSX.utils.aoa_to_sheet(dados);
            ws['!cols'] = [
                { wch: 14 }, { wch: 38 }, { wch: 18 }, { wch: 10 },
                { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
                { wch: 14 }, { wch: 10 }
            ];
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, 'Total Contagem');
            window.XLSX.writeFile(wb, this.getNomeArquivoExportacao('xlsx'));
        },

        getNomeArquivoExportacao(extensao) {
            const contexto = this.getContextoExportacao();
            const diaArquivo = this.diaSemanaSelect.value === DIA_SEMANA_TODOS ? 'TODAS' : this.diaSemanaSelect.value;
            return `Total_Contagem_Camara_Fria_${contexto.filial}_${this.semanaInput.value}_${diaArquivo}_${contexto.fabrica}.${extensao}`
                .replace(/[^a-z0-9_.-]+/gi, '_');
        },

        getLogoBase64PDF() {
            return new Promise(resolve => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.src = 'logo.png';
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

        alertaEstoqueCalculado() {
            alert('O estoque da Camara Fria agora e calculado automaticamente pelas contagens filtradas por Semana, Dia e Fabrica.');
        },

        async salvarEstoque() {
            this.alertaEstoqueCalculado();
            return;

            const usuario = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            const linhas = Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'));
            if (linhas.length === 0) return alert('Carregue os produtos antes de salvar.');

            const upserts = [];
            const deletarIds = [];

            for (const tr of linhas) {
                const caixasInput = tr.querySelector('.input-caixas-estoque');
                const observacaoInput = tr.querySelector('.input-observacao-estoque');
                const valorTexto = String(caixasInput?.value || '').trim();
                const estoqueId = tr.dataset.estoqueId;

                if (!valorTexto) {
                    if (estoqueId) deletarIds.push(estoqueId);
                    continue;
                }

                const quantidade = parseInt(valorTexto, 10);
                if (!Number.isFinite(quantidade) || quantidade < 0) {
                    alert('Informe apenas quantidades validas de caixas.');
                    caixasInput.focus();
                    return;
                }

                upserts.push({
                    filial: this.filialSelect.value,
                    semana: this.semanaInput.value,
                    fabrica_id: this.fabricaSelect.value,
                    produto_id: tr.dataset.produtoId,
                    quantidade_caixas: quantidade,
                    observacao: observacaoInput.value.trim() || null,
                    usuario: usuario?.nome || 'Sistema',
                    updated_at: new Date().toISOString()
                });
            }

            if (upserts.length === 0 && deletarIds.length === 0) {
                return alert('Informe a quantidade de caixas de pelo menos um produto.');
            }

            this.btnSalvar.disabled = true;
            this.btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            try {
                if (upserts.length > 0) {
                    const { error } = await supabaseClient
                        .from('estoque_camara_fria')
                        .upsert(upserts, { onConflict: 'filial,semana,fabrica_id,produto_id' });
                    if (error) throw error;
                }

                if (deletarIds.length > 0) {
                    const { error } = await supabaseClient
                        .from('estoque_camara_fria')
                        .delete()
                        .in('id', deletarIds);
                    if (error) throw error;
                }

                registrarAuditoria('ALTERAR', 'Câmara Fria', `Estoque semanal salvo - Filial: ${this.filialSelect.value}, Semana: ${this.semanaInput.value}`);
                alert('Estoque semanal salvo com sucesso!');
                await this.carregarLancamento();
            } catch (error) {
                console.error('Erro ao salvar estoque:', error);
                alert('Erro ao salvar estoque: ' + error.message);
            } finally {
                this.btnSalvar.disabled = false;
                this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
            }
        },

        limparLancamento() {
            this.alertaEstoqueCalculado();
        },

        async renderHistorico() {
            try {
                let query = supabaseClient
                    .from('estoque_camara_fria')
                    .select('id, filial, semana, quantidade_caixas, usuario, updated_at, produtos_camara_fria(codigo, nome, peso_caixa), fabricas_camara_fria(nome)')
                    .order('semana', { ascending: false })
                    .order('updated_at', { ascending: false })
                    .limit(300);

                if (this.filialSelect?.value) query = query.eq('filial', this.filialSelect.value);
                if (this.semanaInput?.value) query = query.eq('semana', this.semanaInput.value);
                if (this.fabricaSelect?.value && this.fabricaSelect.value !== '__TODAS__') {
                    query = query.eq('fabrica_id', this.fabricaSelect.value);
                }

                const { data, error } = await query;
                if (error) throw error;

                const registros = data || [];
                if (this.historicoCount) this.historicoCount.textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'}`;

                if (registros.length === 0) {
                    this.historicoBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
                    return;
                }

                this.historicoBody.innerHTML = registros.map(item => {
                    const produto = item.produtos_camara_fria || {};
                    const pesoTotal = (Number(item.quantidade_caixas) || 0) * (Number(produto.peso_caixa) || 0);
                    return `
                        <tr>
                            <td>${this.escapeHtml(item.filial)}</td>
                            <td>${this.escapeHtml(item.semana)}</td>
                            <td>${this.escapeHtml(item.fabricas_camara_fria?.nome || '-')}</td>
                            <td>${this.escapeHtml(produto.codigo || '-')}</td>
                            <td>${this.escapeHtml(produto.nome || '-')}</td>
                            <td>${item.quantidade_caixas}</td>
                            <td>${this.formatPeso(pesoTotal)} KG</td>
                            <td>${this.escapeHtml(item.usuario || '-')}</td>
                            <td class="actions-cell">
                                <button class="btn-icon delete" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (error) {
                console.error('Erro ao carregar historico:', error);
                this.historicoBody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#dc3545;">Erro ao carregar historico.</td></tr>';
            }
        },

        async handleHistoricoClick(e) {
            const btn = e.target.closest('button.delete');
            if (!btn) return;
            if (!confirm('Excluir este registro de estoque?')) return;

            try {
                const { error } = await supabaseClient
                    .from('estoque_camara_fria')
                    .delete()
                    .eq('id', btn.dataset.id);
                if (error) throw error;
                registrarAuditoria('EXCLUIR', 'Câmara Fria', `Exclusão de registro de estoque ID ${btn.dataset.id}`);
                await this.carregarLancamento();
            } catch (error) {
                console.error('Erro ao excluir registro:', error);
                alert('Erro ao excluir registro: ' + error.message);
            }
        },

        openCadastroFabrica() {
            if (!this.filialSelect.value && !this.filialRestrita) {
                alert('Selecione a filial antes de cadastrar uma fabrica.');
                this.filialSelect.focus();
                return;
            }
            if (this.fabricaFilial) this.fabricaFilial.value = this.filialSelect.value || this.filialRestrita;
            this.modalFabrica.classList.remove('hidden');
            this.fabricaNome.focus();
        },

        closeCadastroFabrica() {
            this.modalFabrica.classList.add('hidden');
            this.clearFabricaForm();
        },

        clearFabricaForm() {
            this.formFabrica.reset();
            this.fabricaEditingId.value = '';
            if (this.fabricaFilial) this.fabricaFilial.value = this.filialSelect.value || this.filialRestrita || '';
            this.btnSalvarCadastroFabrica.innerHTML = '<i class="fas fa-save"></i> Salvar Fabrica';
        },

        async handleFabricaSubmit(e) {
            e.preventDefault();
            if (!this.fabricaFilial.value) {
                alert('Selecione a filial da fabrica.');
                this.fabricaFilial.focus();
                return;
            }
            const payload = {
                filial: this.fabricaFilial.value,
                nome: this.fabricaNome.value.trim(),
                ativo: true,
                updated_at: new Date().toISOString()
            };
            if (this.fabricaEditingId.value) payload.id = this.fabricaEditingId.value;

            try {
                const { error } = await supabaseClient.from('fabricas_camara_fria').upsert(payload);
                if (error) throw error;
                registrarAuditoria(
                    this.fabricaEditingId.value ? 'ALTERAR' : 'INCLUIR',
                    'Câmara Fria',
                    `${this.fabricaEditingId.value ? 'Atualização' : 'Cadastro'} de fábrica: ${payload.nome}`
                );
                this.clearFabricaForm();
                await this.loadFabricas();
            } catch (error) {
                console.error('Erro ao salvar fabrica:', error);
                alert('Erro ao salvar fabrica: ' + error.message);
            }
        },

        renderFabricasGrid() {
            this.tbodyFabricas.innerHTML = this.fabricasCache.length
                ? this.fabricasCache.map(fabrica => `
                    <tr>
                        <td>${this.escapeHtml(fabrica.filial || '-')}</td>
                        <td>${this.escapeHtml(fabrica.nome)}</td>
                        <td class="actions-cell">
                            <button class="btn-icon edit" data-id="${fabrica.id}" title="Editar"><i class="fas fa-pen"></i></button>
                            <button class="btn-icon delete" data-id="${fabrica.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('')
                : '<tr><td colspan="3" style="text-align:center;">Nenhuma fabrica cadastrada para esta filial.</td></tr>';
        },

        handleFabricasGridClick(e) {
            const button = e.target.closest('button');
            if (!button) return;
            const fabrica = this.fabricasCache.find(item => String(item.id) === String(button.dataset.id));
            if (!fabrica) return;

            if (button.classList.contains('edit')) {
                this.fabricaEditingId.value = fabrica.id;
                if (this.fabricaFilial) this.fabricaFilial.value = fabrica.filial || this.filialSelect.value || '';
                this.fabricaNome.value = fabrica.nome;
                this.btnSalvarCadastroFabrica.innerHTML = '<i class="fas fa-save"></i> Atualizar Fabrica';
            } else if (button.classList.contains('delete')) {
                this.deleteFabrica(fabrica);
            }
        },

        async deleteFabrica(fabrica) {
            if (!confirm(`Excluir a fabrica "${fabrica.nome}"?`)) return;

            try {
                const { data: emUso, error: consultaError } = await supabaseClient
                    .from('estoque_camara_fria')
                    .select('id')
                    .eq('fabrica_id', fabrica.id)
                    .limit(1);
                if (consultaError) throw consultaError;
                if (emUso && emUso.length > 0) {
                    alert('Esta fabrica possui registros de estoque e nao pode ser excluida.');
                    return;
                }

                const { error } = await supabaseClient
                    .from('fabricas_camara_fria')
                    .delete()
                    .eq('id', fabrica.id);
                if (error) throw error;

                registrarAuditoria('EXCLUIR', 'Câmara Fria', `Exclusão de fábrica: ${fabrica.nome}`);
                await this.loadFabricas();
            } catch (error) {
                console.error('Erro ao excluir fabrica:', error);
                alert('Erro ao excluir fabrica: ' + error.message);
            }
        },

        escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        },

        normalizarTexto(value) {
            return String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .trim();
        },

        formatSemanaDisplay(value) {
            const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
            return match ? `${match[2]}-${match[1]}` : (value || '-');
        },

        formatDiaSemana(value) {
            if (String(value || '').trim().toUpperCase() === DIA_SEMANA_TODOS) return 'Todas';
            const labels = {
                SEGUNDA: 'SEGUNDA',
                TERCA: 'TERÇA',
                QUARTA: 'QUARTA',
                QUINTA: 'QUINTA',
                SEXTA: 'SEXTA',
                SABADO: 'SÁBADO',
                DOMINGO: 'DOMINGO'
            };
            return labels[String(value || '').trim().toUpperCase()] || '-';
        },

        formatPeso(value) {
            return Number(value || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            });
        }
    };

    EstoqueCamaraFriaUI.init();
});
