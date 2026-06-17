import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const CLIENTES_PAGE_ID = 'clientes.html';
const CLIENTE_COLUNAS = [
    ['CÓD', 'codigo'],
    ['FANTASIA', 'fantasia'],
    ['NOME', 'nome'],
    ['FIS/JUR', 'tipo_pessoa'],
    ['UF', 'uf'],
    ['MUNICIPIO', 'municipio'],
    ['ENDEREÇO', 'endereco'],
    ['BAIRRO', 'bairro'],
    ['CEP', 'cep'],
    ['EMAIL', 'email'],
    ['CNPJ/CPF', 'cnpj_cpf'],
    ['IE/RG', 'ie_rg'],
    ['COND PAGTO', 'cond_pagto'],
    ['FORMA COB', 'forma_cob'],
    ['ATIVO', 'ativo'],
    ['SUPERVISOR', 'supervisor'],
    ['ROTA', 'rota'],
    ['CONSULTOR', 'consultor'],
    ['TAB PRÇ', 'tabela_preco'],
    ['CATEGORIA', 'categoria']
];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function normalizeString(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function normalizeHeader(value) {
    return normalizeString(value)
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function cleanCell(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeCodigo(value) {
    const texto = cleanCell(value);
    const digitos = texto.replace(/\D/g, '');
    return digitos || texto;
}

function normalizarRota(value) {
    const texto = cleanCell(value);
    const numero = texto.match(/\d+/)?.[0];
    if (!numero) return texto;
    return numero.replace(/^0+(?=\d)/, '');
}

function getClienteImportKey(cliente) {
    return [
        cliente.codigo,
        normalizeString(cliente.rota)
    ].join('|');
}

function getUsuarioAtual() {
    try {
        return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    } catch {
        return null;
    }
}

const ClientesUI = {
    clientes: [],
    clientesRenderizados: [],
    sortConfig: { column: 'codigo', direction: 'asc' },
    usuarioAtual: null,
    modalMode: 'incluir',
    rotaOriginal: '',

    async init() {
        this.cache();
        const acessoPermitido = await this.verificarPermissaoPagina();
        if (!acessoPermitido) return;
        this.bind();
        await this.carregarClientes();
    },

    cache() {
        this.tableBody = document.getElementById('clientesTableBody');
        this.searchInput = document.getElementById('searchClientesInput');
        this.rotaFilter = document.getElementById('clienteRotaFilter');
        this.ufFilter = document.getElementById('clienteUfFilter');
        this.ativoFilter = document.getElementById('clienteAtivoFilter');
        this.inputImportar = document.getElementById('inputImportarClientes');
        this.btnImportar = document.getElementById('btnImportarClientes');
        this.btnExportar = document.getElementById('btnExportarClientes');
        this.btnOpenClienteModal = document.getElementById('btnOpenClienteModal');
        this.btnCloseClienteModal = document.getElementById('btnCloseClienteModal');
        this.btnClearClienteForm = document.getElementById('btnClearClienteForm');
        this.btnSubmitCliente = document.getElementById('btnSubmitCliente');
        this.modalCliente = document.getElementById('modalCliente');
        this.formCliente = document.getElementById('formCliente');
        this.modalTitle = document.getElementById('clienteModalTitle');
        this.selectAllClientes = document.getElementById('selectAllClientes');
        this.importStatus = document.getElementById('clientesImportStatus');
        this.gridCount = document.getElementById('countClientesGrid');
        this.filterCount = document.getElementById('clientesFilterCount');
    },

    bind() {
        this.btnImportar?.addEventListener('click', () => this.inputImportar?.click());
        this.inputImportar?.addEventListener('change', (event) => this.importarArquivo(event));
        this.btnExportar?.addEventListener('click', () => this.exportarXlsx());
        this.btnOpenClienteModal?.addEventListener('click', () => this.openClienteModal());
        this.btnCloseClienteModal?.addEventListener('click', () => this.closeClienteModal());
        this.btnClearClienteForm?.addEventListener('click', () => this.clearClienteForm({ fecharModal: false }));
        this.formCliente?.addEventListener('submit', (event) => this.handleClienteFormSubmit(event));
        this.modalCliente?.addEventListener('click', (event) => {
            if (event.target === this.modalCliente) this.closeClienteModal();
        });
        this.tableBody?.addEventListener('click', (event) => this.handleGridAction(event));
        this.selectAllClientes?.addEventListener('change', () => this.toggleSelectAllClientes());
        this.searchInput?.addEventListener('input', () => this.renderGrid());
        this.rotaFilter?.addEventListener('change', () => this.renderGrid());
        this.ufFilter?.addEventListener('change', () => this.renderGrid());
        this.ativoFilter?.addEventListener('change', () => this.renderGrid());

        document.querySelectorAll('.cliente-table th[data-sort]').forEach((th) => {
            th.addEventListener('click', () => this.handleSort(th.dataset.sort));
        });
    },

    async verificarPermissaoPagina() {
        this.usuarioAtual = getUsuarioAtual();
        const nivel = String(this.usuarioAtual?.nivel || '').toLowerCase();
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
            if ((data?.paginas_permitidas || []).includes(CLIENTES_PAGE_ID)) return true;
        } catch (error) {
            console.error('Erro ao validar permissão de clientes:', error);
        }

        document.body.innerHTML = '<div style="text-align:center; padding:50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
        return false;
    },

    setStatus(message, erro = false) {
        if (!this.importStatus) return;
        this.importStatus.textContent = message;
        this.importStatus.classList.toggle('erro', erro);
    },

    isAdministrador() {
        return String(this.usuarioAtual?.nivel || '').trim().toLowerCase() === 'administrador';
    },

    async openClienteModal(mode = 'incluir', cliente = null) {
        if (!this.modalCliente) return;
        this.modalMode = mode;
        this.rotaOriginal = cliente?.rota || '';
        this.clearClienteForm({ fecharModal: false });
        if (cliente) this.preencherClienteForm(cliente);
        if (mode === 'incluir') await this.preencherProximoCodigoCliente();
        this.aplicarModoModal(mode);
        this.modalCliente.classList.remove('hidden');
        this.modalCliente.setAttribute('aria-hidden', 'false');
        document.body.classList.add('funcionario-modal-open');
        if (mode !== 'visualizar') document.getElementById('clienteFantasia')?.focus();
    },

    closeClienteModal() {
        if (!this.modalCliente) return;
        this.modalCliente.classList.add('hidden');
        this.modalCliente.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('funcionario-modal-open');
    },

    clearClienteForm(options = {}) {
        const { fecharModal = true } = options;
        this.formCliente?.reset();
        const ativo = document.getElementById('clienteAtivo');
        if (ativo) ativo.value = 'A';
        if (this.btnSubmitCliente) {
            this.btnSubmitCliente.disabled = false;
            this.btnSubmitCliente.innerHTML = '<i class="fas fa-save"></i> Salvar Registro';
            this.btnSubmitCliente.style.display = '';
        }
        if (this.btnClearClienteForm) this.btnClearClienteForm.style.display = '';
        if (fecharModal) this.closeClienteModal();
    },

    async preencherProximoCodigoCliente() {
        const codigoField = document.getElementById('clienteCodigo');
        if (!codigoField) return;
        codigoField.value = 'Calculando...';

        try {
            const proximoCodigo = await this.obterProximoCodigoCliente();
            codigoField.value = proximoCodigo;
        } catch (error) {
            console.error('Erro ao calcular proximo codigo de cliente:', error);
            codigoField.value = '';
            alert('Nao foi possivel calcular o proximo codigo do cliente.');
        }
    },

    async obterProximoCodigoCliente() {
        const maiorLocal = this.clientes.reduce((maior, cliente) => {
            const numero = Number(String(cliente.codigo || '').replace(/\D/g, ''));
            return Number.isFinite(numero) ? Math.max(maior, numero) : maior;
        }, 0);

        let maiorBanco = maiorLocal;
        const { data, error } = await supabaseClient
            .from('clientes')
            .select('codigo')
            .order('codigo', { ascending: false })
            .limit(200);
        if (error) throw error;

        (data || []).forEach((cliente) => {
            const numero = Number(String(cliente.codigo || '').replace(/\D/g, ''));
            if (Number.isFinite(numero)) maiorBanco = Math.max(maiorBanco, numero);
        });

        return String(maiorBanco + 1);
    },

    preencherClienteForm(cliente) {
        const valores = {
            clienteCodigo: cliente.codigo,
            clienteFantasia: cliente.fantasia,
            clienteNome: cliente.nome,
            clienteTipoPessoa: cliente.tipo_pessoa,
            clienteUf: cliente.uf,
            clienteMunicipio: cliente.municipio,
            clienteEndereco: cliente.endereco,
            clienteBairro: cliente.bairro,
            clienteCep: cliente.cep,
            clienteEmail: cliente.email,
            clienteCnpjCpf: cliente.cnpj_cpf,
            clienteIeRg: cliente.ie_rg,
            clienteCondPagto: cliente.cond_pagto,
            clienteFormaCob: cliente.forma_cob,
            clienteAtivo: cliente.ativo || 'A',
            clienteSupervisor: cliente.supervisor,
            clienteRota: cliente.rota,
            clienteConsultor: cliente.consultor,
            clienteTabelaPreco: cliente.tabela_preco,
            clienteCategoria: cliente.categoria
        };

        Object.entries(valores).forEach(([id, value]) => {
            const field = document.getElementById(id);
            if (field) field.value = value ?? '';
        });
    },

    aplicarModoModal(mode) {
        const visualizar = mode === 'visualizar';
        const editar = mode === 'editar';
        const titulo = visualizar ? 'Visualizar Cliente' : editar ? 'Editar Cliente' : 'Incluir Cliente';
        if (this.modalTitle) this.modalTitle.innerHTML = `<i class="fas fa-user"></i> ${titulo}`;

        this.formCliente?.querySelectorAll('input, select').forEach((field) => {
            if (field.name === 'codigo') {
                field.readOnly = true;
                field.disabled = false;
                return;
            }
            if (field.tagName === 'SELECT') {
                field.disabled = visualizar;
            } else {
                field.readOnly = visualizar;
            }
        });

        if (this.btnSubmitCliente) {
            this.btnSubmitCliente.style.display = visualizar ? 'none' : '';
            this.btnSubmitCliente.disabled = false;
            this.btnSubmitCliente.innerHTML = '<i class="fas fa-save"></i> Salvar Registro';
        }
        if (this.btnClearClienteForm) this.btnClearClienteForm.style.display = visualizar ? 'none' : '';
    },

    getClienteFormPayload() {
        const formData = new FormData(this.formCliente);
        const agora = new Date().toISOString();
        const usuario = this.usuarioAtual?.nome || this.usuarioAtual?.email || 'Sistema';
        const cliente = {
            codigo: normalizeCodigo(formData.get('codigo')),
            fantasia: cleanCell(formData.get('fantasia')),
            nome: cleanCell(formData.get('nome')),
            tipo_pessoa: cleanCell(formData.get('tipo_pessoa')).toUpperCase(),
            uf: cleanCell(formData.get('uf')).toUpperCase(),
            municipio: cleanCell(formData.get('municipio')),
            endereco: cleanCell(formData.get('endereco')),
            bairro: cleanCell(formData.get('bairro')),
            cep: cleanCell(formData.get('cep')),
            email: cleanCell(formData.get('email')),
            cnpj_cpf: cleanCell(formData.get('cnpj_cpf')),
            ie_rg: cleanCell(formData.get('ie_rg')),
            cond_pagto: cleanCell(formData.get('cond_pagto')),
            forma_cob: cleanCell(formData.get('forma_cob')),
            ativo: cleanCell(formData.get('ativo')).toUpperCase() || 'A',
            supervisor: cleanCell(formData.get('supervisor')),
            consultor: cleanCell(formData.get('consultor')),
            tabela_preco: cleanCell(formData.get('tabela_preco')),
            categoria: cleanCell(formData.get('categoria')),
            origem_arquivo: 'Cadastro manual',
            importado_em: agora,
            ultima_alteracao_por: usuario,
            updated_at: agora
        };
        const rota = normalizarRota(formData.get('rota'));

        return { cliente, rota, agora, usuario };
    },

    async handleClienteFormSubmit(event) {
        event.preventDefault();
        const { cliente, rota, agora, usuario } = this.getClienteFormPayload();
        if (!cliente.codigo) {
            alert('Informe o codigo do cliente.');
            document.getElementById('clienteCodigo')?.focus();
            return;
        }

        if (this.btnSubmitCliente) {
            this.btnSubmitCliente.disabled = true;
            this.btnSubmitCliente.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        }

        try {
            const { error: clienteError } = await supabaseClient
                .from('clientes')
                .upsert([cliente], { onConflict: 'codigo' });
            if (clienteError) throw clienteError;

            if (rota) {
                const { error: rotaError } = await supabaseClient
                    .from('cliente_rotas')
                    .upsert([{
                        cliente_codigo: cliente.codigo,
                        rota,
                        supervisor: cliente.supervisor,
                        consultor: cliente.consultor,
                        ativo: cliente.ativo,
                        origem_arquivo: cliente.origem_arquivo,
                        importado_em: agora,
                        ultima_alteracao_por: usuario,
                        updated_at: agora
                    }], { onConflict: 'cliente_codigo,rota' });
                if (rotaError) throw rotaError;
            }

            if (this.modalMode === 'editar' && this.rotaOriginal && this.rotaOriginal !== rota) {
                const { error: deleteRotaError } = await supabaseClient
                    .from('cliente_rotas')
                    .delete()
                    .eq('cliente_codigo', cliente.codigo)
                    .eq('rota', this.rotaOriginal);
                if (deleteRotaError) throw deleteRotaError;
            }

            const acao = this.modalMode === 'editar' ? 'ALTERAR' : 'INCLUIR';
            await registrarAuditoria(acao, 'Clientes', `Cadastro manual do cliente ${cliente.codigo}${rota ? ` na rota ${rota}` : ''}`);
            this.setStatus(`Cliente ${cliente.codigo} salvo com sucesso.`);
            this.clearClienteForm();
            await this.carregarClientes();
        } catch (error) {
            console.error('Erro ao salvar cliente:', error);
            alert(`Erro ao salvar cliente: ${error.message || 'verifique os dados e tente novamente.'}`);
            if (this.btnSubmitCliente) {
                this.btnSubmitCliente.disabled = false;
                this.btnSubmitCliente.innerHTML = '<i class="fas fa-save"></i> Salvar Registro';
            }
        }
    },

    async carregarClientes() {
        if (this.tableBody) {
            this.tableBody.innerHTML = '<tr><td colspan="13" class="clientes-empty">Carregando clientes...</td></tr>';
        }

        try {
            this.clientes = await this.buscarClientesComRotas();
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            if (this.tableBody) {
                this.tableBody.innerHTML = '<tr><td colspan="13" class="clientes-empty">Erro ao carregar clientes.</td></tr>';
            }
            return;
        }

        this.atualizarFiltrosSelect();
        this.renderGrid();
    },

    async buscarTodosClientes() {
        const todos = [];
        const tamanhoPagina = 1000;

        for (let inicio = 0; ; inicio += tamanhoPagina) {
            const { data, error } = await supabaseClient
                .from('clientes')
                .select('*')
                .order('codigo', { ascending: true })
                .range(inicio, inicio + tamanhoPagina - 1);
            if (error) throw error;
            todos.push(...(data || []));
            if (!data || data.length < tamanhoPagina) break;
        }

        return todos;
    },

    async buscarTodasRotasClientes() {
        const todas = [];
        const tamanhoPagina = 1000;

        for (let inicio = 0; ; inicio += tamanhoPagina) {
            const { data, error } = await supabaseClient
                .from('cliente_rotas')
                .select('*')
                .order('cliente_codigo', { ascending: true })
                .range(inicio, inicio + tamanhoPagina - 1);
            if (error) throw error;
            todas.push(...(data || []));
            if (!data || data.length < tamanhoPagina) break;
        }

        return todas;
    },

    async buscarClientesComRotas() {
        const [clientes, rotas] = await Promise.all([
            this.buscarTodosClientes(),
            this.buscarTodasRotasClientes()
        ]);
        const rotasPorCliente = rotas.reduce((mapa, rota) => {
            if (!mapa.has(rota.cliente_codigo)) mapa.set(rota.cliente_codigo, []);
            mapa.get(rota.cliente_codigo).push(rota);
            return mapa;
        }, new Map());

        return clientes.flatMap((cliente) => {
            const rotasCliente = rotasPorCliente.get(cliente.codigo) || [];
            if (!rotasCliente.length) return [{ ...cliente, rota: '' }];
            return rotasCliente.map((rota) => ({
                ...cliente,
                rota: rota.rota || '',
                supervisor: rota.supervisor || cliente.supervisor || '',
                consultor: rota.consultor || cliente.consultor || '',
                ativo: rota.ativo || cliente.ativo || ''
            }));
        });
    },

    atualizarFiltrosSelect() {
        this.atualizarFiltroUf();
        this.atualizarFiltroRota();
    },

    atualizarFiltroUf() {
        if (!this.ufFilter) return;
        const valorAtual = this.ufFilter.value;
        const ufs = [...new Set(this.clientes.map((cliente) => cleanCell(cliente.uf)).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
        this.ufFilter.innerHTML = '<option value="">Todas</option>' + ufs
            .map((uf) => `<option value="${escapeHtml(uf)}">${escapeHtml(uf)}</option>`)
            .join('');
        if (ufs.includes(valorAtual)) this.ufFilter.value = valorAtual;
    },

    atualizarFiltroRota() {
        if (!this.rotaFilter) return;
        const valorAtual = this.rotaFilter.value;
        const rotas = [...new Set(this.clientes.map((cliente) => cleanCell(cliente.rota)).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
        this.rotaFilter.innerHTML = '<option value="">Todas</option>' + rotas
            .map((rota) => `<option value="${escapeHtml(rota)}">${escapeHtml(rota)}</option>`)
            .join('');
        if (rotas.includes(valorAtual)) this.rotaFilter.value = valorAtual;
    },

    getClientesFiltrados() {
        const termo = normalizeString(this.searchInput?.value || '');
        const rota = this.rotaFilter?.value || '';
        const uf = this.ufFilter?.value || '';
        const ativo = this.ativoFilter?.value || '';

        return this.clientes.filter((cliente) => {
            const rotaOk = !rota || cliente.rota === rota;
            const ufOk = !uf || cliente.uf === uf;
            const ativoOk = !ativo || cliente.ativo === ativo;
            const buscaOk = !termo || [
                cliente.codigo,
                cliente.fantasia,
                cliente.nome,
                cliente.cnpj_cpf,
                cliente.municipio,
                cliente.supervisor,
                cliente.rota,
                cliente.consultor,
                cliente.categoria
            ].some((value) => normalizeString(value).includes(termo));
            return rotaOk && ufOk && ativoOk && buscaOk;
        });
    },

    getClientesOrdenados() {
        const direction = this.sortConfig.direction === 'desc' ? -1 : 1;
        const column = this.sortConfig.column || 'codigo';
        return [...this.getClientesFiltrados()].sort((a, b) => {
            if (column === 'codigo') {
                const numA = Number(a.codigo);
                const numB = Number(b.codigo);
                if (Number.isFinite(numA) && Number.isFinite(numB)) return (numA - numB) * direction;
            }
            return String(a[column] || '').localeCompare(String(b[column] || ''), 'pt-BR', { sensitivity: 'base' }) * direction;
        });
    },

    renderGrid() {
        if (!this.tableBody) return;
        const dados = this.getClientesOrdenados();

        document.querySelectorAll('.cliente-table th[data-sort] i').forEach((icon) => {
            const th = icon.closest('th[data-sort]');
            const ativo = th?.dataset.sort === this.sortConfig.column;
            icon.className = ativo
                ? (this.sortConfig.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down')
                : 'fas fa-sort';
        });

        const dadosExibidos = dados.slice(0, 2000);
        if (this.gridCount) this.gridCount.textContent = `(${this.clientes.length.toLocaleString('pt-BR')})`;
        if (this.filterCount) {
            this.filterCount.textContent = dados.length > dadosExibidos.length
                ? `Quantidade listada: exibindo ${dadosExibidos.length.toLocaleString('pt-BR')} de ${dados.length.toLocaleString('pt-BR')}`
                : `Quantidade listada: ${dados.length.toLocaleString('pt-BR')}`;
        }

        if (!dados.length) {
            this.clientesRenderizados = [];
            this.tableBody.innerHTML = '<tr><td colspan="13" class="clientes-empty">Nenhum cliente encontrado.</td></tr>';
            return;
        }

        this.clientesRenderizados = dadosExibidos;
        if (this.selectAllClientes) this.selectAllClientes.checked = false;
        this.tableBody.innerHTML = dadosExibidos.map((cliente, index) => {
            const statusAtivo = String(cliente.ativo || '').toUpperCase() === 'A';
            const botaoExcluir = this.isAdministrador()
                ? `<button type="button" class="cliente-action-btn delete" data-action="excluir" data-index="${index}" title="Excluir"><i class="fas fa-trash"></i></button>`
                : '';
            return `
                <tr data-index="${index}">
                    <td class="cliente-select-col"><input type="checkbox" class="cliente-row-select" data-index="${index}" aria-label="Selecionar cliente ${escapeHtml(cliente.codigo)}"></td>
                    <td>${escapeHtml(cliente.codigo)}</td>
                    <td>${escapeHtml(cliente.fantasia)}</td>
                    <td>${escapeHtml(cliente.nome)}</td>
                    <td>${escapeHtml(cliente.uf)}</td>
                    <td>${escapeHtml(cliente.municipio)}</td>
                    <td>${escapeHtml(cliente.cnpj_cpf)}</td>
                    <td><span class="cliente-status ${statusAtivo ? 'ativo' : 'inativo'}">${escapeHtml(cliente.ativo || '-')}</span></td>
                    <td>${escapeHtml(cliente.supervisor)}</td>
                    <td>${escapeHtml(cliente.rota)}</td>
                    <td>${escapeHtml(cliente.consultor)}</td>
                    <td>${escapeHtml(cliente.categoria)}</td>
                    <td class="cliente-acoes-col">
                        <div class="cliente-acoes">
                            <button type="button" class="cliente-action-btn view" data-action="visualizar" data-index="${index}" title="Visualizar"><i class="fas fa-eye"></i></button>
                            <button type="button" class="cliente-action-btn edit" data-action="editar" data-index="${index}" title="Editar"><i class="fas fa-pen"></i></button>
                            ${botaoExcluir}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    handleGridAction(event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const cliente = this.clientesRenderizados[Number(button.dataset.index)];
        if (!cliente) return;

        if (button.dataset.action === 'visualizar') {
            this.openClienteModal('visualizar', cliente);
            return;
        }

        if (button.dataset.action === 'editar') {
            this.openClienteModal('editar', cliente);
            return;
        }

        if (button.dataset.action === 'excluir') {
            this.excluirClienteGrid(cliente);
        }
    },

    toggleSelectAllClientes() {
        const checked = Boolean(this.selectAllClientes?.checked);
        this.tableBody?.querySelectorAll('.cliente-row-select').forEach((checkbox) => {
            checkbox.checked = checked;
        });
    },

    async excluirClienteGrid(cliente) {
        if (!this.isAdministrador()) return;
        const alvo = cliente.rota ? `a rota ${cliente.rota} do cliente ${cliente.codigo}` : `o cliente ${cliente.codigo}`;
        if (!confirm(`Confirma excluir ${alvo}?`)) return;

        try {
            if (cliente.rota) {
                const { error } = await supabaseClient
                    .from('cliente_rotas')
                    .delete()
                    .eq('cliente_codigo', cliente.codigo)
                    .eq('rota', cliente.rota);
                if (error) throw error;
            } else {
                const { error } = await supabaseClient
                    .from('clientes')
                    .delete()
                    .eq('codigo', cliente.codigo);
                if (error) throw error;
            }

            await registrarAuditoria('EXCLUIR', 'Clientes', `Exclusao de ${alvo}`);
            this.setStatus(`${alvo} excluido com sucesso.`);
            await this.carregarClientes();
        } catch (error) {
            console.error('Erro ao excluir cliente:', error);
            alert(`Erro ao excluir: ${error.message || 'tente novamente.'}`);
        }
    },

    handleSort(column) {
        if (!column) return;
        this.sortConfig.direction = this.sortConfig.column === column && this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        this.sortConfig.column = column;
        this.renderGrid();
    },

    async importarArquivo(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (typeof window.XLSX === 'undefined') {
            this.setStatus('Biblioteca XLSX não carregada. Atualize a página e tente novamente.', true);
            return;
        }

        this.setStatus(`Lendo ${file.name}...`);
        try {
            const rows = await this.lerPlanilha(file);
            const { clientes, rotas, duplicados } = this.mapearClientes(rows, file.name);
            if (!clientes.length) throw new Error('Nenhum cliente válido encontrado. Verifique a coluna CÓD.');

            const avisoDuplicados = duplicados > 0
                ? ` (${duplicados.toLocaleString('pt-BR')} linhas repetidas com mesmo código/rota ignoradas)`
                : '';
            this.setStatus(`Importando ${clientes.length.toLocaleString('pt-BR')} clientes${avisoDuplicados}...`);
            await this.salvarClientesEmLotes(clientes, rotas);
            await registrarAuditoria('IMPORTAR', 'Clientes', `Importação de ${clientes.length} clientes e ${rotas.length} rotas pelo arquivo ${file.name}`);
            this.setStatus(`Importação concluída: ${clientes.length.toLocaleString('pt-BR')} clientes e ${rotas.length.toLocaleString('pt-BR')} rotas atualizados.`);
            await this.carregarClientes();
        } catch (error) {
            console.error('Erro ao importar clientes:', error);
            this.setStatus(error?.message || 'Erro ao importar clientes.', true);
        } finally {
            event.target.value = '';
        }
    },

    lerPlanilha(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const workbook = window.XLSX.read(reader.result, { type: 'array', cellDates: false });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
                    resolve(rows);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    },

    mapearClientes(rows, fileName) {
        const linhas = (rows || []).filter((row) => row.some((cell) => cleanCell(cell)));
        if (linhas.length < 2) return { clientes: [], rotas: [], duplicados: 0 };

        const headers = linhas[0].map(normalizeHeader);
        const indices = new Map(headers.map((header, index) => [header, index]));
        const agora = new Date().toISOString();
        const usuario = this.usuarioAtual?.nome || this.usuarioAtual?.email || 'Sistema';

        const clientesPorCodigo = new Map();
        const rotasPorChave = new Map();

        linhas.slice(1).forEach((row) => {
            const cliente = {};
            CLIENTE_COLUNAS.forEach(([header, field]) => {
                const index = indices.get(normalizeHeader(header));
                cliente[field] = index === undefined ? '' : cleanCell(row[index]);
            });
            cliente.codigo = normalizeCodigo(cliente.codigo);
            cliente.tipo_pessoa = cliente.tipo_pessoa.toUpperCase();
            cliente.uf = cliente.uf.toUpperCase();
            cliente.ativo = cliente.ativo.toUpperCase();
            cliente.rota = normalizarRota(cliente.rota);
            cliente.origem_arquivo = fileName;
            cliente.importado_em = agora;
            cliente.ultima_alteracao_por = usuario;
            cliente.updated_at = agora;
            if (!cliente.codigo) return;

            const { rota, ...clientePayload } = cliente;
            clientesPorCodigo.set(cliente.codigo, clientePayload);
            rotasPorChave.set(getClienteImportKey(cliente), {
                cliente_codigo: cliente.codigo,
                rota: rota || '',
                supervisor: cliente.supervisor,
                consultor: cliente.consultor,
                ativo: cliente.ativo,
                origem_arquivo: fileName,
                importado_em: agora,
                ultima_alteracao_por: usuario,
                updated_at: agora
            });
        });

        return {
            clientes: [...clientesPorCodigo.values()],
            rotas: [...rotasPorChave.values()],
            duplicados: Math.max(0, linhas.length - 1 - rotasPorChave.size)
        };
    },

    async salvarClientesEmLotes(clientes, rotas) {
        const tamanhoLote = 500;
        for (let inicio = 0; inicio < clientes.length; inicio += tamanhoLote) {
            const lote = clientes.slice(inicio, inicio + tamanhoLote);
            const { error } = await supabaseClient
                .from('clientes')
                .upsert(lote, { onConflict: 'codigo' });
            if (error) throw error;
            this.setStatus(`Importando clientes... ${Math.min(inicio + lote.length, clientes.length).toLocaleString('pt-BR')} de ${clientes.length.toLocaleString('pt-BR')}`);
        }

        for (let inicio = 0; inicio < rotas.length; inicio += tamanhoLote) {
            const lote = rotas.slice(inicio, inicio + tamanhoLote);
            const { error } = await supabaseClient
                .from('cliente_rotas')
                .upsert(lote, { onConflict: 'cliente_codigo,rota' });
            if (error) throw error;
            this.setStatus(`Importando rotas... ${Math.min(inicio + lote.length, rotas.length).toLocaleString('pt-BR')} de ${rotas.length.toLocaleString('pt-BR')}`);
        }
    },

    exportarXlsx() {
        if (typeof window.XLSX === 'undefined') {
            this.setStatus('Biblioteca XLSX não carregada. Atualize a página e tente novamente.', true);
            return;
        }

        const dados = this.getClientesOrdenados().map((cliente) => ({
            'CÓD': cliente.codigo,
            'FANTASIA': cliente.fantasia,
            'NOME': cliente.nome,
            'FIS/JUR': cliente.tipo_pessoa,
            'UF': cliente.uf,
            'MUNICIPIO': cliente.municipio,
            'ENDEREÇO': cliente.endereco,
            'BAIRRO': cliente.bairro,
            'CEP': cliente.cep,
            'EMAIL': cliente.email,
            'CNPJ/CPF': cliente.cnpj_cpf,
            'IE/RG': cliente.ie_rg,
            'COND PAGTO': cliente.cond_pagto,
            'FORMA COB': cliente.forma_cob,
            'ATIVO': cliente.ativo,
            'SUPERVISOR': cliente.supervisor,
            'ROTA': cliente.rota,
            'CONSULTOR': cliente.consultor,
            'TAB PRÇ': cliente.tabela_preco,
            'CATEGORIA': cliente.categoria
        }));

        const worksheet = window.XLSX.utils.json_to_sheet(dados);
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, 'CLIENTES');
        window.XLSX.writeFile(workbook, `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
};

document.addEventListener('DOMContentLoaded', () => ClientesUI.init());
