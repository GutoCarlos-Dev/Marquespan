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
 * Carrega os clientes do banco de dados e os popula em um elemento <datalist>.
 */
async function carregarClientesNoDatalist() {
    const datalist = document.getElementById('clientesList');
    if (!datalist) return;

    datalist.innerHTML = ''; // Limpa opções antigas

    const { data: clientes, error } = await supabase
        .from('clientes')
        .select('id, codigo, nome')
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar clientes:', error);
        return;
    }

    clientes.forEach(cliente => {
        // Adiciona opções com código e nome para facilitar a busca
        const option = document.createElement('option');
        option.value = `${cliente.codigo} - ${cliente.nome}`;
        option.setAttribute('data-id', cliente.id); // Armazena o ID do cliente
        datalist.appendChild(option);
    });
}

/**
 * Obtém o ID do cliente selecionado a partir do texto digitado.
 * @param {string} textoDigitado O texto digitado no campo cliente
 * @returns {string|null} O ID do cliente ou null se não encontrado
 */
function obterIdClientePorTexto(textoDigitado) {
    const datalist = document.getElementById('clientesList');
    if (!datalist) return null;

    const options = datalist.querySelectorAll('option');
    for (let option of options) {
        if (option.value === textoDigitado) {
            return option.getAttribute('data-id');
        }
    }
    return null;
}

/**
 * Obtém o ID do item selecionado a partir do texto digitado.
 * @param {string} textoDigitado O texto digitado no campo item
 * @returns {string|null} O ID do item ou null se não encontrado
 */
function obterIdItemPorTexto(textoDigitado) {
    const datalist = document.getElementById('itensList');
    if (!datalist) return null;

    const options = datalist.querySelectorAll('option');
    for (let option of options) {
        if (option.value === textoDigitado) {
            return option.getAttribute('data-id');
        }
    }
    return null;
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
 * Carrega os itens cadastrados e os popula em um elemento <datalist>.
 */
async function carregarItensNoDatalist() {
    const datalist = document.getElementById('itensList');
    if (!datalist) return;

    datalist.innerHTML = ''; // Limpa opções antigas

    const { data: itens, error } = await supabase
        .from('itens')
        .select('id, codigo, nome')
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar itens:', error);
        return;
    }

    itens.forEach(item => {
        // Adiciona opções com código e nome para facilitar a busca
        const option = document.createElement('option');
        option.value = `${item.codigo} - ${item.nome}`;
        option.setAttribute('data-id', item.id); // Armazena o ID do item
        datalist.appendChild(option);
    });
}

/**
 * Carrega os itens cadastrados e os popula no modal de adicionar item (compatibilidade).
 */
async function carregarItensNoModal() {
    await carregarItensNoDatalist();
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

    // Recarrega a lista de clientes e preenche o campo com o novo cliente
    await carregarClientesNoDatalist();
    const clienteInput = document.getElementById('clienteInput');
    if (clienteInput) {
        clienteInput.value = `${data.codigo} - ${data.nome}`;
    }
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

    // Validação dos campos obrigatórios
    if (!filial || !placa || !modelo || !renavan || !tipo) {
        alert('⚠️ Preencha todos os campos obrigatórios.');
        return;
    }

    // Validação do formato da placa (formato brasileiro)
    const placaRegex = /^[A-Z]{3}[0-9]{4}$|^[A-Z]{3}[0-9]{1}[A-Z]{1}[0-9]{2}$/;
    if (!placaRegex.test(placa)) {
        alert('⚠️ Formato da placa inválido. Use o formato ABC1234 ou ABC1D23.');
        return;
    }

    // Verificar se a placa já existe
    const { data: veiculoExistente, error: erroVerificacao } = await supabase
        .from('veiculos')
        .select('id')
        .eq('placa', placa)
        .single();

    if (erroVerificacao && erroVerificacao.code !== 'PGRST116') {
        console.error('Erro ao verificar placa:', erroVerificacao);
        alert('❌ Erro ao verificar se a placa já existe.');
        return;
    }

    if (veiculoExistente) {
        alert('❌ Já existe um veículo cadastrado com esta placa.');
        return;
    }

    // Preparar dados do veículo com todos os campos necessários
    const veiculoData = {
        filial,
        placa,
        modelo,
        renavan,
        tipo,
        situacao,
        marca: '', // Campo adicional que pode ser necessário
        chassi: null,
        anofab: null,
        anomod: null,
        qtdtanque: null,
        qrcode: null
    };

    console.log('Tentando inserir veículo:', veiculoData);

    const { data, error } = await supabase
        .from('veiculos')
        .insert([veiculoData])
        .select();

    if (error) {
        console.error('Erro detalhado do Supabase:', error);
        alert(`❌ Erro ao salvar veículo: ${error.message || 'Erro desconhecido'}. Verifique os dados e tente novamente.`);
        return;
    }

    console.log('Veículo salvo com sucesso:', data);
    alert('✅ Veículo salvo com sucesso!');

    // Fechar modal e resetar formulário
    document.getElementById('formNovoVeiculo').reset();
    document.getElementById('modalVeiculo').style.display = 'none';

    // Recarregar a lista de veículos e preencher o campo com a nova placa
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
    const itemInput = document.getElementById('itemInput');
    const textoItem = itemInput ? itemInput.value.trim() : '';

    if (!textoItem) {
        alert('⚠️ Selecione um item para adicionar à requisição.');
        return;
    }

    // Obtém o ID do item a partir do texto digitado
    const itemId = obterIdItemPorTexto(textoItem);
    const modelo = document.getElementById('modeloItemModal').value.trim();
    const tipo = document.getElementById('tipoItemModal').value;
    const quantidade = document.getElementById('quantidadeItemModal').value;

    if (!itemId) {
        alert('⚠️ Item não encontrado. Verifique se o item está cadastrado.');
        return;
    }
    if (!modelo || !tipo || !quantidade || quantidade < 1) {
        alert('⚠️ Preencha todos os campos do item e informe uma quantidade válida.');
        return;
    }

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
            item_nome: textoItem,
            modelo: modelo,
            tipo: tipo,
            quantidade: parseInt(quantidade),
        });
    }

    renderizarItensRequisicaoAtual();
    document.getElementById('modalAdicionarItem').style.display = 'none';
    document.getElementById('formAdicionarItem').reset();

    // Limpa o campo de input
    if (itemInput) {
        itemInput.value = '';
    }
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
    const clienteInput = document.getElementById('clienteInput');
    const textoCliente = clienteInput ? clienteInput.value.trim() : '';

    if (!textoCliente) {
        alert('⚠️ Selecione um cliente para a requisição.');
        return;
    }

    // Obtém o ID do cliente a partir do texto digitado
    requisicaoAtual.cliente_id = obterIdClientePorTexto(textoCliente);
    requisicaoAtual.cliente_nome = textoCliente;
    requisicaoAtual.motivo = document.getElementById('motivoRequisicao').value;

    if (!requisicaoAtual.cliente_id) {
        alert('⚠️ Cliente não encontrado. Verifique se o cliente está cadastrado.');
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
    if (clienteInput) {
        clienteInput.value = '';
    }
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
    carregarClientesNoDatalist();
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