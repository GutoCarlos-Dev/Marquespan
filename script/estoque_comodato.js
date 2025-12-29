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
    setInitialWeek();

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

/**
 * Calcula a semana atual com base em uma data de início.
 * A semana 1 começa em 29/12/2025.
 * @returns {string} A string formatada da semana, ex: "Semana 01".
 */
function calculateCurrentWeek() {
    const startDate = new Date('2025-12-29T00:00:00');
    const today = new Date();

    // Se a data atual for anterior à data de início, retorna um placeholder.
    if (today < startDate) {
        return 'Semana (pré-início)';
    }

    const diffInMs = today.getTime() - startDate.getTime();
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
    const weekNumber = Math.floor(diffInDays / 7) + 1;

    return `Semana ${String(weekNumber).padStart(2, '0')}`;
}

// --- Lógica do Formulário de Lançamento ---

function initOperationSelection() {
    const select = document.getElementById('tipoOperacao');
    select.addEventListener('change', handleOperationChange);
}

function handleOperationChange() {
    const operation = document.getElementById('tipoOperacao').value;
    const camposEntrada = document.getElementById('camposEntrada');
    const groupDataNota = document.getElementById('groupDataNota'); // Container do campo de data
    const entradaDataInput = document.getElementById('entradaDataNota'); // O input de data
    const groupNf = document.getElementById('groupNf'); // Container do campo de NF
    const entradaNf = document.getElementById('entradaNf');
    const labelQtd = document.getElementById('labelQtd');
    const addItemForm = document.getElementById('formAddItemEstoque');

    // Reset state first
    camposEntrada.classList.add('hidden');
    groupDataNota.style.display = 'block';
    groupNf.style.display = 'block'; // Garante que o campo de NF seja visível por padrão dentro do container
    entradaNf.value = '';
    entradaNf.readOnly = false;
    entradaNf.placeholder = 'Número da NF';

    entradaDataInput.readOnly = false; // Data é editável por padrão
    // Define a data atual se o campo estiver vazio
    if (!entradaDataInput.value) {
        entradaDataInput.value = new Date().toISOString().split('T')[0];
    }

    let showOnlyInStock = false;

    // Apply logic based on operation
    if (operation) {
        camposEntrada.classList.remove('hidden'); // Mostra o container para qualquer operação selecionada
    }

    if (operation === 'ENTRADA') {
        labelQtd.textContent = 'Quantidade a Adicionar';
    } else if (operation === 'SAIDA') {
        groupNf.style.display = 'none'; // Esconde apenas o campo de NF para saídas
        labelQtd.textContent = 'Quantidade a Retirar';
        showOnlyInStock = true;
    } else if (operation === 'CONTAGEM') {
        entradaNf.value = 'Contagem';
        entradaNf.readOnly = true;
        entradaNf.placeholder = '';

        // Para contagem, define a data atual e a torna não editável
        entradaDataInput.value = new Date().toISOString().split('T')[0];
        entradaDataInput.readOnly = true;

        labelQtd.textContent = 'Nova Quantidade (Ajuste)';
        showOnlyInStock = false; // Alterado: Mostrar todos os produtos para contagem, permitindo adicionar itens novos ao estoque.
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
    const status = document.getElementById('lancamentoStatus').value;
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
        status: status,
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
        gridCarrinho.innerHTML = `<tr><td colspan="5" class="text-center">Nenhum item adicionado.</td></tr>`;
        return;
    }

    lancamentoCarrinho.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.nome}</td>
            <td>${item.tipo}</td>
            <td>${item.status}</td>
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

    setInitialWeek(); // Recalcula e define a semana atual ao limpar

}

// --- Lógica de Produtos e Estoque (LocalStorage) ---

const KEY_EQUIPAMENTOS = 'marquespan_comodato_equipamentos';
const KEY_ESTOQUE = 'marquespan_comodato_estoque';
const KEY_HISTORICO = 'marquespan_comodato_estoque_historico';

