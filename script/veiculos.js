import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    carregarVeiculos();
    setupEventListeners();
});

// --- Inicialização e Eventos ---
function setupEventListeners() {
    // Botão Buscar
    document.getElementById('btn-buscar').addEventListener('click', carregarVeiculos);

    // Botão Novo Veículo (Abre em nova janela/aba conforme padrão de cadastro)
    document.getElementById('btn-novo-veiculo').addEventListener('click', () => {
        window.open('cadastro-veiculo.html', 'CadastroVeiculo', 'width=800,height=700');
    });

    // Botão Importar
    document.getElementById('btn-importar-massa').addEventListener('click', () => {
        document.getElementById('modalImportacao').classList.remove('hidden');
    });

    // Fechar Modal
    document.querySelector('.close-button').addEventListener('click', () => {
        document.getElementById('modalImportacao').classList.add('hidden');
    });

    // Botão Exportar Excel
    document.getElementById('btn-exportar-xls').addEventListener('click', exportarExcel);

    // Multiselect Tipo
    const display = document.getElementById('campo-tipo-display');
    const options = document.getElementById('campo-tipo-options');
    const btnLimpar = document.getElementById('btn-limpar-tipo');

    display.addEventListener('click', (e) => {
        e.stopPropagation();
        options.classList.toggle('hidden');
        options.style.display = options.classList.contains('hidden') ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
        if (!display.contains(e.target) && !options.contains(e.target)) {
            options.classList.add('hidden');
            options.style.display = 'none';
        }
    });

    btnLimpar.addEventListener('click', () => {
        document.querySelectorAll('.filtro-tipo-checkbox').forEach(cb => cb.checked = false);
        updateMultiselectText();
    });

    document.querySelectorAll('.filtro-tipo-checkbox').forEach(cb => {
        cb.addEventListener('change', updateMultiselectText);
    });
}

function updateMultiselectText() {
    const selected = Array.from(document.querySelectorAll('.filtro-tipo-checkbox:checked')).map(cb => cb.value);
    const text = document.getElementById('campo-tipo-text');
    
    if (selected.length === 0) {
        text.textContent = 'Todos os Tipos';
    } else if (selected.length === 1) {
        text.textContent = selected[0];
    } else {
        text.textContent = `${selected.length} selecionados`;
    }
    // Salva no input oculto para uso na busca
    document.getElementById('campo-tipo').value = selected.join(',');
}

async function initFilters() {
    // Carregar Filiais (Exemplo estático ou do banco)
    const selectFilial = document.getElementById('campo-filial');
    // Se tiver tabela de filiais, carregar aqui. Por enquanto, mantém as opções estáticas ou adiciona dinamicamente.
}

// --- Carregamento de Dados ---
async function carregarVeiculos() {
    const tbody = document.getElementById('grid-veiculos-body');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando...</td></tr>';

    try {
        let query = supabaseClient.from('veiculos').select('*');

        // Filtros
        const filial = document.getElementById('campo-filial').value;
        const placa = document.getElementById('campo-placa').value.trim();
        const modelo = document.getElementById('campo-modelo').value.trim();
        const situacao = document.getElementById('campo-situacao').value;
        const tipos = document.getElementById('campo-tipo').value;

        if (filial) query = query.eq('filial', filial);
        if (placa) query = query.ilike('placa', `%${placa}%`);
        if (modelo) query = query.ilike('modelo', `%${modelo}%`);
        if (situacao) query = query.eq('situacao', situacao);
        if (tipos) {
            const tiposArray = tipos.split(',');
            query = query.in('tipo', tiposArray);
        }

        const { data, error } = await query.order('placa', { ascending: true });

        if (error) throw error;

        renderTable(data);
        document.getElementById('grid-records-count').textContent = `${data.length} veículos`;

    } catch (err) {
        console.error('Erro ao carregar veículos:', err);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderTable(data) {
    const tbody = document.getElementById('grid-veiculos-body');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum veículo encontrado.</td></tr>';
        return;
    }

    data.forEach(v => {
        const tr = document.createElement('tr');
        
        let badgeClass = 'badge-inativo';
        if (v.situacao === 'ativo') badgeClass = 'badge-ativo';
        if (v.situacao === 'INTERNADO') badgeClass = 'badge-internado';

        tr.innerHTML = `
            <td>${v.filial || '-'}</td>
            <td style="font-weight:bold;">${v.placa}</td>
            <td>${v.modelo || '-'}</td>
            <td>${v.renavan || '-'}</td>
            <td>${v.tipo || '-'}</td>
            <td><span class="badge ${badgeClass}">${v.situacao || 'Indefinido'}</span></td>
            <td>${v.qrcode ? '<i class="fas fa-qrcode"></i>' : '-'}</td>
            <td>
                <button class="btn-icon btn-edit" data-id="${v.id}" title="Editar"><i class="fas fa-edit"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Event Listeners para botões de edição
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            // Abre a tela de cadastro passando o ID na URL para edição
            window.open(`cadastro-veiculo.html?id=${id}`, 'EdicaoVeiculo', 'width=800,height=700');
        });
    });
}

// --- Exportação ---
function exportarExcel() {
    const table = document.querySelector('.glass-table');
    if (!table) return;

    // Clona a tabela para remover colunas indesejadas (Ações)
    const clone = table.cloneNode(true);
    const rows = clone.querySelectorAll('tr');
    
    rows.forEach(row => {
        if (row.cells.length > 0) {
            row.deleteCell(-1); // Remove última coluna (Ações)
        }
    });

    const wb = XLSX.utils.table_to_book(clone, { sheet: "Veiculos" });
    XLSX.writeFile(wb, "Veiculos_Marquespan.xlsx");
}

// --- Estilos Adicionais para Botões de Ação na Tabela ---
const style = document.createElement('style');
style.innerHTML = `
    .btn-icon {
        background: none;
        border: none;
        cursor: pointer;
        color: #006937;
        font-size: 1.1rem;
        transition: color 0.2s;
    }
    .btn-icon:hover {
        color: #004d29;
    }
`;
document.head.appendChild(style);