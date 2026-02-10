import { supabaseClient } from './supabase.js';

let listaAtualId = null;

document.addEventListener('DOMContentLoaded', async () => {
    carregarListasMobile();
    document.getElementById('btnVoltarMobile').addEventListener('click', voltarParaListas);
});

async function carregarListasMobile() {
    const container = document.getElementById('listaDeListas');
    container.innerHTML = '<p style="text-align: center;">Carregando listas...</p>';

    try {
        const { data, error } = await supabaseClient
            .from('engraxe_listas')
            .select('*')
            .eq('status', 'ABERTA')
            .order('created_at', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align: center;">Nenhuma lista aberta.</p>';
            return;
        }

        data.forEach(lista => {
            const div = document.createElement('div');
            div.className = 'historico-card';
            div.style.cursor = 'pointer';
            div.onclick = () => abrirListaMobile(lista.id, lista.nome);
            div.innerHTML = `
                <div class="card-top">
                    <span class="card-placa">${lista.nome}</span>
                    <span class="card-date">${new Date(lista.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                <div class="card-details" style="text-align: right; color: #006937; font-weight: bold;">
                    Toque para abrir <i class="fas fa-chevron-right"></i>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p style="text-align: center; color: red;">Erro ao carregar.</p>';
    }
}

async function abrirListaMobile(id, nome) {
    listaAtualId = id;
    document.getElementById('viewSelecaoLista').classList.add('hidden');
    document.getElementById('viewExecucaoMobile').classList.remove('hidden');
    document.getElementById('tituloListaMobile').textContent = nome;
    carregarItensMobile(id);
}

async function carregarItensMobile(id) {
    const container = document.getElementById('listaItensMobile');
    container.innerHTML = 'Carregando itens...';

    try {
        const { data, error } = await supabaseClient
            .from('engraxe_itens')
            .select('*')
            .eq('lista_id', id)
            .order('placa');

        if (error) throw error;

        container.innerHTML = '';
        data.forEach(item => {
            const isDone = item.status === 'REALIZADO';
            const div = document.createElement('div');
            div.className = `historico-card ${isDone ? 'realizado' : 'pendente'}`;
            
            div.innerHTML = `
                <div class="card-top">
                    <span class="card-placa">${item.placa}</span>
                    <span class="card-date">${item.modelo}</span>
                </div>
                <div style="margin: 10px 0;">
                    <input type="number" id="km-mob-${item.id}" placeholder="KM" value="${item.km || ''}" ${isDone ? 'disabled' : ''} style="width: 100px; padding: 5px;">
                </div>
                ${isDone 
                    ? `<div style="color: green; font-weight: bold;"><i class="fas fa-check"></i> REALIZADO</div>`
                    : `<button class="btn-primary btn-block" onclick="marcarRealizadoMobile('${item.id}')">DAR OK</button>`
                }
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error(error);
    }
}

window.marcarRealizadoMobile = async function(itemId) {
    const km = document.getElementById(`km-mob-${itemId}`).value;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;

    try {
        const { error } = await supabaseClient
            .from('engraxe_itens')
            .update({
                status: 'REALIZADO',
                km: km ? parseInt(km) : null,
                data_realizado: new Date().toISOString(),
                usuario_realizou: usuario
            })
            .eq('id', itemId);

        if (error) throw error;
        carregarItensMobile(listaAtualId);
    } catch (error) {
        alert('Erro: ' + error.message);
    }
}

function voltarParaListas() {
    document.getElementById('viewExecucaoMobile').classList.add('hidden');
    document.getElementById('viewSelecaoLista').classList.remove('hidden');
    carregarListasMobile();
}