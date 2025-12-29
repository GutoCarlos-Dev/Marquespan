let lancamentoCarrinho = []; // Carrinho para os itens do lançamento

// Variáveis de estado para controlar a edição de lançamentos
let isEditingLaunch = false;
let editingLaunchId = null;

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initOperationSelection();
    loadProductsDropdown();
    loadStockSummary();
    loadStockHistory();

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

// --- Funções de Utilidade ---
function getCurrentUserName() {
  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  return usuario ? usuario.nome : 'Sistema';
}

// --- Lógica do Formulário de Lançamento ---

function initOperationSelection() {
    const select = document.getElementById('tipoOperacao');
    select.addEventListener('change', handleOperationChange);
}

function handleOperationChange() {
    const operation = document.getElementById('tipoOperacao').value;
    const camposEntrada = document.getElementById('camposEntrada');
    const groupDataNota = document.getElementById('groupDataNota');
    const entradaNf = document.getElementById('entradaNf');
    const labelQtd = document.getElementById('labelQtd');
    const addItemForm = document.getElementById('formAddItemEstoque');

    // Reset state first
    camposEntrada.classList.add('hidden');
    groupDataNota.style.display = 'block';
    entradaNf.value = '';
    entradaNf.readOnly = false;
    entradaNf.placeholder = 'Número da NF';

    let showOnlyInStock = false;

    // Apply logic based on operation
    if (operation === 'ENTRADA') {
        camposEntrada.classList.remove('hidden');
        labelQtd.textContent = 'Quantidade a Adicionar';
    } else if (operation === 'SAIDA') {
        labelQtd.textContent = 'Quantidade a Retirar';
        showOnlyInStock = true;
    } else if (operation === 'CONTAGEM') {
        camposEntrada.classList.remove('hidden');
        groupDataNota.style.display = 'none';
        entradaNf.value = 'Contagem';
        entradaNf.readOnly = true;
        entradaNf.placeholder = '';
        labelQtd.textContent = 'Nova Quantidade (Ajuste)';
        showOnlyInStock = true; // Conforme solicitado, mostra apenas itens em estoque para contagem
    } else {
        labelQtd.textContent = 'Quantidade';
    }

    // Habilita/desabilita o formulário de adicionar item
    addItemForm.style.display = operation ? 'block' : 'none';

    // Recarrega o dropdown de produtos com o filtro correto
    loadProductsDropdown(showOnlyInStock);
}

