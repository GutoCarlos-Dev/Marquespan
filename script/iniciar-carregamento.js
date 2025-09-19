import { supabase } from './supabase.js';

// === ESTADO DA APLICAÇÃO ===
let carregamentoState = {
    cabecalho: {},
    requisicoes: [],
};

let requisicaoAtual = {
    cliente_id: null,
    cliente_nome: '',
    motivo: '',
    itens: [],
};

/**
 * Carrega os clientes do banco de dados e os popula em um elemento <select>.
 */
async function carregarClientesNoSelect() {
    const selectCliente = document.getElementById('clienteSelectRequisicao');
    if (!selectCliente) return;

    // Limpa as opções existentes (exceto a primeira "Carregando...")
    while (selectCliente.options.length > 1) {
        selectCliente.remove(1);
    }

    const { data: clientes, error } = await supabase
        .from('clientes')
        .select('id, codigo, nome')
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar clientes:', error);
        const option = document.createElement('option');
        option.textContent = 'Erro ao carregar clientes';
        option.disabled = true;
        selectCliente.appendChild(option);
        return;
    }
    // Remove a opção "Carregando..."
    if (selectCliente.options[0] && selectCliente.options[0].disabled) {
        selectCliente.remove(0);
    }

    if (clientes.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'Nenhum cliente cadastrado';
        option.disabled = true;
        selectCliente.appendChild(option);
    } else {
        // Adiciona uma opção padrão para selecionar
        const defaultOption = document.createElement('option');
        defaultOption.textContent = 'Selecione o cliente';
        defaultOption.value = null;
        selectCliente.insertBefore(defaultOption, selectCliente.firstChild);
        clientes.forEach(cliente => {
            const option = document.createElement('option');
            option.value = cliente.id; // Usar o ID como valor
            option.textContent = `${cliente.codigo} - ${cliente.nome}`; // Exibir código e nome
            selectCliente.appendChild(option);
        });
    }
}

/**
 * Carrega as placas dos veículos e as popula em um elemento <datalist>.
 */
async function carregarVeiculosNoDatalist() {
    const datalist = document.getElementById('placasVeiculosList');
    if (!datalist) return;

    datalist.innerHTML = ''; // Limpa opções antigas

    const { data: veiculos, error } = await supabase
        .from('veiculos')
        .select('placa')
        .order('placa', { ascending: true });

    if (error) {
        console.error('Erro ao carregar veículos:', error);
        return;
    }

    veiculos.forEach(veiculo => {
        datalist.innerHTML += `<option value="${veiculo.placa}"></option>`;
    });
}

/**
 * Carrega os itens cadastrados e os popula no modal de adicionar item.
 */
