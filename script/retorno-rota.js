import { supabaseClient } from './supabase.js';

// Estado global para armazenar os dados da grid
let gridData = [];
let currentRowIndex = null; // Índice da linha sendo editada nos modais
let supervisoresCache = []; // Cache para a lista de supervisores

// Mapeamento de colunas da planilha para os nomes dos campos no objeto de dados
// A ordem aqui DEVE corresponder à ordem das colunas na planilha do usuário
const COLUMN_MAP = [
    'placa', 'rota', 'operador_recebimento', 'nome_mot', 'hora_mot', 'nome_aux', 'hora_aux', 'nome_terceiro', 'hora_terceiro',
    'carrinhos', 'obs_carrinhos', 'paletes', 'madeira_qtd', 'plastico_qtd', 'caixa_branca_qtd', 'tipo_retorno', 'qtd_clientes',
    'cliente1', 'frances_diurno1', 'frances_noturno1', 'variedades1', 'motivo1', 'nf_dev1', 'obs_nf_dev1',
    'cliente2', 'frances_diurno2', 'frances_noturno2', 'variedades2', 'motivo2', 'nf_dev2', 'obs_nf_dev2',
    'cliente3', 'frances_diurno3', 'frances_noturno3', 'variedades3', 'motivo3', 'nf_dev3', 'obs_nf_dev3',
    'cliente4', 'frances_diurno4', 'frances_noturno4', 'variedades4', 'motivo4', 'nf_dev4', 'obs_nf_dev4',
    'supervisor_ciente', 'nome_supervisor', 'obs'
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
    document.getElementById('btnAdicionarLinha').addEventListener('click', addEmptyRow);
    document.getElementById('tbodyRetornoRota').addEventListener('paste', handlePaste);
    document.getElementById('btnSalvarTudo').addEventListener('click', saveAllData);

    // Listeners dos Modais
    setupModalListeners('modalDevolucoes', 'btnSalvarDevolucoes', saveDevolucoesData);
    setupModalListeners('modalMateriais', 'btnSalvarMateriais', saveMateriaisData);

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

    // Listener para delegação de eventos na tabela
    document.getElementById('tbodyRetornoRota').addEventListener('click', handleTableClick);
});

/**
 * Configura os listeners de um modal (fechar e salvar).
 * @param {string} modalId - O ID do overlay do modal.
 * @param {string} saveBtnId - O ID do botão de salvar do modal.
 * @param {Function} saveFunction - A função a ser chamada ao salvar.
 */
function setupModalListeners(modalId, saveBtnId, saveFunction) {
    const modal = document.getElementById(modalId);
    modal.querySelector('.close-button').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => {
        if (e.target.id === modalId) modal.classList.add('hidden');
    });
    document.getElementById(saveBtnId).addEventListener('click', () => {
        saveFunction();
        modal.classList.add('hidden');
    });
}

/**
 * Lida com cliques na tabela para abrir modais ou excluir linhas.
 * @param {Event} e - O evento de clique.
 */
function handleTableClick(e) {
    const target = e.target.closest('button');
    if (!target) return;

    const rowIndex = target.closest('tr').dataset.rowIndex;

    if (target.classList.contains('btn-devolucoes')) {
        openDevolucoesModal(rowIndex);
    } else if (target.classList.contains('btn-materiais')) {
        openMateriaisModal(rowIndex);
    } else if (target.classList.contains('btn-delete-row')) {
        if (confirm('Tem certeza que deseja excluir esta linha?')) {
            gridData.splice(rowIndex, 1);
            renderGrid();
        }
    }
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
    event.preventDefault();
    const pasteData = event.clipboardData.getData('text');
    const rows = pasteData.split(/[\r\n]+/).filter(row => row.trim() !== '');

    rows.forEach(row => {
        const columns = row.split('\t');
        const newRowData = {};
        
        COLUMN_MAP.forEach((key, index) => {
            newRowData[key] = columns[index] || null;
        });
        
        // Garante que o operador seja preenchido se estiver vazio na colagem
        if (!newRowData.operador_recebimento) {
            newRowData.operador_recebimento = getCurrentUserName();
        }
        
        gridData.push(newRowData);
    });

    renderGrid();
}

/**
 * Adiciona uma nova linha vazia à grid.
 */
function addEmptyRow() {
    const newRow = {};
    COLUMN_MAP.forEach(key => newRow[key] = null);
    newRow.operador_recebimento = getCurrentUserName(); // Preenche com o usuário logado
    gridData.push(newRow);
    renderGrid();
}

/**
 * Renderiza a grid principal com os dados do array `gridData`.
 */
