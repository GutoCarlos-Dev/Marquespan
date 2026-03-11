import { supabaseClient } from './supabase.js';

let allData = []; // Cache dos dados do dia
let currentItem = null; // Item sendo editado no modal
let supervisoresCache = []; // Cache para a lista de supervisores

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
    // Define a data de hoje e carrega os dados
    const dataInput = document.getElementById('dataRetornoMobile');
    dataInput.value = new Date().toISOString().split('T')[0];
    loadRetornos();

    // Listeners
    dataInput.addEventListener('change', loadRetornos);
    document.getElementById('buscaMobile').addEventListener('input', renderCards);

    // Modal Principal
    const modalRetorno = document.getElementById('modalRetorno');
    modalRetorno.querySelector('.close-button').addEventListener('click', () => modalRetorno.classList.add('hidden'));
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
    modalDevolucoes.querySelector('.close-button').addEventListener('click', () => modalDevolucoes.classList.add('hidden'));
    document.getElementById('btnSalvarDevolucoes').addEventListener('click', saveDevolucoesData);
    document.getElementById('btnAbrirModalDevolucoes').addEventListener('click', openDevolucoesModal);

    // Carrega dados auxiliares
    await carregarSupervisores();

    // Listener para o modal de materiais (paletes) na versão mobile
    document.getElementById('matTemPaletes').addEventListener('change', (e) => {
        const detailsContainer = document.getElementById('paletes-details-mobile');
        const show = e.target.value === 'true';
        detailsContainer.classList.toggle('hidden', !show);

        if (!show) {
            detailsContainer.querySelectorAll('input').forEach(input => input.value = '');
        }
    });

    // Event delegation para abrir o modal ao clicar no card
    document.getElementById('listaRetornoMobile').addEventListener('click', (e) => {
        const card = e.target.closest('.retorno-card');
        if (card) {
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
    const container = document.getElementById('listaRetornoMobile');
    container.innerHTML = `<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>`;

    if (!data) {
        container.innerHTML = `<div class="loading-placeholder">Selecione uma data.</div>`;
        return;
    }

    try {
        const { data: retornos, error } = await supabaseClient
            .from('retorno_rota')
            .select('*')
            .eq('data_retorno', data);

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

    const filteredData = allData.filter(item => {
        const placa = item.placa || '';
        const rota = item.rota || '';
        const motorista = item.nome_mot || '';
        return placa.toUpperCase().includes(termoBusca) || rota.toUpperCase().includes(termoBusca) || motorista.toUpperCase().includes(termoBusca);
    });

    if (filteredData.length === 0) {
        container.innerHTML = `<div class="loading-placeholder">Nenhum retorno encontrado.</div>`;
        return;
    }

    container.innerHTML = filteredData.map(item => {
        const isOk = !!item.hora_mot; // Verifica se o horário do motorista já foi preenchido
        const statusClass = isOk ? 'status-ok' : '';
        const iconClass = isOk ? 'fa-check-circle' : 'fa-clock';

        return `
            <div class="retorno-card ${statusClass}" data-id="${item.id}">
                <div class="card-header">
                    <h4>${item.placa || 'Sem Placa'}</h4>
                    <i class="fas ${iconClass} card-status-icon"></i>
                </div>
                <div class="card-body">
                    <p><i class="fas fa-route"></i> <strong>Rota:</strong> ${item.rota || 'N/A'}</p>
                    <p><i class="fas fa-user-tie"></i> <strong>Motorista:</strong> ${item.nome_mot || 'N/A'}</p>
                    ${isOk ? `<p><i class="fas fa-hourglass-end"></i> <strong>Retorno:</strong> ${item.hora_mot}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function openEditModal(item) {
    currentItem = item;
    document.getElementById('modalTitle').textContent = `Registrar Retorno - ${item.placa}`;
    document.getElementById('modalHoraMotorista').value = item.hora_mot || '';
    document.getElementById('modalObs').value = item.obs || '';

    // Limpa e preenche o modal de materiais
    const temPaletesSelect = document.getElementById('matTemPaletes');
    const temPaletes = item.paletes > 0;

    document.getElementById('matCarrinhos').value = item.carrinhos || '';
    temPaletesSelect.value = temPaletes ? 'true' : 'false';
    document.getElementById('matMadeira').value = item.madeira_qtd || '';
    document.getElementById('matPlastico').value = item.plastico_qtd || '';
    document.getElementById('matCaixaBranca').value = item.caixa_branca_qtd || '';
    document.getElementById('matObsCarrinhos').value = item.obs_carrinhos || '';

    // Dispara o evento change para mostrar/ocultar a seção de detalhes dos paletes
    temPaletesSelect.dispatchEvent(new Event('change'));

    document.getElementById('modalRetorno').classList.remove('hidden');
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
    supervisorCienteSelect.value = currentItem.supervisor_ciente === true ? 'true' : 'false';
    nomeSupervisorSelect.value = currentItem.nome_supervisor || '';
    // --- END ---

    for (let i = 1; i <= 4; i++) {
        const tabContent = document.getElementById(`tab-cliente-${i}`);

        tabContent.innerHTML = `
            <h4>Detalhes do Cliente ${i}</h4>
            <div class="form-grid-2-cols">
                <div class="form-group">
                    <label>Cliente</label>
                    <input type="text" class="glass-input" data-field="cliente${i}" value="${currentItem[`cliente${i}`] || ''}">
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
                    <input type="text" class="glass-input" data-field="variedades${i}" value="${currentItem[`variedades${i}`] || ''}" placeholder="Texto livre...">
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
                    <input type="text" class="glass-input" data-field="obs_nf_dev${i}" value="${currentItem[`obs_nf_dev${i}`] || ''}">
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

function saveDevolucoesData() {
    if (!currentItem) return;
    const modal = document.getElementById('modalDevolucoes');
    
    // --- Save centralized supervisor data ---
    const supervisorCiente = document.getElementById('supervisorCienteDevolucao').value === 'true';
    const nomeSupervisor = document.getElementById('nomeSupervisorDevolucao').value;
    currentItem.supervisor_ciente = supervisorCiente;
    currentItem.nome_supervisor = nomeSupervisor || null;

    // Save data from client tabs
    modal.querySelectorAll('.tab-content input, .tab-content select').forEach(input => {
        const field = input.dataset.field;
        if (field) currentItem[field] = input.value;
    });
    modal.classList.add('hidden');
    alert('Devoluções salvas localmente. Clique em "Salvar" para registrar no banco de dados.');
}

async function saveRetorno() {
    if (!currentItem) return;

    const btn = document.getElementById('btnSalvarRetorno');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    // Coleta dados do modal principal
    const horaMotorista = document.getElementById('modalHoraMotorista').value;
    const obs = document.getElementById('modalObs').value;

    // Coleta dados do modal de materiais
    const temPaletes = document.getElementById('matTemPaletes').value === 'true';
    const paletesFlag = temPaletes ? 1 : 0;
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

    const parseNum = (val) => {
        if (val === '' || val === null || val === undefined) return null;
        const n = parseInt(val, 10);
        return isNaN(n) ? null : n;
    };

    const updateData = {
        hora_mot: horaMotorista || null,
        hora_aux: horaMotorista || null, // Preenche hora do auxiliar
        hora_terceiro: horaMotorista || null, // Preenche hora do terceiro
        obs: obs || null,
        carrinhos: parseNum(carrinhos),
        paletes: paletesFlag,
        madeira_qtd: parseNum(madeira),
        plastico_qtd: parseNum(plastico),
        caixa_branca_qtd: parseNum(caixaBranca),
        obs_carrinhos: obsCarrinhos || null,
        operador_recebimento: getCurrentUserName(),
        // --- NEW: Add centralized supervisor fields to the final save payload ---
        supervisor_ciente: currentItem.supervisor_ciente || false,
        nome_supervisor: currentItem.nome_supervisor || null,
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
        const { error } = await supabaseClient
            .from('retorno_rota')
            .update(updateData)
            .eq('id', currentItem.id);

        if (error) throw error;

        // Atualiza o cache local para refletir a mudança imediatamente
        const index = allData.findIndex(d => d.id === currentItem.id);
        if (index > -1) {
            allData[index] = { ...allData[index], ...updateData };
        }

        alert('Retorno salvo com sucesso!');
        document.getElementById('modalRetorno').classList.add('hidden');
        renderCards(); // Re-renderiza os cards com o novo status

    } catch (err) {
        console.error("Erro ao salvar retorno:", err);
        alert('Erro ao salvar: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar';
        currentItem = null;
    }
}