import { supabaseClient } from './supabase.js';

let currentListId = null;
let currentItems = [];

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

async function carregarListasMobile() {
    const container = document.getElementById('listaDeListas');
    if (!container) return;
    
    container.innerHTML = '<p style="text-align: center;">Carregando...</p>';

    try {
        const { data: listasAbertas, error } = await supabaseClient
            .from('engraxe_listas')
            .select('*')
            .eq('status', 'ABERTA')
            .order('created_at', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';
        if (!listasAbertas || listasAbertas.length === 0) {
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
    } catch (error) {
        console.error('Erro ao carregar listas:', error);
        container.innerHTML = '<p style="text-align: center; color: red;">Erro ao carregar listas.</p>';
    }
}

async function abrirLista(id, nome) {
    currentListId = id;
    const titulo = document.getElementById('tituloListaAtual');
    if (titulo) titulo.textContent = nome;
    
    document.getElementById('viewListas').classList.add('hidden');
    document.getElementById('viewItens').classList.remove('hidden');
    
    const container = document.getElementById('listaVeiculosContainer');
    container.innerHTML = '<p style="text-align: center;">Carregando itens...</p>';

    try {
        const { data: itens, error } = await supabaseClient
            .from('engraxe_itens')
            .select('*')
            .eq('lista_id', id)
            .order('placa');

        if (error) throw error;

        currentItems = itens || [];
        renderizarItensMobile(currentItems);
    } catch (error) {
        console.error('Erro ao carregar itens:', error);
        container.innerHTML = '<p style="text-align: center; color: red;">Erro ao carregar itens.</p>';
    }
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

async function salvarItemMobile() {
    const id = document.getElementById('editItemId').value;
    const realizado = document.getElementById('editRealizado').value;
    const proximo = document.getElementById('editProximo').value;
    const plaqueta = document.getElementById('editPlaqueta').value;
    const seg = document.getElementById('editSeg').value;
    const status = document.getElementById('editStatus').value;
    const km = document.getElementById('editKm').value;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;

    try {
        const updateData = {
            data_realizado: realizado || null,
            data_proximo: proximo || null,
            plaquinha: plaqueta,
            seg: seg,
            status: status,
            km: km ? parseInt(km) : null,
            usuario_realizou: usuario
        };

        const { error } = await supabaseClient
            .from('engraxe_itens')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        // Atualiza cache local e re-renderiza
        const index = currentItems.findIndex(i => i.id === id);
        if (index !== -1) {
            currentItems[index] = { ...currentItems[index], ...updateData };
            renderizarItensMobile(currentItems);
        }

        fecharModal();
        alert('Registro salvo!');

    } catch (error) {
        console.error('Erro ao salvar item:', error);
        alert('Erro ao salvar item: ' + error.message);
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
