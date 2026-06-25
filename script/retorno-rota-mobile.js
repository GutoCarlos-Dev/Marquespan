import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

const TIMEZONE_SAO_PAULO = 'America/Sao_Paulo';

function getDataHoraPartesSaoPaulo(date = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: TIMEZONE_SAO_PAULO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
}

function getDataSaoPaulo(date = new Date()) {
    const partes = getDataHoraPartesSaoPaulo(date);
    return `${partes.year}-${partes.month}-${partes.day}`;
}

function getHoraSaoPaulo(date = new Date()) {
    const partes = getDataHoraPartesSaoPaulo(date);
    return `${partes.hour}:${partes.minute}:${partes.second}`;
}

let allData = []; // Cache dos dados do dia
let currentItem = null; // Item sendo editado no modal
let supervisoresCache = []; // Cache para a lista de supervisores
let motoristasCache = []; // Cache para a lista de motoristas
let placasCache = []; // Cache para as placas cadastradas
let rotasCache = []; // Cache para as rotas cadastradas
let retornoSnapshotInicial = null;
let filtroStatusMobile = 'todos';

function normalizeBooleanFlag(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

function hasTeamMemberName(value) {
    return String(value || '').trim() !== '';
}

function toUpperText(value) {
    return String(value || '').trim().toUpperCase();
}

function splitObsLegadoDevolucoes(value) {
    const DEVOLUCOES_EXTRAS_START = '[DEVOLUCOES_EXTRAS]';
    const DEVOLUCOES_EXTRAS_END = '[/DEVOLUCOES_EXTRAS]';
    const text = String(value || '');
    const startIndex = text.indexOf(DEVOLUCOES_EXTRAS_START);

    if (startIndex === -1) {
        return { obsGeral: text.trim(), extras: '' };
    }

    const extrasStart = startIndex + DEVOLUCOES_EXTRAS_START.length;
    const endIndex = text.indexOf(DEVOLUCOES_EXTRAS_END, extrasStart);

    return {
        obsGeral: text.slice(0, startIndex).trim(),
        extras: (endIndex === -1 ? text.slice(extrasStart) : text.slice(extrasStart, endIndex)).trim()
    };
}

function getObsGeral(rowData) {
    return splitObsLegadoDevolucoes(typeof rowData === 'object' ? rowData?.obs : rowData).obsGeral;
}

function getDevolucoesExtras(rowData) {
    const extras = parseDevolucoesExtras(rowData);
    return extras.map((item, index) => formatClienteExtra(item, index)).join('\n\n');
}

function parseDevolucoesExtras(rowData) {
    if (rowData && typeof rowData === 'object' && rowData.devolucoes_extras) {
        try {
            const parsed = JSON.parse(rowData.devolucoes_extras);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            return [{ obs_nf_dev: String(rowData.devolucoes_extras).trim() }];
        }
    }

    const legado = splitObsLegadoDevolucoes(typeof rowData === 'object' ? rowData?.obs : rowData).extras;
    return legado ? [{ obs_nf_dev: legado }] : [];
}

function formatClienteExtra(item, index) {
    return [
        `Cliente ${index + 5}: ${item.cliente || 'N/A'}`,
        `NF: ${item.nf_dev || 'N/A'}`,
        `Frances Diurno: ${item.frances_diurno || '0'}`,
        `Frances Noturno: ${item.frances_noturno || '0'}`,
        `Variedades: ${item.variedades || 'N/A'}`,
        `Motivo: ${item.motivo || 'N/A'}`,
        `Obs: ${item.obs_nf_dev || 'N/A'}`
    ].join('\n');
}

function criarHtmlClienteExtra(index, data = {}) {
    return `
        <h4>Detalhes do Cliente ${index + 5}</h4>
        <div class="form-grid-2-cols">
            <div class="form-group">
                <label>Cliente</label>
                <input type="text" class="glass-input input-uppercase" data-extra-field="cliente" value="${data.cliente || ''}">
            </div>
            <div class="form-group">
                <label>NF Devolvida</label>
                <input type="text" class="glass-input" data-extra-field="nf_dev" value="${data.nf_dev || ''}">
            </div>
            <div class="form-group">
                <label>Frances Diurno</label>
                <input type="number" class="glass-input" data-extra-field="frances_diurno" value="${data.frances_diurno || ''}">
            </div>
            <div class="form-group">
                <label>Frances Noturno</label>
                <input type="number" class="glass-input" data-extra-field="frances_noturno" value="${data.frances_noturno || ''}">
            </div>
            <div class="form-group">
                <label>Variedades</label>
                <input type="text" class="glass-input input-uppercase" data-extra-field="variedades" value="${data.variedades || ''}" placeholder="Texto livre...">
            </div>
            <div class="form-group">
                <label>Motivo</label>
                <select class="glass-input" data-extra-field="motivo">
                    <option value="" ${!data.motivo ? 'selected' : ''}>Selecione</option>
                    <option value="AVARIA" ${data.motivo === 'AVARIA' ? 'selected' : ''}>AVARIA</option>
                    <option value="DEVOLUCAO" ${data.motivo === 'DEVOLUCAO' ? 'selected' : ''}>DEVOLUCAO</option>
                    <option value="FALTOU TEMPO HABIL" ${data.motivo === 'FALTOU TEMPO HABIL' ? 'selected' : ''}>FALTOU TEMPO HABIL</option>
                    <option value="PRODUTO INVERTIDO" ${data.motivo === 'PRODUTO INVERTIDO' ? 'selected' : ''}>PRODUTO INVERTIDO</option>
                    <option value="SOBROU CARGA" ${data.motivo === 'SOBROU CARGA' ? 'selected' : ''}>SOBROU CARGA</option>
                    <option value="TROCA" ${data.motivo === 'TROCA' ? 'selected' : ''}>TROCA</option>
                </select>
            </div>
            <div class="form-group form-group-full">
                <label>Obs. NF Devolvida</label>
                <input type="text" class="glass-input input-uppercase" data-extra-field="obs_nf_dev" value="${data.obs_nf_dev || ''}">
            </div>
        </div>
        <button type="button" class="btn-remover-cliente-extra">Remover cliente</button>
    `;
}

function setupDevolucoesTabHandlers(modal) {
    modal.querySelectorAll('.tab-link[data-tab]').forEach(button => {
        button.onclick = (e) => {
            modal.querySelectorAll('.tab-link[data-tab], .tab-content').forEach(el => el.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.getElementById(e.currentTarget.dataset.tab).classList.add('active');
        };
    });
}

function setupUppercaseInputs(modal) {
    modal.querySelectorAll('.input-uppercase').forEach(input => {
        input.oninput = () => {
            input.value = input.value.toUpperCase();
        };
    });
}

function renumerarClientesExtrasModal(modal) {
    const extraTabs = Array.from(modal.querySelectorAll('.tab-link[data-tab^="tab-cliente-extra-"]'));
    const extraContents = Array.from(modal.querySelectorAll('#clientesExtrasTabs .tab-content[data-extra-index]'));

    extraTabs.forEach((button, index) => {
        const numeroCliente = index + 5;
        const tabId = `tab-cliente-extra-${numeroCliente}`;
        const content = extraContents[index];

        button.dataset.tab = tabId;
        button.textContent = `Cliente ${numeroCliente}`;

        if (content) {
            content.id = tabId;
            content.dataset.extraIndex = String(index);
            const title = content.querySelector('h4');
            if (title) title.textContent = `Detalhes do Cliente ${numeroCliente}`;
        }
    });

    modal.dataset.nextExtraClient = String(extraTabs.length + 5);
    setupDevolucoesTabHandlers(modal);
}

function adicionarClienteExtraModal(modal, data = {}) {
    const container = document.getElementById('clientesExtrasTabs');
    const addButton = document.getElementById('btnAdicionarClienteExtra');
    const numeroCliente = parseInt(modal.dataset.nextExtraClient || '5', 10);
    modal.dataset.nextExtraClient = String(numeroCliente + 1);
    const index = numeroCliente - 5;
    const tabId = `tab-cliente-extra-${numeroCliente}`;

    const tabButton = document.createElement('button');
    tabButton.type = 'button';
    tabButton.className = 'tab-link';
    tabButton.dataset.tab = tabId;
    tabButton.textContent = `Cliente ${numeroCliente}`;
    addButton.before(tabButton);

    const tabContent = document.createElement('div');
    tabContent.id = tabId;
    tabContent.className = 'tab-content';
    tabContent.dataset.extraIndex = String(index);
    tabContent.innerHTML = criarHtmlClienteExtra(index, data);
    container.appendChild(tabContent);

    tabContent.querySelector('.btn-remover-cliente-extra').addEventListener('click', () => {
        const removedIndex = Array.from(container.querySelectorAll('.tab-content[data-extra-index]')).indexOf(tabContent);
        tabButton.remove();
        tabContent.remove();
        renumerarClientesExtrasModal(modal);

        const remainingExtraTabs = Array.from(modal.querySelectorAll('.tab-link[data-tab^="tab-cliente-extra-"]'));
        const nextTab = remainingExtraTabs[Math.min(removedIndex, remainingExtraTabs.length - 1)];
        (nextTab || modal.querySelector('.tab-link[data-tab="tab-cliente-4"]'))?.click();
    });

    setupDevolucoesTabHandlers(modal);
    setupUppercaseInputs(modal);
    tabButton.click();
}

function renderClientesExtrasModal(modal, rowData) {
    document.querySelectorAll('.tab-link[data-tab^="tab-cliente-extra-"]').forEach(button => button.remove());
    document.getElementById('clientesExtrasTabs').innerHTML = '';
    modal.dataset.nextExtraClient = '5';
    parseDevolucoesExtras(rowData).forEach(item => adicionarClienteExtraModal(modal, item));

    const addButton = document.getElementById('btnAdicionarClienteExtra');
    if (addButton) {
        addButton.onclick = () => adicionarClienteExtraModal(modal);
    }
}

function serializeClientesExtrasModal(modal) {
    const extras = Array.from(modal.querySelectorAll('#clientesExtrasTabs .tab-content[data-extra-index]')).map(tab => {
        const item = {};
        tab.querySelectorAll('[data-extra-field]').forEach(input => {
            const field = input.dataset.extraField;
            item[field] = ['cliente', 'variedades', 'obs_nf_dev'].includes(field)
                ? toUpperText(input.value)
                : input.value.trim();
        });
        return item;
    }).filter(item => Object.values(item).some(Boolean));

    return extras.length ? JSON.stringify(extras) : null;
}

function getDevolucoesExtrasPayload(rowData) {
    const extras = parseDevolucoesExtras(rowData);
    return extras.length ? JSON.stringify(extras) : null;
}

function getCurrentUserName() {
    const usuario = getCurrentUser();
    return usuario ? usuario.nome : null;
}

function getCurrentUserFilial() {
    const usuario = getCurrentUser();
    return usuario ? (usuario.filial || null) : null;
}

function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    } catch {
        return null;
    }
}

