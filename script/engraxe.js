import { supabaseClient } from './supabase.js';

// Chaves para armazenamento local
const LOCAL_LISTAS_KEY = 'engraxe_listas_local';
const LOCAL_ITENS_KEY = 'engraxe_itens_local';

let currentListItems = [];
let currentVencimentosData = []; // Cache para os dados de vencimento
let veiculosCacheNovaLista = []; // Cache para o modal de nova lista
let currentListId = null;
let sortStateNovaLista = { key: 'placa', asc: true };
let sortStateVencimentos = { key: 'diasRestantes', asc: true };

// Funções auxiliares para LocalStorage
function getLocalData(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
}

function setLocalData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) { window.location.href = 'index.html'; return; }

    // Inicializa filtros de data com o mês atual
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('filtroDataIni').value = primeiroDia.toISOString().split('T')[0];
    document.getElementById('filtroDataFim').value = hoje.toISOString().split('T')[0];

    await carregarListas();

    document.getElementById('btnBuscar').addEventListener('click', carregarListas);
    document.getElementById('btnNovoLancamento').addEventListener('click', abrirModalNovaLista);
    document.getElementById('btnCloseModal').addEventListener('click', fecharModal);
    
    // Filtro no modal
    document.getElementById('filtroModalInput').addEventListener('input', filtrarItensModal);

    // Importação no modal
    const btnImportar = document.getElementById('btnImportarListaModal');
    const fileInput = document.getElementById('fileImportarListaModal');
    if(btnImportar && fileInput) {
        btnImportar.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleImportarListaModal);
    }

    // Limpar Lista no modal
    const btnLimparLista = document.getElementById('btnLimparListaModal');
    if (btnLimparLista) {
        btnLimparLista.addEventListener('click', limparListaAtual);
    }

    // Adicionar Linha Manual
    const btnAdicionarItem = document.getElementById('btnAdicionarItemModal');
    if (btnAdicionarItem) {
        btnAdicionarItem.addEventListener('click', adicionarItemManual);
    }

    // Listener para mudança de status no modal de itens
    const tbodyModal = document.getElementById('tbodyModalItens');
    if (tbodyModal) {
        tbodyModal.addEventListener('change', (e) => {
            const listas = getLocalData(LOCAL_LISTAS_KEY);
            const listaAtual = listas.find(l => l.id === currentListId);
            const dataDaLista = listaAtual ? listaAtual.data_lista : null;

            if (e.target.classList.contains('input-status')) {
                handleStatusChange(e.target, dataDaLista);
            }

            if (e.target.classList.contains('input-seg')) {
                const row = e.target.closest('tr');
                if (e.target.value === 'OK') {
                    const statusSelect = row.querySelector('.input-status');
                    if (statusSelect && statusSelect.value !== 'OK') {
                        statusSelect.value = 'OK';
                        handleStatusChange(statusSelect, dataDaLista);
                        return;
                    }
                }
                const itemId = row.dataset.id;
                if (itemId) salvarItemIndividual(itemId);
            }
        });
    }

    // Controle de Vencimentos
    document.getElementById('btnControleVencimentos').addEventListener('click', abrirControleVencimentos);
    document.getElementById('btnCloseModalVencimentos').addEventListener('click', () => document.getElementById('modalVencimentos').classList.add('hidden'));
    document.getElementById('btnGerarListaVencidos').addEventListener('click', gerarListaComSelecionados);
    
    // Filtros do Modal de Vencimentos
    document.getElementById('filtroVencimentoFilial').addEventListener('change', filtrarTabelaVencimentos);
    document.getElementById('filtroVencimentoMarca').addEventListener('change', filtrarTabelaVencimentos);
    document.getElementById('filtroVencimentoModelo').addEventListener('change', filtrarTabelaVencimentos);
    document.getElementById('filtroVencimentoStatus').addEventListener('change', filtrarTabelaVencimentos);
    document.getElementById('chkAllVencimentos').addEventListener('change', toggleAllVencimentos);

    // Modal Nova Lista
    document.getElementById('btnCloseModalNovaLista').addEventListener('click', () => document.getElementById('modalNovaLista').classList.add('hidden'));
    document.getElementById('btnConfirmarNovaLista').addEventListener('click', confirmarCriacaoNovaLista);
    document.getElementById('filtroMarcaNovaLista').addEventListener('change', filtrarVeiculosNovaLista);
    document.getElementById('filtroModeloNovaLista').addEventListener('change', filtrarVeiculosNovaLista);
    document.getElementById('filtroPlacaNovaLista').addEventListener('input', filtrarVeiculosNovaLista);
    document.getElementById('chkAllNovaLista').addEventListener('change', toggleAllNovaLista);
    document.getElementById('dataDaLista').addEventListener('change', () => renderizarTabelaNovaLista(veiculosCacheNovaLista));

    // Listener para contador de seleção no Modal Nova Lista
    document.getElementById('modalNovaLista').addEventListener('change', (e) => {
        if (e.target.matches('.chk-veiculo-novalista') || e.target.matches('#chkAllNovaLista')) {
            const count = document.querySelectorAll('#tbodyNovaListaVeiculos .chk-veiculo-novalista:checked').length;
            const contadorSpan = document.getElementById('contadorNovaLista');
            if (contadorSpan) {
                contadorSpan.textContent = `${count} selecionado(s)`;
            }
        }
    });

    // Listener para contador de seleção no Modal Vencimentos
    document.getElementById('modalVencimentos').addEventListener('change', (e) => {
        if (e.target.matches('.chk-veiculo-vencimento') || e.target.matches('#chkAllVencimentos')) {
            const count = document.querySelectorAll('#tbodyVencimentos .chk-veiculo-vencimento:checked').length;
            const contadorSpan = document.getElementById('contadorVencimentos');
            if (contadorSpan) {
                contadorSpan.textContent = `${count} selecionado(s)`;
            }
        }
    });
});