async function carregarItensNoModal() {
    const selectItem = document.getElementById('itemSelectModal');
    if (!selectItem) return;

    selectItem.innerHTML = '<option value="" disabled selected>Carregando...</option>';

    const { data: itens, error } = await supabase
        .from('itens')
        .select('id, codigo, nome')
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar itens:', error);
        selectItem.innerHTML = '<option value="">Erro ao carregar</option>';
        return;
    }

    selectItem.innerHTML = '<option value="" disabled selected>Selecione um item</option>';
    itens.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.codigo} - ${item.nome}`;
        selectItem.appendChild(option);
    });
}

/**
 * Carrega os motoristas do banco de dados e os popula em um elemento <select>.
 */
async function carregarMotoristasNoSelect() {
    const selectMotorista = document.getElementById('motoristaSelect');
    if (!selectMotorista) return;

    selectMotorista.innerHTML = '<option value="" disabled selected>Carregando...</option>';

    const { data: motoristas, error } = await supabase
        .from('motoristas')
        .select('id, nome')
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar motoristas:', error);
        selectMotorista.innerHTML = '<option value="">Erro ao carregar</option>';
        return;
    }

    selectMotorista.innerHTML = '<option value="" disabled selected>Selecione o motorista</option>';
    motoristas.forEach(motorista => {
        const option = document.createElement('option');
        option.value = motorista.id;
        option.textContent = motorista.nome;
        selectMotorista.appendChild(option);
    });
}

/**
 * Obtém o nome de um motorista pelo ID.
 * @param {string} id O ID do motorista.
 * @returns {Promise<string|null>} O nome do motorista ou null.
 */
async function getMotoristaNomeById(id) {
    const { data, error } = await supabase.from('motoristas').select('nome').eq('id', id).single();
    return error ? null : data.nome;
}

/**
 * Salva um novo cliente a partir do modal.
 */
async function salvarNovoCliente(event) {
    event.preventDefault();

    const codigo = document.getElementById('codClienteModal').value.trim();
    const nome = document.getElementById('nomeClienteModal').value.trim();
    const cidade = document.getElementById('cidadeClienteModal').value.trim();
    const estado = document.getElementById('estadoClienteModal').value.trim();

    if (!codigo || !nome || !cidade || !estado) {
        alert('⚠️ Preencha todos os campos.');
        return;
    }

    const { data, error } = await supabase
        .from('clientes')
        .insert([{ codigo, nome, cidade, estado }])
        .select()
        .single();

    if (error) {
        alert('❌ Erro ao salvar cliente. Verifique se o código já existe.');
        console.error(error);
        return;
    }

    alert('✅ Cliente salvo com sucesso!');
    document.getElementById('formNovoCliente').reset();
    document.getElementById('modalCliente').style.display = 'none';

    // Recarrega a lista de clientes e seleciona o novo cliente
    await carregarClientesNoSelect();
    document.getElementById('clienteSelectRequisicao').value = data.id;
}

/**
 * Salva um novo veículo a partir do modal.
 */
async function salvarNovoVeiculo(event) {
    event.preventDefault();

    const filial = document.getElementById('filialVeiculoModal').value.trim();
    const placa = document.getElementById('placaVeiculoModal').value.trim().toUpperCase();
    const modelo = document.getElementById('modeloVeiculoModal').value.trim();
    const renavan = document.getElementById('renavanVeiculoModal').value.trim();
    const tipo = document.getElementById('tipoVeiculoModal').value.trim();
    const situacao = document.getElementById('situacaoVeiculoModal').value;

    if (!filial || !placa || !modelo || !renavan || !tipo) {
        alert('⚠️ Preencha todos os campos.');
        return;
    }

    const { error } = await supabase
        .from('veiculos')
        .insert([{ filial, placa, modelo, renavan, tipo, situacao }]);

    if (error) {
        alert('❌ Erro ao salvar veículo. Verifique se a placa já existe.');
        console.error(error);
        return;
    }

    alert('✅ Veículo salvo com sucesso!');
    document.getElementById('formNovoVeiculo').reset();
    document.getElementById('modalVeiculo').style.display = 'none';

    // Recarrega a lista de veículos e preenche o campo com a nova placa
    await carregarVeiculosNoDatalist();
    document.getElementById('placa').value = placa;
}

/**
 * Salva um novo motorista a partir do modal.
 */
async function salvarNovoMotorista(event) {
    event.preventDefault();

    const nome = document.getElementById('nomeMotoristaModal').value.trim();
    const nome_completo = document.getElementById('nomeCompletoMotoristaModal').value.trim();

    if (!nome) {
        alert('⚠️ O campo "Nome" é obrigatório.');
        return;
    }

    const { data, error } = await supabase
        .from('motoristas')
        .insert([{ nome, nome_completo }])
        .select('id')
        .single();

    if (error) {
        alert('❌ Erro ao salvar motorista.');
        console.error(error);
        return;
    }

    alert('✅ Motorista salvo com sucesso!');
    document.getElementById('formNovoMotorista').reset();
    document.getElementById('modalMotorista').style.display = 'none';

    // Recarrega a lista de motoristas e seleciona o novo
    await carregarMotoristasNoSelect();
    document.getElementById('motoristaSelect').value = data.id;
}

/**
 * Adiciona um item à requisição que está sendo montada.
 */
function handleAdicionarItemNaRequisicao(event) {
    event.preventDefault();
    const select = document.getElementById('itemSelectModal');
    const itemId = select.value;
    const modelo = document.getElementById('modeloItemModal').value.trim();
    const tipo = document.getElementById('tipoItemModal').value;
    const quantidade = document.getElementById('quantidadeItemModal').value;

    if (!itemId || !modelo || !tipo || !quantidade || quantidade < 1) {
        alert('⚠️ Preencha todos os campos do item e informe uma quantidade válida.');
        return;
    }

    const itemNome = select.options[select.selectedIndex].text;

    // Verifica se um item idêntico (mesmo id, modelo e tipo) já foi adicionado
    const itemExistente = requisicaoAtual.itens.find(i =>
        i.item_id === itemId &&
        i.modelo.toLowerCase() === modelo.toLowerCase() &&
        i.tipo === tipo
    );

    if (itemExistente) {
        itemExistente.quantidade = parseInt(itemExistente.quantidade) + parseInt(quantidade);
    } else {
        requisicaoAtual.itens.push({
            item_id: itemId,
            item_nome: itemNome,
            modelo: modelo,
            tipo: tipo,
            quantidade: parseInt(quantidade),
        });
    }

    renderizarItensRequisicaoAtual();
    document.getElementById('modalAdicionarItem').style.display = 'none';
    document.getElementById('formAdicionarItem').reset();
}

/**
 * Renderiza a tabela de itens da requisição em andamento.
 */
function renderizarItensRequisicaoAtual() {
    const tabela = document.getElementById('tabelaItensRequisicaoAtual');
    tabela.innerHTML = `<thead><tr><th>Item</th><th>Modelo</th><th>Tipo</th><th>Qtd</th><th>Ação</th></tr></thead>`;
    const tbody = document.createElement('tbody');

    requisicaoAtual.itens.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.item_nome}</td>
            <td>${item.modelo}</td>
            <td>${item.tipo}</td>
            <td>${item.quantidade}</td>
            <td><button type="button" class="btn-remover-item" data-index="${index}" title="Remover item">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
    tabela.appendChild(tbody);

    // Adiciona event listener para os botões de remover
    document.querySelectorAll('.btn-remover-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const indexToRemove = e.target.closest('button').dataset.index;
            requisicaoAtual.itens.splice(indexToRemove, 1);
            renderizarItensRequisicaoAtual();
        });
    });
}

/**
 * Adiciona a requisição montada ao carregamento principal.
 */
function handleIncluirRequisicao() {
    const clienteSelect = document.getElementById('clienteSelectRequisicao');
    requisicaoAtual.cliente_id = clienteSelect.value;
    requisicaoAtual.cliente_nome = clienteSelect.options[clienteSelect.selectedIndex].text;
    requisicaoAtual.motivo = document.getElementById('motivoRequisicao').value;

    if (!requisicaoAtual.cliente_id) {
        alert('⚠️ Selecione um cliente para a requisição.');
        return;
    }
    if (requisicaoAtual.itens.length === 0) {
        alert('⚠️ Adicione pelo menos um item à requisição.');
        return;
    }

    carregamentoState.requisicoes.push({ ...requisicaoAtual });
    renderizarTabelaResumo();

    // Limpa para a próxima requisição
    requisicaoAtual = { cliente_id: null, cliente_nome: '', motivo: '', itens: [] };
    document.getElementById('clienteSelectRequisicao').value = null;
    renderizarItensRequisicaoAtual();
    alert('✅ Requisição incluída no carregamento!');
}

/**
 * Renderiza a tabela de resumo com todos os itens de todas as requisições.
 */
function renderizarTabelaResumo() {
    const tabela = document.getElementById('tabelaItensCarregados');
    tabela.innerHTML = '<thead><tr><th>Item</th><th>Modelo</th><th>Tipo</th><th>Quantidade Total</th></tr></thead>';
    const tbody = document.createElement('tbody');

    const itensAgrupados = {};

    carregamentoState.requisicoes.forEach(req => {
        req.itens.forEach(item => {
            // Cria uma chave única para agrupar itens idênticos
            const chave = `${item.item_nome}|${item.modelo}|${item.tipo}`;
            if (itensAgrupados[chave]) {
                itensAgrupados[chave].quantidade += item.quantidade;
            } else {
                itensAgrupados[chave] = { ...item }; // Copia o item
            }
        });
    });

    for (const chave in itensAgrupados) {
        const item = itensAgrupados[chave];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${item.item_nome}</td><td>${item.modelo}</td><td>${item.tipo}</td><td>${item.quantidade}</td>`;
        tbody.appendChild(tr);
    }
    tabela.appendChild(tbody);
}

