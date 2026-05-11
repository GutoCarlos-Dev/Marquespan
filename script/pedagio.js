import { supabaseClient } from './supabase.js';

const PedagioUI = {
    init() {
        console.log('Página de Gestão de Pedágios iniciada.');
        
        // 1. Inicializa Variáveis de Estado Primeiro
        this.veiculosData = []; // Cache para dados de veículos
        this.empresasPedagio = []; // Cache para empresas de pedágio
        this.editingLancamentoId = null; // Para edição de lançamentos
        this.editingEmpresaId = null; // Para edição de empresas
        this.currentSort = { column: 'data_hora_passagem', direction: 'desc' }; // Estado inicial da ordenação

        this.cacheDOM();
        this.bindEvents();
        this.initTabs(); // Isso já disparará o carregarLancamentos() via showSection

        this.carregarVeiculos();
        this.carregarEmpresasPedagio(); // Carrega empresas de pedágio
        this.setupLancamentosTab(); // Configura a aba de lançamentos
    },

    cacheDOM() {
        // Navegação por abas
        this.painelNavegacao = document.getElementById('menu-pedagio');
        this.sections = document.querySelectorAll('.main-content > section.glass-panel');

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
        this.lancamentoMarca = document.getElementById('lancamentoMarca');
        this.lancamentoCateg = document.getElementById('lancamentoCateg');
        this.lancamentoDataHora = document.getElementById('lancamentoDataHora');
        this.lancamentoRodovia = document.getElementById('lancamentoRodovia');
        this.lancamentoPraca = document.getElementById('lancamentoPraca');
        this.btnGoogleMaps = document.getElementById('btnGoogleMaps');
        this.lancamentoValor = document.getElementById('lancamentoValor');

        // Seção Importação
        this.formImportacaoPedagio = document.getElementById('formImportacaoPedagio');
        this.empresaPedagioSelect = document.getElementById('empresaPedagioSelect');
        this.arquivoImportacao = document.getElementById('arquivoImportacao');
        this.importStatus = document.getElementById('importStatus');

        // Seção Empresas de Pedágio
        this.formEmpresaPedagio = document.getElementById('formEmpresaPedagio');
        this.empresaPedagioEditingId = document.getElementById('empresaPedagioEditingId');
        this.empresaPedagioNome = document.getElementById('empresaPedagioNome');
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
        this.btnAdicionarLancamento.addEventListener('click', () => this.abrirModalLancamento());
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
            th.addEventListener('click', () => this.handleSort(th.dataset.sort));
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
        this.painelNavegacao.querySelectorAll('.painel-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        this.showSection(event.target.dataset.secao);
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

    async carregarVeiculos() {
        try {
            const { data, error } = await supabaseClient
                .from('veiculos')
                .select('placa, marca, modelo, categoria_eixos')
                .eq('situacao', 'ativo')
                .order('placa');
            if (error) throw error;
            this.veiculosData = data;
            this.veiculosList.innerHTML = data.map(v => `<option value="${v.placa}">${v.placa} - ${v.modelo}</option>`).join('');
        } catch (error) {
            console.error('Erro ao carregar veículos:', error);
        }
    },

    preencherDadosVeiculo() {
        const placa = this.lancamentoPlaca.value;
        const veiculo = this.veiculosData.find(v => v.placa === placa);
        if (veiculo) {
            this.lancamentoMarca.value = veiculo.marca || '';
            this.lancamentoCateg.value = veiculo.categoria_eixos || '';
        } else {
            this.lancamentoMarca.value = '';
            this.lancamentoCateg.value = '';
        }
    },

    abrirModalLancamento() {
        this.editingLancamentoId = null;
        this.formLancamentoPedagio.reset();
        this.lancamentoMarca.value = ''; // Limpa campos auto-preenchidos
        this.lancamentoCateg.value = '';
        this.lancamentoDataHora.value = new Date().toISOString().slice(0, 16);
        this.modalLancamento.classList.remove('hidden');
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
        const usuarioInfo = JSON.parse(localStorage.getItem('usuarioLogado')); // Assumindo que usuarioInfo.id é o BIGINT de public.usuarios.id
        const usuarioId = usuarioInfo?.id || null; // Get the user's UUID
        const usuarioNome = usuarioInfo?.nomecompleto || 'Sistema'; // Get the full name

        if (!usuarioId) {
            alert('Erro: Não foi possível identificar o usuário logado. Por favor, faça login novamente.');
            return;
        }

        const payload = {
            placa: this.lancamentoPlaca.value.toUpperCase(),
            marca_veiculo: this.lancamentoMarca.value.toUpperCase(),
            categoria_eixos: parseInt(this.lancamentoCateg.value),
            data_hora_passagem: new Date(this.lancamentoDataHora.value).toISOString(),
            rodovia: this.lancamentoRodovia.value.toUpperCase(),
            praca: this.lancamentoPraca.value.toUpperCase(),
            valor: parseFloat(this.lancamentoValor.value),
            usuario_id: usuarioId,
            usuario_nome: usuarioNome,
        };

        try {
            if (this.editingLancamentoId) {
                await supabaseClient.from('pedagios_lancamentos').update(payload).eq('id', this.editingLancamentoId);
                alert('Lançamento atualizado com sucesso!');
            } else {
                await supabaseClient.from('pedagios_lancamentos').insert(payload);
                alert('Lançamento salvo com sucesso!');
            }
            this.fecharModalLancamento();
            this.carregarLancamentos();
        } catch (error) {
            console.error('Erro ao salvar lançamento:', error);
            alert('Erro ao salvar lançamento: ' + error.message);
        }
    },

    async carregarLancamentos() {
        this.tableBodyLancamentos.innerHTML = '<tr><td colspan="6" class="text-center">Carregando...</td></tr>';
        try {
            const dataInicial = this.filtroDataInicialLancamento.value;
            const dataFinal = this.filtroDataFinalLancamento.value;
            const searchPlaca = this.searchPlaca.value.trim().toUpperCase();

            let query = supabaseClient
                .from('pedagios_lancamentos')
                .select('*');

            if (dataInicial) query = query.gte('data_hora_passagem', `${dataInicial}T00:00:00`);
            if (dataFinal) query = query.lte('data_hora_passagem', `${dataFinal}T23:59:59`);
            if (searchPlaca) query = query.ilike('placa', `%${searchPlaca}%`);

            query = query.order(this.currentSort.column, { ascending: this.currentSort.direction === 'asc' });

            const { data, error } = await query;
            if (error) throw error;

            this.tableBodyLancamentos.innerHTML = '';
            if (data.length === 0) {
                this.tableBodyLancamentos.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum lançamento encontrado.</td></tr>';
                return;
            }

            data.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(item.data_hora_passagem).toLocaleString('pt-BR')}</td>
                    <td>${item.placa}</td>
                    <td>${item.rodovia || '-'}</td>
                    <td>${item.praca || '-'}</td>
                    <td>${item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>
                        <button class="btn-action btn-edit" data-id="${item.id}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="btn-action btn-delete" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBodyLancamentos.appendChild(tr);
            });
            this.updateSortIcons();
        } catch (error) {
            console.error('Erro ao carregar lançamentos:', error);
            this.tableBodyLancamentos.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        }
    },

    handleSort(column) {
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'asc';
        }
        this.carregarLancamentos();
    },

    updateSortIcons() {
        document.querySelectorAll('#sectionLancamento th[data-sort] i').forEach(icon => {
            icon.className = 'fas fa-sort';
            const th = icon.closest('th');
            if (th.dataset.sort === this.currentSort.column) {
                icon.className = this.currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
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
            this.preencherDadosVeiculo(); // Para preencher Marca e Categoria
            this.lancamentoDataHora.value = new Date(data.data_hora_passagem).toISOString().slice(0, 16);
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
            this.tableBodyEmpresasPedagio.innerHTML = '<tr><td colspan="3" class="text-center">Nenhuma empresa cadastrada.</td></tr>';
            return;
        }
        this.empresasPedagio.forEach(empresa => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${empresa.nome}</td>
                <td><pre>${JSON.stringify(empresa.layout_config, null, 2)}</pre></td>
                <td>
                    <button class="btn-action btn-edit" data-id="${empresa.id}" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="btn-action btn-delete" data-id="${empresa.id}" title="Excluir"><i class="fas fa-trash"></i></button>
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

    async salvarEmpresaPedagio(event) {
        event.preventDefault();
        const nome = this.empresaPedagioNome.value.toUpperCase();
        let layoutConfig = {};
        try {
            layoutConfig = JSON.parse(this.empresaPedagioLayout.value);
        } catch (e) {
            alert('Layout de Importação inválido. Certifique-se de que é um JSON válido.');
            return;
        }

        const payload = { nome, layout_config: layoutConfig };

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
            this.empresaPedagioNome.value = data.nome;
            this.empresaPedagioLayout.value = JSON.stringify(data.layout_config, null, 2);
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

        this.importStatus.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Processando arquivo...</p>';

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
                const usuarioNome = usuarioInfo?.nomecompleto || 'Sistema';

                if (!usuarioId) throw new Error('Não foi possível identificar o usuário logado para a importação.');

                const layout = empresa.layout_config;
                const lancamentosParaInserir = [];
                const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';

                for (const row of rows) {
                    const placa = row[headers.indexOf(layout.PLACA)]?.toString().toUpperCase().trim();
                    const dataStr = row[headers.indexOf(layout.DATA)]?.toString().trim();
                    const horaStr = row[headers.indexOf(layout.HORA)]?.toString().trim();
                    const rodovia = row[headers.indexOf(layout.RODOVIA)]?.toString().toUpperCase().trim();
                    const praca = row[headers.indexOf(layout.PRACA)]?.toString().toUpperCase().trim();
                    const valor = parseFloat(row[headers.indexOf(layout.VALOR)]?.toString().replace(',', '.'));

                    if (!placa || !dataStr || isNaN(valor)) {
                        console.warn('Linha ignorada devido a dados incompletos:', row);
                        continue;
                    }

                    let dataHoraPassagem;
                    try {
                        // Tenta parsear a data e hora. Assume formato DD/MM/YYYY HH:MM ou YYYY-MM-DD HH:MM
                        const fullDateTimeStr = `${dataStr} ${horaStr || '00:00'}`;
                        dataHoraPassagem = new Date(fullDateTimeStr.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')).toISOString();
                    } catch (dateError) {
                        console.warn('Erro ao parsear data/hora, usando data atual:', fullDateTimeStr, dateError);
                        dataHoraPassagem = new Date().toISOString();
                    }

                    // Buscar dados do veículo para preencher marca e categoria
                    const veiculo = this.veiculosData.find(v => v.placa === placa);
                    const marcaVeiculo = veiculo?.marca || 'N/A';
                    const categoriaEixos = veiculo?.categoria_eixos || 0;

                    lancamentosParaInserir.push({
                        placa,
                        marca_veiculo: marcaVeiculo,
                        categoria_eixos: categoriaEixos,
                        data_hora_passagem: dataHoraPassagem,
                        rodovia,
                        praca,
                        valor,
                        usuario_id: usuarioId,
                        usuario_nome: usuarioNome,
                    });
                }

                if (lancamentosParaInserir.length > 0) {
                    const { error } = await supabaseClient.from('pedagios_lancamentos').insert(lancamentosParaInserir);
                    if (error) throw error;
                    this.importStatus.innerHTML = `<p style="color: green;"><i class="fas fa-check-circle"></i> ${lancamentosParaInserir.length} lançamentos importados com sucesso!</p>`;
                    this.carregarLancamentos();
                } else {
                    this.importStatus.innerHTML = '<p style="color: orange;"><i class="fas fa-exclamation-triangle"></i> Nenhum lançamento válido encontrado no arquivo.</p>';
                }
            } catch (error) {
                console.error('Erro na importação:', error);
                this.importStatus.innerHTML = `<p style="color: red;"><i class="fas fa-times-circle"></i> Erro ao processar arquivo: ${error.message}</p>`;
            } finally {
                this.arquivoImportacao.value = ''; // Limpa o input do arquivo
            }
        };
        reader.onerror = (error) => {
            console.error('Erro ao ler arquivo:', error);
            this.importStatus.innerHTML = `<p style="color: red;"><i class="fas fa-times-circle"></i> Erro ao ler arquivo: ${error.message}</p>`;
        };
        reader.readAsArrayBuffer(arquivo);
    },
};

document.addEventListener('DOMContentLoaded', () => {
    PedagioUI.init();
});