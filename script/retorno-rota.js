import { supabaseClient } from './supabase.js';

// Estado global para armazenar os dados da grid
let gridData = [];
let currentRowIndex = null; // Índice da linha sendo editada nos modais
let supervisoresCache = []; // Cache para a lista de supervisores
let sortConfig = { key: null, asc: true }; // Estado da ordenação

// Mapeamento de colunas da planilha para os nomes dos campos no objeto de dados
// A ordem aqui DEVE corresponder à ordem das colunas na planilha do usuário
const COLUMN_MAP = [
    'placa', 'rota', 'operador_recebimento', 'created_at', 'nome_mot', 'hora_mot', 'nome_aux', 'hora_aux', 'nome_terceiro', 'hora_terceiro',
    'carrinhos', 'obs_carrinhos', 'paletes', 'madeira_qtd', 'plastico_qtd', 'caixa_branca_qtd', 'tipo_retorno', 'qtd_clientes',
    'cliente1', 'frances_diurno1', 'frances_noturno1', 'variedades1', 'motivo1', 'nf_dev1', 'obs_nf_dev1',
    'cliente2', 'frances_diurno2', 'frances_noturno2', 'variedades2', 'motivo2', 'nf_dev2', 'obs_nf_dev2',
    'cliente3', 'frances_diurno3', 'frances_noturno3', 'variedades3', 'motivo3', 'nf_dev3', 'obs_nf_dev3',
    'cliente4', 'frances_diurno4', 'frances_noturno4', 'variedades4', 'motivo4', 'nf_dev4', 'obs_nf_dev4',
    'supervisor_ciente', 'nome_supervisor', 'obs',
    'retorno_pecas', 'pecas_desc'
];

function getCurrentUserName() {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    return usuario ? usuario.nome : null;
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

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializa a data com o dia de hoje
    const dataInput = document.getElementById('dataRetorno');
    dataInput.value = new Date().toISOString().split('T')[0];

    // Carrega dados do dia atual
    loadDataFromSupabase();

    // Listeners
    dataInput.addEventListener('change', loadDataFromSupabase);
    document.getElementById('btnAdicionarLinha').addEventListener('click', () => {
        addEmptyRow();
        renderGrid();
    });
    document.getElementById('tbodyRetornoRota').addEventListener('paste', handlePaste);
    document.getElementById('btnSalvarTudo').addEventListener('click', saveAllData);
    document.getElementById('btnExportarPao').addEventListener('click', () => exportToPDF('pao'));
    document.getElementById('btnExportarPecas').addEventListener('click', () => exportToPDF('pecas'));
    document.getElementById('btnExcluirSelecionados').addEventListener('click', deleteSelectedRows);

    // Listener para o novo campo de busca
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', renderGrid);

    // Listeners dos Modais
    setupModalListeners('modalDevolucoes', 'btnSalvarDevolucoes', saveDevolucoesData);
    setupModalListeners('modalMateriais', 'btnSalvarMateriais', saveMateriaisData);

    // Listeners para ordenação nos cabeçalhos
    document.querySelectorAll('#tableRetornoRota thead th[data-sort]').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });

    // Carrega dados auxiliares
    await carregarSupervisores();

    // Listener para o modal de materiais (paletes)
    document.getElementById('matTemPaletes').addEventListener('change', (e) => {
        const detailsContainer = document.getElementById('paletes-details');
        const show = e.target.value === 'true';
        detailsContainer.classList.toggle('hidden', !show);

        if (!show) {
            detailsContainer.querySelectorAll('input').forEach(input => input.value = '');
        }
    });

    // Listener para o retorno de peças (mostrar/ocultar campos)
    document.getElementById('matRetornoPecas').addEventListener('change', (e) => {
        const detailsContainer = document.getElementById('pecas-details');
        const show = e.target.value === '1';
        detailsContainer.classList.toggle('hidden', !show);
    });

    // Listener para delegação de eventos na tabela
    document.getElementById('tbodyRetornoRota').addEventListener('click', handleTableClick);

    // Listener para selecionar tudo
    document.getElementById('selectAllRows').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.row-selector');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });
});

/**
 * Configura os listeners de um modal (fechar e salvar).
 * @param {string} modalId - O ID do overlay do modal.
 * @param {string} saveBtnId - O ID do botão de salvar do modal.
 * @param {Function} saveFunction - A função a ser chamada ao salvar.
 */
async function setupModalListeners(modalId, saveBtnId, saveFunction) {
    const modal = document.getElementById(modalId);
    modal.querySelector('.close-button').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if (e.target.id === modalId) modal.classList.add('hidden');
    });
    document.getElementById(saveBtnId).addEventListener('click', async () => {
        await saveFunction();
        modal.classList.add('hidden');
    });
}

/**
 * Lida com a ordenação da grid.
 * @param {string} key - A chave (campo) pela qual ordenar.
 */
