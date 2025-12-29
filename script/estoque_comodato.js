document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initOperationSelection();
    loadProductsDropdown();
    loadStockSummary();

    document.getElementById('formLancamentoEstoque').addEventListener('submit', handleStockSubmit);
    document.getElementById('lancamentoProduto').addEventListener('change', updateProductType);
    document.getElementById('btnLimparLancamento').addEventListener('click', () => {
        document.getElementById('formLancamentoEstoque').reset();
        handleOperationChange(); // Reseta a visibilidade dos campos
    });
});

// --- Lógica de Abas (reutilizada de cadastro_comodato.js) ---
function initTabs() {
    const buttons = document.querySelectorAll('.painel-btn');
    const sections = document.querySelectorAll('.section');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.add('hidden'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-secao');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });
}

// --- Lógica do Formulário de Lançamento ---

function initOperationSelection() {
    const select = document.getElementById('tipoOperacao');
    select.addEventListener('change', handleOperationChange);
}

function handleOperationChange() {
    const operation = document.getElementById('tipoOperacao').value;
    const camposEntrada = document.getElementById('camposEntrada');
    const labelQtd = document.getElementById('labelQtd');

    // Esconde todos os campos específicos primeiro
    camposEntrada.classList.add('hidden');

    // Mostra os campos com base na operação
    if (operation === 'ENTRADA') {
        camposEntrada.classList.remove('hidden');
        labelQtd.textContent = 'Quantidade a Adicionar';
    } else if (operation === 'SAIDA') {
        labelQtd.textContent = 'Quantidade a Retirar';
    } else if (operation === 'CONTAGEM') {
        labelQtd.textContent = 'Nova Quantidade (Ajuste)';
    } else {
        labelQtd.textContent = 'Quantidade';
    }
}

// --- Lógica de Produtos e Estoque (LocalStorage) ---

const KEY_EQUIPAMENTOS = 'marquespan_comodato_equipamentos';
const KEY_ESTOQUE = 'marquespan_comodato_estoque';

function getEquipamentos() {
    return JSON.parse(localStorage.getItem(KEY_EQUIPAMENTOS)) || [];
}

function getEstoque() {
    return JSON.parse(localStorage.getItem(KEY_ESTOQUE)) || {};
}

function saveEstoque(estoque) {
    localStorage.setItem(KEY_ESTOQUE, JSON.stringify(estoque));
}

function loadProductsDropdown() {
    const equipamentos = getEquipamentos();
    const select = document.getElementById('lancamentoProduto');
    select.innerHTML = '<option value="">-- Selecione um Produto --</option>';

    equipamentos.sort((a, b) => a.nome.localeCompare(b.nome));

    equipamentos.forEach(equip => {
        const option = document.createElement('option');
        option.value = equip.id;
        option.textContent = equip.nome;
        option.dataset.tipo = equip.tipo || 'NORMAL';
        select.appendChild(option);
    });
}

function updateProductType() {
    const select = document.getElementById('lancamentoProduto');
    const selectedOption = select.options[select.selectedIndex];
    const tipoInput = document.getElementById('lancamentoTipoProduto');
    
    if (selectedOption && selectedOption.value) {
        tipoInput.value = selectedOption.dataset.tipo;
    } else {
        tipoInput.value = '';
    }
}

function handleStockSubmit(e) {
    e.preventDefault();

    const operation = document.getElementById('tipoOperacao').value;
    const productId = document.getElementById('lancamentoProduto').value;
    const quantity = parseInt(document.getElementById('lancamentoQtd').value);

    if (!operation || !productId || isNaN(quantity)) {
        alert('Por favor, preencha todos os campos da operação.');
        return;
    }

    let estoque = getEstoque();
    const currentStock = estoque[productId] || 0;

    switch (operation) {
        case 'ENTRADA':
            estoque[productId] = currentStock + quantity;
            break;
        case 'SAIDA':
            if (quantity > currentStock) {
                alert(`Erro: Não é possível retirar ${quantity} unidades. Estoque atual: ${currentStock}.`);
                return;
            }
            estoque[productId] = currentStock - quantity;
            break;
        case 'CONTAGEM':
            if (quantity < 0) {
                alert('A quantidade da contagem não pode ser negativa.');
                return;
            }
            estoque[productId] = quantity;
            break;
        default:
            alert('Operação inválida.');
            return;
    }

    saveEstoque(estoque);
    alert('Lançamento de estoque salvo com sucesso!');
    
    document.getElementById('formLancamentoEstoque').reset();
    handleOperationChange();
    loadStockSummary();
}

// --- Lógica do Resumo de Estoque ---

function loadStockSummary() {
    const estoque = getEstoque();
    const equipamentos = getEquipamentos();
    const tbody = document.getElementById('tableBodyResumoEstoque');
    tbody.innerHTML = '';

    // Criar um mapa de equipamentos para fácil acesso
    const equipMap = new Map(equipamentos.map(e => [String(e.id), e]));

    if (Object.keys(estoque).length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">Nenhum item em estoque.</td></tr>';
        return;
    }
    
    // Ordenar pelo nome do produto
    const sortedStock = Object.entries(estoque).sort((a, b) => {
        const equipA = equipMap.get(a[0]);
        const equipB = equipMap.get(b[0]);
        if (equipA && equipB) {
            return equipA.nome.localeCompare(equipB.nome);
        }
        return 0;
    });

    for (const [productId, quantity] of sortedStock) {
        const equip = equipMap.get(productId);
        if (equip) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${equip.nome}</td>
                <td>${equip.tipo || 'NORMAL'}</td>
                <td>${quantity}</td>
            `;
            tbody.appendChild(tr);
        }
    }
}