/**
 * Salva o carregamento completo no banco de dados.
 */
async function salvarCarregamentoCompleto() {
    // 1. Validações
    const semana = document.getElementById('semana').value.trim();
    const data = document.getElementById('dataCarregamento').value;
    const placa = document.getElementById('placa').value.trim();
    const motoristaId = document.getElementById('motoristaSelect').value;
    const conferente = document.getElementById('conferente').value.trim();
    const supervisor = document.getElementById('supervisor').value.trim();

    const motoristaNome = await getMotoristaNomeById(motoristaId);

    if (!semana || !data || !placa || !motoristaId || !conferente) {
        alert('⚠️ Preencha todos os campos obrigatórios do cabeçalho (Semana, Data, Placa, Motorista, Conferente).');
        return;
    }
    if (carregamentoState.requisicoes.length === 0) {
        alert('⚠️ Adicione pelo menos uma requisição ao carregamento.');
        return;
    }

    // 2. Insere o cabeçalho do carregamento
    const { data: carregamentoData, error: carregamentoError } = await supabase
        .from('carregamentos')
        .insert([{ semana, data, placa, motorista_nome: motoristaNome, conferente_nome: conferente, supervisor_nome: supervisor }])
        .select('id')
        .single();

    if (carregamentoError) {
        alert('❌ Erro ao salvar o cabeçalho do carregamento.');
        console.error(carregamentoError);
        return;
    }

    const carregamentoId = carregamentoData.id;

    // 3. Insere as requisições e seus itens
    for (const req of carregamentoState.requisicoes) {
        const { data: requisicaoData, error: requisicaoError } = await supabase
            .from('requisicoes')
            .insert([{ carregamento_id: carregamentoId, cliente_id: req.cliente_id, motivo: req.motivo }])
            .select('id')
            .single();

        if (requisicaoError) {
            console.error('Erro ao salvar requisição:', requisicaoError);
            continue; // Pula para a próxima requisição
        }

        const requisicaoId = requisicaoData.id;
        const itensParaInserir = req.itens.map(item => ({
            requisicao_id: requisicaoId,
            item_id: item.item_id,
            quantidade: item.quantidade,
        }));

        const { error: itensError } = await supabase.from('requisicao_itens').insert(itensParaInserir);
        if (itensError) {
            console.error('Erro ao salvar itens da requisição:', itensError);
        }
    }

    alert('✅ Carregamento salvo com sucesso!');
    window.location.reload(); // Recarrega a página para um novo carregamento
}