function handleSort(key) {
    if (sortConfig.key === key) {
        sortConfig.asc = !sortConfig.asc;
    } else {
        sortConfig.key = key;
        sortConfig.asc = true;
    }
    updateSortIcons();
    renderGrid();
}

/**
 * Atualiza visualmente os ícones de ordenação nos cabeçalhos.
 */
function updateSortIcons() {
    document.querySelectorAll('#tableRetornoRota thead th[data-sort] i').forEach(icon => {
        icon.className = 'fas fa-sort';
    });
    const activeTh = document.querySelector(`#tableRetornoRota thead th[data-sort="${sortConfig.key}"] i`);
    if (activeTh) {
        activeTh.className = sortConfig.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }
}

/**
 * Lida com cliques na tabela para abrir modais ou excluir linhas.
 * @param {Event} e - O evento de clique.
 */
async function handleTableClick(e) {
    const target = e.target.closest('button');
    if (!target) return;

    const rowIndex = target.closest('tr').dataset.rowIndex;

    if (target.classList.contains('btn-devolucoes')) {
        openDevolucoesModal(rowIndex);
    } else if (target.classList.contains('btn-materiais')) {
        openMateriaisModal(rowIndex);
    } else if (target.classList.contains('btn-delete-row')) {
        if (confirm('Tem certeza que deseja excluir esta linha?')) {
            await deleteRow(rowIndex);
        }
    }
}

/**
 * Exclui múltiplas linhas selecionadas na grade.
 */
async function deleteSelectedRows() {
    const checkboxes = document.querySelectorAll('.row-selector:checked');
    if (checkboxes.length === 0) {
        alert('Selecione pelo menos uma linha para excluir.');
        return;
    }

    if (!confirm(`Tem certeza que deseja excluir ${checkboxes.length} linha(s)?`)) return;

    // Obtém os índices em ordem decrescente para não bagunçar o splice
    const indices = Array.from(checkboxes)
        .map(cb => parseInt(cb.dataset.index, 10))
        .sort((a, b) => b - a);

    const idsToDelete = indices
        .map(index => gridData[index].id)
        .filter(Boolean);

    if (idsToDelete.length > 0) {
        try {
            const { error } = await supabaseClient
                .from('retorno_rota')
                .delete()
                .in('id', idsToDelete);
            if (error) throw error;
        } catch (error) {
            console.error('Erro ao excluir registros do banco:', error);
            alert('Erro ao excluir alguns registros do banco de dados.');
        }
    }

    indices.forEach(index => gridData.splice(index, 1));
    renderGrid();
}

/**
 * Carrega os dados do Supabase para a data selecionada.
 */
async function loadDataFromSupabase() {
    const dataSelecionada = document.getElementById('dataRetorno').value;
    if (!dataSelecionada) return;

    try {
        const { data, error } = await supabaseClient
            .from('retorno_rota')
            .select('*')
            .eq('data_retorno', dataSelecionada);

        if (error) throw error;

        gridData = data || [];
        renderGrid();
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        alert('Não foi possível carregar os dados do dia selecionado.');
    }
}

/**
 * Lida com o evento de colar dados na tabela.
 * @param {ClipboardEvent} event - O evento de colar.
 */
function handlePaste(event) {
    const target = event.target;

    // A nova lógica de colar só funciona se o alvo for um input dentro da tabela.
    // Se não for, o comportamento padrão do navegador ocorrerá (que pode ser colar texto simples no campo).
    if (!target || target.tagName !== 'INPUT' || !target.closest('tr[data-row-index]')) {
        return;
    }
    
    event.preventDefault(); // Previne o comportamento padrão de colar apenas se o alvo for válido.

    const startRowIndex = parseInt(target.closest('tr').dataset.rowIndex, 10);
    const startField = target.dataset.field;
    
    // Pega a lista de campos de input visíveis na ordem em que aparecem na linha
    const visibleFields = Array.from(
        document.querySelectorAll(`#tbodyRetornoRota tr[data-row-index='${startRowIndex}'] input[data-field]`)
    ).map(input => input.dataset.field);
    
    const startColIndex = visibleFields.indexOf(startField);

    if (isNaN(startRowIndex) || startColIndex === -1) {
        console.error('Não foi possível determinar o ponto de início da colagem.');
        return;
    }

    const pasteData = event.clipboardData.getData('text');
    const rows = pasteData.split(/[\r\n]+/).filter(row => row.trim() !== '');

    rows.forEach((row, rowIndexOffset) => {
        const currentRowIndex = startRowIndex + rowIndexOffset;
        
        // Detecta o separador: prefere tab, mas usa vírgula como fallback se houver apenas uma coluna.
        let columns = row.split('\t');
        if (columns.length === 1 && row.includes(',')) {
            // Também remove espaços em branco ao redor da vírgula
            columns = row.split(',').map(s => s.trim());
        }

        // Se a linha não existe no nosso array de dados, cria uma nova
        if (currentRowIndex >= gridData.length) {
            addEmptyRow();
        }

        columns.forEach((colValue, colIndexOffset) => {
            const currentColIndex = startColIndex + colIndexOffset;

            // Garante que estamos dentro dos limites dos campos visíveis
            if (currentColIndex < visibleFields.length) {
                const fieldToUpdate = visibleFields[currentColIndex];
                if (gridData[currentRowIndex]) {
                    let processedValue = colValue.trim();
                    const timeFields = ['hora_mot', 'hora_aux', 'hora_terceiro'];

                    // Se o campo for um campo de hora, tenta extrair apenas a parte da hora.
                    if (timeFields.includes(fieldToUpdate)) {
                        // Esta expressão regular busca por um padrão como HH:mm ou HH:mm:ss
                        const timeMatch = processedValue.match(/\d{1,2}:\d{2}(:\d{2})?/);
                        if (timeMatch) {
                            processedValue = timeMatch[0];
                        }
                    }
                    gridData[currentRowIndex][fieldToUpdate] = processedValue;
                }
            }
        });
    });

    renderGrid(); // Re-renderiza a grid com os novos dados
}

