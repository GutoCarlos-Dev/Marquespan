// script/despesas.js - Lógica para o módulo de Cadastro de Despesas
import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const DESPESAS_PAGE_ID = 'despesas.html';
const DESPESA_CAMPOS_FIXOS_STORAGE = 'despesas_campos_fixos';
const MAPA_CAMPOS_FIXOS_DESPESA = {
    filial: { label: 'Filial', grupo: 'Hospedagem', icon: 'fa-building' },
    rota: { label: 'Rota', grupo: 'Hospedagem', icon: 'fa-route' },
    hotel: { label: 'Hotel', grupo: 'Hospedagem', icon: 'fa-hotel' },
    tipoQuarto: { label: 'Tipo de Quarto', grupo: 'Hospedagem', icon: 'fa-bed' },
    funcionario1: { label: 'Motorista', grupo: 'Equipe', icon: 'fa-id-card' },
    funcionario2: { label: 'Ajudante', grupo: 'Equipe', icon: 'fa-user-group' },
    dataReserva: { label: 'Data Reserva', grupo: 'Periodo', icon: 'fa-calendar-day' },
    checkin: { label: 'Check-in', grupo: 'Periodo', icon: 'fa-calendar-check' },
    diarias: { label: 'Qtd Diarias', grupo: 'Periodo', icon: 'fa-moon' },
    valorDiaria: { label: 'Valor Diaria', grupo: 'Financeiro', icon: 'fa-money-bill-wave' },
    valorEnergia: { label: 'Valor Energia', grupo: 'Financeiro', icon: 'fa-bolt' },
    formaPagamento: { label: 'Forma Pagamento', grupo: 'Financeiro', icon: 'fa-credit-card' },
    notaFiscal: { label: 'Nota Fiscal', grupo: 'Fiscal', icon: 'fa-file-invoice' },
    observacao: { label: 'Observacoes', grupo: 'Complemento', icon: 'fa-align-left' }
};

