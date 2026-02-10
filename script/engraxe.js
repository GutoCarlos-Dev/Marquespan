import { supabaseClient } from './supabase.js';

let currentListItems = [];
let currentListId = null;

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
});

async function criarNovaLista() {
    const nomeLista = prompt("Digite o nome da nova lista (Ex: Engraxe Semana 42):");
    if (nomeLista === null) return; // Cancelado
    
    const nomeFinal = nomeLista.trim() || `Lista de Engraxe - ${new Date().toLocaleDateString('pt-BR')}`;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;

    try {
        // 1. Criar a Lista
        const { data: lista, error: erroLista } = await supabaseClient
            .from('engraxe_listas')
            .insert([{
                nome: nomeFinal,
                usuario: usuario,
                status: 'ABERTA'
            }])
            .select()
            .single();

        if (erroLista) throw erroLista;

        // 2. Buscar Veículos Ativos
        const { data: veiculos, error: erroVeiculos } = await supabaseClient
            .from('veiculos')
            .select('placa, modelo, marca')
            .eq('situacao', 'ativo');

        if (erroVeiculos) throw erroVeiculos;

        if (!veiculos || veiculos.length === 0) {
            alert('Nenhum veículo ativo encontrado para gerar a lista.');
            return;
        }

        // 3. Criar Itens da Lista
        const itensParaInserir = veiculos.map(v => ({
            lista_id: lista.id,
            placa: v.placa,
            modelo: v.modelo,
            marca: v.marca,
            status: 'PENDENTE'
        }));

        const { error: erroItens } = await supabaseClient
            .from('engraxe_itens')
            .insert(itensParaInserir);

        if (erroItens) throw erroItens;

        alert('Lista criada com sucesso!');
        carregarListas();

    } catch (error) {
        console.error('Erro ao criar lista:', error);
        alert('Erro ao criar lista: ' + error.message);
    }
}

async function carregarListas() {
    const tbody = document.getElementById('tbodyEngraxe');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Carregando listas...</td></tr>';

    const dataIni = document.getElementById('filtroDataIni').value;
    const dataFim = document.getElementById('filtroDataFim').value;
    const status = document.getElementById('filtroStatus').value;

    try {
        let query = supabaseClient
            .from('engraxe_listas')
            .select('*')
            .order('created_at', { ascending: false });

        if (dataIni) query = query.gte('created_at', `${dataIni}T00:00:00`);
        if (dataFim) query = query.lte('created_at', `${dataFim}T23:59:59`);
        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;

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
    tbodyModal.innerHTML = '<tr><td colspan="6" style="text-align: center;">Carregando itens...</td></tr>';
    
    document.getElementById('modalEngraxe').classList.remove('hidden');

    try {
        const { data, error } = await supabaseClient
            .from('engraxe_itens')
            .select('*')
            .eq('lista_id', id);

        if (error) throw error;

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

        const { error } = await supabaseClient
            .from('engraxe_itens')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        // Atualiza array local
        const itemIndex = currentListItems.findIndex(i => i.id === id);
        if (itemIndex > -1) {
            currentListItems[itemIndex] = { ...currentListItems[itemIndex], ...updateData };
        }
        
        alert('Item atualizado!');
    } catch (error) {
        console.error('Erro ao salvar item:', error);
        alert('Erro ao salvar item.');
    }
}

window.excluirItemLista = async function(id) {
    if (!confirm('Tem certeza que deseja remover este item da lista?')) return;
    try {
        const { error } = await supabaseClient.from('engraxe_itens').delete().eq('id', id);
        if (error) throw error;
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
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (json.length === 0) return alert('Arquivo vazio.');

            const itensParaInserir = json.map(row => {
                // Normaliza chaves para maiúsculo
                const r = {};
                Object.keys(row).forEach(k => r[k.toUpperCase().trim()] = row[k]);

                return {
                    lista_id: currentListId,
                    placa: r['PLACA'] || 'SEM PLACA',
                    modelo: r['MODELO'] || '',
                    marca: r['MARCA'] || '',
                    plaquinha: r['PLAQ'] || r['PLAQUINHA'] || '',
                    seg: r['SEG'] || '',
                    km: r['KM'] ? parseInt(r['KM']) : null,
                    status: 'PENDENTE'
                };
            }).filter(i => i.placa !== 'SEM PLACA');

            if (itensParaInserir.length > 0) {
                const { error } = await supabaseClient.from('engraxe_itens').insert(itensParaInserir);
                if (error) throw error;
                
                alert(`${itensParaInserir.length} itens importados com sucesso!`);
                // Recarrega a lista
                const { data } = await supabaseClient.from('engraxe_itens').select('*').eq('lista_id', currentListId);
                currentListItems = data || [];
                renderizarItensModal(currentListItems);
            }

        } catch (err) {
            console.error('Erro na importação:', err);
            alert('Erro ao importar arquivo: ' + err.message);
        }
        e.target.value = ''; // Limpa input
    };
    reader.readAsArrayBuffer(file);
}

function fecharModal() {
    document.getElementById('modalEngraxe').classList.add('hidden');
}