/**
 * Aplica o estilo de destaque na linha se o horário for >= 20:00.
 * @param {HTMLTableRowElement} trElement - O elemento da linha da tabela.
 * @param {object} rowData - Os dados da linha.
 */
function applyRowStyle(trElement, rowData) {
    const horaMot = rowData.hora_mot || '';
    const horaAux = rowData.hora_aux || '';
    const horaTerceiro = rowData.hora_terceiro || '';

    const isLate = horaMot >= '20:00' || horaAux >= '20:00' || horaTerceiro >= '20:00';

    // Aplica ou remove a classe late-return conforme necessário
    trElement.querySelectorAll('input').forEach(input => {
        if (isLate) {
            input.classList.add('late-return');
        } else {
            input.classList.remove('late-return');
        }
    });
}

/**
 * Adiciona uma nova linha vazia à grid.
 */
function addEmptyRow() {
    const newRow = {};
    COLUMN_MAP.forEach(key => newRow[key] = null);
    newRow.operador_recebimento = getCurrentUserName(); // Preenche com o usuário logado
    gridData.push(newRow);
}

/**
 * Renderiza a grid principal com os dados do array `gridData`.
 */
function renderGrid() {
    const tbody = document.getElementById('tbodyRetornoRota');
    tbody.innerHTML = '';

    // Resetar o checkbox de selecionar tudo
    const selectAll = document.getElementById('selectAllRows');
    if (selectAll) selectAll.checked = false;

    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toUpperCase().trim() : '';

    let dataToRender = searchTerm
        ? gridData.filter(row =>
            (row.placa || '').toUpperCase().includes(searchTerm) ||
            (row.rota || '').toUpperCase().includes(searchTerm) ||
            (row.nome_mot || '').toUpperCase().includes(searchTerm) ||
            (row.nome_aux || '').toUpperCase().includes(searchTerm) ||
            (row.nome_terceiro || '').toUpperCase().includes(searchTerm)
          )
        : [...gridData];

    // Aplica a ordenação se houver uma chave definida
    if (sortConfig.key) {
        dataToRender.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            if (valA === null || valA === undefined) valA = '';
            if (valB === null || valB === undefined) valB = '';

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortConfig.asc ? -1 : 1;
            if (valA > valB) return sortConfig.asc ? 1 : -1;
            return 0;
        });
    }

    if (dataToRender.length === 0) {
        const colCount = document.querySelector('#tableRetornoRota thead tr')?.children.length || 13;
        tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align: center; padding: 20px;">Nenhum resultado encontrado.</td></tr>`;
        return;
    }

    dataToRender.forEach((rowData) => {
        // É crucial pegar o índice original para que a edição e o salvamento funcionem corretamente
        const index = gridData.indexOf(rowData);
        
        // Verifica se há retorno de pão para mostrar o ícone verde
        const hasBreadReturn = !!(rowData.cliente1 || rowData.nf_dev1 || rowData.frances_diurno1 || rowData.frances_noturno1 || rowData.variedades1 || rowData.motivo1 || rowData.obs_nf_dev1);
        const whatsappBreadIcon = hasBreadReturn ? 
            `<i class="fab fa-whatsapp whatsapp-btn green" onclick="event.stopPropagation(); shareBreadReturnOnWhatsApp(${index})" title="Compartilhar Devolução de Pão"></i>` : '';
        
        // Verifica se há retorno de peças para mostrar o ícone azul
        const hasPartsReturn = rowData.retorno_pecas === 1;
        const whatsappPartsIcon = hasPartsReturn ? 
            `<i class="fab fa-whatsapp whatsapp-btn blue" onclick="event.stopPropagation(); sharePartsReturnOnWhatsApp(${index})" title="Compartilhar Retorno de Peças"></i>` : '';

        // Construção do resumo para o tooltip de Materiais
        let materiaisTooltip = '';
        if (rowData.carrinhos) materiaisTooltip += `• Carrinhos: ${rowData.carrinhos}${rowData.obs_carrinhos ? ` (${rowData.obs_carrinhos})` : ''}\n`;
        if (rowData.paletes) materiaisTooltip += `• Paletes: Madeira(${rowData.madeira_qtd || 0}) Plástico(${rowData.plastico_qtd || 0}) Branca(${rowData.caixa_branca_qtd || 0})\n`;
        if (rowData.retorno_pecas === 1) materiaisTooltip += `• Retorno de Peças: ${rowData.pecas_desc || 'Sim'}`;
        if (!materiaisTooltip) materiaisTooltip = 'Nenhum material registrado';

        // Construção do resumo para o tooltip de Devoluções
        let devolucoesTooltip = '';
        for (let i = 1; i <= 4; i++) {
            if (rowData[`cliente${i}`] || rowData[`nf_dev${i}`]) {
                const cli = rowData[`cliente${i}`] || `Cliente ${i}`;
                const mot = rowData[`motivo${i}`] || 'Motivo N/I';
                const paes = `${rowData[`frances_diurno${i}`] || 0}D/${rowData[`frances_noturno${i}`] || 0}N`;
                const variedades = rowData[`variedades${i}`] ? `\n  ↳ Variedades: ${rowData[`variedades${i}`]}` : '';
                devolucoesTooltip += `• ${cli}: ${mot} (${paes})${variedades}\n`;
            }
        }
        if (!devolucoesTooltip) devolucoesTooltip = 'Nenhuma devolução registrada';

        const tr = document.createElement('tr');
        tr.dataset.rowIndex = index;

        // Cria as células principais
        tr.innerHTML = `
            <td style="text-align: center; vertical-align: middle;"><input type="checkbox" class="row-selector" data-index="${index}"></td>
            <td><input type="text" value="${rowData.placa || ''}" data-field="placa"></td>
            <td><input type="text" value="${rowData.rota || ''}" data-field="rota"></td>
            <td><input type="text" value="${rowData.operador_recebimento || ''}" data-field="operador_recebimento"></td>
            <td><input type="text" value="${rowData.nome_mot || ''}" data-field="nome_mot"></td>
            <td><input type="time" value="${rowData.hora_mot || ''}" data-field="hora_mot"></td>
            <td><input type="text" value="${rowData.nome_aux || ''}" data-field="nome_aux"></td>
            <td><input type="time" value="${rowData.hora_aux || ''}" data-field="hora_aux"></td>
            <td><input type="text" value="${rowData.nome_terceiro || ''}" data-field="nome_terceiro"></td>
            <td><input type="time" value="${rowData.hora_terceiro || ''}" data-field="hora_terceiro"></td>
            <td>
                <div class="cell-action-container">
                    <button class="btn-modal-action btn-materiais" title="${materiaisTooltip.trim()}">Materiais</button>
                    ${whatsappPartsIcon}
                </div>
            </td>
            <td>
                <div class="cell-action-container">
                    <button class="btn-modal-action btn-devolucoes" title="${devolucoesTooltip.trim()}">Devoluções</button>
                    ${whatsappBreadIcon}
                </div>
            </td>
            <td><input type="text" value="${rowData.obs || ''}" data-field="obs"></td>
            <td><button class="btn-custom btn-delete-row"><i class="fas fa-trash"></i></button></td>
        `;
        
        // Aplica o estilo condicional na linha APÓS os inputs serem criados
        applyRowStyle(tr, rowData);

        // Adiciona listener para salvar alterações nos inputs diretamente no objeto de dados
        tr.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', async (e) => {
                const field = e.target.dataset.field;
                gridData[index][field] = e.target.value;
                if (field.startsWith('hora_')) {
                    applyRowStyle(e.target.closest('tr'), gridData[index]);
                }
                await saveRow(index);
            });
        });

        tbody.appendChild(tr);
    });
}

