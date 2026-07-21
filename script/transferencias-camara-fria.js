import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const DIAS_SEMANA = [
    { field: 'segunda', label: 'Segunda' },
    { field: 'terca', label: 'Terca' },
    { field: 'quarta', label: 'Quarta' },
    { field: 'quinta', label: 'Quinta' },
    { field: 'sexta', label: 'Sexta' }
];

// Ordem das celulas editaveis de cada linha, usada na navegacao por setas e na colagem em bloco
const CAMPOS_NAV = ['estoque', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'transferir'];

// Mascara de placa (AAA-0A00, cobre padrao antigo e Mercosul) reutilizada do padrao ja usado
// na portaria — deixa em branco = "Sem Placa" definida ainda para aquele dia.
function formatarPlacaMascaraTransf(valor) {
    const limpo = String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
    return limpo.length > 3 ? `${limpo.slice(0, 3)}-${limpo.slice(3)}` : limpo;
}

// Colunas do subcabecalho ordenavel que se repete dentro de cada grupo de Tipo
const COLUNAS_ORDENAVEIS = [
    ['codigo', 'Codigo'], ['produto', 'Produto'], ['estoque', 'Estoque'],
    ['segunda', 'Segunda'], ['terca', 'Terca'], ['quarta', 'Quarta'], ['quinta', 'Quinta'], ['sexta', 'Sexta'],
    ['total', 'Total'], ['saldo', 'Saldo'], ['transferir', 'Transferir']
];