function handleAddItem() {
    const operation = document.getElementById('tipoOperacao').value;
    const produtoSelect = document.getElementById('lancamentoProduto');
    const produtoId = produtoSelect.value;
    const produtoNome = produtoSelect.options[produtoSelect.selectedIndex].text;
    const tipoProduto = document.getElementById('lancamentoTipoProduto').value;
    const quantidade = parseInt(document.getElementById('lancamentoQtd').value);

    if (!produtoId || isNaN(quantidade)) {
        alert('Selecione um produto e informe uma quantidade válida.');
        return;
    }

    // Permite 0 para Contagem, mas não para outras operações
    if (operation === 'CONTAGEM') {
        if (quantidade < 0) {
            alert('A quantidade para contagem não pode ser negativa.');
            return;
        }
    } else if (quantidade <= 0) { // Para ENTRADA e SAIDA
        alert('A quantidade para Entrada ou Saída deve ser maior que zero.');
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

    // Reseta o estado de edição
    isEditingLaunch = false;
    editingLaunchId = null;
    document.getElementById('btnSalvarLancamento').textContent = 'Salvar Lançamento';

}

// --- Lógica de Produtos e Estoque (LocalStorage) ---

const KEY_EQUIPAMENTOS = 'marquespan_comodato_equipamentos';
const KEY_ESTOQUE = 'marquespan_comodato_estoque';
const KEY_HISTORICO = 'marquespan_comodato_estoque_historico';

function getEquipamentos() {
    return JSON.parse(localStorage.getItem(KEY_EQUIPAMENTOS)) || [];
}

function getEstoque() {
    return JSON.parse(localStorage.getItem(KEY_ESTOQUE)) || {};
}

function saveEstoque(estoque) {
    localStorage.setItem(KEY_ESTOQUE, JSON.stringify(estoque));
}

function loadProductsDropdown(onlyInStock = false) {
    let equipamentos = getEquipamentos();
    const select = document.getElementById('lancamentoProduto');
    select.innerHTML = '<option value="">-- Selecione um Produto --</option>';

    if (onlyInStock) {
        const estoque = getEstoque();
        // Filtra para pegar apenas IDs de produtos que existem no estoque e tem quantidade > 0
        const inStockIds = Object.keys(estoque).filter(id => estoque[id] > 0);
        equipamentos = equipamentos.filter(equip => inStockIds.includes(String(equip.id)));
    }

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
    const historico = JSON.parse(localStorage.getItem(KEY_HISTORICO)) || [];
    let lancamentoOriginal = null;

    // --- LÓGICA DE EDIÇÃO: Encontra o lançamento original e prepara a reversão do estoque ---
    if (isEditingLaunch && editingLaunchId) {
        const lancamentoOriginalIndex = historico.findIndex(l => l.id === editingLaunchId);
        if (lancamentoOriginalIndex === -1) {
            alert('Erro: Lançamento original não encontrado para atualizar.');
            clearFullForm(); // Reseta o estado
            return;
        }
        lancamentoOriginal = historico[lancamentoOriginalIndex];

        // Verifica se podemos reverter a operação original
        if (lancamentoOriginal.operacao === 'CONTAGEM') {
            alert('Não é possível editar uma operação de "Contagem". Por favor, exclua este lançamento e crie um novo se necessário.');
            return;
        }

        // 1. Reverte as alterações de estoque originais
        for (const item of lancamentoOriginal.itens) {
            const productId = item.id;
            const quantity = item.quantidade;
            const currentStock = estoque[productId] || 0;

            switch (lancamentoOriginal.operacao) {
                case 'ENTRADA':
                    if (currentStock < quantity) {
                        alert(`Não é possível editar este lançamento. A tentativa de reverter a entrada de "${item.nome}" falhou porque o estoque atual (${currentStock}) é menor que a quantidade da entrada (${quantity}).`);
                        return; // Aborta a edição
                    }
                    estoque[productId] = currentStock - quantity;
                    break;
                case 'SAIDA':
                    estoque[productId] = currentStock + quantity;
                    break;
            }
        }
    }

    // --- VALIDAÇÃO para a NOVA operação ---
    if (operation === 'SAIDA') {
        for (const item of lancamentoCarrinho) {
            const currentStockAfterRevert = estoque[item.id] || 0;
            if (item.quantidade > currentStockAfterRevert) {
                alert(`Erro de estoque para o produto "${item.nome}":\nNão é possível retirar ${item.quantidade} unidades. Estoque disponível (após reverter a operação original, se aplicável): ${currentStockAfterRevert}.`);
                return; // Aborta a operação
            }
        }
    }

    // --- APLICA NOVAS ALTERAÇÕES ---
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

    // --- SALVA NO HISTÓRICO (ATUALIZA OU INSERE) ---
    if (isEditingLaunch && editingLaunchId) {
        const lancamentoOriginalIndex = historico.findIndex(l => l.id === editingLaunchId);
        const lancamentoAtualizado = {
            id: editingLaunchId, // Mantém o ID original
            timestamp: new Date().toISOString(), // Atualiza o timestamp
            usuario: getCurrentUserName(),
            operacao: operation,
            data_nota: document.getElementById('entradaDataNota').value,
            numero_nota: operation === 'CONTAGEM' ? 'Contagem' : document.getElementById('entradaNf').value,
            itens: [...lancamentoCarrinho]
        };
        historico[lancamentoOriginalIndex] = lancamentoAtualizado;
    } else {
        const novoLancamento = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            usuario: getCurrentUserName(),
            operacao: operation,
            data_nota: document.getElementById('entradaDataNota').value,
            numero_nota: operation === 'CONTAGEM' ? 'Contagem' : document.getElementById('entradaNf').value,
            itens: [...lancamentoCarrinho]
        };
        historico.push(novoLancamento);
    }
    
    localStorage.setItem(KEY_HISTORICO, JSON.stringify(historico));

    alert(`Lançamento ${isEditingLaunch ? 'atualizado' : 'salvo'} com sucesso!`);
    
    clearFullForm();
    loadStockSummary();
    loadStockHistory();
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

// --- Lógica do Histórico de Lançamentos ---

function loadStockHistory() {
    const historico = JSON.parse(localStorage.getItem(KEY_HISTORICO)) || [];
    const tbody = document.getElementById('grid-historico-lancamentos');
    
    if (!tbody) return;

    tbody.innerHTML = '';

    if (historico.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum lançamento registrado.</td></tr>';
        return;
    }

    // Ordena do mais recente para o mais antigo
    historico.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    historico.forEach(lancamento => {
        const tr = document.createElement('tr');
        const dataHora = new Date(lancamento.timestamp).toLocaleString('pt-BR');
        const dataNota = lancamento.data_nota ? new Date(lancamento.data_nota + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A';
        
        tr.innerHTML = `
            <td>${dataHora}</td>
            <td>${lancamento.usuario || 'N/A'}</td>
            <td>${dataNota}</td>
            <td>${lancamento.numero_nota || 'N/A'}</td>
            <td><span class="badge status-${lancamento.operacao.toLowerCase()}">${lancamento.operacao}</span></td>
            <td class="text-center">${lancamento.itens.length}</td>
            <td class="actions-cell">
                <button class="btn-pneu-action view" onclick="viewLaunchDetails(${lancamento.id})" title="Ver Detalhes">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-pneu-action edit" onclick="editLaunch(${lancamento.id})" title="Editar Lançamento">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="btn-pneu-action delete" onclick="deleteLaunch(${lancamento.id})" title="Excluir Lançamento">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.viewLaunchDetails = function(id) {
    const historico = JSON.parse(localStorage.getItem(KEY_HISTORICO)) || [];
    const lancamento = historico.find(l => l.id === id);

    if (!lancamento) {
        alert('Detalhes do lançamento não encontrados.');
        return;
    }

    let detalhes = `Operação: ${lancamento.operacao}\nUsuário: ${lancamento.usuario}\nData/Hora: ${new Date(lancamento.timestamp).toLocaleString('pt-BR')}\n\nItens:\n`;
    lancamento.itens.forEach(item => {
        detalhes += `- ${item.quantidade}x ${item.nome} (Tipo: ${item.tipo})\n`;
    });

    alert(detalhes);
}

window.editLaunch = function(id) {
    const historico = JSON.parse(localStorage.getItem(KEY_HISTORICO)) || [];
    const lancamento = historico.find(l => l.id === id);

    if (!lancamento) {
        alert('Lançamento não encontrado para edição.');
        return;
    }

    // Define o estado de edição
    isEditingLaunch = true;
    editingLaunchId = id;

    // Preenche o cabeçalho do formulário
    document.getElementById('tipoOperacao').value = lancamento.operacao;
    document.getElementById('entradaDataNota').value = lancamento.data_nota;
    document.getElementById('entradaNf').value = lancamento.numero_nota;
    
    // Preenche o carrinho com os itens do lançamento
    lancamentoCarrinho = [...lancamento.itens];
    renderCarrinho();

    // Atualiza a UI
    handleOperationChange(); // Atualiza a visibilidade dos campos com base na operação
    document.getElementById('btnSalvarLancamento').textContent = 'Atualizar Lançamento';
    document.querySelector('.painel-btn[data-secao="lancamento"]').click(); // Muda para a aba de lançamento
    document.getElementById('formCabecalhoLancamento').scrollIntoView({ behavior: 'smooth' });
};

window.deleteLaunch = function(id) {
    if (!confirm('Tem certeza que deseja excluir este lançamento? Esta ação tentará reverter as alterações no estoque.')) {
        return;
    }

    const historico = JSON.parse(localStorage.getItem(KEY_HISTORICO)) || [];
    const lancamentoIndex = historico.findIndex(l => l.id === id);

    if (lancamentoIndex === -1) {
        alert('Lançamento não encontrado para exclusão.');
        return;
    }

    const lancamento = historico[lancamentoIndex];
    let estoque = getEstoque();

    // Não permite reverter uma contagem
    if (lancamento.operacao === 'CONTAGEM') {
        alert('Não é possível reverter uma operação de "Contagem" automaticamente. Por favor, faça uma nova contagem para corrigir o estoque.');
        return;
    }

    // Tenta reverter as alterações no estoque
    for (const item of lancamento.itens) {
        const productId = item.id;
        const quantity = item.quantidade;
        const currentStock = estoque[productId] || 0;

        if (lancamento.operacao === 'ENTRADA') {
            if (currentStock < quantity) {
                alert(`Não é possível excluir este lançamento. A tentativa de reverter a entrada de "${item.nome}" falhou porque o estoque atual (${currentStock}) é menor que a quantidade da entrada (${quantity}).`);
                return; // Aborta a exclusão
            }
            estoque[productId] = currentStock - quantity;
        } else if (lancamento.operacao === 'SAIDA') {
            estoque[productId] = currentStock + quantity;
        }
    }

    // Se a reversão foi bem-sucedida, salva o novo estoque e remove do histórico
    saveEstoque(estoque);
    historico.splice(lancamentoIndex, 1);
    localStorage.setItem(KEY_HISTORICO, JSON.stringify(historico));

    alert('Lançamento excluído e estoque revertido com sucesso!');

    // Recarrega as visualizações
    loadStockSummary();
    loadStockHistory();
};