/**
 * Abre o modal de devoluções e preenche com os dados da linha selecionada.
 * @param {number} index - O índice da linha em `gridData`.
 */
function openDevolucoesModal(index) {
    currentRowIndex = index;
    const rowData = gridData[index];
    const modal = document.getElementById('modalDevolucoes');

    // --- Handle centralized supervisor fields ---
    const supervisorCienteSelect = document.getElementById('supervisorCienteDevolucao');
    const nomeSupervisorSelect = document.getElementById('nomeSupervisorDevolucao');
    
    // Populate supervisor names dropdown
    nomeSupervisorSelect.innerHTML = '<option value="">Selecione o Supervisor</option>';
    supervisoresCache.forEach(sup => {
        nomeSupervisorSelect.add(new Option(sup, sup));
    });

    // Set initial values from rowData
    supervisorCienteSelect.value = (rowData.supervisor_ciente === true || rowData.supervisor_ciente === 1) ? 'true' : 'false';
    nomeSupervisorSelect.value = rowData.nome_supervisor || '';
    // --- END ---

    for (let i = 1; i <= 4; i++) {
        const tabContent = document.getElementById(`tab-cliente-${i}`);
        tabContent.innerHTML = `
            <h4>Detalhes do Cliente ${i}</h4>
            <div class="form-grid-2-cols">
                <div class="form-group">
                    <label>Cliente</label>
                    <input type="text" class="glass-input" data-field="cliente${i}" value="${rowData[`cliente${i}`] || ''}">
                </div>
                <div class="form-group">
                    <label>NF Devolvida</label>
                    <input type="text" class="glass-input" data-field="nf_dev${i}" value="${rowData[`nf_dev${i}`] || ''}">
                </div>
                <div class="form-group">
                    <label>Francês Diurno</label>
                    <input type="number" class="glass-input" data-field="frances_diurno${i}" value="${rowData[`frances_diurno${i}`] || ''}">
                </div>
                <div class="form-group">
                    <label>Francês Noturno</label>
                    <input type="number" class="glass-input" data-field="frances_noturno${i}" value="${rowData[`frances_noturno${i}`] || ''}">
                </div>
                 <div class="form-group">
                    <label>Variedades</label>
                    <input type="text" class="glass-input" data-field="variedades${i}" value="${rowData[`variedades${i}`] || ''}" placeholder="Texto livre...">
                </div>
                <div class="form-group">
                    <label>Motivo</label>
                    <select class="glass-input" data-field="motivo${i}">
                        <option value="" ${!rowData[`motivo${i}`] ? 'selected' : ''}>Selecione</option>
                        <option value="AVARIA" ${rowData[`motivo${i}`] === 'AVARIA' ? 'selected' : ''}>AVARIA</option>
                        <option value="DEVOLUÇÃO" ${rowData[`motivo${i}`] === 'DEVOLUÇÃO' ? 'selected' : ''}>DEVOLUÇÃO</option>
                        <option value="FALTOU TEMPO HÁBIL" ${rowData[`motivo${i}`] === 'FALTOU TEMPO HÁBIL' ? 'selected' : ''}>FALTOU TEMPO HÁBIL</option>
                        <option value="PRODUTO INVERTIDO" ${rowData[`motivo${i}`] === 'PRODUTO INVERTIDO' ? 'selected' : ''}>PRODUTO INVERTIDO</option>
                        <option value="SOBROU CARGA" ${rowData[`motivo${i}`] === 'SOBROU CARGA' ? 'selected' : ''}>SOBROU CARGA</option>
                        <option value="TROCA" ${rowData[`motivo${i}`] === 'TROCA' ? 'selected' : ''}>TROCA</option>
                    </select>
                </div>

                 <div class="form-group form-group-full">
                    <label>Obs. NF Devolvida</label>
                    <input type="text" class="glass-input" data-field="obs_nf_dev${i}" value="${rowData[`obs_nf_dev${i}`] || ''}">
                </div>
            </div>
        `;
    }

    // Lógica das abas
    modal.querySelectorAll('.tab-link').forEach(button => {
        button.onclick = (e) => {
            modal.querySelectorAll('.tab-link, .tab-content').forEach(el => el.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab).classList.add('active');
        };
    });
    // Ativa a primeira aba por padrão
    modal.querySelector('.tab-link').click();

    modal.classList.remove('hidden');
}

