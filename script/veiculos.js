import { supabaseClient } from './supabase.js';

let veiculosData = [];

document.addEventListener('DOMContentLoaded', () => {
    carregarFiliais();
    carregarTipos();
    carregarVeiculos();
    setupEventListeners();
    setupMultiselect();
});

function setupEventListeners() {
    document.getElementById('btn-buscar').addEventListener('click', carregarVeiculos);
    document.getElementById('btn-novo-veiculo').addEventListener('click', abrirModalNovoVeiculo);
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
}

async function carregarFiliais() {
    const select = document.getElementById('campo-filial');
    const selectImport = document.getElementById('importFilial');
    
    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');

        if (error) throw error;

        // Limpa opções exceto a primeira
        select.innerHTML = '<option value="">Todas</option>';
        if (selectImport) selectImport.innerHTML = '<option value="">Selecione a Filial</option>';

        if (data) {
            data.forEach(f => {
                const option = document.createElement('option');
                option.value = f.sigla || f.nome;
                option.textContent = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                
                select.appendChild(option.cloneNode(true));
                if (selectImport) selectImport.appendChild(option.cloneNode(true));
            });
        }
    } catch (err) {
        console.error('Erro ao carregar filiais:', err);
    }
}

async function carregarTipos() {
    const container = document.getElementById('campo-tipo-options');
    if (!container) return;

    // Tipos fixos conforme a página de cadastro
    const tipos = ['HR/VAN', 'MUNKC', 'SEMI-REBOQUE', 'OPERACIONAL', 'RESERVA'];
    
    // Mantém o cabeçalho (botão limpar)
    const header = container.querySelector('.dropdown-header');
    container.innerHTML = '';
    if (header) container.appendChild(header);

    tipos.forEach(tipo => {
        const label = document.createElement('label');
        label.className = 'dropdown-item';
        label.innerHTML = `<input type="checkbox" class="filtro-tipo-checkbox" value="${tipo}"> ${tipo}`;
        container.appendChild(label);
    });
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
        tr.innerHTML = `
            <td>${v.filial || '-'}</td>
            <td style="font-weight:bold;">${v.placa}</td>
            <td>${v.modelo || '-'}</td>
            <td>${v.renavan || '-'}</td>
            <td>${v.tipo || '-'}</td>
            <td><span class="status-badge ${v.situacao === 'ativo' ? 'status-ativo' : 'status-inativo'}">${v.situacao || '-'}</span></td>
            <td>${v.qrcode ? '<i class="fas fa-qrcode" title="Possui QR Code"></i>' : '-'}</td>
            <td>
                <button class="btn-icon edit" onclick="editarVeiculo('${v.id}')" title="Editar"><i class="fas fa-edit"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function setupMultiselect() {
    const display = document.getElementById('campo-tipo-display');
    const options = document.getElementById('campo-tipo-options');
    const text = document.getElementById('campo-tipo-text');
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
        btnLimpar.addEventListener('click', () => {
            options.querySelectorAll('.filtro-tipo-checkbox').forEach(cb => cb.checked = false);
            text.textContent = 'Todos os Tipos';
        });
    }
}

function abrirModalNovoVeiculo() {
    const width = 800;
    const height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open('cadastro-veiculo.html', 'NovoVeiculo', `width=${width},height=${height},top=${top},left=${left}`);
}

window.editarVeiculo = function(id) {
    const width = 800;
    const height = 600;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open(`cadastro-veiculo.html?id=${id}`, 'EditarVeiculo', `width=${width},height=${height},top=${top},left=${left}`);
}

window.refreshGrid = function() {
    carregarVeiculos();
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