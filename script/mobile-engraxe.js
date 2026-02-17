import { supabaseClient } from './supabase.js';

// Chaves para armazenamento local (Mesmas do Desktop)
const LOCAL_LISTAS_KEY = 'engraxe_listas_local';
const LOCAL_ITENS_KEY = 'engraxe_itens_local';

let currentListId = null;
let currentItems = [];

// Funções auxiliares
function getLocalData(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
}

function setLocalData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

document.addEventListener('DOMContentLoaded', () => {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) { window.location.href = 'index.html'; return; }

    carregarListasMobile();

    // Navegação
    const btnVoltar = document.getElementById('btnVoltarListas');
    if (btnVoltar) {
        btnVoltar.addEventListener('click', showViewListas);
    }
    
    // Modal
    const btnFechar = document.getElementById('btnFecharModal');
    if (btnFechar) btnFechar.addEventListener('click', fecharModal);

    const btnSalvar = document.getElementById('btnSalvarItemMobile');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarItemMobile);
    
    // Filtro
    const filtro = document.getElementById('filtroVeiculoMobile');
    if (filtro) filtro.addEventListener('input', filtrarVeiculosMobile);

    // Cálculo automático de data no modal
    const editRealizado = document.getElementById('editRealizado');
    if (editRealizado) {
        editRealizado.addEventListener('change', (e) => {
            const dataRealizado = e.target.value;
            const inputProximo = document.getElementById('editProximo');
            if (dataRealizado) {
                const data = new Date(dataRealizado);
                data.setDate(data.getDate() + 21); // +21 dias
                inputProximo.value = data.toISOString().split('T')[0];
            } else {
                inputProximo.value = '';
            }
        });
    }
});

function showViewListas() {
    document.getElementById('viewItens').classList.add('hidden');
    document.getElementById('viewListas').classList.remove('hidden');
    carregarListasMobile();
}