/**
 * Salva os dados do modal de devoluções de volta para o `gridData`.
 */
async function saveDevolucoesData() {
    if (currentRowIndex === null) return;
    const modal = document.getElementById('modalDevolucoes');

    // --- Save centralized supervisor data ---
    const supervisorCiente = document.getElementById('supervisorCienteDevolucao').value === 'true' ? 1 : 0;
    const nomeSupervisor = document.getElementById('nomeSupervisorDevolucao').value;
    gridData[currentRowIndex].supervisor_ciente = supervisorCiente;
    gridData[currentRowIndex].nome_supervisor = nomeSupervisor || null;

    modal.querySelectorAll('.tab-content input, .tab-content select').forEach(input => {
        const field = input.dataset.field;
        if (field) {
            gridData[currentRowIndex][field] = input.value;
        }
    });
    // Salva a linha inteira após modificar os dados do modal
    await saveRow(currentRowIndex);
}

/**
 * Abre o modal de materiais e preenche com os dados da linha.
 * @param {number} index - O índice da linha em `gridData`.
 */
function openMateriaisModal(index) {
    currentRowIndex = index;
    const rowData = gridData[index];
    const modal = document.getElementById('modalMateriais');
    
    // Populate supervisor dropdown
    const supSelect = modal.querySelector('#matSupervisorPecas');
    supSelect.innerHTML = '<option value="">Selecione o Supervisor</option>';
    supervisoresCache.forEach(sup => supSelect.add(new Option(sup, sup)));
    
    const retPecas = rowData.retorno_pecas === 1;
    modal.querySelector('#matRetornoPecas').value = retPecas ? "1" : "0";
    modal.querySelector('#matSupervisorPecas').value = rowData.nome_supervisor || '';
    modal.querySelector('#matDescPecas').value = rowData.pecas_desc || '';

    const temPaletesSelect = modal.querySelector('#matTemPaletes');
    const temPaletes = rowData.paletes > 0;

    modal.querySelector('#matCarrinhos').value = rowData.carrinhos || '';
    temPaletesSelect.value = temPaletes ? 'true' : 'false';
    modal.querySelector('#matMadeira').value = rowData.madeira_qtd || '';
    modal.querySelector('#matPlastico').value = rowData.plastico_qtd || '';
    modal.querySelector('#matCaixaBranca').value = rowData.caixa_branca_qtd || '';
    modal.querySelector('#matObsCarrinhos').value = rowData.obs_carrinhos || '';
    
    // Dispara o evento change para mostrar/ocultar a seção de detalhes dos paletes
    temPaletesSelect.dispatchEvent(new Event('change'));
    modal.querySelector('#matRetornoPecas').dispatchEvent(new Event('change'));

    modal.classList.remove('hidden');
}

