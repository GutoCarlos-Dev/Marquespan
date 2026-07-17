import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const TIPO_ORDER = ['TRADICIONAL', 'EXTRA', 'PREMIUM', 'KITS', 'SALGADOS', 'RECHEIOS', 'CONFEITARIA', 'BOLO BISNAGA'];
const DIAS_SEMANA = [
    { field: 'segunda', label: 'Segunda' },
    { field: 'terca', label: 'Terca' },
    { field: 'quarta', label: 'Quarta' },
    { field: 'quinta', label: 'Quinta' },
    { field: 'sexta', label: 'Sexta' }
];

// Ordem das celulas editaveis de cada linha, usada na navegacao por setas e na colagem em bloco
const CAMPOS_NAV = ['estoque', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'transferir'];

document.addEventListener('DOMContentLoaded', () => {
    const TransferenciasCamaraFriaUI = {
        filialRestrita: '',
        acessoGlobal: true,
        produtosCache: [],
        existentesCache: new Map(),
        sortField: null,
        sortDir: 'asc',

        init() {
            this.cache();
            this.bind();
            this.aplicarRestricaoFilial();
            this.definirSemanaAtual();
            this.definirDataContagemAtual();
            this.loadFiliais();
            this.renderTabelaInicial();
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
            document.querySelector('.transf-table thead')?.addEventListener('click', (event) => {
                const btn = event.target.closest('.estoque-sort-btn');
                if (btn) this.ordenarPorColuna(btn.dataset.sort);
            });
            [this.filialSelect, this.semanaInput, this.dataContagemInput].forEach(el => {
                el.addEventListener('change', () => this.renderTabelaInicial());
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

                const [produtosResult, existentesResult] = await Promise.all([
                    supabaseClient
                        .from('produtos_camara_fria')
                        .select('id, codigo, nome, tipo, filial')
                        .eq('ativo', true)
                        .or(`filial.eq.${filial},filial.is.null`)
                        .order('nome'),
                    supabaseClient
                        .from('transferencias_camara_fria')
                        .select('id, produto_id, estoque, segunda, terca, quarta, quinta, sexta, transferir')
                        .eq('filial', filial)
                        .eq('semana', semana)
                        .eq('data_contagem', dataContagem)
                ]);

                if (produtosResult.error) throw produtosResult.error;
                if (existentesResult.error) throw existentesResult.error;

                this.produtosCache = produtosResult.data || [];
                this.existentesCache = new Map((existentesResult.data || []).map(item => [String(item.produto_id), item]));
                this.renderTabela();
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

            const ordenados = [];
            TIPO_ORDER.forEach(tipo => {
                if (grupos.has(tipo)) {
                    ordenados.push([tipo, grupos.get(tipo)]);
                    grupos.delete(tipo);
                }
            });
            Array.from(grupos.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(tipo => {
                ordenados.push([tipo, grupos.get(tipo)]);
            });
            return ordenados;
        },

        renderTabela() {
            if (this.recordsCount) {
                this.recordsCount.textContent = `${this.produtosCache.length} produto${this.produtosCache.length === 1 ? '' : 's'}`;
            }

            if (this.produtosCache.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Nenhum produto cadastrado para esta filial.</td></tr>';
                this.atualizarKpis();
                return;
            }

            const grupos = this.agruparPorTipo(this.produtosCache);
            let html = '';

            grupos.forEach(([tipo, produtos]) => {
                html += `<tr class="transf-tipo-row" data-tipo-header="${this.escapeHtml(tipo)}"><td colspan="11">${this.escapeHtml(tipo)}</td></tr>`;
                produtos.forEach(produto => {
                    const existente = this.existentesCache.get(String(produto.id));
                    const nomeBusca = this.normalizarTexto(`${produto.codigo || ''} ${produto.nome} ${tipo}`);
                    const inputsDias = DIAS_SEMANA.map(dia => `
                        <td><input type="number" min="0" step="1" class="input-transf" data-field="${dia.field}" value="${existente?.[dia.field] ?? ''}"></td>
                    `).join('');
                    const marcado = existente?.transferir === 'VENDA FECHADA';

                    html += `
                        <tr data-produto-id="${produto.id}" data-existing-id="${existente?.id || ''}" data-tipo="${this.escapeHtml(tipo)}" data-busca="${this.escapeHtml(nomeBusca)}">
                            <td>${this.escapeHtml(produto.codigo) || '-'}</td>
                            <td>${this.escapeHtml(produto.nome)}</td>
                            <td><input type="number" min="0" step="1" class="input-transf" data-field="estoque" value="${existente?.estoque ?? ''}"></td>
                            ${inputsDias}
                            <td class="transf-total-cell" data-total>0</td>
                            <td class="transf-saldo-cell" data-saldo>0</td>
                            <td>
                                <select class="select-transferir ${marcado ? 'marcado' : ''}" data-field="transferir">
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
            if (this.sortField) this.aplicarOrdenacaoGrupos();
            this.atualizarIconesOrdenacao();
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
        },

        // ── Ordenacao por coluna (dentro de cada grupo de Tipo) ─────────────────
        ordenarPorColuna(campo) {
            if (!campo) return;
            if (this.sortField === campo) {
                this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortField = campo;
                this.sortDir = 'asc';
            }
            this.aplicarOrdenacaoGrupos();
            this.atualizarIconesOrdenacao();
        },

        aplicarOrdenacaoGrupos() {
            const grupos = this.getGruposDom();
            grupos.forEach(({ headerRow, rows }) => {
                const ordenadas = rows.slice().sort((a, b) => {
                    const va = this.getValorOrdenacao(a, this.sortField);
                    const vb = this.getValorOrdenacao(b, this.sortField);
                    const cmp = (typeof va === 'number' && typeof vb === 'number')
                        ? va - vb
                        : String(va).localeCompare(String(vb), 'pt-BR');
                    return this.sortDir === 'asc' ? cmp : -cmp;
                });
                let anchor = headerRow;
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
                    atual = { headerRow: tr, rows: [] };
                    grupos.push(atual);
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
            document.querySelectorAll('.transf-table .estoque-sort-btn').forEach(btn => {
                const icon = btn.querySelector('i');
                const ativo = btn.dataset.sort === this.sortField;
                btn.classList.toggle('active', ativo);
                if (!icon) return;
                icon.className = ativo ? `fas fa-sort-${this.sortDir === 'asc' ? 'up' : 'down'}` : 'fas fa-sort';
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

                registrarAuditoria('ALTERAR', 'Câmara Fria', `Transferencias CDS salvas - Filial: ${filial}, Semana: ${semana}, Data: ${dataContagem}`);
                await this.gerarLista();
                alert('Lista de transferencias salva com sucesso!');
            } catch (error) {
                console.error('Erro ao salvar transferencias:', error);
                alert('Erro ao salvar: ' + error.message);
            } finally {
                this.btnSalvar.disabled = false;
                this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
            }
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
