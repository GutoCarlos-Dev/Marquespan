import { supabaseClient } from './supabase.js';

let currentListId = null;
let currentItems = [];
let currentFilter = 'TODOS';

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
    if (filtro) filtro.addEventListener('input', renderizarItensMobile); // Mudado para chamar renderizarItensMobile diretamente

    // Abas de Filtro
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentFilter = e.currentTarget.dataset.filter;
            renderizarItensMobile();
        });
    });

    // Delegação de eventos para clique nos cards de itens (Performance e UX)
    const containerItens = document.getElementById('listaVeiculosContainer');
    if (containerItens) {
        containerItens.addEventListener('click', (e) => {
            const card = e.target.closest('.card[data-item-id]');
            if (card) {
                const id = card.dataset.itemId;
                window.prepararEdicaoMobile(id);
            }
        });
    }

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
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando listas...</div>';

    try {
        const { data: listasAbertas, error } = await supabaseClient
            .from('engraxe_listas')
            .select('*')
            .eq('status', 'ABERTA')
            .order('created_at', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';
        if (!listasAbertas || listasAbertas.length === 0) {
            container.innerHTML = '<div class="loading">Nenhuma lista aberta encontrada.</div>';
            return;
        }

        const cardsHtml = listasAbertas.map(lista => `
            <div class="card status-aberta" onclick="window.abrirLista('${lista.id}', '${lista.nome}')">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h4>${lista.nome}</h4>
                        <p><i class="far fa-calendar-alt"></i> ${new Date(lista.created_at).toLocaleDateString('pt-BR')}</p>
                        <span class="status">ABERTA</span>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
        `).join('');

        container.innerHTML = cardsHtml;
    } catch (error) {
        console.error('Erro ao carregar listas:', error);
        container.innerHTML = '<div class="loading" style="color: red;">Erro ao carregar listas.</div>';
    }
}

// Expor função para o escopo global
window.abrirLista = async function(id, nome) {
    currentListId = id;
    const titulo = document.getElementById('tituloListaAtual');
    if (titulo) titulo.textContent = nome;
    
    document.getElementById('viewListas').classList.add('hidden');
    document.getElementById('viewItens').classList.remove('hidden');
    
    const container = document.getElementById('listaVeiculosContainer');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando itens...</div>';

    try {
        const { data: itens, error } = await supabaseClient
            .from('engraxe_itens')
            .select('*')
            .eq('lista_id', id)
            .order('placa');

        if (error) throw error;

        currentItems = itens || [];
        atualizarContadores();
        renderizarItensMobile();
    } catch (error) {
        console.error('Erro ao carregar itens:', error);
        container.innerHTML = '<div class="loading" style="color: red;">Erro ao carregar itens.</div>';
    }
}

function renderizarItensMobile() {
    const container = document.getElementById('listaVeiculosContainer');
    if (!container) return;

    const termo = document.getElementById('filtroVeiculoMobile').value.toLowerCase();
    
    // Filtragem combinada (Busca + Aba de Status)
    const itensFiltrados = currentItems.filter(i => {
        const matchTermo = i.placa.toLowerCase().includes(termo) || (i.modelo && i.modelo.toLowerCase().includes(termo));
        
        let matchStatus = true;
        const statusItem = i.status || 'PENDENTE';
        
        if (currentFilter !== 'TODOS') {
            if (currentFilter === 'OK') {
                matchStatus = statusItem === 'OK' || statusItem === 'REALIZADO';
            } else {
                matchStatus = statusItem === currentFilter;
            }
        }
        
        return matchTermo && matchStatus;
    });
    
    if (itensFiltrados.length === 0) {
        container.innerHTML = '<div class="loading">Nenhum veículo encontrado.</div>';
        return;
    }

    const cardsHtml = itensFiltrados.map(item => {
        const status = item.status || 'PENDENTE';
        let statusClass = 'status-pendente';
        
        if (status === 'OK' || status === 'REALIZADO') statusClass = 'status-realizado';
        else if (status === 'ROTA') statusClass = 'status-rota';
        else if (status === 'INTERNADO') statusClass = 'status-internado';
        
        const isDone = status === 'OK' || status === 'REALIZADO';

        return `
            <div class="card ${statusClass}" data-item-id="${item.id}">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <h4>${item.placa}</h4>
                        <p>${item.modelo || 'Modelo n/i'}</p>
                    </div>
                    <div style="text-align: right;">
                        <span class="status">${status}</span>
                        ${isDone ? '<br><i class="fas fa-check-circle" style="color: #28a745; margin-top: 5px; font-size: 1.2rem;"></i>' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;
}

function atualizarContadores() {
    const counts = currentItems.reduce((acc, item) => {
        const s = item.status || 'PENDENTE';
        if (s === 'PENDENTE') acc.pendentes++;
        else if (s === 'OK' || s === 'REALIZADO') acc.realizados++;
        else if (s === 'ROTA') acc.rota++;
        else if (s === 'INTERNADO') acc.internados++;
        return acc;
    }, { pendentes: 0, realizados: 0, rota: 0, internados: 0 });

    const setTxt = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `(${txt})`;
    };

    setTxt('countTodos', currentItems.length);
    setTxt('countPendentes', counts.pendentes);
    setTxt('countRealizados', counts.realizados);
    setTxt('countRota', counts.rota);
    setTxt('countInternados', counts.internados);
}

window.prepararEdicaoMobile = function(id) {
    const item = currentItems.find(i => i.id === id);
    if (!item) return;

    document.getElementById('editItemId').value = item.id;
    document.getElementById('modalPlacaTitulo').textContent = `Editar ${item.placa}`;
    
    // Preenche campos
    const formatDate = (d) => d && d.includes('T') ? d.split('T')[0] : d;

    // Define data de hoje (local) se não houver data realizada
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const hoje = now.toISOString().split('T')[0];

    const dataRealizado = formatDate(item.data_realizado) || hoje;
    document.getElementById('editRealizado').value = dataRealizado;

    // Se não tinha data realizada (era novo/pendente), calcula o próximo vencimento (21 dias)
    let dataProximo = formatDate(item.data_proximo);
    if (!item.data_realizado && !dataProximo) {
        const d = new Date(dataRealizado);
        d.setDate(d.getDate() + 21);
        dataProximo = d.toISOString().split('T')[0];
    }
    document.getElementById('editProximo').value = dataProximo || '';
    
    document.getElementById('editPlaqueta').value = item.plaquinha || '';
    document.getElementById('editSeg').value = item.seg || '';
    
    // Normaliza status para o select
    let statusVal = item.status || 'PENDENTE';
    if (statusVal === 'REALIZADO') statusVal = 'OK'; // 'REALIZADO' é equivalente a 'OK' para exibição
    // Removido: Não mudar PENDENTE para OK automaticamente ao abrir o modal.
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

    const btn = document.getElementById('btnSalvarItemMobile');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

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
            atualizarContadores();
            renderizarItensMobile();
        }

        fecharModal();

    } catch (error) {
        console.error('Erro ao salvar item:', error);
        alert('Erro ao salvar item: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function fecharModal() {
    const modal = document.getElementById('modalEditarItem');
    modal.style.display = 'none';
    modal.classList.add('hidden');
}