function getEquipamentos() {
    return JSON.parse(localStorage.getItem(KEY_EQUIPAMENTOS)) || [];
}

// Função para calcular o estoque com base no histórico completo
function calculateStockFromHistory() {
    const historico = JSON.parse(localStorage.getItem(KEY_HISTORICO)) || [];
    // Ordena por timestamp para garantir a ordem cronológica
    historico.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const estoqueCalculado = {};
    // { productId: { Novo: qty, Usado: qty } }

    historico.forEach(lancamento => {
        lancamento.itens.forEach(item => {
            const productId = item.id;
            const status = item.status || 'Novo'; // Default to 'Novo' for old data
            const quantity = parseInt(item.quantidade) || 0;
            
            if (estoqueCalculado[productId] === undefined) {
                estoqueCalculado[productId] = { Novo: 0, Usado: 0 };
            }

            switch (lancamento.operacao) {
                case 'ENTRADA':
                    estoqueCalculado[productId][status] += quantity;
                    break;
                case 'SAIDA':
                    estoqueCalculado[productId][status] -= quantity;
                    break;
                case 'CONTAGEM':
                    // Define a quantidade para o status específico, não afeta o outro.
                    // Para zerar um status, o usuário deve adicioná-lo com quantidade 0.
                    estoqueCalculado[productId][status] = quantity;
                    break;
            }
        });
    });

    return estoqueCalculado;
}