function carregarListasMobile() {
    const container = document.getElementById('listaDeListas');
    if (!container) return;
    
    container.innerHTML = '<p style="text-align: center;">Carregando...</p>';

    const listas = getLocalData(LOCAL_LISTAS_KEY);
    // Filtra apenas listas ABERTAS para o mobile
    const listasAbertas = listas.filter(l => l.status === 'ABERTA').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    container.innerHTML = '';
    if (listasAbertas.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">Nenhuma lista aberta encontrada.</p>';
        return;
    }

    listasAbertas.forEach(lista => {
        const div = document.createElement('div');
        div.className = 'historico-card'; 
        div.style.cssText = 'background: white; padding: 15px; margin-bottom: 10px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); cursor: pointer; border-left: 5px solid #006937;';
        div.onclick = () => abrirLista(lista.id, lista.nome);
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h4 style="margin: 0; color: #333;">${lista.nome}</h4>
                    <small style="color: #666;">${new Date(lista.created_at).toLocaleDateString('pt-BR')}</small>
                </div>
                <i class="fas fa-chevron-right" style="color: #006937;"></i>
            </div>
        `;
        container.appendChild(div);
    });
}

function abrirLista(id, nome) {
    currentListId = id;
    const titulo = document.getElementById('tituloListaAtual');
    if (titulo) titulo.textContent = nome;
    
    document.getElementById('viewListas').classList.add('hidden');
    document.getElementById('viewItens').classList.remove('hidden');
    
    // Carrega itens
    const allItens = getLocalData(LOCAL_ITENS_KEY);
    currentItems = allItens.filter(i => i.lista_id === id);
    renderizarItensMobile(currentItems);
}

function renderizarItensMobile(itens) {
    const container = document.getElementById('listaVeiculosContainer');
    if (!container) return;
    
    container.innerHTML = '';

    if (itens.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">Nenhum veículo nesta lista.</p>';
        return;
    }

    itens.forEach(item => {
        const div = document.createElement('div');
        const isDone = item.status === 'OK' || item.status === 'REALIZADO';
        const statusColor = isDone ? '#28a745' : (item.status === 'ROTA' ? '#ffc107' : (item.status === 'INTERNADO' ? '#007bff' : '#dc3545'));
        
        div.className = 'historico-card';
        // Layout compactado tipo tabela
        div.style.cssText = `background: white; padding: 8px 10px; margin-bottom: 5px; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); border-left: 4px solid ${statusColor}; display: flex; align-items: center; justify-content: space-between;`;
        
        div.innerHTML = `
            <div style="flex: 1; display: flex; align-items: center; gap: 10px; overflow: hidden;">
                <div style="font-weight: bold; font-size: 1rem; color: #333; min-width: 75px;">${item.placa}</div>
                <div style="font-size: 0.85rem; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">
                    ${item.modelo || '-'}
                </div>
                <div style="font-weight: bold; color: ${statusColor}; font-size: 0.75rem; min-width: 60px; text-align: right;">
                    ${item.status || 'PEND'}
                </div>
            </div>
            <button class="btn-secondary" onclick="window.prepararEdicaoMobile('${item.id}')" style="padding: 4px 8px; margin-left: 8px; height: 30px; display: flex; align-items: center;">
                <i class="fas fa-edit"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

window.prepararEdicaoMobile = function(id) {
    const item = currentItems.find(i => i.id === id);
    if (!item) return;

    document.getElementById('editItemId').value = item.id;
    document.getElementById('modalPlacaTitulo').textContent = `Editar ${item.placa}`;
    
    // Preenche campos
    const formatDate = (d) => d && d.includes('T') ? d.split('T')[0] : d;
    document.getElementById('editRealizado').value = formatDate(item.data_realizado) || '';
    document.getElementById('editProximo').value = formatDate(item.data_proximo) || '';
    
    document.getElementById('editPlaqueta').value = item.plaquinha || '';
    document.getElementById('editSeg').value = item.seg || '';
    
    // Normaliza status para o select
    let statusVal = item.status || 'PENDENTE';
    if (statusVal === 'REALIZADO') statusVal = 'OK';
    document.getElementById('editStatus').value = statusVal;
    
    document.getElementById('editKm').value = item.km || '';

    // Mostra modal
    const modal = document.getElementById('modalEditarItem');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

function salvarItemMobile() {
    const id = document.getElementById('editItemId').value;
    const realizado = document.getElementById('editRealizado').value;
    const proximo = document.getElementById('editProximo').value;
    const plaqueta = document.getElementById('editPlaqueta').value;
    const seg = document.getElementById('editSeg').value;
    const status = document.getElementById('editStatus').value;
    const km = document.getElementById('editKm').value;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;

    // Atualiza no LocalStorage
    let allItens = getLocalData(LOCAL_ITENS_KEY);
    const index = allItens.findIndex(i => i.id === id);

    if (index !== -1) {
        allItens[index] = {
            ...allItens[index],
            data_realizado: realizado || null,
            data_proximo: proximo || null,
            plaquinha: plaqueta,
            seg: seg,
            status: status,
            km: km ? parseInt(km) : null,
            usuario_realizou: usuario
        };
        setLocalData(LOCAL_ITENS_KEY, allItens);
        
        // Atualiza lista atual e re-renderiza
        currentItems = allItens.filter(i => i.lista_id === currentListId);
        renderizarItensMobile(currentItems);
        
        fecharModal();
        alert('Registro salvo!');
    }
}

function fecharModal() {
    const modal = document.getElementById('modalEditarItem');
    modal.style.display = 'none';
    modal.classList.add('hidden');
}

function filtrarVeiculosMobile() {
    const termo = document.getElementById('filtroVeiculoMobile').value.toLowerCase();
    const filtrados = currentItems.filter(i => 
        i.placa.toLowerCase().includes(termo) || 
        (i.modelo && i.modelo.toLowerCase().includes(termo))
    );
    renderizarItensMobile(filtrados);
}