async function sincronizarUsuarioLogado() {
    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError || !session?.user?.id) return getCurrentUser();

        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('id, auth_user_id, nome, nomecompleto, email, nivel, filial, status')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();

        if (error || !data) return getCurrentUser();

        const usuarioAtual = getCurrentUser() || {};
        const usuarioSincronizado = {
            ...usuarioAtual,
            ...data,
            nome: data.nomecompleto || data.nome || usuarioAtual.nome
        };

        localStorage.setItem('usuarioLogado', JSON.stringify(usuarioSincronizado));
        return usuarioSincronizado;
    } catch (error) {
        console.warn('Nao foi possivel sincronizar os dados do usuario logado.', error);
        return getCurrentUser();
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizarValorSnapshot(value) {
    return value === undefined || value === null ? '' : String(value);
}

function getValorCampo(id) {
    return normalizarValorSnapshot(document.getElementById(id)?.value);
}

function coletarSnapshotRetorno() {
    if (!currentItem) return null;

    const snapshot = {
        placa: getValorCampo('modalPlaca').trim().toUpperCase(),
        rota: getValorCampo('modalRota').trim(),
        nome_mot: getValorCampo('modalMotorista'),
        hora_mot: getValorCampo('modalHoraMotorista'),
        obs: getValorCampo('modalObs'),
        devolucoes_extras: getDevolucoesExtras(currentItem),
        carrinhos: getValorCampo('matCarrinhos'),
        obs_carrinhos: getValorCampo('matObsCarrinhos'),
        matTemPaletes: getValorCampo('matTemPaletes'),
        madeira_qtd: getValorCampo('matMadeira'),
        plastico_qtd: getValorCampo('matPlastico'),
        caixa_branca_qtd: getValorCampo('matCaixaBranca'),
        retorno_pecas: getValorCampo('matRetornoPecas'),
        nome_supervisor: getValorCampo('matSupervisorPecas'),
        pecas_desc: getValorCampo('matDescPecas'),
        supervisor_ciente: normalizeBooleanFlag(currentItem.supervisor_ciente) ? '1' : '0',
        supervisor_devolucao: normalizarValorSnapshot(currentItem.nome_supervisor)
    };

    for (let i = 1; i <= 4; i++) {
        ['cliente', 'nf_dev', 'frances_diurno', 'frances_noturno', 'variedades', 'motivo', 'obs_nf_dev'].forEach(prefixo => {
            const campo = `${prefixo}${i}`;
            snapshot[campo] = normalizarValorSnapshot(currentItem[campo]);
        });
    }

    return JSON.stringify(snapshot);
}

function atualizarSnapshotRetorno() {
    retornoSnapshotInicial = coletarSnapshotRetorno();
}

function retornoTemAlteracoesPendentes() {
    return Boolean(retornoSnapshotInicial && coletarSnapshotRetorno() !== retornoSnapshotInicial);
}

function tentarFecharModalRetorno() {
    if (retornoTemAlteracoesPendentes()) {
        alert('Existem alterações não salvas. Clique em "Salvar" antes de fechar o retorno.');
        return false;
    }

    document.getElementById('modalRetorno')?.classList.add('hidden');
    currentItem = null;
    retornoSnapshotInicial = null;
    return true;
}

function devolucoesModalTemAlteracoesLocais() {
    const modal = document.getElementById('modalDevolucoes');
    if (!currentItem || !modal || modal.classList.contains('hidden')) return false;

    const supervisorCienteAtual = normalizeBooleanFlag(currentItem.supervisor_ciente) ? '1' : '0';
    const supervisorCienteModal = document.getElementById('supervisorCienteDevolucao')?.value === 'true' ? '1' : '0';
    if (supervisorCienteAtual !== supervisorCienteModal) {
        return true;
    }

    if (normalizarValorSnapshot(currentItem.nome_supervisor) !== getValorCampo('nomeSupervisorDevolucao')) {
        return true;
    }

    if (normalizarValorSnapshot(currentItem.devolucoes_extras) !== normalizarValorSnapshot(serializeClientesExtrasModal(modal))) {
        return true;
    }

    let alterado = false;
    modal.querySelectorAll('.tab-content input, .tab-content select').forEach(input => {
        const field = input.dataset.field;
        if (field && normalizarValorSnapshot(currentItem[field]) !== normalizarValorSnapshot(input.value)) {
            alterado = true;
        }
    });

    return alterado;
}

function tentarFecharModalDevolucoes() {
    if (devolucoesModalTemAlteracoesLocais()) {
        alert('Existem devoluções alteradas. Clique em "Salvar e Fechar" antes de sair desta tela.');
        return false;
    }

    document.getElementById('modalDevolucoes')?.classList.add('hidden');
    return true;
}

async function carregarSupervisores() {
    try {
        const { data, error } = await supabaseClient
            .from('rotas')
            .select('supervisor');
        if (error) throw error;
        // Pega nomes únicos, remove nulos/vazios e ordena
        supervisoresCache = [...new Set(data.map(item => item.supervisor).filter(Boolean))].sort();
    } catch (err) {
        console.error('Erro ao carregar supervisores:', err);
    }
}

async function carregarMotoristas() {
    try {
        let query = supabaseClient
            .from('funcionario')
            .select('nome')
            .eq('funcao', 'Motorista')
            .eq('status', 'Ativo');

        const filialUsuario = getCurrentUserFilial();
        if (filialUsuario) query = query.eq('filial', filialUsuario);

        const { data, error } = await query;

        if (error) throw error;
        motoristasCache = data.map(item => item.nome).filter(Boolean).sort();
    } catch (err) {
        console.error('Erro ao carregar motoristas:', err);
    }
}

async function carregarPlacas() {
    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('placa, modelo, situacao')
            .order('placa', { ascending: true });

        if (error) throw error;

        placasCache = (data || [])
            .filter(item => item.placa)
            .filter(item => !item.situacao || String(item.situacao).toLowerCase() === 'ativo')
            .map(item => ({
                placa: String(item.placa).trim().toUpperCase(),
                modelo: item.modelo || ''
            }));

        preencherDatalistPlacas();
    } catch (err) {
        console.error('Erro ao carregar placas:', err);
    }
}

