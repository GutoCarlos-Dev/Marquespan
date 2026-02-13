import { supabaseClient } from './supabase.js';

let veiculosData = [];
let currentSort = { column: null, direction: 'asc' };

document.addEventListener('DOMContentLoaded', () => {
    carregarFiliais();
    carregarTipos();
    carregarVeiculos();
    setupEventListeners();
    setupMultiselect();
    setupSorting();
});

function setupEventListeners() {
    document.getElementById('btn-buscar').addEventListener('click', carregarVeiculos);
    document.getElementById('btn-novo-veiculo').addEventListener('click', () => abrirModalVeiculo());
    document.getElementById('btn-importar-massa').addEventListener('click', () => {
        document.getElementById('modalImportacao').classList.remove('hidden');
    });
    document.getElementById('btn-exportar-xls').addEventListener('click', exportarExcel);
    
    // Fechar modal de importação
    document.querySelector('#modalImportacao .close-button').addEventListener('click', () => {
        document.getElementById('modalImportacao').classList.add('hidden');
    });

    // Form de importação
    document.getElementById('formImportacao').addEventListener('submit', handleImportacao);

    // Modal de Veículo (Novo/Editar)
    document.getElementById('btnCloseModalVeiculo').addEventListener('click', fecharModalVeiculo);
    document.getElementById('formVeiculo').addEventListener('submit', salvarVeiculo);

    // Delegação de eventos na tabela (Editar/Excluir)
    document.getElementById('grid-veiculos-body').addEventListener('click', handleTableClick);

    // Fechar modais ao clicar fora
    window.addEventListener('click', (e) => {
        const modalVeiculo = document.getElementById('modalVeiculo');
        const modalImportacao = document.getElementById('modalImportacao');
        if (e.target === modalVeiculo) fecharModalVeiculo();
        if (e.target === modalImportacao) modalImportacao.classList.add('hidden');
    });
}

function handleTableClick(e) {
    const btnEdit = e.target.closest('.btn-edit');
    const btnDelete = e.target.closest('.btn-delete');

    if (btnEdit) editarVeiculo(btnEdit.dataset.id);
    if (btnDelete) excluirVeiculo(btnDelete.dataset.id);
}

async function carregarFiliais() {
    const select = document.getElementById('campo-filial');
    const selectImport = document.getElementById('importFilial');
    const selectModal = document.getElementById('veiculoFilial');
    
    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');

        if (error) throw error;

        // Limpa opções exceto a primeira
        select.innerHTML = '<option value="">Todas</option>';
        if (selectImport) selectImport.innerHTML = '<option value="">Selecione a Filial</option>';
        if (selectModal) selectModal.innerHTML = '<option value="">Selecione</option>';

        if (data) {
            data.forEach(f => {
                const option = document.createElement('option');
                option.value = f.sigla || f.nome;
                option.textContent = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                
                select.appendChild(option.cloneNode(true));
                if (selectImport) selectImport.appendChild(option.cloneNode(true));
                if (selectModal) selectModal.appendChild(option.cloneNode(true));
            });
        }
    } catch (err) {
        console.error('Erro ao carregar filiais:', err);
    }
}

function carregarTipos() {
    const container = document.getElementById('campo-tipo-options');
    const selectModal = document.getElementById('veiculoTipo');
    
    // Lista fixa conforme solicitado
    const tipos = ['HR/VAN', 'MUNKC', 'SEMI-REBOQUE', 'OPERACIONAL', 'RESERVA', 'CAVALO MECANICO', 'TOCO', 'TRUCK', 'BITRUCK', 'UTILITARIO'];
    
    if (!container) return;
    
    // Reconstrói o HTML do zero para garantir que o cabeçalho e itens existam
    container.innerHTML = `
        <div class="dropdown-header" style="padding: 8px; border-bottom: 1px solid #eee; margin-bottom: 5px;">
            <button type="button" id="btn-limpar-tipo" style="width: 100%; padding: 5px; cursor: pointer; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px;">Limpar Selecionados</button>
        </div>
    `;

    tipos.forEach(tipo => {
        const label = document.createElement('label');
        label.className = 'dropdown-item';
        label.style.display = 'block'; // Garante visibilidade
        label.style.padding = '6px 10px';
        label.style.cursor = 'pointer';
        label.innerHTML = `<input type="checkbox" class="filtro-tipo-checkbox" value="${tipo}"> ${tipo}`;
        container.appendChild(label);
    });

    // Popula o select do modal também
    if (selectModal) {
        selectModal.innerHTML = '<option value="">Selecione</option>';
        tipos.forEach(tipo => {
            selectModal.add(new Option(tipo, tipo));
        });
    }
}

