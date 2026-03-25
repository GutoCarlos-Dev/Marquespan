import { supabaseClient } from './supabase.js';
import XLSX from "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";

document.addEventListener('DOMContentLoaded', () => {
    const AbastecimentoUI = {
        init() {
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
            this.initTabs();
            this.cache();
            this.bind();

             // Define a data de hoje como padrão para o formulário de entrada e filtros
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            this.dataInput.value = now.toISOString().slice(0, 16);
            if (this.filtroDataInicial) this.filtroDataInicial.value = new Date().toISOString().slice(0, 10);
            if (this.filtroDataFinal) this.filtroDataFinal.value = new Date().toISOString().slice(0, 10);

            // Adiciona para o filtro de saída
            if (this.filtroSaidaDataInicial) this.filtroSaidaDataInicial.value = new Date().toISOString().slice(0, 10);
            if (this.filtroSaidaDataFinal) this.filtroSaidaDataFinal.value = new Date().toISOString().slice(0, 10);

            // Adiciona para o filtro externo
            if (this.filtroExtDataInicial) this.filtroExtDataInicial.value = new Date().toISOString().slice(0, 10);
            if (this.filtroExtDataFinal) this.filtroExtDataFinal.value = new Date().toISOString().slice(0, 10);

            this.loadTanques();
            this.renderTable();
            this.initSaida(); // Inicializa a aba de saída
            this.renderSaidasTable();
            this.loadEstoqueAtual(); // Carrega a aba de estoque
            this.populateUFs(); // Preenche lista de UFs
            

        },

        initTabs() {
            const buttons = document.querySelectorAll('#menu-abastecimento .painel-btn');
            const sections = document.querySelectorAll('.main-content .glass-panel');

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
            this.saidaRota = document.getElementById('saidaRota');
            this.listaRotas = document.getElementById('listaRotas');
            this.saidaKm = document.getElementById('saidaKm');
            this.saidaLitros = document.getElementById('saidaLitros');
            this.btnSalvarSaida = document.getElementById('btnSalvarSaida');
            this.saidaBico2 = document.getElementById('saidaBico2');
            this.saidaLitros2 = document.getElementById('saidaLitros2');
            this.btnToggleBico2 = document.getElementById('btnToggleBico2');
            this.camposBico2 = document.getElementById('camposBico2');
            this.tableBodySaidas = document.getElementById('tableBodySaidas');
            this.searchSaidaInput = document.getElementById('searchSaidaInput'); // Busca Saídas

            // Elementos da Aba Estoque
            this.tbodyEstoque = document.getElementById('tbodyEstoqueAtual');
            this.btnSalvarEstoque = document.getElementById('btnSalvarEstoque');

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
            this.extCapacidadeTanque = document.getElementById('extCapacidadeTanque'); // Span de capacidade
            this.btnImportarExterno = document.getElementById('btnImportarExterno'); // Novo Botão Importar
            this.fileImportarExterno = document.getElementById('fileImportarExterno'); // Novo Input File
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
            this.tableBodyPostos = document.getElementById('tableBodyPostos');
            this.btnImportarPostos = document.getElementById('btnImportarPostos'); // Novo Botão Importar Postos
            this.fileImportarPostos = document.getElementById('fileImportarPostos'); // Novo Input File Postos
            this.extEditingId = null; // Variável para controlar edição
            this.postoEditingId = null; // Variável para controlar edição de posto
            this.searchPostoInput = document.getElementById('searchPostoInput'); // Input de busca de postos
       // Elementos do filtro de histórico de entrada
            this.filtroDataInicial = document.getElementById('filtroDataInicial');
            this.filtroDataFinal = document.getElementById('filtroDataFinal');
            this.btnFiltrarHistorico = document.getElementById('btnFiltrarHistorico');

            // Elementos do filtro de histórico de SAÍDA
            this.filtroSaidaDataInicial = document.getElementById('filtroSaidaDataInicial');
            this.filtroSaidaDataFinal = document.getElementById('filtroSaidaDataFinal');
            this.btnFiltrarHistoricoSaida = document.getElementById('btnFiltrarHistoricoSaida');

            // Elementos do filtro de histórico EXTERNO
            this.filtroExtDataInicial = document.getElementById('filtroExtDataInicial');
            this.filtroExtDataFinal = document.getElementById('filtroExtDataFinal');
            this.btnFiltrarHistoricoExt = document.getElementById('btnFiltrarHistoricoExt');

        },

        bind() {
            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.tableBody.addEventListener('click', this.handleTableClick.bind(this));
            this.btnLimpar.addEventListener('click', this.clearForm.bind(this));
            
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

            // Listeners para Busca e Ordenação de Saídas
            if (this.searchSaidaInput) {
                this.searchSaidaInput.addEventListener('input', () => this.renderSaidasTable(false));
            }

            // Busca o Último KM ao selecionar um veículo (Aba Saída)
            if (this.saidaVeiculo) {
                this.saidaVeiculo.addEventListener('change', (e) => this.buscarUltimoKm(e.target.value));
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
            // Listener para o filtro de histórico EXTERNO
            if (this.btnFiltrarHistoricoExt) {
                this.btnFiltrarHistoricoExt.addEventListener('click', () => this.renderExtTable(true));
            }
            // Listeners Abastecimento Externo
            if (this.formExt) this.formExt.addEventListener('submit', this.handleExtSubmit.bind(this));
            if (this.extVeiculo) this.extVeiculo.addEventListener('change', this.handleExtVeiculoChange.bind(this));
            if (this.extKmAtual) this.extKmAtual.addEventListener('input', this.calculateKmRodado.bind(this));
            if (this.extLitros) this.extLitros.addEventListener('input', this.calculateExtValorUnitario.bind(this));
            if (this.extValorTotal) this.extValorTotal.addEventListener('input', this.calculateExtValorUnitario.bind(this));

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

            // Inicialização das novas abas
            if (this.extPosto) this.loadPostosOptions();
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

        calculateTotal() {
            const qtd = parseFloat(this.qtdTotalNotaInput.value.replace(',', '.')) || 0;
            const vlr = parseFloat(this.vlrLitroInput.value.replace(',', '.')) || 0;
            const total = qtd * vlr;
            
            this.totalInput.value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        },

        async loadTanques() {
            try {
                const { data, error } = await supabaseClient
                    .from('tanques')
                    .select('id, nome, tipo_combustivel')
                    .order('nome');

                if (error) throw error;

                this.tanquesDisponiveis = data || [];                

                this.adicionarLinhaTanque(); // Adiciona a primeira linha para a ENTRADA
            } catch (error) {
                console.error('Erro ao carregar tanques:', error);
            }
        },

        async loadEstoqueAtual() {
            if (!this.tbodyEstoque) return;
            this.tbodyEstoque.innerHTML = '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';

            try {
                // 1. Buscar todos os tanques
                const { data: tanques, error: tanquesError } = await supabaseClient
                    .from('tanques')
                    .select('id, nome, capacidade, tipo_combustivel');
                if (tanquesError) throw tanquesError;

                // 2. Buscar todas as entradas (abastecimentos)
                const { data: entradas, error: entradasError } = await supabaseClient
                    .from('abastecimentos')
                    .select('tanque_id, qtd_litros');
                if (entradasError) throw entradasError;

                // 3. Buscar todas as saídas
                const { data: saidas, error: saidasError } = await supabaseClient
                    .from('saidas_combustivel')
                    .select('qtd_litros, bicos(bombas(tanque_id))');
                if (saidasError) throw saidasError;

                // 4. Calcular o estoque atual
                const estoqueMap = new Map();
                tanques.forEach(t => {
                    estoqueMap.set(t.id, { ...t, estoque_atual: 0 });
                });
                entradas.forEach(e => {
                    if (estoqueMap.has(e.tanque_id)) {
                        estoqueMap.get(e.tanque_id).estoque_atual += e.qtd_litros;
                    }
                });
                saidas.forEach(s => {
                    const tanqueId = s.bicos?.bombas?.tanque_id;
                    if (tanqueId && estoqueMap.has(tanqueId)) {
                        estoqueMap.get(tanqueId).estoque_atual -= s.qtd_litros;
                    }
                });
                const estoqueCalculado = Array.from(estoqueMap.values());

                // 5. Renderizar a tabela
                this.tbodyEstoque.innerHTML = '';
                if (estoqueCalculado.length === 0) {
                    this.tbodyEstoque.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum tanque cadastrado.</td></tr>';
                    return;
                }

                estoqueCalculado.forEach(tanque => {
                    const tr = document.createElement('tr');
                    // Armazena o estoque calculado em um atributo de dados para comparação posterior
                    tr.dataset.calculatedStock = tanque.estoque_atual;
                    
                    const capacidade = parseFloat(tanque.capacidade) || 0;
                    const estoque = parseFloat(tanque.estoque_atual) || 0;
                    const percentual = capacidade > 0 ? ((estoque / capacidade) * 100).toFixed(0) : 0;
                    
                    let color = '#006937'; // Verde
                    if(percentual < 20) color = '#dc3545'; // Vermelho
                    else if(percentual < 50) color = '#ffc107'; // Amarelo

                    tr.innerHTML = `
                        <td>${tanque.nome}</td>
                        <td>${tanque.tipo_combustivel}</td>
                        <td>${tanque.capacidade ? tanque.capacidade.toLocaleString('pt-BR') + ' L' : '-'}</td>
                        <td style="width: 250px; vertical-align: middle;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="flex-grow: 1; background: #e9ecef; height: 10px; border-radius: 5px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">
                                    <div style="width: ${Math.min(percentual, 100)}%; background: ${color}; height: 100%; border-radius: 5px; transition: width 0.5s ease;"></div>
                                </div>
                                <span style="font-weight: bold; color: ${color}; font-size: 0.9rem; min-width: 40px; text-align: right;">${percentual}%</span>
                            </div>
                        </td>
                        <td>
                            <input type="text" class="input-estoque-atual glass-input" data-id="${tanque.id}" 
                                   data-capacidade="${tanque.capacidade || 0}"
                                   value="${tanque.estoque_atual.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}" 
                                   oninput="this.value = this.value.replace(/[^0-9,.]/g, '')">
                        </td>
                    `;
                    this.tbodyEstoque.appendChild(tr);
                });

            } catch (error) {
                console.error('Erro ao carregar estoque:', error);
                this.tbodyEstoque.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
            }
        },

        handleEstoqueChange(e) {
            if (!e.target.classList.contains('input-estoque-atual')) return;
            const input = e.target;
            const rawValue = input.value;
            const normalizedValue = parseFloat(rawValue.replace(/\./g, '').replace(',', '.'));
            const capacidade = parseFloat(input.dataset.capacidade);

            if (!isNaN(normalizedValue) && !isNaN(capacidade) && normalizedValue > capacidade) {
                alert(`O valor informado excede a capacidade máxima do tanque (${capacidade.toLocaleString('pt-BR')} L).`);
                input.value = capacidade.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            }
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
                const normalizedValue = rawValue.replace(/\./g, '').replace(',', '.');
                const novoEstoque = parseFloat(normalizedValue);
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
                        valor_litro: 0,
                        valor_total: 0,
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

            } catch (error) {
                console.error('Erro ao salvar ajuste de estoque:', error);
                alert('Erro ao salvar ajuste: ' + error.message);
            } finally {
                this.btnSalvarEstoque.disabled = false;
                this.btnSalvarEstoque.innerHTML = '<i class="fas fa-save"></i> Atualizar Estoque';
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
            this.loadBicos();

            // Carregar Veículos
            try {
                const { data: veiculos } = await supabaseClient.from('veiculos').select('placa, modelo').order('placa');
                if (veiculos) {
                    this.veiculosDisponiveis = veiculos; // Armazena no cache
                    this.listaVeiculos.innerHTML = this.veiculosDisponiveis.map(v => `<option value="${v.placa}">${v.modelo}</option>`).join('');
                }
            } catch (e) { console.error('Erro ao carregar veículos', e); }
            
            // Carregar Rotas (substituindo Motoristas)
            try {
                const { data: rotas, error: errRotas } = await supabaseClient
                    .from('rotas')
                    .select('numero');
                
                if (errRotas) throw errRotas;

                if (rotas) {
                    // Ordenação numérica correta
                    rotas.sort((a, b) => {
                        return String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true, sensitivity: 'base' });
                    });

                    this.listaRotas.innerHTML = rotas.map(r => `<option value="${r.numero}"></option>`).join('');
                }
            } catch (e) { console.error('Erro ao carregar rotas', e); }
        },

        async loadBicos() {
            if (!this.saidaBico) return;
            try {
                const { data, error } = await supabaseClient
                    .from('bicos')
                    .select('id, nome, bombas(nome, tanques(nome))')
                    .order('nome');

                if (error) throw error;

                this.bicosDisponiveis = data || [];
                this.bicosDisponiveis.sort((a, b) => a.nome.localeCompare(b.nome, undefined, { numeric: true, sensitivity: 'base' }));
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
            const row = document.createElement('div');
            row.className = 'distribuicao-row';

            const select = document.createElement('select');
            select.className = 'tanque-select glass-input';
            select.innerHTML = '<option value="">-- Selecione um Tanque --</option>';
            this.tanquesDisponiveis.forEach(t => {
                const option = new Option(`${t.nome} (${t.tipo_combustivel})`, t.id);
                select.add(option);
            });
            select.value = tanqueId;

            const inputQtd = document.createElement('input');
            inputQtd.type = 'number';
            inputQtd.className = 'tanque-qtd glass-input';
            inputQtd.placeholder = 'Litros';
            inputQtd.step = '0.01';
            inputQtd.min = '0.01';
            inputQtd.value = qtd;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn-remove-tanque';
            removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
            removeBtn.title = 'Remover linha';

            row.appendChild(select);
            row.appendChild(inputQtd);
            row.appendChild(removeBtn);

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
                // Faz join com a tabela de tanques para pegar o nome
                let query = supabaseClient
                    .from('abastecimentos')
                    .select('*, tanques(nome, tipo_combustivel)');
                
                // Adiciona filtro de data
                if (this.filtroDataInicial && this.filtroDataFinal) {
                    const dataInicial = this.filtroDataInicial.value;
                    const dataFinal = this.filtroDataFinal.value;

                    if (dataInicial && dataFinal) {
                        // Adiciona T00:00:00 e T23:59:59 para incluir o dia inteiro
                        query = query.gte('data', `${dataInicial}T00:00:00`);
                        query = query.lte('data', `${dataFinal}T23:59:59`);
                    }
                }    

                // Aplica a ordenação baseada no estado atual
                const { field, ascending } = this.sortState;
                if (field.includes('.')) {
                    const [table, col] = field.split('.');
                    query = query.order(col, { foreignTable: table, ascending: ascending });
                } else {
                    query = query.order(field, { ascending: ascending });
                }

                const { data, error } = await query;
                if (error) throw error;
                return data || [];
            } catch (error) {
                console.error('Erro ao buscar abastecimentos:', error);
                return [];
            }
        },

        async handleFormSubmit(e) {
            e.preventDefault();

            const totalNota = parseFloat(this.qtdTotalNotaInput.value.replace(',', '.')) || 0;
            const vlr = parseFloat(this.vlrLitroInput.value.replace(',', '.')) || 0;
            const notaFiscal = this.notaInput.value;

            if (totalNota <= 0 || vlr <= 0) {
                alert('Quantidade Total e Valor por Litro devem ser maiores que zero.');
                return;
            }

            const linhas = this.distribuicaoContainer.querySelectorAll('.distribuicao-row');
            if (linhas.length === 0) {
                alert('Adicione pelo menos um tanque para a distribuição.');
                return;
            }

            const payloads = [];
            const tanquesUsados = new Set();
            let totalDistribuido = 0;

            for (const linha of linhas) {
                const tanqueId = linha.querySelector('.tanque-select').value;
                const qtd = parseFloat(linha.querySelector('.tanque-qtd').value.replace(',', '.')) || 0;

                if (!tanqueId || isNaN(qtd) || qtd <= 0) {
                    alert('Todas as linhas de distribuição devem ter um tanque e uma quantidade válida.');
                    return;
                }
                if (tanquesUsados.has(tanqueId)) {
                    alert('Não é permitido selecionar o mesmo tanque mais de uma vez.');
                    return;
                }

                tanquesUsados.add(tanqueId);
                totalDistribuido += qtd;

                payloads.push({
                    data: this.dataInput.value ? new Date(this.dataInput.value).toISOString() : new Date().toISOString(),
                    numero_nota: notaFiscal,
                    tanque_id: parseInt(tanqueId),
                    qtd_litros: qtd,
                    valor_litro: vlr,
                    valor_total: qtd * vlr,
                    usuario: this.getUsuarioLogado()
                });
            }

            if (Math.abs(totalDistribuido - totalNota) > 0.001) {
                alert(`A soma dos litros distribuídos (${totalDistribuido.toFixed(2)} L) não corresponde à Quantidade Total da Nota (${totalNota.toFixed(2)} L).`);
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
                this.clearForm();
                this.renderTable();
            } catch (error) {
                console.error('Erro ao salvar:', error);
                alert('Erro ao salvar abastecimento: ' + error.message + '. Se estiver atualizando, os dados antigos podem ter sido removidos.');
            }
        },

        async renderTable() {
            this.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';
            const registros = await this.getAbastecimentos();
            this.tableBody.innerHTML = '';

            if (registros.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="7">Nenhum registro encontrado.</td></tr>';
                return;
            }

            registros.forEach(reg => {
                const tr = document.createElement('tr');
                const dataFormatada = new Date(reg.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                // Formata o valor por litro para exibir mais casas decimais
                const vlrLitroFormatado = (reg.valor_litro || 0).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6 // Aumenta o número de casas decimais exibidas
                });
                // O valor total também precisa de mais precisão
                const totalFormatado = (reg.valor_total || 0).toLocaleString('pt-BR', {
                    style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 6
                });
                const tanqueNome = reg.tanques ? reg.tanques.nome : 'Tanque excluído';

                tr.innerHTML = `
                    <td>${dataFormatada}</td>
                    <td>${reg.numero_nota}</td>
                    <td>${tanqueNome}</td>
                    <td>${reg.qtd_litros.toLocaleString('pt-BR')} L</td>
                    <td>${vlrLitroFormatado}</td>
                    <td>${totalFormatado}</td>
                    <td>${reg.usuario || '-'}</td>
                    <td style="display: flex; gap: 5px; justify-content: center;">
                        <button class="btn-action btn-edit" data-id="${reg.id}" style="color: #007bff; border: none; background: transparent; cursor: pointer;" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-action btn-delete" data-id="${reg.id}" style="color: #dc3545; border: none; background: transparent; cursor: pointer;" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBody.appendChild(tr);
            });
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
                const { data: registroClicado } = await supabaseClient.from('abastecimentos').select('numero_nota').eq('id', id).single();
                if (!registroClicado) return;

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
                // Formata a data para o input datetime-local
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

            } else if (button.classList.contains('btn-delete')) {
                if (confirm('Tem certeza que deseja excluir este lançamento?')) {
                    try {
                        const { error } = await supabaseClient.from('abastecimentos').delete().eq('id', id);
                        if (error) throw error;
                        this.renderTable();
                    } catch (error) {
                        console.error('Erro ao excluir:', error);
                        alert('Erro ao excluir lançamento: ' + error.message);
                    }
                }
            }
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
            if(this.saidaUsuario) this.saidaUsuario.value = this.getUsuarioLogado();
        },

        async handleSaidaSubmit(e) {
            e.preventDefault();
            
            // Validação da Placa
            const placaInput = this.saidaVeiculo.value.toUpperCase();
            const veiculoValido = this.veiculosDisponiveis.some(v => v.placa === placaInput);
            if (!veiculoValido) {
                alert('Placa inválida. Por favor, selecione um veículo cadastrado na lista.');
                this.saidaVeiculo.focus();
                return;
            }

            const commonData = {
                data_hora: this.saidaDataHora.value ? new Date(this.saidaDataHora.value).toISOString() : new Date().toISOString(),
                veiculo_placa: placaInput,
                rota: this.saidaRota.value,
                km_atual: parseFloat(this.saidaKm.value),

                usuario: this.getUsuarioLogado()
            };

            if (this.saidaEditingId.value) {
                payload.id = parseInt(this.saidaEditingId.value);
            }
const payloads = [];

            // Bico 1 (Obrigatório)
            const bico1 = parseInt(this.saidaBico.value);
            const litros1 = parseFloat(this.saidaLitros.value);
            if (bico1 && litros1 > 0) {
                payloads.push({ ...commonData, bico_id: bico1, qtd_litros: litros1 });
            } else {
                alert('Informe o Bico e a Quantidade de Litros para o primeiro abastecimento.');
                return;
            }

            // Bico 2 (Opcional - se visível e preenchido)
            const isBico2Visible = !this.camposBico2.classList.contains('hidden');
            const bico2 = parseInt(this.saidaBico2.value);
            const litros2 = parseFloat(this.saidaLitros2.value);

            if (isBico2Visible && bico2 && litros2 > 0) {
                if (bico1 === bico2) {
                    alert('Não é possível utilizar o mesmo bico duas vezes no mesmo registro.');
                    return;
                }
                payloads.push({ ...commonData, bico_id: bico2, qtd_litros: litros2 });
            }

            try {
                if (this.saidaEditingId.value) {
                    const { error } = await supabaseClient.from('saidas_combustivel').update(payloads[0]).eq('id', this.saidaEditingId.value);
                    if (error) throw error;
                } else {
                    const { error } = await supabaseClient.from('saidas_combustivel').insert(payloads);
                    if (error) throw error;
                }

                alert(`Abastecimento(s) ${this.saidaEditingId.value ? 'atualizado' : 'registrado'} com sucesso!`);
                this.clearSaidaForm();
                this.renderSaidasTable();
            } catch (error) {
                console.error('Erro ao salvar saída:', error);
                alert('Erro ao registrar saída: ' + error.message);
            }
        },

        async renderSaidasTable(fetchData = true) {
            if (!this.tableBodySaidas) return;
            
            if (fetchData) {
                this.tableBodySaidas.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';
                try {
                    let query = supabaseClient
                        .from('saidas_combustivel')
                        .select('*');

                    // Adiciona filtro de data
                    if (this.filtroSaidaDataInicial && this.filtroSaidaDataFinal) {
                        const dataInicial = this.filtroSaidaDataInicial.value;
                        const dataFinal = this.filtroSaidaDataFinal.value;

                        if (dataInicial && dataFinal) {
                            // Adiciona T00:00:00 e T23:59:59 para incluir o dia inteiro
                            query = query.gte('data_hora', `${dataInicial}T00:00:00`);
                            query = query.lte('data_hora', `${dataFinal}T23:59:59`);
                        }
                    }

                    query = query.order('data_hora', { ascending: false });

                    const { data, error } = await query;
                    if (error) throw error;
                    this.saidasData = data || [];
                } catch (error) {
                    console.error('Erro ao carregar histórico de saídas:', error);
                    this.tableBodySaidas.innerHTML = '<tr><td colspan="7" class="text-center" style="color:red;">Erro ao carregar histórico.</td></tr>';
                    return;
                }
            }

            // Filtragem
            const term = this.searchSaidaInput ? this.searchSaidaInput.value.toLowerCase() : '';
            const filtered = this.saidasData.filter(item => {
                const dataF = new Date(item.data_hora).toLocaleString('pt-BR').toLowerCase();
                return (item.veiculo_placa || '').toLowerCase().includes(term) ||
                       (item.rota || '').toLowerCase().includes(term) ||
                       dataF.includes(term);
            });

            // Ordenação
            filtered.sort((a, b) => {
                let valA = a[this.saidasSort.key];
                let valB = b[this.saidasSort.key];
                if (valA === null) valA = '';
                if (valB === null) valB = '';
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();
                if (valA < valB) return this.saidasSort.asc ? -1 : 1;
                if (valA > valB) return this.saidasSort.asc ? 1 : -1;
                return 0;
            });

            // Atualiza Ícones
            document.querySelectorAll('.sortable-saida i').forEach(i => i.className = 'fas fa-sort');
            const activeTh = document.querySelector(`.sortable-saida[data-sort="${this.saidasSort.key}"] i`);
            if (activeTh) activeTh.className = this.saidasSort.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';

            this.tableBodySaidas.innerHTML = '';
            if (filtered.length === 0) {
                this.tableBodySaidas.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma saída registrada.</td></tr>';
                return;
            }

            this.tableBodySaidas.innerHTML = filtered.map(saida => `
                    <tr>
                        <td>${new Date(saida.data_hora).toLocaleString('pt-BR')}</td>
                        <td>${saida.veiculo_placa || ''}</td>
                        <td>${saida.rota || ''}</td>
                        <td>${parseFloat(saida.qtd_litros).toLocaleString('pt-BR')} L</td>
                        <td>${saida.km_atual || ''}</td>
                        <td>${saida.usuario || '-'}</td>
                        <td style="display: flex; gap: 5px; justify-content: center;">
                            <button class="btn-action btn-edit" data-id="${saida.id}" style="color: #007bff; border: none; background: transparent; cursor: pointer;" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn-action btn-delete" data-id="${saida.id}" style="color: #dc3545; border: none; background: transparent; cursor: pointer;" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('');
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
                this.saidaKm.value = data.km_atual;
                this.saidaLitros.value = data.qtd_litros;

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
            const ths = document.querySelectorAll('#containerHistoricoEntrada th[data-field]');
            ths.forEach(th => {
                const icon = th.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-sort'; // Reset para ícone neutro
                    if (th.dataset.field === this.sortState.field) {
                        icon.className = this.sortState.ascending ? 'fas fa-sort-up' : 'fas fa-sort-down';
                    }
                }
            });
        },

        async deleteSaida(id) {
            try {
                const { error } = await supabaseClient.from('saidas_combustivel').delete().eq('id', id);
                if (error) throw error;
                alert('Registro de saída excluído com sucesso!');
                this.renderSaidasTable();
            } catch (error) {
                console.error('Erro ao excluir saída:', error);
                alert('Erro ao excluir o registro.');
            }
        },

        // --- LÓGICA ABASTEIMENTO EXTERNO ---

        async loadFiliaisOptions() {
            try {
                const { data, error } = await supabaseClient.from('filiais').select('nome').order('nome');
                if (error) throw error;
                
                const options = '<option value="">Selecione a Filial</option>' + 
                    (data || []).map(f => `<option value="${f.nome}">${f.nome}</option>`).join('');

                if (this.extFilial) this.extFilial.innerHTML = options;
                if (this.postoFilial) this.postoFilial.innerHTML = options;
            } catch (error) {
                console.error('Erro ao carregar filiais:', error);
            }
        },

        async loadRotasOptions() {
            const datalist = document.getElementById('listaRotasExternas');
            if (!datalist) return;
            
            try {
                const { data, error } = await supabaseClient
                    .from('rotas')
                    .select('numero')
                    .order('numero');

                if (error) throw error;

                datalist.innerHTML = '';
                // Ordena numericamente se possível
                const sortedData = (data || []).sort((a, b) => String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true, sensitivity: 'base' }));
                
                sortedData.forEach(r => {
                    const option = document.createElement('option');
                    option.value = r.numero;
                    datalist.appendChild(option);
                });
            } catch (error) {
                console.error('Erro ao carregar rotas:', error);
            }
        },

        async loadPostosOptions() {
            const datalist = document.getElementById('listaPostosExternos');
            if (!datalist) return;

            // Inicializa data atual
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            if(this.extDataHora) this.extDataHora.value = now.toISOString().slice(0, 16);

            try {
                // --- CORREÇÃO: Busca todos os postos, contornando o limite padrão de 1000 registros ---
                let allPostos = [];
                let from = 0;
                const step = 1000;
                let keepFetching = true;

                while(keepFetching) {
                    const { data, error } = await supabaseClient
                        .from('postos')
                        .select('id, razao_social, cnpj')
                        .order('razao_social')
                        .range(from, from + step - 1);
                    
                    if (error) throw error;

                    if (data && data.length > 0) {
                        allPostos.push(...data);
                        if (data.length < step) {
                            keepFetching = false; // Última página
                        } else {
                            from += step; // Prepara para a próxima página
                        }
                    } else {
                        keepFetching = false; // Não há mais dados
                    }
                }
                this.postosCache = allPostos || []; // Cache para lookup de ID ao salvar

                datalist.innerHTML = '';
                this.postosCache.forEach(p => {
                    const option = document.createElement('option');
                    option.value = `${p.razao_social} (${p.cnpj || 'S/CNPJ'})`;
                    datalist.appendChild(option);
                });
            } catch (error) {
                console.error('Erro ao carregar postos:', error);
                alert('Ocorreu um erro ao carregar a lista de postos para o formulário. Verifique o console para mais detalhes.');
            }
        },

        async handleExtVeiculoChange() {
            const placa = this.extVeiculo.value.toUpperCase();
            if (!placa) return;

            // 1. Buscar Tipo do Veículo
            const { data: veiculo } = await supabaseClient.from('veiculos').select('*').eq('placa', placa).single();
            if (veiculo && this.extTipo) {
                this.extTipo.value = veiculo.tipo || '';
            }
            // Tenta exibir a capacidade se existir no cadastro, senão deixa traço
            if (this.extCapacidadeTanque) {
                this.extCapacidadeTanque.textContent = (veiculo && veiculo.capacidade_tanque) ? veiculo.capacidade_tanque : '--';
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

        async handleImportarExterno(e) {
            const file = e.target.files[0];
            if (!file) return;

            const btn = this.btnImportarExterno;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(firstSheet);

                    if (json.length === 0) throw new Error('Arquivo vazio.');

                    // 1. Carregar Postos para mapear CNPJ -> ID
                    const { data: postos } = await supabaseClient.from('postos').select('id, cnpj');
                    const mapPostos = new Map();
                    if (postos) {
                        postos.forEach(p => {
                            if (p.cnpj) mapPostos.set(p.cnpj.replace(/\D/g, ''), p.id);
                        });
                    }

                    const usuario = this.getUsuarioLogado();
                    const payloads = [];
                    const rejectedRows = []; // Array para armazenar linhas rejeitadas
                    let erros = 0;

                    for (const row of json) {
                        // Normalizar chaves
                        const r = {};
                        Object.keys(row).forEach(k => r[k.toUpperCase().trim()] = row[k]);

                        // Mapeamento de Colunas conforme solicitação:
                        // FILIAL, DATA E HORA, CNPJ, PLACA, ROTA, KM ATUAL, LITROS, VALOR TOTAL, VALOR UNITÁRIO
                        const filial = r['FILIAL'] || '';
                        const veiculo = r['PLACA'] || r['VEICULO'] || r['VEICULO(PLACA)'];
                        const cnpjRaw = r['CNPJ'] || r['POSTO'] || r['POSTO(CNPJ)'];
                        const rota = r['ROTA'] || '';
                        const kmAtual = parseFloat(r['KM ATUAL'] || r['KM_ATUAL'] || r['KM']) || 0;
                        const litros = parseFloat(r['LITROS'] || r['LITROS_ABASTECIDOS']) || 0;
                        const valorTotal = parseFloat(r['VALOR TOTAL'] || r['TOTAL']) || 0;
                        const valorUnitario = parseFloat(r['VALOR UNITÁRIO'] || r['VALOR UNITARIO'] || r['VALOR_UNITARIO'] || r['UNITARIO']) || 0;
                        
                        let dataHora = r['DATA E HORA'] || r['DATAEHORA'] || r['DATA'];
                        if (dataHora instanceof Date) {
                            dataHora = dataHora.toISOString();
                        } else if (typeof dataHora === 'string') {
                            // Tenta converter string PT-BR ou ISO
                            // Se for data excel serial number, o cellDates: true já tratou
                            const d = new Date(dataHora);
                            if(!isNaN(d)) dataHora = d.toISOString();
                            else dataHora = new Date().toISOString(); // Fallback
                        } else {
                            dataHora = new Date().toISOString();
                        }

                        if (!veiculo || !kmAtual || !litros) {
                            console.warn('Linha ignorada por falta de dados essenciais:', r);
                            erros++;
                            rejectedRows.push({ ...row, motivo_rejeicao: 'Faltam dados essenciais (Placa, KM ou Litros).' });
                            continue;
                        }

                        // Tratamento de CNPJ para encontrar ID
                        const cnpjLimpo = String(cnpjRaw || '').replace(/\D/g, '');
                        const postoId = mapPostos.get(cnpjLimpo);

                        if (!postoId) {
                            console.warn(`Posto não encontrado para CNPJ: ${cnpjRaw} na linha do veículo ${veiculo}`);
                            // Opcional: Criar posto ou pular? Vamos pular por segurança ou deixar nulo se o banco permitir
                            // O banco exige foreign key se informado? Se posto_id for null, ok se a coluna permitir.
                            // Mas para relatório é ruim. Vamos contar como erro ou tentar prosseguir sem posto?
                            // Assumindo que posto é importante:
                            // erros++; continue; 
                            // Se quiser permitir sem posto, comente a linha abaixo.
                            rejectedRows.push({ ...row, motivo_rejeicao: `Posto com CNPJ '${cnpjRaw || 'vazio'}' não encontrado.` });
                            continue;
                        }

                        // Buscar KM Anterior
                        let kmAnterior = 0;
                        const { data: ultRegArray, error: kmError } = await supabaseClient
                            .from('abastecimento_externo')
                            .select('km_atual')
                            .eq('veiculo_placa', veiculo)
                            .lt('data_hora', dataHora)
                            .order('data_hora', { ascending: false })
                            .limit(1);
                        
                        if (kmError && kmError.code !== 'PGRST116') { // PGRST116 = no rows found, o que é ok
                            console.error(`Erro ao buscar KM anterior para ${veiculo}:`, kmError);
                        }

                        if (ultRegArray && ultRegArray.length > 0) {
                            kmAnterior = ultRegArray[0].km_atual;
                        }

                        payloads.push({
                            filial: filial,
                            data_hora: dataHora,
                            posto_id: postoId,
                            posto_id: postoId || null,
                            veiculo_placa: veiculo,
                            rota: rota,
                            km_atual: kmAtual,
                            km_anterior: kmAnterior,
                            km_rodado: (kmAtual > kmAnterior) ? (kmAtual - kmAnterior) : 0,
                            litros: litros,
                            valor_total: valorTotal,
                            valor_unitario: valorUnitario,
                            usuario: usuario
                        });
                    }
                    // Se houver linhas rejeitadas, gera o arquivo de texto
                    if (rejectedRows.length > 0) {
                        this.gerarTxtRejeitados(rejectedRows);
                    }

                    if (payloads.length > 0) {
                        const { error } = await supabaseClient.from('abastecimento_externo').insert(payloads);
                        if (error) throw error;
                        alert(`Importação concluída! ${payloads.length} registros inseridos.${rejectedRows.length > 0 ? `\n(${rejectedRows.length} registros foram rejeitados - verifique o arquivo .txt baixado).` : ''}`);
                        alert(`Importação concluída! ${payloads.length} registros inseridos.${erros > 0 ? ` (${erros} ignorados)` : ''}`);
                        this.renderExtTable();
                    } else {
                        alert(`Nenhum dado válido encontrado para importação.${rejectedRows.length > 0 ? `\n(${rejectedRows.length} registros foram rejeitados - verifique o arquivo .txt baixado).` : ''}`);
                        alert('Nenhum dado válido encontrado para importação.');
                    }

                } catch (err) {
                    console.error('Erro na importação:', err);
                    alert('Erro ao processar arquivo: ' + err.message);
                } finally {
                    e.target.value = '';
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            };
            reader.readAsArrayBuffer(file);
        },

        gerarTxtRejeitados(rejectedRows) {
            let txtContent = "Linhas Rejeitadas na Importação de Abastecimento Externo\n";
            txtContent += "============================================================\n\n";

            rejectedRows.forEach((row, index) => {
                txtContent += `Registro ${index + 1}:\n`;
                txtContent += `  Motivo da Rejeição: ${row.motivo_rejeicao}\n`;
                txtContent += `  Dados da Linha:\n`;
                for (const key in row) {
                    if (key !== 'motivo_rejeicao') {
                        txtContent += `    - ${key}: ${row[key]}\n`;
                    }
                }
                txtContent += "\n------------------------------------------------------------\n\n";
            });

            const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            link.setAttribute('download', `rejeitados_abastecimento_${timestamp}.txt`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },

        async handleExtSubmit(e) {
            e.preventDefault();
            
            // Resolver ID do Posto a partir do texto do input
            let postoId = null;
            const postoVal = this.extPosto.value;
            if (this.postosCache) {
                const found = this.postosCache.find(p => `${p.razao_social} (${p.cnpj || 'S/CNPJ'})` === postoVal);
                if (found) postoId = found.id;
            }

            if (!postoId) return alert('Selecione um posto válido da lista.');

            const payload = {
                data_hora: this.extDataHora.value ? new Date(this.extDataHora.value).toISOString() : new Date().toISOString(),
                filial: this.extFilial.value,
                posto_id: postoId,
                veiculo_placa: this.extVeiculo.value.toUpperCase(),
                tipo_veiculo: this.extTipo.value,
                km_atual: parseFloat(this.extKmAtual.value),
                km_anterior: parseFloat(this.extKmAnterior.value),
                km_rodado: parseFloat(this.extKmRodado.value),
                litros: parseFloat(this.extLitros.value),
                valor_total: parseFloat(this.extValorTotal.value),
                valor_unitario: parseFloat(this.extValorUnitario.value),
                rota: this.extRota.value,
                usuario: this.getUsuarioLogado()
            };

            if (!payload.posto_id || !payload.veiculo_placa || !payload.km_atual) {
                return alert('Preencha os campos obrigatórios.');
            }

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
                this.resetExtForm();
                this.renderExtTable();
            }
        },

        async renderExtTable(fetchData = true) {
            if (!this.tableBodyExt) return;
            
            if (fetchData) {
                this.tableBodyExt.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando...</td></tr>';
                // Aumentei o limite para 200 para permitir uma ordenação/busca local mais fluida
                let query = supabaseClient
                    .from('abastecimento_externo')
                    .select('*, postos(razao_social)');

                // Adiciona filtro de data
                if (this.filtroExtDataInicial && this.filtroExtDataFinal) {
                    const dataInicial = this.filtroExtDataInicial.value;
                    const dataFinal = this.filtroExtDataFinal.value;

                    if (dataInicial && dataFinal) {
                        query = query.gte('data_hora', `${dataInicial}T00:00:00`);
                        query = query.lte('data_hora', `${dataFinal}T23:59:59`);
                    }
                }
                
                query = query.order('data_hora', { ascending: false });

                const { data } = await query;
                this.extData = data || [];
            }

            // --- ADMIN BULK DELETE SETUP ---
            const isAdmin = this.getUserLevel() === 'administrador';
            
            // Inject Header Checkbox if needed
            const table = this.tableBodyExt.closest('table');
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

            // Filtragem
            const term = this.searchExtInput ? this.searchExtInput.value.toLowerCase() : '';
            const filtered = this.extData.filter(item => {
                const postoNome = item.postos?.razao_social || '';
                return (item.veiculo_placa || '').toLowerCase().includes(term) ||
                       (postoNome).toLowerCase().includes(term) ||
                       (item.data_hora || '').toLowerCase().includes(term);
            });

            // Ordenação
            filtered.sort((a, b) => {
                let valA = a[this.extSort.key];
                let valB = b[this.extSort.key];

                // Tratamento especial para coluna de relacionamento 'posto'
                if (this.extSort.key === 'posto') {
                    valA = a.postos?.razao_social || '';
                    valB = b.postos?.razao_social || '';
                }

                if (valA === null) valA = '';
                if (valB === null) valB = '';

                // Se for data, string ou número
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();
                
                if (valA < valB) return this.extSort.asc ? -1 : 1;
                if (valA > valB) return this.extSort.asc ? 1 : -1;
                return 0;
            });

            // Atualiza Ícones
            document.querySelectorAll('.sortable-ext i').forEach(i => i.className = 'fas fa-sort');
            const activeTh = document.querySelector(`.sortable-ext[data-sort="${this.extSort.key}"] i`);
            if (activeTh) activeTh.className = this.extSort.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';

            this.tableBodyExt.innerHTML = '';
            const colCount = isAdmin ? 9 : 8; // 8 original columns + 1 checkbox

            if (filtered.length === 0) {
                this.tableBodyExt.innerHTML = `<tr><td colspan="${colCount}">Nenhum registro.</td></tr>`;
                return;
            }

            filtered.forEach(item => {
                const tr = document.createElement('tr');
                const dataF = new Date(item.data_hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                const valTotal = item.valor_total ? item.valor_total.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : '-';
                
                let checkboxHtml = '';
                if (isAdmin) {
                    checkboxHtml = `<td style="text-align:center;"><input type="checkbox" class="chk-ext-delete" value="${item.id}"></td>`;
                }

                tr.innerHTML = `
                    ${checkboxHtml}
                    <td>${dataF}</td>
                    <td>${item.postos?.razao_social || '-'}</td>
                    <td>${item.veiculo_placa}</td>
                    <td>${item.litros || '-'} L</td>
                    <td>${valTotal}</td>
                    <td>${item.valor_unitario || '-'}</td>
                    <td>${item.km_atual || '-'}</td>
                    <td style="display: flex; gap: 5px; justify-content: center;">
                        <button class="btn-action btn-edit-ext" data-id="${item.id}" style="color: #007bff; border: none; background: transparent; cursor: pointer;" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-action btn-delete-ext" data-id="${item.id}" style="color: #dc3545; border: none; background: transparent; cursor: pointer;" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBodyExt.appendChild(tr);
            });

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
            
            if (data.postos) {
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

            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(firstSheet);

                    if (json.length === 0) throw new Error('Arquivo vazio.');
                    
                    // Carrega CNPJs existentes para verificação de duplicidade
                    const { data: existingData } = await supabaseClient.from('postos').select('cnpj');
                    const existingCnpjs = new Set();
                    if (existingData) {
                        existingData.forEach(p => {
                            if (p.cnpj) existingCnpjs.add(p.cnpj.replace(/\D/g, ''));
                        });
                    }

                    const payloads = [];
                    let erros = 0;
                    let duplicados = 0;
                    const cnpjsNoArquivo = new Set(); // Para evitar duplicados no próprio arquivo

                    for (const row of json) {
                        const r = {};
                        Object.keys(row).forEach(k => r[k.toUpperCase().trim()] = row[k]);

                        // Campos: Razão Social, Cidade, UF, Filial, CNPJ
                        const razao = r['RAZÃO SOCIAL'] || r['RAZAO SOCIAL'] || r['RAZAO'] || r['NOME'];
                        if (!razao) { erros++; continue; }

                        const cnpjRaw = r['CNPJ'] ? String(r['CNPJ']) : '';
                        
                        // Verificação de duplicidade
                        if (cnpjRaw) {
                            const cnpjClean = cnpjRaw.replace(/\D/g, '');
                            if (cnpjClean) {
                                if (existingCnpjs.has(cnpjClean) || cnpjsNoArquivo.has(cnpjClean)) {
                                    duplicados++;
                                    continue; // Pula este registro
                                }
                                cnpjsNoArquivo.add(cnpjClean);
                            }
                        }

                        payloads.push({
                            razao_social: razao,
                            cidade: r['CIDADE'] || '',
                            uf: r['UF'] || '',
                            filial: r['FILIAL'] || '',
                            cnpj: cnpjRaw,
                            faturado: false // Padrão
                        });
                    }

                    if (payloads.length > 0) {
                        const { error } = await supabaseClient.from('postos').insert(payloads);
                        if (error) throw error;
                        
                        let msg = `Importação concluída! ${payloads.length} postos cadastrados.`;
                        if (duplicados > 0) msg += `\n(${duplicados} ignorados por CNPJ duplicado)`;
                        
                        alert(msg);
                        this.renderPostosTable();
                        this.loadPostosOptions();
                    } else {
                        if (duplicados > 0) alert(`Nenhum posto importado. ${duplicados} registros eram duplicados.`);
                        else alert('Nenhum dado válido encontrado.');
                    }
                } catch (err) {
                    console.error('Erro na importação de postos:', err);
                    alert('Erro ao processar arquivo: ' + err.message);
                } finally {
                    e.target.value = '';
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            };
            reader.readAsArrayBuffer(file);
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

            const payload = {
                filial: this.postoFilial.value,
                razao_social: this.postoRazao.value,
                cnpj: cnpjValue,
                cidade: this.postoCidade.value,
                uf: this.postoUf.value,
                faturado: this.postoFaturado.value === 'Sim'
            };

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
                
                // --- CORREÇÃO: Busca todos os postos para a tabela, contornando o limite padrão de 1000 ---
                let allPostos = [];
                let from = 0;
                const step = 1000;
                let keepFetching = true;

                while(keepFetching) {
                    const { data, error } = await supabaseClient
                        .from('postos')
                        .select('*')
                        .range(from, from + step - 1);

                    if (error) {
                        console.error("Erro ao buscar postos para a tabela:", error);
                        this.postosData = [];
                        keepFetching = false;
                        break;
                    }

                    if (data && data.length > 0) {
                        allPostos.push(...data);
                        if (data.length < step) keepFetching = false;
                        else from += step;
                    } else keepFetching = false;
                }
                this.postosData = allPostos;
            }

            // Filtragem
            const term = this.searchPostoInput ? this.searchPostoInput.value.toLowerCase() : '';
            const filtered = this.postosData.filter(p => {
                return (p.razao_social || '').toLowerCase().includes(term) ||
                       (p.cnpj || '').toLowerCase().includes(term) ||
                       (p.cidade || '').toLowerCase().includes(term);
            });

            // Ordenação
            filtered.sort((a, b) => {
                let valA = a[this.postosSort.key];
                let valB = b[this.postosSort.key];
                if (valA === null) valA = '';
                if (valB === null) valB = '';
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();
                
                if (valA < valB) return this.postosSort.asc ? -1 : 1;
                if (valA > valB) return this.postosSort.asc ? 1 : -1;
                return 0;
            });

            // Atualiza Ícones
            document.querySelectorAll('.sortable-posto i').forEach(i => i.className = 'fas fa-sort');
            const activeTh = document.querySelector(`.sortable-posto[data-sort="${this.postosSort.key}"] i`);
            if (activeTh) activeTh.className = this.postosSort.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';

            this.tableBodyPostos.innerHTML = '';
            if (filtered.length === 0) {
                this.tableBodyPostos.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum posto encontrado.</td></tr>';
                return;
            }

            filtered.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${p.filial || '-'}</td>
                    <td>${p.razao_social}</td>
                    <td>${p.cnpj || '-'}</td>
                    <td>${p.cidade || '-'}</td>
                    <td>${p.uf || '-'}</td>
                    <td>${p.faturado ? 'Sim' : 'Não'}</td>
                    <td style="display: flex; gap: 5px; justify-content: center;">
                        <button class="btn-action btn-edit-posto" data-id="${p.id}" style="color: #007bff; border: none; background: transparent; cursor: pointer;" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-action btn-delete-posto" data-id="${p.id}" style="color: #dc3545; border: none; background: transparent; cursor: pointer;" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBodyPostos.appendChild(tr);
            });
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

            this.postoEditingId = id;
            
            this.postoFilial.value = data.filial || '';
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
        },

        async deletePosto(id) {
            if(confirm('Excluir este posto?')) {
                const { error } = await supabaseClient.from('postos').delete().eq('id', id);
                if(error) alert('Erro ao excluir: ' + error.message);
                else {
                    this.renderPostosTable();
                    this.loadPostosOptions();
                }
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
    };

    AbastecimentoUI.init();
});