/**
 * Salva os dados do modal de materiais de volta para o `gridData`.
 */
async function saveMateriaisData() {
    if (currentRowIndex === null) return;
    const modal = document.getElementById('modalMateriais');
    const rowData = gridData[currentRowIndex];

    const temPaletes = modal.querySelector('#matTemPaletes').value === 'true';
    const retornoPecas = modal.querySelector('#matRetornoPecas').value === '1';

    rowData.carrinhos = modal.querySelector('#matCarrinhos').value;
    rowData.paletes = temPaletes ? 1 : 0; // Salva 1 para 'Sim', 0 para 'Não'
    rowData.retorno_pecas = retornoPecas ? 1 : 0;
    rowData.pecas_desc = retornoPecas ? modal.querySelector('#matDescPecas').value : null;
    
    if (retornoPecas) {
        rowData.nome_supervisor = modal.querySelector('#matSupervisorPecas').value;
    }

    if (temPaletes) {
        rowData.madeira_qtd = modal.querySelector('#matMadeira').value;
        rowData.plastico_qtd = modal.querySelector('#matPlastico').value;
        rowData.caixa_branca_qtd = modal.querySelector('#matCaixaBranca').value;
    } else {
        // Limpa os campos se 'Não' for selecionado
        rowData.madeira_qtd = null;
        rowData.plastico_qtd = null;
        rowData.caixa_branca_qtd = null;
    }
    rowData.obs_carrinhos = modal.querySelector('#matObsCarrinhos').value;

    // Salva a linha inteira após modificar os dados do modal
    await saveRow(currentRowIndex);
}

/**
 * Mapeia um objeto de linha da grid para o formato de payload do Supabase.
 * @param {object} rowData - Os dados da linha.
 * @param {string} dataRetorno - A data de retorno para associar ao registro.
 * @returns {object} O payload pronto para ser enviado ao Supabase.
 */
function mapRowToPayload(rowData, dataRetorno) {
    const parseNum = (val) => {
        if (val === '' || val === null || val === undefined) return null;
        const n = parseInt(val, 10);
        return isNaN(n) ? null : n;
    };

    const item = {
        data_retorno: dataRetorno,
        placa: rowData.placa ? rowData.placa.trim().toUpperCase() : null,
        rota: rowData.rota,
        operador_recebimento: rowData.operador_recebimento || getCurrentUserName(),
        
        nome_mot: rowData.nome_mot,
        hora_mot: rowData.hora_mot || null,
        nome_aux: rowData.nome_aux,
        hora_aux: rowData.hora_aux || null,
        nome_terceiro: rowData.nome_terceiro,
        hora_terceiro: rowData.hora_terceiro || null,
        
        carrinhos: parseNum(rowData.carrinhos),
        obs_carrinhos: rowData.obs_carrinhos,
        paletes: parseNum(rowData.paletes),
        madeira_qtd: parseNum(rowData.madeira_qtd),
        plastico_qtd: parseNum(rowData.plastico_qtd),
        caixa_branca_qtd: parseNum(rowData.caixa_branca_qtd),
        tipo_retorno: rowData.tipo_retorno,
        qtd_clientes: parseNum(rowData.qtd_clientes),
        
        retorno_pecas: parseNum(rowData.retorno_pecas),
        pecas_desc: rowData.pecas_desc || null,

        supervisor_ciente: rowData.supervisor_ciente === undefined ? null : parseNum(rowData.supervisor_ciente),
        nome_supervisor: rowData.nome_supervisor,
        obs: rowData.obs
    };

    if (rowData.id) {
        item.id = rowData.id;
    }

    for (let i = 1; i <= 4; i++) {
        item[`cliente${i}`] = rowData[`cliente${i}`];
        item[`frances_diurno${i}`] = parseNum(rowData[`frances_diurno${i}`]);
        item[`frances_noturno${i}`] = parseNum(rowData[`frances_noturno${i}`]);
        item[`variedades${i}`] = rowData[`variedades${i}`] || null;
        item[`motivo${i}`] = rowData[`motivo${i}`];
        item[`nf_dev${i}`] = rowData[`nf_dev${i}`];
        item[`obs_nf_dev${i}`] = rowData[`obs_nf_dev${i}`];
    }

    return item;
}

