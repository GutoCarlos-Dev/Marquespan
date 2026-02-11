import { supabaseClient } from './supabase.js';

// Chaves para armazenamento local
const LOCAL_LISTAS_KEY = 'engraxe_listas_local';
const LOCAL_ITENS_KEY = 'engraxe_itens_local';

let currentListItems = [];
let currentListId = null;

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
    document.getElementById('btnNovoLancamento').addEventListener('click', criarNovaLista);
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
});

async function criarNovaLista() {
    const nomeLista = prompt("Digite o nome da nova lista (Ex: Engraxe Semana 42):");
    if (nomeLista === null) return; // Cancelado
    
    const nomeFinal = nomeLista.trim() || `Lista de Engraxe - ${new Date().toLocaleDateString('pt-BR')}`;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;

    try {
        // 1. Criar a Lista LOCALMENTE
        const novaLista = {
            id: Date.now().toString(), // ID único baseado em timestamp
            nome: nomeFinal,
            usuario: usuario,
            status: 'ABERTA',
            created_at: new Date().toISOString()
        };

        const listas = getLocalData(LOCAL_LISTAS_KEY);
        listas.push(novaLista);
        setLocalData(LOCAL_LISTAS_KEY, listas);

        // 2. Buscar Veículos Ativos (Mantém Supabase para origem dos dados mestre)
        const { data: veiculos, error: erroVeiculos } = await supabaseClient
            .from('veiculos')
            .select('placa, modelo, marca')
            .eq('situacao', 'ativo');

        if (erroVeiculos) throw erroVeiculos;

        if (!veiculos || veiculos.length === 0) {
            alert('Nenhum veículo ativo encontrado para gerar a lista.');
            return;
        }

        // 3. Criar Itens da Lista LOCALMENTE
        const itensParaInserir = veiculos.map(v => ({
            id: crypto.randomUUID(), // Gera ID único para o item
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

        alert('Lista criada localmente com sucesso!');
        carregarListas();

    } catch (error) {
        console.error('Erro ao criar lista:', error);
        alert('Erro ao criar lista: ' + error.message);
    }
}

async function carregarListas() {
    const tbody = document.getElementById('tbodyEngraxe');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Carregando listas locais...</td></tr>';

    const dataIni = document.getElementById('filtroDataIni').value;
    const dataFim = document.getElementById('filtroDataFim').value;
    const status = document.getElementById('filtroStatus').value;

    try {
        // Carregar do LocalStorage
        let data = getLocalData(LOCAL_LISTAS_KEY);

        // Filtragem no cliente
        if (dataIni) data = data.filter(l => l.created_at >= `${dataIni}T00:00:00`);
        if (dataFim) data = data.filter(l => l.created_at <= `${dataFim}T23:59:59`);
        if (status) data = data.filter(l => l.status === status);

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
            <td>${item.usuario || '-'}</td>
            <td><span class="badge ${item.status === 'ABERTA' ? 'badge-pendente' : 'badge-realizado'}">${item.status}</span></td>
            <td>
                <button class="btn-icon btn-edit" onclick="abrirLista('${item.id}', '${item.nome}')" title="Abrir Lista"><i class="fas fa-folder-open"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.abrirLista = async function(id, nome) {
    document.getElementById('modalTitle').textContent = `Lista: ${nome}`;
    currentListId = id;
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

function renderizarItensModal(itens) {
    const tbody = document.getElementById('tbodyModalItens');
    tbody.innerHTML = '';

    if (!itens || itens.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">Nenhum item nesta lista.</td></tr>';
        return;
    }

    itens.forEach(item => {
        const tr = document.createElement('tr');
        
        const isRealizado = item.status === 'REALIZADO';
        const isNaoRealizado = item.status === 'NAO_REALIZADO';
        const motivoDisplay = isNaoRealizado ? '' : 'none';
        
        tr.innerHTML = `
            <td>${item.placa}</td>
            <td>${item.modelo || '-'}</td>
            <td>${item.marca || '-'}</td>
            <td>
                <select class="status-select" onchange="atualizarStatusItem('${item.id}', this)">
                    <option value="PENDENTE" ${!isRealizado && !isNaoRealizado ? 'selected' : ''}>Pendente</option>
                    <option value="REALIZADO" ${isRealizado ? 'selected' : ''}>Feito</option>
                    <option value="NAO_REALIZADO" ${isNaoRealizado ? 'selected' : ''}>Não Realizado</option>
                </select>
            </td>
            <td>
                <input type="text" id="motivo-${item.id}" class="motivo-input" value="${item.motivo || ''}" placeholder="Motivo..." style="display: ${motivoDisplay}; width: 100%;">
            </td>
            <td>
                <button class="btn-icon btn-save" onclick="salvarItemIndividual('${item.id}')" title="Salvar"><i class="fas fa-save"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.atualizarStatusItem = function(id, select) {
    const motivoInput = document.getElementById(`motivo-${id}`);
    if (select.value === 'NAO_REALIZADO') {
        motivoInput.style.display = 'block';
        motivoInput.focus();
    } else {
        motivoInput.style.display = 'none';
        motivoInput.value = ''; // Limpa motivo se mudar status
    }
}

window.salvarItemIndividual = async function(id) {
    const row = document.querySelector(`button[onclick="salvarItemIndividual('${id}')"]`).closest('tr');
    const status = row.querySelector('.status-select').value;
    const motivo = document.getElementById(`motivo-${id}`).value;
    
    const dataRealizado = row.querySelector('.input-realizado').value;
    const dataProximo = row.querySelector('.input-proximo').value;
    const plaquinha = row.querySelector('.input-plaq').value;
    const seg = row.querySelector('.input-seg').value;
    const km = row.querySelector('.input-km').value;

    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;

    if (status === 'NAO_REALIZADO' && !motivo.trim()) {
        alert('Por favor, informe o motivo para não realizado.');
        return;
    }

    try {
        const updateData = {
            status: status,
            motivo: status === 'NAO_REALIZADO' ? motivo : null,
            data_realizado: dataRealizado || null, // Usa a data do input ou null
            data_proximo: dataProximo || null,
            plaquinha: plaquinha,
            seg: seg,
            km: km ? parseInt(km) : null,
            usuario_realizou: usuario
        };

        // Atualizar no LocalStorage
        const allItens = getLocalData(LOCAL_ITENS_KEY);
        const index = allItens.findIndex(i => i.id === id);
        
        if (index !== -1) {
            allItens[index] = { ...allItens[index], ...updateData };
            setLocalData(LOCAL_ITENS_KEY, allItens);
            
            // Atualiza array local da view
            const viewIndex = currentListItems.findIndex(i => i.id === id);
            if (viewIndex > -1) {
                currentListItems[viewIndex] = { ...currentListItems[viewIndex], ...updateData };
            }
            
            alert('Item atualizado localmente!');
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
                    if (['REALIZADO', 'FEITO', 'OK'].includes(statusRaw)) status = 'REALIZADO';
                    if (['NÃO REALIZADO', 'NAO REALIZADO'].includes(statusRaw)) status = 'NAO_REALIZADO';

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
                        plaquinha: r['PLAQ'] || r['PLAQUINHA'] || '',
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