const DespesasUI = {
    async init() {
        const acessoPermitido = await this.verificarPermissaoPagina();
        if (!acessoPermitido) return;

        this.cache();
        this.sortField = 'data_checkin'; // Campo padrão
        this.sortAsc = false; // Ordem padrão (descendente)
        this.editingQuartoId = null;
        this.usuarioDespesaEditando = '';
        this.bind();
        this.loadInitialData();
    },

    cache() {
        // Formulário e campos
        this.form = document.getElementById('formCadastrarDespesa');
        this.editingIdInput = document.getElementById('despesaEditingId');
        this.btnSubmit = document.getElementById('btnSubmitDespesa');
        this.btnClearForm = document.getElementById('btnClearDespesaForm');
        this.btnFixarCampos = document.getElementById('btnFixarCamposDespesa');

        // Campos para cálculo
        this.qtdDiariasInput = document.getElementById('despesaDiarias');
        this.valorDiariaInput = document.getElementById('despesaValorDiaria');
        this.valorEnergiaInput = document.getElementById('despesaValorEnergia');
        this.valorTotalInput = document.getElementById('despesaValorTotal');
        this.checkinInput = document.getElementById('despesaCheckin');
        this.checkoutInput = document.getElementById('despesaCheckout');
        this.formaPagamentoSelect = document.getElementById('despesaFormaPagamento');

        // Tabela e busca
        this.tableBody = document.getElementById('despesaTableBody');
        this.historicoCount = document.getElementById('historicoDespesasCount');
        this.searchFilialInput = document.getElementById('searchDespesaFilial');
        this.searchRotaInput = document.getElementById('searchDespesaRota');
        this.searchHotelInput = document.getElementById('searchDespesaHotel');
        this.searchFuncionarioInput = document.getElementById('searchDespesaFuncionario');

        // Filial
        this.filialSelect = document.getElementById('despesaFilial');

        // Dropdowns Multiselect
        this.despesaRotaDisplay = document.getElementById('despesaRotaDisplay');
        this.despesaRotaOptions = document.getElementById('despesaRotaOptions');
        this.despesaRotaText = document.getElementById('despesaRotaText');
        this.despesaHotelDisplay = document.getElementById('despesaHotelDisplay');
        this.despesaHotelOptions = document.getElementById('despesaHotelOptions');
        this.despesaHotelText = document.getElementById('despesaHotelText');

        this.funcionarios1List = document.getElementById('funcionarios1List');
        this.funcionarios2List = document.getElementById('funcionarios2List');
        this.btnAdicionarHotel = document.getElementById('btnAdicionarHotel');
        this.tipoQuartoSelect = document.getElementById('despesaTipoQuarto');

        // Modal Gerenciar Quartos
        this.btnGerenciarQuartos = document.getElementById('btnGerenciarQuartos');
        this.modalQuartos = document.getElementById('modalGerenciarQuartos');
        this.btnCloseModalQuartos = document.getElementById('closeModalQuartos');
        this.tituloHotelQuartos = document.getElementById('tituloHotelQuartos');
        this.novoTipoQuartoInput = document.getElementById('novoTipoQuartoInput');
        this.btnSalvarNovoQuarto = document.getElementById('btnSalvarNovoQuarto');
        this.novoTipoQuartoValorNegociadoInput = document.getElementById('novoTipoQuartoValorNegociado');
        this.listaQuartosEdicao = document.getElementById('listaQuartosEdicao');
        this.valorNegociadoDisplay = document.getElementById('valorNegociadoDisplay');
        this.btnToggleMenuLateral = document.getElementById('btnToggleMenuLateralDespesas');

        // Modal Campos Fixos
        this.modalCamposFixos = document.getElementById('modalCamposFixosDespesa');
        this.listaCamposFixos = document.getElementById('listaCamposFixosDespesa');
        this.btnFecharCamposFixos = document.getElementById('btnFecharCamposFixosDespesa');
        this.btnCancelarCamposFixos = document.getElementById('btnCancelarCamposFixosDespesa');
        this.btnSalvarCamposFixos = document.getElementById('btnSalvarCamposFixosDespesa');
    },

    bind() {
        this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.btnClearForm.addEventListener('click', () => this.clearForm());
        this.btnFixarCampos?.addEventListener('click', () => this.abrirModalCamposFixos());
        this.btnFecharCamposFixos?.addEventListener('click', () => this.fecharModalCamposFixos());
        this.btnCancelarCamposFixos?.addEventListener('click', () => this.fecharModalCamposFixos());
        this.btnSalvarCamposFixos?.addEventListener('click', () => this.salvarCamposFixos());
        this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
        this.searchFilialInput?.addEventListener('change', () => this.renderGrid());
        this.searchRotaInput?.addEventListener('input', () => this.renderGrid());
        this.searchHotelInput?.addEventListener('input', () => this.renderGrid());
        this.searchFuncionarioInput?.addEventListener('input', () => this.renderGrid());
        this.btnToggleMenuLateral?.addEventListener('click', () => this.toggleMenuLateral());

        this.filialSelect?.addEventListener('change', () => {
            if (this.filialSelect.value) this.filialSelect.classList.remove('campo-invalido');
            this.loadRotasPorFilial(this.filialSelect.value);
        });

        // ** Adiciona os listeners para o cálculo automático do valor total **
        this.qtdDiariasInput.addEventListener('input', () => {
            this.calcularValorTotal();
            this.calcularCheckout();
        });
        this.valorDiariaInput.addEventListener('blur', () => {
            this.calcularValorTotal();
            this.checkValorDiariaConflito();
        });
        this.valorEnergiaInput.addEventListener('input', () => this.calcularValorTotal());
        this.checkinInput.addEventListener('input', () => this.calcularCheckout());
        
        // Listeners para validação de valor negociado
        this.tipoQuartoSelect.addEventListener('change', () => {
            // Atualiza a exibição do valor negociado no span informativo
            const selectedOption = this.tipoQuartoSelect.options[this.tipoQuartoSelect.selectedIndex];
            this.exibirInformativoValorNegociado(selectedOption);
            this.checkValorDiariaConflito();
        });

        // Listener para o novo botão de adicionar hotel
        this.btnAdicionarHotel.addEventListener('click', () => this.abrirCadastroHotel());

        // Listener para carregar tipos de quarto quando um hotel é selecionado
        if (this.despesaHotelOptions) {
            this.despesaHotelOptions.addEventListener('change', () => {
                this.handleHotelSelectionChange();
                if (this.getSelectedValues(this.despesaHotelOptions, 'hotel-checkbox').length > 0) {
                    this.despesaHotelDisplay.classList.remove('campo-invalido');
                }
            });
        }

        // Limpar destaque de validação ao corrigir os campos obrigatórios
        this.tipoQuartoSelect.addEventListener('change', () => {
            if (this.tipoQuartoSelect.value) this.tipoQuartoSelect.classList.remove('campo-invalido');
        });
        document.getElementById('despesaFuncionario1Input')?.addEventListener('input', () => {
            if (document.getElementById('despesaFuncionario1Input').value.trim()) {
                document.getElementById('despesaFuncionario1Input').classList.remove('campo-invalido');
            }
        });

        // Listeners do Modal de Quartos
        this.btnGerenciarQuartos.addEventListener('click', () => this.abrirModalQuartos());
        this.btnCloseModalQuartos.addEventListener('click', () => this.fecharModalQuartos());
        this.btnSalvarNovoQuarto.addEventListener('click', () => this.salvarNovoQuarto());
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modalQuartos) this.fecharModalQuartos();
            if (e.target === this.modalCamposFixos) this.fecharModalCamposFixos();
        });

        this.listaQuartosEdicao.addEventListener('click', (e) => {
            const btnDelete = e.target.closest('.btn-delete-quarto');
            const btnEdit = e.target.closest('.btn-edit-quarto');
            if (btnDelete) this.excluirQuarto(btnDelete.dataset.id);
            if (btnEdit) this.prepararEdicaoQuarto(btnEdit.dataset.id);
        });

        // Evento de clique para ordenação das colunas
        document.querySelectorAll('th[data-key]').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.key));
        });

        // Inicializa eventos dos Multiselects
        if (this.despesaRotaDisplay && this.despesaRotaOptions) {
            this.setupMultiselect(this.despesaRotaDisplay, this.despesaRotaOptions, this.despesaRotaText, 'rota-checkbox');
        }
        if (this.despesaHotelDisplay && this.despesaHotelOptions) {
            this.setupMultiselect(this.despesaHotelDisplay, this.despesaHotelOptions, this.despesaHotelText, 'hotel-checkbox');
        }

        // Atalho de teclado Ctrl+S para salvar
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.btnSubmit.click();
            }
        });
    },

    toggleMenuLateral() {
        document.body.classList.toggle('despesas-menu-oculto');
        const oculto = document.body.classList.contains('despesas-menu-oculto');
        if (this.btnToggleMenuLateral) {
            this.btnToggleMenuLateral.title = oculto ? 'Mostrar menu lateral' : 'Ocultar menu lateral';
            this.btnToggleMenuLateral.setAttribute('aria-label', this.btnToggleMenuLateral.title);
        }
    },

    setupMultiselect(display, options, textSpan, checkboxClass) {
        // Toggle visibility
        display.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = options.classList.contains('hidden');
            // Fecha outros dropdowns se houver
            document.querySelectorAll('.custom-options').forEach(d => d.classList.add('hidden'));
            if (isHidden) options.classList.remove('hidden');
        });

        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            if (!display.contains(e.target) && !options.contains(e.target)) {
                options.classList.add('hidden');
            }
        });

        // Atualizar texto ao selecionar
        options.addEventListener('change', (e) => {
            if (e.target.classList.contains(checkboxClass)) {
                this.updateMultiselectText(options, textSpan, checkboxClass);
            }
        });
    },

    updateMultiselectText(optionsContainer, textSpan, checkboxClass) {
        const checked = Array.from(optionsContainer.querySelectorAll(`.${checkboxClass}:checked`));
        if (checked.length === 0) {
            textSpan.textContent = 'Selecione...';
        } else if (checked.length === 1) {
            // Pega o texto do label pai
            textSpan.textContent = checked[0].parentElement.textContent.trim();
        } else {
            textSpan.textContent = `${checked.length} selecionados`;
        }
    },

    async loadInitialData() {
        this.renderGrid();
        await this.loadFiliais();
        await this.loadDatalists();
    },

    abrirCadastroHotel() {
        // Redireciona para a página de hotéis, passando a página atual como parâmetro para retorno
        window.location.href = `hotel.html?redirect=despesas.html`;
    },

    calcularValorTotal() {
        const qtdDiarias = parseFloat(this.qtdDiariasInput.value) || 0;
        const valorDiaria = parseFloat(this.valorDiariaInput.value) || 0;
        const valorEnergia = parseFloat(this.valorEnergiaInput.value) || 0;

        const valorTotal = (valorDiaria * qtdDiarias) + valorEnergia;

        this.valorTotalInput.value = valorTotal.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    },

    calcularCheckout() {
        const checkinDate = this.checkinInput.value;
        const diarias = parseInt(this.qtdDiariasInput.value);

        if (checkinDate && !isNaN(diarias) && diarias > 0) {
            const data = new Date(checkinDate + 'T00:00:00');
            data.setDate(data.getDate() + diarias);
            this.checkoutInput.value = data.toISOString().split('T')[0];
        } else {
            this.checkoutInput.value = '';
        }
    },

    getCurrentUserName() {
        try {
            const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
            return usuarioLogado?.nome || usuarioLogado?.email || 'Sistema';
        } catch (e) {
            return 'Sistema';
        }
    },

    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('usuarioLogado')) || {};
        } catch (e) {
            return {};
        }
    },

    getCurrentUserLevel() {
        return String(this.getCurrentUser().nivel || '').toLowerCase();
    },

    getFilialUsuarioDespesa() {
        return String(this.getCurrentUser()?.filial || '').trim().toUpperCase();
    },

    async verificarPermissaoPagina() {
        const nivelUsuario = this.getCurrentUserLevel();

        if (!nivelUsuario) {
            window.location.href = 'index.html';
            return false;
        }

        if (nivelUsuario === 'administrador') {
            return true;
        }

        try {
            const { data, error } = await supabaseClient
                .from('nivel_permissoes')
                .select('paginas_permitidas')
                .eq('nivel', nivelUsuario)
                .single();

            if (error) throw error;

            const paginasPermitidas = Array.isArray(data?.paginas_permitidas)
                ? data.paginas_permitidas
                : [];

            if (paginasPermitidas.includes(DESPESAS_PAGE_ID)) {
                return true;
            }
        } catch (error) {
            console.error('Erro ao verificar permissao da pagina de despesas:', error);
        }

        document.body.innerHTML = `
            <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:Arial,sans-serif;">
                <div>
                    <h1 style="margin-bottom:12px;">Acesso negado</h1>
                    <p>Voce nao tem permissao para acessar a pagina de despesas.</p>
                    <a href="menu.html" style="display:inline-block;margin-top:16px;color:#2563eb;">Voltar ao menu</a>
                </div>
            </div>
        `;
        return false;
    },

    usuarioPodeExcluir() {
        return ['administrador', 'gerencia', 'gerencia_tmg', 'adm_logistica'].includes(this.getCurrentUserLevel());
    },

    formatDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('pt-BR');
    },

    obterCamposFixos() {
        try {
            return JSON.parse(localStorage.getItem(DESPESA_CAMPOS_FIXOS_STORAGE) || '[]');
        } catch (e) {
            return [];
        }
    },

    abrirModalCamposFixos() {
        if (!this.modalCamposFixos || !this.listaCamposFixos) return;

        const camposSalvos = this.obterCamposFixos();
        this.listaCamposFixos.innerHTML = '';

        Object.entries(MAPA_CAMPOS_FIXOS_DESPESA).forEach(([id, config]) => {
            const checked = camposSalvos.includes(id) ? 'checked' : '';
            const item = document.createElement('label');
            item.className = 'campo-fixo-option';
            item.setAttribute('for', `chk_despesa_fix_${id}`);
            item.innerHTML = `
                <input type="checkbox" id="chk_despesa_fix_${id}" value="${id}" ${checked}>
                <span class="campo-fixo-check"><i class="fas fa-check"></i></span>
                <span class="campo-fixo-icon"><i class="fas ${config.icon}"></i></span>
                <span class="campo-fixo-texto">
                    <strong>${config.label}</strong>
                    <small>${config.grupo}</small>
                </span>
            `;
            this.listaCamposFixos.appendChild(item);
        });

        this.modalCamposFixos.classList.remove('hidden');
    },

    fecharModalCamposFixos() {
        this.modalCamposFixos?.classList.add('hidden');
    },

    salvarCamposFixos() {
        const selecionados = Array.from(this.listaCamposFixos.querySelectorAll('input[type="checkbox"]:checked'))
            .map((checkbox) => checkbox.value);

        localStorage.setItem(DESPESA_CAMPOS_FIXOS_STORAGE, JSON.stringify(selecionados));
        alert('Preferencias salvas! Os campos selecionados nao serao limpos apos salvar uma nova despesa.');
        this.fecharModalCamposFixos();
    },

    setSelectedValues(container, checkboxClass, values) {
        const selecionados = new Set((values || []).map(String));
        container.querySelectorAll(`.${checkboxClass}`).forEach((checkbox) => {
            checkbox.checked = selecionados.has(String(checkbox.value));
        });
    },

    capturarValoresFixos(camposFixos) {
        const valores = {};
        const deveFixar = (campo) => camposFixos.includes(campo);

        if (deveFixar('filial')) valores.filial = this.filialSelect?.value || '';
        if (deveFixar('rota')) valores.rota = this.getSelectedValues(this.despesaRotaOptions, 'rota-checkbox');
        // Tipo de Quarto so existe no contexto de um Hotel: sem o hotel fixado junto,
        // o select fica sem opcoes e a fixacao do tipo de quarto nao teria efeito.
        if (deveFixar('hotel') || deveFixar('tipoQuarto')) {
            valores.hotel = this.getSelectedValues(this.despesaHotelOptions, 'hotel-checkbox');
        }
        if (deveFixar('tipoQuarto')) valores.tipoQuarto = this.tipoQuartoSelect.value;
        if (deveFixar('funcionario1')) valores.funcionario1 = document.getElementById('despesaFuncionario1Input').value;
        if (deveFixar('funcionario2')) valores.funcionario2 = document.getElementById('despesaFuncionario2Input').value;
        if (deveFixar('dataReserva')) valores.dataReserva = document.getElementById('despesaDataReserva').value;
        if (deveFixar('checkin')) valores.checkin = this.checkinInput.value;
        if (deveFixar('diarias')) valores.diarias = this.qtdDiariasInput.value;
        if (deveFixar('valorDiaria')) valores.valorDiaria = this.valorDiariaInput.value;
        if (deveFixar('valorEnergia')) valores.valorEnergia = this.valorEnergiaInput.value;
        if (deveFixar('formaPagamento')) valores.formaPagamento = this.formaPagamentoSelect.value;
        if (deveFixar('notaFiscal')) valores.notaFiscal = document.getElementById('despesaNotaFiscal').value;
        if (deveFixar('observacao')) valores.observacao = document.getElementById('despesaObservacao').value;

        return valores;
    },

    async restaurarValoresFixos(valores) {
        if (Object.prototype.hasOwnProperty.call(valores, 'filial') && this.filialSelect) {
            this.filialSelect.value = valores.filial;
            // Precisa terminar de recarregar as rotas da filial ANTES de marcar
            // os checkboxes de rota abaixo, senao o rebuild da lista apaga a selecao.
            await this.loadRotasPorFilial(valores.filial);
        }

        if (Object.prototype.hasOwnProperty.call(valores, 'rota')) {
            this.setSelectedValues(this.despesaRotaOptions, 'rota-checkbox', valores.rota);
            this.updateMultiselectText(this.despesaRotaOptions, this.despesaRotaText, 'rota-checkbox');
        }

        if (Object.prototype.hasOwnProperty.call(valores, 'hotel')) {
            this.setSelectedValues(this.despesaHotelOptions, 'hotel-checkbox', valores.hotel);
            this.updateMultiselectText(this.despesaHotelOptions, this.despesaHotelText, 'hotel-checkbox');
            if (valores.hotel.length === 1 && Object.prototype.hasOwnProperty.call(valores, 'tipoQuarto')) {
                this.loadTiposQuarto(valores.hotel[0], valores.tipoQuarto);
                this.btnGerenciarQuartos.disabled = false;
            } else {
                this.handleHotelSelectionChange();
            }
        }

        if (Object.prototype.hasOwnProperty.call(valores, 'funcionario1')) {
            document.getElementById('despesaFuncionario1Input').value = valores.funcionario1;
        }
        if (Object.prototype.hasOwnProperty.call(valores, 'funcionario2')) {
            document.getElementById('despesaFuncionario2Input').value = valores.funcionario2;
        }
        if (Object.prototype.hasOwnProperty.call(valores, 'dataReserva')) {
            document.getElementById('despesaDataReserva').value = valores.dataReserva;
        }
        if (Object.prototype.hasOwnProperty.call(valores, 'checkin')) this.checkinInput.value = valores.checkin;
        if (Object.prototype.hasOwnProperty.call(valores, 'diarias')) this.qtdDiariasInput.value = valores.diarias;
        if (Object.prototype.hasOwnProperty.call(valores, 'valorDiaria')) this.valorDiariaInput.value = valores.valorDiaria;
        if (Object.prototype.hasOwnProperty.call(valores, 'valorEnergia')) this.valorEnergiaInput.value = valores.valorEnergia;
        if (Object.prototype.hasOwnProperty.call(valores, 'formaPagamento')) this.formaPagamentoSelect.value = valores.formaPagamento;
        if (Object.prototype.hasOwnProperty.call(valores, 'notaFiscal')) {
            document.getElementById('despesaNotaFiscal').value = valores.notaFiscal;
        }
        if (Object.prototype.hasOwnProperty.call(valores, 'observacao')) {
            document.getElementById('despesaObservacao').value = valores.observacao;
        }

        this.calcularCheckout();
        this.calcularValorTotal();
    },

    validarCamposObrigatorios() {
        const erros = [];
        const func1Input = document.getElementById('despesaFuncionario1Input');

        // Filial
        if (!this.filialSelect?.value) {
            erros.push('Filial');
            this.filialSelect?.classList.add('campo-invalido');
        } else {
            this.filialSelect.classList.remove('campo-invalido');
        }

        // Hotel
        const hoteisSelecionados = this.getSelectedValues(this.despesaHotelOptions, 'hotel-checkbox');
        if (hoteisSelecionados.length === 0) {
            erros.push('Hotel');
            this.despesaHotelDisplay.classList.add('campo-invalido');
        } else {
            this.despesaHotelDisplay.classList.remove('campo-invalido');
        }

        // Tipo de Quarto
        if (!this.tipoQuartoSelect.value) {
            erros.push('Tipo de Quarto');
            this.tipoQuartoSelect.classList.add('campo-invalido');
        } else {
            this.tipoQuartoSelect.classList.remove('campo-invalido');
        }

        // Funcionário 1
        if (!func1Input.value.trim()) {
            erros.push('Funcionário 1 (Motorista)');
            func1Input.classList.add('campo-invalido');
        } else {
            func1Input.classList.remove('campo-invalido');
        }

        if (erros.length > 0) {
            alert('❌ Preencha os campos obrigatórios:\n\n• ' + erros.join('\n• '));
            return false;
        }
        return true;
    },

    async handleFormSubmit(e) {
        e.preventDefault();

        if (this.btnSubmit.disabled) return;

        if (!this.validarCamposObrigatorios()) return;

        const originalText = this.btnSubmit.innerHTML;
        this.btnSubmit.disabled = true;
        this.btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        const valorTotalString = this.valorTotalInput.value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        const valorTotal = parseFloat(valorTotalString) || 0;

        try {
            const rotasSelecionadas = this.getSelectedValues(this.despesaRotaOptions, 'rota-checkbox');
            const hoteisSelecionados = this.getSelectedValues(this.despesaHotelOptions, 'hotel-checkbox');

            const func1NomeCompleto = document.getElementById('despesaFuncionario1Input').value;
            const func2NomeCompleto = document.getElementById('despesaFuncionario2Input').value;

            const { data: func1 } = await supabaseClient.from('funcionario').select('id').eq('nome_completo', func1NomeCompleto).single();
            if (!func1) throw new Error(`Funcionário "${func1NomeCompleto}" não encontrado no cadastro.`);

            let func2Id = null;
            if (func2NomeCompleto) {
                const { data: func2 } = await supabaseClient.from('funcionario').select('id').eq('nome_completo', func2NomeCompleto).single();
                if (!func2) throw new Error(`Funcionário "${func2NomeCompleto}" não encontrado no cadastro.`);
                func2Id = func2.id;
            }

            const hotelId = hoteisSelecionados[0];

            const payload = {
                id: this.editingIdInput.value || undefined,
                filial: this.filialSelect?.value || null,
                numero_rota: rotasSelecionadas.join(', '),
                id_hotel: hotelId,
                id_funcionario1: func1.id,
                id_funcionario2: func2Id,
                tipo_quarto: this.tipoQuartoSelect.value,
                qtd_diarias: parseInt(this.qtdDiariasInput.value),
                data_reserva: document.getElementById('despesaDataReserva').value || null,
                nota_fiscal: document.getElementById('despesaNotaFiscal').value || null,
                observacao: document.getElementById('despesaObservacao').value || null,
                data_checkin: document.getElementById('despesaCheckin').value,
                data_checkout: document.getElementById('despesaCheckout').value,
                valor_diaria: parseFloat(this.valorDiariaInput.value),
                valor_energia: parseFloat(this.valorEnergiaInput.value) || 0,
                valor_total: valorTotal,
                forma_pagamento: this.formaPagamentoSelect.value
            };

            payload.usuario = this.editingIdInput.value && this.usuarioDespesaEditando
                ? this.usuarioDespesaEditando
                : this.getCurrentUserName();

            const { error } = await supabaseClient.from('despesas').upsert(payload);
            if (error) throw error;

            registrarAuditoria(this.editingIdInput.value ? 'ALTERAR' : 'INCLUIR', 'Despesas', `${this.editingIdInput.value ? 'Alteração' : 'Inclusão'} de despesa`);
            alert('✅ Despesa salva com sucesso!');
            this.clearForm();
            this.renderGrid();
        } catch (err) {
            console.error('Erro ao salvar despesa:', err);
            alert(`❌ Erro ao salvar despesa: ${err.message}`);
            this.btnSubmit.disabled = false;
            this.btnSubmit.innerHTML = originalText;
        } finally {
            if (this.btnSubmit.disabled && this.editingIdInput.value) {
                 this.btnSubmit.disabled = false;
            }
        }
    },

    getSelectedValues(container, checkboxClass) {
        const checkboxes = container.querySelectorAll(`.${checkboxClass}:checked`);
        return Array.from(checkboxes).map(cb => cb.value);
    },

    clearForm() {
        const preservarFixos = !this.editingIdInput.value;
        const camposFixos = preservarFixos ? this.obterCamposFixos() : [];
        const valoresFixos = camposFixos.length ? this.capturarValoresFixos(camposFixos) : {};

        this.form.reset();
        this.editingIdInput.value = '';
        this.btnSubmit.innerHTML = '<i class="fas fa-save"></i> Salvar Despesa';
        this.btnClearForm.innerHTML = '<i class="fas fa-eraser"></i> Limpar';
        this.btnSubmit.disabled = false;
        this.valorTotalInput.value = '';
        this.usuarioDespesaEditando = '';
        this.tipoQuartoSelect.innerHTML = '<option value="">-- Selecione um hotel primeiro --</option>';
        this.tipoQuartoSelect.disabled = true;
        this.btnGerenciarQuartos.disabled = true;
        this.formaPagamentoSelect.value = "";
        
        this.despesaRotaOptions.querySelectorAll('.rota-checkbox').forEach(cb => cb.checked = false);
        this.updateMultiselectText(this.despesaRotaOptions, this.despesaRotaText, 'rota-checkbox');
        
        this.despesaHotelOptions.querySelectorAll('.hotel-checkbox').forEach(cb => cb.checked = false);
        this.updateMultiselectText(this.despesaHotelOptions, this.despesaHotelText, 'hotel-checkbox');

        if (camposFixos.length) {
            this.restaurarValoresFixos(valoresFixos);
        }
    },

    async loadForEditing(id) {
        try {
            const { data: despesa, error } = await supabaseClient
                .from('despesas')
                .select('*, hoteis(nome), funcionario1:id_funcionario1(nome_completo), funcionario2:id_funcionario2(nome_completo)')
                .eq('id', id).single();
            if (error) throw error;

            this.editingIdInput.value = despesa.id;
            this.usuarioDespesaEditando = despesa.usuario || '';

            if (this.filialSelect) {
                this.filialSelect.value = despesa.filial || '';
                this.filialSelect.classList.remove('campo-invalido');
                await this.loadRotasPorFilial(despesa.filial || '');
            }

            const rotas = (despesa.numero_rota || '').split(',').map(s => s.trim());
            this.despesaRotaOptions.querySelectorAll('.rota-checkbox').forEach(cb => {
                cb.checked = rotas.includes(cb.value);
            });
            this.updateMultiselectText(this.despesaRotaOptions, this.despesaRotaText, 'rota-checkbox');

            if (despesa.id_hotel) {
                const hotelCb = this.despesaHotelOptions.querySelector(`.hotel-checkbox[value="${despesa.id_hotel}"]`);
                if (hotelCb) hotelCb.checked = true;
            }
            this.updateMultiselectText(this.despesaHotelOptions, this.despesaHotelText, 'hotel-checkbox');
            if (this.btnGerenciarQuartos) this.btnGerenciarQuartos.disabled = !despesa.id_hotel;

            document.getElementById('despesaFuncionario1Input').value = despesa.funcionario1?.nome_completo || '';
            document.getElementById('despesaFuncionario2Input').value = despesa.funcionario2?.nome_completo || '';
            this.qtdDiariasInput.value = despesa.qtd_diarias;
            document.getElementById('despesaDataReserva').value = despesa.data_reserva;
            document.getElementById('despesaNotaFiscal').value = despesa.nota_fiscal;
            document.getElementById('despesaObservacao').value = despesa.observacao;
            document.getElementById('despesaCheckin').value = despesa.data_checkin;
            document.getElementById('despesaCheckout').value = despesa.data_checkout;
            this.valorDiariaInput.value = despesa.valor_diaria;
            this.valorEnergiaInput.value = despesa.valor_energia || 0;
            this.formaPagamentoSelect.value = despesa.forma_pagamento || "";

            await this.loadTiposQuarto(despesa.id_hotel, despesa.tipo_quarto);

            this.calcularValorTotal();
            this.btnSubmit.innerHTML = '<i class="fas fa-save"></i> Atualizar Despesa';
            this.btnClearForm.innerHTML = '<i class="fas fa-times"></i> Cancelar';
            this.form.scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            console.error('Erro ao carregar despesa para edição:', err);
        }
    },

    async handleTableClick(e) {
        const target = e.target;
        const id = target.closest('button')?.dataset.id;
        
        if (!id) return;

        if (target.closest('.btn-delete')) {
            if (!this.usuarioPodeExcluir()) {
                alert('Seu nivel de acesso nao permite excluir despesas.');
                return;
            }

            if (confirm('Tem certeza que deseja excluir esta despesa?')) {
                try {
                    await supabaseClient.from('despesas').delete().eq('id', id);
                    registrarAuditoria('EXCLUIR', 'Despesas', `Exclusão de despesa ID ${id}`);
                    this.renderGrid();
                } catch (err) {
                    alert('❌ Não foi possível excluir a despesa: ' + err.message);
                }
            }
        } else if (target.closest('.btn-edit')) {
            this.loadForEditing(id);
        }
    },

    handleSort(field) {
        if (this.sortField === field) {
            this.sortAsc = !this.sortAsc;
        } else {
            this.sortField = field;
            this.sortAsc = true;
        }
        this.renderGrid();
    },

    async renderGrid() {
        try {
            const termoFilial = this.searchFilialInput?.value.trim() || '';
            const termoRota = this.searchRotaInput?.value.trim() || '';
            const termoHotel = this.searchHotelInput?.value.trim() || '';
            const termoFuncionario = this.searchFuncionarioInput?.value.trim() || '';
            let query;

            // Consultas que só buscam "id" pra depois intersectar (usadas pelos filtros que
            // precisam de junção com outra tabela: rota/hotel/funcionário). Sem limit(), o
            // Supabase corta silenciosamente em ~1000 linhas — inofensivo pra filtros que batem
            // com poucos registros, mas quebrava a Filial (que agora bate com quase TODA a
            // tabela, ~11 mil linhas): a busca de ids ficava truncada e excluía lançamentos
            // recentes da interseção, fazendo "SP" trazer menos resultados que "Todas".
            // Por isso Filial NÃO passa mais por aqui — é coluna própria de despesas, aplicada
            // direto na query final abaixo, sem precisar de um pré-fetch de ids limitado.
            const LIMITE_BUSCA_IDS = 20000;

            if (termoFilial || termoRota || termoHotel || termoFuncionario) {
                const buscas = [];

                if (termoRota) {
                    buscas.push(
                        supabaseClient.from('despesas').select('id').ilike('numero_rota', `%${termoRota}%`).limit(LIMITE_BUSCA_IDS)
                            .then(({ data, error }) => {
                                if (error) throw error;
                                return new Set((data || []).map(d => d.id));
                            })
                    );
                }

                if (termoHotel) {
                    buscas.push(
                        supabaseClient.from('despesas').select('id, hoteis!inner(id)').ilike('hoteis.nome', `%${termoHotel}%`).limit(LIMITE_BUSCA_IDS)
                            .then(({ data, error }) => {
                                if (error) throw error;
                                return new Set((data || []).map(d => d.id));
                            })
                    );
                }

                if (termoFuncionario) {
                    buscas.push(
                        Promise.all([
                            supabaseClient.from('despesas').select('id, funcionario1:id_funcionario1!inner(id)').ilike('funcionario1.nome_completo', `%${termoFuncionario}%`).limit(LIMITE_BUSCA_IDS),
                            supabaseClient.from('despesas').select('id, funcionario2:id_funcionario2!inner(id)').ilike('funcionario2.nome_completo', `%${termoFuncionario}%`).limit(LIMITE_BUSCA_IDS)
                        ]).then(([res1, res2]) => {
                            if (res1.error) throw res1.error;
                            if (res2.error) throw res2.error;
                            return new Set([
                                ...(res1.data || []).map(d => d.id),
                                ...(res2.data || []).map(d => d.id)
                            ]);
                        })
                    );
                }

                const conjuntos = await Promise.all(buscas);
                // Interseccao: cada filtro preenchido precisa bater (AND entre campos).
                // null (não [] vazio) quando não há nenhuma busca por id — significa "não restringe por id".
                const matchingIds = conjuntos.length
                    ? conjuntos.reduce((acumulado, conjunto) => (
                        acumulado === null ? conjunto : new Set([...acumulado].filter(id => conjunto.has(id)))
                    ), null)
                    : null;

                if (matchingIds && matchingIds.size === 0) {
                    this.tableBody.innerHTML = `<tr><td colspan="9">Nenhum resultado encontrado para os filtros informados.</td></tr>`;
                    this.atualizarContadorHistorico(0);
                    return;
                }

                query = supabaseClient
                    .from('despesas')
                    .select('id, filial, usuario, created_at, numero_rota, tipo_quarto, valor_total, data_checkin, hoteis(nome), funcionario1:id_funcionario1(nome_completo), funcionario2:id_funcionario2(nome_completo)');

                // ilike (não eq) porque lançamentos antigos podiam ter "filial" com variação de
                // espaço/caixa — aplicado direto na query, sem passar pelo pré-fetch de ids acima.
                if (termoFilial) query = query.ilike('filial', `%${termoFilial}%`);
                if (matchingIds) query = query.in('id', Array.from(matchingIds));

            } else {
                query = supabaseClient
                    .from('despesas')
                    .select('id, filial, usuario, created_at, numero_rota, tipo_quarto, valor_total, data_checkin, hoteis(nome), funcionario1:id_funcionario1(nome_completo), funcionario2:id_funcionario2(nome_completo)');
            }

            if (this.sortField === 'hotel.nome') {
                query = query.order('nome', { foreignTable: 'hoteis', ascending: this.sortAsc });
            } else if (this.sortField === 'funcionario1.nome') {
                query = query.order('nome_completo', { foreignTable: 'funcionario1', ascending: this.sortAsc });
            } else {
                query = query.order(this.sortField, { ascending: this.sortAsc });
            }
            // Desempate estável: sem isso, registros com o mesmo valor no campo ordenado (ex:
            // mesma data de check-in, muito comum aqui) podem sair em ordem diferente conforme o
            // filtro aplicado — o Postgres escolhe um plano de execução diferente pra "sem filtro"
            // (varre a tabela toda) e pra "com filtro" (WHERE id IN (...)), e sem uma coluna extra
            // de desempate a ordem entre iguais fica a critério desse plano, não do usuário.
            query = query.order('id', { ascending: true });
            // Mesmo limite generoso da busca de ids acima — sem isso, a listagem sem nenhum
            // filtro (que hoje já passa de 11 mil lançamentos) também ficaria truncada em ~1000
            // pelo padrão do Supabase, escondendo o restante silenciosamente.
            query = query.limit(LIMITE_BUSCA_IDS);

            const { data: despesas, error } = await query;

            this.updateSortIcons();

            if (error) throw error;

            this.atualizarContadorHistorico(despesas.length);

            const podeExcluir = this.usuarioPodeExcluir();
            this.tableBody.innerHTML = despesas.map(d => `
                <tr>
                    <td>${d.filial || '-'}</td>
                    <td>
                        ${d.usuario || '-'}
                        <br><small>${this.formatDateTime(d.created_at)}</small>
                    </td>
                    <td>${d.numero_rota}</td>
                    <td>${d.hoteis?.nome || 'N/A'}</td>
                    <td>${d.tipo_quarto || '-'}</td>
                    <td>
                        ${d.funcionario1?.nome_completo || 'N/A'}
                        ${d.funcionario2?.nome_completo ? `<br><small>${d.funcionario2.nome_completo}</small>` : ''}
                    </td>
                    <td>${(d.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${new Date(d.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>
                        <button class="btn-icon edit btn-edit" data-id="${d.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        ${podeExcluir ? `<button class="btn-icon delete btn-delete" data-id="${d.id}" title="Excluir"><i class="fas fa-trash"></i></button>` : ''}
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Erro ao renderizar grid de despesas:', err);
            this.tableBody.innerHTML = `<tr><td colspan="9">Erro ao carregar dados.</td></tr>`;
            this.atualizarContadorHistorico(0);
        }
    },

    atualizarContadorHistorico(total) {
        if (!this.historicoCount) return;
        this.historicoCount.textContent = `${total} lançamento${total === 1 ? '' : 's'}`;
    },

    updateSortIcons() {
        document.querySelectorAll('th[data-key] i').forEach(icon => {
            icon.className = 'fas fa-sort';
            const th = icon.closest('th');
            if (th.dataset.key === this.sortField) {
                icon.className = this.sortAsc ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    async loadFiliais() {
        // Usuario com filial propria (qualquer nivel) fica travado nela: no formulario (Nova
        // Despesa) e na busca do Historico — igual ao padrao ja usado nas demais paginas.
        const filialUsuario = this.getFilialUsuarioDespesa();

        try {
            const { data, error } = await supabaseClient.from('filiais').select('sigla, nome').order('nome');
            if (error) throw error;

            if (filialUsuario) {
                const filial = (data || []).find(f => String(f.sigla || f.nome || '').trim().toUpperCase() === filialUsuario);
                const value = filial?.sigla || filial?.nome || filialUsuario;
                const label = filial ? (filial.sigla ? `${filial.nome} (${filial.sigla})` : filial.nome) : filialUsuario;

                if (this.filialSelect) {
                    this.filialSelect.innerHTML = '<option value="">Selecione a Filial</option>';
                    this.filialSelect.add(new Option(label, value));
                    this.filialSelect.value = value;
                    this.filialSelect.disabled = true;
                }
                if (this.searchFilialInput) {
                    this.searchFilialInput.innerHTML = '<option value="">Todas as Filiais</option>';
                    this.searchFilialInput.add(new Option(label, value));
                    this.searchFilialInput.value = value;
                    this.searchFilialInput.disabled = true;
                }
                return;
            }

            if (data) {
                data.forEach(f => {
                    const value = f.sigla || f.nome;
                    const label = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                    this.filialSelect?.add(new Option(label, value));
                    this.searchFilialInput?.add(new Option(label, value));
                });
            }
        } catch (err) {
            console.error('Erro ao carregar filiais:', err);
        }
    },

    async loadRotasPorFilial(filial) {
        try {
            let query = supabaseClient.from('rotas').select('numero').order('numero', { ascending: true });
            if (filial) query = query.eq('filial', filial);
            const { data: rotas, error } = await query;
            if (error) throw error;
            this.preencherDropdownRotas(rotas || []);
        } catch (err) {
            console.error('Erro ao carregar rotas:', err);
        }
    },

    preencherDropdownRotas(rotas) {
        if (!this.despesaRotaOptions) return;

        this.despesaRotaOptions.innerHTML = '';

        const stickyContainer = document.createElement('div');
        stickyContainer.style.cssText = 'position: sticky; top: 0; background: white; z-index: 20; border-bottom: 1px solid #eee;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Buscar rota...';
        searchInput.style.cssText = 'width: 100%; padding: 10px; border: none; border-bottom: 1px solid #eee; outline: none; box-sizing: border-box;';
        searchInput.onclick = (e) => e.stopPropagation();
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            this.despesaRotaOptions.querySelectorAll('label.custom-option').forEach(opt => {
                opt.style.display = opt.textContent.toLowerCase().includes(term) ? 'block' : 'none';
            });
        });
        stickyContainer.appendChild(searchInput);

        const btnLimpar = this.criarBotaoLimpar(this.despesaRotaOptions, this.despesaRotaText, 'rota-checkbox', searchInput);
        stickyContainer.appendChild(btnLimpar);
        this.despesaRotaOptions.appendChild(stickyContainer);

        rotas.forEach(r => {
            const label = document.createElement('label');
            label.className = 'custom-option';
            label.innerHTML = `<input type="checkbox" class="rota-checkbox" value="${r.numero}" style="margin-right: 8px;"> ${r.numero}`;
            this.despesaRotaOptions.appendChild(label);
        });

        this.updateMultiselectText(this.despesaRotaOptions, this.despesaRotaText, 'rota-checkbox');
    },

    async loadDatalists() {
        try {
            await this.loadRotasPorFilial(this.filialSelect?.value || '');

            const { data: hoteis, error: hoteisError } = await supabaseClient.from('hoteis').select('id, nome').order('nome', { ascending: true });
            if (hoteisError) throw hoteisError;
            
            if (this.despesaHotelOptions) {
                this.despesaHotelOptions.innerHTML = '';

                const stickyContainer = document.createElement('div');
                stickyContainer.style.cssText = 'position: sticky; top: 0; background: white; z-index: 20; border-bottom: 1px solid #eee;';

                const searchInput = document.createElement('input');
                searchInput.type = 'text';
                searchInput.placeholder = 'Buscar hotel...';
                searchInput.style.cssText = 'width: 100%; padding: 10px; border: none; border-bottom: 1px solid #eee; outline: none; box-sizing: border-box;';
                searchInput.onclick = (e) => e.stopPropagation();
                searchInput.addEventListener('input', (e) => {
                     const term = e.target.value.toLowerCase();
                     const options = this.despesaHotelOptions.querySelectorAll('label.custom-option');
                     options.forEach(opt => {
                         const text = opt.textContent.toLowerCase();
                         opt.style.display = text.includes(term) ? 'block' : 'none';
                     });
                });
                stickyContainer.appendChild(searchInput);

                const btnLimpar = this.criarBotaoLimpar(this.despesaHotelOptions, this.despesaHotelText, 'hotel-checkbox', searchInput);
                stickyContainer.appendChild(btnLimpar);
                
                this.despesaHotelOptions.appendChild(stickyContainer);

                if (hoteis) {
                    hoteis.forEach(h => {
                        const label = document.createElement('label');
                        label.className = 'custom-option';
                        label.innerHTML = `<input type="checkbox" class="hotel-checkbox" value="${h.id}" style="margin-right: 8px;"> ${h.nome}`;
                        this.despesaHotelOptions.appendChild(label);
                    });
                }
            }

            const { data: motoristas, error: motoristasError } = await supabaseClient
                .from('funcionario')
                .select('nome_completo')
                .or('funcao.ilike.%Motorista%,funcao.ilike.%Líder%,funcao.ilike.%Lider%')
                .order('nome_completo', { ascending: true });
            if (motoristasError) throw motoristasError;
            this.funcionarios1List.innerHTML = motoristas.map(f => `<option value="${f.nome_completo}"></option>`).join('');

            const { data: auxiliares, error: auxiliaresError } = await supabaseClient
                .from('funcionario')
                .select('nome_completo')
                .ilike('funcao', '%Auxiliar%')
                .order('nome_completo', { ascending: true });
            if (auxiliaresError) throw auxiliaresError;
            this.funcionarios2List.innerHTML = auxiliares.map(f => `<option value="${f.nome_completo}"></option>`).join('');

        } catch (err) {
            console.error('Erro ao carregar datalists:', err);
            alert('❌ Não foi possível carregar as listas de sugestões. Verifique o console.');
        }
    },

    criarBotaoLimpar(optionsContainer, textSpan, checkboxClass, searchInput) {
        const btnLimpar = document.createElement('div');
        btnLimpar.className = 'custom-option';
        btnLimpar.style.cssText = 'color: #dc3545; font-weight: bold; text-align: center; cursor: pointer;';
        btnLimpar.textContent = 'Limpar Seleção';
        btnLimpar.onclick = (e) => {
            e.stopPropagation();
            optionsContainer.querySelectorAll(`.${checkboxClass}`).forEach(cb => cb.checked = false);
            this.updateMultiselectText(optionsContainer, textSpan, checkboxClass);
            if (searchInput) { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); }
            optionsContainer.dispatchEvent(new Event('change'));
        };
        return btnLimpar;
    },

    handleHotelSelectionChange() {
        const selectedIds = this.getSelectedValues(this.despesaHotelOptions, 'hotel-checkbox');
        
        if (selectedIds.length === 1) {
            this.loadTiposQuarto(selectedIds[0]);
            this.btnGerenciarQuartos.disabled = false;
        } else {
            this.tipoQuartoSelect.innerHTML = '<option value="">Selecione apenas um hotel</option>';
            this.tipoQuartoSelect.disabled = true;
            this.btnGerenciarQuartos.disabled = true;
        }
    },

    async loadTiposQuarto(hotelId, selectedTipo) {
        this.tipoQuartoSelect.disabled = true;
        this.tipoQuartoSelect.innerHTML = '<option value="">Carregando...</option>';
        this.valorNegociadoDisplay.textContent = ''; // Limpa o display do valor negociado

        try {
            const { data: quartos, error: quartosError } = await supabaseClient
                .from('hotel_quartos') // Seleciona o novo campo
                .select('nome_quarto, valor_negociado')
                .eq('id_hotel', hotelId)
                .order('nome_quarto');

            if (quartosError) throw quartosError;

            this.tipoQuartoSelect.innerHTML = '<option value="" disabled selected>-- Selecione o quarto --</option>';
            quartos.forEach(q => {
                const option = new Option(q.nome_quarto, q.nome_quarto);
                option.dataset.valorNegociado = q.valor_negociado || '';
                this.tipoQuartoSelect.add(option);
            });

            if (selectedTipo) this.tipoQuartoSelect.value = selectedTipo;

            // Chama a verificação inicial caso já haja um quarto selecionado (ex: na edição)
            const initialOption = this.tipoQuartoSelect.options[this.tipoQuartoSelect.selectedIndex];
            this.exibirInformativoValorNegociado(initialOption);
            this.tipoQuartoSelect.disabled = false;
        } catch (err) {
            console.error('Erro ao carregar tipos de quarto:', err);
            this.tipoQuartoSelect.innerHTML = '<option value="">Erro ao carregar quartos</option>';
        }
    },

    async abrirModalQuartos() {
        const selectedIds = this.getSelectedValues(this.despesaHotelOptions, 'hotel-checkbox');
        if (selectedIds.length !== 1) {
            alert('Selecione exatamente um hotel para gerenciar quartos.');
            return;
        }
        const hotelId = selectedIds[0];

        try {
            const { data: hotel, error } = await supabaseClient.from('hoteis').select('id, nome').eq('id', hotelId).single();
            if (error || !hotel) throw new Error('Hotel não encontrado.');

            this.currentHotelId = hotel.id;
            this.tituloHotelQuartos.textContent = `Gerenciar Quartos: ${hotel.nome}`;
            this.modalQuartos.classList.remove('hidden');
            this.listarQuartosNoModal();
        } catch (err) {
            console.error(err);
            alert('Erro ao carregar dados do hotel.');
        }
    },

    fecharModalQuartos() {
        this.modalQuartos.classList.add('hidden');
        this.novoTipoQuartoInput.value = '';
        this.editingQuartoId = null;
        this.btnSalvarNovoQuarto.innerHTML = '<i class="fas fa-plus"></i>';
    },

    async listarQuartosNoModal() {
        if (!this.currentHotelId) return;
        this.listaQuartosEdicao.innerHTML = '<li>Carregando...</li>';

        try {
            const { data: quartos, error } = await supabaseClient
                .from('hotel_quartos')
                .select('*')
                .eq('id_hotel', this.currentHotelId)
                .order('nome_quarto');

            if (error) throw error;

            this.listaQuartosEdicao.innerHTML = '';
            if (quartos.length === 0) {
                this.listaQuartosEdicao.innerHTML = '<li>Nenhum quarto cadastrado.</li>';
                return;
            }

            quartos.forEach(q => {
                const valorDisplay = q.valor_negociado ? ` (R$ ${parseFloat(q.valor_negociado).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : '';
                const li = document.createElement('li');
                li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;';
                li.innerHTML = `
                    <span>${q.nome_quarto}${valorDisplay}</span>
                    <div>
                        <button type="button" class="btn-icon edit btn-edit-quarto" data-id="${q.id}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button type="button" class="btn-icon delete btn-delete-quarto" data-id="${q.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </div>
                `;
                this.listaQuartosEdicao.appendChild(li);
            });
        } catch (err) {
            console.error(err);
            this.listaQuartosEdicao.innerHTML = '<li>Erro ao listar quartos.</li>';
        }
    },

async prepararEdicaoQuarto(id) {
        const { data: quarto, error } = await supabaseClient
            .from('hotel_quartos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Erro ao buscar quarto para edição:', error);
            alert('Erro ao carregar dados do quarto.');
            return;
        }

        this.editingQuartoId = id;
        this.novoTipoQuartoInput.value = quarto.nome_quarto;
        this.novoTipoQuartoValorNegociadoInput.value = quarto.valor_negociado || '';
        this.btnSalvarNovoQuarto.innerHTML = '<i class="fas fa-check"></i>';
        this.novoTipoQuartoInput.focus();
    },

    async salvarNovoQuarto() {
        const nomeQuarto = this.novoTipoQuartoInput.value.trim();
        const valorNegociado = parseFloat(this.novoTipoQuartoValorNegociadoInput.value) || null;
        if (!nomeQuarto || !this.currentHotelId) return;

        try {
            if (this.editingQuartoId) {
                const { error } = await supabaseClient.from('hotel_quartos').update({ 
                    nome_quarto: nomeQuarto, 
                    valor_negociado: valorNegociado 
                }).eq('id', this.editingQuartoId);
                if (error) throw error;
                this.editingQuartoId = null;
                this.btnSalvarNovoQuarto.innerHTML = '<i class="fas fa-plus"></i>';
            } else {
                const { error } = await supabaseClient.from('hotel_quartos').insert({ 
                    id_hotel: this.currentHotelId, 
                    nome_quarto: nomeQuarto, 
                    valor_negociado: valorNegociado 
                });
                if (error) throw error;
            }

            this.novoTipoQuartoInput.value = '';
            this.novoTipoQuartoValorNegociadoInput.value = '';
            await this.listarQuartosNoModal();
            this.loadTiposQuarto(this.currentHotelId, nomeQuarto);
        } catch (err) {
            console.error(err);
            alert('Erro ao salvar quarto.');
        }
    },

    async excluirQuarto(id) {
        if (!confirm('Tem certeza que deseja excluir este tipo de quarto?')) return;

        try {
            const { error } = await supabaseClient.from('hotel_quartos').delete().eq('id', id);
            if (error) throw error;

            await this.listarQuartosNoModal();
            this.loadTiposQuarto(this.currentHotelId);
        } catch (err) {
            console.error(err);
            alert('Erro ao excluir quarto.');
        }
    },

    exibirInformativoValorNegociado(option) {
        const negotiatedValue = (option && option.value !== "") ? option.dataset.valorNegociado : null;
        
        if (negotiatedValue && parseFloat(negotiatedValue) > 0) { // Só exibe se houver um valor negociado positivo
            this.valorNegociadoDisplay.textContent = `Valor Negociado: R$ ${parseFloat(negotiatedValue).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            this.valorNegociadoDisplay.style.color = '#006937';
            this.valorNegociadoDisplay.style.fontWeight = 'bold';
        } else {
            // Se não houver valor negociado ou for zero, não exibe nada.
            this.valorNegociadoDisplay.textContent = '';
            this.valorNegociadoDisplay.style.color = '';
            this.valorNegociadoDisplay.style.fontWeight = '';
        }
    },

    checkValorDiariaConflito() {
        const enteredValue = parseFloat(this.valorDiariaInput.value) || 0;
        
        // Verifica se há uma opção selecionada e se ela não é o placeholder desabilitado
        const selectedOption = this.tipoQuartoSelect.options[this.tipoQuartoSelect.selectedIndex];
        const negotiatedValue = (selectedOption && selectedOption.value !== "")
                                ? parseFloat(selectedOption.dataset.valorNegociado) || 0
                                : 0;
        
        // Não alerta se o usuário ainda não digitou um valor (input está vazio ou 0)
        if (enteredValue === 0) {
            this.valorDiariaInput.style.borderColor = '';
            this.valorDiariaInput.style.boxShadow = '';
            return true;
        }

        if (negotiatedValue > 0 && enteredValue !== negotiatedValue) {
            alert(`⚠️ Atenção: O valor da diária informado (R$ ${enteredValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) difere do valor negociado (R$ ${negotiatedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`);
            this.valorDiariaInput.style.borderColor = 'red';
            this.valorDiariaInput.style.boxShadow = '0 0 5px red';
            return false; // Indica que há um conflito
        } else {
            this.valorDiariaInput.style.borderColor = '';
            this.valorDiariaInput.style.boxShadow = '';
            return true; // Indica que não há conflito ou o valor negociado não existe
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    DespesasUI.init();
});
