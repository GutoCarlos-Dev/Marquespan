import { supabaseClient } from './supabase.js';

const ColetarManutencaoUI = {
    init() {
        console.log('Página de Coleta de Manutenção iniciada.');
        this.cacheDOM();
        this.fixStatusOptions();
        this.injectStyles();
        this.bindEvents();
        this.initTabs();
        this.renderLegend();
        this.veiculosData = [];
        this.editingId = null; // Variável para controlar o estado de edição
        this.currentSort = { column: 'data_hora', direction: 'desc' }; // Estado inicial da ordenação
        this.currentReportSort = { column: 'data_hora', direction: 'desc' }; // Estado inicial da ordenação do relatório
        this.reportData = []; // Cache dos dados do relatório
        this.chartStatus = null; // Instância do gráfico de status
        this.chartItems = null; // Instância do gráfico de itens
        this.carregarLancamentos(); // Carrega a lista ao iniciar
    },

    cacheDOM() {
        this.btnAdicionarLancamento = document.getElementById('btnAdicionarLancamento');
        this.btnAdicionarItem = document.getElementById('btnAdicionarItem'); // Botão Flutuante Mobile
        this.btnImportarMassa = document.getElementById('btnImportarMassa');
        
        // Modal
        this.modal = document.getElementById('modalLancamento');
        this.btnCloseModal = this.modal.querySelector('.close-button');
        this.formColeta = document.getElementById('formLancamentoColeta');
        this.coletaDataHoraInput = document.getElementById('coletaDataHora');
        this.coletaUsuarioInput = document.getElementById('coletaUsuario');
        this.coletaPlacaInput = document.getElementById('coletaPlaca');
        this.coletaModeloInput = document.getElementById('coletaModelo');
        this.veiculosList = document.getElementById('veiculosList');
        this.tableBodyLancamentos = document.getElementById('tableBodyLancamentos');
        this.searchPlacaInput = document.getElementById('searchPlaca');
        this.searchItemInput = document.getElementById('searchItem');
        this.searchStatusInput = document.getElementById('searchStatus');
        this.btnFiltrarLancamentos = document.getElementById('btnFiltrarLancamentos');

        // Modal Importação
        this.modalImportacao = document.getElementById('modalImportacaoMassa');
        this.btnCloseModalImportacao = this.modalImportacao?.querySelector('.close-button');
        this.formImportacao = document.getElementById('formImportacaoMassa');

        // Exportação
        this.formExportacao = document.getElementById('formExportacao');
        this.filtroSemana = document.getElementById('filtroSemana');
        this.filtroPlaca = document.getElementById('filtroPlaca');
        this.filtroDataIni = document.getElementById('filtroDataIni');
        this.filtroDataFim = document.getElementById('filtroDataFim');
        this.filtroItemDisplay = document.getElementById('filtroItemDisplay');
        this.filtroItemOptions = document.getElementById('filtroItemOptions');
        this.filtroItemText = document.getElementById('filtroItemText');
        this.filtroStatusDisplay = document.getElementById('filtroStatusDisplay');
        this.filtroStatusOptions = document.getElementById('filtroStatusOptions');
        this.filtroStatusText = document.getElementById('filtroStatusText');
        this.btnLimparSelecaoItem = document.getElementById('btnLimparSelecaoItem');
        this.btnLimparTudo = document.getElementById('btnLimparTudo');
        this.btnBuscarRelatorio = document.getElementById('btnBuscarRelatorio');
        this.tableBodyRelatorio = document.getElementById('tableBodyRelatorio');
        this.btnExportarPDF = document.getElementById('btnExportarPDF');
        this.graficosContainer = document.getElementById('graficos-container');
        this.contadorResultados = document.getElementById('contadorResultados');
    },

    fixStatusOptions() {
        const selects = document.querySelectorAll('.checklist-status');
        selects.forEach(select => {
            Array.from(select.options).forEach(option => {
                if (option.value === 'NAO REALIZADO' || option.value === 'NÃO REALIZADO') {
                    option.value = 'PENDENTE';
                    option.text = 'PENDENTE';
                }
                if (option.value === 'OK') {
                    option.value = 'FINALIZADO';
                    option.text = 'FINALIZADO';
                }
            });
        });
    },

    injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            .status-pendente {
                background-color: #f8d7da !important;
                color: #721c24 !important;
                border: 1px solid #f5c6cb !important;
            }
            .status-finalizado-rota {
                background-color: #d4edda !important;
                color: #0b3314 !important;
                border: 1px solid #c3e6cb !important;
            }
            .status-finalizado {
                background-color: #d4edda !important;
                color: #155724 !important;
                border: 1px solid #c3e6cb !important;
            }
            .status-internado {
                background-color: #cce5ff !important;
                color: #004085 !important;
                border: 1px solid #b8daff !important;
            }
            .status-checkin-oficina {
                background-color: #fff3cd !important;
                color: #856404 !important;
                border: 1px solid #ffeeba !important;
            }
            .status-checkin-rota {
                background-color: #ffe0b2 !important;
                color: #d35400 !important;
                border: 1px solid #ffcc80 !important;
            }
        `;
        document.head.appendChild(style);
    },

    bindEvents() {
        this.btnAdicionarLancamento.addEventListener('click', () => this.abrirModal());
        if (this.btnAdicionarLancamento) this.btnAdicionarLancamento.addEventListener('click', () => this.abrirModal());
        if (this.btnAdicionarItem) this.btnAdicionarItem.addEventListener('click', () => this.abrirModal()); // Evento Mobile
        if (this.btnImportarMassa) this.btnImportarMassa.addEventListener('click', () => this.abrirModalImportacao());

        // Adiciona listener para mudança de cor no status
        document.querySelectorAll('.checklist-status').forEach(select => {
            select.addEventListener('change', (e) => this.updateStatusColor(e.target));
        });

        if (this.modalImportacao) {
            this.btnCloseModalImportacao.addEventListener('click', () => this.fecharModalImportacao());
            this.modalImportacao.addEventListener('click', (e) => { if (e.target === this.modalImportacao) this.fecharModalImportacao(); });
            this.formImportacao.addEventListener('submit', (e) => this.handleImportacao(e));
        }

        this.btnCloseModal.addEventListener('click', () => this.fecharModal());
        this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this.fecharModal(); });
        this.coletaPlacaInput.addEventListener('change', () => this.preencherModeloVeiculo());
        this.formColeta.addEventListener('submit', (e) => this.registrarColeta(e));
        
        // Event delegation para botões da tabela
        this.tableBodyLancamentos.addEventListener('click', (e) => {
            const btnDelete = e.target.closest('.btn-delete');
            const btnEdit = e.target.closest('.btn-edit');
            if (btnDelete) this.excluirColeta(btnDelete.dataset.id);
            if (btnEdit) this.editarColeta(btnEdit.dataset.id);
        });
        if (this.tableBodyLancamentos) {
            this.tableBodyLancamentos.addEventListener('click', (e) => {
                const btnDelete = e.target.closest('.btn-delete');
                const btnEdit = e.target.closest('.btn-edit');
                if (btnDelete) this.excluirColeta(btnDelete.dataset.id);
                if (btnEdit) this.editarColeta(btnEdit.dataset.id);
            });
        }

        // Event delegation para botões da tabela de relatório (Resultados da Busca)
        this.tableBodyRelatorio.addEventListener('click', (e) => {
            const btnDelete = e.target.closest('.btn-delete');
            const btnEdit = e.target.closest('.btn-edit');
            if (btnDelete) this.excluirColeta(btnDelete.dataset.id);
            if (btnEdit) this.editarColeta(btnEdit.dataset.id);
        });
        if (this.tableBodyRelatorio) {
            this.tableBodyRelatorio.addEventListener('click', (e) => {
                const btnDelete = e.target.closest('.btn-delete');
                const btnEdit = e.target.closest('.btn-edit');
                if (btnDelete) this.excluirColeta(btnDelete.dataset.id);
                if (btnEdit) this.editarColeta(btnEdit.dataset.id);
            });
        }

        if (this.btnFiltrarLancamentos) {
            this.btnFiltrarLancamentos.addEventListener('click', () => this.carregarLancamentos());
        }

        if (this.searchPlacaInput) {
            this.searchPlacaInput.addEventListener('input', () => this.carregarLancamentos());
        }

        if(this.formExportacao) this.formExportacao.addEventListener('submit', (e) => this.gerarRelatorioExcel(e));
        if(this.btnBuscarRelatorio) this.btnBuscarRelatorio.addEventListener('click', () => this.buscarRelatorio());
        if(this.btnExportarPDF) this.btnExportarPDF.addEventListener('click', (e) => this.gerarRelatorioPDF(e));
        
        if(this.btnLimparSelecaoItem) {
            this.btnLimparSelecaoItem.addEventListener('click', () => this.limparSelecaoItem());
        }
        if(this.btnLimparTudo) {
            this.btnLimparTudo.addEventListener('click', () => this.limparFiltros());
        }

        // Automação do status ao digitar detalhes
        document.querySelectorAll('.checklist-details').forEach(input => {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase();
                const statusSelect = e.target.closest('.checklist-item').querySelector('.checklist-status');
                if (statusSelect && statusSelect.value === "") {
                    statusSelect.value = "PENDENTE";                    this.updateStatusColor(statusSelect); // Adicionado para atualizar a cor
                }
            });
        });

        // Lógica específica para ELETRICA INTERNA
        const eletricaItem = document.querySelector('.checklist-item[data-item="ELETRICA INTERNA"]');
        if (eletricaItem) {
            const statusSelect = eletricaItem.querySelector('.checklist-status');
            statusSelect.addEventListener('change', (e) => {
                const extraField = document.getElementById('extra-eletrica-interna');
                if (e.target.value === 'FINALIZADO' || e.target.value === 'OK') {
                    extraField.classList.remove('hidden');
                } else {
                    extraField.classList.add('hidden');
                    extraField.querySelector('input').value = ''; // Limpa se não for OK
                }
            });
        }

        // Eventos de ordenação da grid
        document.querySelectorAll('#sectionLancamento th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.sort));
        });

        // Eventos de ordenação da grid de relatório
        document.querySelectorAll('#sectionGerarArquivo th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.handleReportSort(th.dataset.sort));
        });

        // Atalho de teclado Ctrl+S para salvar no modal
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault(); // Evita salvar a página HTML
                if (!this.modal.classList.contains('hidden')) {
                    this.formColeta.requestSubmit();
                }
            }
        });

        // Eventos do Multi-Select de Itens
        if (this.filtroItemDisplay) {
            this.filtroItemDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                this.filtroItemOptions.style.display = this.filtroItemOptions.style.display === 'block' ? 'none' : 'block';
            });

            // Fechar ao clicar fora
            document.addEventListener('click', (e) => {
                if (this.filtroItemOptions && this.filtroItemOptions.style.display === 'block') {
                    if (!this.filtroItemDisplay.contains(e.target) && !this.filtroItemOptions.contains(e.target)) {
                        this.filtroItemOptions.style.display = 'none';
                    }
                }
            });

            // Atualizar texto ao selecionar
            const checkboxes = this.filtroItemOptions.querySelectorAll('.filtro-item-checkbox');
            checkboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    const selected = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
                    this.filtroItemText.textContent = selected.length > 0 ? `${selected.length} item(ns) selecionado(s)` : 'Todos';
                });
            });
        }

        // Eventos do Multi-Select de Status
        if (this.filtroStatusDisplay) {
            this.filtroStatusDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                this.filtroStatusOptions.style.display = this.filtroStatusOptions.style.display === 'block' ? 'none' : 'block';
            });

            // Fechar ao clicar fora
            document.addEventListener('click', (e) => {
                if (this.filtroStatusOptions && this.filtroStatusOptions.style.display === 'block') {
                    if (!this.filtroStatusDisplay.contains(e.target) && !this.filtroStatusOptions.contains(e.target)) {
                        this.filtroStatusOptions.style.display = 'none';
                    }
                }
            });

            // Atualizar texto ao selecionar
            const statusCheckboxes = this.filtroStatusOptions.querySelectorAll('.filtro-status-checkbox');
            statusCheckboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    const selected = Array.from(statusCheckboxes).filter(c => c.checked).map(c => c.value);
                    this.filtroStatusText.textContent = selected.length > 0 ? `${selected.length} selecionado(s)` : 'Todos';
                });
            });
        }
    },

    limparSelecaoItem() {
        const checkboxes = this.filtroItemOptions.querySelectorAll('.filtro-item-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
        this.filtroItemText.textContent = 'Todos';
    },

    limparFiltros() {
        // Limpa inputs de texto e data
        this.filtroSemana.value = '';
        this.filtroPlaca.value = '';
        this.filtroDataIni.value = '';
        this.filtroDataFim.value = '';

        // Limpa Multiselect de Itens
        this.limparSelecaoItem();

        // Limpa Multiselect de Status
        if (this.filtroStatusOptions) {
            const statusCheckboxes = this.filtroStatusOptions.querySelectorAll('.filtro-status-checkbox');
            statusCheckboxes.forEach(cb => cb.checked = false);
        }
        if (this.filtroStatusText) this.filtroStatusText.textContent = 'Todos';
    },

    initTabs() {
        const buttons = document.querySelectorAll('#menu-coletar-manutencao .painel-btn');
        const sections = document.querySelectorAll('.main-content .section');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                sections.forEach(s => s.classList.add('hidden'));

                btn.classList.add('active');
                const targetId = btn.getAttribute('data-secao');
                document.getElementById(targetId)?.classList.remove('hidden');
            });
        });
    },

    renderLegend() {
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        for (const h of headings) {
            if (h.textContent.includes('Manutenções Lançadas (Semana Atual)') || h.textContent.includes('Resultados da Busca')) {
                if (h.querySelector('.status-legend')) continue;

                const legend = document.createElement('span');
                legend.className = 'status-legend';
                legend.style.cssText = 'font-size: 0.65em; margin-left: 15px; font-weight: normal; vertical-align: middle; display: inline-flex; align-items: center;';
                
                legend.innerHTML = `
                    <span title="Manutenção concluída." style="cursor: help; display: inline-flex; align-items: center; margin-right: 12px;"><span style="display:inline-block; width: 12px; height: 12px; background-color: #d4edda; border: 1px solid #155724; margin-right: 4px;"></span><span style="color:#155724;">FINALIZADO</span></span>
                    <span title="Veículo sem direcionamento." style="cursor: help; display: inline-flex; align-items: center; margin-right: 12px;"><span style="display:inline-block; width: 12px; height: 12px; background-color: #f8d7da; border: 1px solid #721c24; margin-right: 4px;"></span><span style="color:#721c24;">PENDENTE</span></span>
                    <span title="Veículo está na oficina, necessitando de mais dias para reparo." style="cursor: help; display: inline-flex; align-items: center; margin-right: 12px;"><span style="display:inline-block; width: 12px; height: 12px; background-color: #cce5ff; border: 1px solid #004085; margin-right: 4px;"></span><span style="color:#004085;">INTERNADO</span></span>
                    <span title="Veículo deu entrada na oficina!" style="cursor: help; display: inline-flex; align-items: center; margin-right: 12px;"><span style="display:inline-block; width: 12px; height: 12px; background-color: #fff3cd; border: 1px solid #856404; margin-right: 4px;"></span><span style="color:#856404;">CHECK-IN OFICINA</span></span>
                    <span title="Veículo está em rota e deu entrada na oficina da região que está!" style="cursor: help; display: inline-flex; align-items: center;"><span style="display:inline-block; width: 12px; height: 12px; background-color: #ffe0b2; border: 1px solid #d35400; margin-right: 4px;"></span><span style="color:#d35400;">CHECK-IN ROTA</span></span>
                    <span title="Manutenção concluída em Rota." style="cursor: help; display: inline-flex; align-items: center; margin-right: 12px;"><span style="display:inline-block; width: 12px; height: 12px; background-color: #d4edda; border: 1px solid #0b3314; margin-right: 4px;"></span><span style="color:#0b3314; font-weight: bold;">FINALIZADO ROTA</span></span>
                `;
                
                h.appendChild(legend);
            }
        }
    },

    abrirModal() {
        this.editingId = null; // Reseta o ID de edição para criar um novo
        this.formColeta.reset();
        this.preencherDadosPadrao();
        this.carregarVeiculos();
        this.fixStatusOptions();
        // Limpa as cores de todos os selects de status no modal
        this.modal.querySelectorAll('.checklist-status').forEach(select => this.updateStatusColor(select));
        this.aplicarRestricoesDeNivelNoModal();
        this.modal.classList.remove('hidden');
    },

    updateStatusColor(selectElement) {
        if (!selectElement) return;
        // Remove todas as classes de status antes de adicionar a nova
        selectElement.classList.remove('status-ok', 'status-finalizado','status-finalizado-rota', 'status-nao-realizado', 'status-pendente', 'status-internado', 'status-checkin-oficina', 'status-checkin-rota');
        const status = selectElement.value.toUpperCase();

        if (status === 'FINALIZADO' || status === 'OK') {
            selectElement.classList.add('status-finalizado');
        } else if (status === 'FINALIZADO ROTA') {
            selectElement.classList.add('status-finalizado-rota');
        } else if (status === 'PENDENTE' || status === 'NAO REALIZADO' || status === 'NÃO REALIZADO') {
            selectElement.classList.add('status-pendente');
        } else if (status === 'INTERNADO') {
            selectElement.classList.add('status-internado');
        } else if (status === 'CHECK-IN OFICINA') {
            selectElement.classList.add('status-checkin-oficina');
        } else if (status === 'CHECK-IN ROTA') {
            selectElement.classList.add('status-checkin-rota');
        }
    },

    aplicarRestricoesDeNivelNoModal() {
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const nivel = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
        
        const allItems = this.modal.querySelectorAll('.checklist-item');
        allItems.forEach(item => item.style.display = 'block'); // Reset: mostra tudo por padrão
        
        const extraEletrica = document.getElementById('extra-eletrica-interna');
        if (extraEletrica) extraEletrica.style.display = '';

        if (nivel === 'moleiro') {
            allItems.forEach(item => { if (item.dataset.item !== 'MOLEIRO') item.style.display = 'none'; });
            if (extraEletrica) extraEletrica.style.display = 'none';
        } else if (nivel === 'mecanica_externa') {
            allItems.forEach(item => { if (item.dataset.item !== 'MECANICA EXTERNA') item.style.display = 'none'; });
            if (extraEletrica) extraEletrica.style.display = 'none';
        }
    },

    fecharModal() {
        this.modal.classList.add('hidden');
    },

    abrirModalImportacao() {
        this.formImportacao.reset();
        this.modalImportacao.classList.remove('hidden');
    },

    fecharModalImportacao() {
        this.modalImportacao.classList.add('hidden');
    },

    async handleImportacao(e) {
        e.preventDefault();
        const tipo = document.getElementById('tipoImportacao').value;
        const arquivo = document.getElementById('arquivoImportacao').files[0];
        const btnSubmit = this.formImportacao.querySelector('button[type="submit"]');
        
        if (!arquivo) return;

        try {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

            if (tipo === 'MOLEIRO') {
                await this.processarArquivoMoleiro(arquivo);
            } else if (tipo === 'MECANICA_EXTERNA') {
                await this.processarArquivoMecanicaExterna(arquivo);
            } else if (tipo === 'GERAL') {
                await this.processarArquivoGeral(arquivo);
            } else {
                throw new Error(`A importação para o tipo ${tipo} ainda não está implementada.`);
            }
            
            alert('Importação concluída com sucesso!');
            this.fecharModalImportacao();
            this.carregarLancamentos();
        } catch (error) {
            console.error('Erro na importação:', error);
            alert('Erro ao processar arquivo: ' + error.message);
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="fas fa-check"></i> Processar Arquivo';
        }
    },

    async processarArquivoMoleiro(arquivo) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                    if (jsonData.length === 0) throw new Error('Arquivo vazio ou formato inválido.');

                    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';
                    
                    // Processamento sequencial para garantir integridade
                    for (const row of jsonData) {
                        // Normaliza as chaves para maiúsculo para evitar erros de case sensitive
                        const rowNormalized = {};
                        Object.keys(row).forEach(key => {
                            rowNormalized[key.toUpperCase().trim()] = row[key];
                        });

                        // Campos: ID_MEC, DATA, PLACA, MODELO, DESCRICAO
                        const dataRaw = rowNormalized['DATA'];
                        let dataHora;
                        
                        // Tratamento de data
                        if (dataRaw instanceof Date) {
                            dataHora = dataRaw;
                        } else if (typeof dataRaw === 'string') {
                            // Tenta converter string DD/MM/YYYY
                            const parts = dataRaw.split('/');
                            if (parts.length === 3) {
                                dataHora = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
                            } else {
                                dataHora = new Date(); // Fallback
                            }
                        } else {
                            dataHora = new Date();
                        }

                        const semana = this.calculateCurrentWeek(dataHora);
                        const placa = (rowNormalized['PLACA'] || 'SEM PLACA').toUpperCase();
                        const modelo = rowNormalized['MODELO'] || '';
                        const descricao = (rowNormalized['DESCRICAO'] || '').toUpperCase(); // Descrição em MAIÚSCULAS

                        // 1. Inserir Cabeçalho (Coleta)
                        const { data: coleta, error: errColeta } = await supabaseClient
                            .from('coletas_manutencao')
                            .insert([{
                                semana: semana,
                                data_hora: dataHora.toISOString(),
                                usuario: usuarioLogado,
                                placa: placa,
                                modelo: modelo,
                                km: 0 // Valor padrão pois não vem no arquivo
                            }])
                            .select()
                            .single();

                        if (errColeta) throw errColeta;

                        // 2. Inserir Item (Checklist) - MOLEIRO
                        const { error: errItem } = await supabaseClient
                            .from('coletas_manutencao_checklist')
                            .insert([{
                                coleta_id: coleta.id,
                                item: 'MOLEIRO',
                                status: 'PENDENTE', // Status fixo conforme solicitado
                                detalhes: descricao
                            }]);

                        if (errItem) throw errItem;
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(arquivo);
        });
    },

    async processarArquivoMecanicaExterna(arquivo) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                    if (jsonData.length === 0) throw new Error('Arquivo vazio ou formato inválido.');

                    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';
                    
                    for (const row of jsonData) {
                        const rowNormalized = {};
                        Object.keys(row).forEach(key => {
                            rowNormalized[key.toUpperCase().trim()] = row[key];
                        });

                        // Campos: ID_MEC, DATA, PLACA, MODELO, DESCRICAO, OBSERVACAO
                        const dataRaw = rowNormalized['DATA'];
                        let dataHora;
                        
                        if (dataRaw instanceof Date) {
                            dataHora = dataRaw;
                        } else if (typeof dataRaw === 'string') {
                            const parts = dataRaw.split('/');
                            if (parts.length === 3) {
                                dataHora = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
                            } else {
                                dataHora = new Date();
                            }
                        } else {
                            dataHora = new Date();
                        }

                        const semana = this.calculateCurrentWeek(dataHora);
                        const placa = (rowNormalized['PLACA'] || 'SEM PLACA').toUpperCase();
                        const modelo = rowNormalized['MODELO'] || '';
                        
                        const descricao = (rowNormalized['DESCRICAO'] || '').toUpperCase();
                        const observacao = (rowNormalized['OBSERVACAO'] || '').toUpperCase();
                        
                        // Concatena Descrição e Observação
                        let detalhes = descricao;
                        if (observacao) {
                            detalhes += `, ${observacao}`;
                        }

                        // 1. Inserir Cabeçalho (Coleta)
                        const { data: coleta, error: errColeta } = await supabaseClient
                            .from('coletas_manutencao')
                            .insert([{
                                semana: semana,
                                data_hora: dataHora.toISOString(),
                                usuario: usuarioLogado,
                                placa: placa,
                                modelo: modelo,
                                km: 0
                            }])
                            .select()
                            .single();

                        if (errColeta) throw errColeta;

                        // 2. Inserir Item (Checklist) - MECANICA EXTERNA
                        const { error: errItem } = await supabaseClient
                            .from('coletas_manutencao_checklist')
                            .insert([{
                                coleta_id: coleta.id,
                                item: 'MECANICA EXTERNA',
                                status: 'PENDENTE',
                                detalhes: detalhes
                            }]);

                        if (errItem) throw errItem;
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(arquivo);
        });
    },

    async processarArquivoGeral(arquivo) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                    if (jsonData.length === 0) throw new Error('Arquivo vazio ou formato inválido.');

                    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';

                    // Mapeamento de colunas do Excel para Itens do Banco de Dados
                    // Chave: Nome da coluna no Excel (normalizado upper/trim), Valor: Nome do item no Banco
                    const mapItens = {
                        'ACESSORIOS': 'ACESSORIOS',
                        'ALINHAMENTO / BALANCEAMENTO': 'ALINHAMENTO/BALANCEAMENTO',
                        'AR-CONDICIONADO': 'AR-CONDICIONADO',
                        'BORRACHARIA': 'BORRACHARIA',
                        'MECANICA EXTERNA': 'MECANICA EXTERNA',
                        'MOLEIRO': 'MOLEIRO',
                        'TACOGRAFO': 'TACOGRAFO',
                        'TAPEÇARIA': 'TAPEÇARIA',
                        'THERMO KING': 'THERMO KING',
                        'VIDROS / FECHADURAS': 'VIDROS / FECHADURAS',
                        'SERVIÇOS_GERAIS': 'SERVIÇOS_GERAIS',
                        'CONCESSIONARIA': 'CONCESSIONARIA',
                        'ANKA': 'ANKA',
                        'TARRAXA': 'TARRAXA',
                        'USIMAC': 'USIMAC',
                        'LUCAS BAU': 'LUCAS BAU',
                        'IBIFURGO': 'IBIFURGO',
                        'IBIPORAN': 'IBIPORAN'
                    };

                    for (const row of jsonData) {
                        const rowNormalized = {};
                        Object.keys(row).forEach(key => {
                            rowNormalized[key.toUpperCase().trim()] = row[key];
                        });

                        // 1. Dados do Cabeçalho
                        const dataRaw = rowNormalized['DATA'];
                        let dataHora;
                        if (dataRaw instanceof Date) {
                            dataHora = dataRaw;
                        } else if (typeof dataRaw === 'string') {
                            const parts = dataRaw.split('/');
                            if (parts.length === 3) {
                                dataHora = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
                            } else {
                                dataHora = new Date();
                            }
                        } else {
                            dataHora = new Date();
                        }

                        const semana = rowNormalized['SEMANA'] || this.calculateCurrentWeek(dataHora);
                        const placa = (rowNormalized['PLACA'] || 'SEM PLACA').toUpperCase();
                        const modelo = rowNormalized['MODELO'] || '';
                        const km = parseInt(rowNormalized['KM']) || 0;

                        // Inserir Cabeçalho (Coleta)
                        const { data: coleta, error: errColeta } = await supabaseClient
                            .from('coletas_manutencao')
                            .insert([{
                                semana: semana,
                                data_hora: dataHora.toISOString(),
                                usuario: usuarioLogado,
                                placa: placa,
                                modelo: modelo,
                                km: km
                            }])
                            .select()
                            .single();

                        if (errColeta) throw errColeta;

                        const checklistItems = [];

                        // 2. Processar Item Especial: ELETRICA INTERNA
                        // Colunas: ELETRICA INTERNA (desc), STATUS (bool/string), PECA
                        const descEletrica = rowNormalized['ELETRICA INTERNA'];
                        const statusEletricaRaw = rowNormalized['STATUS'];
                        const pecaEletrica = rowNormalized['PECA'];

                        if (descEletrica || statusEletricaRaw !== undefined || pecaEletrica) {
                            let statusEletrica = 'PENDENTE';
                            // Verifica se é TRUE (Excel bool) ou string "TRUE"/"OK"
                            if (statusEletricaRaw === true || String(statusEletricaRaw).toUpperCase() === 'TRUE' || String(statusEletricaRaw).toUpperCase() === 'OK') {
                                statusEletrica = 'FINALIZADO';
                            }

                            checklistItems.push({
                                coleta_id: coleta.id,
                                item: 'ELETRICA INTERNA',
                                status: statusEletrica,
                                detalhes: String(descEletrica || '').toUpperCase(),
                                pecas_usadas: pecaEletrica ? String(pecaEletrica).toUpperCase() : null
                            });
                        }

                        // 3. Processar Outros Itens (Padrão: Se tem texto, é NAO REALIZADO com detalhes)
                        for (const [colExcel, itemDb] of Object.entries(mapItens)) {
                            const valorCelula = rowNormalized[colExcel];
                            if (valorCelula) {
                                checklistItems.push({
                                    coleta_id: coleta.id,
                                    item: itemDb,
                                    status: 'PENDENTE',
                                    detalhes: String(valorCelula).toUpperCase()
                                });
                            }
                        }

                        if (checklistItems.length > 0) {
                            const { error: errItems } = await supabaseClient
                                .from('coletas_manutencao_checklist')
                                .insert(checklistItems);
                            if (errItems) throw errItems;
                        }
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(arquivo);
        });
    },

    preencherDadosPadrao() {
        // Preenche data e hora
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        this.coletaDataHoraInput.value = now.toISOString().slice(0, 16);

        // Preenche usuário
        const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
        if (usuario && usuario.nome) {
            this.coletaUsuarioInput.value = usuario.nome;
        }

        // Preenche Semana (Calculada a partir de 28/12/2025)
        const semana = this.calculateCurrentWeek();
        const semanaInput = document.getElementById('coletaSemana');
        if (semanaInput) {
            semanaInput.value = semana;
        }
    },

    calculateCurrentWeek(dateObj = new Date()) {
        const startDate = new Date('2025-12-28T00:00:00');
        const diffInMs = dateObj.getTime() - startDate.getTime();
        const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
        
        let weekNumber = Math.floor(diffInDays / 7) + 1;
        if (weekNumber < 1) weekNumber = 1; // Garante que não seja menor que 1
        return String(weekNumber).padStart(2, ''); //Começa semana sem o zero
    },

    async carregarVeiculos() {
        try {
            const { data, error } = await supabaseClient
                .from('veiculos')
                .select('placa, modelo')
                .order('placa');
            if (error) throw error;

            this.veiculosList.innerHTML = '';
            this.veiculosData = data; // Armazena para uso posterior
            data.forEach(veiculo => {
                const option = document.createElement('option');
                option.value = veiculo.placa;
                option.textContent = veiculo.modelo;
                this.veiculosList.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar veículos:', error);
        }
    },

    preencherModeloVeiculo() {
        const placaSelecionada = this.coletaPlacaInput.value;
        const veiculo = this.veiculosData.find(v => v.placa === placaSelecionada);
        if (veiculo) {
            this.coletaModeloInput.value = veiculo.modelo;
        } else {
            this.coletaModeloInput.value = '';
        }
    },

    async registrarColeta(e) {
        e.preventDefault();
        
        const semana = document.getElementById('coletaSemana').value;
        const dataHoraInput = document.getElementById('coletaDataHora').value;
        if (!dataHoraInput) return alert("Por favor, preencha a data e hora.");
        const dataHora = new Date(dataHoraInput).toISOString();
        const usuario = document.getElementById('coletaUsuario').value;
        const placa = document.getElementById('coletaPlaca').value.trim().toUpperCase();
        const modelo = document.getElementById('coletaModelo').value;
        const km = document.getElementById('coletaKm').value;

        // Validação de duplicidade visual na grid atual
        if (!this.editingId) { // Só valida duplicidade se for novo registro
            const duplicado = Array.from(this.tableBodyLancamentos.querySelectorAll('tr td:nth-child(3)'))
                .some(td => td.textContent === placa);
                
            if (duplicado) {
                if (!confirm(`⚠️ ATENÇÃO: A placa ${placa} já consta na lista de lançamentos abaixo. Deseja incluir as informações e atualizar?`)) {
                    return;
                }
            }
        }

        const checklistItems = [];
        document.querySelectorAll('.checklist-item').forEach(item => {
            const nomeItem = item.dataset.item;
            const detalhes = item.querySelector('.checklist-details').value.trim().toUpperCase();
            let status = item.querySelector('.checklist-status').value;
            let pecasUsadas = null;

            // Captura peças usadas se for Elétrica Interna e estiver visível
            if (nomeItem === 'ELETRICA INTERNA') {
                const extraInput = document.getElementById('extra-eletrica-interna').querySelector('input');
                if (!document.getElementById('extra-eletrica-interna').classList.contains('hidden')) {
                    pecasUsadas = extraInput.value;
                }
            }

            // Regra: Se a descrição estiver vazia, força o status para vazio.
            // Isso garante que o item seja filtrado abaixo e removido do banco (não aparecerá na busca).
            if (detalhes === "") {
                status = "";
            }
            
            checklistItems.push({
                item: nomeItem, detalhes, status, pecas_usadas: pecasUsadas
            });
        });

        // Filtra apenas itens que foram preenchidos (status ou detalhes)
        const itemsToProcess = checklistItems.filter(i => i.status !== "" || i.detalhes !== "");

        if (itemsToProcess.length === 0 && !this.editingId) {
            alert('Preencha pelo menos um item do checklist.');
            return;
        }

        try {
            if (this.editingId) {
                // --- MODO EDIÇÃO (Mantido igual) ---
                const { error: updateError } = await supabaseClient
                    .from('coletas_manutencao')
                    .update({
                        semana,
                        data_hora: dataHora,
                        usuario,
                        placa,
                        modelo,
                        km: parseInt(km)
                    })
                    .eq('id', this.editingId);

                if (updateError) throw updateError;
                
                // Remove itens antigos do checklist para inserir os novos
                await supabaseClient.from('coletas_manutencao_checklist').delete().eq('coleta_id', this.editingId);
                
                const checklistPayload = checklistItems.map(i => ({
                    coleta_id: this.editingId,
                    item: i.item,
                    detalhes: i.detalhes,
                    status: i.status, // Permite salvar vazio se selecionado
                    pecas_usadas: i.pecas_usadas
                })).filter(i => i.status !== "" || i.detalhes !== ""); // Salva apenas preenchidos

                if (checklistPayload.length > 0) {
                    const { error: checklistError } = await supabaseClient
                        .from('coletas_manutencao_checklist')
                        .insert(checklistPayload);
                    if (checklistError) throw checklistError;
                }

            } else {
                // --- MODO INSERÇÃO INTELIGENTE ---
                
                // 1. Buscar cabeçalhos existentes para essa Placa e Semana
                const { data: existingHeaders, error: fetchError } = await supabaseClient
                    .from('coletas_manutencao')
                    .select('*, coletas_manutencao_checklist(*)')
                    .eq('placa', placa)
                    .eq('semana', semana)
                    .order('data_hora', { ascending: false });

                if (fetchError) throw fetchError;

                if (!existingHeaders || existingHeaders.length === 0) {
                    // NENHUM REGISTRO EXISTENTE: Cria novo cabeçalho e insere itens
                    const { data: coleta, error: coletaError } = await supabaseClient
                        .from('coletas_manutencao')
                        .insert([{
                            semana, data_hora: dataHora, usuario, placa, modelo, km: parseInt(km)
                        }])
                        .select()
                        .single();

                    if (coletaError) throw coletaError;

                    const checklistPayload = itemsToProcess.map(i => ({
                        coleta_id: coleta.id,
                        item: i.item,
                        detalhes: i.detalhes,
                        status: i.status, // Permite salvar vazio
                        pecas_usadas: i.pecas_usadas
                    }));

                    const { error: checklistError } = await supabaseClient
                        .from('coletas_manutencao_checklist')
                        .insert(checklistPayload);

                    if (checklistError) throw checklistError;

                } else {
                    // REGISTROS EXISTENTES: Lógica de Merge/Novo
                    const latestHeader = existingHeaders[0];
                    const headersToUpdate = new Set();
                    const itemsToInsertInLatest = [];
                    const updatesToPerform = [];

                    for (const formItem of itemsToProcess) {
                        const statusItem = formItem.status; // Permite salvar vazio
                        
                        // 1. Tenta encontrar item existente em qualquer header existente da semana (independente do status)
                        let match = null;
                        let matchHeaderId = null;

                        for (const h of existingHeaders) {
                            const found = h.coletas_manutencao_checklist.find(i => i.item === formItem.item);
                            if (found) {
                                match = found;
                                matchHeaderId = h.id;
                                break;
                            }
                        }

                        if (match) {
                            // ATUALIZAR EXISTENTE
                            let newDetails = match.detalhes || '';
                            if (formItem.detalhes) {
                                if (newDetails && newDetails.trim() !== '') {
                                    newDetails = `${newDetails}, ${formItem.detalhes}`;
                                } else {
                                    newDetails = formItem.detalhes;
                                }
                            }
                            
                            updatesToPerform.push({
                                id: match.id,
                                detalhes: newDetails,
                                status: statusItem, // Atualiza status (ex: para OK)
                                pecas_usadas: formItem.pecas_usadas || match.pecas_usadas
                            });
                            headersToUpdate.add(matchHeaderId);
                        } else {
                            // Não existe no header recente -> INSERIR no header recente
                            itemsToInsertInLatest.push({ ...formItem, status: statusItem });
                            headersToUpdate.add(latestHeader.id);
                        }
                    }

                    // Executar Operações
                    
                    // A. Updates de Itens
                    for (const up of updatesToPerform) {
                        await supabaseClient.from('coletas_manutencao_checklist')
                            .update({ detalhes: up.detalhes, status: up.status, pecas_usadas: up.pecas_usadas })
                            .eq('id', up.id);
                    }

                    // B. Inserts no Header Recente
                    if (itemsToInsertInLatest.length > 0) {
                        const payload = itemsToInsertInLatest.map(i => ({
                            coleta_id: latestHeader.id,
                            item: i.item,
                            detalhes: i.detalhes,
                            status: i.status,
                            pecas_usadas: i.pecas_usadas
                        }));
                        await supabaseClient.from('coletas_manutencao_checklist').insert(payload);
                    }

                    // C. Atualizar Headers (Data/Usuário)
                    if (headersToUpdate.size > 0) {
                        await supabaseClient.from('coletas_manutencao')
                            .update({ data_hora: dataHora, usuario: usuario })
                            .in('id', Array.from(headersToUpdate));
                    }
                }
            };

            alert(`✅ Coleta ${this.editingId ? 'atualizada' : 'registrada'} com sucesso!`);
            this.fecharModal();
            this.carregarLancamentos(); // Atualiza a grid
            
            // Se a aba de relatório estiver visível, atualiza ela também
            if (!document.getElementById('sectionGerarArquivo').classList.contains('hidden')) {
                this.buscarRelatorio();
            }

        } catch (err) {
            console.error('Erro ao salvar coleta:', err);
            alert('Erro ao salvar coleta: ' + err.message);
        }
    },

    async carregarLancamentos() {
        if (!this.tableBodyLancamentos) return;
        this.tableBodyLancamentos.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
        try {
            const searchPlaca = this.searchPlacaInput?.value.trim().toUpperCase();
            const searchItem = this.searchItemInput?.value;
            const searchStatus = this.searchStatusInput?.value;
            
            // Verifica nível do usuário para filtro automático
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            const nivel = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
            let roleFilterItem = null;
            if (nivel === 'moleiro') roleFilterItem = 'MOLEIRO';
            if (nivel === 'mecanica_externa') roleFilterItem = 'MECANICA EXTERNA';

            let data = [];

            // 1. Query principal na tabela pai (coletas_manutencao)
            let query = supabaseClient
                .from('coletas_manutencao')
                .select('*');

            if (searchPlaca) {
                query = query.ilike('placa', `%${searchPlaca}%`);
            }

            // Se houver filtros de item/status (filhos), precisamos filtrar os IDs primeiro
            if (searchItem || searchStatus || roleFilterItem) {
                let idQuery = supabaseClient
                    .from('coletas_manutencao_checklist')
                    .select('coleta_id');

                if (searchItem) idQuery = idQuery.eq('item', searchItem);
                if (searchStatus) idQuery = idQuery.eq('status', searchStatus);
                if (roleFilterItem) idQuery = idQuery.eq('item', roleFilterItem);

                const { data: idData, error: idError } = await idQuery;
                if (idError) throw idError;

                const matchingIds = [...new Set(idData.map(item => item.coleta_id))];

                if (matchingIds.length === 0) {
                    this.tableBodyLancamentos.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum lançamento encontrado para os filtros.</td></tr>';
                    return;
                }
                
                query = query.in('id', matchingIds);
            }

            // Ordenação e Limite na tabela pai (evita timeout)
            query = query.order(this.currentSort.column, { ascending: this.currentSort.direction === 'asc' });
            query = query.limit(200);

            const { data: coletas, error: errorColetas } = await query;
            if (errorColetas) throw errorColetas;

            if (!coletas || coletas.length === 0) {
                this.tableBodyLancamentos.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum lançamento encontrado.</td></tr>';
                return;
            }

            // 2. Buscar checklists relacionados apenas para as coletas carregadas
            const coletaIds = coletas.map(c => c.id);
            const { data: checklists, error: errorChecklist } = await supabaseClient
                .from('coletas_manutencao_checklist')
                .select('coleta_id, status, item')
                .in('coleta_id', coletaIds);

            if (errorChecklist) throw errorChecklist;

            // 3. Combinar dados (Associa checklists às coletas)
            data = coletas.map(coleta => {
                coleta.coletas_manutencao_checklist = checklists.filter(ch => ch.coleta_id === coleta.id);
                return coleta;
            });

            this.tableBodyLancamentos.innerHTML = '';

            // Verifica permissão para excluir
            const podeExcluir = !['mecanica_externa', 'mecanica_interna', 'moleiro'].includes(nivel);

            // --- NOVA LÓGICA: Filtrar apenas a última atualização por placa ---
            const ultimosLancamentos = [];
            const placasProcessadas = new Set();

            // Ordena temporariamente por data decrescente para pegar o mais recente
            const dadosOrdenadosPorData = [...data].sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));

            for (const item of dadosOrdenadosPorData) {
                if (!placasProcessadas.has(item.placa)) {
                    placasProcessadas.add(item.placa);
                    ultimosLancamentos.push(item);
                }
            }

            // Reordena conforme a seleção do usuário (ou padrão) para exibição
            ultimosLancamentos.sort((a, b) => {
                const col = this.currentSort.column;
                const dir = this.currentSort.direction === 'asc' ? 1 : -1;
                let valA = a[col];
                let valB = b[col];
                
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return -1 * dir;
                if (valA > valB) return 1 * dir;
                return 0;
            });

            ultimosLancamentos.forEach(item => {
                const tr = document.createElement('tr');

                // Lógica de status geral para colorir a linha
                let checklist = item.coletas_manutencao_checklist || [];
                
                if (roleFilterItem) {
                    checklist = checklist.filter(i => i.item === roleFilterItem);
                }

                let generalStatus = 'NONE';

                if (checklist.length > 0) {
                    const hasNaoRealizado = checklist.some(i => i.status === 'PENDENTE' || i.status === 'NAO REALIZADO' || i.status === 'NÃO REALIZADO');
                    const hasInternado = checklist.some(i => i.status === 'INTERNADO');
                    const hasCheckinOficina = checklist.some(i => i.status === 'CHECK-IN OFICINA');
                    const hasCheckinRota = checklist.some(i => i.status === 'CHECK-IN ROTA');
                    const hasFinalizadoRota = checklist.some(i => i.status === 'FINALIZADO ROTA');
                    // Para ser 'OK', todos os itens devem ser 'OK'.
                    const allOk = checklist.every(i => i.status === 'FINALIZADO' || i.status === 'OK' || i.status === 'FINALIZADO ROTA');

                    if (hasNaoRealizado) {
                        generalStatus = 'PENDENTE';
                    } else if (hasInternado) {
                        generalStatus = 'INTERNADO';
                    } else if (hasCheckinOficina) {
                        generalStatus = 'CHECK-IN OFICINA';
                    } else if (hasCheckinRota) {
                        generalStatus = 'CHECK-IN ROTA';
                    } else if (allOk) {
                        if (hasFinalizadoRota) {
                            generalStatus = 'FINALIZADO ROTA';
                        } else {
                            generalStatus = 'FINALIZADO';
                        }
                    }
                }

                if (generalStatus === 'FINALIZADO' || generalStatus === 'OK') {
                    tr.style.backgroundColor = '#d4edda'; // Verde claro
                    tr.style.color = '#155724';
                } else if (generalStatus === 'FINALIZADO ROTA') {
                    tr.style.backgroundColor = '#d4edda'; // Verde claro
                    tr.style.color = '#006400'; // Verde Escuro
                    tr.style.fontWeight = 'bold';
                } else if (generalStatus === 'PENDENTE') {
                    tr.style.backgroundColor = '#f8d7da'; // Vermelho claro
                    tr.style.color = '#721c24';
                } else if (generalStatus === 'INTERNADO') {
                    tr.style.backgroundColor = '#cce5ff'; // Azul claro
                    tr.style.color = '#004085';
                } else if (generalStatus === 'CHECK-IN OFICINA') {
                    tr.style.backgroundColor = '#fff3cd'; // Amarelo claro
                    tr.style.color = '#856404';
                } else if (generalStatus === 'CHECK-IN ROTA') {
                    tr.style.backgroundColor = '#ffe0b2'; // Laranja claro
                    tr.style.color = '#d35400';
                }

                let botoesAcao = `<button class="btn-action btn-edit" data-id="${item.id}" title="Editar"><i class="fas fa-pen"></i></button>`;
                if (podeExcluir) {
                    botoesAcao += `\n                        <button class="btn-action btn-delete" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>`;
                }

                tr.innerHTML = `
                    <td>${new Date(item.data_hora).toLocaleString('pt-BR')}</td>
                    <td>${item.semana}</td>
                    <td>${item.placa}</td>
                    <td>${item.usuario}</td>
                    <td>
                        ${botoesAcao}
                    </td>
                `;
                this.tableBodyLancamentos.appendChild(tr);
            });
        } catch (err) {
            console.error('Erro ao carregar lançamentos:', err);
            this.tableBodyLancamentos.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        }
    },

    handleSort(column) {
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'asc';
        }
        this.updateSortIcons();
        this.carregarLancamentos();
    },

    updateSortIcons() {
        document.querySelectorAll('#sectionLancamento th[data-sort] i').forEach(icon => {
            icon.className = 'fas fa-sort'; // Reset
            const th = icon.closest('th');
            if (th.dataset.sort === this.currentSort.column) {
                icon.className = this.currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    async editarColeta(id) {
        try {
            // 1. Buscar dados do cabeçalho
            const { data: coleta, error: coletaError } = await supabaseClient
                .from('coletas_manutencao')
                .select('*')
                .eq('id', id)
                .single();
            
            if (coletaError) throw coletaError;

            // 2. Buscar itens do checklist
            const { data: checklist, error: checklistError } = await supabaseClient
                .from('coletas_manutencao_checklist')
                .select('*')
                .eq('coleta_id', id);

            if (checklistError) throw checklistError;

            // 3. Preencher o formulário
            this.editingId = id;
            document.getElementById('coletaSemana').value = coleta.semana;
            
            // Ajuste de fuso horário para o input datetime-local
            const date = new Date(coleta.data_hora);
            date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
            document.getElementById('coletaDataHora').value = date.toISOString().slice(0, 16);
            
            document.getElementById('coletaUsuario').value = coleta.usuario;
            document.getElementById('coletaPlaca').value = coleta.placa;
            document.getElementById('coletaModelo').value = coleta.modelo;
            document.getElementById('coletaKm').value = coleta.km;

            // 4. Preencher o checklist
            // Primeiro limpa tudo
            document.querySelectorAll('.checklist-item').forEach(div => {
                const statusSelect = div.querySelector('.checklist-status');
                div.querySelector('.checklist-details').value = '';
                statusSelect.value = '';
                this.updateStatusColor(statusSelect); // Reseta a cor
            });
            // Limpa campo extra
            const extraField = document.getElementById('extra-eletrica-interna');
            extraField.classList.add('hidden');
            extraField.querySelector('input').value = '';

            // Depois preenche com o que veio do banco
            checklist.forEach(item => {
                const div = document.querySelector(`.checklist-item[data-item="${item.item}"]`);
                if (div) {
                    const statusSelect = div.querySelector('.checklist-status');
                    div.querySelector('.checklist-details').value = item.detalhes || '';
                    
                    // Ajuste para compatibilidade com registros antigos
                    let statusValue = item.status || '';
                    if (statusValue === 'NAO REALIZADO' || statusValue === 'NÃO REALIZADO') {
                        statusValue = 'PENDENTE';
                    }
                    if (statusValue === 'OK') {
                        statusValue = 'FINALIZADO';
                    }
                    statusSelect.value = statusValue;
                    this.updateStatusColor(statusSelect); // Define a cor ao carregar

                    // Lógica específica para preencher Elétrica Interna
                    if (item.item === 'ELETRICA INTERNA' && (statusValue === 'FINALIZADO' || statusValue === 'OK')) {
                        extraField.classList.remove('hidden');
                        extraField.querySelector('input').value = item.pecas_usadas || '';
                    }
                }
            });

            this.aplicarRestricoesDeNivelNoModal();
            this.modal.classList.remove('hidden');
        } catch (err) {
            console.error('Erro ao carregar para edição:', err);
            alert('Erro ao carregar dados: ' + err.message);
        }
    },

    async excluirColeta(id) {
        if (!confirm('Deseja realmente excluir este lançamento?')) return;
        try {
            // Supabase deve estar configurado com ON DELETE CASCADE, mas por segurança deletamos os itens primeiro se necessário
            await supabaseClient.from('coletas_manutencao_checklist').delete().eq('coleta_id', id);
            
            const { error } = await supabaseClient.from('coletas_manutencao').delete().eq('id', id);
            if (error) throw error;
            
            this.carregarLancamentos();

            // Se a aba de relatório estiver visível, atualiza ela também
            if (!document.getElementById('sectionGerarArquivo').classList.contains('hidden')) {
                this.buscarRelatorio();
            }
        } catch (err) {
            alert('Erro ao excluir: ' + err.message);
        }
    },

    async buscarRelatorio() {
        if (!this.tableBodyRelatorio) return;
        this.tableBodyRelatorio.innerHTML = '<tr><td colspan="9" class="text-center">Buscando...</td></tr>';
        
        try {
            // Busca na tabela de checklist fazendo join com a tabela pai (coletas_manutencao)
            // O !inner força que o registro pai exista e obedeça aos filtros aplicados nele
            let query = supabaseClient
                .from('coletas_manutencao_checklist')
                .select('*, coletas_manutencao!inner(*)');

            // Filtro automático por nível
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            const nivel = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
            if (nivel === 'moleiro') query = query.eq('item', 'MOLEIRO');
            if (nivel === 'mecanica_externa') query = query.eq('item', 'MECANICA EXTERNA');

            // Filtros do Checklist (Multi-Select)
            const selectedItems = Array.from(this.filtroItemOptions.querySelectorAll('.filtro-item-checkbox:checked')).map(cb => cb.value);
            if (selectedItems.length > 0) {
                query = query.in('item', selectedItems);
            }

            const selectedStatus = Array.from(this.filtroStatusOptions.querySelectorAll('.filtro-status-checkbox:checked')).map(cb => cb.value);
            if (selectedStatus.length > 0) {
                query = query.in('status', selectedStatus);
            }
            
            // Filtros da Coleta (Pai)
            if (this.filtroSemana.value) query = query.eq('coletas_manutencao.semana', this.filtroSemana.value);
            if (this.filtroPlaca && this.filtroPlaca.value) query = query.ilike('coletas_manutencao.placa', `%${this.filtroPlaca.value.trim().toUpperCase()}%`);
            if (this.filtroDataIni.value) query = query.gte('coletas_manutencao.data_hora', this.filtroDataIni.value + 'T00:00:00');
            if (this.filtroDataFim.value) query = query.lte('coletas_manutencao.data_hora', this.filtroDataFim.value + 'T23:59:59');

            const { data, error } = await query;
            if (error) throw error;

            // Atualiza contador
            if (this.contadorResultados) this.contadorResultados.textContent = `(${data ? data.length : 0})`;

            this.tableBodyRelatorio.innerHTML = '';
            if (!data || data.length === 0) {
                this.tableBodyRelatorio.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum registro encontrado.</td></tr>';
                if (this.graficosContainer) this.graficosContainer.style.display = 'none';
                return;
            }

            this.reportData = data;
            this.renderRelatorio();
            this.renderizarGraficos();

        } catch (err) {
            console.error('Erro ao buscar relatório:', err);
            this.tableBodyRelatorio.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro ao buscar dados.</td></tr>';
        }
    },

    renderRelatorio() {
        if (!this.tableBodyRelatorio) return;
        this.tableBodyRelatorio.innerHTML = '';
        
        // Ordenação
        const col = this.currentReportSort.column;
        const dir = this.currentReportSort.direction === 'asc' ? 1 : -1;

        this.reportData.sort((a, b) => {
            let valA, valB;

            // Mapeamento de campos (alguns estão no objeto pai 'coletas_manutencao')
            if (col === 'data_hora') {
                valA = new Date(a.coletas_manutencao.data_hora);
                valB = new Date(b.coletas_manutencao.data_hora);
            } else if (['semana', 'placa', 'modelo'].includes(col)) {
                valA = a.coletas_manutencao[col];
                valB = b.coletas_manutencao[col];
            } else {
                valA = a[col] || '';
                valB = b[col] || '';
            }

            if (valA < valB) return -1 * dir;
            if (valA > valB) return 1 * dir;
            return 0;
        });

        // Verifica permissão para excluir
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const nivelUsuario = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
        const podeExcluir = !['mecanica_externa', 'mecanica_interna', 'moleiro'].includes(nivelUsuario);

        this.reportData.forEach(item => {
                const coleta = item.coletas_manutencao;
                const tr = document.createElement('tr');
                // Lógica de cores para a linha inteira baseada no Status
                const statusUpper = item.status ? item.status.toUpperCase() : '';
                
                if (statusUpper === 'FINALIZADO' || statusUpper === 'OK') {
                    tr.style.backgroundColor = '#d4edda'; // Verde claro
                    tr.style.color = '#155724';
                } else if (statusUpper === 'FINALIZADO ROTA') {
                    tr.style.backgroundColor = '#d4edda'; // Verde claro
                    tr.style.color = '#006400'; // Verde Escuro
                    tr.style.fontWeight = 'bold';
                } else if (statusUpper === 'PENDENTE' || statusUpper === 'NAO REALIZADO' || statusUpper === 'NÃO REALIZADO') {
                    tr.style.backgroundColor = '#f8d7da'; // Vermelho claro
                    tr.style.color = '#721c24';
                } else if (statusUpper === 'INTERNADO') {
                    tr.style.backgroundColor = '#cce5ff'; // Azul claro
                    tr.style.color = '#004085';
                } else if (statusUpper === 'CHECK-IN OFICINA') {
                    tr.style.backgroundColor = '#fff3cd'; // Amarelo claro
                    tr.style.color = '#856404';
                } else if (statusUpper === 'CHECK-IN ROTA') {
                    tr.style.backgroundColor = '#ffe0b2'; // Laranja claro
                    tr.style.color = '#d35400';
                }

                let botoesAcao = `<button class="btn-action btn-edit" data-id="${coleta.id}" title="Editar"><i class="fas fa-pen"></i></button>`;
                if (podeExcluir) {
                    botoesAcao += `\n                        <button class="btn-action btn-delete" data-id="${coleta.id}" title="Excluir"><i class="fas fa-trash"></i></button>`;
                }

                tr.innerHTML = `
                    <td>${new Date(coleta.data_hora).toLocaleString('pt-BR')}</td>
                    <td>${coleta.semana}</td>
                    <td>${coleta.placa}</td>
                    <td>${coleta.modelo || '-'}</td>
                    <td>${item.item}</td>
                    <td>${item.status}</td>
                    <td>${item.detalhes || '-'}</td>
                    <td>${item.pecas_usadas || '-'}</td>
                    <td>
                        ${botoesAcao}
                    </td>
                `;
                this.tableBodyRelatorio.appendChild(tr);
            });
        
        this.updateReportSortIcons();
    },

    renderizarGraficos() {
        if (!this.reportData || this.reportData.length === 0) {
            if (this.graficosContainer) this.graficosContainer.style.display = 'none';
            return;
        }

        if (this.graficosContainer) this.graficosContainer.style.display = 'block';

        // 1. Preparar dados para Gráfico de Status
        const statusCounts = {};
        this.reportData.forEach(row => {
            const status = row.status || 'N/A';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        // Cores para os status
        const statusColors = {
            'FINALIZADO': '#28a745',
            'OK': '#28a745', // Mantido para compatibilidade
            'PENDENTE': '#dc3545',
            'NAO REALIZADO': '#dc3545', // Mantido para compatibilidade
            'INTERNADO': '#ffc107',
            'CHECK-IN OFICINA': '#ffc107', // Amarelo
            'CHECK-IN ROTA': '#fd7e14', // Laranja
            'N/A': '#6c757d'
        };
        const bgColorsStatus = Object.keys(statusCounts).map(s => statusColors[s] || '#17a2b8');

        // 2. Preparar dados para Gráfico de Itens
        const itemCounts = {};
        this.reportData.forEach(row => {
            const item = row.item || 'Outros';
            itemCounts[item] = (itemCounts[item] || 0) + 1;
        });

        // Destruir gráficos existentes se houver
        if (this.chartStatus) this.chartStatus.destroy();
        if (this.chartItems) this.chartItems.destroy();

        // Renderizar Gráfico de Status (Pizza)
        const ctxStatus = document.getElementById('grafico-status').getContext('2d');
        this.chartStatus = new Chart(ctxStatus, {
            type: 'pie',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: bgColorsStatus,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });

        // Renderizar Gráfico de Itens (Barras)
        const ctxItems = document.getElementById('grafico-itens').getContext('2d');
        this.chartItems = new Chart(ctxItems, {
            type: 'bar',
            data: {
                labels: Object.keys(itemCounts),
                datasets: [{
                    label: 'Quantidade',
                    data: Object.values(itemCounts),
                    backgroundColor: '#007bff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } }
            }
        });
    },

    handleReportSort(column) {
        if (this.currentReportSort.column === column) {
            this.currentReportSort.direction = this.currentReportSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentReportSort.column = column;
            this.currentReportSort.direction = 'asc';
        }
        this.renderRelatorio();
    },

    updateReportSortIcons() {
        document.querySelectorAll('#sectionGerarArquivo th[data-sort] i').forEach(icon => {
            icon.className = 'fas fa-sort'; // Reset
            const th = icon.closest('th');
            if (th.dataset.sort === this.currentReportSort.column) {
                icon.className = this.currentReportSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    async gerarRelatorioExcel(e) {
        e.preventDefault();
        const btn = this.formExportacao.querySelector('button');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

        try {
            // Mesma lógica de query do buscarRelatorio para consistência
            let query = supabaseClient
                .from('coletas_manutencao_checklist')
                .select('*, coletas_manutencao!inner(*)');

            // Filtro automático por nível
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            const nivel = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
            if (nivel === 'moleiro') query = query.eq('item', 'MOLEIRO');
            if (nivel === 'mecanica_externa') query = query.eq('item', 'MECANICA EXTERNA');

            // Filtros do Checklist (Multi-Select)
            const selectedItems = Array.from(this.filtroItemOptions.querySelectorAll('.filtro-item-checkbox:checked')).map(cb => cb.value);
            if (selectedItems.length > 0) {
                query = query.in('item', selectedItems);
            }

            const selectedStatus = Array.from(this.filtroStatusOptions.querySelectorAll('.filtro-status-checkbox:checked')).map(cb => cb.value);
            if (selectedStatus.length > 0) {
                query = query.in('status', selectedStatus);
            }
            
            if (this.filtroSemana.value) query = query.eq('coletas_manutencao.semana', this.filtroSemana.value);
            if (this.filtroPlaca && this.filtroPlaca.value) query = query.ilike('coletas_manutencao.placa', `%${this.filtroPlaca.value.trim().toUpperCase()}%`);
            if (this.filtroDataIni.value) query = query.gte('coletas_manutencao.data_hora', this.filtroDataIni.value + 'T00:00:00');
            if (this.filtroDataFim.value) query = query.lte('coletas_manutencao.data_hora', this.filtroDataFim.value + 'T23:59:59');

            const { data, error } = await query;
            if (error) throw error;

            if (!data || data.length === 0) {
                alert('Nenhum dado encontrado para os filtros selecionados.');
                return;
            }

            // Ordenação
            data.sort((a, b) => new Date(b.coletas_manutencao.data_hora) - new Date(a.coletas_manutencao.data_hora));
            // Agrupar dados por Coleta (Pivot) para criar colunas
            const coletasMap = new Map();

            data.forEach(row => {
                const coletaId = row.coletas_manutencao.id;
                if (!coletasMap.has(coletaId)) {
                    coletasMap.set(coletaId, {
                        meta: row.coletas_manutencao,
                        items: {}
                    });
                }
                const entry = coletasMap.get(coletaId);
                
                let cellValue = '';
                if (row.item === 'ELETRICA INTERNA') {
                    cellValue = `SOLICITAÇÃO: ${row.detalhes || ''}`;
                    if (row.status === 'FINALIZADO' || row.status === 'OK') {
                        cellValue += `, SOLICITAÇÃO REALIZADA`;
                    }
                    if (row.pecas_usadas) {
                        cellValue += ` ${row.pecas_usadas}`;
                    }
                } else {
                    if (row.status === 'FINALIZADO' || row.status === 'OK') {
                        cellValue = 'FINALIZADO';
                    } else if (row.status === 'INTERNADO') {
                        cellValue = 'INTERNADO';
                    } else if (row.status === 'CHECK-IN OFICINA') {
                        cellValue = 'CHECK-IN OFICINA';
                    } else if (row.status === 'CHECK-IN ROTA') {
                        cellValue = 'CHECK-IN ROTA';
                    } else {
                        cellValue = row.detalhes || '';
                    }
                }
                
                entry.items[row.item] = cellValue;
            });

            // Lista de colunas de itens (incluindo os novos)
            const itemColumns = [
                'ACESSORIOS', 'ALINHAMENTO/BALANCEAMENTO', 'AR-CONDICIONADO', 'BORRACHARIA', 
                'ELETRICA INTERNA', 'MECANICA EXTERNA', 'MOLEIRO', 'TACOGRAFO', 'TAPEÇARIA', 
                'THERMO KING', 'VIDROS / FECHADURAS', 'SERVIÇOS_GERAIS', 
                'CONCESSIONARIA', 'ANKA', 'TARRAXA', 'USIMAC', 'LUCAS BAU', 'IBIFURGO', 'IBIPORAN'
            ];

            const dadosPlanilha = [];
            const coletasArray = Array.from(coletasMap.values());
            coletasArray.sort((a, b) => new Date(b.meta.data_hora) - new Date(a.meta.data_hora));

            coletasArray.forEach(entry => {
                const row = {
                    'DATA': new Date(entry.meta.data_hora).toLocaleDateString('pt-BR'),
                    'SEMANA': entry.meta.semana,
                    'PLACA': entry.meta.placa,
                    'MODELO': entry.meta.modelo,
                    'KM': entry.meta.km,
                    'USUARIO': entry.meta.usuario
                };

                itemColumns.forEach(col => {
                    row[col] = entry.items[col] || '';
                });

                dadosPlanilha.push(row);
            });

            const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Relatorio_Manutencao");
            XLSX.writeFile(wb, `Coleta_Manutencao_${new Date().toISOString().slice(0,10)}.xlsx`);

        } catch (err) {
            console.error('Erro ao exportar:', err);
            alert('Erro ao gerar arquivo: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },

    async gerarRelatorioPDF(e) {
        e.preventDefault();
        const btn = this.btnExportarPDF;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

        try {
            // Mesma lógica de query para consistência
            let query = supabaseClient
                .from('coletas_manutencao_checklist')
                .select('*, coletas_manutencao!inner(*)');

            // Filtro automático por nível
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            const nivel = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
            if (nivel === 'moleiro') query = query.eq('item', 'MOLEIRO');
            if (nivel === 'mecanica_externa') query = query.eq('item', 'MECANICA EXTERNA');

            // Filtros do Checklist (Multi-Select)
            const selectedItems = Array.from(this.filtroItemOptions.querySelectorAll('.filtro-item-checkbox:checked')).map(cb => cb.value);
            if (selectedItems.length > 0) {
                query = query.in('item', selectedItems);
            }

            const selectedStatus = Array.from(this.filtroStatusOptions.querySelectorAll('.filtro-status-checkbox:checked')).map(cb => cb.value);
            if (selectedStatus.length > 0) {
                query = query.in('status', selectedStatus);
            }
            
            if (this.filtroSemana.value) query = query.eq('coletas_manutencao.semana', this.filtroSemana.value);
            if (this.filtroPlaca && this.filtroPlaca.value) query = query.ilike('coletas_manutencao.placa', `%${this.filtroPlaca.value.trim().toUpperCase()}%`);
            if (this.filtroDataIni.value) query = query.gte('coletas_manutencao.data_hora', this.filtroDataIni.value + 'T00:00:00');
            if (this.filtroDataFim.value) query = query.lte('coletas_manutencao.data_hora', this.filtroDataFim.value + 'T23:59:59');

            const { data, error } = await query;
            if (error) throw error;

            if (!data || data.length === 0) {
                alert('Nenhum dado encontrado para os filtros selecionados.');
                return;
            }

            // Ordenação
            const col = this.currentReportSort.column;
            const dir = this.currentReportSort.direction === 'asc' ? 1 : -1;

            data.sort((a, b) => {
                let valA, valB;

                if (col === 'data_hora') {
                    valA = new Date(a.coletas_manutencao.data_hora);
                    valB = new Date(b.coletas_manutencao.data_hora);
                } else if (['semana', 'placa', 'modelo'].includes(col)) {
                    valA = a.coletas_manutencao[col];
                    valB = b.coletas_manutencao[col];
                } else {
                    valA = a[col] || '';
                    valB = b[col] || '';
                }

                if (valA < valB) return -1 * dir;
                if (valA > valB) return 1 * dir;
                return 0;
            });

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape' });

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
            doc.text("Relatório de Coleta de Manutenção", 14, 28);
            doc.setFontSize(10);
            
            const nomeUsuario = usuarioLogado?.nome || 'Sistema';
            doc.text(`Exportado por: ${nomeUsuario}`, 14, 34);
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 39);

            // Helper para cores dos itens
            const getItemColor = (item) => {
                const colors = {
                    'ACESSORIOS': [255, 205, 210], // Red
                    'ALINHAMENTO/BALANCEAMENTO': [200, 230, 201], // Green
                    'AR-CONDICIONADO': [187, 222, 251], // Blue
                    'BORRACHARIA': [255, 249, 196], // Amber
                    'ELETRICA INTERNA': [225, 190, 231], // Purple
                    'MECANICA EXTERNA': [178, 235, 242], // Cyan
                    'MOLEIRO': [255, 224, 178], // Deep Orange
                    'TACOGRAFO': [209, 196, 233], // Deep Purple
                    'TAPEÇARIA': [197, 202, 233], // Indigo
                    'THERMO KING': [248, 187, 208], // Pink
                    'VIDROS / FECHADURAS': [220, 220, 220], // Grey
                    'SERVIÇOS_GERAIS': [207, 216, 220], // Blue Grey
                    'CONCESSIONARIA': [255, 224, 130], // Light Amber
                    'ANKA': [197, 225, 165], // Light Green
                    'TARRAXA': [179, 229, 252], // Light Blue
                    'USIMAC': [225, 190, 231], // Light Purple
                    'LUCAS BAU': [255, 204, 188], // Light Red
                    'IBIFURGO': [207, 216, 220], // Blue Grey
                    'IBIPORAN': [207, 216, 220] // Blue Grey
                };
                return colors[item] || [238, 238, 238];
            };

            const tableBody = [];
            let currentItem = null;

            data.forEach(row => {
                if (row.item !== currentItem) {
                    currentItem = row.item;
                    // Adiciona linha de título destacada
                    tableBody.push([{
                        content: currentItem,
                        colSpan: 9,
                        styles: { 
                            fillColor: getItemColor(currentItem), 
                            textColor: [0, 0, 0], 
                            fontStyle: 'bold', 
                            halign: 'center',
                            fontSize: 10
                        }
                    }]);
                }

                const coleta = row.coletas_manutencao;
                tableBody.push([
                    new Date(coleta.data_hora).toLocaleString('pt-BR'),
                    coleta.semana,
                    coleta.placa,
                    coleta.modelo || '-',
                    coleta.km,
                    coleta.usuario,
                    row.status,
                    row.detalhes || '',
                    row.pecas_usadas || ''
                ]);
            });

            // Adiciona linha de totalizador
            tableBody.push([{
                content: `Total de Registros: ${data.length}`,
                colSpan: 9,
                styles: { 
                    fillColor: [220, 220, 220], 
                    textColor: [0, 0, 0], 
                    fontStyle: 'bold', 
                    halign: 'right'
                }
            }]);

            doc.autoTable({
                head: [['Data/Hora', 'Semana', 'Placa', 'Modelo', 'KM', 'Usuário', 'Status', 'Detalhes', 'Peças']],
                body: tableBody,
                startY: 45,
                headStyles: { fillColor: [0, 105, 55] }, // Verde Marquespan
                styles: { fontSize: 8 },
                columnStyles: {
                    7: { cellWidth: 50 }, // Detalhes
                    8: { cellWidth: 40 }  // Peças
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

            doc.save(`Relatorio_Manutencao_${new Date().toISOString().slice(0,10)}.pdf`);

        } catch (err) {
            console.error('Erro ao exportar PDF:', err);
            alert('Erro ao gerar PDF: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ColetarManutencaoUI.init();
});