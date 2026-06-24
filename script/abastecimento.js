import { supabaseClient } from './supabase.js';
import XLSX from "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";
import {
    exportarAuditoriaEstoquePDF as gerarAuditoriaEstoquePDF,
    exportarAuditoriaEstoqueXLSX as gerarAuditoriaEstoqueXLSX
} from './abastecimento/auditoria-estoque-export.js';
import {
    calcularEstoqueAntes as obterEstoqueAntes,
    calcularEstoqueAtual
} from './abastecimento/estoque-service.js';
import { criarLinhaDistribuicaoTanque } from './abastecimento/distribuicao-tanques.js';
import {
    montarPayloadExterno,
    montarPayloadPosto,
    montarPayloadsEntrada,
    montarPayloadsSaida
} from './abastecimento/formularios-service.js';
import {
    baixarModeloImportacaoExterno as gerarModeloImportacaoExterno,
    baixarModeloImportacaoSaida as gerarModeloImportacaoSaida
} from './abastecimento/modelos-importacao.js';
import {
    baixarRelatorioImportacaoExterna,
    importarAbastecimentoExterno
} from './abastecimento/importacao-externo.js';
import {
    buscarAbastecimentosEntrada,
    buscarAbastecimentosExternos,
    buscarPostosPaginados,
    buscarSaidasCombustivel
} from './abastecimento/historico-service.js';
import { importarPostos } from './abastecimento/importacao-postos.js';
import { 
    baixarRelatorioImportacaoSaida,
    montarPayloadsImportacaoSaida 
} from './abastecimento/importacao-saida.js';
import {
    buscarBicos,
    buscarFiliais,
    buscarMotoristasAtivos,
    buscarPostosParaDatalist,
    buscarRotas,
    buscarTanques,
    buscarVeiculos
} from './abastecimento/opcoes-service.js';
import {
    atualizarIconesOrdenacao,
    atualizarIconesOrdenacaoEntrada
} from './abastecimento/ordenacao-ui.js';
import { montarHtmlAuditoriaEstoque } from './abastecimento/tabela-auditoria-estoque.js';
import { montarHtmlEntradas } from './abastecimento/tabela-entradas.js';
import { montarHtmlEstoque } from './abastecimento/tabela-estoque.js';
import { filtrarOrdenarExternos, montarHtmlExternos } from './abastecimento/tabela-externo.js';
import { filtrarOrdenarPostos, montarHtmlPostos } from './abastecimento/tabela-postos.js';
import { filtrarOrdenarSaidas, montarHtmlSaidas } from './abastecimento/tabela-saidas.js';

const ABASTECIMENTO_PAGE_ID = 'abastecimento.html';
const NIVEIS_ABASTECIMENTO_EXTERNO_E_POSTOS = ['pr_encarregado', 'pr_lider'];