async function abrirModalNovaLista() {
    const modal = document.getElementById('modalNovaLista');
    const tbody = document.getElementById('tbodyNovaListaVeiculos');
    const nomeInput = document.getElementById('nomeNovaLista');
    const filtroMarca = document.getElementById('filtroMarcaNovaLista');
    const filtroModelo = document.getElementById('filtroModeloNovaLista');
    const dataListaInput = document.getElementById('dataDaLista');

    // Injeção do contador
    const modalHeader = modal.querySelector('.modal-header h3');
    if (modalHeader && !document.getElementById('contadorNovaLista')) {
        const contadorSpan = document.createElement('span');
        contadorSpan.id = 'contadorNovaLista';
        contadorSpan.style.cssText = 'background-color: #e9ecef; color: #495057; padding: 4px 8px; border-radius: 10px; font-size: 0.8rem; margin-left: 15px;';
        contadorSpan.className = 'contador-selecao';
        modalHeader.appendChild(contadorSpan);
    }
    // Zera o contador ao abrir
    const contadorSpan = document.getElementById('contadorNovaLista');
    if (contadorSpan) contadorSpan.textContent = '0 selecionado(s)';

    // Injeção da funcionalidade de ordenação nos cabeçalhos
    const novaListaHeaders = modal.querySelectorAll('.glass-table th');
    const novaListaSortMap = {
        'PLACA': 'placa',
        'MARCA': 'marca',
        'MODELO': 'modelo',
        'ÚLTIMA REALIZAÇÃO': 'ultimaData',
        'PRÓXIMO VENCIMENTO': 'proximaData'
    };

    novaListaHeaders.forEach(th => {
        const key = novaListaSortMap[th.textContent.trim()];
        if (key) {
            th.dataset.sortKey = key;
            th.style.cursor = 'pointer';
            if (!th.querySelector('i')) th.innerHTML += ' <i class="fas fa-sort" style="float: right; color: #ccc;"></i>';
            th.onclick = () => ordenarVeiculosNovaLista(key);
        }
    });
    
    modal.classList.remove('hidden');
    nomeInput.value = `Engraxe Semana ${getSemanaAtual()}`;
    dataListaInput.value = new Date().toISOString().split('T')[0];

    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Carregando veículos e histórico...</td></tr>';

    try {
        const [veiculosRes, itensRes] = await Promise.all([
            supabaseClient.from('veiculos').select('placa, modelo, marca').eq('situacao', 'ativo').order('placa'),
            getLocalData(LOCAL_ITENS_KEY)
        ]);

        const { data: veiculos, error: veiculosError } = veiculosRes;
        if (veiculosError) throw veiculosError;

        const todosItens = itensRes || [];

        veiculosCacheNovaLista = (veiculos || []).map(v => {
            const itensVeiculo = todosItens.filter(i => i.placa === v.placa && i.data_realizado);
            
            let ultimaData = null;
            if (itensVeiculo.length > 0) {
                itensVeiculo.sort((a, b) => new Date(b.data_realizado) - new Date(a.data_realizado));
                ultimaData = itensVeiculo[0].data_realizado;
            }

            let proximaData = null;
            if (ultimaData) {
                const ult = new Date(ultimaData.replace(/-/g, '\/'));
                ult.setDate(ult.getDate() + 21);
                proximaData = ult.toISOString().split('T')[0];
            }

            return { ...v, ultimaData, proximaData };
        });
        
        // Popula Filtro de Marcas
        const marcas = [...new Set(veiculosCacheNovaLista.map(v => v.marca).filter(m => m))].sort();
        filtroMarca.innerHTML = '<option value="">Todas as Marcas</option>';
        marcas.forEach(m => {
            filtroMarca.add(new Option(m, m));
        });

        // Popula Filtro de Modelos
        const modelos = [...new Set(veiculosCacheNovaLista.map(v => v.modelo).filter(m => m))].sort();
        filtroModelo.innerHTML = '<option value="">Todos os Modelos</option>';
        modelos.forEach(m => {
            filtroModelo.add(new Option(m, m));
        });

        renderizarTabelaNovaLista(veiculosCacheNovaLista);

    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Erro ao carregar veículos.</td></tr>';
    }
}