// Executa quando o DOM está totalmente carregado
document.addEventListener('DOMContentLoaded', () => {
    carregarClientesNoSelect();
    carregarVeiculosNoDatalist();
    carregarItensNoModal();
    carregarMotoristasNoSelect();

    // Preenche campos automáticos
    document.getElementById('dataCarregamento').valueAsDate = new Date();
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (usuario && usuario.nome) {
        document.getElementById('conferente').value = usuario.nome;
    }

    // Lógica para o Modal de Clientes
    const modalCliente = document.getElementById('modalCliente');
    const btnAbrirCliente = document.getElementById('btnAbrirModalCliente');
    const btnFecharCliente = document.getElementById('fecharModalCliente');

    btnAbrirCliente.onclick = () => { modalCliente.style.display = 'block'; }
    btnFecharCliente.onclick = () => { modalCliente.style.display = 'none'; }

    // Lógica para o Modal de Veículos
    const modalVeiculo = document.getElementById('modalVeiculo');
    const btnAbrirVeiculo = document.getElementById('btnAbrirModalVeiculo');
    const btnFecharVeiculo = document.getElementById('fecharModalVeiculo');

    btnAbrirVeiculo.onclick = () => { modalVeiculo.style.display = 'block'; }
    btnFecharVeiculo.onclick = () => { modalVeiculo.style.display = 'none'; }

    // Lógica para o Modal de Adicionar Item
    const modalAdicionarItem = document.getElementById('modalAdicionarItem');
    const btnAbrirAdicionarItem = document.getElementById('btnAbrirModalAdicionarItem');
    const btnFecharAdicionarItem = document.getElementById('fecharModalAdicionarItem');

    btnAbrirAdicionarItem.onclick = () => { modalAdicionarItem.style.display = 'block'; }
    btnFecharAdicionarItem.onclick = () => { modalAdicionarItem.style.display = 'none'; }

    // Lógica para o Modal de Motorista
    const modalMotorista = document.getElementById('modalMotorista');
    const btnAbrirMotorista = document.getElementById('btnAbrirModalMotorista');
    const btnFecharMotorista = document.getElementById('fecharModalMotorista');

    btnAbrirMotorista.onclick = () => { modalMotorista.style.display = 'block'; }
    btnFecharMotorista.onclick = () => { modalMotorista.style.display = 'none'; }

    // Lógica para fechar modais clicando fora
    window.addEventListener('click', (event) => {
        if (event.target == modalCliente) {
            modalCliente.style.display = 'none';
        }
        if (event.target == modalVeiculo) {
            modalVeiculo.style.display = 'none';
        }
        if (event.target == modalAdicionarItem) {
            modalAdicionarItem.style.display = 'none';
        }
        if (event.target == modalMotorista) {
            modalMotorista.style.display = 'none';
        }
    });

    // Event Listeners dos formulários e botões principais
    document.getElementById('formNovoCliente').addEventListener('submit', salvarNovoCliente);
    document.getElementById('formNovoVeiculo').addEventListener('submit', salvarNovoVeiculo);
    document.getElementById('formNovoMotorista').addEventListener('submit', salvarNovoMotorista);
    document.getElementById('formAdicionarItem').addEventListener('submit', handleAdicionarItemNaRequisicao);
    document.getElementById('btnIncluirRequisicao').addEventListener('click', handleIncluirRequisicao);
    document.getElementById('btnSalvarCarregamento').addEventListener('click', salvarCarregamentoCompleto);

    // Renderiza tabelas vazias inicialmente
    renderizarItensRequisicaoAtual();
    renderizarTabelaResumo();
});