document.addEventListener('DOMContentLoaded', () => {
    const AbastecimentoUI = {
        async init() {
            this.tanquesDisponiveis = [];
            this.bicosDisponiveis = [];
            this.veiculosDisponiveis = []; // Cache para validação de placa
            this.sortState = { field: 'data', ascending: false }; // Estado inicial da ordenacao
            this.postosData = []; // Cache dos dados de postos
            this.postosSort = { key: 'razao_social', asc: true }; // Estado de ordenação dos postos
            this.extData = []; // Cache dos dados de abastecimento externo
            this.extSort = { key: 'data_hora', asc: false }; // Estado de ordenação externo
            this.saidasData = []; // Cache dos dados de saídas
            this.saidasSort = { key: 'data_hora', asc: false }; // Estado de ordenação das saídas
            this.saidaVeiculoLookupTimer = null;
            this.estoqueRealtimeChannel = null;
            this.estoqueRealtimeTimer = null;
            this.estoqueFallbackTimer = null;
            this.estoqueRefreshPendente = false;
            this.auditoriaEstoqueDados = [];
            const acessoPermitido = await this.verificarPermissaoPagina();
            if (!acessoPermitido) return;
            this.initTabs();
            this.cache();
            this.bind();
            this.aplicarRestricaoAbastecimentoExternoEPostos();

             // Define a data de hoje como padrão para o formulário de entrada e filtros
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            this.dataInput.value = now.toISOString().slice(0, 16);
            if (this.extDataHora) this.extDataHora.value = now.toISOString().slice(0, 16);
            if (this.filtroDataInicial) this.filtroDataInicial.value = new Date().toISOString().slice(0, 10);
            if (this.filtroDataFinal) this.filtroDataFinal.value = new Date().toISOString().slice(0, 10);

            // Adiciona para o filtro de saída
            if (this.filtroSaidaDataInicial) this.filtroSaidaDataInicial.value = new Date().toISOString().slice(0, 10);
            if (this.filtroSaidaDataFinal) this.filtroSaidaDataFinal.value = new Date().toISOString().slice(0, 10);

            // Adiciona para o filtro externo
            if (this.filtroExtDataInicial) this.filtroExtDataInicial.value = new Date().toISOString().slice(0, 10);
            if (this.filtroExtDataFinal) this.filtroExtDataFinal.value = new Date().toISOString().slice(0, 10);

            await this.loadTanques();
            this.renderTable();
            await this.initSaida(); // Inicializa a aba de saída
            this.renderSaidasTable();
            this.setupAuditoriaEstoque();
            await this.loadEstoqueAtual(); // Carrega a aba de estoque
            this.setupEstoqueRealtime();
            this.populateUFs(); // Preenche lista de UFs
            await this.handleInitialEditParams();

            await this.loadMotoristasOptions(); // Carrega motoristas para datalist externo
        },

        initTabs() {
            const buttons = document.querySelectorAll('#menu-abastecimento .painel-btn');
            const sections = document.querySelectorAll('.main-content .glass-panel');

            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.activateSection(btn.getAttribute('data-secao'));
                });
            });
        },

        cache() {
            this.form = document.getElementById('formAbastecimento');
            this.editingIdInput = document.getElementById('abastecimentoEditingId');
            this.dataInput = document.getElementById('absData');
            this.notaInput = document.getElementById('absNota');
            this.qtdTotalNotaInput = document.getElementById('absQtdTotalNota');
            this.vlrLitroInput = document.getElementById('absVlrLitro');
            this.totalInput = document.getElementById('absTotal');
            this.tableBody = document.getElementById('tableBodyAbastecimentos');
            this.btnSalvar = document.getElementById('btnSalvarAbs');
            this.btnLimpar = document.getElementById('btnLimparAbs');
            this.distribuicaoContainer = document.getElementById('distribuicao-container');
            this.btnAdicionarTanque = document.getElementById('btnAdicionarTanque');
            this.litrosRestantesValor = document.getElementById('litros-restantes-valor');

            // Elementos da Aba Saída
            this.formSaida = document.getElementById('formSaidaCombustivel');
            this.saidaEditingId = document.getElementById('saidaEditingId');
            this.saidaDataHora = document.getElementById('saidaDataHora');
            this.saidaUsuario = document.getElementById('saidaUsuario');
            this.saidaBico = document.getElementById('saidaBico');
            this.saidaVeiculo = document.getElementById('saidaVeiculo');
            this.listaVeiculos = document.getElementById('listaVeiculos'); // This is for veiculos, not motoristas
            this.saidaMotorista = document.getElementById('saidaMotorista');
            this.listaMotoristasSaida = document.getElementById('listaMotoristasSaida');
            this.saidaRota = document.getElementById('saidaRota');
            this.listaRotas = document.getElementById('listaRotas');
            this.saidaKm = document.getElementById('saidaKm');
            this.saidaLitros = document.getElementById('saidaLitros');
            this.btnSalvarSaida = document.getElementById('btnSalvarSaida');
            this.saidaBico2 = document.getElementById('saidaBico2');
            this.saidaLitros2 = document.getElementById('saidaLitros2');
            this.saidaDataReferencia = document.getElementById('saidaDataReferencia');
            this.btnToggleBico2 = document.getElementById('btnToggleBico2');
            this.camposBico2 = document.getElementById('camposBico2');
            this.tableBodySaidas = document.getElementById('tableBodySaidas');
            this.searchSaidaInput = document.getElementById('searchSaidaInput'); // Busca Saídas

            // Elementos da Aba Estoque
            this.tbodyEstoque = document.getElementById('tbodyEstoqueAtual');
            this.btnSalvarEstoque = document.getElementById('btnSalvarEstoque');
            this.auditoriaEstoqueContainer = document.getElementById('auditoriaEstoqueContainer');
            this.auditoriaEstoqueDataInicial = document.getElementById('auditoriaEstoqueDataInicial');
            this.auditoriaEstoqueDataFinal = document.getElementById('auditoriaEstoqueDataFinal');
            this.btnBuscarAuditoriaEstoque = document.getElementById('btnBuscarAuditoriaEstoque');
            this.btnExportarAuditoriaXLSX = document.getElementById('btnExportarAuditoriaXLSX');
            this.btnExportarAuditoriaPDF = document.getElementById('btnExportarAuditoriaPDF');
            this.tbodyAuditoriaEstoque = document.getElementById('tbodyAuditoriaEstoque');

            // Novos Elementos - Abastecimento Externo
            this.formExt = document.getElementById('formAbastecimentoExterno');
            this.extDataHora = document.getElementById('extDataHora'); // Novo
            this.extFilial = document.getElementById('extFilial');
            this.extPosto = document.getElementById('extPosto');
            this.extVeiculo = document.getElementById('extVeiculo');
            this.extTipo = document.getElementById('extTipo');
            this.extKmAtual = document.getElementById('extKmAtual');
            this.extKmAnterior = document.getElementById('extKmAnterior');
            this.extKmRodado = document.getElementById('extKmRodado');
            this.extRota = document.getElementById('extRota');
            this.extLitros = document.getElementById('extLitros'); // Novo
            this.extValorTotal = document.getElementById('extValorTotal'); // Novo
            this.extValorUnitario = document.getElementById('extValorUnitario'); // Novo
            this.extValorNegociadoDisplay = document.getElementById('extValorNegociadoDisplay'); // Novo Span de Valor Negociado
            this.extCapacidadeTanque = document.getElementById('extCapacidadeTanque'); // Span de capacidade
            this.extMediaKm = document.getElementById('extMediaKm'); // Novo Span de Média/KM
            this.btnImportarExterno = document.getElementById('btnImportarExterno'); // Novo Botão Importar
            this.fileImportarExterno = document.getElementById('fileImportarExterno'); // Novo Input File
            this.btnBaixarModeloExterno = document.getElementById('btnBaixarModeloExterno');
            this.tableBodyExt = document.getElementById('tableBodyAbastecimentoExterno');
            this.searchExtInput = document.getElementById('searchExtInput'); // Input de busca externo

            // Novos Elementos - Cadastro Posto
            this.formPosto = document.getElementById('formCadastroPosto');
            this.postoFilial = document.getElementById('postoFilial');
            this.postoRazao = document.getElementById('postoRazao');
            this.postoCnpj = document.getElementById('postoCnpj');
            this.postoCidade = document.getElementById('postoCidade');
            this.postoUf = document.getElementById('postoUf');
            this.postoFaturado = document.getElementById('postoFaturado');
            this.postoValorNegociadoInput = document.getElementById('postoValorNegociado'); // Adicionado ao cache
            this.tableBodyPostos = document.getElementById('tableBodyPostos');
            this.btnImportarPostos = document.getElementById('btnImportarPostos'); // Novo Botão Importar Postos
            this.fileImportarPostos = document.getElementById('fileImportarPostos'); // Novo Input File Postos
            this.extEditingId = null; // Variável para controlar edição
            this.postoEditingId = null; // Variável para controlar edição de posto
            this.extMotorista = document.getElementById('extMotorista'); // Novo campo Motorista
            this.listaMotoristasExt = document.getElementById('listaMotoristasExt'); // Datalist para Motorista
            this.filtroPostoFilial = document.getElementById('filtroPostoFilial');
            this.searchPostoInput = document.getElementById('searchPostoInput'); // Input de busca de postos
       // Elementos do filtro de histórico de entrada
            this.filtroDataInicial = document.getElementById('filtroDataInicial');

            // Elementos do Modal de Importação de Saída
            this.fileImportarSaida = document.getElementById('fileImportarSaida');
            this.filialImportacaoSaida = document.getElementById('filialImportacaoSaida'); // Moved to sectionSaida
            this.btnBaixarModeloSaida = document.getElementById('btnBaixarModeloSaida'); // Moved to sectionSaida
            this.btnAbrirImportacaoSaida = document.getElementById('btnAbrirImportacaoSaida');
            // Removed: this.modalImportarSaida, this.closeModalImportarSaida, this.btnCancelarImportacaoSaida, this.formImportarSaida, this.arquivoImportacaoSaida
            
            this.filtroDataFinal = document.getElementById('filtroDataFinal');
            this.btnFiltrarHistorico = document.getElementById('btnFiltrarHistorico');

            // Elementos do filtro de histórico de SAÍDA
            this.filtroSaidaDataInicial = document.getElementById('filtroSaidaDataInicial');
            this.filtroSaidaDataFinal = document.getElementById('filtroSaidaDataFinal');
            this.filtroSaidaTanque = document.getElementById('filtroSaidaTanque');
            this.btnFiltrarHistoricoSaida = document.getElementById('btnFiltrarHistoricoSaida');

            // Elementos do filtro de histórico EXTERNO
            this.filtroExtFilial = document.getElementById('filtroExtFilial');
            this.filtroExtDataInicial = document.getElementById('filtroExtDataInicial');
            this.filtroExtDataFinal = document.getElementById('filtroExtDataFinal');
            this.btnFiltrarHistoricoExt = document.getElementById('btnFiltrarHistoricoExt');

        },

        bind() {
            document.getElementById('btnToggleMenuLateral')?.addEventListener('click', this.toggleMenuLateral.bind(this));
            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.tableBody.addEventListener('click', this.handleTableClick.bind(this));
            this.btnLimpar.addEventListener('click', this.clearForm.bind(this));
            
            
            // Importação Saída
            if (this.btnAbrirImportacaoSaida) {
                this.btnAbrirImportacaoSaida.addEventListener('click', () => {
                    this.fileImportarSaida.click();
                });
            }
            if (this.fileImportarSaida) {
                this.fileImportarSaida.addEventListener('change', (e) => this.handleImportarSaida(e));
            }
            if (this.btnBaixarModeloSaida) {
                this.btnBaixarModeloSaida.addEventListener('click', this.baixarModeloImportacaoSaida.bind(this));
            }
            
            
            
            
            // Cálculo automático do total
            this.qtdTotalNotaInput.addEventListener('input', this.calculateTotal.bind(this));
            this.vlrLitroInput.addEventListener('input', this.calculateTotal.bind(this));

            this.btnAdicionarTanque.addEventListener('click', () => this.adicionarLinhaTanque());
            this.distribuicaoContainer.addEventListener('input', this.updateLitrosRestantes.bind(this));
            this.distribuicaoContainer.addEventListener('click', this.handleDistribuicaoClick.bind(this));

            this.formSaida.addEventListener('submit', this.handleSaidaSubmit.bind(this));
            this.tableBodySaidas.addEventListener('click', this.handleSaidaTableClick.bind(this));

            // Toggle Bico 2
            if (this.btnToggleBico2) {
                this.btnToggleBico2.addEventListener('click', () => {
                    const isHidden = this.camposBico2.classList.contains('hidden');
                    if (isHidden) {
                        this.camposBico2.classList.remove('hidden');
                        this.btnToggleBico2.innerHTML = '<i class="fas fa-minus"></i> Remover 2º Bico';
                        this.btnToggleBico2.style.backgroundColor = '#dc3545'; // Red
                    } else {
                        this.camposBico2.classList.add('hidden');
                        this.saidaBico2.value = '';
                        this.saidaLitros2.value = '';
                        this.btnToggleBico2.innerHTML = '<i class="fas fa-plus"></i> Adicionar 2º Bico';
                        this.btnToggleBico2.style.backgroundColor = '#6c757d'; // Gray
                    }
                });
            }

            if (this.btnSalvarEstoque) this.btnSalvarEstoque.addEventListener('click', this.handleSalvarEstoque.bind(this));
            if (this.tbodyEstoque) this.tbodyEstoque.addEventListener('change', this.handleEstoqueChange.bind(this));
            if (this.tbodyEstoque) this.tbodyEstoque.addEventListener('input', this.handleEstoqueChange.bind(this));
            if (this.btnBuscarAuditoriaEstoque) this.btnBuscarAuditoriaEstoque.addEventListener('click', this.renderAuditoriaEstoque.bind(this));
            if (this.btnExportarAuditoriaXLSX) this.btnExportarAuditoriaXLSX.addEventListener('click', this.exportarAuditoriaEstoqueXLSX.bind(this));
            if (this.btnExportarAuditoriaPDF) this.btnExportarAuditoriaPDF.addEventListener('click', this.exportarAuditoriaEstoquePDF.bind(this));
            if (this.tbodyAuditoriaEstoque) this.tbodyAuditoriaEstoque.addEventListener('click', this.handleAuditoriaEstoqueClick.bind(this));

            // Listeners para Busca e Ordenação de Saídas
            if (this.searchSaidaInput) {
                this.searchSaidaInput.addEventListener('input', () => this.renderSaidasTable(false));
            }

            // Busca o Último KM ao selecionar um veículo (Aba Saída)
            if (this.saidaVeiculo) {
                const atualizarDadosSaidaPorPlaca = (e, delay = 300) => {
                    clearTimeout(this.saidaVeiculoLookupTimer);
                    const placa = e.target.value;
                    this.saidaVeiculoLookupTimer = setTimeout(() => {
                        this.buscarUltimoKm(placa);
                        this.buscarDadosRetornoRota(placa);
                    }, delay);
                };
                this.saidaVeiculo.addEventListener('input', (e) => atualizarDadosSaidaPorPlaca(e));
                this.saidaVeiculo.addEventListener('change', (e) => atualizarDadosSaidaPorPlaca(e, 0));
            }
            if (this.saidaDataHora) {
                this.saidaDataHora.addEventListener('change', () => {
                    if (this.saidaVeiculo?.value) {
                        this.buscarDadosRetornoRota(this.saidaVeiculo.value);
                    }
                });
            }
            document.querySelectorAll('.sortable-saida').forEach(th => {
                th.addEventListener('click', () => {
                    const key = th.dataset.sort;
                    if (this.saidasSort.key === key) {
                        this.saidasSort.asc = !this.saidasSort.asc;
                    } else {
                        this.saidasSort.key = key;
                        this.saidasSort.asc = true;
                    }
                    this.renderSaidasTable(false);
                });
            });

            // Listeners para ordenação da tabela de histórico
            const ths = document.querySelectorAll('#containerHistoricoEntrada th[data-field]');
            ths.forEach(th => {
                th.addEventListener('click', () => this.handleSort(th.dataset.field));
            });
// Listener para o filtro de histórico
            if (this.btnFiltrarHistorico) {
                this.btnFiltrarHistorico.addEventListener('click', () => this.renderTable());
            }
            
            // Listener para o filtro de histórico de SAÍDA
            if (this.btnFiltrarHistoricoSaida) {
                this.btnFiltrarHistoricoSaida.addEventListener('click', () => this.renderSaidasTable(true));
            }
            if (this.filtroSaidaTanque) {
                this.filtroSaidaTanque.addEventListener('change', () => this.renderSaidasTable(true));
            }
            // Listener para o filtro de histórico EXTERNO
            if (this.btnFiltrarHistoricoExt) {
                this.btnFiltrarHistoricoExt.addEventListener('click', () => this.renderExtTable(true));
            }
            if (this.filtroExtFilial) {
                this.filtroExtFilial.addEventListener('change', () => {
                    this.loadPostosOptions();
                    this.renderExtTable(true);
                });
            }
            // Listeners Abastecimento Externo
            if (this.formExt) this.formExt.addEventListener('submit', this.handleExtSubmit.bind(this));
            if (this.extVeiculo) this.extVeiculo.addEventListener('change', this.handleExtVeiculoChange.bind(this));
            if (this.extDataHora) {
                this.extDataHora.addEventListener('change', () => {
                    if (this.extVeiculo?.value) {
                        this.buscarDadosRetornoRota(this.extVeiculo.value, this.extRota, this.extMotorista, this.extDataHora.value);
                    }
                });
            }
            if (this.extKmAtual) this.extKmAtual.addEventListener('input', this.calculateKmRodado.bind(this));
            if (this.extLitros) this.extLitros.addEventListener('input', this.calculateExtValorUnitario.bind(this));
            if (this.extValorTotal) this.extValorTotal.addEventListener('input', this.calculateExtValorUnitario.bind(this));
            if (this.extPosto) this.extPosto.addEventListener('change', this.handleExtPostoChange.bind(this)); // Listener para o posto

            // Listener para Tabela Externa (Editar/Excluir)
            if (this.tableBodyExt) this.tableBodyExt.addEventListener('click', (e) => this.handleExtTableClick(e));

            // Listeners para Busca e Ordenação de Abastecimento Externo
            if (this.searchExtInput) {
                this.searchExtInput.addEventListener('input', () => this.renderExtTable(false));
            }
            document.querySelectorAll('.sortable-ext').forEach(th => {
                th.addEventListener('click', () => {
                    const key = th.dataset.sort;
                    if (this.extSort.key === key) {
                        this.extSort.asc = !this.extSort.asc;
                    } else {
                        this.extSort.key = key;
                        this.extSort.asc = true;
                    }
                    this.renderExtTable(false);
                });
            });

            // Listener para Tabela de Postos (Editar/Excluir)
            if (this.tableBodyPostos) this.tableBodyPostos.addEventListener('click', (e) => this.handlePostoTableClick(e));

            // Listeners para Busca e Ordenação de Postos
            if (this.searchPostoInput) {
                this.searchPostoInput.addEventListener('input', () => this.renderPostosTable(false));
            }
            if (this.filtroPostoFilial) {
                this.filtroPostoFilial.addEventListener('change', () => this.renderPostosTable(true));
            }
            document.querySelectorAll('.sortable-posto').forEach(th => {
                th.addEventListener('click', () => {
                    const key = th.dataset.sort;
                    if (this.postosSort.key === key) {
                        this.postosSort.asc = !this.postosSort.asc;
                    } else {
                        this.postosSort.key = key;
                        this.postosSort.asc = true;
                    }
                    this.renderPostosTable(false);
                });
            });

            // Listeners Importação
            if (this.btnImportarExterno && this.fileImportarExterno) {
                this.btnImportarExterno.addEventListener('click', () => this.fileImportarExterno.click());
                this.fileImportarExterno.addEventListener('change', (e) => this.handleImportarExterno(e));
            }
            if (this.btnBaixarModeloExterno) {
                this.btnBaixarModeloExterno.addEventListener('click', this.baixarModeloImportacaoExterno.bind(this));
            }

            // Listeners Importação Postos
            if (this.btnImportarPostos && this.fileImportarPostos) {
                this.btnImportarPostos.addEventListener('click', () => this.fileImportarPostos.click());
                this.fileImportarPostos.addEventListener('change', (e) => this.handleImportarPostos(e));
            }

            // Listeners Cadastro Posto
            if (this.formPosto) this.formPosto.addEventListener('submit', this.handlePostoSubmit.bind(this));

            if (this.postoRazao) {
                this.postoRazao.addEventListener('input', (e) => {
                    e.target.value = e.target.value.toUpperCase();
                });
            }

            if (this.extFilial) {
                this.extFilial.addEventListener('change', () => this.loadPostosOptions());
            }
            if (this.extMotorista) this.extMotorista.addEventListener('input', (e) => e.target.value = e.target.value.toUpperCase());

            // Inicialização das novas abas
            this.loadFiliaisOptions();
            this.loadRotasOptions();
            if (this.tableBodyPostos) this.renderPostosTable();
            if (this.tableBodyExt) this.renderExtTable();

            // Inject Bulk Delete Button for Admin in External Supply Tab
            if (this.getUserLevel() === 'administrador' && this.searchExtInput) {
                const btn = document.createElement('button');
                btn.id = 'btnBulkDeleteExt';
                btn.style.cssText = 'background-color: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; display: none; margin-left: 10px; font-size: 14px; vertical-align: middle;';
                btn.innerHTML = '<i class="fas fa-trash"></i> Excluir Selecionados';
                btn.onclick = () => this.handleBulkDeleteExt();
                // Insert after the search input
                this.searchExtInput.parentNode.insertBefore(btn, this.searchExtInput.nextSibling);
            }
        },

        toggleMenuLateral() {
            document.body.classList.toggle('abastecimento-menu-oculto');
            const oculto = document.body.classList.contains('abastecimento-menu-oculto');
            const btn = document.getElementById('btnToggleMenuLateral');
            if (btn) {
                btn.title = oculto ? 'Mostrar menu lateral' : 'Ocultar menu lateral';
                btn.setAttribute('aria-label', btn.title);
            }
        },

        populateUFs() {
            if (!this.postoUf) return;
            
            const ufs = [
                'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 
                'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
            ];

            if (this.postoUf.tagName === 'SELECT') {
                this.postoUf.innerHTML = '<option value="">UF</option>';
                ufs.forEach(uf => {
                    this.postoUf.add(new Option(uf, uf));
                });
            } else {
                const datalistId = 'listaUFs';
                let datalist = document.getElementById(datalistId);
                if (!datalist) {
                    datalist = document.createElement('datalist');
                    datalist.id = datalistId;
                    document.body.appendChild(datalist);
                }
                datalist.innerHTML = '';
                ufs.forEach(uf => {
                    const option = document.createElement('option');
                    option.value = uf;
                    datalist.appendChild(option);
                });
                this.postoUf.setAttribute('list', datalistId);
                this.postoUf.setAttribute('placeholder', 'UF');
                this.postoUf.style.textTransform = 'uppercase';
                this.postoUf.addEventListener('input', (e) => {
                    e.target.value = e.target.value.toUpperCase();
                });
            }
        },

        getUsuarioLogado() {
            try {
                const usuarioLogado = localStorage.getItem('usuarioLogado');
                if (usuarioLogado) {
                    const usuario = JSON.parse(usuarioLogado);
                    return usuario.nome || 'Desconhecido';
                }
            } catch (e) { console.error(e); }
            return 'Desconhecido';
        },

        getUserFilial() {
            try {
                const usuarioLogado = localStorage.getItem('usuarioLogado');
                if (usuarioLogado) {
                    const usuario = JSON.parse(usuarioLogado);
                    return usuario.filial || '';
                }
            } catch (e) { console.error(e); }
            return '';
        },

        getFilialUsuarioSelecionavel() {
            const userFilial = this.getUserFilial();
            if (!userFilial) return '';

            const filialNormalizada = String(userFilial).trim().toUpperCase();
            const matchingFilial = (this.filiaisCache || []).find(f => {
                const nome = String(f.nome || '').trim().toUpperCase();
                const sigla = String(f.sigla || '').trim().toUpperCase();
                const valor = String(f.sigla || f.nome || '').trim().toUpperCase();
                return nome === filialNormalizada || sigla === filialNormalizada || valor === filialNormalizada;
            });

            return matchingFilial ? (matchingFilial.sigla || matchingFilial.nome || userFilial) : userFilial;
        },

        getValoresFilialUsuario() {
            const userFilial = this.getUserFilial();
            if (!userFilial) return [];

            const filialNormalizada = String(userFilial).trim().toUpperCase();
            const valores = new Set([userFilial]);
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

        registroPertenceFilialUsuario(valorFilial) {
            const valores = this.getValoresFilialUsuario().map(valor => String(valor).trim().toUpperCase());
            return valores.length === 0 || valores.includes(String(valorFilial || '').trim().toUpperCase());
        },

        aplicarBloqueioFilialExterna() {
            if (!this.extFilial) return;

            const userFilial = this.getUserFilial();
            if (!userFilial) {
                this.extFilial.disabled = false;
                this.extFilial.title = '';
                return;
            }

            const valorFilial = this.getFilialUsuarioSelecionavel();
            if (valorFilial && !Array.from(this.extFilial.options).some(option => option.value === valorFilial)) {
                this.extFilial.add(new Option(valorFilial, valorFilial));
            }

            this.extFilial.value = valorFilial;
            this.extFilial.disabled = true;
            this.extFilial.title = 'Filial definida pelo usuario logado.';
        },

        getFilialAbastecimentoExterno() {
            return this.getUserFilial() ? this.getFilialUsuarioSelecionavel() : (this.extFilial?.value || '');
        },

        getFilialFiltroExternoSelecionada() {
            return this.getUserFilial() ? this.getFilialUsuarioSelecionavel() : (this.filtroExtFilial?.value || '');
        },

        getValoresFiltroExterno() {
            const filialSelecionada = this.getFilialFiltroExternoSelecionada();
            if (!filialSelecionada) return [];

            const filialNormalizada = String(filialSelecionada).trim().toUpperCase();
            const valores = new Set([filialSelecionada]);
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

        aplicarBloqueioFiltroExterno() {
            if (!this.filtroExtFilial) return;

            const userFilial = this.getUserFilial();
            if (!userFilial) {
                this.filtroExtFilial.disabled = false;
                this.filtroExtFilial.title = '';
                return;
            }

            const valorFilial = this.getFilialUsuarioSelecionavel();
            if (valorFilial && !Array.from(this.filtroExtFilial.options).some(option => option.value === valorFilial)) {
                this.filtroExtFilial.add(new Option(valorFilial, valorFilial));
            }

            this.filtroExtFilial.value = valorFilial;
            this.filtroExtFilial.disabled = true;
            this.filtroExtFilial.title = 'Filial definida pelo usuario logado.';
        },

        aplicarBloqueioFilialPosto() {
            if (!this.postoFilial) return;

            const userFilial = this.getUserFilial();
            if (!userFilial) {
                this.postoFilial.disabled = false;
                this.postoFilial.title = '';
                return;
            }

            const valorFilial = this.getFilialUsuarioSelecionavel();
            if (valorFilial && !Array.from(this.postoFilial.options).some(option => option.value === valorFilial)) {
                this.postoFilial.add(new Option(valorFilial, valorFilial));
            }

            this.postoFilial.value = valorFilial;
            this.postoFilial.disabled = true;
            this.postoFilial.title = 'Filial definida pelo usuario logado.';
        },

        getFilialCadastroPosto() {
            return this.getUserFilial() ? this.getFilialUsuarioSelecionavel() : (this.postoFilial?.value || '');
        },

        getValoresFiltroPostos() {
            const filialSelecionada = this.getUserFilial()
                ? this.getFilialUsuarioSelecionavel()
                : (this.filtroPostoFilial?.value || '');

            if (!filialSelecionada) return [];

            const filialNormalizada = String(filialSelecionada).trim().toUpperCase();
            const valores = new Set([filialSelecionada]);
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

        aplicarBloqueioFiltroPostos() {
            if (!this.filtroPostoFilial) return;

            const userFilial = this.getUserFilial();
            if (!userFilial) {
                this.filtroPostoFilial.disabled = false;
                this.filtroPostoFilial.title = '';
                return;
            }

            const valorFilial = this.getFilialUsuarioSelecionavel();
            if (valorFilial && !Array.from(this.filtroPostoFilial.options).some(option => option.value === valorFilial)) {
                this.filtroPostoFilial.add(new Option(valorFilial, valorFilial));
            }

            this.filtroPostoFilial.value = valorFilial;
            this.filtroPostoFilial.disabled = true;
            this.filtroPostoFilial.title = 'Filial definida pelo usuario logado.';
        },

        getUserLevel() {
            try {
                const usuarioLogado = localStorage.getItem('usuarioLogado');
                if (usuarioLogado) {
                    const usuario = JSON.parse(usuarioLogado);
                    return (usuario.nivel || '').toLowerCase();
                }
            } catch (e) { console.error(e); }
            return '';
        },

        async verificarPermissaoPagina() {
            const nivel = this.getUserLevel();

            if (!nivel) {
                window.location.href = 'index.html';
                return false;
            }

            if (nivel === 'administrador') return true;

            try {
                const { data, error } = await supabaseClient
                    .from('nivel_permissoes')
                    .select('paginas_permitidas')
                    .eq('nivel', nivel)
                    .single();
                if (error) throw error;
                if ((data?.paginas_permitidas || []).includes(ABASTECIMENTO_PAGE_ID)) return true;
            } catch (error) {
                console.error('Erro ao validar permissao de abastecimento:', error);
            }

            document.body.innerHTML = '<div style="text-align:center; padding:50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
            return false;
        },

        canViewEstoqueAuditoria() {
            return ['administrador', 'gerencia', 'adm_logistica'].includes(this.getUserLevel());
        },

        setupAuditoriaEstoque() {
            if (!this.auditoriaEstoqueContainer) return;

            const canView = this.canViewEstoqueAuditoria();
            this.auditoriaEstoqueContainer.classList.toggle('hidden', !canView);

            if (canView && this.tbodyAuditoriaEstoque) {
                this.tbodyAuditoriaEstoque.innerHTML = '<tr><td colspan="8" class="text-center">Selecione uma data e clique em Buscar.</td></tr>';
            }
        },

        calculateTotal() {
            const qtd = parseFloat(this.qtdTotalNotaInput.value.replace(',', '.')) || 0;
            const vlr = parseFloat(this.vlrLitroInput.value.replace(',', '.')) || 0;
            const total = qtd * vlr;
            
            this.totalInput.value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        },

        async loadTanques() {
            try {
                this.tanquesDisponiveis = await buscarTanques(supabaseClient, this.getUserFilial());
                this.preencherFiltroTanqueSaida();
                this.adicionarLinhaTanque(); // Adiciona a primeira linha para a ENTRADA
            } catch (error) {
                console.error('Erro ao carregar tanques:', error);
            }
        },

        preencherFiltroTanqueSaida() {
            if (!this.filtroSaidaTanque) return;

            const valorAtual = this.filtroSaidaTanque.value;
            this.filtroSaidaTanque.innerHTML = '<option value="">Todos</option>';

            (this.tanquesDisponiveis || []).forEach(tanque => {
                const option = new Option(
                    `${tanque.nome} (${tanque.tipo_combustivel || 'Combustivel'})`,
                    tanque.id
                );
                this.filtroSaidaTanque.appendChild(option);
            });

            if (valorAtual && Array.from(this.filtroSaidaTanque.options).some(option => option.value === valorAtual)) {
                this.filtroSaidaTanque.value = valorAtual;
            }
        },

        parseLitros(value) {
            if (typeof value === 'number') return value;
            if (!value) return 0;
            return parseFloat(String(value).replace(/\./g, '').replace(',', '.'));
        },

        formatLitros(value) {
            const numero = parseFloat(value);
            if (isNaN(numero)) return '0,00';
            return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },

        escapeHTML(value) {
            const div = document.createElement('div');
            div.textContent = value ?? '';
            return div.innerHTML;
        },

        atualizarDiferencaEstoque(input) {
            const tr = input.closest('tr');
            if (!tr) return;

            const estoqueAnterior = parseFloat(tr.dataset.calculatedStock);
            const novoEstoque = this.parseLitros(input.value);
            const diferencaCell = tr.querySelector('.estoque-diferenca');

            if (!diferencaCell || isNaN(estoqueAnterior) || isNaN(novoEstoque)) {
                if (diferencaCell) {
                    diferencaCell.textContent = '-';
                    diferencaCell.className = 'estoque-diferenca';
                }
                return;
            }

            const diferenca = novoEstoque - estoqueAnterior;
            diferencaCell.textContent = `${diferenca > 0 ? '+' : ''}${this.formatLitros(diferenca)} L`;
            diferencaCell.className = 'estoque-diferenca';
            if (diferenca > 0.001) diferencaCell.classList.add('diferenca-positiva');
            else if (diferenca < -0.001) diferencaCell.classList.add('diferenca-negativa');
            else diferencaCell.classList.add('diferenca-zero');
        },

        atualizarNivelEstoque(input) {
            const tr = input.closest('tr');
            if (!tr) return;

            const capacidade = parseFloat(input.dataset.capacidade);
            const novoEstoque = this.parseLitros(input.value);
            const barra = tr.querySelector('.estoque-nivel-barra');
            const percentualEl = tr.querySelector('.estoque-nivel-percentual');

            if (!barra || !percentualEl || isNaN(capacidade) || capacidade <= 0 || isNaN(novoEstoque)) return;

            const percentual = Math.round((novoEstoque / capacidade) * 100);
            const percentualVisual = Math.max(0, Math.min(percentual, 100));
            let color = '#006937';

            if (percentual < 20) color = '#dc3545';
            else if (percentual < 50) color = '#ffc107';

            barra.style.width = `${percentualVisual}%`;
            barra.style.background = color;
            percentualEl.textContent = `${percentual}%`;
            percentualEl.style.color = color;
        },

        toggleEstoqueAuditoriaColumns(canView) {
            const tabela = this.tbodyEstoque?.closest('table');
            if (!tabela) return;

            const headerCells = tabela.querySelectorAll('thead th');
            [4, 6].forEach(index => {
                if (headerCells[index]) headerCells[index].style.display = canView ? '' : 'none';
            });
        },

        activateSection(sectionId) {
            if (this.usuarioSomenteAbastecimentoExternoEPostos() && !['sectionExterno', 'sectionPostos'].includes(sectionId)) {
                sectionId = 'sectionExterno';
            }

            const buttons = document.querySelectorAll('#menu-abastecimento .painel-btn');
            const sections = document.querySelectorAll('.main-content .glass-panel');

            buttons.forEach(btn => {
                const isActive = btn.getAttribute('data-secao') === sectionId;
                btn.classList.toggle('active', isActive);
            });
            sections.forEach(section => section.classList.add('hidden'));
            document.getElementById(sectionId)?.classList.remove('hidden');
        },

        usuarioSomenteAbastecimentoExternoEPostos() {
            return NIVEIS_ABASTECIMENTO_EXTERNO_E_POSTOS.includes(this.getUserLevel());
        },

        aplicarRestricaoAbastecimentoExternoEPostos() {
            if (!this.usuarioSomenteAbastecimentoExternoEPostos()) return;

            document.querySelectorAll('#menu-abastecimento .painel-btn').forEach(btn => {
                const secao = btn.getAttribute('data-secao');
                const permitido = ['sectionExterno', 'sectionPostos'].includes(secao);
                btn.classList.toggle('hidden', !permitido);
                btn.style.display = permitido ? '' : 'none';
            });

            document.querySelector('a[href="mobile-abastecimento.html"]')?.classList.add('hidden');
            this.btnImportarPostos?.classList.add('hidden');
            this.fileImportarPostos?.classList.add('hidden');
            this.activateSection('sectionExterno');
        },

        async handleInitialEditParams() {
            const params = new URLSearchParams(window.location.search);
            const tipo = (params.get('tipo') || '').toUpperCase();
            const id = params.get('id');

            if (!tipo || !id) return;
            if (this.usuarioSomenteAbastecimentoExternoEPostos() && tipo !== 'EXTERNO') {
                this.activateSection('sectionExterno');
                alert('Seu nivel permite acessar somente Abastecimento Externo e Cadastro de Posto.');
                return;
            }

            try {
                if (tipo === 'ENTRADA' || tipo === 'AJUSTE') {
                    if (tipo === 'AJUSTE') {
                        this.activateSection('sectionEstoque');
                        await this.loadAjusteForEditing(id);
                    } else {
                        this.activateSection('sectionEntrada');
                        await this.loadEntradaForEditing(id);
                    }
                } else if (tipo === 'SAIDA') {
                    this.activateSection('sectionSaida');
                    await this.loadSaidaForEditing(id);
                } else if (tipo === 'EXTERNO') {
                    this.activateSection('sectionExterno');
                    await this.editExt(id);
                }
            } catch (error) {
                console.error('Erro ao abrir lançamento para edição:', error);
                alert('Não foi possível carregar o lançamento para edição.');
            }
        },

        getReturnUrl() {
            const params = new URLSearchParams(window.location.search);
            const returnTo = params.get('returnTo');
            return returnTo === 'relatorio-abastecimento.html' ? returnTo : null;
        },

        returnAfterSaveIfNeeded() {
            const returnUrl = this.getReturnUrl();
            if (!returnUrl) return false;
            window.location.href = returnUrl;
            return true;
        },

        setupEstoqueRealtime() {
            if (!this.tbodyEstoque) return;

            if (this.estoqueRealtimeChannel) {
                supabaseClient.removeChannel(this.estoqueRealtimeChannel);
            }
            if (this.estoqueFallbackTimer) {
                clearInterval(this.estoqueFallbackTimer);
            }

            const agendarRefresh = () => this.scheduleEstoqueRefresh();

            this.estoqueRealtimeChannel = supabaseClient
                .channel('abastecimento-estoque-atual')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'abastecimentos' }, agendarRefresh)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'saidas_combustivel' }, agendarRefresh)
                .subscribe((status) => {
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.warn('Realtime do estoque indisponivel. Mantendo atualizacao periodica.');
                    }
                });

            this.estoqueFallbackTimer = setInterval(() => this.scheduleEstoqueRefresh(), 30000);

            window.addEventListener('beforeunload', () => {
                if (this.estoqueRealtimeChannel) supabaseClient.removeChannel(this.estoqueRealtimeChannel);
                if (this.estoqueFallbackTimer) clearInterval(this.estoqueFallbackTimer);
            }, { once: true });
        },

        scheduleEstoqueRefresh() {
            clearTimeout(this.estoqueRealtimeTimer);

            this.estoqueRealtimeTimer = setTimeout(() => {
                const inputEmEdicao = document.activeElement?.classList?.contains('input-estoque-atual');
                if (inputEmEdicao) {
                    this.estoqueRefreshPendente = true;
                    document.activeElement.addEventListener('blur', () => {
                        if (!this.estoqueRefreshPendente) return;
                        this.estoqueRefreshPendente = false;
                        this.loadEstoqueAtual(false);
                    }, { once: true });
                    return;
                }

                this.loadEstoqueAtual(false);
            }, 600);
        },

        async loadEstoqueAtual(showLoading = true) {
            if (!this.tbodyEstoque) return;
            const canViewAuditoria = this.canViewEstoqueAuditoria();
            const totalColunas = canViewAuditoria ? 7 : 5;
            this.toggleEstoqueAuditoriaColumns(canViewAuditoria);
            if (showLoading) {
                this.tbodyEstoque.innerHTML = `<tr><td colspan="${totalColunas}" class="text-center">Carregando...</td></tr>`;
            }

            try {
                const estoqueCalculado = await calcularEstoqueAtual(supabaseClient, this.getUserFilial());
                // 5. Renderizar a tabela
                this.tbodyEstoque.innerHTML = montarHtmlEstoque(estoqueCalculado, {
                    canViewAuditoria,
                    formatLitros: this.formatLitros.bind(this),
                    totalColunas
                });
            } catch (error) {
                console.error('Erro ao carregar estoque:', error);
                this.tbodyEstoque.innerHTML = `<tr><td colspan="${totalColunas}" class="text-center text-danger">Erro ao carregar dados.</td></tr>`;
            }
        },

        handleEstoqueChange(e) {
            if (!e.target.classList.contains('input-estoque-atual')) return;
            const input = e.target;
            const rawValue = input.value;
            const normalizedValue = this.parseLitros(rawValue);
            const capacidade = parseFloat(input.dataset.capacidade);

            if (e.type === 'change' && !isNaN(normalizedValue) && !isNaN(capacidade) && normalizedValue > capacidade) {
                alert(`O valor informado excede a capacidade máxima do tanque (${capacidade.toLocaleString('pt-BR')} L).`);
                input.value = this.formatLitros(capacidade);
            }
            this.atualizarNivelEstoque(input);
            this.atualizarDiferencaEstoque(input);
        },

        async handleSalvarEstoque() {
            const dataAjuste = new Date().toISOString();
            const usuario = this.getUsuarioLogado();
            const ajustes = [];
            let erroCapacidade = false;

            this.tbodyEstoque.querySelectorAll('tr').forEach(tr => {
                if (erroCapacidade) return;
                const input = tr.querySelector('.input-estoque-atual');
                if (!input) return;

                const tanqueId = input.dataset.id;
                const estoqueCalculado = parseFloat(tr.dataset.calculatedStock);
                
                // Converte o valor do input (formato PT-BR) para float
                const rawValue = input.value;
                const novoEstoque = this.parseLitros(rawValue);
                const capacidade = parseFloat(input.dataset.capacidade);

                if (isNaN(estoqueCalculado) || isNaN(novoEstoque)) return;

                if (!isNaN(capacidade) && novoEstoque > capacidade) {
                    alert(`O valor informado para o tanque excede a capacidade máxima (${capacidade.toLocaleString('pt-BR')} L).`);
                    erroCapacidade = true;
                    return;
                }

                const delta = novoEstoque - estoqueCalculado;

                // Cria uma transação apenas se houver diferença
                if (Math.abs(delta) > 0.001) {
                    ajustes.push({
                        data: dataAjuste,
                        numero_nota: 'AJUSTE DE ESTOQUE',
                        tanque_id: parseInt(tanqueId),
                        qtd_litros: delta, // Pode ser positivo ou negativo
                        valor_litro: novoEstoque,
                        valor_total: novoEstoque,
                        usuario: usuario
                    });
                }
            });

            if (erroCapacidade) return;

            if (ajustes.length === 0) {
                alert('Nenhum ajuste necessário. Estoque conferido e abas liberadas.');
                this.unlockTabs(); // Libera as abas pois o estoque foi conferido (mesmo sem alterações)
                return;
            }

            try {
                this.btnSalvarEstoque.disabled = true;
                this.btnSalvarEstoque.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

                const { error } = await supabaseClient.from('abastecimentos').insert(ajustes);
                if (error) throw error;

                alert('Ajuste(s) de estoque salvo(s) com sucesso!');
                await this.loadEstoqueAtual(); // Recarrega para mostrar os novos valores calculados
                if (this.canViewEstoqueAuditoria() && this.auditoriaEstoqueDataInicial?.value && this.auditoriaEstoqueDataFinal?.value) {
                    await this.renderAuditoriaEstoque();
                }

            } catch (error) {
                console.error('Erro ao salvar ajuste de estoque:', error);
                alert('Erro ao salvar ajuste: ' + error.message);
            } finally {
                this.btnSalvarEstoque.disabled = false;
                this.btnSalvarEstoque.innerHTML = '<i class="fas fa-save"></i> Atualizar Estoque';
            }
        },

        async calcularEstoqueAntes(tanqueId, dataHora) {
            return obterEstoqueAntes(supabaseClient, tanqueId, dataHora);
        },

        getDataSaoPaulo(valor) {
            return new Date(valor).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        },

        agruparSaidasPorTanqueDia(saidas) {
            const mapa = new Map();

            (saidas || []).forEach(saida => {
                const tanqueId = saida.bicos?.bombas?.tanque_id;
                if (!tanqueId || !saida.data_hora) return;

                const data = this.getDataSaoPaulo(saida.data_hora);
                const chave = `${tanqueId}|${data}`;
                mapa.set(chave, (mapa.get(chave) || 0) + (parseFloat(saida.qtd_litros) || 0));
            });

            return mapa;
        },

        async renderAuditoriaEstoque() {
            if (!this.canViewEstoqueAuditoria() || !this.tbodyAuditoriaEstoque) return;

            const dataInicial = this.auditoriaEstoqueDataInicial?.value;
            const dataFinal = this.auditoriaEstoqueDataFinal?.value;
            if (!dataInicial || !dataFinal) {
                alert('Selecione o período De e Até para buscar a auditoria.');
                return;
            }

            if (dataInicial > dataFinal) {
                alert('A data inicial não pode ser maior que a data final.');
                return;
            }

            this.tbodyAuditoriaEstoque.innerHTML = '<tr><td colspan="9" class="text-center">Buscando ajustes...</td></tr>';

            try {
                const [ajustesResult, saidasResult] = await Promise.all([
                    supabaseClient
                        .from('abastecimentos')
                        .select('id, data, usuario, tanque_id, qtd_litros, valor_litro, valor_total, tanques(nome, tipo_combustivel)')
                        .eq('numero_nota', 'AJUSTE DE ESTOQUE')
                        .gte('data', `${dataInicial}T00:00:00-03:00`)
                        .lte('data', `${dataFinal}T23:59:59-03:00`)
                        .order('data', { ascending: false }),
                    supabaseClient
                        .from('saidas_combustivel')
                        .select('data_hora, qtd_litros, bicos(bombas(tanque_id))')
                        .gte('data_hora', `${dataInicial}T00:00:00-03:00`)
                        .lte('data_hora', `${dataFinal}T23:59:59-03:00`)
                ]);

                if (ajustesResult.error) throw ajustesResult.error;
                if (saidasResult.error) throw saidasResult.error;

                const data = ajustesResult.data;
                if (!data || data.length === 0) {
                    this.auditoriaEstoqueDados = [];
                    this.tbodyAuditoriaEstoque.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum ajuste encontrado para a data selecionada.</td></tr>';
                    return;
                }

                const saidasPorTanqueDia = this.agruparSaidasPorTanqueDia(saidasResult.data);
                const rows = await Promise.all(data.map(async ajuste => {
                    const correcaoRegistrada = parseFloat(ajuste.qtd_litros) || 0;
                    const estoqueAnterior = await this.calcularEstoqueAntes(ajuste.tanque_id, ajuste.data);
                    const estoqueInformado = parseFloat(ajuste.valor_litro) || parseFloat(ajuste.valor_total) || 0;
                    const estoqueAtual = estoqueInformado > 0 ? estoqueInformado : estoqueAnterior + correcaoRegistrada;
                    const diferenca = estoqueAtual - estoqueAnterior;
                    const dataAjuste = this.getDataSaoPaulo(ajuste.data);
                    const totalSaidasDia = saidasPorTanqueDia.get(`${ajuste.tanque_id}|${dataAjuste}`) || 0;

                    return {
                        ...ajuste,
                        diferenca,
                        correcaoRegistrada,
                        estoqueAnterior,
                        estoqueAtual,
                        totalSaidasDia
                    };
                }));

                this.auditoriaEstoqueDados = rows;
                this.tbodyAuditoriaEstoque.innerHTML = montarHtmlAuditoriaEstoque(rows, this.formatLitros.bind(this));
            } catch (error) {
                console.error('Erro ao buscar auditoria de estoque:', error);
                this.auditoriaEstoqueDados = [];
                this.tbodyAuditoriaEstoque.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro ao buscar auditoria.</td></tr>';
                alert('Erro ao buscar auditoria: ' + error.message);
            }
        },


        exportarAuditoriaEstoqueXLSX() {
            if (!this.canViewEstoqueAuditoria()) return;

            const rows = this.auditoriaEstoqueDados || [];
            if (rows.length === 0) {
                alert('Realize uma busca com resultados antes de exportar.');
                return;
            }

            gerarAuditoriaEstoqueXLSX({
                rows,
                dataInicial: this.auditoriaEstoqueDataInicial?.value,
                dataFinal: this.auditoriaEstoqueDataFinal?.value,
                formatLitros: this.formatLitros.bind(this),
                XLSX
            });
        },

        async exportarAuditoriaEstoquePDF() {
            if (!this.canViewEstoqueAuditoria()) return;

            const rows = this.auditoriaEstoqueDados || [];
            if (rows.length === 0) {
                alert('Realize uma busca com resultados antes de exportar.');
                return;
            }

            await gerarAuditoriaEstoquePDF({
                rows,
                dataInicial: this.auditoriaEstoqueDataInicial?.value,
                dataFinal: this.auditoriaEstoqueDataFinal?.value,
                formatLitros: this.formatLitros.bind(this)
            });
        },

        async handleAuditoriaEstoqueClick(e) {
            if (!this.canViewEstoqueAuditoria()) return;

            const button = e.target.closest('button');
            if (!button) return;

            const id = parseInt(button.dataset.id);
            if (!id) return;

            if (button.classList.contains('btn-edit-auditoria')) {
                await this.editarAjusteEstoque(id, parseFloat(button.dataset.estoqueAnterior));
            } else if (button.classList.contains('btn-delete-auditoria')) {
                await this.excluirAjusteEstoque(id);
            }
        },

        async editarAjusteEstoque(id, estoqueAnterior) {
            if (isNaN(estoqueAnterior)) {
                alert('Não foi possível identificar o estoque anterior deste ajuste.');
                return;
            }

            const novoValorTexto = prompt('Informe o novo Estoque Atual (Litros):');
            if (novoValorTexto === null) return;

            const novoEstoque = this.parseLitros(novoValorTexto);
            if (isNaN(novoEstoque)) {
                alert('Valor inválido.');
                return;
            }

            const novaDiferenca = novoEstoque - estoqueAnterior;

            try {
                const { error } = await supabaseClient
                    .from('abastecimentos')
                    .update({
                        qtd_litros: novaDiferenca,
                        valor_litro: novoEstoque,
                        valor_total: novoEstoque,
                        usuario: this.getUsuarioLogado()
                    })
                    .eq('id', id)
                    .eq('numero_nota', 'AJUSTE DE ESTOQUE');

                if (error) throw error;

                alert('Ajuste atualizado com sucesso!');
                if (this.returnAfterSaveIfNeeded()) return;
                await this.renderAuditoriaEstoque();
                await this.loadEstoqueAtual();
            } catch (error) {
                console.error('Erro ao editar ajuste:', error);
                alert('Erro ao editar ajuste: ' + error.message);
            }
        },

        async excluirAjusteEstoque(id) {
            if (!confirm('Deseja excluir este ajuste de estoque?')) return;

            try {
                const { error } = await supabaseClient
                    .from('abastecimentos')
                    .delete()
                    .eq('id', id)
                    .eq('numero_nota', 'AJUSTE DE ESTOQUE');

                if (error) throw error;

                alert('Ajuste excluído com sucesso!');
                await this.renderAuditoriaEstoque();
                await this.loadEstoqueAtual();
            } catch (error) {
                console.error('Erro ao excluir ajuste:', error);
                alert('Erro ao excluir ajuste: ' + error.message);
            }
        },

        async initSaida() {
            // Define data/hora atual para saída
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            this.saidaDataHora.value = now.toISOString().slice(0, 16);
            if(this.saidaUsuario) this.saidaUsuario.value = this.getUsuarioLogado();

            this.toggleSaidaForm(true); // Garante que o formulário esteja habilitado por padrão
            // Carregar Bicos
            await this.loadBicos();

            // Carregar Veiculos
            try {
                this.veiculosDisponiveis = await buscarVeiculos(supabaseClient, this.getUserFilial());
                this.listaVeiculos.innerHTML = this.veiculosDisponiveis.map(v => `<option value="${v.placa}">${v.modelo}</option>`).join('');
            } catch (e) { console.error('Erro ao carregar veiculos', e); }

            // Carregar Motoristas
            try {
                const motoristas = await buscarMotoristasAtivos(supabaseClient);
                if (this.listaMotoristasSaida) {
                    this.listaMotoristasSaida.innerHTML = motoristas.map(m => `<option value="${m.nome}"></option>`).join('');
                }
            } catch (e) { console.error('Erro ao carregar motoristas', e); }

            // Carregar Rotas
            try {
                const rotas = await buscarRotas(supabaseClient);
                if (this.listaRotas) {
                    this.listaRotas.innerHTML = rotas.map(r => `<option value="${r.numero}"></option>`).join('');
                }
            } catch (e) { console.error('Erro ao carregar rotas', e); }
        },

        async loadBicos() {
            if (!this.saidaBico) return;
            try {
                this.bicosDisponiveis = await buscarBicos(supabaseClient, this.getUserFilial());
                this.saidaBico.innerHTML = '<option value="">-- Selecione o Bico --</option>';
                if (this.saidaBico2) this.saidaBico2.innerHTML = '<option value="">-- Selecione o Bico --</option>';
                this.bicosDisponiveis.forEach(bico => {
                    const tanqueInfo = bico.bombas?.tanques?.nome || 'Tanque desconhecido';
                    const bombaInfo = bico.bombas?.nome || 'Bomba desconhecida';
                    const option = new Option(`${bico.nome} (Bomba: ${bombaInfo} - Tanque: ${tanqueInfo})`, bico.id);
                    option.dataset.bombaId = bico.bombas?.id; // Armazena o ID da bomba
                    this.saidaBico.appendChild(option);
                    if (this.saidaBico2) this.saidaBico2.appendChild(option.cloneNode(true));
                });
            } catch (error) {
                console.error('Erro ao carregar bicos:', error);
                this.saidaBico.innerHTML = '<option value="">Erro ao carregar</option>';
            }
        },

        toggleSaidaForm(enabled, mensagem = '') {
            // Todos os campos de entrada ficam sempre habilitados para preenchimento.
            // A validação de leitura de bomba foi removida conforme solicitação.
            if (this.btnSalvarSaida) this.btnSalvarSaida.disabled = !enabled;
            if (this.btnToggleBico2) this.btnToggleBico2.disabled = false;

            let alertDiv = document.getElementById('saida-form-alert');
            if (!alertDiv) {
                alertDiv = document.createElement('div');
                alertDiv.id = 'saida-form-alert';
                alertDiv.className = 'form-alert';
                this.formSaida.insertAdjacentElement('afterbegin', alertDiv);
            }

            if (mensagem) {
                alertDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${mensagem}`;
                alertDiv.style.display = 'block';
            } else {
                alertDiv.style.display = 'none';
            }
        },

        adicionarLinhaTanque(tanqueId = '', qtd = '') {
            const row = criarLinhaDistribuicaoTanque({
                tanquesDisponiveis: this.tanquesDisponiveis,
                tanqueId,
                qtd
            });
            this.distribuicaoContainer.appendChild(row);
            this.updateLitrosRestantes();
        },

        updateLitrosRestantes() {
            const totalNota = parseFloat(this.qtdTotalNotaInput.value) || 0;
            let totalDistribuido = 0;
            this.distribuicaoContainer.querySelectorAll('.tanque-qtd').forEach(input => {
                totalDistribuido += parseFloat(input.value) || 0;
            });

            const restantes = totalNota - totalDistribuido;
            this.litrosRestantesValor.textContent = restantes.toFixed(2);
            this.litrosRestantesValor.className = restantes < 0 ? 'negativo' : 'positivo';
        },

        async getAbastecimentos() {
            try {
                return await buscarAbastecimentosEntrada({
                    supabaseClient,
                    filial: this.getUserFilial(),
                    dataInicial: this.filtroDataInicial?.value,
                    dataFinal: this.filtroDataFinal?.value,
                    sortState: this.sortState
                });
            } catch (error) {
                console.error('Erro ao buscar abastecimentos:', error);
                return [];
            }
        },

        async handleFormSubmit(e) {
            e.preventDefault();

            // Bloqueia o botão para evitar cliques duplos e duplicidade
            this.btnSalvar.disabled = true;
            const originalText = this.btnSalvar.innerHTML;
            this.btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REGISTRANDO...';

            let payloads;
            try {
                payloads = montarPayloadsEntrada({
                    totalNota: parseFloat(this.qtdTotalNotaInput.value.replace(',', '.')) || 0,
                    valorLitro: parseFloat(this.vlrLitroInput.value.replace(',', '.')) || 0,
                    notaFiscal: this.notaInput.value,
                    data: this.dataInput.value,
                    linhas: Array.from(this.distribuicaoContainer.querySelectorAll('.distribuicao-row')),
                    usuario: this.getUsuarioLogado()
                });
            } catch (error) {
                alert(error.message);
                this.btnSalvar.disabled = false;
                this.btnSalvar.innerHTML = originalText;
                return;
            }
            try {
                // Se estiver editando, primeiro apaga os registros antigos da mesma nota
                if (this.editingIdInput.value) {
                    const { error: deleteError } = await supabaseClient.from('abastecimentos').delete().eq('numero_nota', this.editingIdInput.value);
                    if (deleteError) throw deleteError;
                }

                const { error } = await supabaseClient.from('abastecimentos').insert(payloads);
                if (error) throw error;

                alert(`Abastecimento ${this.editingIdInput.value ? 'atualizado' : 'registrado'} com sucesso!`);
                if (this.returnAfterSaveIfNeeded()) return;
                this.clearForm();
                this.renderTable();
                await this.loadEstoqueAtual(false);
            } catch (error) {
                console.error('Erro ao salvar:', error);
                alert('Erro ao salvar abastecimento: ' + error.message + '. Se estiver atualizando, os dados antigos podem ter sido removidos.');
            } finally {
                this.btnSalvar.disabled = false;
                this.btnSalvar.innerHTML = originalText;
            }
        },

        async renderTable() {
            this.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';
            const registros = await this.getAbastecimentos();
            this.tableBody.innerHTML = montarHtmlEntradas(registros);
        },

        handleDistribuicaoClick(e) {
            const removeBtn = e.target.closest('.btn-remove-tanque');
            if (removeBtn) {
                removeBtn.closest('.distribuicao-row').remove();
                this.updateLitrosRestantes();
            }
        },

        async handleTableClick(e) {
            const button = e.target.closest('button');
            if (!button) return;
            const id = parseInt(button.dataset.id);

            if (button.classList.contains('btn-edit')) {
                await this.loadEntradaForEditing(id);

            } else if (button.classList.contains('btn-delete')) {
                if (confirm('Tem certeza que deseja excluir este lançamento?')) {
                    try {
                        const { error } = await supabaseClient.from('abastecimentos').delete().eq('id', id);
                        if (error) throw error;
                        this.renderTable();
                        await this.loadEstoqueAtual(false);
                    } catch (error) {
                        console.error('Erro ao excluir:', error);
                        alert('Erro ao excluir lançamento: ' + error.message);
                    }
                }
            }
        },

        async loadEntradaForEditing(id) {
            const { data: registroClicado } = await supabaseClient.from('abastecimentos').select('numero_nota').eq('id', id).single();
            if (!registroClicado) return;

            if (registroClicado.numero_nota === 'AJUSTE DE ESTOQUE') {
                await this.loadAjusteForEditing(id);
                return;
            }

            const { data: todosRegistrosDaNota, error } = await supabaseClient.from('abastecimentos').select('*').eq('numero_nota', registroClicado.numero_nota);
            if (error || !todosRegistrosDaNota || todosRegistrosDaNota.length === 0) {
                alert('Erro ao carregar dados para edição.');
                return;
            }

            this.clearForm(false); // Limpa o formulário sem resetar a data
            this.distribuicaoContainer.innerHTML = ''; // Limpa as linhas de tanque

            const primeiroRegistro = todosRegistrosDaNota[0];
            const qtdTotal = todosRegistrosDaNota.reduce((sum, reg) => sum + reg.qtd_litros, 0);

            this.editingIdInput.value = primeiroRegistro.numero_nota; // Armazena a nota fiscal para a lógica de update
            const date = new Date(primeiroRegistro.data);
            date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
            this.dataInput.value = date.toISOString().slice(0, 16);
            this.notaInput.value = primeiroRegistro.numero_nota;
            this.vlrLitroInput.value = primeiroRegistro.valor_litro;
            this.qtdTotalNotaInput.value = qtdTotal;

            todosRegistrosDaNota.forEach(reg => {
                this.adicionarLinhaTanque(reg.tanque_id, reg.qtd_litros);
            });

            this.calculateTotal();
            this.updateLitrosRestantes();
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Atualizar';
            this.form.scrollIntoView({ behavior: 'smooth' });
        },

        async loadAjusteForEditing(id) {
            const { data, error } = await supabaseClient
                .from('abastecimentos')
                .select('id, data, tanque_id, numero_nota')
                .eq('id', id)
                .eq('numero_nota', 'AJUSTE DE ESTOQUE')
                .single();

            if (error || !data) {
                alert('Erro ao carregar ajuste para edição.');
                return;
            }

            const estoqueAnterior = await this.calcularEstoqueAntes(data.tanque_id, data.data);
            await this.editarAjusteEstoque(data.id, estoqueAnterior);
        },

        clearForm(resetDate = true) {
            this.form.reset();
            this.editingIdInput.value = '';
            if (resetDate) {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                this.dataInput.value = now.toISOString().slice(0, 16);
            }
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Registrar Entrada';
            this.distribuicaoContainer.innerHTML = '';
            this.adicionarLinhaTanque(); // Adiciona a primeira linha de volta
        },

        clearSaidaForm() {
            this.formSaida.reset();
            this.saidaEditingId.value = '';
            this.btnSalvarSaida.innerHTML = '<i class="fas fa-gas-pump"></i> CONFIRMAR ABASTECIMENTO';
            if (this.camposBico2) {
                this.camposBico2.classList.add('hidden');
                this.btnToggleBico2.innerHTML = '<i class="fas fa-plus"></i> Adicionar 2º Bico';
                this.btnToggleBico2.style.backgroundColor = '#6c757d';
            }
            // Reseta a data para o momento atual
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            this.saidaDataHora.value = now.toISOString().slice(0, 16);
            if (this.saidaDataReferencia) this.saidaDataReferencia.value = '';
            if(this.saidaUsuario) this.saidaUsuario.value = this.getUsuarioLogado();
        },

        async handleSaidaSubmit(e) {
            e.preventDefault();
            
            // Bloqueia o botão para evitar cliques duplos e duplicidade
            this.btnSalvarSaida.disabled = true;
            const originalText = this.btnSalvarSaida.innerHTML;
            this.btnSalvarSaida.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SALVANDO...';

            let payloads;
            let commonData;
            let kmValue;
            let placaInput;
            let veiculoObj;
            let usuario;

            try {
                ({ payloads, commonData, kmValue, placaInput, veiculoObj, usuario } = montarPayloadsSaida({
                    veiculosDisponiveis: this.veiculosDisponiveis,
                    dataHora: this.saidaDataHora.value,
                    placa: this.saidaVeiculo.value,
                    rota: this.saidaRota.value,
                    motorista: this.saidaMotorista.value,
                    km: this.saidaKm.value,
                    usuario: this.getUsuarioLogado(),
                    bico1: this.saidaBico.value,
                    litros1: this.saidaLitros.value,
                    bico2: this.saidaBico2.value,
                    litros2: this.saidaLitros2.value,
                    bico2Visivel: !this.camposBico2.classList.contains('hidden'),
                    dataReferencia: this.saidaDataReferencia?.value || null
                }));
            } catch (error) {
                alert(error.message);
                if (error.message.startsWith('Placa')) this.saidaVeiculo.focus();
                this.btnSalvarSaida.disabled = false;
                this.btnSalvarSaida.innerHTML = originalText;
                return;
            }

            // VALIDAÇÕES DE NEGÓCIO (Gerador fica isento)
            if (veiculoObj.tipo !== 'GERADOR') {
                // 1. Validar diferença de KM (máx. 5.000 km)
                const ultimoKmRaw = document.getElementById('saidaUltimoKm')?.value || '';
                const ultimoKm = parseFloat(ultimoKmRaw);
                if (!isNaN(ultimoKm) && ultimoKm > 0 && !isNaN(kmValue) && kmValue > 0) {
                    const difKm = kmValue - ultimoKm;
                    if (difKm > 5000) {
                        alert(
                            `⚠️ KM Inválido!\n\n` +
                            `O KM atual informado (${kmValue.toLocaleString('pt-BR')}) excede em ` +
                            `${difKm.toLocaleString('pt-BR')} km o Último KM registrado (${ultimoKm.toLocaleString('pt-BR')}).\n\n` +
                            `A diferença máxima permitida é de 5.000 km.\n` +
                            `Verifique o odômetro e tente novamente.`
                        );
                        this.btnSalvarSaida.disabled = false;
                        this.btnSalvarSaida.innerHTML = originalText;
                        return;
                    }
                }

                // 2. Validar capacidade total do tanque do veículo
                const capacidade = parseFloat(veiculoObj.volume_tanque) || 0;
                if (capacidade > 0) {
                    const totalLitros = payloads.reduce((soma, p) => soma + (parseFloat(p.qtd_litros) || 0), 0);
                    if (totalLitros > capacidade) {
                        alert(
                            `⚠️ Capacidade do Tanque Excedida!\n\n` +
                            `Total informado: ${totalLitros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L\n` +
                            `Capacidade do veículo: ${capacidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L\n\n` +
                            `Corrija a litragem e tente novamente.`
                        );
                        this.btnSalvarSaida.disabled = false;
                        this.btnSalvarSaida.innerHTML = originalText;
                        return;
                    }
                }
            }

            try {
                // REGISTRA NA TABELA DE COLETA DE KM (Odometer History)
                if (!isNaN(kmValue) && kmValue > 0) {
                    await supabaseClient.from('coleta_km').upsert([{
                        data_coleta: commonData.data_hora,
                        placa: placaInput,
                        km_atual: kmValue,
                        usuario: usuario,
                        modelo: veiculoObj ? veiculoObj.modelo : '',
                        observacao: `Abastecimento (${payloads.length} bicos)`
                    }], { onConflict: 'data_coleta,placa' });
                }

                if (this.saidaEditingId.value) {
                    // Atualiza o registro principal que está sendo editado
                    const { error: updateError } = await supabaseClient
                        .from('saidas_combustivel')
                        .update(payloads[0])
                        .eq('id', this.saidaEditingId.value);
                    if (updateError) throw updateError;

                    // Se um segundo bico foi adicionado durante a edição, insere-o como um novo registro
                    if (payloads.length > 1) {
                        const { error: insertError } = await supabaseClient
                            .from('saidas_combustivel')
                            .insert([payloads[1]]);
                        if (insertError) throw insertError;
                    }
                } else {
                    const { error } = await supabaseClient.from('saidas_combustivel').insert(payloads);
                    if (error) throw error;
                }

                alert(`Abastecimento(s) ${this.saidaEditingId.value ? 'atualizado' : 'registrado'} com sucesso!`);
                if (this.returnAfterSaveIfNeeded()) return;
                this.clearSaidaForm();
                this.renderSaidasTable();
                await this.loadEstoqueAtual(false);
            } catch (error) {
                console.error('Erro ao salvar saída:', error);
                alert('Erro ao registrar saída: ' + error.message);
            } finally {
                this.btnSalvarSaida.disabled = false;
                this.btnSalvarSaida.innerHTML = originalText;
            }
        },

        async renderSaidasTable(fetchData = true) {
            if (!this.tableBodySaidas) return;
            
            if (fetchData) {
                this.tableBodySaidas.innerHTML = '<tr><td colspan="8" class="text-center">Carregando...</td></tr>';
                try {
                    this.saidasData = await buscarSaidasCombustivel({
                        supabaseClient,
                        filial: this.getUserFilial(),
                        dataInicial: this.filtroSaidaDataInicial?.value,
                        dataFinal: this.filtroSaidaDataFinal?.value,
                        tanqueId: this.filtroSaidaTanque?.value
                    });
                } catch (error) {
                    console.error('Erro ao carregar histórico de saídas:', error);
                    this.tableBodySaidas.innerHTML = '<tr><td colspan="7" class="text-center" style="color:red;">Erro ao carregar histórico.</td></tr>';
                    return;
                }
            }

            const term = this.searchSaidaInput ? this.searchSaidaInput.value : '';
            const filtered = filtrarOrdenarSaidas(this.saidasData, term, this.saidasSort);

            atualizarIconesOrdenacao({
                selector: '.sortable-saida',
                activeKey: this.saidasSort.key,
                asc: this.saidasSort.asc
            });

            this.tableBodySaidas.innerHTML = montarHtmlSaidas(filtered);
        },

        async handleSaidaTableClick(e) {
            const button = e.target.closest('button');
            if (!button || !button.dataset.id) return;

            const id = button.dataset.id;

            if (button.classList.contains('btn-edit')) {
                this.loadSaidaForEditing(id);
            } else if (button.classList.contains('btn-delete')) {
                if (confirm('Tem certeza que deseja excluir este registro de saída?')) {
                    this.deleteSaida(id);
                }
            }
        },

        async loadSaidaForEditing(id) {
            try {
                const { data, error } = await supabaseClient.from('saidas_combustivel').select('*').eq('id', id).single();
                if (error) throw error;

                this.saidaEditingId.value = data.id;
                const date = new Date(data.data_hora);
                date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                this.saidaDataHora.value = date.toISOString().slice(0, 16);
                if(this.saidaUsuario) this.saidaUsuario.value = data.usuario || this.getUsuarioLogado();
                this.saidaBico.value = data.bico_id;
                this.saidaVeiculo.value = data.veiculo_placa; // This is correct
                this.saidaRota.value = data.rota;
                if (this.saidaMotorista) this.saidaMotorista.value = data.motorista || '';
                this.saidaKm.value = data.km_atual;
                this.saidaLitros.value = data.qtd_litros;
                if (this.saidaDataReferencia) this.saidaDataReferencia.value = data.data_referencia || '';

                this.btnSalvarSaida.innerHTML = '<i class="fas fa-save"></i> ATUALIZAR SAÍDA';
                this.formSaida.scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error('Erro ao carregar saída para edição:', error);
                alert('Não foi possível carregar os dados para edição.');
            }
        },

        handleSort(field) {
            if (this.sortState.field === field) {
                this.sortState.ascending = !this.sortState.ascending;
            } else {
                this.sortState.field = field;
                this.sortState.ascending = true;
            }
            this.updateSortIcons();
            this.renderTable();
        },

        updateSortIcons() {
            atualizarIconesOrdenacaoEntrada(this.sortState);        },

        async deleteSaida(id) {
            try {
                const { error } = await supabaseClient.from('saidas_combustivel').delete().eq('id', id);
                if (error) throw error;
                alert('Registro de saída excluído com sucesso!');
                this.renderSaidasTable();
                await this.loadEstoqueAtual(false);
            } catch (error) {
                console.error('Erro ao excluir saída:', error);
                alert('Erro ao excluir o registro.');
            }
        },

        // --- LÓGICA ABASTEIMENTO EXTERNO ---

        async loadFiliaisOptions() {
            try {
                const data = await buscarFiliais(supabaseClient);
                this.filiaisCache = data || []; // Armazena para uso no filtro inteligente de postos

                const options = '<option value="">Selecione a Filial</option>' + 
                    (data || []).map(f => {
                        const val = f.sigla || f.nome;
                        const text = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                        return `<option value="${val}">${text}</option>`;
                    }).join('');

                const userFilial = this.getUserFilial();

                // Popula o select na aba de Saída de Combustível
                if (this.filialImportacaoSaida) {
                    this.filialImportacaoSaida.innerHTML = options;
                    if (userFilial && this.filiaisCache.length > 0) {
                        const matchingFilial = this.filiaisCache.find(f => f.nome === userFilial || f.sigla === userFilial || (f.sigla || f.nome) === userFilial);
                        if (matchingFilial) {
                            this.filialImportacaoSaida.value = matchingFilial.sigla || matchingFilial.nome;
                        } else {
                            this.filialImportacaoSaida.value = userFilial;
                        }
                    }
                }

                if (this.extFilial) {
                    this.extFilial.innerHTML = options;
                    if (!userFilial) {
                        if (this.extFilial.querySelector('option[value="SP"]')) {
                            this.extFilial.value = 'SP';
                        }
                    }
                    this.aplicarBloqueioFilialExterna();
                    this.loadPostosOptions();
                }
                if (this.filtroExtFilial) {
                    this.filtroExtFilial.innerHTML = '<option value="">Todas</option>' + options.replace('<option value="">Selecione a Filial</option>', '');
                    this.aplicarBloqueioFiltroExterno();
                    if (this.tableBodyExt) this.renderExtTable(true);
                }
                if (this.postoFilial) {
                    this.postoFilial.innerHTML = options;
                    this.aplicarBloqueioFilialPosto();
                }
                if (this.filtroPostoFilial) {
                    this.filtroPostoFilial.innerHTML = '<option value="">Todas</option>' + options.replace('<option value="">Selecione a Filial</option>', '');
                    this.aplicarBloqueioFiltroPostos();
                    if (this.tableBodyPostos) this.renderPostosTable(true);
                }
            } catch (error) {
                console.error('Erro ao carregar filiais:', error);
            }
        },

        async loadRotasOptions() {
            const datalist = document.getElementById('listaRotasExternas');
            if (!datalist) return;
            
            try {
                const rotas = await buscarRotas(supabaseClient);
                datalist.innerHTML = '';
                rotas.forEach(r => {
                    const option = document.createElement('option');
                    option.value = r.numero;
                    datalist.appendChild(option);
                });
            } catch (error) {
                console.error('Erro ao carregar rotas:', error);
            }
        },
        async loadMotoristasOptions() {
            if (!this.listaMotoristasExt) return;
            try {
                const motoristas = await buscarMotoristasAtivos(supabaseClient);
                this.listaMotoristasExt.innerHTML = motoristas.map(m => `<option value="${m.nome}"></option>`).join('');
            } catch (error) {
                console.error('Erro ao carregar motoristas para datalist externo:', error);
            }
        },
        async loadPostosOptions() {
            const datalist = document.getElementById('listaPostosExternos');
            if (!datalist) return;

            const filialSelecionada = this.extFilial ? this.extFilial.value : this.getUserFilial();
            
            // Tenta encontrar o objeto da filial no cache para pegar Nome e Sigla e fazer um filtro mais flexível (Nome ou Sigla)
            let filiaisParaFiltrar = [filialSelecionada];
            if (this.filiaisCache && filialSelecionada) {
                const f = this.filiaisCache.find(x => x.nome === filialSelecionada || x.sigla === filialSelecionada || (x.sigla || x.nome) === filialSelecionada);
                if (f) {
                    if (f.nome) filiaisParaFiltrar.push(f.nome);
                    if (f.sigla) filiaisParaFiltrar.push(f.sigla);
                }
            }
            filiaisParaFiltrar = [...new Set(filiaisParaFiltrar.filter(Boolean))];

            // 1. Limpa o valor do campo Posto e garante que ele esteja habilitado para seleção
            if (this.extPosto) {
                this.extPosto.value = '';
                this.extPosto.disabled = false;
            }

            try {
                this.postosCache = await buscarPostosParaDatalist(supabaseClient, filiaisParaFiltrar);
                datalist.innerHTML = '';
                this.postosCache.forEach(p => {
                    const option = document.createElement('option');
                    option.value = `${p.razao_social} (${p.cnpj || 'S/CNPJ'})`;
                    datalist.appendChild(option);
                });

                // 2. Feedback visual se não houver postos para a filial selecionada
                if (this.postosCache.length === 0 && filialSelecionada) {
                    console.warn(`Nenhum posto encontrado para a filial: ${filialSelecionada} (Filtros tentados: ${filiaisParaFiltrar.join(', ')})`);
                    if (this.extPosto) this.extPosto.placeholder = "Nenhum posto encontrado...";
                } else if (this.extPosto) {
                    this.extPosto.placeholder = "Digite o nome ou CNPJ...";
                }

            } catch (error) {
                console.error('Erro ao carregar postos:', error);
                alert('Ocorreu um erro ao carregar a lista de postos para o formulário. Verifique o console para mais detalhes.');
            }
        },
        
        handleExtPostoChange() {
            const postoText = this.extPosto.value;
            let valorNegociado = null;

            if (postoText && this.postosCache) {
                const foundPosto = this.postosCache.find(p => {
                    const displayValue = `${p.razao_social} (${p.cnpj || 'S/CNPJ'})`;
                    return displayValue === postoText;
                });
                if (foundPosto && foundPosto.valor_negociado) {
                    valorNegociado = parseFloat(foundPosto.valor_negociado);
                }
            }

            if (this.extValorNegociadoDisplay) {
                this.extValorNegociadoDisplay.textContent = (valorNegociado && valorNegociado > 0) ? `Valor Negociado: R$ ${valorNegociado.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : '';
            }
        },

        async handleExtVeiculoChange() {
            const placa = this.extVeiculo.value.toUpperCase();
            if (!placa) return;

            // 1. Buscar Tipo do Veículo, Capacidade do Tanque e Média/KM
            const { data: veiculo } = await supabaseClient.from('veiculos').select('tipo, volume_tanque, media_km').eq('placa', placa).single();
            if (veiculo && this.extTipo) {
                this.extTipo.value = veiculo.tipo || '';
                // Exibe a capacidade do tanque
                if (this.extCapacidadeTanque) this.extCapacidadeTanque.textContent = (veiculo.capacidade_tanque || '--');
            }
            // Tenta exibir a capacidade se existir no cadastro, senão deixa traço
            // Exibe a capacidade do tanque
            if (this.extCapacidadeTanque) {
                this.extCapacidadeTanque.textContent = (veiculo && veiculo.volume_tanque) ? veiculo.volume_tanque : '--';
            }
            
            // Exibe a média/KM
            if (this.extMediaKm) {
                this.extMediaKm.textContent = (veiculo && veiculo.media_km !== null && veiculo.media_km !== undefined) ? parseFloat(veiculo.media_km).toFixed(2) : '--';
            }

            // 2. Buscar Maior KM (Interno ou Externo)
            try {
                const [resExt, resInt] = await Promise.all([
                    supabaseClient
                        .from('abastecimento_externo')
                        .select('km_atual')
                        .eq('veiculo_placa', placa)
                        .order('km_atual', { ascending: false })
                        .limit(1),
                    supabaseClient
                        .from('saidas_combustivel')
                        .select('km_atual')
                        .eq('veiculo_placa', placa)
                        .order('km_atual', { ascending: false })
                        .limit(1)
                ]);

                const kmExt = (resExt.data && resExt.data.length > 0) ? (parseFloat(resExt.data[0].km_atual) || 0) : 0;
                const kmInt = (resInt.data && resInt.data.length > 0) ? (parseFloat(resInt.data[0].km_atual) || 0) : 0;
                
                const maiorKm = Math.max(kmExt, kmInt);
                
                if (this.extKmAnterior) {
                    this.extKmAnterior.value = maiorKm;
                    this.calculateKmRodado();
                }

                // 3. Buscar Rota e Motorista do Retorno de Rota para sugerir no formulário externo
                await this.buscarDadosRetornoRota(placa, this.extRota, this.extMotorista, this.extDataHora.value);
            } catch (error) {
                console.error("Erro ao buscar KM anterior:", error);
            }
        },

        calculateKmRodado() {
            const atual = parseFloat(this.extKmAtual.value) || 0;
            const anterior = parseFloat(this.extKmAnterior.value) || 0;
            if (this.extKmRodado) {
                this.extKmRodado.value = atual > anterior ? (atual - anterior) : 0;
            }
        },

        calculateExtValorUnitario() {
            const litros = parseFloat(this.extLitros.value) || 0;
            const total = parseFloat(this.extValorTotal.value) || 0;
            if (litros > 0 && this.extValorUnitario) {
                this.extValorUnitario.value = (total / litros).toFixed(3);
            } else if (this.extValorUnitario) {
                this.extValorUnitario.value = '';
            }
        },

        baixarModeloImportacaoExterno(e) {
            if (e) e.preventDefault();
            gerarModeloImportacaoExterno(XLSX);
        },

        async handleImportarExterno(e) {
            const file = e.target.files[0];
            if (!file) return;

            const btn = this.btnImportarExterno;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

            try {
                const { importedRows, rejectedRows } = await importarAbastecimentoExterno({
                    file,
                    XLSX,
                    supabaseClient,
                    veiculosDisponiveis: this.veiculosDisponiveis,
                    usuario: this.getUsuarioLogado()
                });

                if (importedRows.length > 0) {
                    alert(`Importação concluída com sucesso!\n${importedRows.length} registros inseridos.\n${rejectedRows.length} registros rejeitados.\n\nUm arquivo .txt com o resumo detalhado será baixado.`);
                    baixarRelatorioImportacaoExterna(importedRows, rejectedRows);
                    this.renderExtTable();
                } else {
                    alert(`Nenhum registro foi importado.\n${rejectedRows.length} registros foram rejeitados.\n\nVerifique o arquivo de erros que será baixado.`);
                    if (rejectedRows.length > 0) {
                        baixarRelatorioImportacaoExterna([], rejectedRows);
                    }
                }
            } catch (err) {
                console.error('Erro na importação:', err);
                alert('Erro ao processar arquivo: ' + err.message);
            } finally {
                e.target.value = '';
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        },

        async handleExtSubmit(e) {
            e.preventDefault();
            
            const btnSubmit = this.formExt.querySelector('button[type="submit"]');
            btnSubmit.disabled = true;
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SALVANDO...';

            try {
                const payload = montarPayloadExterno({
                    postosCache: this.postosCache,
                    postoTexto: this.extPosto.value,
                    dataHora: this.extDataHora.value,
                    filial: this.getFilialAbastecimentoExterno(),
                    veiculo: this.extVeiculo.value,
                    tipo: this.extTipo.value,
                    kmAtual: this.extKmAtual.value,
                    kmAnterior: this.extKmAnterior.value,
                    kmRodado: this.extKmRodado.value,
                    litros: this.extLitros.value,
                    valorTotal: this.extValorTotal.value,
                    valorUnitario: this.extValorUnitario.value,
                    motorista: this.extMotorista.value,
                    rota: this.extRota.value,
                    usuario: this.getUsuarioLogado()
                });
                let error;
                if (this.extEditingId) {
                    // Atualizar
                    const { error: updateError } = await supabaseClient
                        .from('abastecimento_externo')
                        .update(payload)
                        .eq('id', this.extEditingId);
                    error = updateError;
                } else {
                    // Inserir
                    const { error: insertError } = await supabaseClient.from('abastecimento_externo').insert(payload);
                    error = insertError;
                }

                if (error) {
                    alert('Erro ao salvar: ' + error.message);
                } else {
                    alert(`Abastecimento externo ${this.extEditingId ? 'atualizado' : 'registrado'}!`);
                    if (this.returnAfterSaveIfNeeded()) return;
                    this.resetExtForm();
                    this.renderExtTable();
                }
            } catch (error) {
                alert(error.message);
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = originalText;
            }
        },

        async renderExtTable(fetchData = true) {
            if (!this.tableBodyExt) return;
            
            if (fetchData) {
                this.tableBodyExt.innerHTML = '<tr><td colspan="13" style="text-align:center;">Carregando...</td></tr>';
                this.extData = await buscarAbastecimentosExternos({
                    supabaseClient,
                    filial: this.getValoresFiltroExterno(),
                    dataInicial: this.filtroExtDataInicial?.value,
                    dataFinal: this.filtroExtDataFinal?.value
                });
            }

            // --- ADMIN BULK DELETE SETUP ---
            const isAdmin = this.getUserLevel() === 'administrador';
            
            // Inject Header Checkbox if needed
            const table = this.tableBodyExt?.closest('table');
            if (table && isAdmin) {
                const theadRow = table.querySelector('thead tr');
                if (theadRow && !theadRow.querySelector('.th-chk-ext')) {
                    const th = document.createElement('th');
                    th.className = 'th-chk-ext';
                    th.style.width = '40px';
                    th.style.textAlign = 'center';
                    th.innerHTML = '<input type="checkbox" id="selectAllExt" title="Selecionar Todos">';
                    theadRow.insertBefore(th, theadRow.firstElementChild);
                    
                    const selectAll = th.querySelector('#selectAllExt');
                    selectAll.addEventListener('change', (e) => {
                        const checkboxes = this.tableBodyExt.querySelectorAll('.chk-ext-delete');
                        checkboxes.forEach(cb => cb.checked = e.target.checked);
                        this.toggleBulkDeleteButton();
                    });
                }
            }
            // -------------------------------

            const term = this.searchExtInput ? this.searchExtInput.value : '';
            const filtered = filtrarOrdenarExternos(this.extData, term, this.extSort);

            atualizarIconesOrdenacao({
                selector: '.sortable-ext',
                activeKey: this.extSort.key,
                asc: this.extSort.asc
            });

            this.tableBodyExt.innerHTML = montarHtmlExternos(filtered, isAdmin);

            if (isAdmin) {
                this.tableBodyExt.querySelectorAll('.chk-ext-delete').forEach(cb => {
                    cb.addEventListener('change', () => this.toggleBulkDeleteButton());
                });
                const selectAll = document.getElementById('selectAllExt');
                if(selectAll) selectAll.checked = false;
                this.toggleBulkDeleteButton();
            }
        },

        handleExtTableClick(e) {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.id;

            if (btn.classList.contains('btn-edit-ext')) {
                this.editExt(id);
            } else if (btn.classList.contains('btn-delete-ext')) {
                this.deleteExt(id);
            }
        },

        async editExt(id) {
            const { data, error } = await supabaseClient.from('abastecimento_externo').select('*, postos(id, razao_social, cnpj)').eq('id', id).single();
            if (error || !data) return alert('Erro ao carregar dados.');

            this.extEditingId = id;
            
            // Preenche o formulário
            if (this.extDataHora) {
                const date = new Date(data.data_hora);
                date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                this.extDataHora.value = date.toISOString().slice(0, 16);
            }
            this.extFilial.value = data.filial || '';
            this.aplicarBloqueioFilialExterna();
            
            if (data.postos) {
                // Garante que o datalist seja populado antes de tentar setar o valor
                this.extPosto.value = `${data.postos.razao_social} (${data.postos.cnpj || 'S/CNPJ'})`;
            } else {
                this.extPosto.value = '';
            }

            this.extVeiculo.value = data.veiculo_placa || '';
            this.extTipo.value = data.tipo_veiculo || '';
            this.extRota.value = data.rota || '';
            this.extKmAnterior.value = data.km_anterior || 0;
            this.extKmAtual.value = data.km_atual || 0;
            this.extKmRodado.value = data.km_rodado || 0;
            this.extLitros.value = data.litros || '';
            this.extValorTotal.value = data.valor_total || '';
            this.extValorUnitario.value = data.valor_unitario || '';
            this.extMotorista.value = data.motorista || ''; // Preenche o motorista

            // Atualiza botão
            const btn = this.formExt.querySelector('button[type="submit"]');
            if(btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Registro';
            
            this.formExt.scrollIntoView({ behavior: 'smooth' });
        },

        async deleteExt(id) {
            if (!confirm('Deseja excluir este registro?')) return;
            const { error } = await supabaseClient.from('abastecimento_externo').delete().eq('id', id);
            if (error) alert('Erro ao excluir: ' + error.message);
            else this.renderExtTable();
        },

        resetExtForm() {
            this.formExt.reset();
            this.extEditingId = null;
            const btn = this.formExt.querySelector('button[type="submit"]');
            if(btn) btn.innerHTML = '<i class="fas fa-save"></i> Salvar Registro';
            this.extMotorista.value = ''; // Limpa o motorista
            this.aplicarBloqueioFilialExterna();
            this.loadPostosOptions();
        },

        async handleBulkDeleteExt() {
            const checkboxes = this.tableBodyExt.querySelectorAll('.chk-ext-delete:checked');
            if (checkboxes.length === 0) return alert('Selecione pelo menos um registro para excluir.');

            if (!confirm(`Tem certeza que deseja excluir ${checkboxes.length} registros?`)) return;

            const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
            
            try {
                const { error } = await supabaseClient
                    .from('abastecimento_externo')
                    .delete()
                    .in('id', ids);

                if (error) throw error;

                alert('Registros excluídos com sucesso!');
                this.renderExtTable(); // Refresh table
                
            } catch (error) {
                console.error('Erro ao excluir em massa:', error);
                alert('Erro ao excluir registros: ' + error.message);
            }
        },

        toggleBulkDeleteButton() {
            const btn = document.getElementById('btnBulkDeleteExt');
            if (!btn) return;
            const checked = this.tableBodyExt.querySelectorAll('.chk-ext-delete:checked').length > 0;
            btn.style.display = checked ? 'inline-block' : 'none';
        },

        // --- LÓGICA CADASTRO POSTO ---

        async handleImportarPostos(e) {
            const file = e.target.files[0];
            if (!file) return;

            const btn = this.btnImportarPostos;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

            try {
                const { importados, duplicados } = await importarPostos({ file, XLSX, supabaseClient });

                if (importados > 0) {
                    let msg = `Importação concluída! ${importados} postos cadastrados.`;
                    if (duplicados > 0) msg += `\n(${duplicados} ignorados por CNPJ duplicado)`;
                    alert(msg);
                    this.renderPostosTable();
                    this.loadPostosOptions();
                } else if (duplicados > 0) {
                    alert(`Nenhum posto importado. ${duplicados} registros eram duplicados.`);
                } else {
                    alert('Nenhum dado válido encontrado.');
                }
            } catch (err) {
                console.error('Erro na importação de postos:', err);
                alert('Erro ao processar arquivo: ' + err.message);
            } finally {
                e.target.value = '';
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        },
        async handlePostoSubmit(e) {
            e.preventDefault();

            // Verificação de duplicidade manual
            const cnpjValue = this.postoCnpj.value;
            if (cnpjValue) {
                const { data: existingPosto, error } = await supabaseClient
                    .from('postos')
                    .select('id')
                    .eq('cnpj', cnpjValue)
                    .limit(1)
                    .single();

                // Se um posto foi encontrado E (não estamos editando OU o ID encontrado é diferente do que estamos editando)
                if (existingPosto && (!this.postoEditingId || existingPosto.id != this.postoEditingId)) {
                    return alert('Já existe um posto cadastrado com este CNPJ.');
                }
                if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found, o que é bom.
                    return alert('Erro ao verificar CNPJ: ' + error.message);
                }
            }

            const payload = montarPayloadPosto({
                filial: this.getFilialCadastroPosto(),
                razaoSocial: this.postoRazao.value,
                cnpj: cnpjValue,
                cidade: this.postoCidade.value,
                uf: this.postoUf.value,
                faturado: this.postoFaturado.value,
                valorNegociado: this.postoValorNegociadoInput.value
            });
            let error;
            if (this.postoEditingId) {
                // Atualizar
                const { error: updateError } = await supabaseClient
                    .from('postos')
                    .update(payload)
                    .eq('id', this.postoEditingId);
                error = updateError;
            } else {
                // Inserir
                const { error: insertError } = await supabaseClient.from('postos').insert(payload);
                error = insertError;
            }

            if (error) {
                alert('Erro ao salvar posto: ' + error.message);
            } else {
                alert(`Posto ${this.postoEditingId ? 'atualizado' : 'cadastrado'} com sucesso!`);
                this.resetPostoForm();
                this.renderPostosTable();
                this.loadPostosOptions(); // Atualiza dropdown da outra aba
            }
        },

        async renderPostosTable(fetchData = true) {
            if (!this.tableBodyPostos) return;
            
            if (fetchData) {
                this.tableBodyPostos.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';
                
                try {
                    this.postosData = await buscarPostosPaginados({
                        supabaseClient,
                        filial: this.getValoresFiltroPostos()
                    });
                } catch (error) {
                    console.error("Erro ao buscar postos para a tabela:", error);
                    this.postosData = [];
                }
            }

            const term = this.searchPostoInput ? this.searchPostoInput.value : '';
            const filtered = filtrarOrdenarPostos(this.postosData, term, this.postosSort);

            atualizarIconesOrdenacao({
                selector: '.sortable-posto',
                activeKey: this.postosSort.key,
                asc: this.postosSort.asc
            });

            this.tableBodyPostos.innerHTML = montarHtmlPostos(filtered);
        },

        handlePostoTableClick(e) {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.id;

            if (btn.classList.contains('btn-edit-posto')) {
                this.editPosto(id);
            } else if (btn.classList.contains('btn-delete-posto')) {
                this.deletePosto(id);
            }
        },

        async editPosto(id) {
            const { data, error } = await supabaseClient.from('postos').select('*').eq('id', id).single();
            if (error || !data) return alert('Erro ao carregar dados do posto.');
            if (this.getUserFilial() && !this.registroPertenceFilialUsuario(data.filial)) {
                return alert('Voce nao tem permissao para editar posto de outra filial.');
            }

            this.postoEditingId = id;
            
            this.postoFilial.value = data.filial || '';
            this.aplicarBloqueioFilialPosto();
            this.postoRazao.value = data.razao_social || '';
            this.postoCnpj.value = data.cnpj || '';
            this.postoCidade.value = data.cidade || '';
            this.postoUf.value = data.uf || '';
            this.postoFaturado.value = data.faturado ? 'Sim' : 'Não';

            const btn = this.formPosto.querySelector('button[type="submit"]');
            if(btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Posto';
            
            this.formPosto.scrollIntoView({ behavior: 'smooth' });
        },

        resetPostoForm() {
            this.formPosto.reset();
            this.postoEditingId = null;
            const btn = this.formPosto.querySelector('button[type="submit"]');
            if(btn) btn.innerHTML = '<i class="fas fa-save"></i> Salvar Posto';
            this.aplicarBloqueioFilialPosto();

            // Reseta a data para o momento atual após limpar o formulário para o próximo lançamento
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            if (this.extDataHora) this.extDataHora.value = now.toISOString().slice(0, 16);
        },

        async deletePosto(id) {
            if(confirm('Excluir este posto?')) {
                if (this.getUserFilial()) {
                    const { data: posto, error: postoError } = await supabaseClient
                        .from('postos')
                        .select('filial')
                        .eq('id', id)
                        .single();
                    if (postoError || !posto) return alert('Erro ao validar filial do posto.');
                    if (!this.registroPertenceFilialUsuario(posto.filial)) {
                        return alert('Voce nao tem permissao para excluir posto de outra filial.');
                    }
                }

                const { error } = await supabaseClient.from('postos').delete().eq('id', id);
                if(error) alert('Erro ao excluir: ' + error.message);
                else {
                    this.renderPostosTable();
                    this.loadPostosOptions();
                }
            }
        },

        baixarModeloImportacaoSaida() {
            gerarModeloImportacaoSaida(XLSX);
        },
        async handleImportarSaida(e) {
            const file = e.target.files[0];
            if (!file) return alert('Selecione um arquivo XLSX.');

            const btn = this.btnAbrirImportacaoSaida;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';

            try {
                const { payloads, importedRows, rejectedRows } = await montarPayloadsImportacaoSaida({
                    file,
                    XLSX,
                    bicosDisponiveis: this.bicosDisponiveis,
                    filialSelecionada: this.filialImportacaoSaida?.value,
                    usuario: this.getUsuarioLogado()
                });

                if (payloads.length > 0) {
                    const { error } = await supabaseClient.from('saidas_combustivel').insert(payloads);
                    if (error) throw error;
                    
                    alert(`Importação concluída com sucesso!\n${importedRows.length} registros de saída inseridos.\n${rejectedRows.length} registros rejeitados.\n\nUm arquivo .txt com o resumo detalhado será baixado.`);
                    baixarRelatorioImportacaoSaida(importedRows, rejectedRows);
                    this.renderSaidasTable();
                    await this.loadEstoqueAtual(false);
                } else {
                    alert(`Nenhum registro foi importado.\n${rejectedRows.length} registros foram rejeitados.\n\nVerifique o arquivo de erros que será baixado.`);
                    if (rejectedRows.length > 0) {
                        baixarRelatorioImportacaoSaida([], rejectedRows);
                    }
                }
            } catch (error) {
                console.error('Erro na importação:', error);
                alert('Erro ao processar arquivo: ' + error.message);
            } finally {
                e.target.value = '';
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        },
        async buscarUltimoKm(placaInput) {
            const inputUltimoKm = document.getElementById('saidaUltimoKm');
            if (!inputUltimoKm) return;
        
            const placa = placaInput ? placaInput.trim().toUpperCase() : '';
            if (!placa) {
                inputUltimoKm.value = '';
                return;
            }
        
            inputUltimoKm.value = 'Buscando...';
        
            try {
                const [resInt, resExt] = await Promise.all([
                    supabaseClient
                        .from('saidas_combustivel')
                        .select('km_atual')
                        .eq('veiculo_placa', placa)
                        .order('km_atual', { ascending: false })
                        .limit(1),
                    supabaseClient
                        .from('abastecimento_externo')
                        .select('km_atual')
                        .eq('veiculo_placa', placa)
                        .order('km_atual', { ascending: false })
                        .limit(1)
                ]);

                const kmInt = (resInt.data && resInt.data.length > 0) ? (parseFloat(resInt.data[0].km_atual) || 0) : 0;
                const kmExt = (resExt.data && resExt.data.length > 0) ? (parseFloat(resExt.data[0].km_atual) || 0) : 0;
                const maiorKm = Math.max(kmInt, kmExt);
        
                inputUltimoKm.value = maiorKm > 0 ? maiorKm : 'Sem registro';
            } catch (e) {
                console.error('Erro ao buscar último KM:', e);
                inputUltimoKm.value = 'Erro';
            }
        },

        async buscarDadosRetornoRota(placaInput, targetRota = null, targetMotorista = null, dataReferencia = null) {
            const rotaField = targetRota || this.saidaRota;
            const motoristaField = targetMotorista || this.saidaMotorista;
            
            if (!rotaField || !motoristaField) return;
            
            const placa = placaInput ? placaInput.trim().toUpperCase() : '';
            if (!placa) {
                rotaField.value = '';
                motoristaField.value = '';
                return;
            }

            // Obtém a data do formulário de saída (formato YYYY-MM-DD)
            const dataBase = dataReferencia ? dataReferencia.split('T')[0] : (this.saidaDataHora.value ? this.saidaDataHora.value.split('T')[0] : new Date().toISOString().split('T')[0]);

            try {
                rotaField.value = '';
                motoristaField.value = '';

                // Busca o retorno de rota cadastrado exatamente no dia informado.
                const { data, error } = await supabaseClient
                    .from('retorno_rota')
                    .select('rota, nome_mot')
                    .eq('placa', placa)
                    .eq('data_retorno', dataBase)
                    .limit(1)
                    .single();

                if (error && error.code !== 'PGRST116') throw error; // Ignora se não encontrar (PGRST116)

                if (data) {
                    if (!targetRota && this.saidaVeiculo && this.saidaVeiculo.value.trim().toUpperCase() !== placa) return;
                    // Preenche os campos como sugestão, permitindo que o usuário edite se necessário
                    rotaField.value = data.rota || '';
                    motoristaField.value = data.nome_mot || '';
                }
            } catch (e) {
                console.error('Erro ao buscar rota/motorista do retorno:', e);
            }
        },
    };

    AbastecimentoUI.init();
});