async function carregarVeiculos() {
    const tbody = document.getElementById('grid-veiculos-body');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando...</td></tr>';

    const filial = document.getElementById('campo-filial').value;
    const placa = document.getElementById('campo-placa').value.trim();
    const modelo = document.getElementById('campo-modelo').value.trim();
    const situacao = document.getElementById('campo-situacao').value;
    
    // Tipos selecionados
    const tiposSelecionados = Array.from(document.querySelectorAll('.filtro-tipo-checkbox:checked')).map(cb => cb.value);

    try {
        let query = supabaseClient
            .from('veiculos')
            .select('*')
            .order('placa');

        if (filial) query = query.eq('filial', filial);
        if (placa) query = query.ilike('placa', `%${placa}%`);
        if (modelo) query = query.ilike('modelo', `%${modelo}%`);
        if (situacao) query = query.eq('situacao', situacao);
        if (tiposSelecionados.length > 0) query = query.in('tipo', tiposSelecionados);

        const { data, error } = await query;

        if (error) throw error;

        veiculosData = data;
        renderizarTabela(data);
        
        // Atualiza contador
        const contador = document.getElementById('grid-records-count');
        if (contador) contador.textContent = `${data.length} veículos`;

    } catch (err) {
        console.error('Erro ao carregar veículos:', err);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderizarTabela(veiculos) {
    const tbody = document.getElementById('grid-veiculos-body');
    tbody.innerHTML = '';

    if (veiculos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum veículo encontrado.</td></tr>';
        return;
    }

    veiculos.forEach(v => {
        const tr = document.createElement('tr');
        
        // Criação segura de elementos (evita XSS)
        const tdFilial = document.createElement('td'); tdFilial.textContent = v.filial || '-';
        const tdPlaca = document.createElement('td'); tdPlaca.textContent = v.placa; tdPlaca.style.fontWeight = 'bold';
        const tdModelo = document.createElement('td'); tdModelo.textContent = v.modelo || '-';
        const tdRenavan = document.createElement('td'); tdRenavan.textContent = v.renavan || '-';
        const tdTipo = document.createElement('td'); tdTipo.textContent = v.tipo || '-';
        
        const tdSituacao = document.createElement('td');
        const spanStatus = document.createElement('span');
        spanStatus.className = `status-badge ${v.situacao === 'ativo' ? 'status-ativo' : 'status-inativo'}`;
        spanStatus.textContent = v.situacao || '-';
        tdSituacao.appendChild(spanStatus);

        const tdQr = document.createElement('td');
        if (v.qrcode) {
            tdQr.innerHTML = '<i class="fas fa-qrcode" title="Possui QR Code"></i>';
        } else {
            tdQr.textContent = '-';
        }

        const tdAcoes = document.createElement('td');
        
        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn-icon edit btn-edit';
        btnEdit.title = 'Editar';
        btnEdit.dataset.id = v.id;
        btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
        
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-icon delete btn-delete';
        btnDelete.title = 'Excluir';
        btnDelete.dataset.id = v.id;
        btnDelete.innerHTML = '<i class="fas fa-trash"></i>';
        btnDelete.style.marginLeft = '5px';

        tdAcoes.append(btnEdit, btnDelete);

        tr.append(tdFilial, tdPlaca, tdModelo, tdRenavan, tdTipo, tdSituacao, tdQr, tdAcoes);
        tbody.appendChild(tr);
    });
}

function setupMultiselect() {
    const display = document.getElementById('campo-tipo-display');
    const options = document.getElementById('campo-tipo-options');
    const text = document.getElementById('campo-tipo-text');
    // Busca o botão novamente pois ele foi recriado em carregarTipos()
    const btnLimpar = document.getElementById('btn-limpar-tipo'); 

    if (!display || !options) return;

    display.addEventListener('click', (e) => {
        e.stopPropagation();
        options.classList.toggle('hidden');
    });

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        if (!display.contains(e.target) && !options.contains(e.target)) {
            options.classList.add('hidden');
        }
    });

    // Atualizar texto ao selecionar
    options.addEventListener('change', () => {
        const checked = options.querySelectorAll('.filtro-tipo-checkbox:checked');
        if (checked.length === 0) {
            text.textContent = 'Todos os Tipos';
        } else if (checked.length === 1) {
            text.textContent = checked[0].value;
        } else {
            text.textContent = `${checked.length} selecionados`;
        }
    });

    if (btnLimpar) {
        btnLimpar.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita fechar o dropdown ao clicar em limpar
            options.querySelectorAll('.filtro-tipo-checkbox').forEach(cb => cb.checked = false);
            text.textContent = 'Todos os Tipos';
        });
    }
}

// --- Funções do Modal de Veículo ---

