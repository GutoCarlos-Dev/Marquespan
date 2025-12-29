let lancamentoCarrinho = []; // Carrinho para os itens do lançamento

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initOperationSelection();
    loadProductsDropdown();
    loadStockSummary();

    // Listeners
    document.getElementById('btnAdicionarItem').addEventListener('click', handleAddItem);
    document.getElementById('btnSalvarLancamento').addEventListener('click', handleSalvarLancamento);
    document.getElementById('btnCancelarLancamento').addEventListener('click', clearFullForm);
    document.getElementById('lancamentoProduto').addEventListener('change', updateProductType);
    
    handleOperationChange(); // Garante o estado inicial correto do formulário
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
    const addItemForm = document.getElementById('formAddItemEstoque');

    // Esconde todos os campos específicos primeiro
    camposEntrada.classList.add('hidden');

    // Mostra os campos e ajusta labels com base na operação
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

    // Habilita/desabilita o formulário de adicionar item
    addItemForm.style.display = operation ? 'block' : 'none';
}

function handleAddItem() {
    const produtoSelect = document.getElementById('lancamentoProduto');
    const produtoId = produtoSelect.value;
    const produtoNome = produtoSelect.options[produtoSelect.selectedIndex].text;
    const tipoProduto = document.getElementById('lancamentoTipoProduto').value;
    const quantidade = parseInt(document.getElementById('lancamentoQtd').value);

    if (!produtoId || isNaN(quantidade) || quantidade <= 0) {
        alert('Selecione um produto e informe uma quantidade válida.');
        return;
    }

    // Adiciona ao carrinho
    lancamentoCarrinho.push({
        id: produtoId,
        nome: produtoNome,
        tipo: tipoProduto,
        quantidade: quantidade
    });

    renderCarrinho();

    // Limpa campos para o próximo item
    produtoSelect.value = '';
    document.getElementById('lancamentoTipoProduto').value = '';
    document.getElementById('lancamentoQtd').value = '';
    produtoSelect.focus();
}

function renderCarrinho() {
    const gridCarrinho = document.getElementById('grid-lancamento-atual');
    gridCarrinho.innerHTML = '';

    if (lancamentoCarrinho.length === 0) {
        gridCarrinho.innerHTML = `<tr><td colspan="4" class="text-center">Nenhum item adicionado.</td></tr>`;
        return;
    }

    lancamentoCarrinho.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.nome}</td>
            <td>${item.tipo}</td>
            <td>${item.quantidade}</td>
            <td class="actions-cell">
                <button class="btn-pneu-action delete" onclick="removerItemDoCarrinho(${index})" title="Remover Item">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        gridCarrinho.appendChild(tr);
    });
}

// Expor a função para o onclick
window.removerItemDoCarrinho = function(index) {
    lancamentoCarrinho.splice(index, 1);
    renderCarrinho();
}

function clearFullForm() {
    document.getElementById('formCabecalhoLancamento').reset();
    document.getElementById('formAddItemEstoque').reset();
    lancamentoCarrinho = [];
    renderCarrinho();
    handleOperationChange(); // Reseta a visibilidade dos campos
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

function handleSalvarLancamento() {
    const operation = document.getElementById('tipoOperacao').value;

    if (!operation) {
        alert('Por favor, selecione o Tipo de Operação.');
        return;
    }
    if (lancamentoCarrinho.length === 0) {
        alert('Adicione pelo menos um item ao lançamento.');
        return;
    }

    let estoque = getEstoque();

    // Validação prévia para saídas
    if (operation === 'SAIDA') {
        for (const item of lancamentoCarrinho) {
            const currentStock = estoque[item.id] || 0;
            if (item.quantidade > currentStock) {
                alert(`Erro de estoque para o produto "${item.nome}":\nNão é possível retirar ${item.quantidade} unidades. Estoque atual: ${currentStock}.`);
                return; // Aborta a operação
            }
        }
    }

    // Processamento
    lancamentoCarrinho.forEach(item => {
        const productId = item.id;
        const quantity = item.quantidade;
        const currentStock = estoque[productId] || 0;

        switch (operation) {
            case 'ENTRADA':
                estoque[productId] = currentStock + quantity;
                break;
            case 'SAIDA':
                estoque[productId] = currentStock - quantity;
                break;
            case 'CONTAGEM':
                estoque[productId] = quantity;
                break;
        }
    });

    saveEstoque(estoque);
    alert('Lançamento de estoque salvo com sucesso!');
    
    clearFullForm();
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
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Nenhum item em estoque.</td></tr>';
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