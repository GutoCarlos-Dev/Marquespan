import { supabaseClient } from './supabase.js';

let allData = []; // Cache dos dados do dia
let currentItem = null; // Item sendo editado no modal

function getCurrentUserName() {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    return usuario ? usuario.nome : null;
}

document.addEventListener('DOMContentLoaded', () => {
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
        return placa.toUpperCase().includes(termoBusca) || rota.toUpperCase().includes(termoBusca);
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
    document.getElementById('matCarrinhos').value = item.carrinhos || '';
    document.getElementById('matPaletes').value = item.paletes || '';
    document.getElementById('matMadeira').value = item.madeira_qtd || '';
    document.getElementById('matPlastico').value = item.plastico_qtd || '';
    document.getElementById('matCaixaBranca').value = item.caixa_branca_qtd || '';
    document.getElementById('matObsCarrinhos').value = item.obs_carrinhos || '';

    document.getElementById('modalRetorno').classList.remove('hidden');
}

function openMateriaisModal() {
    // Apenas abre o modal de materiais. Os dados já foram preenchidos em openEditModal.
    document.getElementById('modalMateriais').classList.remove('hidden');
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
    const carrinhos = document.getElementById('matCarrinhos').value;
    const paletes = document.getElementById('matPaletes').value;
    const madeira = document.getElementById('matMadeira').value;
    const plastico = document.getElementById('matPlastico').value;
    const caixaBranca = document.getElementById('matCaixaBranca').value;
    const obsCarrinhos = document.getElementById('matObsCarrinhos').value;

    const parseNum = (val) => {
        if (val === '' || val === null || val === undefined) return null;
        const n = parseInt(val, 10);
        return isNaN(n) ? null : n;
    };

    const updateData = {
        hora_mot: horaMotorista || null,
        obs: obs || null,
        carrinhos: parseNum(carrinhos),
        paletes: parseNum(paletes),
        madeira_qtd: parseNum(madeira),
        plastico_qtd: parseNum(plastico),
        caixa_branca_qtd: parseNum(caixaBranca),
        obs_carrinhos: obsCarrinhos || null,
        operador_recebimento: getCurrentUserName(), // Adiciona o usuário que está salvando
    };

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