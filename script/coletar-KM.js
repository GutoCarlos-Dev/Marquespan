import { supabaseClient } from './supabase.js';

let itensColeta = [];
let veiculosCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar Login
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) {
        alert('Você precisa estar logado.');
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('coletaResponsavel').value = usuario.nome || usuario.email;

    // 2. Definir Data Atual
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('coletaData').value = hoje;

    // 3. Carregar Veículos para o Datalist
    await carregarVeiculos();

    // 4. Event Listeners
    document.getElementById('itemPlaca').addEventListener('change', aoSelecionarPlaca);
    document.getElementById('formItemColeta').addEventListener('submit', adicionarItem);
    document.getElementById('btnSalvarColeta').addEventListener('click', salvarColetaCompleta);
    document.getElementById('tableBodyItens').addEventListener('click', removerItem);
});

async function carregarVeiculos() {
    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('placa, modelo, id')
            .eq('situacao', 'ativo') // Apenas veículos ativos
            .order('placa');

        if (error) throw error;

        veiculosCache = data;
        const datalist = document.getElementById('listaVeiculos');
        datalist.innerHTML = '';
        
        data.forEach(v => {
            const option = document.createElement('option');
            option.value = v.placa;
            datalist.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar veículos:', error);
        alert('Erro ao carregar lista de veículos.');
    }
}

async function aoSelecionarPlaca(e) {
    const placa = e.target.value.trim().toUpperCase();
    if (!placa) return;

    // Buscar modelo no cache
    const veiculo = veiculosCache.find(v => v.placa === placa);
    if (veiculo) {
        document.getElementById('itemModelo').value = veiculo.modelo || '';
        
        // Buscar último KM registrado (opcional, requer tabela de histórico)
        await buscarUltimoKm(placa);
    } else {
        document.getElementById('itemModelo').value = '';
        document.getElementById('itemKmAnterior').value = '';
    }
}

async function buscarUltimoKm(placa) {
    // Tenta buscar o último KM registrado na tabela de coletas (se existir)
    // Caso não exista tabela, deixa em branco ou 0
    try {
        const { data, error } = await supabaseClient
            .from('coleta_km')
            .select('km_atual')
            .eq('placa', placa)
            .order('data_coleta', { ascending: false })
            .limit(1)
            .single();

        if (data) {
            document.getElementById('itemKmAnterior').value = data.km_atual;
        } else {
            document.getElementById('itemKmAnterior').value = '';
        }
    } catch (err) {
        // Silencioso se não encontrar ou erro de tabela
        console.log('Nenhum histórico de KM encontrado ou erro na busca.', err);
        document.getElementById('itemKmAnterior').value = '';
    }
}

function adicionarItem(e) {
    e.preventDefault();

    const placa = document.getElementById('itemPlaca').value.trim().toUpperCase();
    const modelo = document.getElementById('itemModelo').value;
    const kmAnterior = document.getElementById('itemKmAnterior').value;
    const kmAtual = document.getElementById('itemKmAtual').value;
    const kmProxima = document.getElementById('itemKmProxima').value;
    const observacao = document.getElementById('itemObservacao').value;

    if (!placa || !kmAtual) {
        alert('Placa e KM Atual são obrigatórios.');
        return;
    }

    // Validação simples
    if (kmAnterior && parseInt(kmAtual) < parseInt(kmAnterior)) {
        if (!confirm(`O KM Atual (${kmAtual}) é menor que o KM Anterior (${kmAnterior}). Deseja continuar mesmo assim?`)) {
            return;
        }
    }

    const item = {
        id: Date.now(), // ID temporário para UI
        placa,
        modelo,
        km_anterior: kmAnterior ? parseInt(kmAnterior) : null,
        km_atual: parseInt(kmAtual),
        km_proxima_troca: kmProxima ? parseInt(kmProxima) : null,
        observacao
    };

    itensColeta.push(item);
    renderizarTabela();
    
    // Limpar campos do item (mantendo foco na placa para inserção rápida)
    document.getElementById('itemPlaca').value = '';
    document.getElementById('itemModelo').value = '';
    document.getElementById('itemKmAnterior').value = '';
    document.getElementById('itemKmAtual').value = '';
    document.getElementById('itemKmProxima').value = '';
    document.getElementById('itemObservacao').value = '';
    document.getElementById('itemPlaca').focus();
}

function renderizarTabela() {
    const tbody = document.getElementById('tableBodyItens');
    tbody.innerHTML = '';
    document.getElementById('contadorItens').textContent = itensColeta.length;

    itensColeta.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.placa}</td>
            <td>${item.modelo}</td>
            <td>${item.km_anterior || '-'}</td>
            <td>${item.km_atual}</td>
            <td>${item.km_proxima_troca || '-'}</td>
            <td>${item.observacao || ''}</td>
            <td>
                <button class="btn-danger" data-index="${index}" style="padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function removerItem(e) {
    if (e.target.closest('button')) {
        const index = e.target.closest('button').dataset.index;
        itensColeta.splice(index, 1);
        renderizarTabela();
    }
}

async function salvarColetaCompleta() {
    if (itensColeta.length === 0) {
        alert('Adicione pelo menos um veículo à coleta.');
        return;
    }

    const dataColeta = document.getElementById('coletaData').value;
    const responsavel = document.getElementById('coletaResponsavel').value;

    // Prepara os dados para inserção (remove ID temporário)
    const dadosParaInserir = itensColeta.map(({ id, ...resto }) => ({
        ...resto,
        data_coleta: dataColeta,
        usuario: responsavel
    }));

    try {
        const { error } = await supabaseClient
            .from('coleta_km')
            .insert(dadosParaInserir);

        if (error) throw error;

        alert('Coleta de KM salva com sucesso!');
        itensColeta = [];
        renderizarTabela();
        // Opcional: Limpar data ou manter
    } catch (error) {
        console.error('Erro ao salvar coleta:', error);
        alert('Erro ao salvar dados: ' + error.message);
    }
}