function renderGrid() {
    const tbody = document.getElementById('tbodyRetornoRota');
    tbody.innerHTML = '';

    gridData.forEach((rowData, index) => {
        const tr = document.createElement('tr');
        tr.dataset.rowIndex = index;

        // Cria as células principais
        tr.innerHTML = `
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
                <button class="btn-modal-action btn-materiais">Materiais</button>
            </td>
            <td>
                <button class="btn-modal-action btn-devolucoes">Devoluções</button>
            </td>
            <td><input type="text" value="${rowData.obs || ''}" data-field="obs"></td>
            <td><button class="btn-custom btn-delete-row"><i class="fas fa-trash"></i></button></td>
        `;
        
        // Adiciona listener para salvar alterações nos inputs diretamente no objeto de dados
        tr.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                gridData[index][field] = e.target.value;
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
    supervisorCienteSelect.value = rowData.supervisor_ciente === true ? 'true' : 'false';
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
function saveDevolucoesData() {
    if (currentRowIndex === null) return;
    const modal = document.getElementById('modalDevolucoes');

    // --- Save centralized supervisor data ---
    const supervisorCiente = document.getElementById('supervisorCienteDevolucao').value === 'true';
    const nomeSupervisor = document.getElementById('nomeSupervisorDevolucao').value;
    gridData[currentRowIndex].supervisor_ciente = supervisorCiente;
    gridData[currentRowIndex].nome_supervisor = nomeSupervisor || null;

    modal.querySelectorAll('.tab-content input, .tab-content select').forEach(input => {
        const field = input.dataset.field;
        if (field) {
            gridData[currentRowIndex][field] = input.value;
        }
    });
}

/**
 * Abre o modal de materiais e preenche com os dados da linha.
 * @param {number} index - O índice da linha em `gridData`.
 */
function openMateriaisModal(index) {
    currentRowIndex = index;
    const rowData = gridData[index];
    const modal = document.getElementById('modalMateriais');

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

    modal.classList.remove('hidden');
}

/**
 * Salva os dados do modal de materiais de volta para o `gridData`.
 */
function saveMateriaisData() {
    if (currentRowIndex === null) return;
    const modal = document.getElementById('modalMateriais');
    const rowData = gridData[currentRowIndex];

    const temPaletes = modal.querySelector('#matTemPaletes').value === 'true';

    rowData.carrinhos = modal.querySelector('#matCarrinhos').value;
    rowData.paletes = temPaletes ? 1 : 0; // Salva 1 para 'Sim', 0 para 'Não'

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

    // Função auxiliar para converter números mantendo o 0 (evita que 0 vire null)
    const parseNum = (val) => {
        if (val === '' || val === null || val === undefined) return null;
        const n = parseInt(val, 10);
        return isNaN(n) ? null : n;
    };

    // Filtra apenas linhas que possuem Placa preenchida para evitar salvar linhas vazias
    const validRows = gridData.filter(row => row.placa && row.placa.trim() !== '');

    if (validRows.length === 0) {
        alert('Preencha pelo menos uma linha com Placa para salvar.');
        return;
    }

    const dataToSave = validRows.map(row => {
        // Constrói um objeto limpo apenas com as colunas do banco de dados
        const item = {
            data_retorno: dataRetorno,
            placa: row.placa.trim().toUpperCase(),
            rota: row.rota,
            operador_recebimento: row.operador_recebimento || getCurrentUserName(),
            
            // Equipe
            nome_mot: row.nome_mot,
            hora_mot: row.hora_mot || null,
            nome_aux: row.nome_aux,
            hora_aux: row.hora_aux || null,
            nome_terceiro: row.nome_terceiro,
            hora_terceiro: row.hora_terceiro || null,
            
            // Materiais (Numéricos)
            carrinhos: parseNum(row.carrinhos),
            obs_carrinhos: row.obs_carrinhos,
            paletes: parseNum(row.paletes),
            madeira_qtd: parseNum(row.madeira_qtd),
            plastico_qtd: parseNum(row.plastico_qtd),
            caixa_branca_qtd: parseNum(row.caixa_branca_qtd),
            tipo_retorno: row.tipo_retorno,
            qtd_clientes: parseNum(row.qtd_clientes),
            
            // Outros
            supervisor_ciente: row.supervisor_ciente,
            nome_supervisor: row.nome_supervisor,
            obs: row.obs
        };

        // Só adiciona o ID se ele existir e for válido (evita enviar id: "" ou id: undefined incorretamente)
        if (row.id) {
            item.id = row.id;
        }

        // Processa os campos repetitivos de clientes (1 a 4)
        for (let i = 1; i <= 4; i++) {
            item[`cliente${i}`] = row[`cliente${i}`];
            item[`frances_diurno${i}`] = parseNum(row[`frances_diurno${i}`]);
            item[`frances_noturno${i}`] = parseNum(row[`frances_noturno${i}`]);
            item[`variedades${i}`] = row[`variedades${i}`] || null; // Agora é texto
            item[`motivo${i}`] = row[`motivo${i}`];
            item[`nf_dev${i}`] = row[`nf_dev${i}`];
            item[`obs_nf_dev${i}`] = row[`obs_nf_dev${i}`];
        }

        return item;
    });

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
        alert('❌ Erro ao salvar os dados. Verifique o console para mais detalhes.');
    }
}
