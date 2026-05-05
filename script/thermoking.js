import { supabaseClient } from './supabase.js';

let tkData = [];
let currentSort = { column: 'numero_serie', direction: 'asc' };

document.addEventListener('DOMContentLoaded', () => {
    carregarFiliais();
    carregarPlacas();
    carregarTK();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('btn-buscar')?.addEventListener('click', carregarTK);
    document.getElementById('btn-novo-tk')?.addEventListener('click', () => abrirModalTK());
    document.getElementById('btnCloseModalTk')?.addEventListener('click', fecharModalTK);
    document.getElementById('btnCancelarTk')?.addEventListener('click', fecharModalTK);
    document.getElementById('formTk')?.addEventListener('submit', salvarTK);
    document.getElementById('grid-tk-body')?.addEventListener('click', handleTableClick);
    document.getElementById('tkStatus')?.addEventListener('change', toggleDescricao);

    // Ordenação
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => ordenarTK(th.dataset.sort));
    });
}

async function carregarFiliais() {
    const selectModal = document.getElementById('tkFilial');
    const selectFiltro = document.getElementById('campo-filial');
    const { data, error } = await supabaseClient.from('filiais').select('nome, sigla').order('nome');
    if (error) return console.error('Erro filiais:', error);

    const options = data.map(f => `<option value="${f.sigla || f.nome}">${f.nome}</option>`).join('');
    if(selectModal) selectModal.innerHTML = '<option value="">Selecione</option>' + options;
    if(selectFiltro) selectFiltro.innerHTML = '<option value="">Todas</option>' + options;
}

async function carregarPlacas() {
    const selectPlaca = document.getElementById('tkPlaca');
    const { data, error } = await supabaseClient.from('veiculos').select('placa').order('placa');
    if (error) return console.error('Erro placas:', error);

    if(selectPlaca) {
        selectPlaca.innerHTML = '<option value="">Nenhuma</option>' + 
            data.map(v => `<option value="${v.placa}">${v.placa}</option>`).join('');
    }
}

async function carregarTK() {
    const tbody = document.getElementById('grid-tk-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';

    const filial = document.getElementById('campo-filial').value;
    const serie = document.getElementById('campo-serie').value.trim();
    const modelo = document.getElementById('campo-modelo').value.trim();
    const status = document.getElementById('campo-situacao').value;

    let query = supabaseClient.from('thermoking').select('*');

    if (filial) query = query.eq('filial', filial);
    if (serie) query = query.ilike('numero_serie', `%${serie}%`);
    if (modelo) query = query.ilike('modelo', `%${modelo}%`);
    if (status) query = query.eq('status', status);

    const { data, error } = await query.order(currentSort.column, { ascending: currentSort.direction === 'asc' });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
        return;
    }

    tkData = data;
    renderizarTabela();
    document.getElementById('grid-records-count').textContent = `${data.length} registros`;
}

function renderizarTabela() {
    const tbody = document.getElementById('grid-tk-body');
    tbody.innerHTML = tkData.map(v => `
        <tr>
            <td>${v.filial}</td>
            <td style="font-weight:bold">${v.numero_serie}</td>
            <td>${v.modelo || '-'}</td>
            <td>${v.ano || '-'}</td>
            <td>${v.placa_vinculada || '-'}</td>
            <td><span class="status-badge status-${v.status.replace(' ', '-').toLowerCase()}">${v.status}</span></td>
            <td>
                <button class="btn-icon edit btn-edit" data-id="${v.id}" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete btn-delete" data-id="${v.id}" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
}

function abrirModalTK(equipamento = null) {
    const form = document.getElementById('formTk');
    const title = document.getElementById('modalTitle');
    form.reset();

    if (equipamento) {
        title.textContent = 'Editar Equipamento';
        document.getElementById('tkId').value = equipamento.id;
        document.getElementById('tkFilial').value = equipamento.filial;
        document.getElementById('tkSerie').value = equipamento.numero_serie;
        document.getElementById('tkModelo').value = equipamento.modelo;
        document.getElementById('tkAno').value = equipamento.ano;
        document.getElementById('tkPlaca').value = equipamento.placa_vinculada || '';
        document.getElementById('tkStatus').value = equipamento.status;
        document.getElementById('tkDescricao').value = equipamento.descricao_status || '';
    } else {
        title.textContent = 'Novo Equipamento';
        document.getElementById('tkId').value = '';
    }

    toggleDescricao();
    document.getElementById('modalTk').classList.remove('hidden');
}

function fecharModalTK() {
    document.getElementById('modalTk').classList.add('hidden');
}

function toggleDescricao() {
    const status = document.getElementById('tkStatus').value;
    const row = document.getElementById('rowDescricao');
    if (status !== 'Ativo') {
        row.classList.remove('hidden');
    } else {
        row.classList.add('hidden');
    }
}

async function salvarTK(e) {
    e.preventDefault();
    const id = document.getElementById('tkId').value;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'))?.nome || 'Sistema';

    const payload = {
        filial: document.getElementById('tkFilial').value,
        numero_serie: document.getElementById('tkSerie').value.toUpperCase(),
        modelo: document.getElementById('tkModelo').value,
        ano: parseInt(document.getElementById('tkAno').value) || null,
        placa_vinculada: document.getElementById('tkPlaca').value || null,
        status: document.getElementById('tkStatus').value,
        descricao_status: document.getElementById('tkDescricao').value,
        usuario_cadastro: usuario
    };

    const { error } = id 
        ? await supabaseClient.from('thermoking').update(payload).eq('id', id)
        : await supabaseClient.from('thermoking').insert([payload]);

    if (error) {
        alert('Erro ao salvar: ' + error.message);
    } else {
        alert('Salvo com sucesso!');
        fecharModalTK();
        carregarTK();
    }
}

async function handleTableClick(e) {
    const id = e.target.closest('button')?.dataset.id;
    if (!id) return;

    if (e.target.closest('.btn-edit')) {
        const item = tkData.find(x => x.id == id);
        abrirModalTK(item);
    } else if (e.target.closest('.btn-delete')) {
        if (confirm('Deseja realmente excluir este registro?')) {
            await supabaseClient.from('thermoking').delete().eq('id', id);
            carregarTK();
        }
    }
}

function ordenarTK(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    carregarTK();
}