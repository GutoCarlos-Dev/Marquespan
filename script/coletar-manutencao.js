import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';
import { getStatusClass, normalizarStatus, STATUS_CLASSES } from './coletar-manutencao/status.js';
import { processarImportacaoColetaManutencao } from './coletar-manutencao/importacao.js';
import { exportarRelatorioExcel } from './coletar-manutencao/export-excel.js';
import { exportarRelatorioPDF } from './coletar-manutencao/export-pdf.js';
import { renderizarGraficosManutencao } from './coletar-manutencao/graficos.js';
import { renderizarTabelaRelatorio } from './coletar-manutencao/relatorio-tabela.js';
import { buscarDadosRelatorio } from './coletar-manutencao/relatorio-service.js';

const MODULO_AUDITORIA = window.location.pathname.toLowerCase().endsWith('/mobile-coletar.html')
    ? 'Coleta Manutenção Mobile'
    : 'Coleta Manutenção';

import {
    calcularValorTotalChecklist,
    resetarChecklistModal,
    statusExigeOficina
} from './coletar-manutencao/checklist.js';
import { carregarChecklistDinamico as carregarChecklistDinamicoRender } from './coletar-manutencao/checklist-render.js';
import {
    carregarFiltrosDinamicosRelatorio,
    limparSelecaoMultiselect,
    setupMultiselect
} from './coletar-manutencao/filtros-relatorio.js';
import { buscarLancamentosManutencao } from './coletar-manutencao/lancamentos-service.js';
import { renderizarTabelaLancamentos } from './coletar-manutencao/lancamentos-tabela.js';

const COLETAR_MANUTENCAO_PAGE_ID = 'coletar-manutencao.html';
const FILIAL_MANUTENCAO_PADRAO_VALOR = 'SP';
const FILIAL_MANUTENCAO_PADRAO_TEXTO = 'Matriz SP (SP)';

