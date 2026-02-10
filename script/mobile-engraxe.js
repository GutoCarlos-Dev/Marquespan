import { supabaseClient } from './supabase.js';

let veiculosCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('data_realizado').value = new Date().toISOString().split('T')[0];
    await carregarVeiculos();
    await carregarHistorico();
    document.getElementById('formMobileEngraxe').addEventListener('submit', salvarEngraxeMobile);
});

async function carregarVeiculos() {
    try {
        const { data, error } = await supabaseClient.from('veiculos').select('placa, modelo, marca').eq('situacao', 'ativo').order('placa');
        if (error) throw error;
        veiculosCache = data;
        const datalist = document.getElementById('listaVeiculos');
        datalist.innerHTML = '';
        data.forEach(v => { const option = document.createElement('option'); option.value = v.placa; datalist.appendChild(option); });
    } catch (error) { console.error('Erro ao carregar veículos:', error); }
}

async function salvarEngraxeMobile(e) {
    e.preventDefault();
    const placa = document.getElementById('placa').value.toUpperCase();
    const veiculo = veiculosCache.find(v => v.placa === placa);
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;
    const dados = {
        placa: placa,
        modelo: veiculo ? veiculo.modelo : '',
        marca: veiculo ? veiculo.marca : '',
        plaquinha: document.getElementById('plaquinha').value,
        seg: document.getElementById('seg').value,
        km_realizado: document.getElementById('km_realizado').value,
        data_realizado: document.getElementById('data_realizado').value,
        status: document.getElementById('status').value,
        km_proximo: document.getElementById('proximo_km').value || null,
        data_proximo: document.getElementById('proximo_data').value || null,
        usuario: usuario
    };

    try {
        const { error } = await supabaseClient.from('controle_engraxe').insert([dados]);
        if (error) throw error;
        alert('Engraxe registrado com sucesso!');
        document.getElementById('formMobileEngraxe').reset();
        document.getElementById('data_realizado').value = new Date().toISOString().split('T')[0];
        carregarHistorico();
    } catch (error) { console.error('Erro ao salvar:', error); alert('Erro ao salvar: ' + error.message); }
}

async function carregarHistorico() {
    const container = document.getElementById('listaHistorico');
    container.innerHTML = '<p style="text-align: center;">Atualizando...</p>';
    try {
        const { data, error } = await supabaseClient.from('controle_engraxe').select('*').order('created_at', { ascending: false }).limit(10);
        if (error) throw error;
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<p style="text-align: center;">Nenhum registro recente.</p>'; return; }
        data.forEach(item => {
            const div = document.createElement('div');
            const statusClass = item.status === 'REALIZADO' ? 'realizado' : 'pendente';
            const dataFmt = new Date(item.data_realizado).toLocaleDateString('pt-BR');
            div.className = `historico-card ${statusClass}`;
            div.innerHTML = `<div class="card-top"><span class="card-placa">${item.placa}</span><span class="card-date">${dataFmt}</span></div><div class="card-details">KM: ${item.km_realizado} | Status: <strong>${item.status}</strong></div>`;
            container.appendChild(div);
        });
    } catch (error) { console.error('Erro ao carregar histórico:', error); container.innerHTML = '<p style="text-align: center; color: red;">Erro ao carregar.</p>'; }
}