/**
 * Salva uma única linha da grid no Supabase, fornecendo feedback visual.
 * @param {number} index - O índice da linha a ser salva.
 */
async function saveRow(index) {
    const rowData = gridData[index];
    const tr = document.querySelector(`tr[data-row-index='${index}']`);

    if (!rowData || !rowData.placa || !rowData.placa.trim()) {
        console.warn("Não é possível salvar uma linha sem placa.");
        return;
    }

    const dataRetorno = document.getElementById('dataRetorno').value;
    if (!dataRetorno) {
        console.error("Data de retorno não selecionada. Não é possível salvar.");
        return;
    }

    const payload = mapRowToPayload(rowData, dataRetorno);

    try {
        if (tr) tr.classList.add('saving');

        const { data, error } = await supabaseClient
            .from('retorno_rota')
            .upsert(payload, { onConflict: 'data_retorno,placa' })
            .select()
            .single();

        if (tr) tr.classList.remove('saving');
        if (error) throw error;

        if (data) {
            gridData[index] = data;
        }
        
        if (tr) {
            tr.classList.remove('saved-error');
            tr.classList.add('saved-success');
            setTimeout(() => tr.classList.remove('saved-success'), 1500);
        }
        
    } catch (error) {
        console.error(`Erro ao salvar linha ${index}:`, error);
        if (tr) {
            tr.classList.remove('saving');
            tr.classList.add('saved-error');
        }
        alert('Erro ao salvar linha: ' + (error.message || JSON.stringify(error)));
    }
}

/**
 * Exclui uma linha da grid e do banco de dados.
 * @param {number} index - O índice da linha a ser excluída.
 */
async function deleteRow(index) {
    const rowData = gridData[index];
    
    if (rowData && rowData.id) {
        try {
            const { error } = await supabaseClient
                .from('retorno_rota')
                .delete()
                .eq('id', rowData.id);

            if (error) throw error;
        } catch (error) {
            console.error(`Erro ao excluir linha ${index} do banco de dados:`, error);
            alert('Não foi possível excluir a linha do banco de dados. A linha será removida apenas da visualização atual.');
        }
    }
    
    gridData.splice(index, 1);
    renderGrid();
}

/**
 * Salva todos os dados da grid no Supabase.
 */
async function saveAllData() {
    const dataRetorno = document.getElementById('dataRetorno').value;
    if (!dataRetorno) {
        alert('Por favor, selecione uma data.');
        return;
    }

    const validRows = gridData.filter(row => row.placa && row.placa.trim() !== '');
    if (validRows.length === 0) {
        alert('Preencha pelo menos uma linha com Placa para salvar.');
        return;
    }

    const dataToSave = validRows.map(row => mapRowToPayload(row, dataRetorno));

    try {
        // `upsert` irá inserir novas linhas ou atualizar existentes com base na chave primária (`id`)
        // ou em uma constraint UNIQUE (como `data_retorno` e `placa`).
        // É importante ter uma constraint `UNIQUE(data_retorno, placa)` na sua tabela para o upsert funcionar corretamente sem IDs.
        const { error } = await supabaseClient
            .from('retorno_rota')
            .upsert(dataToSave, { onConflict: 'data_retorno,placa' });

        if (error) throw error;

        alert('✅ Dados salvos com sucesso!');
        loadDataFromSupabase(); // Recarrega os dados para obter IDs e confirmar
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
        alert('❌ Erro ao salvar os dados: ' + (error.message || JSON.stringify(error)));
    }
}

// --- FUNÇÕES DE COMPARTILHAMENTO WHATSAPP ---

window.sharePartsReturnOnWhatsApp = function(index) {
    const item = gridData[index];
    if (!item) return;

    let message = "Olá, Segue Dados de Retorno de Materiais\n\n";
    message += `*Rota:* ${item.rota || 'N/A'}\n`;
    message += `*Placa:* ${item.placa || 'N/A'}\n`;
    message += `*SUPERVISOR:* ${item.nome_supervisor || 'N/A'}\n`;
    message += `*Descrição:* ${item.pecas_desc || 'N/A'}\n`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
};

/**
 * Gera um PDF detalhado com todas as devoluções registradas na data selecionada.
 * @param {string} type - O tipo de exportação ('pao' ou 'pecas').
 */
