import { supabaseClient } from './supabase.js';

let currentListId = null;
let currentItems = [];
let currentFilter = 'TODOS';

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) { window.location.href = 'index.html'; return; }

    await carregarListasAbertas();

    document.getElementById('btnVoltar').addEventListener('click', showScreenListas);
    document.getElementById('searchPlacaMobile').addEventListener('input', renderizarItens);
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderizarItens();
        });
    });

    document.querySelector('.close-modal').addEventListener('click', fecharModal);
    document.getElementById('btnSalvarLavagem').addEventListener('click', salvarLavagem);
});

async function carregarListasAbertas() {
    const container = document.getElementById('listaDeListas');
    container.innerHTML = '<div class="loading">Carregando...</div>';

    try {
        const { data, error } = await supabaseClient
            .from('lavagem_listas')
            .select('*')
            .eq('status', 'ABERTA')
            .order('created_at', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Nenhuma lista aberta disponível.</div>';
            return;
        }

        data.forEach(lista => {
            const card = document.createElement('div');
            card.className = 'card status-aberta';
            card.innerHTML = `
                <h4>${lista.nome}</h4>
                <p><i class="far fa-calendar-alt"></i> ${new Date(lista.data_lista).toLocaleDateString('pt-BR')}</p>
                <span class="status">ABERTA</span>
            `;
            card.onclick = () => abrirLista(lista);
            container.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        container.innerHTML = '<div style="color:red; text-align:center;">Erro ao carregar listas.</div>';
    }
}

async function abrirLista(lista) {
    currentListId = lista.id;
    document.getElementById('tituloListaAtual').textContent = lista.nome;
    
    document.getElementById('screenListas').classList.add('hidden');
    document.getElementById('screenItens').classList.remove('hidden');
    
    await carregarItensDaLista(lista.id);
}

async function carregarItensDaLista(id) {
    const container = document.getElementById('listaDeItens');
    container.innerHTML = '<div class="loading">Carregando veículos...</div>';

    try {
        const { data, error } = await supabaseClient
            .from('lavagem_itens')
            .select('*')
            .eq('lista_id', id)
            .order('placa');

        if (error) throw error;

        currentItems = data;
        renderizarItens();

    } catch (error) {
        console.error(error);
        container.innerHTML = '<div style="color:red;">Erro ao carregar itens.</div>';
    }
}

function renderizarItens() {
    const container = document.getElementById('listaDeItens');
    const termo = document.getElementById('searchPlacaMobile').value.toUpperCase();
    container.innerHTML = '';

    const itensFiltrados = currentItems.filter(item => {
        const matchTermo = item.placa.includes(termo);
        const matchStatus = currentFilter === 'TODOS' || item.status === currentFilter;
        return matchTermo && matchStatus;
    });

    if (itensFiltrados.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">Nenhum veículo encontrado.</div>';
        return;
    }

    itensFiltrados.forEach(item => {
        const isRealizado = item.status === 'REALIZADO';
        const card = document.createElement('div');
        card.className = `card ${isRealizado ? 'status-realizado' : 'status-pendente'}`;
        
        let infoExtra = isRealizado ? `<br><small>Lavagem: ${item.tipo_lavagem}</small>` : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h4>${item.placa}</h4>
                    <p>${item.modelo || 'Modelo não inf.'}${infoExtra}</p>
                </div>
                <div style="text-align:right;">
                    <span class="status">${item.status}</span>
                    ${isRealizado ? '<br><i class="fas fa-check-circle" style="color:green; margin-top:5px;"></i>' : ''}
                </div>
            </div>
        `;
        
        card.onclick = () => abrirModalAcao(item);
        container.appendChild(card);
    });
}

let itemSelecionadoParaAcao = null;

function abrirModalAcao(item) {
    itemSelecionadoParaAcao = item;
    document.getElementById('modalPlacaVeiculo').textContent = item.placa;
    document.getElementById('modalModeloVeiculo').textContent = item.modelo || '';
    
    const tipos = ['SIMPLES', 'DIFERENCIADA', 'BAÚ COMPLETO', 'MOTOR', 'THERMO KING', 'CHASSI'];
    const container = document.getElementById('radioGroupTipos');
    container.innerHTML = '';

    tipos.forEach(tipo => {
        const label = document.createElement('label');
        label.className = 'radio-option';
        if (item.tipo_lavagem === tipo) label.classList.add('selected');
        
        label.innerHTML = `
            <input type="radio" name="tipoLavagem" value="${tipo}" ${item.tipo_lavagem === tipo ? 'checked' : ''}>
            ${tipo}
        `;
        
        label.addEventListener('click', () => {
            document.querySelectorAll('.radio-option').forEach(l => l.classList.remove('selected'));
            label.classList.add('selected');
            label.querySelector('input').checked = true;
        });

        container.appendChild(label);
    });

    document.getElementById('modalAcaoMobile').classList.remove('hidden');
}

async function salvarLavagem() {
    if (!itemSelecionadoParaAcao) return;

    const radio = document.querySelector('input[name="tipoLavagem"]:checked');
    if (!radio) {
        alert('Selecione um tipo de lavagem.');
        return;
    }

    const tipoLavagem = radio.value;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;
    const btn = document.getElementById('btnSalvarLavagem');
    
    btn.disabled = true;
    btn.innerHTML = 'Salvando...';

    try {
        const { error } = await supabaseClient
            .from('lavagem_itens')
            .update({
                status: 'REALIZADO',
                tipo_lavagem: tipoLavagem,
                data_realizado: new Date().toISOString(),
                usuario_realizou: usuario
            })
            .eq('id', itemSelecionadoParaAcao.id);

        if (error) throw error;

        const index = currentItems.findIndex(i => i.id === itemSelecionadoParaAcao.id);
        if (index > -1) {
            currentItems[index].status = 'REALIZADO';
            currentItems[index].tipo_lavagem = tipoLavagem;
        }

        fecharModal();
        renderizarItens();

    } catch (error) {
        console.error(error);
        alert('Erro ao salvar: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Lavagem';
    }
}

function fecharModal() {
    document.getElementById('modalAcaoMobile').classList.add('hidden');
    itemSelecionadoParaAcao = null;
}

function showScreenListas() {
    document.getElementById('screenItens').classList.add('hidden');
    document.getElementById('screenListas').classList.remove('hidden');
    carregarListasAbertas();
}