document.addEventListener('DOMContentLoaded', () => {
    const TransferenciasCamaraFriaUI = {
        filialRestrita: '',
        acessoGlobal: true,
        produtosCache: [],
        existentesCache: new Map(),
        tiposOrdemCache: new Map(),
        sortPorTipo: new Map(),
        somenteLeitura: false,

        init() {
            this.cache();
            this.bind();
            this.aplicarRestricaoFilial();
            this.definirSemanaAtual();
            this.definirDataContagemAtual();
            this.loadFiliais();
            this.renderTabelaInicial();
            this.carregarHistorico();
        },

        cache() {
            this.filialSelect = document.getElementById('transfFilial');
            this.semanaInput = document.getElementById('transfSemana');
            this.dataContagemInput = document.getElementById('transfDataContagem');
            this.buscaInput = document.getElementById('transfBusca');
            this.btnGerar = document.getElementById('btnGerarListaTransf');
            this.btnSalvar = document.getElementById('btnSalvarTransf');
            this.btnPDF = document.getElementById('btnTransfPDF');
            this.btnXLSX = document.getElementById('btnTransfXLSX');
            this.tableBody = document.getElementById('tableBodyTransfCamara');
            this.recordsCount = document.getElementById('transfRecordsCount');
            this.kpiProdutos = document.getElementById('kpiTransfProdutos');
            this.kpiTotal = document.getElementById('kpiTransfTotal');
            this.kpiSaldo = document.getElementById('kpiTransfSaldo');
            this.kpiMarcados = document.getElementById('kpiTransfMarcados');
            this.modoBanner = document.getElementById('transfModoLeituraBanner');
            this.btnEditarAtual = document.getElementById('btnTransfEditarAtual');
            this.historicoBody = document.getElementById('tbodyTransfHistorico');
            this.historicoCount = document.getElementById('transfHistoricoCount');
            this.placaInputs = new Map(
                Array.from(document.querySelectorAll('.input-placa-dia')).map(input => [input.dataset.dia, input])
            );
        },

        bind() {
            this.btnGerar.addEventListener('click', () => this.gerarLista());
            this.btnSalvar.addEventListener('click', () => this.salvar());
            this.btnPDF.addEventListener('click', () => this.exportarPDF());
            this.btnXLSX.addEventListener('click', () => this.exportarXLSX());
            this.buscaInput.addEventListener('input', () => this.filtrarBusca());
            this.tableBody.addEventListener('input', (event) => {
                if (event.target.matches('.input-transf')) this.atualizarLinha(event.target.closest('tr'));
            });
            this.tableBody.addEventListener('change', (event) => {
                if (event.target.matches('.select-transferir')) this.atualizarSelectTransferir(event.target);
            });
            this.tableBody.addEventListener('keydown', (event) => this.handleArrowNav(event));
            this.tableBody.addEventListener('paste', (event) => this.handlePasteGrid(event));
            this.tableBody.addEventListener('click', (event) => {
                const btn = event.target.closest('.estoque-sort-btn');
                if (btn) this.ordenarPorColuna(btn.dataset.tipo, btn.dataset.sort);
            });
            [this.filialSelect, this.semanaInput, this.dataContagemInput].forEach(el => {
                el.addEventListener('change', () => this.renderTabelaInicial());
            });
            this.placaInputs.forEach(input => {
                input.addEventListener('input', () => { input.value = formatarPlacaMascaraTransf(input.value); });
            });
            this.btnEditarAtual?.addEventListener('click', () => {
                this.somenteLeitura = false;
                this.aplicarModoSomenteLeitura();
            });
            this.historicoBody?.addEventListener('click', (event) => {
                const btn = event.target.closest('button[data-acao]');
                if (!btn) return;
                const item = {
                    filial: btn.dataset.filial,
                    semana: btn.dataset.semana,
                    dataContagem: btn.dataset.dataContagem
                };
                if (btn.dataset.acao === 'visualizar') this.abrirListaDoHistorico(item, true);
                else if (btn.dataset.acao === 'editar') this.abrirListaDoHistorico(item, false);
                else if (btn.dataset.acao === 'excluir') this.excluirLista(item);
            });
        },

        aplicarRestricaoFilial() {
            const usuarioLogado = this.getUsuarioLogado();
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

        definirDataContagemAtual() {
            const hoje = new Date();
            const iso = new Date(hoje.getTime() - hoje.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            this.dataContagemInput.value = iso;
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

                if (this.filialRestrita) {
                    if (!Array.from(this.filialSelect.options).some(option => option.value === this.filialRestrita)) {
                        this.filialSelect.add(new Option(this.filialRestrita, this.filialRestrita));
                    }
                    this.filialSelect.value = this.filialRestrita;
                    this.filialSelect.disabled = true;
                }
            } catch (error) {
                console.error('Erro ao carregar filiais:', error);
            }
        },

        formularioValido() {
            if (!this.filialSelect.value || !this.semanaInput.value || !this.dataContagemInput.value) {
                alert('Preencha Filial, Semana e Data da Contagem do Estoque.');
                return false;
            }
            return true;
        },

        renderTabelaInicial() {
            this.produtosCache = [];
            this.existentesCache = new Map();
            this.tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Selecione Filial, Semana e Data da Contagem e clique em Gerar Lista.</td></tr>';
            if (this.recordsCount) this.recordsCount.textContent = '';
            this.placaInputs.forEach(input => { input.value = ''; });
            this.atualizarKpis();
        },

        async gerarLista() {
            if (!this.formularioValido()) return;

            this.btnGerar.disabled = true;
            this.btnGerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
            this.tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Carregando produtos...</td></tr>';

            try {
                const filial = this.filialSelect.value;
                const semana = this.semanaInput.value;
                const dataContagem = this.dataContagemInput.value;

                const [produtosResult, existentesResult, tiposResult, placasResult] = await Promise.all([
                    // Busca TODOS os produtos ativos (nao filtra por filial aqui): produtos de
                    // outras filiais continuam aparecendo na lista, so ficam travados/zerados
                    // (ver produtoBloqueadoParaFilial), para dar visibilidade do catalogo completo.
                    supabaseClient
                        .from('produtos_camara_fria')
                        .select('id, codigo, nome, tipo, filial, filiais')
                        .eq('ativo', true)
                        .order('nome'),
                    supabaseClient
                        .from('transferencias_camara_fria')
                        .select('id, produto_id, estoque, segunda, terca, quarta, quinta, sexta, transferir')
                        .eq('filial', filial)
                        .eq('semana', semana)
                        .eq('data_contagem', dataContagem),
                    supabaseClient
                        .from('tipos_produto_camara_fria')
                        .select('nome, ordem')
                        .eq('ativo', true),
                    supabaseClient
                        .from('transferencias_camara_fria_placas')
                        .select('dia, placa')
                        .eq('filial', filial)
                        .eq('semana', semana)
                        .eq('data_contagem', dataContagem)
                ]);

                if (produtosResult.error) throw produtosResult.error;
                if (existentesResult.error) throw existentesResult.error;
                if (tiposResult.error) throw tiposResult.error;
                if (placasResult.error) throw placasResult.error;

                this.produtosCache = produtosResult.data || [];
                this.existentesCache = new Map((existentesResult.data || []).map(item => [String(item.produto_id), item]));
                // Busca a Ordem configurada de cada Tipo sempre que a lista e gerada, para
                // refletir na hora qualquer Tipo novo ou reordenado no Cadastro de Produtos.
                this.tiposOrdemCache = new Map((tiposResult.data || []).map(item => [this.normalizarTipo(item.nome), Number(item.ordem)]));
                this.renderTabela();
                this.renderPlacasDias(placasResult.data || []);
            } catch (error) {
                console.error('Erro ao gerar lista de transferencias:', error);
                alert('Erro ao gerar lista: ' + error.message);
                this.tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
            } finally {
                this.btnGerar.disabled = false;
                this.btnGerar.innerHTML = '<i class="fas fa-list"></i> Gerar Lista';
            }
        },

        agruparPorTipo(produtos) {
            const grupos = new Map();
            produtos.forEach(produto => {
                const tipo = this.normalizarTipo(produto.tipo) || 'SEM TIPO';
                if (!grupos.has(tipo)) grupos.set(tipo, []);
                grupos.get(tipo).push(produto);
            });

            // A sequencia dos Tipos vem da coluna "Ordem" configurada no Cadastro de
            // Produtos (tipos_produto_camara_fria.ordem). Tipos sem ordem configurada
            // (ou que ainda nao existam la) caem no final, em ordem alfabetica.
            const comOrdem = [];
            const semOrdem = [];
            Array.from(grupos.keys()).forEach(tipo => {
                const ordem = this.tiposOrdemCache?.get(tipo);
                if (Number.isFinite(ordem)) comOrdem.push({ tipo, ordem });
                else semOrdem.push(tipo);
            });

            comOrdem.sort((a, b) => a.ordem - b.ordem || a.tipo.localeCompare(b.tipo, 'pt-BR'));
            semOrdem.sort((a, b) => a.localeCompare(b, 'pt-BR'));

            return [...comOrdem.map(item => item.tipo), ...semOrdem]
                .map(tipo => [tipo, grupos.get(tipo)]);
        },

        // Produto so fica disponivel para preenchimento nas filiais marcadas no seu
        // cadastro (produtos_camara_fria.filiais). Sem nenhuma filial marcada = Todas.
        produtoBloqueadoParaFilial(produto, filialAtual) {
            const lista = Array.isArray(produto.filiais) && produto.filiais.length
                ? produto.filiais
                : (produto.filial ? [produto.filial] : null);
            if (!lista) return false;
            return !lista.includes(filialAtual);
        },

        renderTabela() {
            if (this.recordsCount) {
                this.recordsCount.textContent = `${this.produtosCache.length} produto${this.produtosCache.length === 1 ? '' : 's'}`;
            }

            if (this.produtosCache.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Nenhum produto cadastrado.</td></tr>';
                this.atualizarKpis();
                return;
            }

            const grupos = this.agruparPorTipo(this.produtosCache);
            let html = '';

            grupos.forEach(([tipo, produtos]) => {
                html += `<tr class="transf-tipo-row" data-tipo-header="${this.escapeHtml(tipo)}"><td colspan="11">${this.escapeHtml(tipo)}</td></tr>`;
                html += `<tr class="transf-subheader-row" data-tipo-subheader="${this.escapeHtml(tipo)}">${this.montarSubheaderColunas(tipo)}</tr>`;
                produtos.forEach(produto => {
                    const bloqueado = this.produtoBloqueadoParaFilial(produto, this.filialSelect.value);
                    const existente = bloqueado ? null : this.existentesCache.get(String(produto.id));
                    const nomeBusca = this.normalizarTexto(`${produto.codigo || ''} ${produto.nome} ${tipo}`);
                    const disabledAttr = bloqueado ? 'disabled' : '';
                    const inputsDias = DIAS_SEMANA.map(dia => `
                        <td><input type="number" min="0" step="1" class="input-transf" data-field="${dia.field}" value="${bloqueado ? '' : (existente?.[dia.field] ?? '')}" ${disabledAttr}></td>
                    `).join('');
                    const marcado = bloqueado || existente?.transferir === 'VENDA FECHADA';
                    const linhaAttrs = bloqueado
                        ? ` class="transf-linha-bloqueada" title="Produto nao disponivel para esta filial — Transferir travado como VENDA FECHADA"`
                        : '';

                    html += `
                        <tr data-produto-id="${produto.id}" data-existing-id="${bloqueado ? '' : (existente?.id || '')}" data-tipo="${this.escapeHtml(tipo)}" data-busca="${this.escapeHtml(nomeBusca)}"${linhaAttrs}>
                            <td>${this.escapeHtml(produto.codigo) || '-'}</td>
                            <td>${this.escapeHtml(produto.nome)}</td>
                            <td><input type="number" min="0" step="1" class="input-transf" data-field="estoque" value="${bloqueado ? '' : (existente?.estoque ?? '')}" ${disabledAttr}></td>
                            ${inputsDias}
                            <td class="transf-total-cell" data-total>0</td>
                            <td class="transf-saldo-cell" data-saldo>0</td>
                            <td>
                                <select class="select-transferir ${marcado ? 'marcado' : ''}" data-field="transferir" ${disabledAttr}>
                                    <option value="">(vazio)</option>
                                    <option value="VENDA FECHADA" ${marcado ? 'selected' : ''}>VENDA FECHADA</option>
                                </select>
                            </td>
                        </tr>
                    `;
                });
            });

            this.tableBody.innerHTML = html;
            this.tableBody.querySelectorAll('tr[data-produto-id]').forEach(tr => this.atualizarLinha(tr));
            this.filtrarBusca();
            this.aplicarOrdenacaoGrupos();
            this.atualizarIconesOrdenacao();
            this.aplicarModoSomenteLeitura();
        },

        montarSubheaderColunas(tipo) {
            const tipoAttr = this.escapeHtml(tipo);
            return COLUNAS_ORDENAVEIS.map(([campo, label]) => `
                <td><button type="button" class="estoque-sort-btn" data-tipo="${tipoAttr}" data-sort="${campo}">${label} <i class="fas fa-sort"></i></button></td>
            `).join('');
        },

        // Preenche a placa de cada dia (Segunda a Sexta) salva para esta Filial+Semana+Data da
        // Contagem. Dia sem registro salvo (ainda nao definido) ou com placa nula ("Sem Placa")
        // fica em branco no campo.
        renderPlacasDias(placas) {
            const porDia = new Map((placas || []).map(item => [item.dia, item.placa || '']));
            this.placaInputs.forEach((input, dia) => {
                input.value = porDia.get(dia) || '';
            });
        },

        aplicarModoSomenteLeitura() {
            this.tableBody.querySelectorAll('tr[data-produto-id]').forEach(tr => {
                // Linhas bloqueadas por filial (produto nao disponivel para a filial atual)
                // ficam sempre desabilitadas, independente do modo visualizacao/edicao.
                const desabilitar = this.somenteLeitura || tr.classList.contains('transf-linha-bloqueada');
                tr.querySelectorAll('.input-transf, .select-transferir').forEach(el => {
                    el.disabled = desabilitar;
                });
            });
            this.placaInputs.forEach(input => { input.disabled = this.somenteLeitura; });
            this.btnSalvar.disabled = this.somenteLeitura;
            this.modoBanner?.classList.toggle('hidden', !this.somenteLeitura);
        },

        atualizarLinha(tr) {
            if (!tr) return;
            const estoque = this.getValorInt(tr, 'estoque');
            const total = DIAS_SEMANA.reduce((soma, dia) => soma + this.getValorInt(tr, dia.field), 0);
            const saldo = estoque - total;

            const totalCell = tr.querySelector('[data-total]');
            if (totalCell) totalCell.textContent = String(total);

            const saldoCell = tr.querySelector('[data-saldo]');
            if (saldoCell) {
                saldoCell.textContent = String(saldo);
                saldoCell.classList.remove('positivo', 'negativo');
                if (saldo > 0) saldoCell.classList.add('positivo');
                else if (saldo < 0) saldoCell.classList.add('negativo');
            }

            this.atualizarKpis();
        },

        atualizarSelectTransferir(select) {
            select.classList.toggle('marcado', select.value === 'VENDA FECHADA');
            this.atualizarKpis();
        },

        getValorInt(tr, field) {
            const input = tr.querySelector(`[data-field="${field}"]`);
            const numero = parseInt(input?.value, 10);
            return Number.isFinite(numero) && numero >= 0 ? numero : 0;
        },

        getLinhasProduto() {
            return Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'));
        },

        atualizarKpis() {
            const linhas = this.getLinhasProduto();
            let totalGeral = 0;
            let saldoGeral = 0;
            let marcados = 0;

            linhas.forEach(tr => {
                const totalCell = tr.querySelector('[data-total]');
                const saldoCell = tr.querySelector('[data-saldo]');
                totalGeral += parseInt(totalCell?.textContent, 10) || 0;
                saldoGeral += parseInt(saldoCell?.textContent, 10) || 0;
                const select = tr.querySelector('.select-transferir');
                if (select?.value === 'VENDA FECHADA') marcados += 1;
            });

            if (this.kpiProdutos) this.kpiProdutos.textContent = String(linhas.length);
            if (this.kpiTotal) this.kpiTotal.textContent = String(totalGeral);
            if (this.kpiSaldo) this.kpiSaldo.textContent = String(saldoGeral);
            if (this.kpiMarcados) this.kpiMarcados.textContent = String(marcados);
        },

        filtrarBusca() {
            const termo = this.normalizarTexto(this.buscaInput?.value || '');
            const linhasProduto = Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]'));
            const cabecalhos = Array.from(this.tableBody.querySelectorAll('tr[data-tipo-header]'));
            const subcabecalhos = Array.from(this.tableBody.querySelectorAll('tr[data-tipo-subheader]'));
            const visivelPorTipo = new Map();

            linhasProduto.forEach(tr => {
                const exibir = !termo || String(tr.dataset.busca || '').includes(termo);
                tr.hidden = !exibir;
                const tipo = tr.dataset.tipo;
                if (exibir) visivelPorTipo.set(tipo, true);
            });

            cabecalhos.forEach(tr => {
                tr.hidden = termo ? !visivelPorTipo.get(tr.dataset.tipoHeader) : false;
            });
            subcabecalhos.forEach(tr => {
                tr.hidden = termo ? !visivelPorTipo.get(tr.dataset.tipoSubheader) : false;
            });
        },

        // ── Ordenacao por coluna (independente para cada grupo de Tipo) ─────────
        ordenarPorColuna(tipo, campo) {
            if (!tipo || !campo) return;
            const atual = this.sortPorTipo.get(tipo) || { field: null, dir: 'asc' };
            if (atual.field === campo) {
                atual.dir = atual.dir === 'asc' ? 'desc' : 'asc';
            } else {
                atual.field = campo;
                atual.dir = 'asc';
            }
            this.sortPorTipo.set(tipo, atual);
            this.aplicarOrdenacaoGrupos();
            this.atualizarIconesOrdenacao();
        },

        aplicarOrdenacaoGrupos() {
            const grupos = this.getGruposDom();
            grupos.forEach(({ subheaderRow, tipo, rows }) => {
                const estado = this.sortPorTipo.get(tipo);
                if (!estado?.field || !subheaderRow) return;
                const ordenadas = rows.slice().sort((a, b) => {
                    const va = this.getValorOrdenacao(a, estado.field);
                    const vb = this.getValorOrdenacao(b, estado.field);
                    const cmp = (typeof va === 'number' && typeof vb === 'number')
                        ? va - vb
                        : String(va).localeCompare(String(vb), 'pt-BR');
                    return estado.dir === 'asc' ? cmp : -cmp;
                });
                let anchor = subheaderRow;
                ordenadas.forEach(tr => {
                    anchor.after(tr);
                    anchor = tr;
                });
            });
        },

        getGruposDom() {
            const grupos = [];
            let atual = null;
            Array.from(this.tableBody.children).forEach(tr => {
                if (tr.dataset.tipoHeader !== undefined) {
                    atual = { headerRow: tr, subheaderRow: null, tipo: tr.dataset.tipoHeader, rows: [] };
                    grupos.push(atual);
                } else if (atual && tr.dataset.tipoSubheader !== undefined) {
                    atual.subheaderRow = tr;
                } else if (atual && tr.dataset.produtoId) {
                    atual.rows.push(tr);
                }
            });
            return grupos;
        },

        getValorOrdenacao(tr, campo) {
            switch (campo) {
                case 'codigo': return this.normalizarTexto(tr.querySelector('td:nth-child(1)')?.textContent || '');
                case 'produto': return this.normalizarTexto(tr.querySelector('td:nth-child(2)')?.textContent || '');
                case 'total': return parseInt(tr.querySelector('[data-total]')?.textContent, 10) || 0;
                case 'saldo': return parseInt(tr.querySelector('[data-saldo]')?.textContent, 10) || 0;
                case 'transferir': return tr.querySelector('.select-transferir')?.value || '';
                default: return this.getValorInt(tr, campo);
            }
        },

        atualizarIconesOrdenacao() {
            this.tableBody.querySelectorAll('tr.transf-subheader-row').forEach(row => {
                const estado = this.sortPorTipo.get(row.dataset.tipoSubheader);
                row.querySelectorAll('.estoque-sort-btn').forEach(btn => {
                    const icon = btn.querySelector('i');
                    const ativo = Boolean(estado?.field) && btn.dataset.sort === estado.field;
                    btn.classList.toggle('active', ativo);
                    if (!icon) return;
                    icon.className = ativo ? `fas fa-sort-${estado.dir === 'asc' ? 'up' : 'down'}` : 'fas fa-sort';
                });
            });
        },

        // ── Navegacao por setas (estilo planilha) ───────────────────────────────
        handleArrowNav(event) {
            const target = event.target;
            if (!target.matches('.input-transf, .select-transferir')) return;
            const key = event.key;
            if (!key.startsWith('Arrow') && key !== 'Enter') return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;

            const isSelect = target.tagName === 'SELECT';
            const isTextLike = target.tagName === 'INPUT';

            if (key === 'Enter') {
                event.preventDefault();
                this.navRow(target, 1);
                return;
            }

            if (key === 'ArrowUp' || key === 'ArrowDown') {
                if (isSelect) return;
                event.preventDefault();
                this.navRow(target, key === 'ArrowDown' ? 1 : -1);
                return;
            }

            if (key === 'ArrowLeft' || key === 'ArrowRight') {
                if (isTextLike) {
                    const pos = target.selectionStart ?? 0;
                    const len = target.value.length;
                    if (key === 'ArrowLeft' && pos > 0) return;
                    if (key === 'ArrowRight' && pos < len) return;
                }
                event.preventDefault();
                this.navCell(target, key === 'ArrowRight' ? 1 : -1);
            }
        },

        navRow(el, direcao) {
            const field = el.dataset.field;
            const linhas = this.getLinhasVisiveis();
            const idx = linhas.indexOf(el.closest('tr'));
            if (idx === -1) return;
            const proxima = linhas[idx + direcao];
            if (!proxima) return;
            const proximoCampo = proxima.querySelector(`[data-field="${field}"]`);
            if (proximoCampo) this.focarCelula(proximoCampo);
        },

        navCell(el, direcao) {
            const tr = el.closest('tr');
            if (!tr) return;
            const idx = CAMPOS_NAV.indexOf(el.dataset.field);
            if (idx === -1) return;
            const proximoCampoNome = CAMPOS_NAV[idx + direcao];
            if (!proximoCampoNome) return;
            const proximoCampo = tr.querySelector(`[data-field="${proximoCampoNome}"]`);
            if (proximoCampo) this.focarCelula(proximoCampo);
        },

        focarCelula(el) {
            el.focus();
            if (el.tagName === 'INPUT') el.select();
        },

        getLinhasVisiveis() {
            return Array.from(this.tableBody.querySelectorAll('tr[data-produto-id]')).filter(tr => !tr.hidden);
        },

        // ── Colar em bloco (copiado do Excel), igual ao grid de Rotas/Peso de Carga ──
        handlePasteGrid(event) {
            const target = event.target;
            const field = target?.dataset?.field;
            if (!field) return;
            const startIdx = CAMPOS_NAV.indexOf(field);
            if (startIdx === -1) return;

            const clipboard = event.clipboardData || window.clipboardData;
            const texto = clipboard?.getData('text/plain') || clipboard?.getData('text') || '';
            if (!texto) return;

            const matriz = this.parseMatrizColagem(texto);
            if (matriz.length === 0) return;
            if (matriz.length === 1 && matriz[0].length === 1) return; // colagem simples: deixa o navegador colar direto

            event.preventDefault();

            const linhasVisiveis = this.getLinhasVisiveis();
            const startRowIdx = linhasVisiveis.indexOf(target.closest('tr'));
            if (startRowIdx === -1) return;

            matriz.forEach((valores, offsetLinha) => {
                const destino = linhasVisiveis[startRowIdx + offsetLinha];
                if (!destino) return; // lista de produtos e fixa: nao cria linhas novas
                if (destino.classList.contains('transf-linha-bloqueada')) return; // produto travado para esta filial
                valores.forEach((valor, offsetColuna) => {
                    const campo = CAMPOS_NAV[startIdx + offsetColuna];
                    if (!campo) return;
                    this.aplicarValorCelula(destino, campo, valor);
                });
            });

            this.atualizarKpis();
        },

        aplicarValorCelula(tr, campo, valorTexto) {
            const valor = String(valorTexto ?? '').trim();
            if (campo === 'transferir') {
                const select = tr.querySelector('.select-transferir');
                if (!select) return;
                select.value = this.normalizarTexto(valor).includes('venda fechada') ? 'VENDA FECHADA' : '';
                this.atualizarSelectTransferir(select);
                return;
            }
            const input = tr.querySelector(`[data-field="${campo}"]`);
            if (!input) return;
            const numero = parseInt(valor.replace(/[^\d-]/g, ''), 10);
            input.value = Number.isFinite(numero) && numero >= 0 ? String(numero) : '';
            this.atualizarLinha(tr);
        },

        parseMatrizColagem(texto) {
            const normalizado = String(texto || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const linhas = normalizado.split('\n').filter(linha => linha.trim() !== '');
            return linhas.map(linha => linha.split('\t').map(valor => valor.trim()));
        },

        async salvar() {
            if (this.somenteLeitura) return alert('Esta lista esta em modo visualizacao. Clique em "Editar esta lista" para alterar.');
            if (!this.formularioValido()) return;
            const linhas = this.getLinhasProduto();
            if (linhas.length === 0) return alert('Gere a lista antes de salvar.');

            const filial = this.filialSelect.value;
            const semana = this.semanaInput.value;
            const dataContagem = this.dataContagemInput.value;
            const usuario = this.getUsuarioLogado()?.nome || this.getUsuarioLogado()?.usuario_login || '';
            const agora = new Date().toISOString();

            const upserts = [];
            const deletarIds = [];

            linhas.forEach(tr => {
                const estoque = this.getValorInt(tr, 'estoque');
                const valores = DIAS_SEMANA.reduce((acc, dia) => {
                    acc[dia.field] = this.getValorInt(tr, dia.field);
                    return acc;
                }, {});
                const transferir = tr.querySelector('.select-transferir')?.value || '';
                const existingId = tr.dataset.existingId;
                const totalDias = Object.values(valores).reduce((a, b) => a + b, 0);
                const vazio = estoque === 0 && totalDias === 0 && !transferir;

                if (vazio) {
                    if (existingId) deletarIds.push(existingId);
                    return;
                }

                upserts.push({
                    filial,
                    semana,
                    data_contagem: dataContagem,
                    produto_id: tr.dataset.produtoId,
                    estoque,
                    ...valores,
                    transferir: transferir || null,
                    usuario,
                    updated_at: agora
                });
            });

            this.btnSalvar.disabled = true;
            this.btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            try {
                if (upserts.length > 0) {
                    const { error } = await supabaseClient
                        .from('transferencias_camara_fria')
                        .upsert(upserts, { onConflict: 'filial,semana,data_contagem,produto_id' });
                    if (error) throw error;
                }

                if (deletarIds.length > 0) {
                    const { error } = await supabaseClient
                        .from('transferencias_camara_fria')
                        .delete()
                        .in('id', deletarIds);
                    if (error) throw error;
                }

                // Placa de cada dia (Segunda a Sexta) — em branco salva como null ("Sem Placa").
                const upsertsPlacas = Array.from(this.placaInputs.entries()).map(([dia, input]) => ({
                    filial,
                    semana,
                    data_contagem: dataContagem,
                    dia,
                    placa: formatarPlacaMascaraTransf(input.value) || null,
                    usuario,
                    updated_at: agora
                }));
                const { error: erroPlacas } = await supabaseClient
                    .from('transferencias_camara_fria_placas')
                    .upsert(upsertsPlacas, { onConflict: 'filial,semana,data_contagem,dia' });
                if (erroPlacas) throw erroPlacas;

                registrarAuditoria('ALTERAR', 'Câmara Fria', `Transferencias CDS salvas - Filial: ${filial}, Semana: ${semana}, Data: ${dataContagem}`);
                await this.gerarLista();
                await this.carregarHistorico();
                alert('Lista de transferencias salva com sucesso!');
            } catch (error) {
                console.error('Erro ao salvar transferencias:', error);
                alert('Erro ao salvar: ' + error.message);
            } finally {
                this.btnSalvar.disabled = false;
                this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
            }
        },

        // ── Historico de Listas (agrupa por Filial + Semana + Data da Contagem) ──
        async carregarHistorico() {
            if (!this.historicoBody) return;
            this.historicoBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando historico...</td></tr>';
            try {
                let query = supabaseClient
                    .from('transferencias_camara_fria')
                    .select('filial, semana, data_contagem, transferir, usuario, updated_at')
                    .order('updated_at', { ascending: false })
                    .limit(3000);
                if (this.filialRestrita) query = query.eq('filial', this.filialRestrita);

                const { data, error } = await query;
                if (error) throw error;

                const grupos = new Map();
                (data || []).forEach(item => {
                    const chave = `${item.filial}::${item.semana}::${item.data_contagem}`;
                    if (!grupos.has(chave)) {
                        grupos.set(chave, {
                            filial: item.filial,
                            semana: item.semana,
                            dataContagem: item.data_contagem,
                            produtos: 0,
                            marcados: 0,
                            usuario: item.usuario || '',
                            updatedAt: item.updated_at
                        });
                    }
                    const grupo = grupos.get(chave);
                    grupo.produtos += 1;
                    if (item.transferir === 'VENDA FECHADA') grupo.marcados += 1;
                    if (item.updated_at > grupo.updatedAt) {
                        grupo.updatedAt = item.updated_at;
                        grupo.usuario = item.usuario || grupo.usuario;
                    }
                });

                const listas = Array.from(grupos.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
                this.renderHistoricoTabela(listas);
            } catch (error) {
                console.error('Erro ao carregar historico de transferencias:', error);
                this.historicoBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Erro ao carregar historico.</td></tr>';
            }
        },

        renderHistoricoTabela(listas) {
            if (this.historicoCount) this.historicoCount.textContent = `${listas.length} lista${listas.length === 1 ? '' : 's'}`;

            if (listas.length === 0) {
                this.historicoBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhuma lista salva ainda.</td></tr>';
                return;
            }

            this.historicoBody.innerHTML = listas.map(item => `
                <tr>
                    <td>${this.escapeHtml(item.filial)}</td>
                    <td>${this.escapeHtml(this.formatSemanaDisplay(item.semana))}</td>
                    <td>${this.escapeHtml(this.formatDateBR(item.dataContagem))}</td>
                    <td style="text-align:center">${item.produtos}</td>
                    <td style="text-align:center">${item.marcados}</td>
                    <td>${this.formatDateTime(item.updatedAt)}</td>
                    <td>${this.escapeHtml(item.usuario || '-')}</td>
                    <td class="actions-cell">
                        <button class="btn-icon view" data-acao="visualizar" data-filial="${this.escapeHtml(item.filial)}" data-semana="${this.escapeHtml(item.semana)}" data-data-contagem="${item.dataContagem}" title="Visualizar"><i class="fas fa-eye"></i></button>
                        <button class="btn-icon edit" data-acao="editar" data-filial="${this.escapeHtml(item.filial)}" data-semana="${this.escapeHtml(item.semana)}" data-data-contagem="${item.dataContagem}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="btn-icon delete" data-acao="excluir" data-filial="${this.escapeHtml(item.filial)}" data-semana="${this.escapeHtml(item.semana)}" data-data-contagem="${item.dataContagem}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        },

        async abrirListaDoHistorico(item, somenteLeitura) {
            if (this.filialSelect.disabled && this.filialSelect.value !== item.filial) {
                alert('Esta lista pertence a outra filial, fora do seu acesso.');
                return;
            }
            this.filialSelect.value = item.filial;
            this.semanaInput.value = item.semana;
            this.dataContagemInput.value = item.dataContagem;
            this.somenteLeitura = somenteLeitura;
            await this.gerarLista();
            document.querySelector('.transf-table-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },

        async excluirLista(item) {
            const confirmar = confirm(
                `Excluir a lista de Transferencias CDS?\n\nFilial: ${item.filial}\nSemana: ${this.formatSemanaDisplay(item.semana)}\nData da Contagem: ${this.formatDateBR(item.dataContagem)}\n\nTodos os produtos desta lista serao removidos.`
            );
            if (!confirmar) return;

            try {
                const { error } = await supabaseClient
                    .from('transferencias_camara_fria')
                    .delete()
                    .eq('filial', item.filial)
                    .eq('semana', item.semana)
                    .eq('data_contagem', item.dataContagem);
                if (error) throw error;

                registrarAuditoria('EXCLUIR', 'Câmara Fria', `Transferencias CDS excluida - Filial: ${item.filial}, Semana: ${item.semana}, Data: ${item.dataContagem}`);

                if (this.filialSelect.value === item.filial && this.semanaInput.value === item.semana && this.dataContagemInput.value === item.dataContagem) {
                    this.somenteLeitura = false;
                    this.renderTabelaInicial();
                }

                await this.carregarHistorico();
                alert('Lista excluida com sucesso.');
            } catch (error) {
                console.error('Erro ao excluir lista de transferencias:', error);
                alert('Erro ao excluir: ' + error.message);
            }
        },

        formatDateTime(value) {
            if (!value) return '-';
            return new Date(value).toLocaleString('pt-BR');
        },

        getLinhasExportacao() {
            return this.getLinhasProduto().map(tr => ({
                tipo: tr.dataset.tipo,
                codigo: tr.querySelector('td:nth-child(1)')?.textContent || '-',
                produto: tr.querySelector('td:nth-child(2)')?.textContent || '-',
                estoque: this.getValorInt(tr, 'estoque'),
                segunda: this.getValorInt(tr, 'segunda'),
                terca: this.getValorInt(tr, 'terca'),
                quarta: this.getValorInt(tr, 'quarta'),
                quinta: this.getValorInt(tr, 'quinta'),
                sexta: this.getValorInt(tr, 'sexta'),
                total: parseInt(tr.querySelector('[data-total]')?.textContent, 10) || 0,
                saldo: parseInt(tr.querySelector('[data-saldo]')?.textContent, 10) || 0,
                transferir: tr.querySelector('.select-transferir')?.value || ''
            }));
        },

        getContexto() {
            return {
                filial: this.filialSelect.value || '-',
                semana: this.formatSemanaDisplay(this.semanaInput.value),
                data: this.formatDateBR(this.dataContagemInput.value)
            };
        },

        async exportarPDF() {
            const linhas = this.getLinhasExportacao();
            if (linhas.length === 0) return alert('Gere a lista antes de exportar o PDF.');
            if (!window.jspdf?.jsPDF) return alert('Biblioteca jsPDF nao carregada.');

            const contexto = this.getContexto();
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const logo = await this.getLogoBase64PDF();
            if (logo) doc.addImage(logo, 'JPEG', 12, 8, 42, 14);

            doc.setFontSize(15);
            doc.setTextColor(0, 105, 55);
            doc.text('TRANSFERENCIAS CDS - CAMARA FRIA', 60, 15);
            doc.setFontSize(9);
            doc.setTextColor(40);
            doc.text(`Filial: ${contexto.filial} | Semana: ${contexto.semana} | Data da Contagem: ${contexto.data}`, 60, 22);

            doc.autoTable({
                head: [['Tipo', 'Codigo', 'Produto', 'Estoque', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Total', 'Saldo', 'Transferir']],
                body: linhas.map(item => [
                    item.tipo, item.codigo, item.produto,
                    String(item.estoque), String(item.segunda), String(item.terca), String(item.quarta), String(item.quinta), String(item.sexta),
                    String(item.total), String(item.saldo), item.transferir || '-'
                ]),
                startY: 30,
                theme: 'grid',
                headStyles: { fillColor: [0, 105, 55], textColor: [255, 255, 255], halign: 'center', fontSize: 8 },
                bodyStyles: { fillColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: [238, 248, 241] },
                styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
                columnStyles: { 2: { halign: 'left', cellWidth: 55 } }
            });

            doc.save(this.getNomeArquivoExportacao('pdf'));
        },

        exportarXLSX() {
            const linhas = this.getLinhasExportacao();
            if (linhas.length === 0) return alert('Gere a lista antes de exportar o Excel.');
            if (!window.XLSX) return alert('Biblioteca XLSX nao carregada.');

            const contexto = this.getContexto();
            const dados = [
                ['TRANSFERENCIAS CDS - CAMARA FRIA'],
                [`Filial: ${contexto.filial}`, `Semana: ${contexto.semana}`, `Data da Contagem: ${contexto.data}`],
                [],
                ['Tipo', 'Codigo', 'Produto', 'Estoque', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Total', 'Saldo', 'Transferir'],
                ...linhas.map(item => [
                    item.tipo, item.codigo, item.produto,
                    item.estoque, item.segunda, item.terca, item.quarta, item.quinta, item.sexta,
                    item.total, item.saldo, item.transferir || ''
                ])
            ];

            const ws = window.XLSX.utils.aoa_to_sheet(dados);
            ws['!cols'] = [
                { wch: 16 }, { wch: 12 }, { wch: 36 }, { wch: 10 },
                { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
                { wch: 10 }, { wch: 10 }, { wch: 16 }
            ];
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, 'Transferencias');
            window.XLSX.writeFile(wb, this.getNomeArquivoExportacao('xlsx'));
        },

        getNomeArquivoExportacao(extensao) {
            const filial = this.filialSelect.value || 'FILIAL';
            const semana = this.semanaInput.value || 'SEMANA';
            const data = this.dataContagemInput.value || 'DATA';
            return `Transferencias_CDS_Camara_Fria_${filial}_${semana}_${data}.${extensao}`.replace(/[^a-z0-9_.-]+/gi, '_');
        },

        getLogoBase64PDF() {
            return new Promise(resolve => {
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

        getUsuarioLogado() {
            try {
                return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            } catch {
                return null;
            }
        },

        formatSemanaDisplay(value) {
            const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
            return match ? `${match[2]}-${match[1]}` : (value || '-');
        },

        formatDateBR(value) {
            if (!value) return '-';
            const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
        },

        normalizarTipo(tipo) {
            return String(tipo || '').trim().toUpperCase();
        },

        normalizarTexto(value) {
            return String(value || '')
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .toLowerCase()
                .trim();
        },

        escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }
    };

    TransferenciasCamaraFriaUI.init();
});
