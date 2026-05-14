import { supabaseClient } from './supabase.js';
import XLSX from "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";

const PedagioUI = {
    async init() {
        console.log('Página de Gestão de Pedágios iniciada.');
        
        // 1. Inicializa Variáveis de Estado Primeiro
        this.veiculosData = []; // Cache para dados de veículos
        this.empresasPedagio = []; // Cache para empresas de pedágio
        this.motoristasData = [];
        this.rotasData = [];
        this.filiaisData = [];
        this.editingLancamentoId = null; // Para edição de lançamentos
        this.editingEmpresaId = null; // Para edição de empresas
        this.sortState = { field: 'data_hora_passagem', ascending: false }; // Alinhado com outros módulos

        this.cacheDOM();
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
        this.carregarEmpresasPedagio(); // Carrega empresas de pedágio
        this.initTabs(); // 3. Ativa a aba padrão (isso chamará carregarLancamentos)
    },

    cacheDOM() {
        // Navegação por abas
        this.painelNavegacao = document.getElementById('menu-pedagio');
        this.sections = document.querySelectorAll('.main-content > section.glass-panel');

        this.usuarioDisplay = document.getElementById('usuario-logado');

        // Seção Lançamentos
        this.btnAdicionarLancamento = document.getElementById('btnAdicionarLancamento');
        this.filtroDataInicialLancamento = document.getElementById('filtroDataInicialLancamento');
        this.filtroDataFinalLancamento = document.getElementById('filtroDataFinalLancamento');
        this.searchPlaca = document.getElementById('searchPlaca');
        this.btnFiltrarLancamentos = document.getElementById('btnFiltrarLancamentos');
        this.tableBodyLancamentos = document.getElementById('tableBodyLancamentos');

        // Modal de Lançamento
        this.modalLancamento = document.getElementById('modalLancamento');
        this.btnCloseModalLancamento = this.modalLancamento?.querySelector('.close-button');
        // Seção Lançamentos
        this.btnAdicionarLancamento = document.getElementById('btnAdicionarLancamento');
        this.filtroDataInicialLancamento = document.getElementById('filtroDataInicialLancamento');
        this.filtroDataFinalLancamento = document.getElementById('filtroDataFinalLancamento');
        this.searchPlaca = document.getElementById('searchPlaca');
        this.btnFiltrarLancamentos = document.getElementById('btnFiltrarLancamentos');
        this.tableBodyLancamentos = document.getElementById('tableBodyLancamentos');

        // Modal de Lançamento
        this.modalLancamento = document.getElementById('modalLancamento');
        this.btnCloseModalLancamento = this.modalLancamento.querySelector('.close-button');
        this.formLancamentoPedagio = document.getElementById('formLancamentoPedagio');
        this.lancamentoPlaca = document.getElementById('lancamentoPlaca');
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
        this.btnFiltrarLancamentos.addEventListener('click', () => this.carregarLancamentos());
        this.searchPlaca.addEventListener('input', () => this.carregarLancamentos());
        this.tableBodyLancamentos.addEventListener('click', (e) => this.handleLancamentoTableClick(e));

        // Modal de Lançamento
        this.btnCloseModalLancamento.addEventListener('click', () => this.fecharModalLancamento());
        this.modalLancamento.addEventListener('click', (e) => { if (e.target === this.modalLancamento) this.fecharModalLancamento(); });
        this.lancamentoPlaca.addEventListener('change', () => this.preencherDadosVeiculo());
        this.formLancamentoPedagio.addEventListener('submit', (e) => this.salvarLancamento(e));
        this.btnGoogleMaps.addEventListener('click', () => this.abrirGoogleMaps());

        // Importação
        this.formImportacaoPedagio.addEventListener('submit', (e) => this.handleImportacao(e));

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
        } else if (sectionId === 'sectionEmpresas') {
            this.carregarEmpresasPedagio();
        }
    },

    setupLancamentosTab() {
        const hoje = new Date();
        const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        this.filtroDataInicialLancamento.valueAsDate = primeiroDiaMes;
        this.filtroDataFinalLancamento.valueAsDate = hoje;
    },

    getUsuarioLogado() {
        try {
            const user = localStorage.getItem('usuarioLogado');
            return user ? JSON.parse(user) : null;
        } catch (e) { return null; }
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
                .eq('situacao', 'ativo')
                .order('placa');
            if (error) throw error;
            this.veiculosData = data;
            this.veiculosList.innerHTML = data.map(v => `<option value="${v.placa}">${v.placa} - ${v.modelo}</option>`).join('');
        } catch (error) {
            console.error('Erro ao carregar veículos:', error);
        }
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

            const userFilial = this.getUserFilial();
            if (userFilial) {
                const valor = this.getValorFilial(userFilial);
                if (this.lancamentoFilial) this.lancamentoFilial.value = valor;
                if (this.filialImportacaoPedagio) this.filialImportacaoPedagio.value = valor;
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

    abrirModalLancamento() {
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
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        if (this.lancamentoDataHora) this.lancamentoDataHora.value = now.toISOString().slice(0, 16);
        
        if (this.modalLancamento) this.modalLancamento.classList.remove('hidden');

        // Preenche o select de empresas no modal de lançamento
        const selectEmpresa = document.getElementById('lancamentoEmpresa');
        if (selectEmpresa) {
            selectEmpresa.innerHTML = '<option value="">Selecione a Empresa</option>';
            this.empresasPedagio.forEach(empresa => {
                selectEmpresa.add(new Option(empresa.nome, empresa.id));
            });
        }
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
            data_hora_passagem: new Date(this.lancamentoDataHora.value).toISOString(),
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
                alert('Lançamento atualizado com sucesso!');
            } else {
                const { error } = await supabaseClient.from('pedagios_lancamentos').insert(payload);
                if (error) throw error;
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
        this.tableBodyLancamentos.innerHTML = '<tr><td colspan="11" class="text-center">Carregando...</td></tr>';
        try {
            const dataInicial = this.filtroDataInicialLancamento.value;
            const dataFinal = this.filtroDataFinalLancamento.value;
            const searchPlaca = (this.searchPlaca.value || '').trim().toUpperCase();

            if (!dataInicial || !dataFinal) {
                this.tableBodyLancamentos.innerHTML = '<tr><td colspan="11" class="text-center">Selecione o período de datas.</td></tr>';
                return;
            }

            const userFilial = this.getUserFilial();

            let query = supabaseClient
                .from('pedagios_lancamentos')
                .select('*');

            if (dataInicial) query = query.gte('data_hora_passagem', `${dataInicial}T00:00:00`);
            if (dataFinal) query = query.lte('data_hora_passagem', `${dataFinal}T23:59:59`);
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
                this.tableBodyLancamentos.innerHTML = '<tr><td colspan="11" class="text-center">Nenhum lançamento encontrado.</td></tr>';
                return;
            }

            lancamentos.forEach(item => {
                const veiculo = this.veiculosData.find(v => v.placa === item.placa);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.usuario_nome || '-'}</td>
                    <td>${new Date(item.data_hora_passagem).toLocaleString('pt-BR')}</td>
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
            this.tableBodyLancamentos.innerHTML = '<tr><td colspan="11" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        }
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
            this.lancamentoDataHora.value = new Date(data.data_hora_passagem).toISOString().slice(0, 16);
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
            alert('Lançamento excluído com sucesso!');
            this.carregarLancamentos();
        } catch (error) {
            console.error('Erro ao excluir lançamento:', error);
            alert('Erro ao excluir lançamento: ' + error.message);
        }
    },

    async carregarEmpresasPedagio() {
        try {
            const { data, error } = await supabaseClient.from('pedagios_empresas').select('*').order('nome');
            if (error) throw error;
            this.empresasPedagio = data;
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
        this.empresaPedagioSelect.innerHTML = '<option value="">Selecione a Empresa</option>';
        this.empresasPedagio.forEach(empresa => {
            const option = document.createElement('option');
            option.value = empresa.id;
            option.textContent = empresa.nome;
            this.empresaPedagioSelect.appendChild(option);
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
                alert('Empresa de pedágio atualizada com sucesso!');
            } else {
                await supabaseClient.from('pedagios_empresas').insert(payload);
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
            alert('Empresa de pedágio excluída com sucesso!');
            this.carregarEmpresasPedagio();
        } catch (error) {
            console.error('Erro ao excluir empresa de pedágio:', error);
            alert('Erro ao excluir empresa de pedágio: ' + error.message);
        }
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
        if (!filialPadrao) {
            alert('Selecione a filial da importação.');
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

                const layout = empresa.layout_config;
                const lancamentosParaInserir = [];
                const rejeitados = [];
                const importadosComSucesso = [];
                let pulosPorVeiculo = 0;
                let pulosPorDados = 0;
                let index = 0;

                const processBatch = async () => {
                    const batchSize = 100; // Processa em blocos para não travar a UI
                    const limit = Math.min(index + batchSize, rows.length);

                    for (; index < limit; index++) {
                        const row = rows[index];

                        // Pular linhas completamente em branco (não contabiliza para o usuário)
                        const isBlank = !row || row.length === 0 || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '');
                        if (isBlank) continue;

                        const idxPlaca = headers.indexOf(layout.PLACA || layout['PLACA']);
                        const placa = row[idxPlaca]?.toString().toUpperCase().trim();
                        const dataStr = row[headers.indexOf(layout.DATA || layout['DATA'])]?.toString().trim();
                        const horaStr = row[headers.indexOf(layout.HORA|| layout['HORA'])]?.toString().trim();
                        const filialPlanilha = row[headers.indexOf(layout.FILIAL || layout['FILIAL'])]?.toString().toUpperCase().trim();
                        const filial = this.getValorFilial(filialPlanilha || filialPadrao);
                        const rodovia = row[headers.indexOf(layout.RODOVIA || layout['RODOVIA'])]?.toString().toUpperCase().trim();
                        const motorista = row[headers.indexOf(layout.MOTORISTA || layout['MOTORISTA'])]?.toString().toUpperCase().trim();
                        const rota = row[headers.indexOf(layout.ROTA || layout['ROTA'])]?.toString().toUpperCase().trim();
                        // Suporte robusto para chaves PRACA ou PRAÇA no layout
                        const pracaKey = layout.PRACA || layout['PRACA'] || layout['PRAÇA'];
                        const praca = row[headers.indexOf(pracaKey)]?.toString().toUpperCase().trim();

                        // Limpeza do Valor (Trata R$, espaços, separador de milhar e decimal)
                        const valRaw = row[headers.indexOf(layout.VALOR || layout['VALOR'])];
                        let valor = NaN;
                        if (typeof valRaw === 'number') {
                            valor = valRaw;
                        } else if (valRaw) {
                            valor = parseFloat(valRaw.toString().replace('R$', '').replace(/\s/g, '').replace('.', '').replace(',', '.'));
                        }

                        if (!placa || !dataStr || isNaN(valor)) {
                            rejeitados.push({ motivo: 'Dados obrigatórios ausentes (Placa, Data ou Valor)', dados: row });
                            pulosPorDados++;
                            continue;
                        }

                        // Validação de Placa: Verifica se existe no cadastro de veículos ativos
                        const veiculo = this.veiculosData.find(v => v.placa === placa);
                        if (!veiculo) {
                            rejeitados.push({ motivo: `Veículo [${placa}] não cadastrado no sistema`, dados: row });
                            pulosPorVeiculo++;
                            continue;
                        }

                        let dataHoraPassagem;
                        const fullDateTimeStr = `${dataStr} ${horaStr || '00:00'}`;
                        try {
                            // Tenta parsear a data e hora. Assume formato DD/MM/YYYY HH:MM ou YYYY-MM-DD HH:MM
                            const convertedDateStr = fullDateTimeStr.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
                            dataHoraPassagem = new Date(convertedDateStr).toISOString();
                        } catch (dateError) {
                            console.warn('Erro ao parsear data/hora, usando data atual:', fullDateTimeStr, dateError);
                            dataHoraPassagem = new Date().toISOString();
                        }

                        // Removida a redeclaração de 'veiculo', pois ele já foi definido acima para validação.
                        const marcaVeiculo = veiculo?.tipo || veiculo?.marca || 'N/A';
                        const idxCateg = headers.indexOf(
                            layout.CATEGORIA ||
                            layout['CATEGORIA'] ||
                            layout.EIXOS_COBRADO ||
                            layout['EIXOS_COBRADO'] ||
                            layout.EIXOCOBRADO ||
                            layout['EIXOCOBRADO'] ||
                            layout.CATEG ||
                            layout['CATEG']
                        );
                        
                        let categoriaEixosRaw = (idxCateg !== -1 && row[idxCateg]) ? parseInt(row[idxCateg]) : (veiculo.eixos || 2);
                        let categoriaEixos = categoriaEixosRaw;

                        // Mapeamento de Categorias SEM PARAR para Número de Eixos
                        const mapaCategorias = {
                            1: 2,  // Carro (2 eixos)
                            2: 2,  // Caminhão 2 eixos
                            3: 3,  // Caminhão 3 eixos
                            4: 4,  // Caminhão 4 eixos
                            5: 5,  // Caminhão 5 eixos
                            6: 6,  // Caminhão 6 eixos
                            61: 7, // Caminhão 7 eixos
                            62: 8, // Caminhão 8 eixos
                            63: 9, // Caminhão 9 eixos
                            64: 10, // Caminhão 10 eixos (Padrão ARTESP/ANTT)
                            90: 2,  // Taxa ambiental carros (atribuindo 2 eixos padrão)
                            94: 2   // Taxa ambiental caminhões (atribuindo valor base)
                        };

                        if (mapaCategorias[categoriaEixosRaw]) {
                            categoriaEixos = mapaCategorias[categoriaEixosRaw];
                        }

                        lancamentosParaInserir.push({
                            placa,
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
                        });
                        importadosComSucesso.push({ placa, data_hora_passagem: dataHoraPassagem, valor });
                    }

                    // Atualiza Barra de Progresso
                    const percent = Math.round((index / rows.length) * 100);
                    this.updateProgress(percent);

                    if (index < rows.length) {
                        setTimeout(processBatch, 0);
                    } else {
                        await finalizarImportacao();
                    }
                };

                const finalizarImportacao = async () => {
                    if (lancamentosParaInserir.length > 0) {
                    const { error } = await supabaseClient.from('pedagios_lancamentos').insert(lancamentosParaInserir);
                    if (error) throw error;
                    this.gerarRelatorioImportacao(importadosComSucesso, rejeitados);
                    
                    let msg = `<p style="color: green; font-weight: bold;"><i class="fas fa-check-circle"></i> Importação finalizada: ${lancamentosParaInserir.length} lançamentos registrados.</p>`;
                    if (pulosPorVeiculo > 0) msg += `<p style="color: #d35400;"><i class="fas fa-exclamation-triangle"></i> ${pulosPorVeiculo} linhas ignoradas (Placas não cadastradas).</p>`;
                    if (pulosPorDados > 0) msg += `<p style="color: #666;"><i class="fas fa-info-circle"></i> ${pulosPorDados} linhas ignoradas (Dados incompletos).</p>`;
                    
                    this.importStatus.innerHTML = msg;
                    this.carregarLancamentos();
                } else {
                    this.importStatus.innerHTML = '<p style="color: orange;"><i class="fas fa-exclamation-triangle"></i> Nenhum lançamento válido encontrado no arquivo.</p>';
                }

                    // Libera interações
                    if (this.btnSubmitImport) this.btnSubmitImport.disabled = false;
                    this.arquivoImportacao.disabled = false;
                    this.empresaPedagioSelect.disabled = false;
                    if (this.filialImportacaoPedagio) this.filialImportacaoPedagio.disabled = false;
                    if (this.importProgressContainer) this.importProgressContainer.classList.add('hidden');
                };

                // Inicia o processamento
                processBatch();
            } catch (error) {
                console.error('Erro na importação:', error);
                this.importStatus.innerHTML = `<p style="color: red;"><i class="fas fa-times-circle"></i> Erro ao processar arquivo: ${error.message}</p>`;
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
                content += `${String(i + 1).padStart(3, '0')}. Placa: ${r.placa} | Data: ${new Date(r.data_hora_passagem).toLocaleString('pt-BR')} | Valor: R$ ${parseFloat(r.valor).toFixed(2)}\n`;
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
    PedagioUI.init();
});
