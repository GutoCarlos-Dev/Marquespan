import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const RELATORIO_ABASTECIMENTO_STATE_KEY = 'relatorio_abastecimento_estado_edicao';
    const NIVEIS_SOMENTE_ABASTECIMENTO_EXTERNO = ['pr_encarregado', 'pr_lider'];

    const RelatorioUI = {
        dadosRelatorio: [],
        dadosResumoSemanal: null,
        modoVisualizacao: 'detalhado', // 'detalhado' | 'consolidado' | 'resumoPlaca'
        sortConfig: {
            column: null,
            direction: 'asc'
        },
        sortConfigConsolidado: {
            column: 'valorTotal',
            direction: 'desc'
        },
        sortConfigResumoPlaca: {
            column: 'valorTotal',
            direction: 'desc'
        },
        colunasConsolidado: [
            { key: 'placa', label: 'Placa', align: 'left' },
            { key: 'tipoVeiculo', label: 'Tipo de Veículo', align: 'left' },
            { key: 'tanquePosto', label: 'Tanque/Posto', align: 'left' },
            { key: 'qtd', label: 'Qtd. Abastecimentos', align: 'center' },
            { key: 'litros', label: 'Litros', align: 'right' },
            { key: 'valorTotal', label: 'Valor Total', align: 'right' }
        ],
        colunasResumoPlaca: [
            { key: 'placa', label: 'Placa', align: 'left' },
            { key: 'qtdPostos', label: 'Qtd. Postos/Tanques', align: 'center' },
            { key: 'qtdAbastecimentos', label: 'Qtd. Abastecimentos', align: 'center' },
            { key: 'litros', label: 'Litros', align: 'right' },
            { key: 'kmRodado', label: 'KM Rodados', align: 'right' },
            { key: 'mediaConsumo', label: 'Média Consumo (KM/L)', align: 'right' },
            { key: 'valorTotal', label: 'Valor Total', align: 'right' }
        ],
        charts: {
            mediaConsumo: null,
            evolucaoConsumo: null,
            topVeiculos: null,
            tiposMovimentacao: null,
            consolidadoVeiculoLitros: null,
            consolidadoVeiculoValor: null,
            consolidadoTanquePostoLitros: null,
            consolidadoTanquePostoValor: null,
            consolidadoTipoVeiculo: null,
            resumoPlacaLitros: null,
            resumoPlacaValor: null,
            resumoPlacaQtdAbastecimentos: null,
            resumoPlacaQtdPostos: null
        },
        rolagemConsolidadoIniciada: false,
        rolagemResumoPlacaIniciada: false,

        async init() {
            this.cache();
            this.bind();
            this.iniciarRolagemAutomatica();
            await this.loadFiliais();
            this.aplicarRestricaoResumoDiesel();
            this.updateFilterOptions();
            this.aplicarRestricaoFiltroMovimentacao();
            this.updateTipoVeiculoFilterOptions();
            
            // Define datas padrão (início do mês até hoje)
            const hoje = new Date();
            const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            this.dataInicial.valueAsDate = primeiroDia;
            this.dataFinal.valueAsDate = hoje;
            this.semanaResumoDiesel.value = this.getISOWeekValue(hoje);

            await Promise.all([
                this.loadTanques(),
                this.loadBicos(),
                this.loadVeiculos(),
                this.loadRotas(),
                this.loadPostos(),
                this.loadTiposVeiculo()
            ]);

            await this.restaurarEstadoAposEdicao();
        },

        cache() {
            this.form = document.getElementById('formFiltroAbastecimento');
            this.dataInicial = document.getElementById('dataInicial');
            this.dataFinal = document.getElementById('dataFinal');
            this.filtroTanque = document.getElementById('filtroTanque');
            this.filtroFilial = document.getElementById('filtroFilial');
            this.filtroTipo = document.getElementById('filtroTipoMovimentacao');
            this.filtroTipoVeiculoDisplay = null;
            this.filtroBicoDisplay = null; // Novo elemento
            this.filtroBicoOptions = null; // Novo elemento
            this.filtroBicoText = null; // Novo elemento
            this.filtroTipoVeiculoOptions = null;
            this.filtroTipoVeiculoText = null;
            this.filtroTipoVeiculo = document.getElementById('filtroTipoVeiculo');
            this.filtroVeiculo = document.getElementById('filtroVeiculo');
            this.filtroRota = document.getElementById('filtroRota');
            this.filtroPosto = document.getElementById('filtroPosto');
            this.postosFiltroCache = [];
            this.filiaisCache = [];
            this.btnLimpar = document.getElementById('btnLimparFiltros');
            
            this.cardResultados = document.getElementById('cardResultados');
            this.dashboardAbastecimento = document.getElementById('dashboardAbastecimento');
            this.dashboardConsolidadoAbastecimento = document.getElementById('dashboardConsolidadoAbastecimento');
            this.dashboardResumoPlacaAbastecimento = document.getElementById('dashboardResumoPlacaAbastecimento');
            this.tableBody = document.getElementById('tableBodyRelatorio');
            this.totalLitrosEl = document.getElementById('totalLitros');
            this.totalLancamentosEl = document.getElementById('totalLancamentos');
            this.totalValorEl = document.getElementById('totalValor');
            
            this.btnExportarXLS = document.getElementById('btnExportarXLS');
            this.btnExportarPDF = document.getElementById('btnExportarPDF');
            this.btnFullscreenGrid = document.getElementById('btnFullscreenGrid');
            this.filtroFilialResumoDiesel = document.getElementById('filtroFilialResumoDiesel');
            this.semanaResumoDiesel = document.getElementById('semanaResumoDiesel');
            this.btnGerarResumoDiesel = document.getElementById('btnGerarResumoDiesel');
            this.btnExportarResumoDieselPDF = document.getElementById('btnExportarResumoDieselPDF');
            this.resumoDieselResultado = document.getElementById('resumoDieselResultado');
            this.resumoDieselPanel = document.getElementById('resumoDieselPanel');
            this.resumoDieselTitulo = document.getElementById('resumoDieselTitulo');
            this.resumoDieselPeriodo = document.getElementById('resumoDieselPeriodo');
            this.theadResumoDiesel = document.getElementById('theadResumoDiesel');
            this.tbodyResumoDiesel = document.getElementById('tbodyResumoDiesel');
            this.modalLancamento = document.getElementById('modalVisualizarLancamento');
            this.detalhesLancamentoGrid = document.getElementById('detalhesLancamentoGrid');
            this.btnFecharModalLancamento = document.getElementById('btnFecharModalLancamento');
            this.btnCancelarModalLancamento = document.getElementById('btnCancelarModalLancamento');
            this.btnEditarLancamentoModal = document.getElementById('btnEditarLancamentoModal');
            this.lancamentoModalAtual = null;

            // Canvas do Dashboard
            this.chartMediaConsumoCanvas = document.getElementById('chartMediaConsumo');
            this.chartEvolucaoConsumoCanvas = document.getElementById('chartEvolucaoConsumo');
            this.chartTopVeiculosCanvas = document.getElementById('chartTopVeiculos');
            this.chartTiposMovimentacaoCanvas = document.getElementById('chartTiposMovimentacao');
        },

        bind() {
            this.form.addEventListener('submit', this.handleSearch.bind(this));
            this.btnLimpar.addEventListener('click', this.clearFilters.bind(this));
            this.btnExportarXLS.addEventListener('click', this.exportXLS.bind(this));
            this.btnExportarPDF.addEventListener('click', this.exportPDF.bind(this));
            this.btnFullscreenGrid?.addEventListener('click', this.toggleFullscreenGrid.bind(this));
            this.btnGerarResumoDiesel?.addEventListener('click', this.gerarResumoSemanalDiesel.bind(this));
            this.btnExportarResumoDieselPDF?.addEventListener('click', this.exportarResumoSemanalPDF.bind(this));

            document.getElementById('btnModoDetalhadoAbastecimento')?.addEventListener('click', () => this.alternarModoVisualizacao('detalhado'));
            document.getElementById('btnModoConsolidadoAbastecimento')?.addEventListener('click', () => this.alternarModoVisualizacao('consolidado'));
            document.getElementById('btnModoResumoPlacaAbastecimento')?.addEventListener('click', () => this.alternarModoVisualizacao('resumoPlaca'));
            this.filtroFilial?.addEventListener('change', async () => {
                await Promise.all([
                    this.loadTanques(),
                    this.loadBicos(),
                    this.loadPostos(),
                    this.loadVeiculos(),
                    this.loadRotas(),
                    this.loadTiposVeiculo()
                ]);
            });
            document.addEventListener('fullscreenchange', this.handleFullscreenChange.bind(this));
            document.addEventListener('keydown', this.handleFullscreenKeydown.bind(this));

            this.tableBody.addEventListener('click', (e) => {
                const btnVisualizar = e.target.closest('.btn-visualizar-lancamento');
                if (btnVisualizar) {
                    this.visualizarLancamento(btnVisualizar.dataset.id, btnVisualizar.dataset.tipo);
                    return;
                }

                const btn = e.target.closest('.btn-editar-lancamento');
                if (!btn) return;
                this.editarLancamento(btn.dataset.tipo, btn.dataset.id);
            });

            this.btnFecharModalLancamento?.addEventListener('click', () => this.fecharModalLancamento());
            this.btnCancelarModalLancamento?.addEventListener('click', () => this.fecharModalLancamento());
            this.modalLancamento?.addEventListener('click', (e) => {
                if (e.target === this.modalLancamento) this.fecharModalLancamento();
            });
            this.btnEditarLancamentoModal?.addEventListener('click', () => {
                if (!this.lancamentoModalAtual) return;
                this.editarLancamento(this.lancamentoModalAtual.tipo, this.lancamentoModalAtual.id);
            });
            
            // Eventos de ordenação nos cabeçalhos
            document.querySelectorAll('th[data-sort]').forEach(th => {
                th.addEventListener('click', () => {
                    this.handleSort(th.dataset.sort);
                });
            });
        },

        isGridFullscreen() {
            return document.fullscreenElement === this.cardResultados
                || this.cardResultados?.classList.contains('relatorio-fullscreen-fallback');
        },

        async toggleFullscreenGrid() {
            if (!this.cardResultados || this.cardResultados.classList.contains('hidden')) return;

            if (this.isGridFullscreen()) {
                await this.exitFullscreenGrid();
                return;
            }

            try {
                if (this.cardResultados.requestFullscreen) {
                    await this.cardResultados.requestFullscreen();
                } else {
                    this.cardResultados.classList.add('relatorio-fullscreen-fallback');
                    document.body.classList.add('relatorio-fullscreen-lock');
                }
            } catch (error) {
                console.warn('Fullscreen API indisponivel, usando fallback:', error);
                this.cardResultados.classList.add('relatorio-fullscreen-fallback');
                document.body.classList.add('relatorio-fullscreen-lock');
            }

            this.updateFullscreenButton();
        },

        async exitFullscreenGrid() {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            }
            this.cardResultados?.classList.remove('relatorio-fullscreen-fallback');
            document.body.classList.remove('relatorio-fullscreen-lock');
            this.updateFullscreenButton();
        },

        handleFullscreenChange() {
            if (document.fullscreenElement !== this.cardResultados) {
                this.cardResultados?.classList.remove('relatorio-fullscreen-fallback');
                document.body.classList.remove('relatorio-fullscreen-lock');
            }
            this.updateFullscreenButton();
        },

        handleFullscreenKeydown(e) {
            if (e.key === 'Escape' && this.cardResultados?.classList.contains('relatorio-fullscreen-fallback')) {
                this.exitFullscreenGrid();
            }
        },

        updateFullscreenButton() {
            if (!this.btnFullscreenGrid) return;
            const fullscreen = this.isGridFullscreen();
            this.btnFullscreenGrid.classList.toggle('btn-fullscreen-active', fullscreen);
            this.btnFullscreenGrid.innerHTML = fullscreen
                ? '<i class="fas fa-compress"></i> Sair FullScreen'
                : '<i class="fas fa-expand"></i> FullScreen';
        },

        getISOWeekValue(date) {
            const base = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dia = base.getUTCDay() || 7;
            base.setUTCDate(base.getUTCDate() + 4 - dia);
            const ano = base.getUTCFullYear();
            const inicioAno = new Date(Date.UTC(ano, 0, 1));
            const semana = Math.ceil((((base - inicioAno) / 86400000) + 1) / 7);
            return `${ano}-W${String(semana).padStart(2, '0')}`;
        },

        getPeriodoSemanaOperacional(semanaAno) {
            const [anoTexto, semanaTexto] = String(semanaAno || '').split('-W');
            const ano = Number(anoTexto);
            const semana = Number(semanaTexto);
            if (!ano || !semana) return null;

            const quatroJaneiro = new Date(Date.UTC(ano, 0, 4));
            const diaSemana = quatroJaneiro.getUTCDay() || 7;
            const segunda = new Date(quatroJaneiro);
            segunda.setUTCDate(quatroJaneiro.getUTCDate() - diaSemana + 1 + ((semana - 1) * 7));

            const inicio = new Date(segunda);
            inicio.setUTCDate(segunda.getUTCDate() - 1);
            const fim = new Date(inicio);
            fim.setUTCDate(inicio.getUTCDate() + 6);

            return {
                inicio,
                fim,
                inicioIso: inicio.toISOString().slice(0, 10),
                fimIso: fim.toISOString().slice(0, 10),
                numero: semana,
                ano
            };
        },

        getFilialUsuario() {
            try {
                return JSON.parse(localStorage.getItem('usuarioLogado'))?.filial || '';
            } catch {
                return '';
            }
        },

        getUserLevel() {
            try {
                return String(JSON.parse(localStorage.getItem('usuarioLogado'))?.nivel || '').toLowerCase();
            } catch {
                return '';
            }
        },

        usuarioSomenteAbastecimentoExterno() {
            return NIVEIS_SOMENTE_ABASTECIMENTO_EXTERNO.includes(this.getUserLevel());
        },

        getFilialSelecionada() {
            return this.filtroFilial?.value || this.getFilialUsuario();
        },

        getFilialResumoDieselSelecionada() {
            return this.filtroFilialResumoDiesel?.value || this.getFilialUsuario();
        },

        getValoresFilialSelecionada() {
            const filial = this.getFilialSelecionada();
            if (!filial) return [];

            const filialNormalizada = String(filial).trim().toUpperCase();
            const valores = new Set([filial]);
            (this.filiaisCache || []).forEach(f => {
                const nome = String(f.nome || '').trim();
                const sigla = String(f.sigla || '').trim();
                if (
                    nome.toUpperCase() === filialNormalizada
                    || sigla.toUpperCase() === filialNormalizada
                    || String(sigla || nome).trim().toUpperCase() === filialNormalizada
                ) {
                    if (nome) valores.add(nome);
                    if (sigla) valores.add(sigla);
                }
            });

            return Array.from(valores);
        },

        registroPertenceFilial(valorFilial) {
            const valores = this.getValoresFilialSelecionada().map(valor => String(valor).trim().toUpperCase());
            return valores.length === 0 || valores.includes(String(valorFilial || '').trim().toUpperCase());
        },

        getFilialUsuarioSelecionavel() {
            const filialUsuario = this.getFilialUsuario();
            if (!filialUsuario) return '';

            const filialNormalizada = String(filialUsuario).trim().toUpperCase();
            const matchingFilial = (this.filiaisCache || []).find(f => {
                const nome = String(f.nome || '').trim().toUpperCase();
                const sigla = String(f.sigla || '').trim().toUpperCase();
                const valor = String(f.sigla || f.nome || '').trim().toUpperCase();
                return nome === filialNormalizada || sigla === filialNormalizada || valor === filialNormalizada;
            });

            return matchingFilial ? (matchingFilial.sigla || matchingFilial.nome || filialUsuario) : filialUsuario;
        },

        aplicarBloqueioFiltroFilial() {
            if (!this.filtroFilial) return;

            const filialUsuario = this.getFilialUsuario();
            if (!filialUsuario) {
                this.filtroFilial.disabled = false;
                if (this.filtroFilialResumoDiesel) this.filtroFilialResumoDiesel.disabled = false;
                return;
            }

            const valorFilial = this.getFilialUsuarioSelecionavel();
            if (valorFilial && !Array.from(this.filtroFilial.options).some(option => option.value === valorFilial)) {
                this.filtroFilial.add(new Option(valorFilial, valorFilial));
            }

            this.filtroFilial.value = valorFilial;
            this.filtroFilial.disabled = true;
            this.filtroFilial.title = 'Filial definida pelo usuario logado.';

            if (this.filtroFilialResumoDiesel) {
                if (valorFilial && !Array.from(this.filtroFilialResumoDiesel.options).some(option => option.value === valorFilial)) {
                    this.filtroFilialResumoDiesel.add(new Option(valorFilial, valorFilial));
                }
                this.filtroFilialResumoDiesel.value = valorFilial;
                this.filtroFilialResumoDiesel.disabled = true;
                this.filtroFilialResumoDiesel.title = 'Filial definida pelo usuario logado.';
            }
        },

        aplicarRestricaoResumoDiesel() {
            if (!this.resumoDieselPanel) return;
            this.resumoDieselPanel.classList.toggle('hidden', this.usuarioSomenteAbastecimentoExterno());
        },

        normalizarChaveTexto(value) {
            return String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .toUpperCase();
        },

        formatarLitrosResumo(value) {
            return Number(value || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            });
        },

        async gerarResumoSemanalDiesel() {
            const periodo = this.getPeriodoSemanaOperacional(this.semanaResumoDiesel?.value);
            if (!periodo) {
                alert('Selecione uma semana válida.');
                return;
            }

            const btn = this.btnGerarResumoDiesel;
            const textoOriginal = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

            try {
                let queryTanques = supabaseClient
                    .from('tanques')
                    .select('id, nome, tipo_combustivel, filial')
                    .order('nome');

                const filial = this.getFilialResumoDieselSelecionada();
                if (filial) queryTanques = queryTanques.eq('filial', filial);

                const { data: tanquesData, error: tanquesError } = await queryTanques;
                if (tanquesError) throw tanquesError;

                const tanques = (tanquesData || []).filter(tanque =>
                    this.normalizarChaveTexto(tanque.tipo_combustivel).includes('DIESEL')
                );
                const tanqueIds = tanques.map(tanque => tanque.id);
                if (tanqueIds.length === 0) {
                    throw new Error('Nenhum tanque Diesel encontrado para a filial.');
                }

                const [entradasResult, saidasResult] = await Promise.all([
                    supabaseClient
                        .from('abastecimentos')
                        .select('tanque_id, qtd_litros, data, numero_nota')
                        .in('tanque_id', tanqueIds)
                        .neq('numero_nota', 'AJUSTE DE ESTOQUE')
                        .gte('data', `${periodo.inicioIso}T00:00:00-03:00`)
                        .lte('data', `${periodo.fimIso}T23:59:59-03:00`),
                    supabaseClient
                        .from('saidas_combustivel')
                        .select('qtd_litros, data_hora, bicos!inner(bombas!inner(tanque_id))')
                        .gte('data_hora', `${periodo.inicioIso}T00:00:00-03:00`)
                        .lte('data_hora', `${periodo.fimIso}T23:59:59-03:00`)
                ]);

                if (entradasResult.error) throw entradasResult.error;
                if (saidasResult.error) throw saidasResult.error;

                const tanqueIdSet = new Set(tanqueIds.map(String));
                const movimentos = new Map();
                const chave = (dataIso, tanqueId) => `${String(dataIso).slice(0, 10)}|${tanqueId}`;
                const obter = (dataIso, tanqueId) => {
                    const movimentoChave = chave(dataIso, tanqueId);
                    if (!movimentos.has(movimentoChave)) {
                        movimentos.set(movimentoChave, { consumido: 0, compra: 0 });
                    }
                    return movimentos.get(movimentoChave);
                };

                (entradasResult.data || []).forEach(entrada => {
                    obter(entrada.data, entrada.tanque_id).compra += Number(entrada.qtd_litros || 0);
                });

                (saidasResult.data || []).forEach(saida => {
                    const tanqueId = saida.bicos?.bombas?.tanque_id;
                    if (!tanqueIdSet.has(String(tanqueId))) return;
                    obter(saida.data_hora, tanqueId).consumido += Number(saida.qtd_litros || 0);
                });

                const nomesDias = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
                const dias = Array.from({ length: 7 }, (_, index) => {
                    const data = new Date(periodo.inicio);
                    data.setUTCDate(periodo.inicio.getUTCDate() + index);
                    const dataIso = data.toISOString().slice(0, 10);
                    return {
                        dataIso,
                        dia: data.getUTCDate(),
                        nome: nomesDias[index],
                        porTanque: tanques.map(tanque => ({
                            tanqueId: tanque.id,
                            ...(movimentos.get(chave(dataIso, tanque.id)) || { consumido: 0, compra: 0 })
                        }))
                    };
                });

                this.dadosResumoSemanal = { periodo, filial, tanques, dias };
                this.renderizarResumoSemanalDiesel();
                this.btnExportarResumoDieselPDF.disabled = false;
            } catch (error) {
                console.error('Erro ao gerar resumo semanal Diesel:', error);
                alert(`Erro ao gerar resumo semanal: ${error.message || 'verifique o console.'}`);
            } finally {
                btn.disabled = false;
                btn.innerHTML = textoOriginal;
            }
        },

        renderizarResumoSemanalDiesel() {
            const resumo = this.dadosResumoSemanal;
            if (!resumo) return;

            this.resumoDieselTitulo.textContent = `RESUMO DIESEL INTERNO${resumo.filial ? ` - ${resumo.filial}` : ''}`;
            this.resumoDieselPeriodo.textContent = `SEMANA ${resumo.periodo.numero} | ${resumo.periodo.inicio.toLocaleDateString('pt-BR', { timeZone: 'UTC' })} a ${resumo.periodo.fim.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`;
            this.theadResumoDiesel.innerHTML = `
                <tr>
                    <th rowspan="2">Data</th>
                    <th rowspan="2">Dia</th>
                    ${resumo.tanques.map(tanque => `<th colspan="2">${tanque.nome}</th>`).join('')}
                    <th colspan="2">Total</th>
                </tr>
                <tr>
                    ${resumo.tanques.map(() => '<th>Consumido</th><th>Compra</th>').join('')}
                    <th>Consumido</th>
                    <th>Compra</th>
                </tr>
            `;

            const totaisTanques = resumo.tanques.map(() => ({ consumido: 0, compra: 0 }));
            let totalConsumido = 0;
            let totalCompra = 0;
            const linhas = resumo.dias.map(dia => {
                let consumidoDia = 0;
                let compraDia = 0;
                const colunasTanques = dia.porTanque.map((movimento, index) => {
                    totaisTanques[index].consumido += movimento.consumido;
                    totaisTanques[index].compra += movimento.compra;
                    consumidoDia += movimento.consumido;
                    compraDia += movimento.compra;
                    return `<td>${this.formatarLitrosResumo(movimento.consumido)}</td><td>${this.formatarLitrosResumo(movimento.compra)}</td>`;
                }).join('');
                totalConsumido += consumidoDia;
                totalCompra += compraDia;
                return `<tr><td>${dia.dia}</td><td>${dia.nome}</td>${colunasTanques}<td>${this.formatarLitrosResumo(consumidoDia)}</td><td>${this.formatarLitrosResumo(compraDia)}</td></tr>`;
            });

            linhas.push(`
                <tr class="resumo-total-row">
                    <td colspan="2">TOTAL</td>
                    ${totaisTanques.map(total => `<td>${this.formatarLitrosResumo(total.consumido)}</td><td>${this.formatarLitrosResumo(total.compra)}</td>`).join('')}
                    <td>${this.formatarLitrosResumo(totalConsumido)}</td>
                    <td>${this.formatarLitrosResumo(totalCompra)}</td>
                </tr>
            `);

            this.tbodyResumoDiesel.innerHTML = linhas.join('');
            this.resumoDieselResultado.classList.remove('hidden');
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
                img.onerror = () => {
                    console.warn('Logo não encontrado para o PDF semanal.');
                    resolve(null);
                };
            });
        },

        async exportarResumoSemanalPDF() {
            const resumo = this.dadosResumoSemanal;
            if (!resumo) return alert('Gere o resumo semanal antes de exportar.');

            const btn = this.btnExportarResumoDieselPDF;
            const textoOriginal = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

            try {
                const { jsPDF } = window.jspdf;
                const orientacao = resumo.tanques.length > 3 ? 'landscape' : 'portrait';
                const doc = new jsPDF({ orientation: orientacao, unit: 'mm', format: 'a4' });
                const titulo = `RESUMO DIESEL INTERNO${resumo.filial ? ` - ${resumo.filial}` : ''}`;
                const colunas = ['Data', 'Dia'];
                resumo.tanques.forEach(tanque => colunas.push(`${tanque.nome}\nConsumido`, `${tanque.nome}\nCompra`));
                colunas.push('TOTAL\nConsumido', 'TOTAL\nCompra');

                const totais = resumo.tanques.map(() => ({ consumido: 0, compra: 0 }));
                let totalConsumido = 0;
                let totalCompra = 0;
                const linhas = resumo.dias.map(dia => {
                    const row = [String(dia.dia), dia.nome];
                    let consumidoDia = 0;
                    let compraDia = 0;
                    dia.porTanque.forEach((movimento, index) => {
                        totais[index].consumido += movimento.consumido;
                        totais[index].compra += movimento.compra;
                        consumidoDia += movimento.consumido;
                        compraDia += movimento.compra;
                        row.push(this.formatarLitrosResumo(movimento.consumido), this.formatarLitrosResumo(movimento.compra));
                    });
                    totalConsumido += consumidoDia;
                    totalCompra += compraDia;
                    row.push(this.formatarLitrosResumo(consumidoDia), this.formatarLitrosResumo(compraDia));
                    return row;
                });

                const totalRow = ['', 'TOTAL'];
                totais.forEach(total => totalRow.push(this.formatarLitrosResumo(total.consumido), this.formatarLitrosResumo(total.compra)));
                totalRow.push(this.formatarLitrosResumo(totalConsumido), this.formatarLitrosResumo(totalCompra));
                linhas.push(totalRow);

                const logoBase64 = await this.getLogoBase64PDF();
                if (logoBase64) {
                    doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);
                }

                const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || '{}');
                const nomeUsuario = usuarioLogado?.nome || usuarioLogado?.usuario_login || 'Sistema';
                const pageWidth = doc.internal.pageSize.getWidth();

                doc.setFontSize(16);
                doc.setTextColor(0, 105, 55);
                doc.text(titulo, 14, 28);
                doc.setFontSize(10);
                doc.setTextColor(40);
                doc.text(`Semana ${resumo.periodo.numero}: ${resumo.periodo.inicio.toLocaleDateString('pt-BR', { timeZone: 'UTC' })} a ${resumo.periodo.fim.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`, 14, 34);
                doc.text(`Gerado por: ${nomeUsuario}`, 14, 39);

                doc.autoTable({
                    head: [colunas],
                    body: linhas,
                    startY: 45,
                    theme: 'grid',
                    headStyles: { fillColor: [0, 105, 55], textColor: [255, 255, 255], halign: 'center', fontSize: 7 },
                    styles: { fontSize: 7, halign: 'right', cellPadding: 1.6 },
                    columnStyles: { 0: { halign: 'center' }, 1: { halign: 'left' } },
                    didParseCell: data => {
                        if (data.section === 'body' && data.row.index === linhas.length - 1) {
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fillColor = [220, 239, 208];
                        } else if (data.section === 'body' && data.row.index % 2 === 1) {
                            data.cell.styles.fillColor = [237, 247, 231];
                        }
                    }
                });

                const pageCount = doc.internal.getNumberOfPages();
                for (let pagina = 1; pagina <= pageCount; pagina += 1) {
                    doc.setPage(pagina);
                    const pageHeight = doc.internal.pageSize.getHeight();
                    doc.setFontSize(8);
                    doc.setTextColor(100);
                    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pageHeight - 10);
                    doc.text(`Página ${pagina} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
                }

                doc.save(`Resumo_Diesel_Semana_${resumo.periodo.numero}_${resumo.periodo.ano}.pdf`);
            } catch (error) {
                console.error('Erro ao exportar o resumo semanal em PDF:', error);
                alert(`Erro ao gerar PDF semanal: ${error.message || 'verifique o console.'}`);
            } finally {
                btn.disabled = false;
                btn.innerHTML = textoOriginal;
            }
        },

        async loadFiliais() {
            if (!this.filtroFilial) return;

            try {
                const { data, error } = await supabaseClient
                    .from('filiais')
                    .select('nome, sigla')
                    .order('nome');

                if (error) throw error;

                this.filiaisCache = data || [];
                this.filtroFilial.innerHTML = '<option value="">Todas</option>';
                if (this.filtroFilialResumoDiesel) this.filtroFilialResumoDiesel.innerHTML = '<option value="">Todas</option>';
                this.filiaisCache.forEach(filial => {
                    const valor = filial.sigla || filial.nome;
                    const label = filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome;

                    const option = document.createElement('option');
                    option.value = valor;
                    option.textContent = label;
                    this.filtroFilial.appendChild(option);

                    if (this.filtroFilialResumoDiesel) {
                        const optionResumo = document.createElement('option');
                        optionResumo.value = valor;
                        optionResumo.textContent = label;
                        this.filtroFilialResumoDiesel.appendChild(optionResumo);
                    }
                });

                this.aplicarBloqueioFiltroFilial();
            } catch (error) {
                console.error('Erro ao carregar filiais:', error);
                this.aplicarBloqueioFiltroFilial();
            }
        },

        async loadTanques() {
            try {
                const valoresFilial = this.getValoresFilialSelecionada();
                let query = supabaseClient
                    .from('tanques')
                    .select('id, nome, tipo_combustivel')
                    .order('nome');

                if (valoresFilial.length > 0) query = query.in('filial', valoresFilial);

                const { data, error } = await query;

                if (error) throw error;

                // Limpa opções e adiciona "Todos" como padrão
                this.filtroTanque.innerHTML = '<option value="">Todos</option>';

                data.forEach(tanque => {
                    const option = document.createElement('option');
                    option.value = tanque.id;
                    option.textContent = `${tanque.nome} (${tanque.tipo_combustivel})`;
                    this.filtroTanque.appendChild(option);
                });
            } catch (error) {
                console.error('Erro ao carregar tanques:', error);
            }
        },

        async loadVeiculos() {
            try {
                const valoresFilial = this.getValoresFilialSelecionada();
                let query = supabaseClient
                    .from('veiculos')
                    .select('placa')
                    .order('placa');

                if (valoresFilial.length > 0) query = query.in('filial', valoresFilial);

                const { data, error } = await query;
                if (error) throw error;
    
                const datalist = document.getElementById('listaVeiculosFiltro');
                if (datalist) {
                    datalist.innerHTML = '';
                    data.forEach(v => {
                        const option = document.createElement('option');
                        option.value = v.placa;
                        datalist.appendChild(option);
                    });
                }
            } catch (error) {
                console.error('Erro ao carregar veículos para filtro:', error);
            }
        },

        // Mapa placa -> tipo de veículo (ex: TRUCK, CAMINHÃO 3/4, BITREM...), usado nos modos
        // Consolidado e Resumo Consolidado.
        async fetchTiposVeiculoPorPlaca() {
            const mapa = new Map();
            try {
                const { data, error } = await supabaseClient.from('veiculos').select('placa, tipo');
                if (error) throw error;
                (data || []).forEach(v => {
                    if (v.placa) mapa.set(String(v.placa).trim().toUpperCase(), v.tipo || 'NÃO INFORMADO');
                });
            } catch (error) {
                console.error('Erro ao carregar tipos de veículo:', error);
            }
            return mapa;
        },

        async loadRotas() {
            try {
                const valoresFilial = this.getValoresFilialSelecionada();
                let query = supabaseClient
                    .from('rotas')
                    .select('numero, filial')
                    .order('numero');

                if (valoresFilial.length > 0) query = query.in('filial', valoresFilial);

                const { data, error } = await query;
                if (error) throw error;
    
                const datalist = document.getElementById('listaRotasFiltro');
                if (datalist) {
                    datalist.innerHTML = '';
                    // Ordenação numérica correta
                    data.sort((a, b) => String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true, sensitivity: 'base' }));
                    data.forEach(r => {
                        const option = document.createElement('option');
                        option.value = r.numero;
                        datalist.appendChild(option);
                    });
                }
            } catch (error) {
                console.error('Erro ao carregar rotas para filtro:', error);
            }
        },

        async loadPostos() {
            if (!this.filtroPosto) return;

            try {
                const valoresFilial = this.getValoresFilialSelecionada();
                let query = supabaseClient
                    .from('postos')
                    .select('id, razao_social, cnpj, filial')
                    .order('razao_social');

                if (valoresFilial.length > 0) query = query.in('filial', valoresFilial);

                const { data, error } = await query;

                if (error) throw error;

                this.postosFiltroCache = data || [];
                const datalist = document.getElementById('listaPostosFiltro');
                if (!datalist) return;

                datalist.innerHTML = '';
                (data || []).forEach(posto => {
                    const option = document.createElement('option');
                    option.value = this.formatPostoFiltro(posto);
                    datalist.appendChild(option);
                });
            } catch (error) {
                console.error('Erro ao carregar postos para filtro:', error);
            }
        },

        formatPostoFiltro(posto) {
            return `${posto.razao_social}${posto.cnpj ? ` (${posto.cnpj})` : ''}`;
        },

        getPostoIdFiltro() {
            const valor = this.filtroPosto ? this.filtroPosto.value.trim() : '';
            if (!valor) return '';

            const valorNormalizado = valor.toUpperCase();
            const posto = this.postosFiltroCache.find(p =>
                this.formatPostoFiltro(p).toUpperCase() === valorNormalizado ||
                String(p.razao_social || '').toUpperCase() === valorNormalizado ||
                String(p.cnpj || '').toUpperCase() === valorNormalizado
            );

            return posto ? posto.id : null;
        },

        tipoMovimentacaoPermitido(tiposSelecionados, tipo) {
            return tiposSelecionados.length === 0 || tiposSelecionados.includes(tipo);
        },

        async loadTiposVeiculo() {
            if (!this.filtroTipoVeiculoOptions) return;
            try {
                const valoresFilial = this.getValoresFilialSelecionada();
                let query = supabaseClient
                    .from('veiculos')
                    .select('tipo');

                if (valoresFilial.length > 0) query = query.in('filial', valoresFilial);

                const { data, error } = await query;
                if (error) throw error;

                // Pega valores únicos, remove nulos/vazios e ordena
                const tipos = [...new Set(data.map(v => v.tipo).filter(Boolean))].sort();

                this.filtroTipoVeiculoOptions.innerHTML = '';
                tipos.forEach(tipo => {
                    const label = document.createElement('label');
                    label.style.display = 'block';
                    label.style.padding = '5px';
                    label.style.cursor = 'pointer';
                    label.style.color = '#000';
                    label.innerHTML = `<input type="checkbox" class="tipo-veiculo-checkbox" value="${tipo}" style="margin-right: 8px;"> ${tipo}`;
                    this.filtroTipoVeiculoOptions.appendChild(label);
                });

            } catch (error) {
                console.error('Erro ao carregar tipos de veículo:', error);
                this.filtroTipoVeiculoOptions.innerHTML = '<div>Erro ao carregar</div>';
            }
        },

        async loadBicos() {
            // Verifica se o multiselect já foi criado para evitar recriá-lo
            if (!this.filtroBicoDisplay) {
                this.updateBicoFilterOptions();
            }
            if (!this.filtroBicoOptions) return;

            try {
                let query = supabaseClient
                    .from('bicos')
                    .select('id, nome, bombas(nome, tanques(nome, tipo_combustivel, filial))')
                    .order('nome');

                const { data, error } = await query;

                if (error) throw error;

                this.filtroBicoOptions.innerHTML = '';
                (data || [])
                    .filter(bico => this.registroPertenceFilial(bico.bombas?.tanques?.filial))
                    .forEach(bico => {
                    const tanqueInfo = bico.bombas?.tanques?.nome || 'N/A';
                    const bombaInfo = bico.bombas?.nome || 'N/A';
                    const label = document.createElement('label');
                    label.style.display = 'block';
                    label.style.padding = '5px';
                    label.style.cursor = 'pointer';
                    label.style.color = '#000';
                    label.innerHTML = `<input type="checkbox" class="bico-checkbox" value="${bico.id}" style="margin-right: 8px;"> ${bico.nome} (Bomba: ${bombaInfo} - Tanque: ${tanqueInfo})`;
                    this.filtroBicoOptions.appendChild(label);
                });
            } catch (error) {
                console.error('Erro ao carregar bicos para filtro:', error);
                this.filtroBicoOptions.innerHTML = '<div>Erro ao carregar</div>';
            }
        },

        updateBicoFilterOptions() {
            if (document.getElementById('filtroBicoDisplay')) return;
            const select = document.getElementById('filtroBico'); // O div onde o multiselect será injetado
            if (!select) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'custom-multiselect';
            wrapper.style.position = 'relative';

            const display = document.createElement('div');
            display.id = 'filtroBicoDisplay';
            display.className = 'glass-input multiselect-display';
            display.style.cssText = 'cursor: pointer; display: flex; justify-content: space-between; align-items: center; height: 38px; color: #000;';
            display.innerHTML = '<span id="filtroBicoText">Todos</span> <i class="fas fa-chevron-down"></i>';

            const optionsContainer = document.createElement('div');
            optionsContainer.id = 'filtroBicoOptions';
            optionsContainer.className = 'glass-dropdown hidden';
            optionsContainer.style.cssText = 'position: absolute; z-index: 1000; width: 100%; background-color: #fff; max-height: 200px; overflow-y: auto; border: 1px solid #ccc; border-radius: 4px; padding: 5px; top: 100%; color: #000;';

            wrapper.appendChild(display);
            wrapper.appendChild(optionsContainer);
            select.appendChild(wrapper); // Adiciona ao div existente

            this.filtroBicoDisplay = display;
            this.filtroBicoOptions = optionsContainer;
            this.filtroBicoText = document.getElementById('filtroBicoText');
            this.bindBicoMultiselectEvents();
        },

        updateTipoVeiculoFilterOptions() {
            if (document.getElementById('filtroTipoVeiculoDisplay')) return;
            const select = this.filtroTipoVeiculo;
            if (!select) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'custom-multiselect';
            wrapper.style.position = 'relative';

            const display = document.createElement('div');
            display.id = 'filtroTipoVeiculoDisplay';
            display.className = 'glass-input multiselect-display';
            display.style.cssText = 'cursor: pointer; display: flex; justify-content: space-between; align-items: center; height: 38px; color: #000;';
            display.innerHTML = '<span id="filtroTipoVeiculoText">Todos</span> <i class="fas fa-chevron-down"></i>';

            const optionsContainer = document.createElement('div');
            optionsContainer.id = 'filtroTipoVeiculoOptions';
            optionsContainer.className = 'glass-dropdown hidden';
            optionsContainer.style.cssText = 'position: absolute; z-index: 1000; width: 100%; background-color: #fff; max-height: 200px; overflow-y: auto; border: 1px solid #ccc; border-radius: 4px; padding: 5px; top: 100%; color: #000;';

            wrapper.appendChild(display);
            wrapper.appendChild(optionsContainer);
            select.parentNode.replaceChild(wrapper, select);

            this.filtroTipoVeiculoDisplay = display;
            this.filtroTipoVeiculoOptions = optionsContainer;
            this.filtroTipoVeiculoText = document.getElementById('filtroTipoVeiculoText');

            this.bindTipoVeiculoMultiselectEvents();
        },

        bindTipoVeiculoMultiselectEvents() {
            if (this.filtroTipoVeiculoDisplay) {
                this.filtroTipoVeiculoDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.filtroTipoVeiculoOptions.classList.toggle('hidden');
                });
                document.addEventListener('click', (e) => {
                    if (!this.filtroTipoVeiculoDisplay.contains(e.target) && !this.filtroTipoVeiculoOptions.contains(e.target)) {
                        this.filtroTipoVeiculoOptions.classList.add('hidden');
                    }
                });
                this.filtroTipoVeiculoOptions.addEventListener('change', () => {
                    this.updateTipoVeiculoMultiselectText();
                });
            }
        },

        updateTipoVeiculoMultiselectText() {
            const checked = Array.from(this.filtroTipoVeiculoOptions.querySelectorAll('.tipo-veiculo-checkbox:checked'));
            if (checked.length === 0) {
                this.filtroTipoVeiculoText.textContent = 'Todos';
            } else if (checked.length <= 2) {
                this.filtroTipoVeiculoText.textContent = checked.map(cb => cb.value).join(', ');
            } else {
                this.filtroTipoVeiculoText.textContent = `${checked.length} selecionados`;
            }
        },

        bindBicoMultiselectEvents() {
            if (this.filtroBicoDisplay) {
                this.filtroBicoDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.filtroBicoOptions.classList.toggle('hidden');
                });
                document.addEventListener('click', (e) => {
                    if (!this.filtroBicoDisplay.contains(e.target) && !this.filtroBicoOptions.contains(e.target)) {
                        this.filtroBicoOptions.classList.add('hidden');
                    }
                });
                this.filtroBicoOptions.addEventListener('change', () => {
                    this.updateBicoMultiselectText();
                });
            }
        },

        updateBicoMultiselectText() {
            const checked = Array.from(this.filtroBicoOptions.querySelectorAll('.bico-checkbox:checked'));
            this.filtroBicoText.textContent = checked.length === 0 ? 'Todos' : (checked.length <= 2 ? checked.map(cb => cb.parentElement.textContent.trim().split(' ')[0]).join(', ') : `${checked.length} selecionados`);
        },
        updateFilterOptions() {
            if (document.getElementById('filtroTipoDisplay')) return;
            const select = this.filtroTipo;
            if (!select) return;

            // Cria a estrutura do multiselect
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-multiselect';
            wrapper.style.position = 'relative';

            const display = document.createElement('div');
            display.id = 'filtroTipoDisplay';
            display.className = 'glass-input multiselect-display';
            display.style.cssText = 'cursor: pointer; display: flex; justify-content: space-between; align-items: center; height: 38px; color: #000;';
            display.innerHTML = '<span id="filtroTipoText">Todos</span> <i class="fas fa-chevron-down"></i>';

            const optionsContainer = document.createElement('div');
            optionsContainer.id = 'filtroTipoOptions';
            optionsContainer.className = 'glass-dropdown hidden';
            optionsContainer.style.cssText = 'position: absolute; z-index: 1000; width: 100%; background-color: #fff; max-height: 200px; overflow-y: auto; border: 1px solid #ccc; border-radius: 4px; padding: 5px; top: 100%; color: #000;';

            const externoRestrito = this.usuarioSomenteAbastecimentoExterno();
            const options = externoRestrito ? [
                { value: 'EXTERNO', text: 'Abastecimento Externo' }
            ] : [
                { value: 'ENTRADA', text: 'Entrada (Recebimento)' },
                { value: 'SAIDA', text: 'Abastecimento Interno (Saída)' },
                { value: 'EXTERNO', text: 'Abastecimento Externo' },
                { value: 'AJUSTE', text: 'Ajuste de Estoque' }
            ];

            options.forEach(opt => {
                const label = document.createElement('label');
                label.style.display = 'block';
                label.style.padding = '5px';
                label.style.cursor = 'pointer';
                label.style.color = '#000';
                const checked = externoRestrito ? 'checked disabled' : '';
                label.innerHTML = `<input type="checkbox" class="tipo-checkbox" value="${opt.value}" style="margin-right: 8px;" ${checked}> ${opt.text}`;
                optionsContainer.appendChild(label);
            });

            wrapper.appendChild(display);
            wrapper.appendChild(optionsContainer);
            select.parentNode.replaceChild(wrapper, select);

            this.filtroTipoDisplay = display;
            this.filtroTipoOptions = optionsContainer;
            this.filtroTipoText = document.getElementById('filtroTipoText');

            this.bindMultiselectEvents();
            this.updateMultiselectText();
        },

        bindMultiselectEvents() {
            if (this.filtroTipoDisplay) {
                this.filtroTipoDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.filtroTipoOptions.classList.toggle('hidden');
                });
                document.addEventListener('click', (e) => {
                    if (!this.filtroTipoDisplay.contains(e.target) && !this.filtroTipoOptions.contains(e.target)) {
                        this.filtroTipoOptions.classList.add('hidden');
                    }
                });
                this.filtroTipoOptions.addEventListener('change', () => {
                    this.updateMultiselectText();
                });
            }
        },

        updateMultiselectText() {
            const checked = Array.from(this.filtroTipoOptions.querySelectorAll('.tipo-checkbox:checked'));
            if (checked.length === 0) {
                this.filtroTipoText.textContent = 'Todos';
            } else if (checked.length <= 2) {
                this.filtroTipoText.textContent = checked.map(cb => cb.parentElement.textContent.trim()).join(', ');
            } else {
                this.filtroTipoText.textContent = `${checked.length} selecionados`;
            }
        },

        aplicarRestricaoFiltroMovimentacao() {
            if (!this.usuarioSomenteAbastecimentoExterno() || !this.filtroTipoOptions) return;

            this.filtroTipoOptions.querySelectorAll('.tipo-checkbox').forEach(cb => {
                cb.checked = cb.value === 'EXTERNO';
                cb.disabled = true;
            });
            this.updateMultiselectText();
        },

        getFiltrosAtuais() {
            return {
                dataInicial: this.dataInicial.value,
                dataFinal: this.dataFinal.value,
                filial: this.getFilialSelecionada(),
                tanque: this.filtroTanque.value,
                veiculo: this.filtroVeiculo.value,
                rota: this.filtroRota.value,
                posto: this.filtroPosto ? this.filtroPosto.value : '',
                tiposMov: this.usuarioSomenteAbastecimentoExterno() ? ['EXTERNO'] : (this.filtroTipoOptions ? Array.from(this.filtroTipoOptions.querySelectorAll('.tipo-checkbox:checked')).map(cb => cb.value) : []),
                bicos: this.filtroBicoOptions ? Array.from(this.filtroBicoOptions.querySelectorAll('.bico-checkbox:checked')).map(cb => cb.value) : [],
                tiposVeiculo: this.filtroTipoVeiculoOptions ? Array.from(this.filtroTipoVeiculoOptions.querySelectorAll('.tipo-veiculo-checkbox:checked')).map(cb => cb.value) : []
            };
        },

        salvarEstadoParaEdicao() {
            sessionStorage.setItem(RELATORIO_ABASTECIMENTO_STATE_KEY, JSON.stringify({
                origem: 'editar-abastecimento',
                filtros: this.getFiltrosAtuais(),
                criadoEm: Date.now()
            }));
        },

        marcarCheckboxes(container, selector, values) {
            if (!container) return;
            const selected = new Set(values || []);
            container.querySelectorAll(selector).forEach(cb => {
                cb.checked = selected.has(cb.value);
            });
        },

        async restaurarEstadoAposEdicao() {
            const estadoRaw = sessionStorage.getItem(RELATORIO_ABASTECIMENTO_STATE_KEY);
            if (!estadoRaw) return;

            try {
                const estado = JSON.parse(estadoRaw);
                const expirado = !estado?.criadoEm || Date.now() - estado.criadoEm > 6 * 60 * 60 * 1000;
                if (estado?.origem !== 'editar-abastecimento' || expirado) {
                    sessionStorage.removeItem(RELATORIO_ABASTECIMENTO_STATE_KEY);
                    return;
                }

                const filtros = estado.filtros || {};
                this.dataInicial.value = filtros.dataInicial || this.dataInicial.value;
                this.dataFinal.value = filtros.dataFinal || this.dataFinal.value;
                if (this.filtroFilial && !this.getFilialUsuario()) this.filtroFilial.value = filtros.filial || '';
                await Promise.all([
                    this.loadTanques(),
                    this.loadBicos(),
                    this.loadPostos(),
                    this.loadVeiculos(),
                    this.loadRotas(),
                    this.loadTiposVeiculo()
                ]);
                this.filtroTanque.value = filtros.tanque || '';
                this.filtroVeiculo.value = filtros.veiculo || '';
                this.filtroRota.value = filtros.rota || '';
                if (this.filtroPosto) this.filtroPosto.value = filtros.posto || '';
                this.marcarCheckboxes(this.filtroTipoOptions, '.tipo-checkbox', filtros.tiposMov);
                this.marcarCheckboxes(this.filtroBicoOptions, '.bico-checkbox', filtros.bicos);
                this.marcarCheckboxes(this.filtroTipoVeiculoOptions, '.tipo-veiculo-checkbox', filtros.tiposVeiculo);
                this.aplicarRestricaoFiltroMovimentacao();
                this.updateMultiselectText();
                this.updateBicoMultiselectText();
                this.updateTipoVeiculoMultiselectText();

                sessionStorage.removeItem(RELATORIO_ABASTECIMENTO_STATE_KEY);
                await this.handleSearch(new Event('submit'));
            } catch (error) {
                console.error('Erro ao restaurar filtros do relatório:', error);
                sessionStorage.removeItem(RELATORIO_ABASTECIMENTO_STATE_KEY);
            }
        },

        /**
         * Helper para encontrar o último preço de um tanque antes de uma data.
         * Otimizado para usar um cache agrupado por tanque.
         */
        getPriceLookup(priceHistory) {
            const lookup = {};
            priceHistory.forEach(p => {
                if (!lookup[p.tanque_id]) lookup[p.tanque_id] = [];
                lookup[p.tanque_id].push(p);
            });
            
            return (tanqueId, consumptionDate) => {
                const history = lookup[tanqueId];
                if (!history) return 0;
                
                const targetDate = new Date(consumptionDate);
                // Como o histórico já vem ordenado desc pelo banco, o primeiro que for <= é o correto
                const record = history.find(p => new Date(p.data) <= targetDate);
                return record ? record.valor_litro : 0;
            };
        },

        async handleSearch(e) {
            e.preventDefault();
            
            const dtIni = this.dataInicial.value;
            const dtFim = this.dataFinal.value;
            const valoresFilial = this.getValoresFilialSelecionada();
            const tanqueId = this.filtroTanque.value;
            const postoId = this.getPostoIdFiltro();
            const tiposVeiculo = this.filtroTipoVeiculoOptions
                ? Array.from(this.filtroTipoVeiculoOptions.querySelectorAll('.tipo-veiculo-checkbox:checked')).map(cb => cb.value)
                : [];
            const veiculoPlaca = this.filtroVeiculo.value.trim().toUpperCase();
            const rota = this.filtroRota.value.trim();
            const tiposMov = this.usuarioSomenteAbastecimentoExterno()
                ? ['EXTERNO']
                : (this.filtroTipoOptions 
                    ? Array.from(this.filtroTipoOptions.querySelectorAll('.tipo-checkbox:checked')).map(cb => cb.value)
                    : []);
            const bicosSelecionados = this.filtroBicoOptions
                ? Array.from(this.filtroBicoOptions.querySelectorAll('.bico-checkbox:checked')).map(cb => parseInt(cb.value))
                : [];

            if (!dtIni || !dtFim) {
                alert('Por favor, selecione o período.');
                return;
            }

            if (this.usuarioSomenteAbastecimentoExterno() && valoresFilial.length === 0) {
                alert('Seu nivel acessa somente o relatorio externo da sua filial. Cadastre uma filial para este usuario.');
                return;
            }

            if (postoId === null) {
                alert('Posto informado nao encontrado. Selecione uma opcao da lista ou deixe em branco.');
                return;
            }

            this.tableBody.innerHTML = '<tr><td colspan="16" style="text-align:center;">Buscando dados...</td></tr>';
            this.cardResultados.classList.remove('hidden');

            try {
                // --- Filtro por Tipo de Veículo ---
                let placasPorTipo = [];
                if (tiposVeiculo.length > 0) {
                    let queryVeiculosDoTipo = supabaseClient
                        .from('veiculos')
                        .select('placa')
                        .in('tipo', tiposVeiculo);

                    if (valoresFilial.length > 0) queryVeiculosDoTipo = queryVeiculosDoTipo.in('filial', valoresFilial);

                    const { data: veiculosDoTipo, error: veiculosError } = await queryVeiculosDoTipo;
                    
                    if (veiculosError) throw veiculosError;
                    
                    placasPorTipo = veiculosDoTipo.map(v => v.placa);
                    
                    if (placasPorTipo.length === 0) {
                        this.dadosRelatorio = [];
                        this.renderResultadosAtuais();
                        return;
                    }
                }
                // --- Lógica de Preços ---
                // 1. Busca o histórico de preços de compra (entradas) até a data final do relatório
                const { data: priceHistory, error: priceError } = await supabaseClient
                    .from('abastecimentos')
                    .select('tanque_id, valor_litro, data')
                    .neq('numero_nota', 'AJUSTE DE ESTOQUE') // Ignora ajustes de estoque
                    .gt('valor_litro', 0) // Apenas entradas com preço válido
                    .lte('data', `${dtFim}T23:59:59-03:00`) // Otimização: busca apenas até a data final do filtro
                    .order('data', { ascending: false }); // Ordena do mais recente para o mais antigo

                if (priceError) throw priceError;

                // 2. Lookup de preços otimizado
                const findLastPrice = this.getPriceLookup(priceHistory);

                let dadosEntradas = [];
                let dadosSaidas = [];
                let dadosExternos = [];

                // 1. Buscar Entradas e Ajustes (se o filtro permitir)
                if (this.tipoMovimentacaoPermitido(tiposMov, 'ENTRADA') || this.tipoMovimentacaoPermitido(tiposMov, 'AJUSTE')) {
                    let queryEntradas = supabaseClient
                        .from('abastecimentos')
                        .select('*, tanques(nome, tipo_combustivel, filial)')
                        .gte('data', `${dtIni}T00:00:00-03:00`)
                        .lte('data', `${dtFim}T23:59:59-03:00`);

                    if (tanqueId) {
                        queryEntradas = queryEntradas.eq('tanque_id', tanqueId);
                    }

                    const wantEntrada = this.tipoMovimentacaoPermitido(tiposMov, 'ENTRADA');
                    const wantAjuste = this.tipoMovimentacaoPermitido(tiposMov, 'AJUSTE');

                    if (wantEntrada && !wantAjuste) {
                        queryEntradas = queryEntradas.neq('numero_nota', 'AJUSTE DE ESTOQUE');
                    } else if (!wantEntrada && wantAjuste) { // Only adjustments
                        queryEntradas = queryEntradas.eq('numero_nota', 'AJUSTE DE ESTOQUE');
                    }

                    const { data: resEntradas, error: errEntradas } = await queryEntradas;
                    if (errEntradas) throw errEntradas;
                    
                    // Normalizar dados de entrada
                    dadosEntradas = (resEntradas || [])
                        .filter(e => this.registroPertenceFilial(e.tanques?.filial))
                        .map(e => ({
                        id: e.id,
                        tipo: e.numero_nota === 'AJUSTE DE ESTOQUE' ? 'AJUSTE' : 'ENTRADA',
                        data_hora: e.data,
                        usuario: e.usuario,
                        placa: '-',
                        rota: '-',
                        km_atual: '-',
                        numero_nota: e.numero_nota,
                        tanque: e.tanques ? e.tanques.nome : 'N/A',
                        bico: '-',
                        combustivel: e.tanques ? e.tanques.tipo_combustivel : '-',
                        litros: Number(e.qtd_litros),
                        valor_negociado: 0,
                        valor_litro: Number(e.valor_litro),
                        valor_total: Number(e.valor_total),
                        origem_tabela: 'abastecimentos'
                    }));
                }

                // 2. Buscar Saídas (se o filtro permitir)
                if (this.tipoMovimentacaoPermitido(tiposMov, 'SAIDA')) {
                    let querySaidas = supabaseClient
                        .from('saidas_combustivel')
                        .select('*, bicos!inner(nome, bombas!inner(tanque_id, tanques!inner(id, nome, tipo_combustivel, filial)))')
                        .gte('data_hora', `${dtIni}T00:00:00-03:00`)
                        .lte('data_hora', `${dtFim}T23:59:59-03:00`);

                    if (veiculoPlaca) {
                        querySaidas = querySaidas.eq('veiculo_placa', veiculoPlaca);
                    }
                    if (rota) {
                        querySaidas = querySaidas.eq('rota', rota);
                    }
                    if (tiposVeiculo.length > 0) {
                        querySaidas = querySaidas.in('veiculo_placa', placasPorTipo);
                    }
                    if (bicosSelecionados.length > 0) {
                        querySaidas = querySaidas.in('bico_id', bicosSelecionados);
                    }
                    if (tanqueId) {
                        querySaidas = querySaidas.eq('bicos.bombas.tanque_id', tanqueId);
                    }

                    // Filtro de tanque para saídas é mais complexo pois está aninhado
                    // Faremos o filtro no cliente para simplificar, já que o volume filtrado por data não deve ser gigante
                    
                    const { data: resSaidas, error: errSaidas } = await querySaidas;
                    if (errSaidas) throw errSaidas;

                    let saidasFiltradas = resSaidas || [];
                    if (valoresFilial.length > 0) {
                        saidasFiltradas = saidasFiltradas.filter(s => this.registroPertenceFilial(s.bicos?.bombas?.tanques?.filial));
                    }
                    if (tanqueId) {
                        saidasFiltradas = saidasFiltradas.filter(s => s.bicos?.bombas?.tanques?.id == tanqueId); // Comparação fraca int/string
                    }

                    // Normalizar dados de saída
                    dadosSaidas = saidasFiltradas.map(s => {
                        const tanqueInfo = s.bicos?.bombas?.tanques;
                        const bicoNome = s.bicos?.nome || '-';
                        // Calcula o custo da saída com base no último preço de compra
                        const valorLitroSaida = tanqueInfo ? findLastPrice(tanqueInfo.id, s.data_hora) : 0;
                        const valorTotalSaida = (s.qtd_litros || 0) * valorLitroSaida;

                        return {
                            id: s.id,
                            tipo: 'SAIDA',
                            data_hora: s.data_hora,
                            usuario: s.usuario,
                            placa: s.veiculo_placa || '-',
                            rota: s.rota || s.motorista_nome || '-', // Fallback para motorista se rota for nula (legado)
                            km_atual: s.km_atual || '-',
                            numero_nota: '-',
                            tanque: tanqueInfo ? tanqueInfo.nome : 'N/A',
                            bico: bicoNome,
                            combustivel: tanqueInfo ? tanqueInfo.tipo_combustivel : '-',
                            litros: Number(s.qtd_litros), // Saída é negativa no estoque, mas positiva no relatório de consumo
                            valor_negociado: 0,
                            valor_litro: valorLitroSaida,
                            valor_total: valorTotalSaida,
                            origem_tabela: 'saidas_combustivel'
                        };
                    });
                }

                // 3. Buscar Abastecimentos Externos (se o filtro permitir)
                // Nota: Externo não tem 'tanque_id' da empresa, então ignoramos o filtro de tanque.
                if (!tanqueId && this.tipoMovimentacaoPermitido(tiposMov, 'EXTERNO')) {
                    let queryExterno = supabaseClient
                        .from('abastecimento_externo')
                        .select('id, data_hora, usuario, posto_id, veiculo_placa, rota, km_atual, litros, valor_unitario, valor_total, valor_negociado, postos(razao_social)')
                        .gte('data_hora', `${dtIni}T00:00:00-03:00`)
                        .lte('data_hora', `${dtFim}T23:59:59-03:00`);

                    if (veiculoPlaca) {
                        queryExterno = queryExterno.eq('veiculo_placa', veiculoPlaca);
                    }
                    if (rota) {
                        queryExterno = queryExterno.eq('rota', rota);
                    }
                    if (tiposVeiculo.length > 0) {
                        queryExterno = queryExterno.in('veiculo_placa', placasPorTipo);
                    }
                    if (postoId) {
                        queryExterno = queryExterno.eq('posto_id', postoId);
                    }
                    if (valoresFilial.length > 0) {
                        queryExterno = queryExterno.in('filial', valoresFilial);
                    }

                    const { data: resExterno, error: errExterno } = await queryExterno;
                    if (errExterno) throw errExterno;

                    dadosExternos = (resExterno || []).map(e => ({
                        id: e.id,
                        tipo: 'EXTERNO',
                        data_hora: e.data_hora,
                        usuario: e.usuario,
                        placa: e.veiculo_placa || '-',
                        rota: e.rota || '-',
                        km_atual: e.km_atual || '-',
                        numero_nota: '-', // Externo usa controle interno geralmente
                        tanque: e.postos ? `Posto: ${e.postos.razao_social}` : 'Posto: Externo',
                        bico: '-',
                        combustivel: '-', 
                        litros: Number(e.litros),
                        valor_negociado: Number(e.valor_negociado || 0), // Agora lê o valor que foi salvo no dia do abastecimento
                        valor_litro: Number(e.valor_unitario),
                        valor_total: Number(e.valor_total),
                        origem_tabela: 'abastecimento_externo'
                    }));
                }

                // 4. Unificar e Ordenar
                let allConsumptions = [...dadosEntradas, ...dadosSaidas, ...dadosExternos];

                // --- CÁLCULO DE KM ANTERIOR, KM RODADO E MÉDIA KM/L ---
                // Processar apenas os tipos que possuem KM (SAIDA e EXTERNO)
                let consumptionsForKML = allConsumptions.filter(item => item.tipo === 'SAIDA' || item.tipo === 'EXTERNO');
                let otherRecords = allConsumptions.filter(item => item.tipo !== 'SAIDA' && item.tipo !== 'EXTERNO');

                // Ordenar por placa, depois por data_hora para calcular km_anterior corretamente
                consumptionsForKML.sort((a, b) => {
                    if (a.placa < b.placa) return -1;
                    if (a.placa > b.placa) return 1;
                    return new Date(a.data_hora) - new Date(b.data_hora);
                });

                // NOVO: Busca o KM anterior no banco para o primeiro registro de cada placa no set filtrado.
                // Isso garante que filtros de datas curtas (ex: apenas 1 dia) mostrem o KM anterior e rodado corretamente.
                const placasUnicas = [...new Set(consumptionsForKML.map(c => c.placa))];
                const inicialKmMap = {};

                if (placasUnicas.length > 0) {
                    await Promise.all(placasUnicas.map(async (placa) => {
                        const primeiroRegNoSet = consumptionsForKML.find(c => c.placa === placa);
                        if (!primeiroRegNoSet) return;

                        const dataLimite = primeiroRegNoSet.data_hora;

                        const [resInt, resExt] = await Promise.all([
                            supabaseClient.from('saidas_combustivel').select('km_atual').eq('veiculo_placa', placa).lt('data_hora', dataLimite).order('data_hora', { ascending: false }).limit(1),
                            supabaseClient.from('abastecimento_externo').select('km_atual').eq('veiculo_placa', placa).lt('data_hora', dataLimite).order('data_hora', { ascending: false }).limit(1)
                        ]);

                        const kmInt = resInt.data?.[0]?.km_atual || 0;
                        const kmExt = resExt.data?.[0]?.km_atual || 0;
                        const maiorKm = Math.max(kmInt, kmExt);
                        
                        if (maiorKm > 0) inicialKmMap[placa] = maiorKm;
                    }));
                }

                const lastKmByPlaca = { ...inicialKmMap }; // Inicia com os KMs buscados no banco

                consumptionsForKML.forEach(record => {
                    const placa = record.placa;
                    const currentKm = parseFloat(record.km_atual);
                    const litros = parseFloat(record.litros);

                    if (!isNaN(currentKm) && currentKm > 0) {
                        const previousKm = lastKmByPlaca[placa] !== undefined ? lastKmByPlaca[placa] : null;
                        record.km_anterior = previousKm;

                        if (previousKm !== null && currentKm >= previousKm) {
                            const kmRodado = currentKm - previousKm;
                            record.km_rodado = kmRodado;
                            record.media_kml = litros > 0 ? (kmRodado / litros) : 0;
                        } else if (previousKm !== null && currentKm < previousKm) {
                            // Tratamento para odômetro zerado ou erro de leitura
                            record.km_rodado = 'Erro (KM menor)';
                            record.media_kml = 'Erro';
                        } else {
                            // Primeiro registro para este veículo ou sem KM anterior
                            record.km_rodado = null;
                            record.media_kml = null;
                        }
                        lastKmByPlaca[placa] = currentKm; // Atualiza o último KM para esta placa
                    } else {
                        record.km_anterior = null;
                        record.km_rodado = null;
                        record.media_kml = null;
                    }
                });

                // Combina todos os registros novamente e ordena por data_hora decrescente
                this.dadosRelatorio = [...otherRecords, ...consumptionsForKML].sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));

                // Tipo do Veículo (ex: TRUCK, CAMINHÃO 3/4...) vem do cadastro de veículos, não da
                // tabela de abastecimento — usado pelos modos Consolidado/Resumo Consolidado.
                const tiposPorPlaca = await this.fetchTiposVeiculoPorPlaca();
                this.dadosRelatorio.forEach(reg => {
                    reg.tipoVeiculo = tiposPorPlaca.get(String(reg.placa || '').trim().toUpperCase()) || 'NÃO INFORMADO';
                });

                this.renderResultadosAtuais();
                this.renderizarGraficos(this.dadosRelatorio);

            } catch (error) {
                console.error('Erro na busca:', error);
                this.tableBody.innerHTML = '<tr><td colspan="16" style="text-align:center; color:red;">Erro ao buscar dados.</td></tr>';
            }
        },

        renderizarGraficos(data) {
            if (!data || data.length === 0) {
                this.atualizarVisibilidadeDashboards();
                return;
            }

            // 1. Média de Consumo (KM/L) por Veículo
            const statsVeiculos = data.reduce((acc, item) => {
                if ((item.tipo === 'SAIDA' || item.tipo === 'EXTERNO') && item.placa !== '-' && item.km_atual !== '-' && !isNaN(parseFloat(item.km_atual))) {
                    const placa = item.placa;
                    const km = parseFloat(item.km_atual);
                    const litros = Math.abs(parseFloat(item.litros));

                    if (!acc[placa]) acc[placa] = { minKm: km, maxKm: km, totalLitros: 0 };
                    if (km < acc[placa].minKm) acc[placa].minKm = km;
                    if (km > acc[placa].maxKm) acc[placa].maxKm = km;
                    acc[placa].totalLitros += litros;
                }
                return acc;
            }, {});

            const kmlLabels = [];
            const kmlValues = [];
            Object.entries(statsVeiculos).forEach(([placa, stats]) => {
                const dist = stats.maxKm - stats.minKm;
                if (dist > 0 && stats.totalLitros > 0) {
                    kmlLabels.push(placa);
                    kmlValues.push(Number((dist / stats.totalLitros).toFixed(2)));
                }
            });

            // 2. Agrupar por Dia (Evolução de Consumo)
            const evolucaoMap = data.reduce((acc, item) => {
                const dataFmt = item.data_hora.split('T')[0];
                acc[dataFmt] = (acc[dataFmt] || 0) + Math.abs(item.litros);
                return acc;
            }, {});
            const sortedDates = Object.keys(evolucaoMap).sort();

            // 3. Agrupar por Veículo (Top 10)
            const veiculoMap = data.reduce((acc, item) => {
                if (item.placa !== '-') {
                    acc[item.placa] = (acc[item.placa] || 0) + Math.abs(item.litros);
                }
                return acc;
            }, {});
            const topVeiculos = Object.entries(veiculoMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

            // 4. Agrupar por Tipo de Movimentação
            const tiposMap = data.reduce((acc, item) => {
                const label = item.tipo === 'SAIDA' ? 'Saída Interna' : (item.tipo === 'ENTRADA' ? 'Entrada' : item.tipo);
                acc[label] = (acc[label] || 0) + Math.abs(item.litros);
                return acc;
            }, {});

            // Criar/Atualizar os Gráficos
            this.criarGrafico('mediaConsumo', this.chartMediaConsumoCanvas, 'bar', kmlLabels, kmlValues, 'KM/L');
            this.criarGrafico('evolucaoConsumo', this.chartEvolucaoConsumoCanvas, 'line', sortedDates.map(d => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')), sortedDates.map(d => evolucaoMap[d]), 'Consumo Diário (L)');
            this.criarGrafico('topVeiculos', this.chartTopVeiculosCanvas, 'bar', topVeiculos.map(v => v[0]), topVeiculos.map(v => v[1]), 'Consumo (L)', { indexAxis: 'y' });
            this.criarGrafico('tiposMovimentacao', this.chartTiposMovimentacaoCanvas, 'doughnut', Object.keys(tiposMap), Object.values(tiposMap), 'Movimentação');

            this.atualizarVisibilidadeDashboards();
        },

        criarGrafico(id, canvas, type, labels, values, label, extraOptions = {}) {
            if (!canvas) return;
            if (this.charts[id]) this.charts[id].destroy();

            this.charts[id] = new Chart(canvas.getContext('2d'), {
                type: type,
                data: {
                    labels: labels,
                    datasets: [{
                        label: label,
                        data: values,
                        backgroundColor: ['#006937', '#28a745', '#007bff', '#17a2b8', '#ffc107', '#dc3545', '#6c757d', '#343a40', '#fd7e14', '#20c997'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: (type === 'pie' || type === 'doughnut') ? 'right' : 'top',
                            labels: { boxWidth: 12, font: { size: 10 } }
                        }
                    },
                    ...extraOptions
                }
            });
        },

        iniciarRolagemAutomatica() {
            const wrapper = document.querySelector('.charts-scroll-container');
            if (!wrapper) return;

            let direction = 1; 
            const speed = 0.8; 

            const step = () => {
                if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 1) {
                    direction = -1;
                } else if (wrapper.scrollLeft <= 0) {
                    direction = 1;
                }
                wrapper.scrollLeft += speed * direction;
                requestAnimationFrame(step);
            };
            
            requestAnimationFrame(step);

            wrapper.addEventListener('mouseenter', () => direction = 0);
            wrapper.addEventListener('mouseleave', () => {
                if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 10) direction = -1;
                else direction = 1;
            });
        },

        handleSort(column) {
            // Alterna a direção se clicar na mesma coluna, senão define como ASC
            if (this.sortConfig.column === column) {
                this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortConfig.column = column;
                this.sortConfig.direction = 'asc';
            }

            this.updateSortIcons();
            this.sortData();
            this.renderTable();
        },

        sortData() {
            const { column, direction } = this.sortConfig;
            if (!column) return;

            const factor = direction === 'asc' ? 1 : -1;

            this.dadosRelatorio.sort((a, b) => {
                let valA = a[column];
                let valB = b[column];

                // Trata nulos e undefined
                if (valA === null || valA === undefined) valA = '';
                if (valB === null || valB === undefined) valB = '';

                // Comparação de strings (case insensitive) ou números
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return -1 * factor;
                if (valA > valB) return 1 * factor;
                return 0;
            });
        },

        updateSortIcons() {
            // Reseta todos os ícones
            document.querySelectorAll('th[data-sort] i').forEach(i => i.className = 'fas fa-sort');
            
            // Atualiza o ícone da coluna ativa
            const activeHeader = document.querySelector(`th[data-sort="${this.sortConfig.column}"] i`);
            if (activeHeader) {
                activeHeader.className = this.sortConfig.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        },

        renderTable() {
            this.tableBody.innerHTML = '';
            let somaLitros = 0;
            let somaValor = 0;

            if (this.dadosRelatorio.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="16" style="text-align:center;">Nenhum registro encontrado no período.</td></tr>';
                this.totalLitrosEl.textContent = '0,00 L';
                if (this.totalLancamentosEl) this.totalLancamentosEl.textContent = '0';
                this.totalValorEl.textContent = 'R$ 0,00';
                return;
            }

            this.dadosRelatorio.forEach(reg => {
                // Para o totalizador, somamos tudo como valor absoluto de movimentação ou consideramos sinal?
                // Geralmente relatório de movimentação soma o volume movimentado.
                // Se for ajuste negativo, ele vem negativo do banco.
                somaLitros += Number(reg.litros);
                somaValor += Number(reg.valor_total);

                const tr = document.createElement('tr');
                const dataFormatada = new Date(reg.data_hora).toLocaleString('pt-BR');
                
                // Estilo para diferenciar tipos
                let tipoClass = '';
                if (reg.tipo === 'SAIDA') tipoClass = 'text-danger'; 
                else if (reg.tipo === 'ENTRADA') tipoClass = 'text-success';
                else if (reg.tipo === 'EXTERNO') tipoClass = 'text-warning'; // Laranja/Amarelo para Externo
                else tipoClass = 'text-primary';
                
                const kmAnteriorDisplay = reg.km_anterior !== null ? Number(reg.km_anterior).toLocaleString('pt-BR') : '-';
                const kmRodadoDisplay = reg.km_rodado !== null ? (typeof reg.km_rodado === 'string' ? reg.km_rodado : Number(reg.km_rodado).toLocaleString('pt-BR')) : '-';
                const mediaKmlDisplay = reg.media_kml !== null ? (typeof reg.media_kml === 'string' ? reg.media_kml : Number(reg.media_kml).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '-';

                tr.innerHTML = `
                    <td class="acoes-cell">
                        <button type="button" class="btn-action view btn-visualizar-lancamento" data-id="${reg.id}" data-tipo="${reg.tipo}" title="Visualizar lançamento">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button type="button" class="btn-action btn-editar-lancamento" data-id="${reg.id}" data-tipo="${reg.tipo}" title="Editar lançamento">
                            <i class="fas fa-edit"></i>
                        </button>
                    </td>
                    <td>${dataFormatada}</td>
                    <td>${reg.usuario || '-'}</td>
                    <td>${reg.placa}</td>
                    <td>${reg.rota}</td>
                    <td>${Number(reg.km_atual).toLocaleString('pt-BR')}</td>
                    <td>${reg.numero_nota}</td>
                    <td>${reg.tanque}</td>
                    <td>${reg.bico}</td>
                    <td>${reg.combustivel}</td>
                    <td class="font-bold ${tipoClass}" style="text-align: right;">${reg.tipo === 'EXTERNO' ? '' : (reg.tipo === 'SAIDA' ? '-' : '+')}${Number(reg.litros).toLocaleString('pt-BR', {minimumFractionDigits: 2})} L</td>
                    <td style="text-align: right;">${Number(reg.valor_negociado || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
                    <td style="text-align: right;">${Number(reg.valor_litro).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
                    <td style="text-align: right;">${Number(reg.valor_total).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
                    <td style="text-align: right;">${kmAnteriorDisplay}</td>
                    <td style="text-align: right;">${kmRodadoDisplay}</td>
                    <td style="text-align: right;">${mediaKmlDisplay}</td>
                `;
                this.tableBody.appendChild(tr);
            });

            this.totalLitrosEl.textContent = somaLitros.toLocaleString('pt-BR', {minimumFractionDigits: 2}) + ' L';
            if (this.totalLancamentosEl) {
                this.totalLancamentosEl.textContent = this.dadosRelatorio.length.toLocaleString('pt-BR');
            }
            this.totalValorEl.textContent = somaValor.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        },

        escapeHTML(value) {
            const div = document.createElement('div');
            div.textContent = value ?? '';
            return div.innerHTML;
        },

        formatCurrency(value) {
            return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        },

        formatLitros(value) {
            return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' L';
        },

        // === Modo de visualização (Detalhado / Consolidado / Resumo Consolidado) ===

        alternarModoVisualizacao(modo) {
            if (this.modoVisualizacao === modo) return;
            this.modoVisualizacao = modo;

            document.getElementById('btnModoDetalhadoAbastecimento')?.classList.toggle('active', modo === 'detalhado');
            document.getElementById('btnModoConsolidadoAbastecimento')?.classList.toggle('active', modo === 'consolidado');
            document.getElementById('btnModoResumoPlacaAbastecimento')?.classList.toggle('active', modo === 'resumoPlaca');

            document.getElementById('tabelaDetalhadoWrapper')?.classList.toggle('hidden', modo !== 'detalhado');
            document.getElementById('tabelaConsolidadoWrapper')?.classList.toggle('hidden', modo !== 'consolidado');
            document.getElementById('tabelaResumoPlacaWrapper')?.classList.toggle('hidden', modo !== 'resumoPlaca');

            this.renderResultadosAtuais();
        },

        renderResultadosAtuais() {
            if (this.modoVisualizacao === 'consolidado') {
                this.renderConsolidado();
            } else if (this.modoVisualizacao === 'resumoPlaca') {
                this.renderResumoPlaca();
            } else {
                this.renderTable();
            }
            this.atualizarVisibilidadeDashboards();
        },

        atualizarVisibilidadeDashboards() {
            const temDados = this.dadosRelatorio.length > 0;
            this.dashboardAbastecimento?.classList.toggle('hidden', !(temDados && this.modoVisualizacao === 'detalhado'));
            this.dashboardConsolidadoAbastecimento?.classList.toggle('hidden', !(temDados && this.modoVisualizacao === 'consolidado'));
            this.dashboardResumoPlacaAbastecimento?.classList.toggle('hidden', !(temDados && this.modoVisualizacao === 'resumoPlaca'));
        },

        // Só entram nas visões Consolidado/Resumo Consolidado os lançamentos ligados a um veículo
        // de verdade (Saída Interna ou Externo) — Entradas/Ajustes de tanque não têm placa.
        registrosComVeiculo() {
            return this.dadosRelatorio.filter(reg => reg.placa && reg.placa !== '-');
        },

        consolidarPorVeiculo(dados) {
            const grupos = new Map();
            dados.forEach(reg => {
                const placa = reg.placa;
                const tipoVeiculo = reg.tipoVeiculo || 'NÃO INFORMADO';
                const tanquePosto = reg.tanque || '-';
                const chave = `${placa.toUpperCase()}|${tipoVeiculo.toUpperCase()}|${tanquePosto.toUpperCase()}`;

                if (!grupos.has(chave)) {
                    grupos.set(chave, { placa, tipoVeiculo, tanquePosto, qtd: 0, litros: 0, valorTotal: 0 });
                }
                const g = grupos.get(chave);
                g.qtd += 1;
                g.litros += Math.abs(Number(reg.litros) || 0);
                g.valorTotal += Number(reg.valor_total) || 0;
            });
            return Array.from(grupos.values());
        },

        consolidarPorPlaca(dados) {
            const grupos = new Map();
            dados.forEach(reg => {
                const placa = reg.placa;
                const chave = placa.toUpperCase();

                if (!grupos.has(chave)) {
                    grupos.set(chave, { placa, postos: new Set(), qtdAbastecimentos: 0, litros: 0, valorTotal: 0, kmRodado: 0 });
                }
                const g = grupos.get(chave);
                g.postos.add((reg.tanque || '-').trim().toUpperCase());
                g.qtdAbastecimentos += 1;
                g.litros += Math.abs(Number(reg.litros) || 0);
                g.valorTotal += Number(reg.valor_total) || 0;
                // km_rodado só é um número válido quando há leitura anterior confiável (senão é null ou "Erro (KM menor)")
                if (typeof reg.km_rodado === 'number' && !isNaN(reg.km_rodado)) {
                    g.kmRodado += reg.km_rodado;
                }
            });
            return Array.from(grupos.values()).map(g => ({
                placa: g.placa,
                qtdPostos: g.postos.size,
                qtdAbastecimentos: g.qtdAbastecimentos,
                litros: g.litros,
                valorTotal: g.valorTotal,
                kmRodado: g.kmRodado,
                mediaConsumo: g.litros > 0 ? (g.kmRodado / g.litros) : 0
            }));
        },

        ordenarGrupos(grupos, sortConfig) {
            const { column, direction } = sortConfig;
            const factor = direction === 'asc' ? 1 : -1;
            grupos.sort((a, b) => {
                let valA = a[column];
                let valB = b[column];
                if (typeof valA === 'string') {
                    valA = valA.toLowerCase();
                    valB = (valB || '').toLowerCase();
                }
                if (valA < valB) return -1 * factor;
                if (valA > valB) return 1 * factor;
                return 0;
            });
            return grupos;
        },

        renderCabecalhoGrupos(trId, colunas, sortConfig, onSort) {
            const tr = document.getElementById(trId);
            if (!tr) return;

            tr.innerHTML = colunas.map(col => {
                const ativo = sortConfig.column === col.key;
                const icone = ativo ? (sortConfig.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';
                const alinhamento = col.align === 'right' ? 'text-align: right;' : (col.align === 'center' ? 'text-align: center;' : '');
                return `<th data-sort="${col.key}" style="${alinhamento}">${col.label} <i class="fas ${icone}"></i></th>`;
            }).join('');

            tr.querySelectorAll('th[data-sort]').forEach(th => {
                th.addEventListener('click', () => onSort(th.dataset.sort));
            });
        },

        renderConsolidado() {
            const grupos = this.ordenarGrupos(this.consolidarPorVeiculo(this.registrosComVeiculo()), this.sortConfigConsolidado);

            this.renderCabecalhoGrupos('cabecalhoConsolidadoAbastecimento', this.colunasConsolidado, this.sortConfigConsolidado, (col) => this.handleSortConsolidado(col));

            const tbody = document.getElementById('tabelaConsolidadoBody');
            if (!tbody) return;

            if (!grupos.length) {
                tbody.innerHTML = `<tr><td colspan="${this.colunasConsolidado.length}" style="text-align:center; padding:20px; color:#888;">Nenhum registro encontrado.</td></tr>`;
                this.totalLitrosEl.textContent = '0,00 L';
                if (this.totalLancamentosEl) this.totalLancamentosEl.textContent = '0';
                this.totalValorEl.textContent = 'R$ 0,00';
                this.renderizarGraficosConsolidado(grupos);
                return;
            }

            let somaLitros = 0;
            let somaValor = 0;
            tbody.innerHTML = grupos.map(g => {
                somaLitros += g.litros;
                somaValor += g.valorTotal;
                return `
                    <tr>
                        <td>${this.escapeHTML(g.placa)}</td>
                        <td>${this.escapeHTML(g.tipoVeiculo)}</td>
                        <td>${this.escapeHTML(g.tanquePosto)}</td>
                        <td style="text-align:center;">${g.qtd}</td>
                        <td style="text-align:right;">${this.formatLitros(g.litros)}</td>
                        <td style="text-align:right;">${this.formatCurrency(g.valorTotal)}</td>
                    </tr>
                `;
            }).join('');

            this.totalLitrosEl.textContent = this.formatLitros(somaLitros);
            if (this.totalLancamentosEl) this.totalLancamentosEl.textContent = grupos.length.toLocaleString('pt-BR');
            this.totalValorEl.textContent = this.formatCurrency(somaValor);

            this.renderizarGraficosConsolidado(grupos);
        },

        handleSortConsolidado(column) {
            if (this.sortConfigConsolidado.column === column) {
                this.sortConfigConsolidado.direction = this.sortConfigConsolidado.direction === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortConfigConsolidado.column = column;
                this.sortConfigConsolidado.direction = (column === 'placa' || column === 'tipoVeiculo' || column === 'tanquePosto') ? 'asc' : 'desc';
            }
            this.renderConsolidado();
        },

        renderResumoPlaca() {
            const grupos = this.ordenarGrupos(this.consolidarPorPlaca(this.registrosComVeiculo()), this.sortConfigResumoPlaca);

            this.renderCabecalhoGrupos('cabecalhoResumoPlacaAbastecimento', this.colunasResumoPlaca, this.sortConfigResumoPlaca, (col) => this.handleSortResumoPlaca(col));

            const tbody = document.getElementById('tabelaResumoPlacaBody');
            if (!tbody) return;

            if (!grupos.length) {
                tbody.innerHTML = `<tr><td colspan="${this.colunasResumoPlaca.length}" style="text-align:center; padding:20px; color:#888;">Nenhum registro encontrado.</td></tr>`;
                this.totalLitrosEl.textContent = '0,00 L';
                if (this.totalLancamentosEl) this.totalLancamentosEl.textContent = '0';
                this.totalValorEl.textContent = 'R$ 0,00';
                this.renderizarGraficosResumoPlaca(grupos);
                return;
            }

            let somaLitros = 0;
            let somaValor = 0;
            tbody.innerHTML = grupos.map(g => {
                somaLitros += g.litros;
                somaValor += g.valorTotal;
                return `
                    <tr>
                        <td>${this.escapeHTML(g.placa)}</td>
                        <td style="text-align:center;">${g.qtdPostos}</td>
                        <td style="text-align:center;">${g.qtdAbastecimentos}</td>
                        <td style="text-align:right;">${this.formatLitros(g.litros)}</td>
                        <td style="text-align:right;">${g.kmRodado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
                        <td style="text-align:right;">${g.mediaConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style="text-align:right;">${this.formatCurrency(g.valorTotal)}</td>
                    </tr>
                `;
            }).join('');

            this.totalLitrosEl.textContent = this.formatLitros(somaLitros);
            if (this.totalLancamentosEl) this.totalLancamentosEl.textContent = grupos.length.toLocaleString('pt-BR');
            this.totalValorEl.textContent = this.formatCurrency(somaValor);

            this.renderizarGraficosResumoPlaca(grupos);
        },

        handleSortResumoPlaca(column) {
            if (this.sortConfigResumoPlaca.column === column) {
                this.sortConfigResumoPlaca.direction = this.sortConfigResumoPlaca.direction === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortConfigResumoPlaca.column = column;
                this.sortConfigResumoPlaca.direction = (column === 'placa') ? 'asc' : 'desc';
            }
            this.renderResumoPlaca();
        },

        renderizarGraficosConsolidado(grupos) {
            if (typeof Chart === 'undefined' || !grupos.length) return;

            const top10 = (campo) => [...grupos].sort((a, b) => b[campo] - a[campo]).slice(0, 10);

            const porTanquePosto = {};
            const porTipoVeiculo = {};
            grupos.forEach(g => {
                porTanquePosto[g.tanquePosto] = porTanquePosto[g.tanquePosto] || { litros: 0, valor: 0 };
                porTanquePosto[g.tanquePosto].litros += g.litros;
                porTanquePosto[g.tanquePosto].valor += g.valorTotal;

                porTipoVeiculo[g.tipoVeiculo] = (porTipoVeiculo[g.tipoVeiculo] || 0) + g.litros;
            });

            const topVeiculoLitros = top10('litros');
            const topVeiculoValor = top10('valorTotal');
            const topTanquePostoLitros = Object.entries(porTanquePosto).sort((a, b) => b[1].litros - a[1].litros).slice(0, 10);
            const topTanquePostoValor = Object.entries(porTanquePosto).sort((a, b) => b[1].valor - a[1].valor).slice(0, 10);

            this.criarGrafico('consolidadoVeiculoLitros', document.getElementById('chartConsolidadoVeiculoLitros'), 'bar', topVeiculoLitros.map(g => g.placa), topVeiculoLitros.map(g => g.litros), 'Litros');
            this.criarGrafico('consolidadoVeiculoValor', document.getElementById('chartConsolidadoVeiculoValor'), 'bar', topVeiculoValor.map(g => g.placa), topVeiculoValor.map(g => g.valorTotal), 'Valor Total (R$)');
            this.criarGrafico('consolidadoTanquePostoLitros', document.getElementById('chartConsolidadoTanquePostoLitros'), 'bar', topTanquePostoLitros.map(([k]) => k), topTanquePostoLitros.map(([, v]) => v.litros), 'Litros');
            this.criarGrafico('consolidadoTanquePostoValor', document.getElementById('chartConsolidadoTanquePostoValor'), 'bar', topTanquePostoValor.map(([k]) => k), topTanquePostoValor.map(([, v]) => v.valor), 'Valor Total (R$)');
            this.criarGrafico('consolidadoTipoVeiculo', document.getElementById('chartConsolidadoTipoVeiculo'), 'doughnut', Object.keys(porTipoVeiculo), Object.values(porTipoVeiculo), 'Litros por Tipo de Veículo');

            if (!this.rolagemConsolidadoIniciada) {
                this.rolagemConsolidadoIniciada = true;
                requestAnimationFrame(() => this.iniciarRolagemCarrossel('.charts-scroll-consolidado'));
            }
        },

        renderizarGraficosResumoPlaca(grupos) {
            if (typeof Chart === 'undefined' || !grupos.length) return;

            const top10 = (campo) => [...grupos].sort((a, b) => b[campo] - a[campo]).slice(0, 10);

            const topLitros = top10('litros');
            const topValor = top10('valorTotal');
            const topQtdAbastecimentos = top10('qtdAbastecimentos');
            const topQtdPostos = top10('qtdPostos');

            this.criarGrafico('resumoPlacaLitros', document.getElementById('chartResumoPlacaLitros'), 'bar', topLitros.map(g => g.placa), topLitros.map(g => g.litros), 'Litros');
            this.criarGrafico('resumoPlacaValor', document.getElementById('chartResumoPlacaValor'), 'bar', topValor.map(g => g.placa), topValor.map(g => g.valorTotal), 'Valor Total (R$)');
            this.criarGrafico('resumoPlacaQtdAbastecimentos', document.getElementById('chartResumoPlacaQtdAbastecimentos'), 'bar', topQtdAbastecimentos.map(g => g.placa), topQtdAbastecimentos.map(g => g.qtdAbastecimentos), 'Qtd. Abastecimentos');
            this.criarGrafico('resumoPlacaQtdPostos', document.getElementById('chartResumoPlacaQtdPostos'), 'bar', topQtdPostos.map(g => g.placa), topQtdPostos.map(g => g.qtdPostos), 'Qtd. Postos/Tanques');

            if (!this.rolagemResumoPlacaIniciada) {
                this.rolagemResumoPlacaIniciada = true;
                requestAnimationFrame(() => this.iniciarRolagemCarrossel('.charts-scroll-resumo-placa'));
            }
        },

        iniciarRolagemCarrossel(selector) {
            const wrapper = document.querySelector(selector);
            if (!wrapper) return;

            let direction = 1;
            const speed = 0.8;

            const step = () => {
                if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 1) {
                    direction = -1;
                } else if (wrapper.scrollLeft <= 0) {
                    direction = 1;
                }
                wrapper.scrollLeft += speed * direction;
                requestAnimationFrame(step);
            };

            requestAnimationFrame(step);

            wrapper.addEventListener('mouseenter', () => direction = 0);
            wrapper.addEventListener('mouseleave', () => {
                if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 10) direction = -1;
                else direction = 1;
            });
        },

        visualizarLancamento(id, tipo) {
            const reg = this.dadosRelatorio.find(item => String(item.id) === String(id) && item.tipo === tipo);
            if (!reg) {
                alert('Não foi possível localizar o lançamento para visualização.');
                return;
            }

            this.lancamentoModalAtual = { id: reg.id, tipo: reg.tipo };
            const tipoLabel = {
                ENTRADA: 'Entrada',
                SAIDA: 'Saída Interna',
                EXTERNO: 'Abastecimento Externo',
                AJUSTE: 'Ajuste de Estoque'
            }[reg.tipo] || reg.tipo;

            const campos = [
                ['Tipo', tipoLabel],
                ['Data/Hora', new Date(reg.data_hora).toLocaleString('pt-BR')],
                ['Usuário', reg.usuario || '-'],
                ['Placa', reg.placa || '-'],
                ['Rota', reg.rota || '-'],
                ['KM Atual', reg.km_atual || '-'],
                ['Nº Nota', reg.numero_nota || '-'],
                [reg.tipo === 'EXTERNO' ? 'Posto' : 'Tanque', reg.tanque || '-'],
                ['Bico', reg.bico || '-'],
                ['Combustível', reg.combustivel || '-'],
                ['Litros', `${Number(reg.litros || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`],
                ['Valor Unitário', this.formatCurrency(reg.valor_litro)],
                ['Valor Total', this.formatCurrency(reg.valor_total)],
                ['KM Anterior', reg.km_anterior !== null && reg.km_anterior !== undefined ? reg.km_anterior : '-'],
                ['KM Rodado', reg.km_rodado !== null && reg.km_rodado !== undefined ? reg.km_rodado : '-'],
                ['Média KM/L', reg.media_kml !== null && reg.media_kml !== undefined ? reg.media_kml : '-']
            ];

            this.detalhesLancamentoGrid.innerHTML = campos.map(([label, value]) => `
                <div class="detalhe-item">
                    <span class="detalhe-label">${this.escapeHTML(label)}</span>
                    <span class="detalhe-valor">${this.escapeHTML(value)}</span>
                </div>
            `).join('');

            this.modalLancamento.classList.remove('hidden');
        },

        fecharModalLancamento() {
            this.modalLancamento?.classList.add('hidden');
            this.lancamentoModalAtual = null;
        },

        editarLancamento(tipo, id) {
            if (!id || !tipo) {
                alert('Não foi possível identificar o lançamento para edição.');
                return;
            }

            const returnTo = 'relatorio-abastecimento.html';
            this.salvarEstadoParaEdicao();
            window.location.href = `abastecimento.html?tipo=${encodeURIComponent(tipo)}&id=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(returnTo)}`;
        },

        exportXLS() {
            if (this.dadosRelatorio.length === 0) return alert('Sem dados para exportar.');

            if (this.modoVisualizacao === 'consolidado') return this.exportXLSConsolidado();
            if (this.modoVisualizacao === 'resumoPlaca') return this.exportXLSResumoPlaca();

            const dadosFormatados = this.dadosRelatorio.map(reg => ({
                'Data/Hora': new Date(reg.data_hora).toLocaleString('pt-BR'),
                'Tipo': reg.tipo,
                'Usuário': reg.usuario || '-',
                'Placa': reg.placa,
                'Rota': reg.rota,
                'KM Atual': reg.km_atual,
                'Nº Nota': reg.numero_nota,
                'Tanque': reg.tanque,
                'Bico': reg.bico,
                'Combustível': reg.combustivel,
                'Litros': Number(reg.litros),
                'Vlr. Negociado': Number(reg.valor_negociado || 0),
                'Vlr. Litro': Number(reg.valor_litro),
                'Total': Number(reg.valor_total),
                'KM Anterior': reg.km_anterior !== null ? (typeof reg.km_anterior === 'string' ? reg.km_anterior : Number(reg.km_anterior)) : '',
                'KM Rodado': reg.km_rodado !== null ? (typeof reg.km_rodado === 'string' ? reg.km_rodado : Number(reg.km_rodado)) : '',
                'Média KM/L': reg.media_kml !== null ? (typeof reg.media_kml === 'string' ? reg.media_kml : Number(reg.media_kml)) : ''
            }));

            // Calcular totais para adicionar ao final da planilha
            const totalLitros = this.dadosRelatorio.reduce((sum, reg) => sum + Number(reg.litros), 0);
            const totalValor = this.dadosRelatorio.reduce((sum, reg) => sum + Number(reg.valor_total), 0);

            dadosFormatados.push({
                'Data/Hora': 'TOTAIS GERAIS',
                'Tipo': '',
                'Usuário': '',
                'Placa': '',
                'Rota': '',
                'KM Atual': '',
                'Nº Nota': '',
                'Tanque': '',
                'Bico': '',
                'Combustível': '',
                'Litros': totalLitros,
                'Vlr. Negociado': '',
                'Vlr. Litro': '',
                'Total': totalValor,
                'KM Anterior': '',
                'KM Rodado': '',
                'Média KM/L': ''
            });

            const ws = XLSX.utils.json_to_sheet(dadosFormatados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
            XLSX.writeFile(wb, "Relatorio_Abastecimentos.xlsx");
        },

        exportXLSConsolidado() {
            const grupos = this.ordenarGrupos(this.consolidarPorVeiculo(this.registrosComVeiculo()), { column: 'valorTotal', direction: 'desc' });
            if (!grupos.length) return alert('Sem dados para exportar.');

            const dadosFormatados = grupos.map(g => ({
                'PLACA': g.placa,
                'TIPO_DE_VEICULO': g.tipoVeiculo,
                'TANQUE_POSTO': g.tanquePosto,
                'QTD_ABASTECIMENTOS': g.qtd,
                'LITROS': g.litros.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                'VALOR_TOTAL': g.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            }));

            const ws = XLSX.utils.json_to_sheet(dadosFormatados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Consolidado");
            XLSX.writeFile(wb, "Relatorio_Abastecimentos_Consolidado.xlsx");
        },

        exportXLSResumoPlaca() {
            const grupos = this.ordenarGrupos(this.consolidarPorPlaca(this.registrosComVeiculo()), { column: 'valorTotal', direction: 'desc' });
            if (!grupos.length) return alert('Sem dados para exportar.');

            const dadosFormatados = grupos.map(g => ({
                'PLACA': g.placa,
                'QTD_POSTOS_TANQUES': g.qtdPostos,
                'QTD_ABASTECIMENTOS': g.qtdAbastecimentos,
                'LITROS': g.litros.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                'KM_RODADOS': g.kmRodado.toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
                'MEDIA_CONSUMO_KML': g.mediaConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                'VALOR_TOTAL': g.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            }));

            const ws = XLSX.utils.json_to_sheet(dadosFormatados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Resumo por Placa");
            XLSX.writeFile(wb, "Relatorio_Abastecimentos_Resumo_Placa.xlsx");
        },

        async exportPDF() {
            if (this.dadosRelatorio.length === 0) return alert('Sem dados para exportar.');

            if (this.modoVisualizacao === 'consolidado') return this.exportPDFConsolidado();
            if (this.modoVisualizacao === 'resumoPlaca') return this.exportPDFResumoPlaca();

            const btn = this.btnExportarPDF;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape' }); // Paisagem para caber mais colunas

                // 1. Carregar a imagem do logo e converter para JPEG com fundo branco
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
                            ctx.fillStyle = '#FFFFFF'; // Fundo branco
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(img, 0, 0);
                            resolve(canvas.toDataURL('image/jpeg'));
                        };
                        img.onerror = () => {
                            console.warn('Logo não encontrado');
                            resolve(null);
                        };
                    });
                };

                const logoBase64 = await getLogoBase64();

                // 2. Cabeçalho com Logo
                if (logoBase64) {
                    doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);
                }

                doc.setFontSize(18);
                doc.text("Relatório de Movimentação de Combustível", 14, 28);
                
                doc.setFontSize(10);
                doc.text(`Período: ${new Date(this.dataInicial.value + 'T00:00:00-03:00').toLocaleDateString('pt-BR')} a ${new Date(this.dataFinal.value + 'T00:00:00-03:00').toLocaleDateString('pt-BR')}`, 14, 34);

                const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
                const nomeUsuario = usuarioLogado?.nome || 'Sistema';
                doc.text(`Gerado por: ${nomeUsuario}`, 14, 39);

                const tableColumn = ["Data/Hora", "Usuário", "Placa", "Rota", "KM", "Nota", "Tanque", "Bico", "Combustível", "Litros", "Vlr. Negoc.", "Vlr. Unit", "Total", "KM Ant.", "KM Rodado", "Média KM/L"];
                let tableRows = [];
                let totalLitros = 0;
                let totalValor = 0;

                this.dadosRelatorio.forEach(reg => {
                    totalLitros += Number(reg.litros);
                    totalValor += Number(reg.valor_total);

                    const row = [
                        new Date(reg.data_hora).toLocaleString('pt-BR'),
                        reg.usuario || '-',
                        reg.placa,
                        reg.rota,
                        reg.km_atual,
                        reg.numero_nota,
                        reg.tanque,
                        reg.bico,
                        reg.combustivel,
                        Number(reg.litros).toLocaleString('pt-BR', {minimumFractionDigits: 2}),
                        Number(reg.valor_negociado || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}),
                        Number(reg.valor_litro).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}),
                        Number(reg.valor_total).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}),
                        reg.km_anterior !== null ? (typeof reg.km_anterior === 'string' ? reg.km_anterior : Number(reg.km_anterior).toLocaleString('pt-BR')) : '-',
                        reg.km_rodado !== null ? (typeof reg.km_rodado === 'string' ? reg.km_rodado : Number(reg.km_rodado).toLocaleString('pt-BR')) : '-',
                        reg.media_kml !== null ? (typeof reg.media_kml === 'string' ? reg.media_kml : Number(reg.media_kml).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '-'
                    ];
                    tableRows.push(row);
                });

                // Adiciona linha de total
                tableRows.push([
                    { content: 'TOTAIS GERAIS', colSpan: 9, styles: { halign: 'right', fontStyle: 'bold' } }, // Mantido colSpan 9 para parar antes de litros
                    { content: totalLitros.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold' } },
                    { content: '', colSpan: 2, styles: { fontStyle: 'bold' } }, // Coluna Vlr. Negoc e Vlr. Unit vazia
                    { content: totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), styles: { fontStyle: 'bold' } },
                    { content: '', colSpan: 3, styles: { fontStyle: 'bold' } } // Colunas de KM vazias
                ]);


                doc.autoTable({
                    head: [tableColumn],
                    body: tableRows,
                    startY: 45,
                    headStyles: { fillColor: [0, 105, 55] }, // Verde Marquespan
                    styles: { fontSize: 8 },
                    columnStyles: {
                        0: { cellWidth: 20 }, // Data/Hora
                        9: { halign: 'right', cellWidth: 15 }, // Litros
                        10: { halign: 'right', cellWidth: 18 }, // Vlr Negoc
                        11: { halign: 'right', cellWidth: 15 }, // Vlr Unit
                        12: { halign: 'right', cellWidth: 15 }, // Total
                        13: { halign: 'right', cellWidth: 15 }, // KM Ant.
                        14: { halign: 'right', cellWidth: 15 }, // KM Rodado
                        15: { halign: 'right', cellWidth: 15 } // Média KM/L
                    }
                });

                // Adicionar rodapé com numeração de páginas
                const pageCount = doc.internal.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFontSize(8);
                    doc.setTextColor(100); // Cinza escuro

                    const pageWidth = doc.internal.pageSize.getWidth();
                    const pageHeight = doc.internal.pageSize.getHeight();

                    // Texto da esquerda (Data de geração)
                    const dateText = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
                    doc.text(dateText, 14, pageHeight - 10);

                    // Texto da direita (Paginação)
                    const pageText = `Página ${i} de ${pageCount}`;
                    const textWidth = doc.getTextWidth(pageText);
                    doc.text(pageText, pageWidth - 14 - textWidth, pageHeight - 10);
                }

                doc.save(`Relatorio_Abastecimentos_${new Date().toISOString().slice(0,10)}.pdf`);
            } catch (err) {
                console.error('Erro ao exportar PDF:', err);
                alert('Erro ao gerar PDF: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        },

        async exportPDFConsolidado() {
            const grupos = this.ordenarGrupos(this.consolidarPorVeiculo(this.registrosComVeiculo()), { column: 'valorTotal', direction: 'desc' });
            if (!grupos.length) return alert('Sem dados para exportar.');

            const btn = this.btnExportarPDF;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape' });

                const logoBase64 = await this.getLogoBase64PDF();
                if (logoBase64) doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);

                const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
                const nomeUsuario = usuarioLogado?.nome || 'Sistema';
                const totalLitros = grupos.reduce((sum, g) => sum + g.litros, 0);
                const totalValor = grupos.reduce((sum, g) => sum + g.valorTotal, 0);

                doc.setFontSize(18);
                doc.setTextColor(0, 105, 55);
                doc.text('Relatório de Abastecimento - Consolidado', 60, 18);
                doc.setFontSize(10);
                doc.setTextColor(40);
                doc.text(`Gerado por: ${nomeUsuario}`, 14, 29);
                doc.text(`Grupos: ${grupos.length} | Litros: ${totalLitros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L | Total: ${this.formatCurrency(totalValor)}`, 14, 34);

                const columns = ['Placa', 'Tipo de Veículo', 'Tanque/Posto', 'Qtd. Abastecimentos', 'Litros', 'Valor Total'];
                const rows = grupos.map(g => [
                    g.placa,
                    g.tipoVeiculo,
                    g.tanquePosto,
                    String(g.qtd),
                    g.litros.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                    this.formatCurrency(g.valorTotal)
                ]);
                rows.push([
                    { content: 'TOTAL GERAL', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: '', styles: { fontStyle: 'bold' } },
                    { content: totalLitros.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: this.formatCurrency(totalValor), styles: { halign: 'right', fontStyle: 'bold' } }
                ]);

                doc.autoTable({
                    head: [columns],
                    body: rows,
                    startY: 40,
                    theme: 'grid',
                    headStyles: { fillColor: [0, 105, 55], textColor: 255, fontSize: 9 },
                    styles: { fontSize: 8, cellPadding: 3 },
                    alternateRowStyles: { fillColor: [245, 247, 246] },
                    columnStyles: { 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
                });

                const pageCount = doc.internal.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFontSize(8);
                    doc.setTextColor(100);
                    const pageWidth = doc.internal.pageSize.getWidth();
                    const pageHeight = doc.internal.pageSize.getHeight();
                    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pageHeight - 10);
                    const pageText = `Página ${i} de ${pageCount}`;
                    doc.text(pageText, pageWidth - 14 - doc.getTextWidth(pageText), pageHeight - 10);
                }

                doc.save(`Relatorio_Abastecimentos_Consolidado_${new Date().toISOString().slice(0, 10)}.pdf`);
            } catch (err) {
                console.error('Erro ao exportar PDF consolidado:', err);
                alert('Erro ao gerar PDF: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        },

        async exportPDFResumoPlaca() {
            const grupos = this.ordenarGrupos(this.consolidarPorPlaca(this.registrosComVeiculo()), { column: 'valorTotal', direction: 'desc' });
            if (!grupos.length) return alert('Sem dados para exportar.');

            const btn = this.btnExportarPDF;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape' });

                const logoBase64 = await this.getLogoBase64PDF();
                if (logoBase64) doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);

                const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
                const nomeUsuario = usuarioLogado?.nome || 'Sistema';
                const totalLitros = grupos.reduce((sum, g) => sum + g.litros, 0);
                const totalValor = grupos.reduce((sum, g) => sum + g.valorTotal, 0);
                const totalKmRodado = grupos.reduce((sum, g) => sum + g.kmRodado, 0);
                const mediaConsumoGeral = totalLitros > 0 ? (totalKmRodado / totalLitros) : 0;

                doc.setFontSize(18);
                doc.setTextColor(0, 105, 55);
                doc.text('Relatório de Abastecimento - Resumo Consolidado por Placa', 60, 18);
                doc.setFontSize(10);
                doc.setTextColor(40);
                doc.text(`Gerado por: ${nomeUsuario}`, 14, 29);
                doc.text(`Placas: ${grupos.length} | Litros: ${totalLitros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L | Total: ${this.formatCurrency(totalValor)}`, 14, 34);

                const columns = ['Placa', 'Qtd. Postos/Tanques', 'Qtd. Abastecimentos', 'Litros', 'KM Rodados', 'Média Consumo (KM/L)', 'Valor Total'];
                const rows = grupos.map(g => [
                    g.placa,
                    String(g.qtdPostos),
                    String(g.qtdAbastecimentos),
                    g.litros.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                    g.kmRodado.toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
                    g.mediaConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    this.formatCurrency(g.valorTotal)
                ]);
                rows.push([
                    { content: 'TOTAL GERAL', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: '', styles: { fontStyle: 'bold' } },
                    { content: totalLitros.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: totalKmRodado.toLocaleString('pt-BR', { maximumFractionDigits: 0 }), styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: mediaConsumoGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: this.formatCurrency(totalValor), styles: { halign: 'right', fontStyle: 'bold' } }
                ]);

                doc.autoTable({
                    head: [columns],
                    body: rows,
                    startY: 40,
                    theme: 'grid',
                    headStyles: { fillColor: [0, 105, 55], textColor: 255, fontSize: 9 },
                    styles: { fontSize: 8, cellPadding: 3 },
                    alternateRowStyles: { fillColor: [245, 247, 246] },
                    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } }
                });

                const pageCount = doc.internal.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFontSize(8);
                    doc.setTextColor(100);
                    const pageWidth = doc.internal.pageSize.getWidth();
                    const pageHeight = doc.internal.pageSize.getHeight();
                    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pageHeight - 10);
                    const pageText = `Página ${i} de ${pageCount}`;
                    doc.text(pageText, pageWidth - 14 - doc.getTextWidth(pageText), pageHeight - 10);
                }

                doc.save(`Relatorio_Abastecimentos_Resumo_Placa_${new Date().toISOString().slice(0, 10)}.pdf`);
            } catch (err) {
                console.error('Erro ao exportar PDF resumo por placa:', err);
                alert('Erro ao gerar PDF: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        },

        async clearFilters() {
            this.form.reset();
            this.aplicarBloqueioFiltroFilial();
            await Promise.all([
                this.loadTanques(),
                this.loadBicos(),
                this.loadPostos(),
                this.loadVeiculos(),
                this.loadRotas(),
                this.loadTiposVeiculo()
            ]);
            if (this.filtroTipoOptions) {
                this.filtroTipoOptions.querySelectorAll('.tipo-checkbox').forEach(cb => cb.checked = false);
                this.aplicarRestricaoFiltroMovimentacao();
                this.updateMultiselectText();
            } else if (this.filtroTipo) {
                this.filtroTipo.value = "";
            }
            if (this.filtroVeiculo) this.filtroVeiculo.value = '';
            if (this.filtroRota) this.filtroRota.value = '';
            if (this.filtroPosto) this.filtroPosto.value = '';
            if (this.filtroTipoVeiculoOptions) {
                this.filtroTipoVeiculoOptions.querySelectorAll('.tipo-veiculo-checkbox').forEach(cb => cb.checked = false);
                this.updateTipoVeiculoMultiselectText();
            }
            if (this.filtroBicoOptions) {
                this.filtroBicoOptions.querySelectorAll('.bico-checkbox').forEach(cb => cb.checked = false);
                this.updateBicoMultiselectText();
            }
            const hoje = new Date();
            const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            this.dataInicial.valueAsDate = primeiroDia;
            this.dataFinal.valueAsDate = hoje;
            this.cardResultados.classList.add('hidden');
        }
    };

    RelatorioUI.init();
});