const ColetarManutencaoUI = {
    async init() {
        console.log('Página de Coleta de Manutenção iniciada.');
        const acessoPermitido = await this.verificarPermissaoPagina();
        if (!acessoPermitido) {
            this.mostrarAcessoNegado();
            return;
        }

        this.cacheDOM();
        this.fixStatusOptions();
        this.bindEvents();
        this.initTabs();
        this.veiculosData = [];
        this.editingId = null; // Variável para controlar o estado de edição
        this.editingFilial = null;
        this.currentSort = { column: 'data_hora', direction: 'desc' }; // Estado inicial da ordenação
        this.currentReportSort = { column: 'data_hora', direction: 'desc' }; // Estado inicial da ordenação do relatório
        this.reportData = []; // Cache dos dados do relatório
        this.chartStatus = null; // Instância do gráfico de status
        this.chartItems = null; // Instância do gráfico de itens
        this.chartOficinas = null; // Instância do novo gráfico de oficinas
        this.oficinasMap = {}; // Mapa de nome para ID das oficinas
        this.relatorioMetaTexto = '';
        
        // Carrega filtros e depois aplica restrições
        this.carregarFiltrosDinamicos().then(() => {
            this.aplicarRestricoesPerfil(); 
        });
        this.carregarFiliaisManutencao();

        this.setupLancamentosTab(); // Prepara a aba de lançamentos sem carregar dados
        this.carregarChecklistDinamico().then(() => {
            // Verifica se o modal deve ser reaberto após atualização da página
            if (sessionStorage.getItem('marquespan_modal_coleta_open') === 'true') {
                this.abrirModal();
            }
        });
    },

    async verificarPermissaoPagina() {
        const {
            data: { session },
            error: sessionError
        } = await supabaseClient.auth.getSession();

        if (sessionError || !session?.user?.id) return false;

        const { data: usuario, error: usuarioError } = await supabaseClient
            .from('usuarios')
            .select('nivel, status')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();

        if (usuarioError || !usuario) {
            console.error('Erro ao validar permissao da pagina:', usuarioError);
            return false;
        }

        const nivel = String(usuario.nivel || '').toLowerCase();
        if (String(usuario.status || 'ATIVO').toUpperCase() === 'INATIVO') return false;
        if (nivel === 'administrador') return true;

        const { data: permissao, error: permissaoError } = await supabaseClient
            .from('nivel_permissoes')
            .select('paginas_permitidas')
            .eq('nivel', nivel)
            .maybeSingle();

        if (permissaoError) {
            console.error('Erro ao carregar permissao da pagina:', permissaoError);
            return false;
        }

        return Array.isArray(permissao?.paginas_permitidas)
            && permissao.paginas_permitidas.includes(COLETAR_MANUTENCAO_PAGE_ID);
    },

    mostrarAcessoNegado() {
        document.body.innerHTML = '<div style="text-align: center; padding: 50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
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
        this.coletaFilialInput = document.getElementById('coletaFilial');
        this.coletaPlacaInput = document.getElementById('coletaPlaca');
        this.coletaModeloInput = document.getElementById('coletaModelo');
        this.veiculosList = document.getElementById('veiculosList');
        this.coletaValorTotalInput = document.getElementById('coletaValorTotal');
        this.tableBodyLancamentos = document.getElementById('tableBodyLancamentos');
        
        // Filtros Lançamento
        this.searchPlacaInput = document.getElementById('searchPlaca');
        this.searchItemInput = document.getElementById('searchItem');
        this.searchOficinaInput = document.getElementById('searchOficina');
        this.searchStatusInput = document.getElementById('searchStatus');
        this.searchFilialLancamentoInput = document.getElementById('searchFilialLancamento');
        this.btnFiltrarLancamentos = document.getElementById('btnFiltrarLancamentos');
        // Filtros de Data para Lançamentos
        this.filtroDataInicialLancamento = document.getElementById('filtroDataInicialLancamento');
        this.filtroDataFinalLancamento = document.getElementById('filtroDataFinalLancamento');

        // Modal Importação
        this.modalImportacao = document.getElementById('modalImportacaoMassa');
        this.btnCloseModalImportacao = this.modalImportacao?.querySelector('.close-button');
        this.formImportacao = document.getElementById('formImportacaoMassa');
        this.filialImportacaoInput = document.getElementById('filialImportacaoManutencao');

        // Exportação
        this.formExportacao = document.getElementById('formExportacao');
        this.filtroSemana = document.getElementById('filtroSemana');
        this.filtroPlaca = document.getElementById('filtroPlaca');
        this.filtroFilialRelatorio = document.getElementById('filtroFilialRelatorio');
        this.filtroDataIni = document.getElementById('filtroDataIni');
        this.filtroDataFim = document.getElementById('filtroDataFim');
        this.filtroDetalhesRelatorio = document.getElementById('filtroDetalhesRelatorio');
        this.filtroItemDisplay = document.getElementById('filtroItemDisplay');
        this.filtroItemOptions = document.getElementById('filtroItemOptions');
        this.filtroItemText = document.getElementById('filtroItemText');
        this.filtroOficinaDisplay = document.getElementById('filtroOficinaDisplay');
        this.filtroOficinaOptions = document.getElementById('filtroOficinaOptions');
        this.filtroOficinaText = document.getElementById('filtroOficinaText');
        this.filtroStatusDisplay = document.getElementById('filtroStatusDisplay');
        this.filtroStatusOptions = document.getElementById('filtroStatusOptions');
        this.filtroStatusText = document.getElementById('filtroStatusText');
        this.btnLimparSelecaoItem = document.getElementById('btnLimparSelecaoItem');
        this.btnLimparSelecaoOficina = document.getElementById('btnLimparSelecaoOficina');
        this.btnLimparTudo = document.getElementById('btnLimparTudo');
        this.btnBuscarRelatorio = document.getElementById('btnBuscarRelatorio');
        this.tableBodyRelatorio = document.getElementById('tableBodyRelatorio');
        this.btnExportarPDFServicos = document.getElementById('btnExportarPDFServicos');
        this.btnExportarPDFOficina = document.getElementById('btnExportarPDFOficina');
        this.graficosContainer = document.getElementById('graficos-container');
        this.contadorResultados = document.getElementById('contadorResultados');
        this.btnToggleMenuLateral = document.getElementById('btnToggleMenuLateralColetar');
    },

    // Corrige opções de status para padronizar valores
    fixStatusOptions() {
        const selects = document.querySelectorAll('.checklist-status');
        selects.forEach(select => {
            Array.from(select.options).forEach(option => {
                const statusNormalizado = normalizarStatus(option.value);
                if (statusNormalizado !== option.value) {
                    option.value = statusNormalizado;
                    option.text = statusNormalizado;
                }
            });
        });
    },

    // Aplica restrições visuais e de filtro baseadas no nível do usuário
    aplicarRestricoesPerfil() {
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const nivel = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
        const isRestricted = ['mecanica_externa', 'moleiro'].includes(nivel);

        if (isRestricted) {
            const searchStatus = document.getElementById('searchStatus');
            if (searchStatus) {
                searchStatus.innerHTML = '<option value="PENDENTE">PENDENTE</option>';
                searchStatus.value = 'PENDENTE';
            }

            // Ocultar a aba "Gerar Arquivo" para usuários restritos
            const btnGerarArquivo = document.querySelector('.painel-btn[data-secao="sectionGerarArquivo"]');
            if (btnGerarArquivo) {
                btnGerarArquivo.style.display = 'none';
            }

            // Ocultar botão Importar em Massa
            const btnImportarMassa = document.getElementById('btnImportarMassa');
            if (btnImportarMassa) {
                btnImportarMassa.style.display = 'none';
            }

            // Ocultar filtros de Item e Oficina
            const searchItem = document.getElementById('searchItem');
            if (searchItem) {
                const wrapper = searchItem.closest('.form-group-filter'); // Corrigido para a nova classe
                if (wrapper) wrapper.style.display = 'none';
                else searchItem.style.display = 'none';
            }

            const searchOficina = document.getElementById('searchOficina');
            if (searchOficina) {
                const wrapper = searchOficina.closest('.form-group-filter'); // Corrigido para a nova classe
                if (wrapper) wrapper.style.display = 'none';
                else searchOficina.style.display = 'none';
            }
        }
    },

    // Carrega dinamicamente os itens do checklist e as oficinas relacionadas
    async carregarChecklistDinamico() {
        return carregarChecklistDinamicoRender({
            callbacks: {
                onCalcularValorTotal: () => this.calcularValorTotal(),
                onUpdateStatusColor: (select) => this.updateStatusColor(select),
                onAplicarRestricoes: () => this.aplicarRestricoesDeNivelNoModal()
            }
        });
    },
    // Calcula o valor total dos itens do checklist
    calcularValorTotal() {
        const total = calcularValorTotalChecklist(document);
        if (this.coletaValorTotalInput) {
            this.coletaValorTotalInput.value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
    },

    // Carrega os dados para os filtros dinâmicos (Itens e Oficinas)
    async carregarFiltrosDinamicos() {
        this.oficinasMap = await carregarFiltrosDinamicosRelatorio({
            searchItemInput: this.searchItemInput,
            filtroItemOptions: this.filtroItemOptions,
            searchOficinaInput: this.searchOficinaInput,
            filtroOficinaOptions: this.filtroOficinaOptions
        });
        this.carregarFiltrosFiliais();
    },

    async carregarFiltrosFiliais() {
        const selects = [this.searchFilialLancamentoInput, this.filtroFilialRelatorio].filter(Boolean);
        if (selects.length === 0) return;

        const labelRelatorio = this.filtroFilialRelatorio?.closest('.form-group-filter')?.querySelector('label');
        if (labelRelatorio) {
            labelRelatorio.textContent = 'Filial';
            labelRelatorio.setAttribute('for', 'filtroFilialRelatorio');
        }

        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const filialUsuario = String(usuarioLogado?.filial || '').trim().toUpperCase();

        try {
            const { data, error } = await supabaseClient
                .from('filiais')
                .select('nome, sigla')
                .order('nome');

            if (error) throw error;

            selects.forEach(select => {
                select.innerHTML = '<option value="">Todas</option>';
                (data || []).forEach(filial => {
                    const valor = String(filial.sigla || filial.nome || '').trim().toUpperCase();
                    if (!valor) return;
                    const texto = filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome;
                    select.add(new Option(texto, valor));
                });

                if (filialUsuario) {
                    if (!Array.from(select.options).some(option => option.value === filialUsuario)) {
                        select.add(new Option(filialUsuario, filialUsuario));
                    }
                    select.value = filialUsuario;
                    select.disabled = true;
                }
            });
        } catch (error) {
            console.error('Erro ao carregar filiais para filtros:', error);
        }
    },
    // Associa os eventos aos elementos DOM
    bindEvents() {
        if (this.btnAdicionarLancamento) this.btnAdicionarLancamento.addEventListener('click', () => this.abrirModal());
        if (this.btnAdicionarItem) this.btnAdicionarItem.addEventListener('click', () => this.abrirModal()); // Evento Mobile
        if (this.btnImportarMassa) this.btnImportarMassa.addEventListener('click', () => this.abrirModalImportacao());

        // DELEGAÇÃO DE EVENTOS: Para funcionar com itens criados dinamicamente
        // Listener para mudança de cor no status
        this.formColeta.addEventListener('change', (e) => {
            this.salvarRascunho(); // Salva rascunho a cada alteração
            if (e.target.classList.contains('checklist-status')) {
                this.updateStatusColor(e.target);
            }
        });

        // Automação do status ao digitar detalhes
        this.formColeta.addEventListener('input', (e) => {
            if (e.target.classList.contains('checklist-details')) {
                // Correção do cursor pulando para o final
                const start = e.target.selectionStart;
                const end = e.target.selectionEnd;
                e.target.value = e.target.value.toUpperCase();
                e.target.setSelectionRange(start, end);

                const statusSelect = e.target.closest('.checklist-item').querySelector('.checklist-status');
                if (statusSelect && statusSelect.value === "") {
                    statusSelect.value = "PENDENTE";
                    this.updateStatusColor(statusSelect);
                }
            }
            this.salvarRascunho(); // Salva rascunho a cada digitação
        });

        if (this.modalImportacao) {
            this.btnCloseModalImportacao.addEventListener('click', () => this.fecharModalImportacao());
            this.modalImportacao.addEventListener('click', (e) => { if (e.target === this.modalImportacao) this.fecharModalImportacao(); });
            this.formImportacao.addEventListener('submit', (e) => this.handleImportacao(e));
        }

        this.btnCloseModal.addEventListener('click', () => this.fecharModal());
        this.coletaPlacaInput.addEventListener('change', () => this.preencherModeloVeiculo());
        this.formColeta.addEventListener('submit', (e) => this.registrarColeta(e));
        
        // Event delegation para botões da tabela
        if (this.tableBodyLancamentos) {
            this.tableBodyLancamentos.addEventListener('click', (e) => {
                const btnDelete = e.target.closest('.btn-delete');
                const btnEdit = e.target.closest('.btn-edit');
                if (btnDelete) this.excluirColeta(btnDelete.dataset.id);
                if (btnEdit) this.editarColeta(btnEdit.dataset.id);
            });
        }

        // Event delegation para botões da tabela de relatório (Resultados da Busca)
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
        if (this.filtroDetalhesRelatorio) this.filtroDetalhesRelatorio.addEventListener('input', () => this.renderRelatorio());
        if(this.btnExportarPDFServicos) this.btnExportarPDFServicos.addEventListener('click', (e) => this.gerarRelatorioPDF(e, 'ITEM'));
        if(this.btnExportarPDFOficina) this.btnExportarPDFOficina.addEventListener('click', (e) => this.gerarRelatorioPDF(e, 'OFICINA'));
        
        if(this.btnLimparSelecaoItem) {
            this.btnLimparSelecaoItem.addEventListener('click', () => this.limparSelecaoItem());
        }
        if(this.btnLimparSelecaoOficina) {
            this.btnLimparSelecaoOficina.addEventListener('click', () => this.limparSelecaoOficina());
        }
        if(this.btnLimparTudo) {
            this.btnLimparTudo.addEventListener('click', () => this.limparFiltros());
        }

        // Eventos de ordenação da grid
        this.btnToggleMenuLateral?.addEventListener('click', () => this.toggleMenuLateral());

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

        setupMultiselect({
            display: this.filtroItemDisplay,
            options: this.filtroItemOptions,
            text: this.filtroItemText,
            checkboxClass: 'filtro-item-checkbox',
            emptyText: 'Todos',
            selectedText: (count) => `${count} item(ns) selecionado(s)`
        });

        setupMultiselect({
            display: this.filtroOficinaDisplay,
            options: this.filtroOficinaOptions,
            text: this.filtroOficinaText,
            checkboxClass: 'filtro-oficina-checkbox',
            emptyText: 'Todas',
            selectedText: (count) => `${count} oficina(s) selecionada(s)`
        });

        setupMultiselect({
            display: this.filtroStatusDisplay,
            options: this.filtroStatusOptions,
            text: this.filtroStatusText,
            checkboxClass: 'filtro-status-checkbox',
            emptyText: 'Todos',
            selectedText: (count) => `${count} selecionado(s)`
        });
    },

    toggleMenuLateral() {
        document.body.classList.toggle('coletar-menu-oculto');
        const oculto = document.body.classList.contains('coletar-menu-oculto');
        if (this.btnToggleMenuLateral) {
            this.btnToggleMenuLateral.title = oculto ? 'Mostrar menu lateral' : 'Ocultar menu lateral';
            this.btnToggleMenuLateral.setAttribute('aria-label', this.btnToggleMenuLateral.title);
        }
    },

    // Limpa a seleção de itens no filtro de relatório
    limparSelecaoItem() {
        limparSelecaoMultiselect(this.filtroItemOptions, this.filtroItemText, 'filtro-item-checkbox', 'Todos');
    },

    limparSelecaoOficina() {
        limparSelecaoMultiselect(this.filtroOficinaOptions, this.filtroOficinaText, 'filtro-oficina-checkbox', 'Todas');
    },

    limparFiltros() {
        this.filtroSemana.value = '';
        this.filtroPlaca.value = '';
        this.filtroDataIni.value = '';
        this.filtroDataFim.value = '';
        if (this.filtroDetalhesRelatorio) this.filtroDetalhesRelatorio.value = '';
        this.limparSelecaoItem();
        this.limparSelecaoOficina();
        limparSelecaoMultiselect(this.filtroStatusOptions, this.filtroStatusText, 'filtro-status-checkbox', 'Todos');
    },
    // Inicializa a navegação por abas
    initTabs() {
        const buttons = document.querySelectorAll('#menu-coletar-manutencao .painel-btn');
        const sections = document.querySelectorAll('.main-content > section.glass-panel');

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

    // Configura o estado inicial da aba de Lançamentos
    setupLancamentosTab() {
        // Define datas padrão (mês atual)
        const hoje = new Date();
        const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        
        if (this.filtroDataInicialLancamento) this.filtroDataInicialLancamento.valueAsDate = primeiroDia;
        if (this.filtroDataFinalLancamento) this.filtroDataFinalLancamento.valueAsDate = hoje;

        // Exibe mensagem inicial na tabela
        if (this.tableBodyLancamentos) {
            this.tableBodyLancamentos.innerHTML = '<tr><td colspan="7" class="text-center">Utilize os filtros e clique em "Filtrar" para buscar os lançamentos.</td></tr>';
        }
    },

    // Abre o modal de lançamento de manutenção
    abrirModal() {
        sessionStorage.setItem('marquespan_modal_coleta_open', 'true');
        this.editingId = null; // Reseta o ID de edição para criar um novo
        this.editingFilial = null;
        this.formColeta.reset();
        this.preencherDadosPadrao();
        if (this.coletaValorTotalInput) this.coletaValorTotalInput.value = 'R$ 0,00';
        // Carrega veículos e tenta restaurar rascunho se houver (para casos de refresh)
        this.carregarVeiculos();
        this.fixStatusOptions();
        
        resetarChecklistModal(this.modal, this.updateStatusColor.bind(this));

        this.aplicarRestricoesDeNivelNoModal();
        this.modal.classList.remove('hidden');
        this.restaurarRascunho(); // Restaura dados se houver um rascunho salvo
    },

    // Atualiza a cor de fundo de um select de status com base no valor selecionado
    updateStatusColor(selectElement) {
        if (!selectElement) return;
        selectElement.classList.remove(...STATUS_CLASSES);

        const statusClass = getStatusClass(selectElement.value);
        if (statusClass) selectElement.classList.add(statusClass);
    },

    // Aplica restrições de visibilidade no modal com base no nível do usuário
    aplicarRestricoesDeNivelNoModal() {
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const nivel = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
        const isRestricted = ['mecanica_externa', 'moleiro'].includes(nivel);
        
        if (!this.modal) return;

        // --- RESTRIÇÃO DE VALOR TOTAL ---
        const valorTotalContainer = this.coletaValorTotalInput?.closest('.form-group');
        if (valorTotalContainer) {
            valorTotalContainer.style.display = isRestricted ? 'none' : '';
        }
        
        const allItems = this.modal.querySelectorAll('.checklist-item');
        
        // Reset: mostra tudo por padrão e restaura opções de status
        allItems.forEach(item => {
            item.style.display = 'block';
            const statusSelect = item.querySelector('.checklist-status');
            if (statusSelect && statusSelect.dataset.originalOptions) {
                statusSelect.innerHTML = statusSelect.dataset.originalOptions;
                delete statusSelect.dataset.originalOptions;
            }
        }); 
        
        const extraEletrica = document.getElementById('extra-eletrica-interna');
        if (extraEletrica) extraEletrica.style.display = '';

        if (isRestricted) {
            // --- RESTRIÇÃO DE ITENS DO CHECKLIST ---
            if (nivel === 'moleiro') {
                allItems.forEach(item => { 
                    const itemNome = item.dataset.item ? item.dataset.item.toUpperCase() : '';
                    if (itemNome !== 'MOLEIRO') item.style.display = 'none'; 
                });
                if (extraEletrica) extraEletrica.style.display = 'none';
            } else if (nivel === 'mecanica_externa') {
                allItems.forEach(item => { 
                    const itemNome = item.dataset.item ? item.dataset.item.toUpperCase() : '';
                    // Permite ambas as variações para garantir que o item apareça
                    if (itemNome !== 'MECANICA EXTERNA' && itemNome !== 'MECANICA - EXTERNA') item.style.display = 'none'; 
                });
                if (extraEletrica) extraEletrica.style.display = 'none';
            }

            // --- RESTRIÇÃO DE STATUS ---
            allItems.forEach(item => {
                const statusSelect = item.querySelector('.checklist-status');
                if (statusSelect) {
                    // Salva as opções originais antes de modificar
                    if (!statusSelect.dataset.originalOptions) {
                        statusSelect.dataset.originalOptions = statusSelect.innerHTML;
                    }
                    statusSelect.innerHTML = '<option value="PENDENTE">PENDENTE</option>';
                    statusSelect.value = 'PENDENTE';
                    this.updateStatusColor(statusSelect);
                }
            });
        }
    },

    // Fecha o modal de lançamento de manutenção
    fecharModal() {
        sessionStorage.removeItem('marquespan_modal_coleta_open');
        this.limparRascunho(); // Limpa o rascunho ao fechar/cancelar
        this.modal.classList.add('hidden');
    },

    // Abre o modal de importação em massa
    abrirModalImportacao() {
        this.formImportacao.reset();
        this.aplicarFilialPadrao(this.filialImportacaoInput);
        this.modalImportacao.classList.remove('hidden');
    },
    // Fecha o modal de importação em massa

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

            const usuario = JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';
            const filial = this.filialImportacaoInput?.value || null;
            if (!filial) throw new Error('Selecione a filial onde as manutencoes foram realizadas.');
            await processarImportacaoColetaManutencao(tipo, arquivo, {
                usuario,
                filial,
                calcularSemana: this.calculateCurrentWeek.bind(this)
            });
            
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

    // Preenche os campos de data, hora e usuário no modal de lançamento
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
        this.aplicarFilialPadrao(this.coletaFilialInput);

        // Preenche Semana (Calculada a partir de 28/12/2025)
        const semana = this.calculateCurrentWeek(now); // Passa 'now' para obter o ano correto
        const semanaInput = document.getElementById('coletaSemana');
        if (semanaInput) {
            semanaInput.value = semana;
        }
    },

    async carregarFiliaisManutencao() {
        const selects = [this.coletaFilialInput, this.filialImportacaoInput].filter(Boolean);
        if (selects.length === 0) return;

        try {
            const { data, error } = await supabaseClient
                .from('filiais')
                .select('nome, sigla')
                .order('nome');

            if (error) throw error;

            selects.forEach(select => {
                select.innerHTML = '<option value="">Selecione a filial</option>';
                (data || []).forEach(filial => {
                    const valor = String(filial.sigla || filial.nome || '').trim().toUpperCase();
                    if (valor) {
                        const texto = filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome;
                        select.add(new Option(texto, valor));
                    }
                });
                this.aplicarFilialPadrao(select);
            });
        } catch (error) {
            console.error('Erro ao carregar filiais da manutencao:', error);
        }
    },

    aplicarFilialPadrao(select) {
        if (!select) return;
        const filialUsuario = String(
            JSON.parse(localStorage.getItem('usuarioLogado'))?.filial || ''
        ).trim().toUpperCase();

        select.disabled = Boolean(filialUsuario);
        if (filialUsuario) {
            if (!Array.from(select.options).some(option => option.value === filialUsuario)) {
                select.add(new Option(filialUsuario, filialUsuario));
            }
            select.value = filialUsuario;
            return;
        }

        select.disabled = false;
        if (!select.value) {
            if (!Array.from(select.options).some(option => option.value === FILIAL_MANUTENCAO_PADRAO_VALOR)) {
                select.add(new Option(FILIAL_MANUTENCAO_PADRAO_TEXTO, FILIAL_MANUTENCAO_PADRAO_VALOR));
            }
            select.value = FILIAL_MANUTENCAO_PADRAO_VALOR;
        }
    },

    // Calcula o número da semana com base em uma data de início
    calculateCurrentWeek(dateObj = new Date()) {
        const startDate = new Date('2025-12-28T00:00:00');
        const diffInMs = dateObj.getTime() - startDate.getTime();
        const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
        
        let weekNumber = Math.floor(diffInDays / 7) + 1; // Número da semana relativo à startDate
        if (weekNumber < 1) weekNumber = 1; // Garante que não seja menor que 1
        return String(weekNumber).padStart(2, '0') + '-' + dateObj.getFullYear();
    },

    // Carrega a lista de veículos para o datalist
    async carregarVeiculos() {
        try {
            let query = supabaseClient
                .from('veiculos')
                .select('placa, modelo, filial')
                .eq('situacao', 'ativo') // Garante que só traga veículos ativos
                .order('placa');

            const { data, error } = await query;
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

    // Preenche o modelo do veículo automaticamente ao selecionar a placa
    preencherModeloVeiculo() {
        const placaSelecionada = this.coletaPlacaInput.value;
        const veiculo = this.veiculosData.find(v => v.placa === placaSelecionada);
        if (veiculo) {
            this.coletaModeloInput.value = veiculo.modelo;
        } else {
            this.coletaModeloInput.value = '';
        }
    },

    // Exibe modal de conflito customizado com 3 opções
    async showConflictModal(placa) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6); display: flex; justify-content: center;
                align-items: center; z-index: 10000; font-family: Arial, sans-serif;
            `;
            
            const content = document.createElement('div');
            content.style.cssText = `
                background: white; padding: 25px; border-radius: 8px; width: 400px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2); text-align: center;
            `;
            
            const icon = document.createElement('div');
            icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            icon.style.cssText = 'font-size: 40px; color: #ffc107; margin-bottom: 15px;';

            const title = document.createElement('h3');
            title.textContent = 'Veículo já possui lançamento';
            title.style.color = '#333';
            title.style.margin = '0 0 10px 0';
            
            const msg = document.createElement('p');
            msg.innerHTML = `A placa <strong>${placa}</strong> já consta na lista de lançamentos desta semana.<br>O que deseja fazer?`;
            msg.style.color = '#666';
            msg.style.marginBottom = '20px';
            
            const btnGroup = document.createElement('div');
            btnGroup.style.display = 'flex';
            btnGroup.style.flexDirection = 'column';
            btnGroup.style.gap = '10px';
            
            const createBtn = (text, color, choice) => {
                const btn = document.createElement('button');
                btn.textContent = text;
                btn.style.cssText = `padding: 12px; background: ${color}; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: opacity 0.2s;`;
                btn.onmouseover = () => btn.style.opacity = '0.9';
                btn.onmouseout = () => btn.style.opacity = '1';
                btn.onclick = () => { document.body.removeChild(modal); resolve(choice); };
                return btn;
            };

            btnGroup.appendChild(createBtn('1. Sim, incluir no existente', '#007bff', 'MERGE'));
            btnGroup.appendChild(createBtn('2. Não, incluir novo lançamento', '#28a745', 'NEW'));
            btnGroup.appendChild(createBtn('3. Cancelar', '#dc3545', 'CANCEL'));
            
            content.appendChild(icon);
            content.appendChild(title);
            content.appendChild(msg);
            content.appendChild(btnGroup);
            modal.appendChild(content);
            document.body.appendChild(modal);
        });
    },

    // Registra uma nova coleta ou atualiza uma existente
    async registrarColeta(e) {
        e.preventDefault();
        
        const submitButton = e.target.querySelector('button[type="submit"]');
        if (submitButton) {
            this.submitButtonOriginalText = submitButton.innerHTML; // Armazena o texto original do botão
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; // Adiciona um spinner
        }

        const semana = document.getElementById('coletaSemana').value;
        const dataHoraInput = document.getElementById('coletaDataHora').value;
        if (!dataHoraInput) return alert("Por favor, preencha a data e hora.");
        const dataHora = new Date(dataHoraInput).toISOString();
        
        // Sempre registra/atualiza com o usuário logado no momento da ação.
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const usuario = usuarioLogado ? usuarioLogado.nome : document.getElementById('coletaUsuario').value; // Fallback para o valor do campo

        const placa = document.getElementById('coletaPlaca').value.trim().toUpperCase();
        const modelo = document.getElementById('coletaModelo').value;
        const km = document.getElementById('coletaKm').value;
        const filial = String(this.coletaFilialInput?.value || '').trim().toUpperCase();

        if (!filial) {
            alert('Selecione a filial onde a manutencao foi realizada.');
            return;
        }
        
        // Captura o valor total calculado
        const valorTotalStr = this.coletaValorTotalInput ? this.coletaValorTotalInput.value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim() : '0';
        const valorTotal = parseFloat(valorTotalStr) || 0;

        // Validação de Oficina Obrigatória
        const checklistElements = document.querySelectorAll('.checklist-item');
        for (const item of checklistElements) {
            const status = item.querySelector('.checklist-status').value;
            const oficinaSelect = item.querySelector('.oficina-selector');
            const statusRequiresOffice = statusExigeOficina(status);

            if (statusRequiresOffice && oficinaSelect) {
                if (!oficinaSelect.value) { // Verifica se um valor foi selecionado
                    const nomeItem = item.querySelector('.checklist-label').textContent;
                    if (oficinaSelect.options.length > 1) {
                        // Existem oficinas para escolher, mas nenhuma foi selecionada
                        alert(`⚠️ É obrigatório selecionar uma oficina para o item "${nomeItem}" com status "${status}".`);
                    } else {
                        // Não há oficinas disponíveis no dropdown
                        alert(`⚠️ Não é possível marcar o item "${nomeItem}" como "${status}" pois não há oficinas cadastradas para este tipo de serviço. Cadastre uma oficina primeiro.`);
                    }
                    oficinaSelect.focus();
                    return; // Bloqueia o envio do formulário
                }
            }
        }

        const checklistItems = [];
        document.querySelectorAll('.checklist-item').forEach(item => {
            const nomeItem = item.dataset.item;
            let detalhes = item.querySelector('.checklist-details').value.trim().toUpperCase();
            let status = item.querySelector('.checklist-status').value;
            let pecasUsadas = null;
            let oficinaId = null;
            let valorItem = 0;

            // Captura peças usadas se for Elétrica Interna e estiver visível
            if (nomeItem === 'ELETRICA INTERNA' || nomeItem === 'ELETRICA / MECANICA - INTERNA') {
                const extraInput = document.getElementById('extra-eletrica-interna').querySelector('input');
                if (!document.getElementById('extra-eletrica-interna').classList.contains('hidden')) {
                    pecasUsadas = extraInput.value;
                }
            }

            // Captura oficina selecionada para CHECK-IN (OFICINA ou ROTA)
            const oficinaSelect = item.querySelector('.oficina-selector');
            if (oficinaSelect && oficinaSelect.value && statusExigeOficina(status)) {
                oficinaId = parseInt(oficinaSelect.value);
            }

            // Captura valor se estiver visível
            const valorWrapper = item.querySelector('.valor-wrapper');
            if (valorWrapper && valorWrapper.style.display !== 'none') {
                const valStr = item.querySelector('.checklist-valor').value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
                valorItem = parseFloat(valStr) || 0;
            }

            // Regra: Se a descrição estiver vazia, força o status para vazio.
            // Isso garante que o item seja filtrado abaixo e removido do banco (não aparecerá na busca).
            if (detalhes === "") {
                status = "";
            }
            
            checklistItems.push({
                item: nomeItem, detalhes, status, pecas_usadas: pecasUsadas, oficina_id: oficinaId, valor: valorItem
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
                        km: parseInt(km),
                        filial,
                        valor_total: valorTotal
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
                    pecas_usadas: i.pecas_usadas,
                    oficina_id: i.oficina_id,
                    valor: i.valor
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
                    .eq('filial', filial)
                    .order('data_hora', { ascending: false });

                if (fetchError) throw fetchError;

                let shouldMerge = false;
                let latestHeader = null;

                if (existingHeaders && existingHeaders.length > 0) {
                    latestHeader = existingHeaders[0];
                    
                    let conflictWithFinalized = false;
                    let matchWithPending = false;

                    // Verifica se algum dos itens que estão sendo salvos já existe como FINALIZADO nesta semana
                    for (const formItem of itemsToProcess) {
                        const itemConflict = existingHeaders.some(header => 
                            header.coletas_manutencao_checklist && 
                            header.coletas_manutencao_checklist.some(existingItem => 
                                existingItem.item === formItem.item && 
                                ['FINALIZADO', 'FINALIZADO ROTA', 'OK'].includes(existingItem.status)
                            )
                        );
                        
                        if (itemConflict) {
                            conflictWithFinalized = true;
                            break;
                        }

                        // Verifica se existe item PENDENTE correspondente para realizar merge automático
                        const pendingMatch = existingHeaders.some(header => 
                            header.coletas_manutencao_checklist && 
                            header.coletas_manutencao_checklist.some(existingItem => 
                                existingItem.item === formItem.item && 
                                ['PENDENTE', 'NAO REALIZADO', 'NÃO REALIZADO'].includes(existingItem.status)
                            )
                        );
                        if (pendingMatch) matchWithPending = true;
                    }

                    if (conflictWithFinalized) {
                        shouldMerge = false; // Força novo lançamento pois o item específico já foi finalizado anteriormente
                    } else if (matchWithPending) {
                        shouldMerge = true; // Mescla automaticamente se encontrar item pendente, sem perguntar
                    } else {
                        // Pergunta ao usuário o que fazer (Merge, Novo ou Cancelar)
                        const userChoice = await this.showConflictModal(placa);
                        
                        if (userChoice === 'CANCEL') {
                            return; // Usuário cancelou a operação
                        } else if (userChoice === 'MERGE') {
                            shouldMerge = true;
                        } else if (userChoice === 'NEW') {
                            shouldMerge = false;
                        }
                    }
                }

                if (!shouldMerge) {
                    // NENHUM REGISTRO EXISTENTE: Cria novo cabeçalho e insere itens
                    const { data: coleta, error: coletaError } = await supabaseClient
                        .from('coletas_manutencao')
                        .insert([{
                            semana, data_hora: dataHora, usuario, placa, modelo, km: parseInt(km), filial, valor_total: valorTotal
                        }])
                        .select()
                        .single();

                    if (coletaError) throw coletaError;

                    const checklistPayload = itemsToProcess.map(i => ({
                        coleta_id: coleta.id,
                        item: i.item,
                        detalhes: i.detalhes,
                        status: i.status, // Permite salvar vazio
                        pecas_usadas: i.pecas_usadas,
                        oficina_id: i.oficina_id,
                        valor: i.valor
                    }));

                    const { error: checklistError } = await supabaseClient
                        .from('coletas_manutencao_checklist')
                        .insert(checklistPayload);

                    if (checklistError) throw checklistError;

                } else {
                    // REGISTROS EXISTENTES: Lógica de Merge/Novo
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
                                    if (match.status === 'FINALIZADO' || match.status === 'FINALIZADO ROTA') {
                                        newDetails = `${newDetails} ( <-- ${match.status} ), ${formItem.detalhes}`;
                                    } else {
                                        newDetails = `${newDetails}, ${formItem.detalhes}`;
                                    }
                                } else {
                                    newDetails = formItem.detalhes;
                                }
                            }
                            
                            updatesToPerform.push({
                                id: match.id,
                                detalhes: newDetails,
                                status: statusItem, // Atualiza status (ex: para OK)
                                pecas_usadas: formItem.pecas_usadas || match.pecas_usadas,
                                oficina_id: formItem.oficina_id,
                                valor: formItem.valor
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
                            .update({ detalhes: up.detalhes, status: up.status, pecas_usadas: up.pecas_usadas, oficina_id: up.oficina_id, valor: up.valor })
                            .eq('id', up.id);
                    }

                    // B. Inserts no Header Recente
                    if (itemsToInsertInLatest.length > 0) {
                        const payload = itemsToInsertInLatest.map(i => ({
                            coleta_id: latestHeader.id,
                            item: i.item,
                            detalhes: i.detalhes,
                            status: i.status,
                            pecas_usadas: i.pecas_usadas,
                            oficina_id: i.oficina_id,
                            valor: i.valor
                        }));
                        await supabaseClient.from('coletas_manutencao_checklist').insert(payload);
                    }

                    // C. Atualizar Headers (Data/Usuário)
                    if (headersToUpdate.size > 0) {
                        await supabaseClient.from('coletas_manutencao')
                            .update({ data_hora: dataHora, usuario: usuario, filial })
                            .in('id', Array.from(headersToUpdate));
                    }
                }
            };

            // === ATUALIZAÇÃO AUTOMÁTICA DO STATUS DO VEÍCULO ===
            // Verifica no banco se existe ALGUM item com status 'INTERNADO' para esta placa.
            // Isso garante que itens antigos ou de outras semanas mantenham o veículo internado se necessário.
            const { count: qtdInternados, error: errCheckInternado } = await supabaseClient
                .from('coletas_manutencao_checklist')
                .select('id, coletas_manutencao!inner(placa)', { count: 'exact', head: true })
                .eq('status', 'INTERNADO')
                .eq('coletas_manutencao.placa', placa);

            const novaSituacao = (qtdInternados && qtdInternados > 0) ? 'INTERNADO' : 'ativo';
            
            if (errCheckInternado) console.error('Erro ao verificar status internado:', errCheckInternado);

            const { error: errVeiculo } = await supabaseClient
                .from('veiculos')
                .update({ situacao: novaSituacao })
                .eq('placa', placa);

            if (errVeiculo) {
                console.error('Erro ao atualizar situação do veículo:', errVeiculo);
            }

            registrarAuditoria(this.editingId ? 'ALTERAR' : 'INCLUIR', MODULO_AUDITORIA, `${this.editingId ? 'Atualização' : 'Registro'} de coleta - Placa: ${placa}`);
            alert(`✅ Coleta ${this.editingId ? 'atualizada' : 'registrada'} com sucesso!`);
            this.fecharModal();
            this.limparRascunho(); // Limpa rascunho após sucesso
            this.carregarLancamentos(); // Atualiza a grid
            
            // Se a aba de relatório estiver visível, atualiza ela também
            if (!document.getElementById('sectionGerarArquivo').classList.contains('hidden')) {
                this.buscarRelatorio();
            }

        } catch (err) {
            console.error('Erro ao salvar coleta:', err);
            alert('Erro ao salvar coleta: ' + err.message);
        } finally {
            if (submitButton && this.submitButtonOriginalText) {
                submitButton.disabled = false;
                submitButton.innerHTML = this.submitButtonOriginalText; // Restaura o texto original do botão
            }
        }
    },

    // Carrega os lançamentos recentes para a tabela principal
    async carregarLancamentos() {
        if (!this.tableBodyLancamentos) return;
        this.tableBodyLancamentos.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';

        try {
            const filtros = {
                dataInicial: this.filtroDataInicialLancamento?.value,
                dataFinal: this.filtroDataFinalLancamento?.value,
                searchPlaca: this.searchPlacaInput?.value.trim().toUpperCase(),
                filial: this.searchFilialLancamentoInput?.value || '',
                searchItem: this.searchItemInput?.value,
                searchOficina: this.searchOficinaInput?.value,
                searchStatus: this.searchStatusInput?.value
            };

            if (!filtros.dataInicial || !filtros.dataFinal) {
                this.tableBodyLancamentos.innerHTML = '<tr><td colspan="7" class="text-center">Por favor, selecione o período de data.</td></tr>';
                return;
            }

            const resultado = await buscarLancamentosManutencao({
                filtros,
                sortConfig: this.currentSort,
                oficinasMap: this.oficinasMap
            });

            if (!resultado.data || resultado.data.length === 0) {
                const mensagem = resultado.emptyReason === 'filters'
                    ? 'Nenhum lançamento encontrado para os filtros.'
                    : 'Nenhum lançamento encontrado.';
                this.tableBodyLancamentos.innerHTML = `<tr><td colspan="7" class="text-center">${mensagem}</td></tr>`;
                return;
            }

            renderizarTabelaLancamentos({
                tbody: this.tableBodyLancamentos,
                data: resultado.data,
                roleFilterItem: resultado.roleFilterItem,
                podeExcluir: resultado.podeExcluir,
                isRestricted: resultado.isRestricted
            });
        } catch (err) {
            console.error('Erro ao carregar lançamentos:', err);
            this.tableBodyLancamentos.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        }
    },
    // Lida com a ordenação da tabela de lançamentos
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

    // Atualiza os ícones de ordenação na tabela de lançamentos
    updateSortIcons() {
        document.querySelectorAll('#sectionLancamento th[data-sort] i').forEach(icon => {
            icon.className = 'fas fa-sort'; // Reset
            const th = icon.closest('th');
            if (th.dataset.sort === this.currentSort.column) {
                icon.className = this.currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    // Carrega os dados de uma coleta para edição no modal
    async editarColeta(id) {
        try {
            // 1. Buscar dados do cabeçalho
            const { data: coleta, error: coletaError } = await supabaseClient
                .from('coletas_manutencao')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (coletaError) throw coletaError;
            if (!coleta) {
                alert('Registro não encontrado. Ele pode ter sido excluído ou você não tem permissão para acessá-lo.');
                return;
            }

            // 2. Buscar itens do checklist
            const { data: checklist, error: checklistError } = await supabaseClient
                .from('coletas_manutencao_checklist')
                .select('*')
                .eq('coleta_id', id);

            if (checklistError) throw checklistError;

            // 3. Preencher o formulário
            this.editingId = id;
            this.editingFilial = coleta.filial || null;
            if (this.coletaFilialInput) {
                this.coletaFilialInput.value = String(coleta.filial || '').trim().toUpperCase();
            }
            document.getElementById('coletaSemana').value = coleta.semana;
            
            // Garante que o formato da semana seja XX-YYYY ao carregar para edição
            if (coleta.semana && !String(coleta.semana).includes('-')) {
                const year = new Date(coleta.data_hora).getFullYear();
                document.getElementById('coletaSemana').value = `${String(coleta.semana).padStart(2, '0')}-${year}`;
            }
            // Ajuste de fuso horário para o input datetime-local
            const date = new Date(coleta.data_hora);
            date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
            document.getElementById('coletaDataHora').value = date.toISOString().slice(0, 16);
            
            document.getElementById('coletaUsuario').value = coleta.usuario;
            document.getElementById('coletaPlaca').value = coleta.placa;
            document.getElementById('coletaModelo').value = coleta.modelo;
            document.getElementById('coletaKm').value = coleta.km;
            if (this.coletaValorTotalInput) this.coletaValorTotalInput.value = (coleta.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            // 4. Preencher o checklist
            // Primeiro limpa tudo
            const checklistItems = this.modal.querySelectorAll('.checklist-item');
            checklistItems.forEach(div => {
                // Limpa inputs de texto
                const detailsInput = div.querySelector('.checklist-details');
                if (detailsInput) detailsInput.value = '';
                
                // Reseta status
                const statusSelect = div.querySelector('.checklist-status');
                if (statusSelect) {
                    statusSelect.value = '';
                    this.updateStatusColor(statusSelect);
                }

                // Reseta e esconde oficina
                const oficinaWrapper = div.querySelector('.oficina-selector-wrapper');
                const oficinaSelect = div.querySelector('.oficina-selector');
                if (oficinaWrapper) oficinaWrapper.style.display = 'none';
                if (oficinaSelect) {
                    oficinaSelect.value = '';
                    oficinaSelect.required = false;
                }

                // Reseta e esconde valor
                const valorWrapper = div.querySelector('.valor-wrapper');
                const valorInput = div.querySelector('.checklist-valor');
                if (valorWrapper) valorWrapper.style.display = 'none';
                if (valorInput) valorInput.value = 'R$ 0,00';
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
                    const detailsInput = div.querySelector('.checklist-details');
                    const oficinaSelect = div.querySelector('.oficina-selector');
                    const valorWrapper = div.querySelector('.valor-wrapper');
                    const valorInput = div.querySelector('.checklist-valor');

                    let detalhesTexto = item.detalhes || '';
                    let oficinaEncontrada = item.oficina_id || null;
                    
                    // Ajuste para compatibilidade com registros antigos
                    let statusValue = item.status || '';
                    if (statusValue === 'NAO REALIZADO' || statusValue === 'NÃO REALIZADO') {
                        statusValue = 'PENDENTE';
                    }
                    if (statusValue === 'OK') {
                        statusValue = 'FINALIZADO';
                    }

                    // Lógica para extrair oficina do texto de detalhes se o status exigir
                    const statusRequiresOffice = statusExigeOficina(statusValue);

                    if (!oficinaEncontrada && statusRequiresOffice && oficinaSelect && oficinaSelect.options.length > 1) {
                        for (let i = 0; i < oficinaSelect.options.length; i++) {
                            const optText = oficinaSelect.options[i].text;
                            if (!optText || optText === 'Selecione a Oficina') continue;

                            const suffix = ` | ${optText}`;
                            if (detalhesTexto.endsWith(suffix)) {
                                oficinaEncontrada = oficinaSelect.options[i].value;
                                detalhesTexto = detalhesTexto.substring(0, detalhesTexto.length - suffix.length);
                                break; 
                            } else if (detalhesTexto === optText) {
                                oficinaEncontrada = oficinaSelect.options[i].value;
                                detalhesTexto = '';
                                break;
                            }
                        }
                    }

                    detailsInput.value = detalhesTexto;

                    statusSelect.value = statusValue;
                    statusSelect.dispatchEvent(new Event('change', { bubbles: true })); // Dispara evento para atualizar UI (mostrar/ocultar oficina) e cor

                    if (oficinaEncontrada) {
                        oficinaSelect.value = oficinaEncontrada;
                    }

                    // Preenche valor se existir
                    if (item.valor) {
                        valorInput.value = item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    }

                    // Lógica específica para preencher Elétrica Interna
                    if ((item.item === 'ELETRICA INTERNA' || item.item === 'ELETRICA / MECANICA - INTERNA') && (statusValue === 'FINALIZADO' || statusValue === 'OK')) {
                        extraField.classList.remove('hidden');
                        extraField.querySelector('input').value = item.pecas_usadas || '';
                    }
                }
            });
            this.calcularValorTotal(); // Recalcula para garantir consistência visual

            this.aplicarRestricoesDeNivelNoModal();
            this.modal.classList.remove('hidden');
        } catch (err) {
            console.error('Erro ao carregar para edição:', err);
            alert('Erro ao carregar dados: ' + err.message);
        }
    },

    // Exclui uma coleta de manutenção
    async excluirColeta(id) {
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const nivelUsuario = usuarioLogado ? String(usuarioLogado.nivel || '').toLowerCase() : '';
        const niveisBloqueadosParaExclusao = ['mecanica_externa', 'mecanica_interna', 'moleiro'];

        if (niveisBloqueadosParaExclusao.includes(nivelUsuario)) {
            alert('Seu nível de acesso não permite excluir lançamentos.');
            return;
        }

        if (!confirm('Deseja realmente excluir este lançamento?')) return;
        try {
            // Obtém a placa antes de deletar para atualizar situação do veículo depois
            const { data: coletaDados } = await supabaseClient
                .from('coletas_manutencao')
                .select('placa')
                .eq('id', id)
                .single();
            const placaExcluida = coletaDados?.placa || null;

            // Supabase deve estar configurado com ON DELETE CASCADE, mas por segurança deletamos os itens primeiro se necessário
            await supabaseClient.from('coletas_manutencao_checklist').delete().eq('coleta_id', id);

            const { error } = await supabaseClient.from('coletas_manutencao').delete().eq('id', id);
            if (error) throw error;

            // Recalcula situação do veículo: se não resta nenhum item INTERNADO, volta para 'ativo'
            if (placaExcluida) {
                const { count: qtdInternados } = await supabaseClient
                    .from('coletas_manutencao_checklist')
                    .select('id, coletas_manutencao!inner(placa)', { count: 'exact', head: true })
                    .eq('status', 'INTERNADO')
                    .eq('coletas_manutencao.placa', placaExcluida);

                if (!qtdInternados || qtdInternados === 0) {
                    await supabaseClient
                        .from('veiculos')
                        .update({ situacao: 'ativo' })
                        .eq('placa', placaExcluida)
                        .eq('situacao', 'INTERNADO');
                }
            }

            registrarAuditoria('EXCLUIR', MODULO_AUDITORIA, `Exclusão de coleta ID ${id}`);
            this.carregarLancamentos();

            // Se a aba de relatório estiver visível, atualiza ela também
            if (!document.getElementById('sectionGerarArquivo').classList.contains('hidden')) {
                this.buscarRelatorio();
            }
        } catch (err) {
            alert('Erro ao excluir: ' + err.message);
        }
    },

    // Busca e renderiza o relatório de manutenções com base nos filtros
    obterFiltrosRelatorio() {
        return {
            items: Array.from(this.filtroItemOptions.querySelectorAll('.filtro-item-checkbox:checked')).map(cb => cb.value),
            oficinas: Array.from(this.filtroOficinaOptions.querySelectorAll('.filtro-oficina-checkbox:checked')).map(cb => cb.value),
            status: Array.from(this.filtroStatusOptions.querySelectorAll('.filtro-status-checkbox:checked')).map(cb => cb.value),
            semana: this.filtroSemana.value,
            placa: this.filtroPlaca?.value?.trim().toUpperCase() || '',
            filial: this.filtroFilialRelatorio?.value || '',
            dataIni: this.filtroDataIni.value,
            dataFim: this.filtroDataFim.value,
            detalhes: ''
        };
    },

    async buscarRelatorio() {
        if (!this.tableBodyRelatorio) return;
        this.tableBodyRelatorio.innerHTML = '<tr><td colspan="13" class="text-center">Buscando registros em blocos de 1000...</td></tr>';
        if (this.contadorResultados) this.contadorResultados.textContent = '(carregando em blocos...)';
        
        try {
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            const data = await buscarDadosRelatorio({
                usuarioLogado,
                filtros: this.obterFiltrosRelatorio(),
                oficinasMap: this.oficinasMap,
                incluirOficinas: true
            });
            const meta = data?.meta || null;
            if (this.contadorResultados) {
                this.relatorioMetaTexto = meta
                    ? `(${meta.carregados} de ${meta.total} carregados em ${meta.blocos} bloco${meta.blocos === 1 ? '' : 's'})`
                    : `(${data ? data.length : 0})`;
                this.contadorResultados.textContent = this.relatorioMetaTexto;
            }

            this.tableBodyRelatorio.innerHTML = '';
            if (!data || data.length === 0) {
                this.tableBodyRelatorio.innerHTML = '<tr><td colspan="13" class="text-center">Nenhum registro encontrado.</td></tr>';
                if (this.graficosContainer) this.graficosContainer.style.display = 'none';
                return;
            }

            this.reportData = data;
            this.renderRelatorio();
            this.renderizarGraficos();

        } catch (err) {
            console.error('Erro ao buscar relatório:', err);
            this.tableBodyRelatorio.innerHTML = '<tr><td colspan="13" class="text-center text-danger">Erro ao buscar dados.</td></tr>';
        }
    },

    // Renderiza a tabela de resultados do relatório
    renderRelatorio() {
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const nivelUsuario = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
        const dadosFiltrados = this.getReportDataFiltradoPorDetalhes();

        renderizarTabelaRelatorio({
            tbody: this.tableBodyRelatorio,
            reportData: dadosFiltrados,
            sortConfig: this.currentReportSort,
            nivelUsuario
        });

        if (this.contadorResultados && this.reportData.length !== dadosFiltrados.length) {
            this.contadorResultados.textContent = `(${dadosFiltrados.length} de ${this.reportData.length} exibidos)`;
        } else if (this.contadorResultados) {
            this.contadorResultados.textContent = this.relatorioMetaTexto || `(${this.reportData.length})`;
        }
        this.updateReportSortIcons();
    },

    getReportDataFiltradoPorDetalhes() {
        const termo = this.filtroDetalhesRelatorio?.value?.trim().toLowerCase() || '';
        if (!termo) return [...this.reportData];

        return this.reportData.filter(item =>
            String(item.detalhes || '').toLowerCase().includes(termo)
            || String(item.pecas_usadas || '').toLowerCase().includes(termo)
        );
    },
    // Renderiza os gráficos de análise
    renderizarGraficos() {
        const graficos = renderizarGraficosManutencao(this.reportData, this.graficosContainer, {
            chartStatus: this.chartStatus,
            chartItems: this.chartItems,
            chartOficinas: this.chartOficinas
        });

        this.chartStatus = graficos.chartStatus;
        this.chartItems = graficos.chartItems;
        this.chartOficinas = graficos.chartOficinas;
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
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            const exportado = await exportarRelatorioExcel({
                usuarioLogado,
                filtros: this.obterFiltrosRelatorio(),
                oficinasMap: this.oficinasMap
            });

            if (!exportado) {
                alert('Nenhum dado encontrado para os filtros selecionados.');
            }
        } catch (err) {
            console.error('Erro ao exportar:', err);
            alert('Erro ao gerar arquivo: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },
    async gerarRelatorioPDF(e, tipoAgrupamento = 'ITEM') {
        e.preventDefault();
        const btn = tipoAgrupamento === 'OFICINA' ? this.btnExportarPDFOficina : this.btnExportarPDFServicos;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

        try {
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            const exportado = await exportarRelatorioPDF({
                tipoAgrupamento,
                usuarioLogado,
                filtros: this.obterFiltrosRelatorio(),
                sortConfig: this.currentReportSort,
                oficinasMap: this.oficinasMap
            });

            if (!exportado) {
                alert('Nenhum dado encontrado para os filtros selecionados.');
            }
        } catch (err) {
            console.error('Erro ao exportar PDF:', err);
            alert('Erro ao gerar PDF: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },
    // --- FUNÇÕES DE RASCUNHO (PERSISTÊNCIA) ---

    salvarRascunho() {
        // Não salva rascunho se estiver em modo de edição de um registro existente
        if (this.editingId) return;

        const data = {
            placa: this.coletaPlacaInput.value,
            km: document.getElementById('coletaKm').value,
            semana: document.getElementById('coletaSemana').value,
            dataHora: this.coletaDataHoraInput.value,
            usuario: this.coletaUsuarioInput.value,
            checklist: []
        };

        document.querySelectorAll('.checklist-item').forEach(item => {
            data.checklist.push({
                item: item.dataset.item,
                detalhes: item.querySelector('.checklist-details').value,
                status: item.querySelector('.checklist-status').value,
                oficina: item.querySelector('.oficina-selector')?.value || '',
                valor: item.querySelector('.checklist-valor')?.value || ''
            });
        });

        const extraInput = document.getElementById('extra-eletrica-interna')?.querySelector('input');
        if (extraInput) data.extraPecas = extraInput.value;

        sessionStorage.setItem('marquespan_coleta_draft', JSON.stringify(data));
    },

    restaurarRascunho() {
        // Não restaura se estiver editando um registro existente
        if (this.editingId) return;

        const saved = sessionStorage.getItem('marquespan_coleta_draft');
        if (!saved) return;

        try {
            const data = JSON.parse(saved);
            if (data.placa) {
                this.coletaPlacaInput.value = data.placa;
                this.preencherModeloVeiculo();
            }
            if (data.km) document.getElementById('coletaKm').value = data.km;
            if (data.semana) document.getElementById('coletaSemana').value = data.semana;
            if (data.dataHora) this.coletaDataHoraInput.value = data.dataHora;
            if (data.usuario) this.coletaUsuarioInput.value = data.usuario;

            if (data.checklist) {
                data.checklist.forEach(savedItem => {
                    const div = document.querySelector(`.checklist-item[data-item="${savedItem.item}"]`);
                    if (div) {
                        div.querySelector('.checklist-details').value = savedItem.detalhes || '';
                        const statusSelect = div.querySelector('.checklist-status');
                        statusSelect.value = savedItem.status || '';
                        // Dispara evento change para atualizar visibilidade de campos dependentes (oficina, valor)
                        statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        const oficinaSelect = div.querySelector('.oficina-selector');
                        if (oficinaSelect && savedItem.oficina) oficinaSelect.value = savedItem.oficina;
                        
                        const valorInput = div.querySelector('.checklist-valor');
                        if (valorInput && savedItem.valor) valorInput.value = savedItem.valor;
                    }
                });
            }

            if (data.extraPecas) {
                const extraDiv = document.getElementById('extra-eletrica-interna');
                if (extraDiv && !extraDiv.classList.contains('hidden')) {
                    extraDiv.querySelector('input').value = data.extraPecas;
                }
            }
            this.calcularValorTotal();
        } catch (e) {
            console.error("Erro ao restaurar rascunho", e);
        }
    },

    limparRascunho() {
        sessionStorage.removeItem('marquespan_coleta_draft');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ColetarManutencaoUI.init();
});