function renderizarTabelaNovaLista(veiculos) {
    const tbody = document.getElementById('tbodyNovaListaVeiculos');
    const dataLista = document.getElementById('dataDaLista').value;
    tbody.innerHTML = '';
    
    if (veiculos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum veículo encontrado.</td></tr>';
        return;
    }

    veiculos.forEach(v => {
        const tr = document.createElement('tr');

        let proximoVencimentoStyle = '';
        if (v.proximaData && dataLista && v.proximaData < dataLista) {
            proximoVencimentoStyle = 'color: red; font-weight: bold;';
        }

        const ultimaDataFmt = v.ultimaData ? new Date(v.ultimaData.replace(/-/g, '\/')).toLocaleDateString('pt-BR') : '-';
        const proximaDataFmt = v.proximaData ? new Date(v.proximaData.replace(/-/g, '\/')).toLocaleDateString('pt-BR') : '-';

        tr.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" class="chk-veiculo-novalista" value="${v.placa}" data-modelo="${v.modelo}" data-marca="${v.marca}"></td>
            <td><strong>${v.placa}</strong></td>
            <td>${v.marca || '-'}</td>
            <td>${v.modelo || '-'}</td>
            <td>${ultimaDataFmt}</td>
            <td style="${proximoVencimentoStyle}">${proximaDataFmt}</td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarVeiculosNovaLista() {
    const marca = document.getElementById('filtroMarcaNovaLista').value;
    const modelo = document.getElementById('filtroModeloNovaLista').value;
    const placa = document.getElementById('filtroPlacaNovaLista').value.toLowerCase();
    
    const filtrados = veiculosCacheNovaLista.filter(v => {
        const matchMarca = !marca || v.marca === marca;
        const matchModelo = !modelo || v.modelo === modelo;
        const matchPlaca = !placa || v.placa.toLowerCase().includes(placa);
        return matchMarca && matchModelo && matchPlaca;
    });
    
    renderizarTabelaNovaLista(filtrados);
}

function toggleAllNovaLista(e) {
    const checked = e.target.checked;
    document.querySelectorAll('.chk-veiculo-novalista').forEach(chk => chk.checked = checked);
}

async function salvarListaNoStorage(nome, veiculos, dataLista) {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;

    try {
        const novaLista = {
            id: Date.now().toString(),
            nome: nome,
            usuario: usuario,
            status: 'ABERTA',
            created_at: new Date().toISOString(),
            data_lista: dataLista || new Date().toISOString().split('T')[0],
            marcasPresentes: [...new Set(veiculos.map(v => v.marca).filter(Boolean))] // Coleta marcas únicas
        };

        const listas = getLocalData(LOCAL_LISTAS_KEY);
        listas.push(novaLista);
        setLocalData(LOCAL_LISTAS_KEY, listas);

        const itensParaInserir = veiculos.map(v => ({
            id: crypto.randomUUID(),
            lista_id: novaLista.id,
            placa: v.placa,
            modelo: v.modelo,
            marca: v.marca,
            status: 'PENDENTE',
            data_realizado: null,
            data_proximo: null,
            plaquinha: '',
            seg: '',
            km: null,
            motivo: null,
            usuario_realizou: null
        }));

        const itens = getLocalData(LOCAL_ITENS_KEY);
        const novosItens = itens.concat(itensParaInserir);
        setLocalData(LOCAL_ITENS_KEY, novosItens);

        alert('Lista criada com sucesso!');
        carregarListas();

    } catch (error) {
        console.error('Erro ao criar lista:', error);
        alert('Erro ao criar lista: ' + error.message);
    }
}

async function confirmarCriacaoNovaLista() {
    const nomeInput = document.getElementById('nomeNovaLista');
    const nomeLista = nomeInput.value.trim() || `Lista de Engraxe - ${new Date().toLocaleDateString('pt-BR')}`;
    const dataLista = document.getElementById('dataDaLista').value;
    
    const selecionados = [];
    document.querySelectorAll('.chk-veiculo-novalista:checked').forEach(chk => {
        selecionados.push({
            placa: chk.value,
            modelo: chk.dataset.modelo,
            marca: chk.dataset.marca
        });
    });

    if (selecionados.length === 0) {
        return alert('Selecione pelo menos um veículo para criar a lista.');
    }
    if (!dataLista) {
        return alert('Por favor, selecione a Data da Lista.');
    }

    await salvarListaNoStorage(nomeLista, selecionados, dataLista);
    document.getElementById('modalNovaLista').classList.add('hidden');
}

function getSemanaAtual() {
    const date = new Date();
    const startDate = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startDate) / (24 * 60 * 60 * 1000));
    return Math.ceil(days / 7);
}

async function carregarListas() {
    const tbody = document.getElementById('tbodyEngraxe');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Carregando listas locais...</td></tr>';

    const dataIni = document.getElementById('filtroDataIni').value;
    const dataFim = document.getElementById('filtroDataFim').value;
    const status = document.getElementById('filtroStatus').value;

    const marcaFiltro = document.getElementById('filtroMarca').value.trim().toLowerCase();

    try {
        // Carregar do LocalStorage
        let data = getLocalData(LOCAL_LISTAS_KEY);

        // Filtragem no cliente
        if (dataIni) data = data.filter(l => l.created_at >= `${dataIni}T00:00:00`); // Corrigido: `dataIni` para `dataIni`
        if (dataFim) data = data.filter(l => l.created_at <= `${dataFim}T23:59:59`);
        if (status) data = data.filter(l => l.status === status);
        if (marcaFiltro) data = data.filter(l => l.marcasPresentes && l.marcasPresentes.some(m => m.toLowerCase().includes(marcaFiltro)));

        // Ordenação
        data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        renderizarTabelaListas(data);
    } catch (error) {
        console.error('Erro ao carregar listas:', error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderizarTabelaListas(dados) {
    const tbody = document.getElementById('tbodyEngraxe');
    tbody.innerHTML = '';
    
    if (!dados || dados.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhuma lista encontrada.</td></tr>'; 
        return; 
    }

    dados.forEach(item => {
        const tr = document.createElement('tr');
        const dataCriacao = item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '-';
        
        tr.innerHTML = `
            <td>${dataCriacao}</td>
            <td>${item.nome || 'Lista sem nome'}</td>
            <td>${item.marcasPresentes ? item.marcasPresentes.join(', ') : '-'}</td>
            <td>${item.usuario || '-'}</td>
            <td><span class="badge ${item.status === 'ABERTA' ? 'badge-pendente' : 'badge-realizado'}">${item.status}</span></td>
            <td>
                <button class="btn-icon btn-edit" onclick="abrirLista('${item.id}', '${item.nome}')" title="Abrir Lista"><i class="fas fa-folder-open"></i></button>
                <button class="btn-icon btn-edit" onclick="editarNomeLista('${item.id}', '${item.nome}')" title="Editar Nome"><i class="fas fa-pen"></i></button><button class="btn-icon btn-delete" onclick="excluirLista('${item.id}')" title="Excluir Lista"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.editarNomeLista = function(id, nomeAtual) {
    const novoNome = prompt("Novo nome da lista:", nomeAtual);
    if (novoNome === null || novoNome.trim() === "") return;

    try {
        let listas = getLocalData(LOCAL_LISTAS_KEY);
        const index = listas.findIndex(l => l.id === id);
        if (index !== -1) {
            listas[index].nome = novoNome.trim();
            setLocalData(LOCAL_LISTAS_KEY, listas);
            carregarListas();
        }
    } catch (error) {
        console.error('Erro ao editar nome:', error);
        alert('Erro ao editar nome da lista.');
    }
}

window.excluirLista = function(id) {
    if (!confirm('Tem certeza que deseja excluir esta lista e todos os seus itens? Esta ação não pode ser desfeita.')) {
        return;
    }

    try {
        // 1. Remove a lista
        let listas = getLocalData(LOCAL_LISTAS_KEY);
        listas = listas.filter(l => l.id !== id);
        setLocalData(LOCAL_LISTAS_KEY, listas);

        // 2. Remove os itens associados
        let itens = getLocalData(LOCAL_ITENS_KEY);
        itens = itens.filter(i => i.lista_id !== id);
        setLocalData(LOCAL_ITENS_KEY, itens);

        // 3. Recarrega a tabela de listas
        carregarListas();
    } catch (error) {
        console.error('Erro ao excluir lista:', error);
        alert('Erro ao excluir a lista.');
    }
}

window.abrirLista = async function(id, nome) {
    document.getElementById('modalTitle').textContent = `Lista: ${nome}`;
    currentListId = id;

    // --- Injeção do Campo Data da Lista ---
    const listas = getLocalData(LOCAL_LISTAS_KEY);
    const listaAtual = listas.find(l => l.id === id);
    const dataLista = listaAtual ? listaAtual.data_lista : '';

    const panelBody = document.querySelector('#modalEngraxe .modal-body');
    const filterContainer = document.querySelector('#modalEngraxe .filtros-container');
    let dateContainer = document.getElementById('containerDataListaDetalhes');

    if (!dateContainer) {
        dateContainer = document.createElement('div');
        dateContainer.id = 'containerDataListaDetalhes';
        dateContainer.style.cssText = 'margin-bottom: 15px; display: flex; align-items: center; gap: 10px; background: #f8f9fa; padding: 10px; border-radius: 4px; border: 1px solid #e9ecef;';
        dateContainer.className = 'data-referencia-container';
        dateContainer.innerHTML = `
            <label for="dataListaDetalhes" style="font-weight: bold; color: #333;">Data de Referência:</label>
            <input type="date" id="dataListaDetalhes" class="form-control" style="padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px; background-color: #e9ecef;" readonly>
            <label for="dataListaDetalhes">Data de Referência:</label>
            <input type="date" id="dataListaDetalhes" class="form-control" readonly>
            <small style="color: #666;">(Usada para calcular vencimentos)</small>
        `;
        if (panelBody && filterContainer) {
            panelBody.insertBefore(dateContainer, filterContainer);
        }
    }

    const dateInput = document.getElementById('dataListaDetalhes');
    if (dateInput) {
        const newDateInput = dateInput.cloneNode(true); // Remove listeners antigos
        dateInput.parentNode.replaceChild(newDateInput, dateInput);
        newDateInput.value = dataLista;
        newDateInput.readOnly = true;
        newDateInput.style.backgroundColor = "#e9ecef";
    }
    // --- Fim da Injeção ---

    // --- Injeção do Botão Finalizar Lista ---
    let btnFinalizar = document.getElementById('btnFinalizarLista');
    if (!btnFinalizar && filterContainer) {
        btnFinalizar = document.createElement('button');
        btnFinalizar.id = 'btnFinalizarLista';
        btnFinalizar.style.cssText = 'padding: 8px 15px; display: flex; align-items: center; gap: 5px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: auto;';
        btnFinalizar.innerHTML = '<i class="fas fa-check"></i> Finalizar Lista';
        btnFinalizar.className = 'btn-glass btn-green';
        filterContainer.appendChild(btnFinalizar);
    }

    if (btnFinalizar) {
        // Clona o botão para remover listeners antigos
        const newBtn = btnFinalizar.cloneNode(true);
        btnFinalizar.parentNode.replaceChild(newBtn, btnFinalizar);
        
        // Verifica o status atual para ajustar o botão
        if (listaAtual && listaAtual.status === 'FINALIZADA') {
            newBtn.className = 'btn-glass btn-yellow';
            newBtn.disabled = false;
            newBtn.innerHTML = '<i class="fas fa-undo"></i> Reabrir Lista';
            newBtn.style.backgroundColor = ''; // Remove inline
            newBtn.style.color = ''; // Remove inline
            newBtn.style.cursor = 'pointer';

            
            newBtn.addEventListener('click', () => {
                if (confirm('Deseja reabrir esta lista? O status voltará para ABERTA.')) {
                    const listasLocal = getLocalData(LOCAL_LISTAS_KEY);
                    const idx = listasLocal.findIndex(l => l.id === currentListId);
                    if (idx !== -1) {
                        listasLocal[idx].status = 'ABERTA';
                        setLocalData(LOCAL_LISTAS_KEY, listasLocal);
                        alert('Lista reaberta com sucesso!');
                        document.getElementById('modalEngraxe').classList.add('hidden');
                        carregarListas();
                    }
                }
            });
        } else {
            newBtn.className = 'btn-glass btn-green';
            newBtn.disabled = false;
            newBtn.innerHTML = '<i class="fas fa-check"></i> Finalizar Lista';
            newBtn.style.backgroundColor = ''; // Remove inline
            newBtn.style.color = ''; // Remove inline
            newBtn.style.cursor = 'pointer';
            
            newBtn.addEventListener('click', () => {
                if (confirm('Tem certeza que deseja finalizar esta lista? O status será alterado para FINALIZADA.')) {
                    const listasLocal = getLocalData(LOCAL_LISTAS_KEY);
                    const idx = listasLocal.findIndex(l => l.id === currentListId);
                    if (idx !== -1) {
                        listasLocal[idx].status = 'FINALIZADA';
                        setLocalData(LOCAL_LISTAS_KEY, listasLocal);
                        alert('Lista finalizada com sucesso!');
                        document.getElementById('modalEngraxe').classList.add('hidden');
                        carregarListas();
                    }
                }
            });
        }
    }
    // --- Fim da Injeção Botão ---

    const tbodyModal = document.getElementById('tbodyModalItens');
    tbodyModal.innerHTML = '<tr><td colspan="10" style="text-align: center;">Carregando itens locais...</td></tr>';
    
    document.getElementById('modalEngraxe').classList.remove('hidden');

    try {
        // Carregar itens do LocalStorage
        const allItens = getLocalData(LOCAL_ITENS_KEY);
        const data = allItens.filter(i => i.lista_id === id);

        currentListItems = data;
        renderizarItensModal(data);

    } catch (error) {
        console.error('Erro ao carregar itens:', error);
        tbodyModal.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Erro ao carregar itens.</td></tr>';
    }
}

function adicionarItemManual() {
    if (!currentListId) return alert('Nenhuma lista selecionada.');
    
    const novoItem = {
        id: crypto.randomUUID(),
        lista_id: currentListId,
        placa: '',
        modelo: '',
        marca: '',
        status: 'PENDENTE',
        data_realizado: null,
        data_proximo: null,
        plaquinha: '',
        seg: '',
        km: null,
        motivo: null,
        usuario_realizou: null
    };

    // Atualiza LocalStorage
    const allItens = getLocalData(LOCAL_ITENS_KEY);
    allItens.push(novoItem);
    setLocalData(LOCAL_ITENS_KEY, allItens);

    // Atualiza View
    currentListItems.push(novoItem);
    renderizarItensModal(currentListItems);
}

function renderizarItensModal(itens) {
    const tbody = document.getElementById('tbodyModalItens');
    tbody.innerHTML = '';

    if (!itens || itens.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">Nenhum item nesta lista.</td></tr>';
        return;
    }

    itens.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        
        const formatDate = (d) => {
            if (!d) return '';
            if (d.includes('T')) return d.split('T')[0];
            return d;
        };
        
        tr.innerHTML = `
            <td><input type="text" class="glass-input input-placa" value="${item.placa || ''}" style="width: 90px; text-transform: uppercase; padding: 2px 5px; height: 28px;" placeholder="PLACA"></td>
            <td><input type="text" class="glass-input input-modelo" value="${item.modelo || ''}" style="width: 100px; padding: 2px 5px; height: 28px;" placeholder="MODELO"></td>
            <td><input type="text" class="glass-input input-marca" value="${item.marca || ''}" style="width: 90px; padding: 2px 5px; height: 28px;" placeholder="MARCA"></td>
            <td>
                <input type="date" class="glass-input input-realizado" value="${formatDate(item.data_realizado)}" onchange="window.calcularProximaData(this)" style="width: 130px; padding: 2px 5px; height: 28px;">
            </td>
            <td>
                <input type="date" class="glass-input input-proximo" value="${formatDate(item.data_proximo)}" readonly style="background-color: #e9ecef; width: 130px; padding: 2px 5px; height: 28px;">
            </td>
            <td>
                <select class="glass-input input-plaquinha" style="width: 100%; padding: 2px 5px; height: 28px;">
                    <option value="">-</option>
                    <option value="SIM" ${item.plaquinha === 'SIM' ? 'selected' : ''}>SIM</option>
                    <option value="NAO" ${item.plaquinha === 'NAO' ? 'selected' : ''}>NÃO</option>
                </select>
            </td>
            <td>
                <select class="glass-input input-status" style="width: 100%; padding: 2px 5px; height: 28px;">
                    <option value="PENDENTE" ${!item.status || item.status === 'PENDENTE' ? 'selected' : ''}>PENDENTE</option>
                    <option value="OK" ${item.status === 'OK' || item.status === 'REALIZADO' ? 'selected' : ''}>OK</option>
                    <option value="ROTA" ${item.status === 'ROTA' ? 'selected' : ''}>ROTA</option>
                    <option value="INTERNADO" ${item.status === 'INTERNADO' ? 'selected' : ''}>INTERNADO</option>
                </select>
            </td>
            <td>
                <select class="glass-input input-seg" style="width: 100%; padding: 2px 5px; height: 28px;">
                    <option value="">-</option>
                    <option value="OK" ${item.seg === 'OK' ? 'selected' : ''}>OK</option>
                    <option value="PENDENTE" ${item.seg === 'PENDENTE' ? 'selected' : ''}>PENDENTE</option>
                </select>
            </td>
            <td>
                <input type="number" class="glass-input input-km" value="${item.km || ''}" placeholder="KM" style="width: 80px; padding: 2px 5px; height: 28px;">
            </td>
            <td>
                <button class="btn-icon btn-save" onclick="salvarItemIndividual('${item.id}')" title="Salvar"><i class="fas fa-save"></i></button>
                <button class="btn-icon btn-delete" onclick="excluirItemLista('${item.id}')" title="Excluir" style="color: #dc3545; margin-left: 5px;"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.calcularProximaData = function(inputRealizado) {
    const row = inputRealizado.closest('tr');
    const inputProximo = row.querySelector('.input-proximo');
    
    if (inputRealizado.value) {
        const data = new Date(inputRealizado.value);
        data.setDate(data.getDate() + 21); // +21 dias
        inputProximo.value = data.toISOString().split('T')[0];
    } else {
        inputProximo.value = '';
    }
}

function handleStatusChange(selectElement, dataDaLista) {
    if (selectElement.value === 'OK') {
        if (!dataDaLista) {
            alert('A "Data da Lista" não foi encontrada. Não é possível preencher a data de realização automaticamente.');
            // Reverte o select para evitar confusão
            selectElement.value = 'PENDENTE'; 
            return;
        }

        const row = selectElement.closest('tr');
        const inputRealizado = row.querySelector('.input-realizado');
        
        if (inputRealizado) {
            // Define a data "REALIZADO"
            inputRealizado.value = dataDaLista;
            
            // Dispara o cálculo para "PRÓXIMO"
            window.calcularProximaData(inputRealizado);

            // Salva a linha automaticamente
            const itemId = row.dataset.id;
            if (itemId) {
                salvarItemIndividual(itemId);
            }
        }
    }
}

window.salvarItemIndividual = async function(id) {
    const btn = document.querySelector(`button[onclick="salvarItemIndividual('${id}')"]`);
    const row = btn.closest('tr');
    
    const placa = row.querySelector('.input-placa').value.toUpperCase();
    const modelo = row.querySelector('.input-modelo').value;
    const marca = row.querySelector('.input-marca').value;
    const dataRealizado = row.querySelector('.input-realizado').value;
    const dataProximo = row.querySelector('.input-proximo').value;
    const plaquinha = row.querySelector('.input-plaquinha').value;
    const status = row.querySelector('.input-status').value;
    const seg = row.querySelector('.input-seg').value;
    const km = row.querySelector('.input-km').value;

    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;

    try {
        const updateData = {
            placa: placa,
            modelo: modelo,
            marca: marca,
            data_realizado: dataRealizado || null,
            data_proximo: dataProximo || null,
            plaquinha: plaquinha,
            status: status,
            seg: seg,
            km: km ? parseInt(km) : null,
            usuario_realizou: usuario
        };

        // Atualizar no LocalStorage
        let allItens = getLocalData(LOCAL_ITENS_KEY);
        const index = allItens.findIndex(i => i.id === id);
        
        if (index !== -1) {
            allItens[index] = { ...allItens[index], ...updateData };
            setLocalData(LOCAL_ITENS_KEY, allItens);
            
            // Atualiza array local da view
            const viewIndex = currentListItems.findIndex(i => i.id === id);
            if (viewIndex > -1) {
                currentListItems[viewIndex] = { ...currentListItems[viewIndex], ...updateData };
            }
            
            // Feedback visual
            const originalIcon = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check" style="color: green;"></i>';
            setTimeout(() => btn.innerHTML = originalIcon, 1500);
        } else {
            alert('Item não encontrado no armazenamento local.');
        }
    } catch (error) {
        console.error('Erro ao salvar item:', error);
        alert('Erro ao salvar item.');
    }
}

window.excluirItemLista = async function(id) {
    if (!confirm('Tem certeza que deseja remover este item da lista?')) return;
    try {
        // Remover do LocalStorage
        let allItens = getLocalData(LOCAL_ITENS_KEY);
        allItens = allItens.filter(i => i.id !== id);
        setLocalData(LOCAL_ITENS_KEY, allItens);

        // Remove do array local e re-renderiza
        currentListItems = currentListItems.filter(i => i.id !== id);
        renderizarItensModal(currentListItems);
    } catch (error) { console.error(error); alert('Erro ao excluir item.'); }
}

function filtrarItensModal() {
    const termo = document.getElementById('filtroModalInput').value.toLowerCase();
    const itensFiltrados = currentListItems.filter(item => 
        (item.marca && item.marca.toLowerCase().includes(termo)) || 
        (item.modelo && item.modelo.toLowerCase().includes(termo)) ||
        (item.placa && item.placa.toLowerCase().includes(termo))
    );
    renderizarItensModal(itensFiltrados);
}

async function handleImportarListaModal(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!currentListId) return alert('Nenhuma lista selecionada.');

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            // Ler com cellDates: true para garantir datas corretas
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            
            let allItensParaInserir = [];

            // Itera sobre todas as abas (ACCELO, VOLVO, etc.)
            workbook.SheetNames.forEach(sheetName => {
                const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                
                const itensSheet = json.map(row => {
                    // Normaliza chaves para maiúsculo
                    const r = {};
                    Object.keys(row).forEach(k => r[k.toUpperCase().trim()] = row[k]);

                    // Normalização de Status
                    let statusRaw = (r['STATUS'] || 'PENDENTE').toString().toUpperCase().trim();
                    let status = 'PENDENTE';
                    if (['REALIZADO', 'FEITO', 'OK'].includes(statusRaw)) status = 'OK';
                    if (['ROTA'].includes(statusRaw)) status = 'ROTA';
                    if (['INTERNADO'].includes(statusRaw)) status = 'INTERNADO';

                    // Formatação de Data Robusta
                    const formatDate = (val) => {
                        if (!val) return null;
                        
                        // Se já for objeto Date (graças ao cellDates: true)
                        if (val instanceof Date) {
                            // Garante UTC para evitar problemas de fuso horário (dia anterior)
                            return new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate())).toISOString();
                        }

                        // Se for string
                        if (typeof val === 'string') {
                            const cleanVal = val.trim();
                            // Tenta formato PT-BR DD/MM/YYYY
                            if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(cleanVal)) {
                                const parts = cleanVal.split('/');
                                // Cria data (Mês é 0-indexado)
                                const d = new Date(Date.UTC(parts[2], parts[1] - 1, parts[0]));
                                if (!isNaN(d.getTime())) return d.toISOString();
                            }
                            
                            // Tenta parse normal (YYYY-MM-DD ou ISO)
                            const d = new Date(cleanVal);
                            if (!isNaN(d.getTime())) return d.toISOString();
                        }

                        return null;
                    };

                    return {
                        id: crypto.randomUUID(),
                        lista_id: currentListId,
                        placa: r['PLACA'] || 'SEM PLACA',
                        modelo: r['MODELO'] || '',
                        marca: r['MARCA'] || '',
                        plaquinha: r['PLAQ'] || r['PLAQUINHA'] || r['PLAQUETA'] || '',
                        seg: r['SEG'] || '',
                        km: r['KM'] ? parseInt(r['KM']) : null,
                        data_realizado: formatDate(r['REALIZADO']),
                        data_proximo: formatDate(r['PRÓXIMO'] || r['PROXIMO']),
                        status: status,
                        motivo: null
                    };
                }).filter(i => i.placa !== 'SEM PLACA');

                allItensParaInserir = allItensParaInserir.concat(itensSheet);
            });

            if (allItensParaInserir.length > 0) {
                // Salvar no LocalStorage
                const itens = getLocalData(LOCAL_ITENS_KEY);
                const novosItens = itens.concat(allItensParaInserir);
                setLocalData(LOCAL_ITENS_KEY, novosItens);
                
                alert(`${allItensParaInserir.length} itens importados localmente com sucesso!`);
                
                // Exibe apenas os itens importados na tela
                currentListItems = allItensParaInserir;
                renderizarItensModal(currentListItems);
            } else {
                alert('Nenhum item válido encontrado no arquivo.');
            }

        } catch (err) {
            console.error('Erro na importação:', err);
            alert('Erro ao importar arquivo: ' + err.message);
        }
        e.target.value = ''; // Limpa input
    };
    reader.readAsArrayBuffer(file);
}

async function limparListaAtual() {
    if (!currentListId) return;
    if (!confirm('Tem certeza que deseja remover TODOS os itens desta lista? Esta ação não pode ser desfeita.')) return;

    try {
        // Remover do LocalStorage
        let allItens = getLocalData(LOCAL_ITENS_KEY);
        const novosItens = allItens.filter(i => i.lista_id !== currentListId);
        setLocalData(LOCAL_ITENS_KEY, novosItens);

        // Atualiza view
        currentListItems = [];
        renderizarItensModal(currentListItems);
    } catch (error) {
        console.error('Erro ao limpar lista:', error);
        alert('Erro ao limpar lista.');
    }
}

function fecharModal() {
    document.getElementById('modalEngraxe').classList.add('hidden');
}

// --- LÓGICA DE CONTROLE DE VENCIMENTOS ---

async function abrirControleVencimentos() {
    const modal = document.getElementById('modalVencimentos');
    const tbody = document.getElementById('tbodyVencimentos');

    // Injeção do contador
    const modalHeader = modal.querySelector('.modal-header h3');
    if (modalHeader && !document.getElementById('contadorVencimentos')) {
        const contadorSpan = document.createElement('span');
        contadorSpan.id = 'contadorVencimentos';
        contadorSpan.style.cssText = 'background-color: #e9ecef; color: #495057; padding: 4px 8px; border-radius: 10px; font-size: 0.8rem; margin-left: 15px;';
        contadorSpan.className = 'contador-selecao';
        modalHeader.appendChild(contadorSpan);
    }
    // Zera o contador ao abrir
    const contadorSpan = document.getElementById('contadorVencimentos');
    if (contadorSpan) contadorSpan.textContent = '0 selecionado(s)';

    // Injeção da funcionalidade de ordenação nos cabeçalhos
    const vencimentosHeaders = modal.querySelectorAll('#tabelaVencimentos th');
    const vencimentosSortMap = {
        'FILIAL': 'filial',
        'PLACA': 'placa',
        'MARCA': 'marca',
        'MODELO': 'modelo',
        'DATA REALIZAÇÃO (Última)': 'ultimaData',
        'PRÓXIMO (Vencimento)': 'proximaData',
        'STATUS': 'status'
    };

    vencimentosHeaders.forEach(th => {
        const key = vencimentosSortMap[th.textContent.trim()];
        if (key) {
            th.dataset.sortKey = key;
            th.style.cursor = 'pointer';
            if (!th.querySelector('i')) th.innerHTML += ' <i class="fas fa-sort" style="float: right; color: #ccc;"></i>';
            th.onclick = () => ordenarVencimentos(key);
        }
    });

    // Injeta o campo de Data se não existir
    const btnGerar = document.getElementById('btnGerarListaVencidos');
    if (btnGerar && !document.getElementById('dataListaVencimentos')) {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-right: 10px;';
        container.className = 'data-lista-container';
        container.innerHTML = `
            <label for="dataListaVencimentos" style="font-weight: bold; color: #333; white-space: nowrap;">Data da Lista:</label>
            <input type="date" id="dataListaVencimentos" class="form-control" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <label for="dataListaVencimentos">Data da Lista:</label>
            <input type="date" id="dataListaVencimentos" class="form-control">
        `;
        btnGerar.parentNode.insertBefore(container, btnGerar);
        btnGerar.parentNode.style.display = 'flex';
        btnGerar.parentNode.style.alignItems = 'center';
        btnGerar.parentNode.style.justifyContent = 'flex-end';
        document.getElementById('dataListaVencimentos').value = new Date().toISOString().split('T')[0];
    }

    modal.classList.remove('hidden');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Carregando dados da frota e histórico...</td></tr>';

    try {
        // 1. Buscar Veículos Ativos com Filial
        const { data: veiculos, error } = await supabaseClient
            .from('veiculos')
            .select('id, placa, modelo, marca, filial')
            .eq('situacao', 'ativo')
            .order('placa');

        if (error) throw error;

        // 2. Buscar Histórico Local de Engraxe
        const todosItens = getLocalData(LOCAL_ITENS_KEY);

        // 3. Processar Dados (Cruzar Veículos com Histórico)
        currentVencimentosData = veiculos.map(v => {
            // Filtra itens deste veículo que tenham data realizada válida
            const itensVeiculo = todosItens.filter(i => i.placa === v.placa && i.data_realizado);
            
            // Encontra a data mais recente
            let ultimaData = null;
            if (itensVeiculo.length > 0) {
                // Ordena decrescente por data
                itensVeiculo.sort((a, b) => new Date(b.data_realizado) - new Date(a.data_realizado));
                ultimaData = itensVeiculo[0].data_realizado;
            }

            let proximaData = null;
            let status = 'PENDENTE'; // Default se nunca fez
            let diasRestantes = -999;

            if (ultimaData) {
                const ult = new Date(ultimaData);
                const prox = new Date(ult);
                prox.setDate(prox.getDate() + 21); // Regra de 21 dias
                proximaData = prox.toISOString().split('T')[0];

                const hoje = new Date();
                hoje.setHours(0,0,0,0);
                const proxDate = new Date(prox);
                proxDate.setHours(0,0,0,0);

                const diffTime = proxDate - hoje;
                diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diasRestantes < 0) status = 'VENCIDO';
                else status = 'EM_DIA';
            }

            return {
                ...v,
                ultimaData: ultimaData ? ultimaData.split('T')[0] : null,
                proximaData,
                status,
                diasRestantes
            };
        });

        // Ordenar: Vencidos primeiro, depois Pendentes, depois Em Dia
        currentVencimentosData.sort((a, b) => {
            const score = (s) => s === 'VENCIDO' ? 0 : (s === 'PENDENTE' ? 1 : 2);
            return score(a.status) - score(b.status) || a.diasRestantes - b.diasRestantes;
        });

        popularFiltrosVencimentos();
        renderizarTabelaVencimentos(currentVencimentosData);

    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Erro ao carregar dados.</td></tr>';
    }
}

