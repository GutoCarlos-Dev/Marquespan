import { supabaseClient } from './supabase.js';

let veiculosCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario) { window.location.href = 'index.html'; return; }

    await carregarVeiculos();
    await carregarEngraxe();

    document.getElementById('btnBuscar').addEventListener('click', carregarEngraxe);
    document.getElementById('btnNovoLancamento').addEventListener('click', abrirModalNovo);
    document.getElementById('btnCloseModal').addEventListener('click', fecharModal);
    document.getElementById('formEngraxe').addEventListener('submit', salvarEngraxe);
    document.getElementById('placa').addEventListener('change', preencherDadosVeiculo);
    document.getElementById('btnExportarPDF').addEventListener('click', gerarPDF);

    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('data_realizado').value = hoje;
});

async function carregarVeiculos() {
    try {
        const { data, error } = await supabaseClient.from('veiculos').select('placa, modelo, marca').eq('situacao', 'ativo').order('placa');
        if (error) throw error;
        veiculosCache = data;
        const datalist = document.getElementById('listaVeiculos');
        datalist.innerHTML = '';
        data.forEach(v => {
            const option = document.createElement('option');
            option.value = v.placa;
            datalist.appendChild(option);
        });
    } catch (error) { console.error('Erro ao carregar veículos:', error); }
}

function preencherDadosVeiculo() {
    const placa = document.getElementById('placa').value.toUpperCase();
    const veiculo = veiculosCache.find(v => v.placa === placa);
    if (veiculo) {
        document.getElementById('modelo').value = veiculo.modelo || '';
        document.getElementById('marca').value = veiculo.marca || '';
    }
}

async function carregarEngraxe() {
    const tbody = document.getElementById('tbodyEngraxe');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">Carregando...</td></tr>';

    const placa = document.getElementById('filtroPlaca').value.trim().toUpperCase();
    const status = document.getElementById('filtroStatus').value;
    const dataIni = document.getElementById('filtroDataIni').value;
    const dataFim = document.getElementById('filtroDataFim').value;

    try {
        let query = supabaseClient.from('controle_engraxe').select('*').order('data_realizado', { ascending: false });
        if (placa) query = query.ilike('placa', `%${placa}%`);
        if (status) query = query.eq('status', status);
        if (dataIni) query = query.gte('data_realizado', dataIni);
        if (dataFim) query = query.lte('data_realizado', dataFim);

        const { data, error } = await query;
        if (error) throw error;
        renderizarTabela(data);
    } catch (error) {
        console.error('Erro ao carregar engraxe:', error);
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderizarTabela(dados) {
    const tbody = document.getElementById('tbodyEngraxe');
    tbody.innerHTML = '';
    if (!dados || dados.length === 0) { tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">Nenhum registro encontrado.</td></tr>'; return; }

    dados.forEach(item => {
        const tr = document.createElement('tr');
        const dataRealizado = item.data_realizado ? new Date(item.data_realizado).toLocaleDateString('pt-BR') : '-';
        const dataProximo = item.data_proximo ? new Date(item.data_proximo).toLocaleDateString('pt-BR') : '-';
        const badgeClass = item.status === 'REALIZADO' ? 'badge-realizado' : 'badge-pendente';

        tr.innerHTML = `<td>${item.placa}</td><td>${item.modelo || ''}</td><td>${item.marca || ''}</td><td>${item.plaquinha || ''}</td><td>${item.seg || ''}</td><td>${item.km_realizado || ''}</td><td>${dataRealizado}</td><td>${dataProximo} / ${item.km_proximo || '-'} KM</td><td><span class="badge ${badgeClass}">${item.status}</span></td><td><button class="btn-icon btn-edit" onclick="editarEngraxe('${item.id}')"><i class="fas fa-edit"></i></button><button class="btn-icon btn-delete" onclick="excluirEngraxe('${item.id}')"><i class="fas fa-trash"></i></button></td>`;
        tbody.appendChild(tr);
    });
}

async function salvarEngraxe(e) {
    e.preventDefault();
    const id = document.getElementById('engraxeId').value;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado')).nome;
    const dados = {
        placa: document.getElementById('placa').value.toUpperCase(),
        modelo: document.getElementById('modelo').value,
        marca: document.getElementById('marca').value,
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
        let error;
        if (id) { const { error: updateError } = await supabaseClient.from('controle_engraxe').update(dados).eq('id', id); error = updateError; }
        else { const { error: insertError } = await supabaseClient.from('controle_engraxe').insert([dados]); error = insertError; }
        if (error) throw error;
        alert('Registro salvo com sucesso!');
        fecharModal();
        carregarEngraxe();
    } catch (error) { console.error('Erro ao salvar:', error); alert('Erro ao salvar registro: ' + error.message); }
}

window.editarEngraxe = async function(id) {
    try {
        const { data, error } = await supabaseClient.from('controle_engraxe').select('*').eq('id', id).single();
        if (error) throw error;
        document.getElementById('engraxeId').value = data.id;
        document.getElementById('placa').value = data.placa;
        document.getElementById('modelo').value = data.modelo;
        document.getElementById('marca').value = data.marca;
        document.getElementById('plaquinha').value = data.plaquinha;
        document.getElementById('seg').value = data.seg;
        document.getElementById('km_realizado').value = data.km_realizado;
        document.getElementById('data_realizado').value = data.data_realizado;
        document.getElementById('status').value = data.status;
        document.getElementById('proximo_km').value = data.km_proximo;
        document.getElementById('proximo_data').value = data.data_proximo;
        document.getElementById('modalEngraxe').classList.remove('hidden');
    } catch (error) { console.error('Erro ao buscar registro:', error); }
};

window.excluirEngraxe = async function(id) {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;
    try { const { error } = await supabaseClient.from('controle_engraxe').delete().eq('id', id); if (error) throw error; carregarEngraxe(); }
    catch (error) { console.error('Erro ao excluir:', error); alert('Erro ao excluir registro.'); }
};

function abrirModalNovo() {
    document.getElementById('formEngraxe').reset();
    document.getElementById('engraxeId').value = '';
    document.getElementById('data_realizado').value = new Date().toISOString().split('T')[0];
    document.getElementById('modalEngraxe').classList.remove('hidden');
}

function fecharModal() { document.getElementById('modalEngraxe').classList.add('hidden'); }

async function gerarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18); doc.text('Relatório de Controle de Engraxe', 14, 20);
    doc.setFontSize(10); doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 26);
    const rows = [];
    document.querySelectorAll('#tbodyEngraxe tr').forEach(tr => {
        const cols = tr.querySelectorAll('td');
        if (cols.length > 1) rows.push([cols[0].innerText, cols[1].innerText, cols[2].innerText, cols[3].innerText, cols[4].innerText, cols[5].innerText, cols[6].innerText, cols[7].innerText, cols[8].innerText]);
    });
    doc.autoTable({ head: [['Placa', 'Modelo', 'Marca', 'Plaquinha', 'SEG', 'KM', 'Data', 'Próximo', 'Status']], body: rows, startY: 35, theme: 'grid', styles: { fontSize: 8 }, headStyles: { fillColor: [0, 105, 55] } });
    doc.save('Relatorio_Engraxe.pdf');
}