async function carregarRotas() {
    try {
        const { data, error } = await supabaseClient
            .from('rotas')
            .select('numero, cidades, status')
            .order('numero', { ascending: true });

        if (error) throw error;

        rotasCache = (data || [])
            .filter(item => item.numero)
            .filter(item => !item.status || String(item.status).toUpperCase() === 'ATIVA')
            .map(item => ({
                numero: String(item.numero).trim(),
                cidades: item.cidades || ''
            }));

        preencherDatalistRotas();
    } catch (err) {
        console.error('Erro ao carregar rotas:', err);
    }
}

function preencherDatalistPlacas() {
    const datalist = document.getElementById('listaPlacasMobile');
    if (!datalist) return;

    datalist.innerHTML = placasCache
        .map(item => `<option value="${escapeHtml(item.placa)}" label="${escapeHtml(item.modelo)}"></option>`)
        .join('');
}

function preencherDatalistRotas() {
    const datalist = document.getElementById('listaRotasMobile');
    if (!datalist) return;

    datalist.innerHTML = rotasCache
        .map(item => `<option value="${escapeHtml(item.numero)}" label="${escapeHtml(item.cidades)}"></option>`)
        .join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    await sincronizarUsuarioLogado();

    // Define a data de hoje e carrega os dados
    const dataInput = document.getElementById('dataRetornoMobile');
    dataInput.value = getDataSaoPaulo();
    let dataRetornoSelecionada = dataInput.value;

    // Listeners
    dataInput.addEventListener('change', () => {
        if (retornoTemAlteracoesPendentes()) {
            alert('Existem alterações não salvas. Clique em "Salvar" antes de trocar a data.');
            dataInput.value = dataRetornoSelecionada;
            return;
        }

        dataRetornoSelecionada = dataInput.value;
        loadRetornos();
    });
    document.getElementById('buscaMobile').addEventListener('input', renderCards);
    document.getElementById('btnAdicionarRetornoMobile')?.addEventListener('click', openNewModal);
    document.querySelectorAll('[data-status-filter]').forEach(button => {
        button.addEventListener('click', () => {
            filtroStatusMobile = button.dataset.statusFilter || 'todos';
            renderCards();
        });
    });

    // Modal Principal
    const modalRetorno = document.getElementById('modalRetorno');
    modalRetorno.querySelector('.close-button').addEventListener('click', tentarFecharModalRetorno);
    modalRetorno.addEventListener('click', (e) => {
        if (e.target === modalRetorno) tentarFecharModalRetorno();
    });
    document.getElementById('btnSalvarRetorno').addEventListener('click', saveRetorno);
    document.getElementById('btnAbrirModalMateriais').addEventListener('click', openMateriaisModal);

    // Modal de Materiais
    const modalMateriais = document.getElementById('modalMateriais');
    modalMateriais.querySelector('.close-button').addEventListener('click', () => modalMateriais.classList.add('hidden'));
    document.getElementById('btnSalvarMateriais').addEventListener('click', () => {
        // Apenas fecha, os dados são salvos no modal principal
        modalMateriais.classList.add('hidden');
    });

    // Modal de Devoluções
    const modalDevolucoes = document.getElementById('modalDevolucoes');
    modalDevolucoes.querySelector('.close-button').addEventListener('click', tentarFecharModalDevolucoes);
    modalDevolucoes.addEventListener('click', (e) => {
        if (e.target === modalDevolucoes) tentarFecharModalDevolucoes();
    });
    document.getElementById('btnSalvarDevolucoes').addEventListener('click', saveDevolucoesData);
    document.getElementById('btnAbrirModalDevolucoes').addEventListener('click', openDevolucoesModal);

    window.addEventListener('beforeunload', (e) => {
        if (!retornoTemAlteracoesPendentes()) return;
        e.preventDefault();
        e.returnValue = '';
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        if (!modalDevolucoes.classList.contains('hidden')) {
            tentarFecharModalDevolucoes();
            return;
        }

        if (!modalRetorno.classList.contains('hidden')) {
            tentarFecharModalRetorno();
        }
    });

    // Carrega dados auxiliares (Supervisores e Motoristas)
    await carregarMotoristas();
    await carregarSupervisores();
    await carregarPlacas();
    await carregarRotas();
    await loadRetornos();

    // Listener para o modal de materiais (paletes) na versão mobile
    document.getElementById('matTemPaletes').addEventListener('change', (e) => {
        const detailsContainer = document.getElementById('paletes-details-mobile');
        const show = e.target.value === 'true';
        detailsContainer.classList.toggle('hidden', !show);

        if (!show) {
            detailsContainer.querySelectorAll('input').forEach(input => input.value = '');
        }
    });

    // Listener para o modal de materiais (peças) na versão mobile
    document.getElementById('matRetornoPecas').addEventListener('change', (e) => {
        const detailsContainer = document.getElementById('pecas-details-mobile');
        const show = e.target.value === '1';
        detailsContainer.classList.toggle('hidden', !show);

        if (!show) {
            detailsContainer.querySelectorAll('select, textarea').forEach(el => el.value = '');
        }
    });

    // Event delegation para abrir o modal ao clicar no card
    document.getElementById('listaRetornoMobile').addEventListener('click', (e) => {
        const card = e.target.closest('.retorno-card');
        if (card) {
            if (retornoTemAlteracoesPendentes()) {
                alert('Existem alterações não salvas. Clique em "Salvar" antes de abrir outro retorno.');
                return;
            }

            const itemId = card.dataset.id;
            const item = allData.find(d => d.id == itemId);
            if (item) {
                openEditModal(item);
            }
        }
    });
});