function popularFiltrosVencimentos() {
    const dados = currentVencimentosData;
    const filiais = [...new Set(dados.map(d => d.filial).filter(Boolean))].sort();
    const marcas = [...new Set(dados.map(d => d.marca).filter(Boolean))].sort();
    const modelos = [...new Set(dados.map(d => d.modelo).filter(Boolean))].sort();

    const populate = (id, items, defaultText) => {
        const sel = document.getElementById(id);
        const currentVal = sel.value;
        sel.innerHTML = `<option value="">${defaultText}</option>`;
        items.forEach(i => sel.add(new Option(i, i)));
        if (items.includes(currentVal)) sel.value = currentVal;
    };

    populate('filtroVencimentoFilial', filiais, 'Todas Filiais');
    populate('filtroVencimentoMarca', marcas, 'Todas Marcas');
    populate('filtroVencimentoModelo', modelos, 'Todos Modelos');
}

function renderizarTabelaVencimentos(dados) {
    const tbody = document.getElementById('tbodyVencimentos');
    tbody.innerHTML = '';

    if (dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhum veículo encontrado.</td></tr>';
        return;
    }

    dados.forEach(item => {
        const tr = document.createElement('tr');
        let statusColor = '#6c757d'; // Cinza (Pendente)
        if (item.status === 'VENCIDO') statusColor = '#dc3545'; // Vermelho
        if (item.status === 'EM_DIA') statusColor = '#28a745'; // Verde

        const dataRealizacaoFmt = item.ultimaData ? new Date(item.ultimaData).toLocaleDateString('pt-BR') : '-';
        const proximoFmt = item.proximaData ? new Date(item.proximaData).toLocaleDateString('pt-BR') : '-';

        tr.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" class="chk-veiculo-vencimento" value="${item.placa}" data-modelo="${item.modelo}" data-marca="${item.marca}"></td>
            <td>${item.filial || '-'}</td>
            <td><strong>${item.placa}</strong></td>
            <td>${item.marca || '-'}</td>
            <td>${item.modelo || '-'}</td>
            <td>${dataRealizacaoFmt}</td>
            <td>${proximoFmt}</td>
            <td><span class="badge" style="background-color: ${statusColor}; color: white;">${item.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarTabelaVencimentos() {
    const filial = document.getElementById('filtroVencimentoFilial').value;
    const marca = document.getElementById('filtroVencimentoMarca').value;
    const modelo = document.getElementById('filtroVencimentoModelo').value;
    const status = document.getElementById('filtroVencimentoStatus').value;

    const filtrados = currentVencimentosData.filter(item => {
        const matchFilial = !filial || item.filial === filial;
        const matchMarca = !marca || item.marca === marca;
        const matchModelo = !modelo || item.modelo === modelo;
        const matchStatus = status === 'TODOS' || item.status === status;
        return matchFilial && matchMarca && matchModelo && matchStatus;
    });

    renderizarTabelaVencimentos(filtrados);
}

function toggleAllVencimentos(e) {
    const checked = e.target.checked;
    document.querySelectorAll('.chk-veiculo-vencimento').forEach(chk => chk.checked = checked);
}

function gerarListaComSelecionados() {
    const selecionados = Array.from(document.querySelectorAll('.chk-veiculo-vencimento:checked')).map(chk => ({
        placa: chk.value,
        modelo: chk.dataset.modelo,
        marca: chk.dataset.marca
    }));

    if (selecionados.length === 0) {
        return alert('Selecione pelo menos um veículo para gerar a lista.');
    }

    const dataInput = document.getElementById('dataListaVencimentos');
    const dataLista = dataInput ? dataInput.value : new Date().toISOString().split('T')[0];

    if (!dataLista) return alert('Selecione a Data da Lista.');

    document.getElementById('modalVencimentos').classList.add('hidden');
    
    const nomeSugerido = `Lista Personalizada (${selecionados.length} veic)`;
    const nomeLista = prompt("Digite o nome da nova lista:", nomeSugerido);
    if (nomeLista === null) return;
    
    salvarListaNoStorage(nomeLista, selecionados, dataLista);
}

function ordenarVeiculosNovaLista(key) {
    if (sortStateNovaLista.key === key) {
        sortStateNovaLista.asc = !sortStateNovaLista.asc;
    } else {
        sortStateNovaLista.key = key;
        sortStateNovaLista.asc = true;
    }

    veiculosCacheNovaLista.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        if (key === 'ultimaData' || key === 'proximaData') {
            valA = valA ? new Date(valA.replace(/-/g, '\/')) : (sortStateNovaLista.asc ? new Date('2999-12-31') : new Date('1900-01-01'));
            valB = valB ? new Date(valB.replace(/-/g, '\/')) : (sortStateNovaLista.asc ? new Date('2999-12-31') : new Date('1900-01-01'));
        } else {
            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
        }

        if (valA < valB) return sortStateNovaLista.asc ? -1 : 1;
        if (valA > valB) return sortStateNovaLista.asc ? 1 : -1;
        return 0;
    });

    updateSortIconsNovaLista();
    filtrarVeiculosNovaLista();
}

function updateSortIconsNovaLista() {
    document.querySelectorAll('#modalNovaLista .glass-table th i').forEach(i => {
        i.className = 'fas fa-sort';
        i.style.color = '#ccc';
    });
    const activeTh = document.querySelector(`#modalNovaLista th[data-sort-key="${sortStateNovaLista.key}"] i`);
    if (activeTh) {
        activeTh.className = sortStateNovaLista.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
        activeTh.style.color = '#333';
    }
}

function ordenarVencimentos(key) {
    if (sortStateVencimentos.key === key) {
        sortStateVencimentos.asc = !sortStateVencimentos.asc;
    } else {
        sortStateVencimentos.key = key;
        sortStateVencimentos.asc = true;
    }

    currentVencimentosData.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        if (key === 'ultimaData' || key === 'proximaData') {
            valA = valA ? new Date(valA.replace(/-/g, '\/')) : (sortStateVencimentos.asc ? new Date('2999-12-31') : new Date('1900-01-01'));
            valB = valB ? new Date(valB.replace(/-/g, '\/')) : (sortStateVencimentos.asc ? new Date('2999-12-31') : new Date('1900-01-01'));
        } else {
            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
        }

        if (valA < valB) return sortStateVencimentos.asc ? -1 : 1;
        if (valA > valB) return sortStateVencimentos.asc ? 1 : -1;
        return 0;
    });

    updateSortIconsVencimentos();
    filtrarTabelaVencimentos();
}

function updateSortIconsVencimentos() {
    document.querySelectorAll('#tabelaVencimentos th i').forEach(i => {
        i.className = 'fas fa-sort';
        i.style.color = '#ccc';
    });
    const activeTh = document.querySelector(`#tabelaVencimentos th[data-sort-key="${sortStateVencimentos.key}"] i`);
    if (activeTh) {
        activeTh.className = sortStateVencimentos.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
        activeTh.style.color = '#333';
    }
}
