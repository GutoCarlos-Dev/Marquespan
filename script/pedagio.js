import { supabaseClient } from './supabase.js';
import XLSX from "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";
import { registrarAuditoria } from './auditoria-utils.js';

const TIMEZONE_BRASILIA = 'America/Sao_Paulo';
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const PEDAGIO_IMPORTACOES_BUCKET = 'pedagios_importacoes';
const PEDAGIO_PAGE_ID = 'pedagio.html';
const PEDAGIO_IMPORT_INSERT_BATCH_SIZE = 50;

const PedagioUI = {
    async init() {
        console.log('Página de Gestão de Pedágios iniciada.');
        
        // 1. Inicializa Variáveis de Estado Primeiro
        this.veiculosData = []; // Cache para dados de veículos
        this.empresasPedagio = []; // Cache para empresas de pedágio
        this.motoristasData = [];
        this.rotasData = [];
        this.filiaisData = [];
        this.importacoesPedagio = [];
        this.editingLancamentoId = null; // Para edição de lançamentos
        this.editingEmpresaId = null; // Para edição de empresas
        this.sortState = { field: 'data_hora_passagem', ascending: false }; // Alinhado com outros módulos

        this.cacheDOM();
        const acessoPermitido = await this.verificarPermissaoPagina();
        if (!acessoPermitido) return;
        if (this.empresaPedagioLayout && !this.empresaPedagioLayout.value.trim()) {
            this.empresaPedagioLayout.value = JSON.stringify(this.getLayoutPadraoPedagio(), null, 2);
        }
        this.setupLancamentosTab(); // 2. Configura as datas antes de qualquer carregamento
        this.bindEvents();
        this.exibirUsuario();

        await this.carregarVeiculos();
        await this.carregarFiliais();
        this.carregarMotoristas();
        this.carregarRotas();
        await this.carregarEmpresasPedagio(); // Carrega empresas de pedágio
        await this.carregarImportacoesPedagio();
        this.initTabs(); // 3. Ativa a aba padrão (isso chamará carregarLancamentos)
    },

    cacheDOM() {
        // Navegação por abas
        this.painelNavegacao = document.getElementById('menu-pedagio');
        this.sections = document.querySelectorAll('.main-content > section.glass-panel');

        this.usuarioDisplay = document.getElementById('usuario-logado');

        // Seção Lançamentos
        this.btnAdicionarLancamento = document.getElementById('btnAdicionarLancamento');
        this.btnExcluirSelecionados = document.getElementById('btnExcluirSelecionados');
        this.selectAllLancamentos = document.getElementById('selectAllLancamentos');
        this.filtroDataInicialLancamento = document.getElementById('filtroDataInicialLancamento');
        this.filtroDataFinalLancamento = document.getElementById('filtroDataFinalLancamento');
        this.searchPlaca = document.getElementById('searchPlaca');
        this.filtroFilialLancamento = document.getElementById('filtroFilialLancamento');
        this.btnFiltrarLancamentos = document.getElementById('btnFiltrarLancamentos');
        this.tableBodyLancamentos = document.getElementById('tableBodyLancamentos');

        // Modal de Lançamento
        this.modalLancamento = document.getElementById('modalLancamento');
        this.btnCloseModalLancamento = this.modalLancamento?.querySelector('.close-button');
        // Seção Lançamentos
        this.btnAdicionarLancamento = document.getElementById('btnAdicionarLancamento');
        this.btnExcluirSelecionados = document.getElementById('btnExcluirSelecionados');
        this.selectAllLancamentos = document.getElementById('selectAllLancamentos');
        this.filtroDataInicialLancamento = document.getElementById('filtroDataInicialLancamento');
        this.filtroDataFinalLancamento = document.getElementById('filtroDataFinalLancamento');
        this.searchPlaca = document.getElementById('searchPlaca');
        this.filtroFilialLancamento = document.getElementById('filtroFilialLancamento');
        this.btnFiltrarLancamentos = document.getElementById('btnFiltrarLancamentos');
        this.tableBodyLancamentos = document.getElementById('tableBodyLancamentos');

        // Modal de Lançamento
        this.modalLancamento = document.getElementById('modalLancamento');
        this.btnCloseModalLancamento = this.modalLancamento.querySelector('.close-button');
        this.formLancamentoPedagio = document.getElementById('formLancamentoPedagio');
        this.lancamentoPlaca = document.getElementById('lancamentoPlaca');
        this.lancamentoEmpresa = document.getElementById('lancamentoEmpresa');
        this.veiculosList = document.getElementById('veiculosList');
        this.lancamentoFilial = document.getElementById('lancamentoFilial');
        this.lancamentoTipo = document.getElementById('lancamentoTipo');
        this.lancamentoCateg = document.getElementById('lancamentoCateg');
        this.lancamentoDataHora = document.getElementById('lancamentoDataHora');
        this.lancamentoMotorista = document.getElementById('lancamentoMotorista');
        this.motoristasList = document.getElementById('motoristasList');
        this.lancamentoRota = document.getElementById('lancamentoRota');
        this.rotasList = document.getElementById('rotasList');
        this.lancamentoRodovia = document.getElementById('lancamentoRodovia');
        this.lancamentoPraca = document.getElementById('lancamentoPraca');
        this.btnGoogleMaps = document.getElementById('btnGoogleMaps');
        this.lancamentoValor = document.getElementById('lancamentoValor');

        // Seção Importação
        this.formImportacaoPedagio = document.getElementById('formImportacaoPedagio');
        this.empresaPedagioSelect = document.getElementById('empresaPedagioSelect');
        this.filialImportacaoPedagio = document.getElementById('filialImportacaoPedagio');
        this.arquivoImportacao = document.getElementById('arquivoImportacao');
        this.importStatus = document.getElementById('importStatus');
        this.importProgressContainer = document.getElementById('importProgressContainer');
        this.importProgressBar = document.getElementById('importProgressBar');
        this.importProgressPercent = document.getElementById('importProgressPercent');
        this.btnSubmitImport = this.formImportacaoPedagio?.querySelector('button[type="submit"]');
        this.tableBodyImportacoesPedagio = document.getElementById('tableBodyImportacoesPedagio');
        this.btnExpurgarDuplicadosPedagio = document.getElementById('btnExpurgarDuplicadosPedagio');
        this.expurgoPedagioStatus = document.getElementById('expurgoPedagioStatus');

        // Seção Empresas de Pedágio
        this.formEmpresaPedagio = document.getElementById('formEmpresaPedagio');
        this.empresaPedagioEditingId = document.getElementById('empresaPedagioEditingId');
        this.empresaPedagioNome = document.getElementById('empresaPedagioNome');
        this.empresaPedagioMensalidade = document.getElementById('empresaPedagioMensalidade');
        this.empresaPedagioLayout = document.getElementById('empresaPedagioLayout');
        this.btnLimparEmpresaPedagio = document.getElementById('btnLimparEmpresaPedagio');
        this.tableBodyEmpresasPedagio = document.getElementById('tableBodyEmpresasPedagio');
    },

    bindEvents() {
        // Navegação por abas
        this.painelNavegacao.querySelectorAll('.painel-btn').forEach(button => {
            button.addEventListener('click', (e) => this.handleTabClick(e));
        });

        // Lançamentos
        if (this.btnAdicionarLancamento) {
            this.btnAdicionarLancamento.addEventListener('click', () => this.abrirModalLancamento());
        }
        if (this.btnExcluirSelecionados) {
            this.btnExcluirSelecionados.addEventListener('click', () => this.excluirLancamentosSelecionados());
        }
        if (this.selectAllLancamentos) {
            this.selectAllLancamentos.addEventListener('change', () => this.toggleSelecionarTodosLancamentos());
        }
        this.btnFiltrarLancamentos.addEventListener('click', () => this.carregarLancamentos());
        this.searchPlaca.addEventListener('input', () => this.carregarLancamentos());
        this.filtroFilialLancamento?.addEventListener('change', () => this.carregarLancamentos());
        this.tableBodyLancamentos.addEventListener('change', (e) => this.handleLancamentoSelectionChange(e));
        this.tableBodyLancamentos.addEventListener('click', (e) => this.handleLancamentoTableClick(e));

        // Modal de Lançamento
        this.btnCloseModalLancamento.addEventListener('click', () => this.fecharModalLancamento());
        this.modalLancamento.addEventListener('click', (e) => { if (e.target === this.modalLancamento) this.fecharModalLancamento(); });
        this.lancamentoPlaca.addEventListener('change', () => this.preencherDadosVeiculo());
        this.formLancamentoPedagio.addEventListener('submit', (e) => this.salvarLancamento(e));
        this.btnGoogleMaps.addEventListener('click', () => this.abrirGoogleMaps());

        // Importação
        this.formImportacaoPedagio.addEventListener('submit', (e) => this.handleImportacao(e));
        this.tableBodyImportacoesPedagio?.addEventListener('click', (e) => this.handleImportacaoPedagioTableClick(e));
        this.btnExpurgarDuplicadosPedagio?.addEventListener('click', () => this.expurgarDuplicadosPedagio());

        // Empresas de Pedágio
        this.formEmpresaPedagio.addEventListener('submit', (e) => this.salvarEmpresaPedagio(e));
        this.btnLimparEmpresaPedagio.addEventListener('click', () => this.limparFormEmpresaPedagio());
        this.tableBodyEmpresasPedagio.addEventListener('click', (e) => this.handleEmpresaPedagioTableClick(e));

        // Ordenação da tabela de lançamentos
        document.querySelectorAll('#sectionLancamento th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.sort || th.dataset.field));
        });
    },

    initTabs() {
        // Ativa a primeira aba por padrão ao carregar a página
        const activeTab = this.painelNavegacao.querySelector('.painel-btn.active');
        if (activeTab) {
            const targetSectionId = activeTab.dataset.secao;
            this.showSection(targetSectionId);
        }
    },

    handleTabClick(event) {
        // Correção: Usa closest para garantir que pegamos o botão, mesmo clicando no ícone
        const btn = event.target.closest('.painel-btn');
        if (!btn) return;

        this.painelNavegacao.querySelectorAll('.painel-btn').forEach(btn => btn.classList.remove('active'));
        btn.classList.add('active');
        this.showSection(btn.dataset.secao);
    },

    showSection(sectionId) {
        this.sections.forEach(section => section.classList.add('hidden'));
        document.getElementById(sectionId).classList.remove('hidden');

        // Ações específicas ao mostrar cada seção
        if (sectionId === 'sectionLancamento') {
            this.carregarLancamentos();
        } else if (sectionId === 'sectionImportacao') {
            this.carregarEmpresasPedagioParaSelect();
            this.carregarImportacoesPedagio();
        } else if (sectionId === 'sectionEmpresas') {
            this.carregarEmpresasPedagio();
        }
    },

    setupLancamentosTab() {
        const hoje = new Date();
        const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        this.filtroDataInicialLancamento.value = this.formatarDataInput(primeiroDiaMes);
        this.filtroDataFinalLancamento.value = this.formatarDataInput(hoje);
    },

    getUsuarioLogado() {
        try {
            const user = localStorage.getItem('usuarioLogado');
            return user ? JSON.parse(user) : null;
        } catch (e) { return null; }
    },

    async verificarPermissaoPagina() {
        const usuario = this.getUsuarioLogado();
        const nivel = String(usuario?.nivel || '').trim().toLowerCase();

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
            if ((data?.paginas_permitidas || []).includes(PEDAGIO_PAGE_ID)) return true;
        } catch (error) {
            console.error('Erro ao validar permissao de pedagio:', error);
        }

        document.body.innerHTML = '<div style="text-align:center; padding:50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
        return false;
    },

    getUserFilial() {
        return this.getUsuarioLogado()?.filial || '';
    },

    getValorFilial(filialValor) {
        if (!filialValor) return '';
        const filialNormalizada = String(filialValor).trim().toUpperCase();
        const filial = this.filiaisData.find(f =>
            String(f.nome || '').trim().toUpperCase() === filialNormalizada ||
            String(f.sigla || '').trim().toUpperCase() === filialNormalizada
        );
        return filial ? (filial.sigla || filial.nome) : filialValor;
    },

    isMesmaFilial(a, b) {
        if (!a || !b) return false;
        const normalizar = valor => String(valor).trim().toUpperCase();
        if (normalizar(a) === normalizar(b)) return true;
        return normalizar(this.getValorFilial(a)) === normalizar(this.getValorFilial(b));
    },

    exibirUsuario() {
        const user = this.getUsuarioLogado();
        if (user && this.usuarioDisplay) {
            this.usuarioDisplay.textContent = `👤 Olá, ${user.nome}`;
        }
    },

    async carregarVeiculos() {
        try {
            const { data, error } = await supabaseClient
                .from('veiculos')
                .select('placa, marca, modelo, tipo, eixos, filial') 
                .order('placa');
            if (error) throw error;
            this.veiculosData = data;
            this.veiculosList.innerHTML = data.map(v => `<option value="${v.placa}">${v.placa} - ${v.modelo}</option>`).join('');
        } catch (error) {
            console.error('Erro ao carregar veículos:', error);
        }
    },

    buscarVeiculoPorPlaca(placa) {
        const p = String(placa || '').replace(/[^A-Z0-9]/g, '').toUpperCase();
        const mapa = { 0:'A', 1:'B', 2:'C', 3:'D', 4:'E', 5:'F', 6:'G', 7:'H', 8:'I', 9:'J' };
        const mercosul = /^[A-Z]{3}\d{4}$/.test(p) ? `${p.slice(0, 4)}${mapa[p[4]]}${p.slice(5)}` : p;
        return this.veiculosData.find(v => v.placa === p || v.placa === mercosul);
    },

    async carregarFiliais() {
        try {
            const { data, error } = await supabaseClient
                .from('filiais')
                .select('nome, sigla')
                .order('nome');
            if (error) throw error;

            this.filiaisData = data || [];
            const options = '<option value="">Selecione a Filial</option>' + this.filiaisData
                .map(f => {
                    const value = f.sigla || f.nome;
                    const label = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                    return `<option value="${value}">${label}</option>`;
                })
                .join('');

            if (this.lancamentoFilial) this.lancamentoFilial.innerHTML = options;
            if (this.filialImportacaoPedagio) this.filialImportacaoPedagio.innerHTML = options;
            if (this.filtroFilialLancamento) {
                this.filtroFilialLancamento.innerHTML = '<option value="">Todas</option>' + this.filiaisData
                    .map(f => {
                        const value = f.sigla || f.nome;
                        const label = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                        return `<option value="${value}">${label}</option>`;
                    })
                    .join('');
            }

            const userFilial = this.getUserFilial();
            if (userFilial) {
                const valor = this.getValorFilial(userFilial);
                if (this.lancamentoFilial) this.lancamentoFilial.value = valor;
                if (this.filialImportacaoPedagio) this.filialImportacaoPedagio.value = valor;
                if (this.filtroFilialLancamento) this.filtroFilialLancamento.value = valor;
            }
        } catch (error) {
            console.error('Erro ao carregar filiais:', error);
        }
    },

    async carregarMotoristas() {
        try {
            const { data, error } = await supabaseClient
                .from('funcionario')
                .select('nome')
                .ilike('funcao', '%Motorista%')
                .order('nome');
            if (error) throw error;

            this.motoristasData = data || [];
            if (this.motoristasList) {
                const nomes = [...new Set(this.motoristasData.map(m => m.nome).filter(Boolean))];
                this.motoristasList.innerHTML = nomes.map(nome => `<option value="${nome}"></option>`).join('');
            }
        } catch (error) {
            console.error('Erro ao carregar motoristas:', error);
        }
    },

    async carregarRotas() {
        try {
            const { data, error } = await supabaseClient
                .from('rotas')
                .select('numero')
                .order('numero', { ascending: true });
            if (error) throw error;

            this.rotasData = data || [];
            if (this.rotasList) {
                const rotas = [...new Set(this.rotasData.map(r => r.numero).filter(Boolean))];
                this.rotasList.innerHTML = rotas.map(numero => `<option value="${numero}"></option>`).join('');
            }
        } catch (error) {
            console.error('Erro ao carregar rotas:', error);
        }
    },

    preencherDadosVeiculo() {
        const placa = this.lancamentoPlaca.value.trim().toUpperCase();
        this.lancamentoPlaca.value = placa;
        const veiculo = this.veiculosData.find(v => v.placa === placa);
        if (veiculo) {
            this.lancamentoTipo.value = veiculo.tipo || '';
            if (this.lancamentoFilial && veiculo.filial) {
                this.lancamentoFilial.value = this.getValorFilial(veiculo.filial);
            }
        } else {
            this.lancamentoTipo.value = '';
        }
    },

    async abrirModalLancamento() {
        if (this.empresasPedagio.length === 0) {
            await this.carregarEmpresasPedagio();
        }

        this.editingLancamentoId = null;
        if (this.formLancamentoPedagio) this.formLancamentoPedagio.reset();
        if (this.lancamentoTipo) this.lancamentoTipo.value = ''; 
        if (this.lancamentoCateg) this.lancamentoCateg.value = '';
        const userFilial = this.getUserFilial();
        if (this.lancamentoFilial && userFilial) {
            this.lancamentoFilial.value = this.getValorFilial(userFilial);
        }
        
        // Define a data atual no formato local para o input datetime-local
        const now = new Date();
        if (this.lancamentoDataHora) this.lancamentoDataHora.value = this.formatarDateTimeLocalInput(now);
        
        // Preenche o select de empresas no modal de lançamento
        if (this.lancamentoEmpresa) {
            this.lancamentoEmpresa.innerHTML = '<option value="">Selecione a Empresa</option>';
            this.empresasPedagio.forEach(empresa => {
                this.lancamentoEmpresa.add(new Option(empresa.nome, empresa.id));
            });
        }

        if (this.modalLancamento) this.modalLancamento.classList.remove('hidden');
    },

    fecharModalLancamento() {
        this.modalLancamento.classList.add('hidden');
    },

    abrirGoogleMaps() {
        const rodovia = this.lancamentoRodovia.value;
        const praca = this.lancamentoPraca.value;
        if (rodovia || praca) {
            const query = encodeURIComponent(`${praca}, ${rodovia}`);
            window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
        } else {
            alert('Preencha a Rodovia ou Praça para abrir no Google Maps.');
        }
    },

    async salvarLancamento(event) {
        event.preventDefault();
        const usuarioInfo = this.getUsuarioLogado();
        const usuarioId = usuarioInfo?.id || null; // Get the user's UUID
        const usuarioNome = usuarioInfo?.nome || 'Sistema'; 

        if (!usuarioId) return alert('Sessão expirada. Faça login novamente.');

        // Validação dos campos obrigatórios
        if (!this.lancamentoPlaca.value.trim()) {
            alert('Por favor, selecione uma placa.');
            return;
        }
        if (!this.lancamentoDataHora.value) {
            alert('Por favor, informe a data/hora da passagem.');
            return;
        }
        if (!this.lancamentoValor.value || isNaN(parseFloat(this.lancamentoValor.value))) {
            alert('Por favor, informe um valor válido.');
            return;
        }

        // Verificar se a placa existe na tabela veiculos
        const placaExiste = this.veiculosData.some(v => v.placa === this.lancamentoPlaca.value.toUpperCase());
        if (!placaExiste) {
            alert('Placa não encontrada na base de dados. Verifique se o veículo está cadastrado.');
            return;
        }

        const payload = {
            placa: this.lancamentoPlaca.value.toUpperCase(),
            marca_veiculo: this.lancamentoTipo.value.toUpperCase() || null,
            categoria_eixos: parseInt(this.lancamentoCateg.value) || null, // Corrigido: 'eixos' para 'categoria_eixos'
            data_hora_passagem: this.datetimeLocalToISOString(this.lancamentoDataHora.value),
            empresa_id: document.getElementById('lancamentoEmpresa')?.value || null,
            filial: this.getValorFilial(this.lancamentoFilial.value) || null,
            motorista: this.lancamentoMotorista.value.toUpperCase() || null,
            rota: this.lancamentoRota.value.toUpperCase() || null,
            rodovia: this.lancamentoRodovia.value.toUpperCase() || null,
            praca: this.lancamentoPraca.value.toUpperCase() || null,
            valor: parseFloat(this.lancamentoValor.value),
            usuario_id: usuarioId,
            usuario_nome: usuarioNome,
        };

        console.log('Payload sendo enviado:', payload);
        console.log('Tipo do usuario_id:', typeof usuarioId, 'Valor:', usuarioId);

        try {
            if (this.editingLancamentoId) {
                const { error } = await supabaseClient.from('pedagios_lancamentos').update(payload).eq('id', this.editingLancamentoId);
                if (error) throw error;
                registrarAuditoria('ALTERAR', 'Pedágio', `Alteração de lançamento de pedágio ID ${this.editingLancamentoId}`);
                alert('Lançamento atualizado com sucesso!');
            } else {
                const { error } = await supabaseClient.from('pedagios_lancamentos').insert(payload);
                if (error) throw error;
                registrarAuditoria('INCLUIR', 'Pedágio', `Inclusão de lançamento de pedágio`);
                alert('Lançamento salvo com sucesso!');
            }
            this.fecharModalLancamento();
            this.carregarLancamentos();
        } catch (error) {
            console.error('Erro ao salvar lançamento:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
                error
            });
            alert('Erro ao salvar lançamento: ' + (error.message || 'Erro desconhecido'));
        }
    },

    async carregarLancamentos() {
        if (!this.tableBodyLancamentos) return;
        this.resetSelecaoLancamentos();
        this.tableBodyLancamentos.innerHTML = '<tr><td colspan="12" class="text-center">Carregando...</td></tr>';
        try {
            const dataInicial = this.filtroDataInicialLancamento.value;
            const dataFinal = this.filtroDataFinalLancamento.value;
            const searchPlaca = (this.searchPlaca.value || '').trim().toUpperCase();
            const filialFiltro = this.getValorFilial(this.filtroFilialLancamento?.value || '');

            if (!dataInicial || !dataFinal) {
                this.tableBodyLancamentos.innerHTML = '<tr><td colspan="12" class="text-center">Selecione o período de datas.</td></tr>';
                return;
            }

            const userFilial = filialFiltro || this.getUserFilial();

            let query = supabaseClient
                .from('pedagios_lancamentos')
                .select('*');

            if (dataInicial) query = query.gte('data_hora_passagem', this.dataLocalToISOString(dataInicial, '00:00:00'));
            if (dataFinal) query = query.lte('data_hora_passagem', this.dataLocalToISOString(dataFinal, '23:59:59'));
            if (searchPlaca) query = query.ilike('placa', `%${searchPlaca}%`);

            query = query.order(this.sortState.field, { ascending: this.sortState.ascending });

            const { data, error } = await query;
            if (error) throw error;

            let lancamentos = data || [];
            if (userFilial) {
                lancamentos = lancamentos.filter(item => {
                    const veiculo = this.veiculosData.find(v => v.placa === item.placa);
                    return this.isMesmaFilial(item.filial, userFilial) || this.isMesmaFilial(veiculo?.filial, userFilial);
                });
            }

            this.tableBodyLancamentos.innerHTML = '';
            if (lancamentos.length === 0) {
                this.tableBodyLancamentos.innerHTML = '<tr><td colspan="12" class="text-center">Nenhum lançamento encontrado.</td></tr>';
                return;
            }

            lancamentos.forEach(item => {
                const veiculo = this.veiculosData.find(v => v.placa === item.placa);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="selection-col"><input type="checkbox" class="lancamento-checkbox" value="${item.id}" aria-label="Selecionar lançamento ${item.placa}"></td>
                    <td>${item.usuario_nome || '-'}</td>
                    <td>${this.formatarDataHoraBrasilia(item.data_hora_passagem)}</td>
                    <td>${item.placa}</td>
                    <td>${veiculo?.tipo || item.marca_veiculo || '-'}</td>
                    <td>${item.motorista || '-'}</td>
                    <td>${item.rota || '-'}</td>
                    <td>${item.categoria_eixos || '-'}</td>
                    <td>${item.rodovia || '-'}</td>
                    <td>${item.praca || '-'}</td>
                    <td>${item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td style="display: flex; gap: 5px; justify-content: center;">
                        <button class="btn-icon edit btn-edit" data-id="${item.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete btn-delete" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBodyLancamentos.appendChild(tr);
            });
            this.updateSortIcons();
        } catch (error) {
            console.error('Erro ao carregar lançamentos:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
                error
            });
            this.tableBodyLancamentos.innerHTML = '<tr><td colspan="12" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        }
    },

    getLancamentosSelecionados() {
        return Array.from(this.tableBodyLancamentos.querySelectorAll('.lancamento-checkbox:checked'))
            .map(input => input.value)
            .filter(Boolean);
    },

    atualizarEstadoSelecaoLancamentos() {
        const checkboxes = Array.from(this.tableBodyLancamentos.querySelectorAll('.lancamento-checkbox'));
        const selecionados = checkboxes.filter(input => input.checked);

        if (this.btnExcluirSelecionados) {
            this.btnExcluirSelecionados.disabled = selecionados.length === 0;
        }

        if (this.selectAllLancamentos) {
            this.selectAllLancamentos.checked = checkboxes.length > 0 && selecionados.length === checkboxes.length;
            this.selectAllLancamentos.indeterminate = selecionados.length > 0 && selecionados.length < checkboxes.length;
        }
    },

    resetSelecaoLancamentos() {
        if (this.selectAllLancamentos) {
            this.selectAllLancamentos.checked = false;
            this.selectAllLancamentos.indeterminate = false;
        }
        if (this.btnExcluirSelecionados) {
            this.btnExcluirSelecionados.disabled = true;
        }
    },

    toggleSelecionarTodosLancamentos() {
        const checked = this.selectAllLancamentos?.checked || false;
        this.tableBodyLancamentos.querySelectorAll('.lancamento-checkbox').forEach(input => {
            input.checked = checked;
        });
        this.atualizarEstadoSelecaoLancamentos();
    },

    handleLancamentoSelectionChange(event) {
        if (!event.target.classList.contains('lancamento-checkbox')) return;
        this.atualizarEstadoSelecaoLancamentos();
    },

    handleSort(column) {
        if (this.sortState.field === column) {
            this.sortState.ascending = !this.sortState.ascending;
        } else {
            this.sortState.field = column;
            this.sortState.ascending = true;
        }
        this.carregarLancamentos();
    },

    updateSortIcons() {
        document.querySelectorAll('.data-grid th[data-sort] i').forEach(icon => {
            icon.className = 'fas fa-sort';
            const th = icon.closest('th');
            if (th.dataset.sort === this.sortState.field) {
                icon.className = this.sortState.ascending ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    async handleLancamentoTableClick(event) {
        const button = event.target.closest('button');
        if (!button) return;
        const id = button.dataset.id;

        if (button.classList.contains('btn-edit')) {
            await this.editarLancamento(id);
        } else if (button.classList.contains('btn-delete')) {
            await this.excluirLancamento(id);
        }
    },

    async editarLancamento(id) {
        try {
            const { data, error } = await supabaseClient.from('pedagios_lancamentos').select('*').eq('id', id).single();
            if (error) throw error;

            this.editingLancamentoId = id;
            this.lancamentoPlaca.value = data.placa;
            if(document.getElementById('lancamentoEmpresa')) document.getElementById('lancamentoEmpresa').value = data.empresa_id || '';
            this.preencherDadosVeiculo();
            this.lancamentoCateg.value = data.categoria_eixos || '';
            this.lancamentoFilial.value = this.getValorFilial(data.filial || this.lancamentoFilial.value || '');
            this.lancamentoDataHora.value = this.formatarDateTimeLocalInput(data.data_hora_passagem);
            this.lancamentoMotorista.value = data.motorista || '';
            this.lancamentoRota.value = data.rota || '';
            this.lancamentoRodovia.value = data.rodovia;
            this.lancamentoPraca.value = data.praca;
            this.lancamentoValor.value = data.valor;

            this.modalLancamento.classList.remove('hidden');
        } catch (error) {
            console.error('Erro ao carregar lançamento para edição:', error);
            alert('Erro ao carregar lançamento: ' + error.message);
        }
    },

    async excluirLancamento(id) {
        if (!confirm('Tem certeza que deseja excluir este lançamento de pedágio?')) return;
        try {
            const { error } = await supabaseClient.from('pedagios_lancamentos').delete().eq('id', id);
            if (error) throw error;
            registrarAuditoria('EXCLUIR', 'Pedágio', `Exclusão de lançamento de pedágio ID ${id}`);
            alert('Lançamento excluído com sucesso!');
            this.carregarLancamentos();
        } catch (error) {
            console.error('Erro ao excluir lançamento:', error);
            alert('Erro ao excluir lançamento: ' + error.message);
        }
    },

    async excluirLancamentosSelecionados() {
        const ids = this.getLancamentosSelecionados();
        if (ids.length === 0) {
            alert('Selecione ao menos um lançamento para excluir.');
            return;
        }

        if (!confirm(`Tem certeza que deseja excluir ${ids.length} lançamento(s) selecionado(s)?`)) return;

        if (this.btnExcluirSelecionados) this.btnExcluirSelecionados.disabled = true;
        try {
            const tamanhoLote = 100;
            for (let i = 0; i < ids.length; i += tamanhoLote) {
                const lote = ids.slice(i, i + tamanhoLote);
                const { error } = await supabaseClient
                    .from('pedagios_lancamentos')
                    .delete()
                    .in('id', lote);
                if (error) throw error;
            }

            registrarAuditoria('EXCLUIR', 'Pedágio', `Exclusão em lote de ${ids.length} lançamento(s) de pedágio`);
            alert(`${ids.length} lançamento(s) excluído(s) com sucesso!`);
            this.carregarLancamentos();
        } catch (error) {
            console.error('Erro ao excluir lançamentos selecionados:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
                error
            });
            alert('Erro ao excluir lançamentos selecionados: ' + error.message);
            this.atualizarEstadoSelecaoLancamentos();
        }
    },

    async carregarEmpresasPedagio() {
        try {
            const { data, error } = await supabaseClient.from('pedagios_empresas').select('*').order('nome');
            if (error) throw error;
            this.empresasPedagio = data || [];
            this.renderEmpresasPedagioTable();
            this.carregarEmpresasPedagioParaSelect();
        } catch (error) {
            console.error('Erro ao carregar empresas de pedágio:', error);
        }
    },

    renderEmpresasPedagioTable() {
        this.tableBodyEmpresasPedagio.innerHTML = '';
        if (this.empresasPedagio.length === 0) {
            this.tableBodyEmpresasPedagio.innerHTML = '<tr><td colspan="4" class="text-center">Nenhuma empresa cadastrada.</td></tr>';
            return;
        }
        this.empresasPedagio.forEach(empresa => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${empresa.nome}</td>
                <td>R$ ${parseFloat(empresa.mensalidade || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td><pre>${JSON.stringify(empresa.layout_config, null, 2)}</pre></td>
                <td style="display: flex; gap: 5px; justify-content: center; border: none;">
                    <button class="btn-icon edit btn-edit" data-id="${empresa.id}" title="Editar" style="background: none !important; border: none !important; box-shadow: none !important;"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete btn-delete" data-id="${empresa.id}" title="Excluir" style="background: none !important; border: none !important; box-shadow: none !important;"><i class="fas fa-trash"></i></button>
                </td>
            `;
            this.tableBodyEmpresasPedagio.appendChild(tr);
        });
    },

    carregarEmpresasPedagioParaSelect() {
        [this.empresaPedagioSelect, this.lancamentoEmpresa].forEach(select => {
            if (!select) return;
            const valorAtual = select.value;
            select.innerHTML = '<option value="">Selecione a Empresa</option>';
            this.empresasPedagio.forEach(empresa => {
                select.add(new Option(empresa.nome, empresa.id));
            });
            if (valorAtual && this.empresasPedagio.some(empresa => String(empresa.id) === String(valorAtual))) {
                select.value = valorAtual;
            }
        });
    },

    getLayoutPadraoPedagio() {
        return {
            DATA: 'DATA',
            HORA: 'HORA',
            PLACA: 'PLACA',
            FILIAL: 'FILIAL',
            ROTA: 'ROTA',
            MOTORISTA: 'MOTORISTA',
            CATEGORIA: 'CATEGORIA',
            RODOVIA: 'RODOVIA',
            PRACA: 'PRAÇA',
            VALOR: 'VALOR'
        };
    },

    datetimeLocalToISOString(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new Error(`Data/hora inválida: ${value}`);
        }
        return date.toISOString();
    },

    dataLocalToISOString(dataIso, horario) {
        return this.datetimeLocalToISOString(`${dataIso}T${horario}`);
    },

    formatarDateTimeLocalInput(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
    },

    formatarDataInput(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    },

    formatarDataHoraBrasilia(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('pt-BR', { timeZone: TIMEZONE_BRASILIA });
    },

    parseDataHoraPlanilha(dataValue, horaValue) {
        const excelSerialToLocalDate = (serial) => {
            const wholeDays = Math.floor(serial);
            const utcDate = new Date(EXCEL_EPOCH_UTC + wholeDays * 86400000);
            const localDate = new Date(
                utcDate.getUTCFullYear(),
                utcDate.getUTCMonth(),
                utcDate.getUTCDate()
            );
            const fractionalDay = serial - wholeDays;
            if (fractionalDay > 0) {
                aplicarSegundos(localDate, Math.round(fractionalDay * 86400));
            }
            return localDate;
        };

        const aplicarSegundos = (date, totalSeconds) => {
            date.setHours(
                Math.floor(totalSeconds / 3600),
                Math.floor((totalSeconds % 3600) / 60),
                totalSeconds % 60,
                0
            );
            return date;
        };

        const aplicarHora = (date, hora) => {
            if (hora === null || hora === undefined || String(hora).trim() === '') return date;

            if (typeof hora === 'number') {
                return aplicarSegundos(date, Math.round((hora % 1) * 86400));
            }

            const match = String(hora).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (match) {
                date.setHours(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3] || '0', 10), 0);
            }
            return date;
        };

        let date;
        if (typeof dataValue === 'number') {
            date = excelSerialToLocalDate(dataValue);
        } else {
            const dataStr = String(dataValue || '').trim();
            const brMatch = dataStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (brMatch) {
                date = new Date(parseInt(brMatch[3], 10), parseInt(brMatch[2], 10) - 1, parseInt(brMatch[1], 10));
            } else {
                const isoMatch = dataStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
                if (isoMatch) {
                    date = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
                } else {
                    date = new Date(dataStr);
                }
            }
        }

        if (!date || Number.isNaN(date.getTime())) {
            throw new Error(`Data inválida na planilha: ${dataValue}`);
        }

        aplicarHora(date, horaValue);
        return date.toISOString();
    },

    normalizarCabecalhoPlanilha(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Z0-9]/gi, '')
            .toUpperCase();
    },

    getIndiceColunaPlanilha(headers, layout, chaves) {
        const candidatos = chaves
            .flatMap(chave => [layout[chave], layout[this.normalizarCabecalhoPlanilha(chave)], chave])
            .filter(Boolean)
            .map(valor => this.normalizarCabecalhoPlanilha(valor));

        return headers.findIndex(header => candidatos.includes(this.normalizarCabecalhoPlanilha(header)));
    },

    getValorColunaPlanilha(row, headers, layout, chaves) {
        const idx = this.getIndiceColunaPlanilha(headers, layout, chaves);
        return idx === -1 ? undefined : row[idx];
    },

    async salvarEmpresaPedagio(event) {
        event.preventDefault();
        const nome = this.empresaPedagioNome.value.toUpperCase();
        const mensalidade = parseFloat(this.empresaPedagioMensalidade.value) || 0;
        let layoutConfig = {};
        try {
            layoutConfig = this.empresaPedagioLayout.value.trim()
                ? JSON.parse(this.empresaPedagioLayout.value)
                : this.getLayoutPadraoPedagio();
        } catch (e) {
            alert('Layout de Importação inválido. Certifique-se de que é um JSON válido.');
            return;
        }

        const payload = { nome, mensalidade, layout_config: layoutConfig };

        try {
            if (this.editingEmpresaId) {
                await supabaseClient.from('pedagios_empresas').update(payload).eq('id', this.editingEmpresaId);
                registrarAuditoria('ALTERAR', 'Pedágio', `Alteração de empresa de pedágio: ${nome}`);
                alert('Empresa de pedágio atualizada com sucesso!');
            } else {
                await supabaseClient.from('pedagios_empresas').insert(payload);
                registrarAuditoria('INCLUIR', 'Pedágio', `Inclusão de empresa de pedágio: ${nome}`);
                alert('Empresa de pedágio cadastrada com sucesso!');
            }
            this.limparFormEmpresaPedagio();
            this.carregarEmpresasPedagio();
        } catch (error) {
            console.error('Erro ao salvar empresa de pedágio:', error);
            alert('Erro ao salvar empresa de pedágio: ' + error.message);
        }
    },

    limparFormEmpresaPedagio() {
        this.editingEmpresaId = null;
        this.formEmpresaPedagio.reset();
        if (this.empresaPedagioLayout) {
            this.empresaPedagioLayout.value = JSON.stringify(this.getLayoutPadraoPedagio(), null, 2);
        }
    },

    async handleEmpresaPedagioTableClick(event) {
        const button = event.target.closest('button');
        if (!button) return;
        const id = button.dataset.id;

        if (button.classList.contains('btn-edit')) {
            await this.editarEmpresaPedagio(id);
        } else if (button.classList.contains('btn-delete')) {
            await this.excluirEmpresaPedagio(id);
        }
    },

    async editarEmpresaPedagio(id) {
        try {
            const { data, error } = await supabaseClient.from('pedagios_empresas').select('*').eq('id', id).single();
            if (error) throw error;

            this.editingEmpresaId = id;
            if (this.empresaPedagioNome) this.empresaPedagioNome.value = data.nome || '';
            // Adicionada verificação de segurança para evitar o erro de 'null'
            if (this.empresaPedagioMensalidade) this.empresaPedagioMensalidade.value = data.mensalidade || 0;
            if (this.empresaPedagioLayout) this.empresaPedagioLayout.value = JSON.stringify(data.layout_config, null, 2);
            
        } catch (error) {
            console.error('Erro ao carregar empresa para edição:', error);
            alert('Erro ao carregar empresa: ' + error.message);
        }
    },

    async excluirEmpresaPedagio(id) {
        if (!confirm('Tem certeza que deseja excluir esta empresa de pedágio?')) return;
        try {
            const { error } = await supabaseClient.from('pedagios_empresas').delete().eq('id', id);
            if (error) throw error;
            registrarAuditoria('EXCLUIR', 'Pedágio', `Exclusão de empresa de pedágio ID ${id}`);
            alert('Empresa de pedágio excluída com sucesso!');
            this.carregarEmpresasPedagio();
        } catch (error) {
            console.error('Erro ao excluir empresa de pedágio:', error);
            alert('Erro ao excluir empresa de pedágio: ' + error.message);
        }
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    getEmpresaPedagioNome(empresaId) {
        const empresa = this.empresasPedagio.find(item => String(item.id) === String(empresaId));
        return empresa?.nome || empresaId || '';
    },

    async carregarImportacoesPedagio() {
        if (!this.tableBodyImportacoesPedagio) return;
        this.tableBodyImportacoesPedagio.innerHTML = '<tr><td colspan="8" class="text-center">Carregando importações...</td></tr>';

        try {
            const { data, error } = await supabaseClient
                .from('pedagios_importacoes')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) throw error;
            this.importacoesPedagio = data || [];

            if (this.importacoesPedagio.length === 0) {
                this.tableBodyImportacoesPedagio.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum arquivo importado.</td></tr>';
                return;
            }

            this.tableBodyImportacoesPedagio.innerHTML = this.importacoesPedagio.map(item => `
                <tr>
                    <td>${this.escapeHtml(this.formatarDataHoraBrasilia(item.created_at))}</td>
                    <td title="${this.escapeHtml(item.arquivo_nome)}">${this.escapeHtml(item.arquivo_nome)}</td>
                    <td>${this.escapeHtml(this.getEmpresaPedagioNome(item.empresa_id))}</td>
                    <td>${this.escapeHtml(item.filial || '')}</td>
                    <td>${this.escapeHtml(item.usuario_nome || '')}</td>
                    <td>${Number(item.total_registros || 0)}</td>
                    <td>${this.escapeHtml(item.status || '')}</td>
                    <td style="white-space: nowrap;">
                        <button type="button" class="btn-icon btn-download-importacao" data-id="${item.id}" title="Baixar arquivo">
                            <i class="fas fa-download"></i>
                        </button>
                        <button type="button" class="btn-icon delete btn-delete-importacao" data-id="${item.id}" title="Remover arquivo e lançamentos">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Erro ao carregar histórico de importações:', error);
            this.tableBodyImportacoesPedagio.innerHTML =
                '<tr><td colspan="8" class="text-center">Histórico indisponível. Execute a migração SQL de importações.</td></tr>';
        }
    },

    async handleImportacaoPedagioTableClick(event) {
        const button = event.target.closest('button[data-id]');
        if (!button) return;

        if (button.classList.contains('btn-download-importacao')) {
            await this.baixarArquivoImportacaoPedagio(button.dataset.id);
        } else if (button.classList.contains('btn-delete-importacao')) {
            await this.removerImportacaoPedagio(button.dataset.id);
        }
    },

    async baixarArquivoImportacaoPedagio(id) {
        const item = this.importacoesPedagio.find(importacao => String(importacao.id) === String(id));
        if (!item?.arquivo_caminho) return alert('Arquivo da importação não encontrado.');

        try {
            const { data, error } = await supabaseClient.storage
                .from(PEDAGIO_IMPORTACOES_BUCKET)
                .createSignedUrl(item.arquivo_caminho, 60);
            if (error) throw error;
            window.open(data.signedUrl, '_blank', 'noopener');
        } catch (error) {
            console.error('Erro ao baixar arquivo de pedágio:', error);
            alert('Erro ao baixar arquivo: ' + error.message);
        }
    },

    async removerImportacaoPedagio(id) {
        const item = this.importacoesPedagio.find(importacao => String(importacao.id) === String(id));
        if (!item) return;

        const total = Number(item.total_registros || 0);
        if (!confirm(`Remover o arquivo "${item.arquivo_nome}" e os ${total} lançamento(s) vinculados a esta importação?`)) return;

        try {
            const { error: deleteError } = await supabaseClient
                .from('pedagios_importacoes')
                .delete()
                .eq('id', id);
            if (deleteError) throw deleteError;

            if (item.arquivo_caminho) {
                const { error: storageError } = await supabaseClient.storage
                    .from(PEDAGIO_IMPORTACOES_BUCKET)
                    .remove([item.arquivo_caminho]);
                if (storageError) console.warn('Registro removido, mas o arquivo não foi excluído do storage:', storageError);
            }

            await this.carregarImportacoesPedagio();
            await this.carregarLancamentos();
            alert('Importação e lançamentos vinculados removidos com sucesso.');
        } catch (error) {
            console.error('Erro ao remover importação de pedágio:', error);
            alert('Erro ao remover importação: ' + error.message);
        }
    },

    async expurgarDuplicadosPedagio() {
        if (!this.btnExpurgarDuplicadosPedagio) return;
        this.btnExpurgarDuplicadosPedagio.disabled = true;
        if (this.expurgoPedagioStatus) this.expurgoPedagioStatus.textContent = 'Analisando duplicidades...';

        try {
            const { data: quantidade, error: contarError } = await supabaseClient.rpc('pedagios_contar_duplicados');
            if (contarError) throw contarError;

            const total = Number(quantidade || 0);
            if (total === 0) {
                if (this.expurgoPedagioStatus) this.expurgoPedagioStatus.textContent = 'Nenhum lançamento duplicado encontrado.';
                return;
            }

            if (!confirm(`Foram encontrados ${total} lançamento(s) duplicado(s).\n\nO registro mais antigo de cada grupo será mantido. Deseja continuar?`)) {
                if (this.expurgoPedagioStatus) this.expurgoPedagioStatus.textContent = 'Expurgo cancelado.';
                return;
            }

            const { data: removidos, error: expurgoError } = await supabaseClient.rpc('pedagios_expurgar_duplicados');
            if (expurgoError) throw expurgoError;

            const totalRemovido = Number(removidos || 0);
            if (this.expurgoPedagioStatus) {
                this.expurgoPedagioStatus.textContent = `${totalRemovido} lançamento(s) duplicado(s) removido(s).`;
            }
            await this.carregarLancamentos();
        } catch (error) {
            console.error('Erro no expurgo de pedágios:', error);
            if (this.expurgoPedagioStatus) {
                this.expurgoPedagioStatus.textContent = 'Erro no expurgo: ' + error.message;
            }
        } finally {
            this.btnExpurgarDuplicadosPedagio.disabled = false;
        }
    },

    normalizarChavePedagio(value) {
        return String(value ?? '').trim().toUpperCase();
    },

    getChaveDuplicidadePedagio(item) {
        const placa = this.normalizarChavePedagio(item.placa).replace(/[^A-Z0-9]/g, '');
        const dataHora = item.data_hora_passagem ? new Date(item.data_hora_passagem).toISOString() : '';
        const valor = Number(item.valor || 0).toFixed(2);
        return [
            this.normalizarChavePedagio(item.empresa_id),
            placa,
            dataHora,
            valor,
            this.normalizarChavePedagio(item.rodovia),
            this.normalizarChavePedagio(item.praca),
            this.normalizarChavePedagio(item.filial)
        ].join('|');
    },

    async carregarChavesPedagioExistentes(lancamentos) {
        const chaves = new Set();
        if (!lancamentos.length) return chaves;

        const datas = lancamentos.map(item => new Date(item.data_hora_passagem).getTime()).filter(Number.isFinite);
        const inicio = new Date(Math.min(...datas)).toISOString();
        const fim = new Date(Math.max(...datas)).toISOString();
        const empresas = [...new Set(lancamentos.map(item => item.empresa_id).filter(Boolean))];
        const pageSize = 1000;

        for (let from = 0; ; from += pageSize) {
            let query = supabaseClient
                .from('pedagios_lancamentos')
                .select('empresa_id, placa, data_hora_passagem, valor, rodovia, praca, filial')
                .gte('data_hora_passagem', inicio)
                .lte('data_hora_passagem', fim)
                .order('data_hora_passagem')
                .range(from, from + pageSize - 1);

            if (empresas.length === 1) query = query.eq('empresa_id', empresas[0]);
            else if (empresas.length > 1) query = query.in('empresa_id', empresas);

            const { data, error } = await query;
            if (error) throw error;
            (data || []).forEach(item => chaves.add(this.getChaveDuplicidadePedagio(item)));
            if (!data || data.length < pageSize) break;
        }

        return chaves;
    },

    async inserirLancamentosPedagioEmLotes(lancamentos, onProgress) {
        let inseridos = 0;

        for (let inicio = 0; inicio < lancamentos.length; inicio += PEDAGIO_IMPORT_INSERT_BATCH_SIZE) {
            const lote = lancamentos.slice(inicio, inicio + PEDAGIO_IMPORT_INSERT_BATCH_SIZE);
            const numeroLote = Math.floor(inicio / PEDAGIO_IMPORT_INSERT_BATCH_SIZE) + 1;

            const { error } = await supabaseClient
                .from('pedagios_lancamentos')
                .insert(lote);

            if (error) {
                const detalhes = error.details || error.hint || error.code || '';
                throw new Error(`Falha ao gravar lote ${numeroLote}: ${error.message || 'erro desconhecido'}${detalhes ? ` (${detalhes})` : ''}`);
            }

            inseridos += lote.length;
            if (typeof onProgress === 'function') onProgress(inseridos, lancamentos.length);
        }

        return inseridos;
    },

    async criarImportacaoPedagio(arquivo, empresaId, filial, usuarioInfo) {
        const id = crypto.randomUUID();
        const nomeSeguro = arquivo.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
        const caminho = `${new Date().getFullYear()}/${id}/${nomeSeguro}`;

        const { error: uploadError } = await supabaseClient.storage
            .from(PEDAGIO_IMPORTACOES_BUCKET)
            .upload(caminho, arquivo, {
                contentType: arquivo.type || 'application/octet-stream',
                upsert: false
            });
        if (uploadError) throw uploadError;

        const payload = {
            id,
            empresa_id: empresaId,
            filial: filial || null,
            arquivo_nome: arquivo.name,
            arquivo_caminho: caminho,
            arquivo_tipo: arquivo.type || null,
            arquivo_tamanho: arquivo.size,
            usuario_id: usuarioInfo.id || null,
            usuario_nome: usuarioInfo.nome || usuarioInfo.nomecompleto || 'Sistema',
            status: 'PROCESSANDO'
        };

        const { error: insertError } = await supabaseClient.from('pedagios_importacoes').insert(payload);
        if (insertError) {
            await supabaseClient.storage.from(PEDAGIO_IMPORTACOES_BUCKET).remove([caminho]);
            throw insertError;
        }

        return payload;
    },

    async atualizarImportacaoPedagio(id, payload) {
        if (!id) return;
        const { error } = await supabaseClient
            .from('pedagios_importacoes')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    },

    async handleImportacao(event) {
        event.preventDefault();
        const empresaId = this.empresaPedagioSelect.value;
        const filialPadrao = this.getValorFilial(this.filialImportacaoPedagio?.value || '');
        const arquivo = this.arquivoImportacao.files[0];

        if (!empresaId) {
            alert('Selecione uma empresa de pedágio.');
            return;
        }
        if (!arquivo) {
            alert('Selecione um arquivo para importar.');
            return;
        }

        const empresa = this.empresasPedagio.find(e => e.id === empresaId);
        if (!empresa || !empresa.layout_config) {
            alert('Layout de importação não configurado para a empresa selecionada.');
            return;
        }

        // Bloqueia interações
        if (this.btnSubmitImport) this.btnSubmitImport.disabled = true;
        this.arquivoImportacao.disabled = true;
        this.empresaPedagioSelect.disabled = true;
        if (this.filialImportacaoPedagio) this.filialImportacaoPedagio.disabled = true;
        this.importStatus.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Processando arquivo...</p>';
        if (this.importProgressContainer) {
            this.importProgressContainer.classList.remove('hidden');
            this.updateProgress(0);
        }

        let importacaoAtual = null;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }); // Read as array of arrays

                if (jsonData.length === 0) throw new Error('Arquivo vazio ou formato inválido.');

                const headers = jsonData[0]; // First row as headers
                const rows = jsonData.slice(1); // Data rows (assuming first row is headers)

                const usuarioInfo = JSON.parse(localStorage.getItem('usuarioLogado'));
                const usuarioId = usuarioInfo?.id || null;
                const usuarioNome = usuarioInfo?.nome || usuarioInfo?.nomecompleto || 'Sistema';

                if (!usuarioId) throw new Error('Não foi possível identificar o usuário logado para a importação.');

                importacaoAtual = await this.criarImportacaoPedagio(
                    arquivo,
                    empresaId,
                    filialPadrao,
                    usuarioInfo
                );

                const layout = empresa.layout_config;
                const lancamentosParaInserir = [];
                const rejeitados = [];
                let pulosPorVeiculo = 0;
                let pulosPorDados = 0;
                let index = 0;

                const liberarImportacao = () => {
                    if (this.btnSubmitImport) this.btnSubmitImport.disabled = false;
                    this.arquivoImportacao.disabled = false;
                    this.empresaPedagioSelect.disabled = false;
                    if (this.filialImportacaoPedagio) this.filialImportacaoPedagio.disabled = false;
                    if (this.importProgressContainer) this.importProgressContainer.classList.add('hidden');
                };

                const handleErroImportacao = async (error) => {
                    console.error('Erro na importação:', {
                        message: error.message,
                        details: error.details,
                        hint: error.hint,
                        code: error.code,
                        error
                    });
                    try {
                        await this.atualizarImportacaoPedagio(importacaoAtual?.id, {
                            status: 'FALHA',
                            erro: error.message || 'Erro desconhecido',
                            total_registros: 0,
                            total_rejeitados: rejeitados.length
                        });
                        await this.carregarImportacoesPedagio();
                    } catch (statusError) {
                        console.warn('Não foi possível atualizar o status da importação:', statusError);
                    }
                    this.importStatus.innerHTML = `<p style="color: red;"><i class="fas fa-times-circle"></i> Erro ao processar arquivo: ${error.message || 'Erro desconhecido'}</p>`;
                    liberarImportacao();
                };

                const processBatch = async () => {
                    const batchSize = 100; // Processa em blocos para não travar a UI
                    const limit = Math.min(index + batchSize, rows.length);

                    for (; index < limit; index++) {
                        const row = rows[index];

                        // Pular linhas completamente em branco (não contabiliza para o usuário)
                        const isBlank = !row || row.length === 0 || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '');
                        if (isBlank) continue;

                        const placa = this.getValorColunaPlanilha(row, headers, layout, ['PLACA'])?.toString().toUpperCase().trim();
                        const dataCell = this.getValorColunaPlanilha(row, headers, layout, ['DATA']);
                        const horaCell = this.getValorColunaPlanilha(row, headers, layout, ['HORA']);
                        const filialPlanilha = this.getValorColunaPlanilha(row, headers, layout, ['FILIAL'])?.toString().toUpperCase().trim();
                        let filial = this.getValorFilial(filialPlanilha || filialPadrao);
                        const rodovia = this.getValorColunaPlanilha(row, headers, layout, ['RODOVIA'])?.toString().toUpperCase().trim();
                        const motorista = this.getValorColunaPlanilha(row, headers, layout, ['MOTORISTA'])?.toString().toUpperCase().trim();
                        const rota = this.getValorColunaPlanilha(row, headers, layout, ['ROTA'])?.toString().toUpperCase().trim();
                        const praca = this.getValorColunaPlanilha(row, headers, layout, ['PRACA', 'PRAÇA'])?.toString().toUpperCase().trim();

                        // Limpeza do Valor (Trata R$, espaços, separador de milhar e decimal)
                        const valRaw = this.getValorColunaPlanilha(row, headers, layout, ['VALOR']);
                        let valor = NaN;
                        if (typeof valRaw === 'number') {
                            valor = valRaw;
                        } else if (valRaw) {
                            valor = parseFloat(valRaw.toString().replace('R$', '').replace(/\s/g, '').replace('.', '').replace(',', '.'));
                        }

                        if (!placa || dataCell === null || dataCell === undefined || dataCell === '' || isNaN(valor)) {
                            rejeitados.push({ motivo: 'Dados obrigatórios ausentes (Placa, Data ou Valor)', dados: row });
                            pulosPorDados++;
                            continue;
                        }

                        // Validação de Placa: verifica cadastro e tenta conversão Mercosul.
                        const veiculo = this.buscarVeiculoPorPlaca(placa);
                        if (!veiculo) {
                            rejeitados.push({ motivo: `Veículo [${placa}] não cadastrado no sistema`, dados: row });
                            pulosPorVeiculo++;
                            continue;
                        }
                        const placaFinal = veiculo.placa;
                        if (!filial) filial = this.getValorFilial(veiculo.filial);

                        let dataHoraPassagem;
                        try {
                            dataHoraPassagem = this.parseDataHoraPlanilha(dataCell, horaCell);
                        } catch (dateError) {
                            rejeitados.push({ motivo: dateError.message, dados: row });
                            pulosPorDados++;
                            continue;
                        }

                        // Removida a redeclaração de 'veiculo', pois ele já foi definido acima para validação.
                        const marcaVeiculo = veiculo?.tipo || veiculo?.marca || 'N/A';
                        const idxCateg = this.getIndiceColunaPlanilha(headers, layout, ['CATEGORIA', 'EIXOS_COBRADO', 'EIXOCOBRADO', 'CATEG']);
                        
                        const categoriaPlanilha = idxCateg !== -1 ? row[idxCateg] : null;
                        const categoriaEixosRaw = categoriaPlanilha !== null
                            && categoriaPlanilha !== undefined
                            && String(categoriaPlanilha).trim() !== ''
                            ? parseInt(categoriaPlanilha, 10)
                            : (veiculo.eixos || 2);
                        let categoriaEixos = categoriaEixosRaw;

                        // Mapeamento de Categorias SEM PARAR para Número de Eixos
                        const mapaCategorias = {
                            61: 7, // Caminhão 7 eixos
                            62: 8, // Caminhão 8 eixos
                            63: 9, // Caminhão 9 eixos
                            64: 10, // Caminhão 10 eixos (Padrão ARTESP/ANTT)
                            90: 90, // Taxa ambiental carros
                            94: 94  // Taxa ambiental caminhões
                        };

                        if (mapaCategorias[categoriaEixosRaw]) {
                            categoriaEixos = mapaCategorias[categoriaEixosRaw];
                        }

                        lancamentosParaInserir.push({
                            placa: placaFinal,
                            marca_veiculo: marcaVeiculo,
                            categoria_eixos: categoriaEixos,
                            data_hora_passagem: dataHoraPassagem,
                            empresa_id: empresaId,
                            filial,
                            motorista,
                            rota,
                            rodovia,
                            praca,
                            valor,
                            usuario_id: usuarioId,
                            usuario_nome: usuarioNome,
                            importacao_id: importacaoAtual.id,
                        });
                    }

                    // Atualiza Barra de Progresso
                    const percent = Math.round((index / rows.length) * 100);
                    this.updateProgress(percent);

                    if (index < rows.length) {
                        setTimeout(() => processBatch().catch(handleErroImportacao), 0);
                    } else {
                        await finalizarImportacao();
                    }
                };

                const finalizarImportacao = async () => {
                    const chavesExistentes = await this.carregarChavesPedagioExistentes(lancamentosParaInserir);
                    const chavesArquivo = new Set();
                    const lancamentosSemDuplicidade = [];
                    let duplicadosIgnorados = 0;

                    lancamentosParaInserir.forEach(item => {
                        const chave = this.getChaveDuplicidadePedagio(item);
                        if (chavesExistentes.has(chave) || chavesArquivo.has(chave)) {
                            duplicadosIgnorados++;
                            rejeitados.push({
                                motivo: 'Lançamento duplicado',
                                dados: {
                                    placa: item.placa,
                                    data_hora_passagem: item.data_hora_passagem,
                                    valor: item.valor,
                                    praca: item.praca
                                }
                            });
                            return;
                        }
                        chavesArquivo.add(chave);
                        lancamentosSemDuplicidade.push(item);
                    });

                    if (lancamentosSemDuplicidade.length > 0) {
                        await this.inserirLancamentosPedagioEmLotes(lancamentosSemDuplicidade, (inseridos, total) => {
                            const percent = 90 + Math.round((inseridos / total) * 10);
                            this.updateProgress(Math.min(99, percent));
                            this.importStatus.innerHTML = `<p><i class="fas fa-spinner fa-spin"></i> Gravando lanÃ§amentos ${inseridos}/${total}...</p>`;
                        });

                        const importadosFinais = lancamentosSemDuplicidade.map(item => ({
                            placa: item.placa,
                            data_hora_passagem: item.data_hora_passagem,
                            valor: item.valor
                        }));
                        this.gerarRelatorioImportacao(importadosFinais, rejeitados);
                    
                        let msg = `<p style="color: green; font-weight: bold;"><i class="fas fa-check-circle"></i> Importação finalizada: ${lancamentosSemDuplicidade.length} lançamentos registrados.</p>`;
                        if (pulosPorVeiculo > 0) msg += `<p style="color: #d35400;"><i class="fas fa-exclamation-triangle"></i> ${pulosPorVeiculo} linhas ignoradas (Placas não cadastradas).</p>`;
                        if (pulosPorDados > 0) msg += `<p style="color: #666;"><i class="fas fa-info-circle"></i> ${pulosPorDados} linhas ignoradas (Dados incompletos).</p>`;
                        if (duplicadosIgnorados > 0) msg += `<p style="color: #d35400;"><i class="fas fa-clone"></i> ${duplicadosIgnorados} linhas duplicadas ignoradas.</p>`;
                    
                        this.importStatus.innerHTML = msg;
                        this.carregarLancamentos();
                    } else {
                        const motivo = duplicadosIgnorados > 0
                            ? `Todos os ${duplicadosIgnorados} lançamento(s) válidos já estavam cadastrados.`
                            : 'Nenhum lançamento válido encontrado no arquivo.';
                        this.importStatus.innerHTML = `<p style="color: orange;"><i class="fas fa-exclamation-triangle"></i> ${motivo}</p>`;
                    }

                    await this.atualizarImportacaoPedagio(importacaoAtual?.id, {
                        total_registros: lancamentosSemDuplicidade.length,
                        total_rejeitados: rejeitados.length,
                        status: 'CONCLUIDA',
                        erro: null
                    });
                    await this.carregarImportacoesPedagio();
                    liberarImportacao();
                };

                // Inicia o processamento
                processBatch().catch(handleErroImportacao);
            } catch (error) {
                console.error('Erro na importação:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code,
                    error
                });
                try {
                    await this.atualizarImportacaoPedagio(importacaoAtual?.id, {
                        status: 'FALHA',
                        erro: error.message || 'Erro desconhecido'
                    });
                    await this.carregarImportacoesPedagio();
                } catch (statusError) {
                    console.warn('Não foi possível atualizar o status da importação:', statusError);
                }
                this.importStatus.innerHTML = `<p style="color: red;"><i class="fas fa-times-circle"></i> Erro ao processar arquivo: ${error.message || 'Erro desconhecido'}</p>`;
                if (this.btnSubmitImport) this.btnSubmitImport.disabled = false;
                this.arquivoImportacao.disabled = false;
                this.empresaPedagioSelect.disabled = false;
                if (this.filialImportacaoPedagio) this.filialImportacaoPedagio.disabled = false;
            } finally {
                this.arquivoImportacao.value = ''; // Limpa o input do arquivo
            }
        };
        reader.onerror = (error) => {
            console.error('Erro ao ler arquivo:', error);
            this.importStatus.innerHTML = `<p style="color: red;"><i class="fas fa-times-circle"></i> Erro ao ler arquivo: ${error.message}</p>`;
            if (this.btnSubmitImport) this.btnSubmitImport.disabled = false;
            this.arquivoImportacao.disabled = false;
            this.empresaPedagioSelect.disabled = false;
            if (this.filialImportacaoPedagio) this.filialImportacaoPedagio.disabled = false;
        };
        reader.readAsArrayBuffer(arquivo);
    },

    updateProgress(percent) {
        if (this.importProgressBar) this.importProgressBar.style.width = `${percent}%`;
        if (this.importProgressPercent) this.importProgressPercent.textContent = `${percent}%`;
        if (this.importProgressText) {
            this.importProgressText.textContent = percent < 100 ? 'Processando planilha...' : 'Concluído!';
        }
    },

    /**
     * Gera um arquivo .txt com o detalhamento da importação.
     */
    gerarRelatorioImportacao(importados, rejeitados) {
        let content = "RELATÓRIO DE IMPORTAÇÃO DE PEDÁGIOS - MARQUESPAN\n";
        content += "================================================\n";
        content += `Processado em: ${new Date().toLocaleString('pt-BR')}\n`;
        content += `Total processado: ${importados.length + rejeitados.length}\n`;
        content += `Importados: ${importados.length}\n`;
        content += `Rejeitados: ${rejeitados.length}\n`;
        content += "================================================\n\n";

        if (importados.length > 0) {
            content += "✅ LANÇAMENTOS IMPORTADOS COM SUCESSO:\n";
            content += "------------------------------------------------\n";
            importados.forEach((r, i) => {
                content += `${String(i + 1).padStart(3, '0')}. Placa: ${r.placa} | Data: ${this.formatarDataHoraBrasilia(r.data_hora_passagem)} | Valor: R$ ${parseFloat(r.valor).toFixed(2)}\n`;
            });
            content += "\n";
        }

        if (rejeitados.length > 0) {
            content += "❌ LANÇAMENTOS NÃO IMPORTADOS (FALHAS):\n";
            content += "------------------------------------------------\n";
            rejeitados.forEach((r, i) => {
                content += `${String(i + 1).padStart(3, '0')}. MOTIVO: ${r.motivo}\n     CONTEÚDO DA LINHA: ${JSON.stringify(r.dados)}\n\n`;
            });
        }

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `resumo_importacao_pedagio_${new Date().getTime()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
};

document.addEventListener('DOMContentLoaded', () => {
    PedagioUI.init().finally(() => document.body.classList.remove('pedagio-loading'));
});
