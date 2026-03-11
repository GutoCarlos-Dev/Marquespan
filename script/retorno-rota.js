import { supabaseClient } from './supabase.js';

// Estado global para armazenar os dados da grid
let gridData = [];
let currentRowIndex = null; // Índice da linha sendo editada nos modais

// Mapeamento de colunas da planilha para os nomes dos campos no objeto de dados
// A ordem aqui DEVE corresponder à ordem das colunas na planilha do usuário
const COLUMN_MAP = [
    'placa', 'rota', 'operador_recebimento', 'nome_mot', 'hora_mot', 'nome_aux', 'hora_aux', 'nome_terceiro', 'hora_terceiro',
    'carrinhos', 'obs_carrinhos', 'paletes', 'madeira_qtd', 'plastico_qtd', 'caixa_branca_qtd', 'tipo_retorno', 'qtd_clientes',
    'cliente1', 'frances_diurno1', 'frances_noturno1', 'variedades1', 'motivo1', 'obs_motivo1', 'nf_dev1', 'obs_nf_dev1',
    'cliente2', 'frances_diurno2', 'frances_noturno2', 'variedades2', 'motivo2', 'obs_motivo2', 'nf_dev2', 'obs_nf_dev2',
    'cliente3', 'frances_diurno3', 'frances_noturno3', 'variedades3', 'motivo3', 'obs_motivo3', 'nf_dev3', 'obs_nf_dev3',
    'cliente4', 'frances_diurno4', 'frances_noturno4', 'variedades4', 'motivo4', 'obs_motivo4', 'nf_dev4', 'obs_nf_dev4',
    'supervisor_ciente', 'nome_supervisor', 'obs'
];

document.addEventListener('DOMContentLoaded', () => {
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
            <td>
                <input type="text" placeholder="Motorista" value="${rowData.nome_mot || ''}" data-field="nome_mot"><br>
                <input type="time" value="${rowData.hora_mot || ''}" data-field="hora_mot">
            </td>
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
                    <input type="number" class="glass-input" data-field="variedades${i}" value="${rowData[`variedades${i}`] || ''}">
                </div>
                <div class="form-group">
                    <label>Motivo</label>
                    <input type="text" class="glass-input" data-field="motivo${i}" value="${rowData[`motivo${i}`] || ''}">
                </div>
                <div class="form-group form-group-full">
                    <label>Obs. Motivo</label>
                    <input type="text" class="glass-input" data-field="obs_motivo${i}" value="${rowData[`obs_motivo${i}`] || ''}">
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
    modal.querySelectorAll('input').forEach(input => {
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

    modal.querySelector('#matCarrinhos').value = rowData.carrinhos || '';
    modal.querySelector('#matPaletes').value = rowData.paletes || '';
    modal.querySelector('#matMadeira').value = rowData.madeira_qtd || '';
    modal.querySelector('#matPlastico').value = rowData.plastico_qtd || '';
    modal.querySelector('#matCaixaBranca').value = rowData.caixa_branca_qtd || '';
    modal.querySelector('#matObsCarrinhos').value = rowData.obs_carrinhos || '';
    
    modal.classList.remove('hidden');
}

/**
 * Salva os dados do modal de materiais de volta para o `gridData`.
 */
function saveMateriaisData() {
    if (currentRowIndex === null) return;
    const modal = document.getElementById('modalMateriais');
    const rowData = gridData[currentRowIndex];

    rowData.carrinhos = modal.querySelector('#matCarrinhos').value;
    rowData.paletes = modal.querySelector('#matPaletes').value;
    rowData.madeira_qtd = modal.querySelector('#matMadeira').value;
    rowData.plastico_qtd = modal.querySelector('#matPlastico').value;
    rowData.caixa_branca_qtd = modal.querySelector('#matCaixaBranca').value;
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

    const dataToSave = gridData.map(row => ({
        ...row,
        data_retorno: dataRetorno,
        // Garante que campos numéricos sejam salvos como números
        carrinhos: parseInt(row.carrinhos) || null,
        paletes: parseInt(row.paletes) || null,
        madeira_qtd: parseInt(row.madeira_qtd) || null,
        plastico_qtd: parseInt(row.plastico_qtd) || null,
        caixa_branca_qtd: parseInt(row.caixa_branca_qtd) || null,
        qtd_clientes: parseInt(row.qtd_clientes) || null,
        frances_diurno1: parseInt(row.frances_diurno1) || null,
        frances_noturno1: parseInt(row.frances_noturno1) || null,
        variedades1: parseInt(row.variedades1) || null,
        // ... repetir para os outros clientes
    }));

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