async function exportToPDF(type) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    const dataSelecionada = document.getElementById('dataRetorno').value;
    if (!dataSelecionada) {
        alert('Por favor, selecione uma data para exportar.');
        return;
    }
    const dataFormatada = new Date(dataSelecionada + 'T00:00:00').toLocaleDateString('pt-BR');

    // Filtrar apenas registros que possuem algum tipo de retorno/devolução
    const rowsWithReturns = gridData.filter(row => {
        if (type === 'pao') {
            return !!(row.cliente1 || row.nf_dev1 || row.frances_diurno1 || row.frances_noturno1 || row.variedades1 || row.motivo1 || row.obs_nf_dev1);
        } else if (type === 'pecas') {
            return row.retorno_pecas === 1;
        }
        return false;
    });

    if (rowsWithReturns.length === 0) {
        alert(`Nenhuma devolução de ${type === 'pao' ? 'pão' : 'peças'} encontrada para os dados atuais.`);
        return;
    }

    // --- CABEÇALHO ---
    const getLogoBase64 = async () => {
        try {
            const response = await fetch('logo.png');
            if (!response.ok) return null;
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch (e) { return null; }
    };
    const logoBase64 = await getLogoBase64();

    if (logoBase64) doc.addImage(logoBase64, 'PNG', 14, 10, 40, 15);

    doc.setFontSize(18);
    doc.setTextColor(0, 105, 55); // Verde Marquespan
    const relatorioTitulo = type === 'pao' ? 'Relatório de Devoluções de Pão' : 'Relatório de Retorno de Peças';
    doc.text(relatorioTitulo, 60, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Data de Referência: ${dataFormatada}`, 60, 27);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 283, 27, { align: 'right' });

    // --- PREPARAÇÃO DOS DADOS ---
    const tableRows = [];

    rowsWithReturns.forEach(row => {
        if (type === 'pao') {
            // Devoluções de Pão (Clientes 1 a 4)
            for (let i = 1; i <= 4; i++) {
                if (row[`cliente${i}`] || row[`nf_dev${i}`]) {
                    const detalhes = [
                        `Cliente: ${row[`cliente${i}`] || '-'}`,
                        `NF: ${row[`nf_dev${i}`] || '-'}`,
                        `Motivo: ${row[`motivo${i}`] || '-'}`,
                        `Francês (D/N): ${row[`frances_diurno${i}`] || 0} / ${row[`frances_noturno${i}`] || 0}`,
                        `Variedades: ${row[`variedades${i}`] || '-'}`,
                        `Obs: ${row[`obs_nf_dev${i}`] || '-'}`
                    ].join(' | ');

                    tableRows.push([
                        row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : '-',
                        row.operador_recebimento || '-',
                        row.rota || '-',
                        row.placa || '-',
                        row.nome_mot || '-',
                        'DEVOLUÇÃO PÃO',
                        detalhes,
                        row.nome_supervisor || '-'
                    ]);
                }
            }
        } else if (type === 'pecas') {
            // Retorno de Peças
            tableRows.push([
                row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : '-',
                row.operador_recebimento || '-',
                row.rota || '-',
                row.placa || '-',
                row.nome_mot || '-',
                'RETORNO PEÇAS',
                `Descrição: ${row.pecas_desc || 'Não informada'}`,
                row.nome_supervisor || '-'
            ]);
        }
    });

    doc.autoTable({
        startY: 35,
        head: [['Lançamento', 'Operador', 'Rota', 'Placa', 'Motorista', 'Tipo Evento', 'Descrição Detalhada para Auditoria', 'Supervisor']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [0, 105, 55], fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: {
            4: { cellWidth: 35 }, // Motorista (espaço otimizado)
            6: { cellWidth: 120 } // Descrição Detalhada para Auditoria (espaço ampliado)
        }
    });

    const filename = type === 'pao' ? `auditoria_devolucoes_pao_${dataSelecionada}.pdf` : `auditoria_retorno_pecas_${dataSelecionada}.pdf`;
    doc.save(filename);
}

window.shareBreadReturnOnWhatsApp = function(index) {
    const item = gridData[index];
    if (!item) return;

    let message = "Olá, Segue Dados de Retorno\n";
    message += `*Rota:* ${item.rota || 'N/A'}\n`;
    message += `*Placa:* ${item.placa || 'N/A'}\n`;
    message += `*SUPERVISOR:* ${item.nome_supervisor || 'N/A'}\n`;

    for (let i = 1; i <= 4; i++) {
        if (item[`cliente${i}`]) {
            message += `\n*Cliente ${i}:* ${item[`cliente${i}`]}\n`;
            message += `  *Francês Diurno:* ${item[`frances_diurno${i}`] || '0'}\n`;
            message += `  *Francês Noturno:* ${item[`frances_noturno${i}`] || '0'}\n`;
            message += `  *Variedades:* ${item[`variedades${i}`] || 'N/A'}\n`;
            message += `  *Motivo:* ${item[`motivo${i}`] || 'N/A'}\n`;
            message += `  *NFE-DEV:* ${item[`nf_dev${i}`] || 'N/A'}\n`;
            message += `  *Obs NFE-DEV:* ${item[`obs_nf_dev${i}`] || 'N/A'}\n`;
        }
    }
    message += `\n*Observação Geral:* ${item.obs || 'N/A'}\n`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
};