function getEstoque() {
    // Agora o estoque é sempre calculado a partir do histórico para garantir consistência
    return calculateStockFromHistory();
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
            const status = item.status || 'Novo';
            const quantity = item.quantidade;
            const stockForProduct = estoque[productId] || { Novo: 0, Usado: 0 };

            switch (lancamentoOriginal.operacao) {
                case 'ENTRADA':
                    if (stockForProduct[status] < quantity) {
                        alert(`Não é possível editar este lançamento. A tentativa de reverter a entrada de "${item.nome}" (Status: ${status}) falhou porque o estoque atual (${stockForProduct[status]}) é menor que a quantidade da entrada (${quantity}).`);
                        return; // Aborta a edição
                    }
                    stockForProduct[status] -= quantity;
                    break;
                case 'SAIDA':
                    stockForProduct[status] += quantity;
                    break;
            }
        }
    }

    // --- VALIDAÇÃO para a NOVA operação ---
    if (operation === 'SAIDA') {
        for (const item of lancamentoCarrinho) {
            const stockForProduct = estoque[item.id] || { Novo: 0, Usado: 0 };
            const stockForStatus = stockForProduct[item.status] || 0;
            if (item.quantidade > stockForStatus) {
                alert(`Erro de estoque para o produto "${item.nome}" (Status: ${item.status}):\nNão é possível retirar ${item.quantidade} unidades. Estoque disponível: ${stockForStatus}.`);
                return; // Aborta a operação
            }
        }
    }

    // --- SALVA NO HISTÓRICO (ATUALIZA OU INSERE) ---
    if (isEditingLaunch && editingLaunchId) {
        const lancamentoOriginalIndex = historico.findIndex(l => l.id === editingLaunchId);
        const lancamentoAtualizado = {
            id: editingLaunchId, // Mantém o ID original
            timestamp: new Date().toISOString(), // Atualiza o timestamp
            semana: document.getElementById('lancamentoSemana').value,
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
            semana: document.getElementById('lancamentoSemana').value,
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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum item em estoque.</td></tr>';
        return;
    }
    
    // Ordenar pelo nome do produto
    const sortedStockIds = Object.keys(estoque).sort((a, b) => {
        const equipA = equipMap.get(a[0]);
        const equipB = equipMap.get(b[0]);
        if (equipA && equipB) {
            return equipA.nome.localeCompare(equipB.nome);
        }
        return 0;
    });

    for (const productId of sortedStockIds) {
        const stockData = estoque[productId];
        const equip = equipMap.get(productId);
        if (equip) {
            const qtdNovo = stockData.Novo || 0;
            const qtdUsado = stockData.Usado || 0;
            const totalGeral = qtdNovo + qtdUsado;

            if (totalGeral > 0 || qtdNovo > 0 || qtdUsado > 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${equip.nome}</td>
                    <td class="text-center">${equip.tipo || 'NORMAL'}</td>
                    <td class="text-center">${qtdNovo}</td>
                    <td class="text-center">${qtdUsado}</td>
                    <td class="text-center">${totalGeral}</td>
                `;
                tbody.appendChild(tr);
            }
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
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum lançamento registrado.</td></tr>';
        return;
    }

    // Ordena do mais recente para o mais antigo
    historico.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    historico.forEach(lancamento => {
        const tr = document.createElement('tr');
        const dataHora = new Date(lancamento.timestamp).toLocaleString('pt-BR');
        const dataNota = lancamento.data_nota ? new Date(lancamento.data_nota + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A';
        
        tr.innerHTML = `
            <td>${lancamento.semana || 'N/A'}</td>
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

    let detalhes = `Semana: ${lancamento.semana || 'N/A'}\nOperação: ${lancamento.operacao}\nUsuário: ${lancamento.usuario}\nData/Hora: ${new Date(lancamento.timestamp).toLocaleString('pt-BR')}\n\nItens:\n`;
    lancamento.itens.forEach(item => {
        detalhes += `- ${item.quantidade}x ${item.nome} (Tipo: ${item.tipo}, Status: ${item.status || 'Novo'})\n`;
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
    document.getElementById('lancamentoSemana').value = lancamento.semana || calculateCurrentWeek();
    document.getElementById('tipoOperacao').value = lancamento.operacao;
    document.getElementById('entradaDataNota').value = lancamento.data_nota;
    document.getElementById('entradaNf').value = lancamento.numero_nota;
    
    // Preenche o carrinho com os itens do lançamento
    lancamentoCarrinho = lancamento.itens.map(item => ({ ...item, status: item.status || 'Novo' }));
    renderCarrinho();

    // Atualiza a UI
    handleOperationChange(); // Atualiza a visibilidade dos campos com base na operação
    document.getElementById('btnSalvarLancamento').textContent = 'Atualizar Lançamento';
    document.querySelector('.painel-btn[data-secao="lancamento"]').click(); // Muda para a aba de lançamento
    document.getElementById('formCabecalhoLancamento').scrollIntoView({ behavior: 'smooth' });
};

function setInitialWeek() {
    const semanaInput = document.getElementById('lancamentoSemana');
    if (semanaInput) {
        semanaInput.value = calculateCurrentWeek();
    }
}

window.deleteLaunch = function(id) {
    const historico = JSON.parse(localStorage.getItem(KEY_HISTORICO)) || [];
    const lancamentoIndex = historico.findIndex(l => l.id === id);

    if (lancamentoIndex === -1) {
        alert('Lançamento não encontrado para exclusão.');
        return;
    }

    const lancamento = historico[lancamentoIndex];
    let estoque = getEstoque();

    // Validação para ENTRADA: Verificar se a exclusão causaria estoque negativo
    if (lancamento.operacao === 'ENTRADA') {
        for (const item of lancamento.itens) {
            const productId = item.id;
            const status = item.status || 'Novo';
            const quantity = item.quantidade;
            const stockForProduct = estoque[productId] || { Novo: 0, Usado: 0 };
            const stockForStatus = stockForProduct[status] || 0;

            if (stockForStatus < quantity) {
                alert(`Não é possível excluir este lançamento. A reversão da entrada de "${item.nome}" (Status: ${status}) falhou porque o estoque atual (${stockForStatus}) é menor que a quantidade da entrada (${quantity}).`);
                return; // Aborta a exclusão
            }
        }
    }

    // Remove o lançamento do histórico
    historico.splice(lancamentoIndex, 1);
    localStorage.setItem(KEY_HISTORICO, JSON.stringify(historico));

    alert('Lançamento excluído e estoque atualizado com sucesso!');
    
    // Recarrega as visualizações
    loadStockSummary();
    loadStockHistory();
};