async function loadRetornos() {
    const data = document.getElementById('dataRetornoMobile').value;
    const filialUsuario = getCurrentUserFilial();
    const container = document.getElementById('listaRetornoMobile');
    container.innerHTML = `<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>`;

    if (!data) {
        container.innerHTML = `<div class="loading-placeholder">Selecione uma data.</div>`;
        return;
    }

    if (!filialUsuario) {
        allData = [];
        ['count-retornaram', 'count-todos', 'count-aguardando'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
        });
        container.innerHTML = `<div class="loading-placeholder" style="color: red;">Filial do usuario nao encontrada. Atualize o cadastro do usuario.</div>`;
        return;
    }

    try {
        const { data: retornos, error } = await supabaseClient
            .from('retorno_rota')
            .select('*')
            .eq('data_retorno', data)
            .eq('filial', filialUsuario);

        if (error) throw error;

        allData = retornos || [];
        renderCards();
    } catch (err) {
        console.error("Erro ao carregar retornos:", err);
        container.innerHTML = `<div class="loading-placeholder" style="color: red;">Erro ao carregar dados.</div>`;
    }
}

function renderCards() {
    const container = document.getElementById('listaRetornoMobile');
    const termoBusca = document.getElementById('buscaMobile').value.toUpperCase();

    const dadosBusca = allData.filter(item => {
        const placa = item.placa || '';
        const rota = item.rota || '';
        const motorista = item.nome_mot || '';
        return placa.toUpperCase().includes(termoBusca) || rota.toUpperCase().includes(termoBusca) || motorista.toUpperCase().includes(termoBusca);
    });

    // Calcular e atualizar os contadores (Retornaram vs Aguardando)
    const retornaramData = dadosBusca.filter(row => row.operador_recebimento && row.operador_recebimento.trim() !== '');
    const aguardandoData = dadosBusca.filter(row => !row.operador_recebimento || row.operador_recebimento.trim() === '');
    const countRetornaram = retornaramData.length;
    const countAguardando = aguardandoData.length;
    const elRetornaram = document.getElementById('count-retornaram');
    const elTodos = document.getElementById('count-todos');
    const elAguardando = document.getElementById('count-aguardando');
    if (elRetornaram) elRetornaram.textContent = countRetornaram;
    if (elTodos) elTodos.textContent = dadosBusca.length;
    if (elAguardando) elAguardando.textContent = countAguardando;

    document.querySelectorAll('[data-status-filter]').forEach(button => {
        button.classList.toggle('active', button.dataset.statusFilter === filtroStatusMobile);
    });

    const filteredData = filtroStatusMobile === 'retornaram'
        ? retornaramData
        : filtroStatusMobile === 'aguardando'
            ? aguardandoData
            : dadosBusca;

    if (filteredData.length === 0) {
        container.innerHTML = `<div class="loading-placeholder">Nenhum retorno encontrado.</div>`;
        return;
    }

    container.innerHTML = filteredData.map(item => {
        const isOk = !!item.hora_mot; // Verifica se o horário do motorista já foi preenchido
        const statusClass = isOk ? 'status-ok' : '';
        const iconClass = isOk ? 'fa-check-circle' : 'fa-clock';
        const hasDevolucoes = item.cliente1 || item.nf_dev1 || item.frances_diurno1 || item.frances_noturno1 || item.variedades1 || item.motivo1 || item.obs_nf_dev1 || getDevolucoesExtras(item);
        
        let lateClass = '';
        // Exemplo de lógica para definir 'lateClass' (pode ser ajustada conforme a regra de negócio)
        // Por exemplo, se o retorno for após as 20:00, adiciona uma classe 'late-return'
        if (isOk && item.hora_mot && item.hora_mot >= '20:00') {
            lateClass = 'late-return';
        }
        
        const whatsappIcon = hasDevolucoes ? `<i class="fab fa-whatsapp whatsapp-icon" onclick="event.stopPropagation(); shareRetornoOnWhatsApp('${item.id}')" title="Compartilhar Devoluções"></i>` : '';

        // Verifica se há retorno de peças para mostrar o ícone azul
        const hasPecas = item.retorno_pecas === 1;
        const whatsappPecasIcon = hasPecas ? `<i class="fab fa-whatsapp whatsapp-icon" onclick="event.stopPropagation(); sharePecasOnWhatsApp('${item.id}')" title="Compartilhar Retorno de Peças" style="color: #007bff; ${hasDevolucoes ? 'margin-left: 35px;' : ''}"></i>` : '';

        // Removida a linha duplicada de Rota
        return `
            <div class="retorno-card ${statusClass}" data-id="${item.id}">
                <div class="card-header">
                    <h4>${item.placa || 'Sem Placa'}</h4>
                    <i class="fas ${iconClass} card-status-icon"></i>
                </div>
                <div class="card-body">
                    ${whatsappIcon} ${whatsappPecasIcon}
                    <p><i class="fas fa-route"></i> <strong>Rota:</strong> ${item.rota || 'N/A'}</p>
                    <p><i class="fas fa-user-tie"></i> <strong>Motorista:</strong> ${item.nome_mot || 'N/A'}</p>
                    ${isOk ? `<p class="${lateClass}"><i class="fas fa-hourglass-end"></i> <strong>Retorno:</strong> ${item.hora_mot}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function openEditModal(item) {
    currentItem = item;
    document.getElementById('modalTitle').textContent = `Registrar Retorno - ${item.placa}`;
    document.getElementById('modalPlaca').value = item.placa || '';
    document.getElementById('modalRota').value = item.rota || '';

    // Popula o select de motoristas
    const selectMotorista = document.getElementById('modalMotorista');
    if (selectMotorista) {
        const motoristaAtual = item.nome_mot || '';
        
        // Criar um Set para garantir que o motorista atual esteja na lista mesmo que não esteja no cache de ativos
        const motoristasParaExibir = new Set(motoristasCache);
        if (motoristaAtual) motoristasParaExibir.add(motoristaAtual);
        const listaOrdenada = Array.from(motoristasParaExibir).sort();

        selectMotorista.innerHTML = '<option value="">Selecione o Motorista</option>';
        listaOrdenada.forEach(m => selectMotorista.add(new Option(m, m)));
        selectMotorista.value = motoristaAtual;
    }

    // Preenche automaticamente com o horário atual se estiver vazio
    // Formato HH:mm:ss para ser compatível com o step="1" do input
    const horaAtual = getHoraSaoPaulo();
    
    document.getElementById('modalHoraMotorista').value = item.hora_mot || horaAtual;
    document.getElementById('modalObs').value = getObsGeral(item);

    // Limpa e preenche o modal de materiais
    const temPaletesSelect = document.getElementById('matTemPaletes');
    const temPaletes = item.paletes > 0;

    const temPecasSelect = document.getElementById('matRetornoPecas');
    const temPecas = item.retorno_pecas === 1;

    document.getElementById('matCarrinhos').value = item.carrinhos || '';
    temPaletesSelect.value = temPaletes ? 'true' : 'false';
    document.getElementById('matMadeira').value = item.madeira_qtd || '';
    document.getElementById('matPlastico').value = item.plastico_qtd || '';
    document.getElementById('matCaixaBranca').value = item.caixa_branca_qtd || '';
    document.getElementById('matObsCarrinhos').value = item.obs_carrinhos || '';

    // Preenche campos de peças
    temPecasSelect.value = temPecas ? '1' : '0';
    document.getElementById('matDescPecas').value = item.pecas_desc || '';
    
    // Popula select de supervisor de peças
    const supervisorPecasSelect = document.getElementById('matSupervisorPecas');
    supervisorPecasSelect.innerHTML = '<option value="">Selecione o Supervisor</option>';
    supervisoresCache.forEach(sup => supervisorPecasSelect.add(new Option(sup, sup)));
    supervisorPecasSelect.value = item.nome_supervisor || '';

    // Dispara os eventos change para atualizar a visibilidade das seções
    temPaletesSelect.dispatchEvent(new Event('change'));
    temPecasSelect.dispatchEvent(new Event('change'));

    document.getElementById('modalRetorno').classList.remove('hidden');
    atualizarSnapshotRetorno();
}

function openNewModal() {
    if (retornoTemAlteracoesPendentes()) {
        alert('Existem alterações não salvas. Clique em "Salvar" antes de adicionar outro retorno.');
        return;
    }

    const dataRetorno = document.getElementById('dataRetornoMobile').value;
    if (!dataRetorno) {
        alert('Selecione uma data antes de adicionar um lançamento.');
        return;
    }

    currentItem = {
        id: null,
        data_retorno: dataRetorno,
        filial: getCurrentUserFilial(),
        placa: '',
        rota: '',
        nome_mot: '',
        hora_mot: '',
        obs: '',
        devolucoes_extras: ''
    };

    openEditModal(currentItem);
    document.getElementById('modalTitle').textContent = 'Novo Retorno de Rota';
    document.getElementById('modalPlaca').focus();
}

function openMateriaisModal() {
    // Apenas abre o modal de materiais. Os dados já foram preenchidos em openEditModal.
    document.getElementById('modalMateriais').classList.remove('hidden');
}

function openDevolucoesModal() {
    if (!currentItem) return;
    const modal = document.getElementById('modalDevolucoes');
 
    // --- Handle centralized supervisor fields ---
    const supervisorCienteSelect = document.getElementById('supervisorCienteDevolucao');
    const nomeSupervisorSelect = document.getElementById('nomeSupervisorDevolucao');
    
    // Populate supervisor names dropdown
    nomeSupervisorSelect.innerHTML = '<option value="">Selecione o Supervisor</option>';
    supervisoresCache.forEach(sup => {
        nomeSupervisorSelect.add(new Option(sup, sup));
    });

    // Set initial values from currentItem
    supervisorCienteSelect.value = normalizeBooleanFlag(currentItem.supervisor_ciente) ? 'true' : 'false';
    nomeSupervisorSelect.value = currentItem.nome_supervisor || '';
    // --- END ---

    for (let i = 1; i <= 4; i++) {
        const tabContent = document.getElementById(`tab-cliente-${i}`);

        tabContent.innerHTML = `
            <h4>Detalhes do Cliente ${i}</h4>
            <div class="form-grid-2-cols">
                <div class="form-group">
                    <label>Cliente</label>
                    <input type="text" class="glass-input input-uppercase" data-field="cliente${i}" value="${currentItem[`cliente${i}`] || ''}">
                </div>
                <div class="form-group">
                    <label>NF Devolvida</label>
                    <input type="text" class="glass-input" data-field="nf_dev${i}" value="${currentItem[`nf_dev${i}`] || ''}">
                </div>
                <div class="form-group">
                    <label>Francês Diurno</label>
                    <input type="number" class="glass-input" data-field="frances_diurno${i}" value="${currentItem[`frances_diurno${i}`] || ''}">
                </div>
                <div class="form-group">
                    <label>Francês Noturno</label>
                    <input type="number" class="glass-input" data-field="frances_noturno${i}" value="${currentItem[`frances_noturno${i}`] || ''}">
                </div>
                <div class="form-group">
                    <label>Variedades</label>
                    <input type="text" class="glass-input input-uppercase" data-field="variedades${i}" value="${currentItem[`variedades${i}`] || ''}" placeholder="Texto livre...">
                </div>
                <div class="form-group">
                    <label>Motivo</label>
                    <select class="glass-input" data-field="motivo${i}">
                        <option value="" ${!currentItem[`motivo${i}`] ? 'selected' : ''}>Selecione</option>
                        <option value="AVARIA" ${currentItem[`motivo${i}`] === 'AVARIA' ? 'selected' : ''}>AVARIA</option>
                        <option value="DEVOLUÇÃO" ${currentItem[`motivo${i}`] === 'DEVOLUÇÃO' ? 'selected' : ''}>DEVOLUÇÃO</option>
                        <option value="FALTOU TEMPO HÁBIL" ${currentItem[`motivo${i}`] === 'FALTOU TEMPO HÁBIL' ? 'selected' : ''}>FALTOU TEMPO HÁBIL</option>
                        <option value="PRODUTO INVERTIDO" ${currentItem[`motivo${i}`] === 'PRODUTO INVERTIDO' ? 'selected' : ''}>PRODUTO INVERTIDO</option>
                        <option value="SOBROU CARGA" ${currentItem[`motivo${i}`] === 'SOBROU CARGA' ? 'selected' : ''}>SOBROU CARGA</option>
                        <option value="TROCA" ${currentItem[`motivo${i}`] === 'TROCA' ? 'selected' : ''}>TROCA</option>
                    </select>
                </div>
                <div class="form-group form-group-full">
                    <label>Obs. NF Devolvida</label>
                    <input type="text" class="glass-input input-uppercase" data-field="obs_nf_dev${i}" value="${currentItem[`obs_nf_dev${i}`] || ''}">
                </div>
            </div>
        `;
    }

    // Lógica das abas
    renderClientesExtrasModal(modal, currentItem);
    setupDevolucoesTabHandlers(modal);
    setupUppercaseInputs(modal);
    // Ativa a primeira aba por padrão
    modal.querySelector('.tab-link').click();

    modal.classList.remove('hidden');
}

function saveDevolucoesData() {
    if (!currentItem) return;
    const modal = document.getElementById('modalDevolucoes');
    
    // --- Save centralized supervisor data ---
    const supervisorCiente = document.getElementById('supervisorCienteDevolucao').value === 'true' ? 1 : 0;
    const nomeSupervisor = document.getElementById('nomeSupervisorDevolucao').value;
    currentItem.supervisor_ciente = supervisorCiente;
    currentItem.nome_supervisor = nomeSupervisor || null;

    // Save data from client tabs
    modal.querySelectorAll('.tab-content input, .tab-content select').forEach(input => {
        const field = input.dataset.field;
        if (field) {
            currentItem[field] = /^(cliente|variedades|obs_nf_dev)\d+$/.test(field)
                ? toUpperText(input.value)
                : input.value;
        }
    });

    currentItem.devolucoes_extras = serializeClientesExtrasModal(modal);

    modal.classList.add('hidden');
    alert('Devoluções salvas localmente. Clique em "Salvar" para registrar no banco de dados.');
}

async function saveRetorno() {
    if (!currentItem) return;

    const btn = document.getElementById('btnSalvarRetorno');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    let salvou = false;

    // Coleta dados do modal principal
    const placa = document.getElementById('modalPlaca').value.trim().toUpperCase();
    const rota = document.getElementById('modalRota').value.trim();
    const motorista = document.getElementById('modalMotorista').value;
    const horaMotorista = document.getElementById('modalHoraMotorista').value;
    const obs = document.getElementById('modalObs').value;
    const filialUsuario = getCurrentUserFilial();

    if (!placa) {
        alert('Informe a placa para salvar o lançamento.');
        btn.disabled = false;
        btn.textContent = 'Salvar';
        return;
    }

    if (!filialUsuario) {
        alert('Filial do usuario nao encontrada. Atualize o cadastro do usuario antes de salvar.');
        btn.disabled = false;
        btn.textContent = 'Salvar';
        return;
    }

    // Coleta dados do modal de materiais
    const temPaletes = document.getElementById('matTemPaletes').value === 'true';
    const temPecas = document.getElementById('matRetornoPecas').value === '1';
    const carrinhos = document.getElementById('matCarrinhos').value;
    const obsCarrinhos = document.getElementById('matObsCarrinhos').value;

    let madeira, plastico, caixaBranca;
    if (temPaletes) {
        madeira = document.getElementById('matMadeira').value;
        plastico = document.getElementById('matPlastico').value;
        caixaBranca = document.getElementById('matCaixaBranca').value;
    } else {
        madeira = null;
        plastico = null;
        caixaBranca = null;
    }

    let supervisorPecas, descPecas;
    if (temPecas) {
        supervisorPecas = document.getElementById('matSupervisorPecas').value;
        descPecas = document.getElementById('matDescPecas').value;
    } else {
        supervisorPecas = null;
        descPecas = null;
    }

    const parseNum = (val) => {
        if (val === '' || val === null || val === undefined) return null;
        const n = parseInt(val, 10);
        return isNaN(n) ? null : n;
    };

    const updateData = {
        data_retorno: currentItem.data_retorno || document.getElementById('dataRetornoMobile').value,
        filial: filialUsuario,
        placa,
        rota: rota || null,
        nome_mot: motorista || null,
        hora_mot: horaMotorista || null,
        nome_aux: currentItem.nome_aux || null,
        hora_aux: horaMotorista && hasTeamMemberName(currentItem.nome_aux) ? horaMotorista : (currentItem.hora_aux || null),
        nome_terceiro: currentItem.nome_terceiro || null,
        hora_terceiro: horaMotorista && hasTeamMemberName(currentItem.nome_terceiro) ? horaMotorista : (currentItem.hora_terceiro || null),
        obs: obs || null,
        devolucoes_extras: getDevolucoesExtrasPayload(currentItem),
        carrinhos: parseNum(carrinhos), // Assumindo que 'carrinhos' é numérico
        paletes: temPaletes ? 1 : 0, // A coluna 'paletes' é do tipo INTEGER (0 ou 1)
        madeira_qtd: parseNum(madeira),
        plastico_qtd: parseNum(plastico),
        caixa_branca_qtd: parseNum(caixaBranca),
        retorno_pecas: temPecas ? 1 : 0,
        pecas_desc: descPecas || null,
        obs_carrinhos: obsCarrinhos || null,
        operador_recebimento: getCurrentUserName(),
        // Removido o fallback '|| false' para permitir que o valor seja enviado como null se não preenchido
        supervisor_ciente: currentItem.supervisor_ciente === undefined || currentItem.supervisor_ciente === null
            ? null
            : (normalizeBooleanFlag(currentItem.supervisor_ciente) ? 1 : 0),
        nome_supervisor: temPecas ? (supervisorPecas || null) : (currentItem.nome_supervisor || null),
    };

    // Adiciona os dados de devolução que podem ter sido editados
    for (let i = 1; i <= 4; i++) {
        updateData[`cliente${i}`] = currentItem[`cliente${i}`] || null;
        updateData[`nf_dev${i}`] = currentItem[`nf_dev${i}`] || null;
        updateData[`frances_diurno${i}`] = parseNum(currentItem[`frances_diurno${i}`]);
        updateData[`frances_noturno${i}`] = parseNum(currentItem[`frances_noturno${i}`]);
        updateData[`variedades${i}`] = currentItem[`variedades${i}`] || null;
        updateData[`motivo${i}`] = currentItem[`motivo${i}`] || null;
        updateData[`obs_nf_dev${i}`] = currentItem[`obs_nf_dev${i}`] || null;
    }

    try {
        let savedData = null;
        let saveError = null;

        if (currentItem.id) {
            const result = await supabaseClient
                .from('retorno_rota')
                .update(updateData)
                .eq('id', currentItem.id)
                .select()
                .single();

            savedData = result.data;
            saveError = result.error;
        } else {
            const result = await supabaseClient
                .from('retorno_rota')
                .insert([updateData])
                .select()
                .single();

            savedData = result.data;
            saveError = result.error;
        }

        if (saveError) throw saveError;

        // Atualiza o cache local para refletir a mudança imediatamente
        const index = allData.findIndex(d => d.id === currentItem.id);
        if (index > -1) {
            allData[index] = savedData || { ...allData[index], ...updateData };
        } else if (savedData) {
            allData.unshift(savedData);
        }

        registrarAuditoria(currentItem?.id ? 'ALTERAR' : 'INCLUIR', 'Retorno de Rota', `${currentItem?.id ? 'Alteração' : 'Inclusão'} de retorno de rota via app mobile`);
        alert('Retorno salvo com sucesso!');
        retornoSnapshotInicial = null;
        currentItem = null;
        salvou = true;
        document.getElementById('modalRetorno').classList.add('hidden');
        renderCards(); // Re-renderiza os cards com o novo status

    } catch (err) {
        console.error("Erro ao salvar retorno:", err);
        alert('Erro ao salvar: ' + (err.message || JSON.stringify(err))); // Melhoria na mensagem de erro
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar';
        if (salvou) currentItem = null;
    }
}

// Nova função para compartilhar dados no WhatsApp
window.shareRetornoOnWhatsApp = function(itemId) {
    const item = allData.find(d => d.id === itemId);
    if (!item) {
        alert('Dados do retorno não encontrados para compartilhar.');
        return;
    }

    let message = "Olá, Segue Dados de Retorno\n";
    message += `*Rota:* ${item.rota || 'N/A'}\n`;
    message += `*Placa:* ${item.placa || 'N/A'}\n`;
    message += `*SUPERVISOR:* ${item.nome_supervisor || 'N/A'}\n`;

    let hasAnyClientDevolution = false;
    for (let i = 1; i <= 4; i++) {
        if (item[`cliente${i}`]) {
            hasAnyClientDevolution = true;
            message += `\n*Cliente ${i}:* ${item[`cliente${i}`]}\n`;
            message += `  *Francês Diurno:* ${item[`frances_diurno${i}`] || '0'}\n`;
            message += `  *Francês Noturno:* ${item[`frances_noturno${i}`] || '0'}\n`;
            message += `  *Variedades:* ${item[`variedades${i}`] || 'N/A'}\n`;
            message += `  *Motivo:* ${item[`motivo${i}`] || 'N/A'}\n`;
            message += `  *NFE-DEV:* ${item[`nf_dev${i}`] || 'N/A'}\n`;
            message += `  *Obs NFE-DEV:* ${item[`obs_nf_dev${i}`] || 'N/A'}\n`;
        }
    }
    if (!hasAnyClientDevolution) {
        message += "\nNenhuma devolução registrada para clientes específicos.\n";
    }
    const obsGeral = getObsGeral(item);
    const extras = getDevolucoesExtras(item);
    if (extras) {
        message += `\n*Clientes adicionais:*\n${extras}\n`;
    }
    message += `\n*Observacao Geral:* ${obsGeral || 'N/A'}\n`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
};

// Função para compartilhar dados de retorno de peças no WhatsApp
window.sharePecasOnWhatsApp = function(itemId) {
    const item = allData.find(d => d.id === itemId);
    if (!item) {
        alert('Dados do retorno não encontrados para compartilhar.');
        return;
    }

    let message = "Olá, Segue Dados de Retorno\n";
    message += `*Rota:* ${item.rota || 'N/A'}\n`;
    message += `*Placa:* ${item.placa || 'N/A'}\n`;
    message += `*Retorno:* Peças\n`;
    message += `*SUPERVISOR:* ${item.nome_supervisor || 'N/A'}\n`;
    message += `*Descrição:* ${item.pecas_desc || 'N/A'}\n`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
};