function abrirModalVeiculo(veiculo = null) {
    const modal = document.getElementById('modalVeiculo');
    const form = document.getElementById('formVeiculo');
    const title = document.getElementById('modalTitle');

    form.reset();
    
    if (veiculo) {
        title.textContent = 'Editar Veículo';
        document.getElementById('veiculoId').value = veiculo.id;
        document.getElementById('veiculoFilial').value = veiculo.filial || '';
        document.getElementById('veiculoPlaca').value = veiculo.placa || '';
        document.getElementById('veiculoMarca').value = veiculo.marca || '';
        document.getElementById('veiculoModelo').value = veiculo.modelo || '';
        document.getElementById('veiculoRenavan').value = veiculo.renavan || '';
        document.getElementById('veiculoTipo').value = veiculo.tipo || '';
        document.getElementById('veiculoSituacao').value = veiculo.situacao || 'ativo';
        document.getElementById('veiculoQrcode').value = veiculo.qrcode || '';
        // Campos extras se existirem no form
        if(document.getElementById('veiculoChassi')) document.getElementById('veiculoChassi').value = veiculo.chassi || '';
        if(document.getElementById('veiculoAnoFab')) document.getElementById('veiculoAnoFab').value = veiculo.anofab || '';
        if(document.getElementById('veiculoAnoMod')) document.getElementById('veiculoAnoMod').value = veiculo.anomod || '';
        if(document.getElementById('veiculoQtdTanque')) document.getElementById('veiculoQtdTanque').value = veiculo.qtdtanque || '';
    } else {
        title.textContent = 'Novo Veículo';
        document.getElementById('veiculoId').value = '';
    }

    modal.classList.remove('hidden');
}

function fecharModalVeiculo() {
    document.getElementById('modalVeiculo').classList.add('hidden');
}

async function editarVeiculo(id) {
    try {
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        abrirModalVeiculo(data);
    } catch (err) {
        console.error('Erro ao carregar veículo:', err);
        alert('Erro ao carregar dados do veículo.');
    }
}

async function salvarVeiculo(e) {
    e.preventDefault();
    
    const id = document.getElementById('veiculoId').value;
    const payload = {
        filial: document.getElementById('veiculoFilial').value,
        placa: document.getElementById('veiculoPlaca').value.toUpperCase(),
        marca: document.getElementById('veiculoMarca').value,
        modelo: document.getElementById('veiculoModelo').value,
        renavan: document.getElementById('veiculoRenavan').value,
        tipo: document.getElementById('veiculoTipo').value,
        situacao: document.getElementById('veiculoSituacao').value,
        qrcode: document.getElementById('veiculoQrcode').value,
        chassi: document.getElementById('veiculoChassi')?.value || null,
        anofab: document.getElementById('veiculoAnoFab')?.value || null,
        anomod: document.getElementById('veiculoAnoMod')?.value || null,
        qtdtanque: document.getElementById('veiculoQtdTanque')?.value || null
    };

    // Limpeza de campos vazios numéricos
    if (!payload.anofab) delete payload.anofab;
    if (!payload.anomod) delete payload.anomod;
    if (!payload.qtdtanque) delete payload.qtdtanque;

    try {
        let error;
        if (id) {
            ({ error } = await supabaseClient.from('veiculos').update(payload).eq('id', id));
        } else {
            ({ error } = await supabaseClient.from('veiculos').insert([payload]));
        }

        if (error) throw error;
        alert('Veículo salvo com sucesso!');
        fecharModalVeiculo();
        carregarVeiculos();
    } catch (err) {
        console.error('Erro ao salvar:', err);
        alert('Erro ao salvar veículo: ' + err.message);
    }
}

async function excluirVeiculo(id) {
    if (!confirm('Tem certeza que deseja excluir este veículo?')) return;
    try {
        const { error } = await supabaseClient.from('veiculos').delete().eq('id', id);
        if (error) throw error;
        carregarVeiculos();
    } catch (err) {
        console.error('Erro ao excluir:', err);
        alert('Erro ao excluir veículo.');
    }
}

function exportarExcel() {
    if (veiculosData.length === 0) {
        alert('Sem dados para exportar.');
        return;
    }
    const ws = XLSX.utils.json_to_sheet(veiculosData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Veiculos");
    XLSX.writeFile(wb, "veiculos.xlsx");
}

async function handleImportacao(e) {
    e.preventDefault();
    // Implementação básica de importação se necessário
    alert('Funcionalidade de importação em desenvolvimento.');
}

function setupSorting() {
    const headers = document.querySelectorAll('th.sortable');
    headers.forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            ordenarVeiculos(column);
        });
        th.style.cursor = 'pointer';
    });
}

function ordenarVeiculos(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    document.querySelectorAll('th.sortable i').forEach(icon => {
        icon.className = 'fas fa-sort';
    });
    
    const activeTh = document.querySelector(`th[data-sort="${column}"] i`);
    if (activeTh) {
        activeTh.className = currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }

    veiculosData.sort((a, b) => {
        let valA = (a[column] || '').toString().toLowerCase();
        let valB = (b[column] || '').toString().toLowerCase();

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    renderizarTabela(veiculosData);
}