import { supabaseClient as supabase } from './supabase.js';

// === CONSTANTES PARA CONTROLE DE MOTIVOS ===
const MOTIVOS_QUE_ADICIONAM = ['Aumento', 'Aumento+Troca', 'Cliente Novo'];
const MOTIVOS_QUE_NAO_ADICIONAM = ['Troca', 'Retirada Parcial', 'Retirada Total', 'Retirada de Empréstimo'];
const TIMEZONE_SAO_PAULO = 'America/Sao_Paulo';
const IMPORTACAO_CARREGAMENTO_KEY = 'carregamentoImportadoXlsx';

function obterPartesDataHoraSaoPaulo(date = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: TIMEZONE_SAO_PAULO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
}

function obterDataHoraLocalAtual() {
    const partes = obterPartesDataHoraSaoPaulo();
    return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

function obterHoraLocalAtual() {
    const partes = obterPartesDataHoraSaoPaulo();
    return `${partes.hour}:${partes.minute}`;
}

function formatarDataHoraLocal(value) {
    if (!value) return '';
    const data = new Date(`${value}:00-03:00`);
    if (Number.isNaN(data.getTime())) return '';
    return data.toLocaleString('pt-BR', {
        timeZone: TIMEZONE_SAO_PAULO,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function converterDataHoraSaoPauloParaIso(value) {
    const data = new Date(`${value}:00-03:00`);
    return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function obterSemanaIso(value) {
    const dataTexto = String(value || '').slice(0, 10);
    const match = dataTexto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';

    const data = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    const diaSemana = data.getUTCDay() || 7;
    data.setUTCDate(data.getUTCDate() + 4 - diaSemana);

    const anoIso = data.getUTCFullYear();
    const inicioAno = new Date(Date.UTC(anoIso, 0, 1));
    const semana = Math.ceil((((data - inicioAno) / 86400000) + 1) / 7);
    return `${String(semana).padStart(2, '0')}-${anoIso}`;
}

function preencherSemanaPelaData() {
    const campoSemana = document.getElementById('semana');
    const campoData = document.getElementById('dataCarregamento');
    if (!campoSemana || !campoData) return;

    campoSemana.value = obterSemanaIso(campoData.value);
}

// === ESTADO DA APLICAÇÃO ===
let carregamentoState = {
    cabecalho: {},
    requisicoesCarregamento: [], // Motivos que ADICIONAM itens (para entrega)
    requisicoesTrocaRetirada: [], // Motivos que NÃO ADICIONAM itens (troca/retirada)
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
 * Obtém o ID do motorista selecionado a partir do texto digitado.
 * @param {string} textoDigitado O texto digitado no campo motorista
 * @returns {string|null} O ID do motorista ou null se não encontrado
 */
function obterIdMotoristaPorTexto(textoDigitado) {
    const datalist = document.getElementById('motoristasList');
    if (!datalist) return null;

    const options = datalist.querySelectorAll('option');
    for (let option of options) {
        if (option.value === textoDigitado) {
            return option.getAttribute('data-id');
        }
    }
    return null;
}

function valorExisteNoDatalist(datalistId, value) {
    const valor = String(value || '').trim().toUpperCase();
    if (!valor) return false;

    return Array.from(document.getElementById(datalistId)?.options || [])
        .some(option => String(option.value || '').trim().toUpperCase() === valor);
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
 * Obtém os dados completos de um item pelo ID.
 * @param {string} itemId O ID do item
 * @returns {Promise<Object|null>} Os dados do item ou null se não encontrado
 */
async function obterDadosItemPorId(itemId) {
    const { data, error } = await supabase
        .from('itens')
        .select('id, codigo, nome, tipo')
        .eq('id', itemId)
        .single();

    if (error) {
        console.error('Erro ao buscar dados do item:', error);
        return null;
    }

    return data;
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
        .select('placa, modelo, situacao')
        .order('placa', { ascending: true });

    if (error) {
        console.error('Erro ao carregar veículos:', error);
        return;
    }

    veiculos
        .filter(veiculo => !veiculo.situacao || String(veiculo.situacao).toLowerCase() === 'ativo')
        .forEach(veiculo => {
        const option = document.createElement('option');
        option.value = veiculo.placa;
        option.label = veiculo.modelo || '';
        datalist.appendChild(option);
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

// === NOVAS VARIÁVEIS PARA O MODAL DE ITENS ===
let todosItens = []; // Armazena todos os itens carregados
let itensSelecionados = []; // Armazena os itens selecionados para adicionar

/**
 * Carrega todos os itens cadastrados para o modal de seleção.
 */
async function carregarTodosItensParaModal() {
    const { data: itens, error } = await supabase
        .from('itens')
        .select('id, codigo, nome, tipo')
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar itens para modal:', error);
        return;
    }

    todosItens = itens || [];
    renderizarTabelaItensModal();
}

/**
 * Renderiza a tabela de itens no modal com busca em tempo real.
 */
function renderizarTabelaItensModal(termoBusca = '') {
    const corpoTabela = document.getElementById('corpoTabelaItensModal');
    if (!corpoTabela) return;

    // Filtra os itens baseado no termo de busca
    const itensFiltrados = todosItens.filter(item =>
        item.nome.toLowerCase().includes(termoBusca.toLowerCase()) ||
        item.codigo.toLowerCase().includes(termoBusca.toLowerCase())
    );

    corpoTabela.innerHTML = '';

    if (itensFiltrados.length === 0) {
        corpoTabela.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: #666; padding: 20px;">
                    ${termoBusca ? 'Nenhum item encontrado para: ' + termoBusca : 'Nenhum item cadastrado'}
                </td>
            </tr>
        `;
        return;
    }

    itensFiltrados.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <input type="number" class="input-quantidade glass-input" data-item-id="${item.id}"
                       min="0" value="0">
            </td>
            <td>
                <span class="nome-item" style="font-weight: 600;">${item.codigo} - ${item.nome}</span>
                <input type="hidden" class="item-id" value="${item.id}">
                <input type="hidden" class="item-tipo" value="${item.tipo}">
            </td>
            <td>
                <input type="text" class="input-modelo glass-input" data-item-id="${item.id}"
                       placeholder="Ex: VERTICAL">
            </td>
        `;
        corpoTabela.appendChild(tr);
    });

    console.log('=== DEBUG: renderizarTabelaItensModal ===');
    console.log('Itens filtrados:', itensFiltrados.length);
    console.log('Inputs de quantidade criados:', document.querySelectorAll('.input-quantidade').length);
    console.log('Inputs de modelo criados:', document.querySelectorAll('.input-modelo').length);
    console.log('Itens sendo renderizados:', itensFiltrados.map(item => `${item.codigo} - ${item.nome}`));
    console.log('Elementos HTML criados na tabela:', document.querySelectorAll('#corpoTabelaItensModal tr').length);

    // Adiciona event listeners para os botões de seleção
    document.querySelectorAll('.btn-selecionar-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = e.target.dataset.itemId;
            toggleSelecaoItem(itemId);
        });
    });
}

/**
 * Alterna a seleção de um item na tabela.
 */
function toggleSelecaoItem(itemId) {
    const btn = document.querySelector(`.btn-selecionar-item[data-item-id="${itemId}"]`);
    const isSelected = btn.classList.contains('selecionado');

    if (isSelected) {
        // Remove da seleção
        btn.classList.remove('selecionado');
        btn.innerHTML = '✓';
        btn.title = 'Selecionar item';

        // Remove dos itens selecionados
        itensSelecionados = itensSelecionados.filter(item => item.item_id !== itemId);
    } else {
        // Adiciona à seleção
        btn.classList.add('selecionado');
        btn.innerHTML = '✓';
        btn.title = 'Item selecionado';

        // Adiciona aos itens selecionados
        const item = todosItens.find(i => i.id === itemId);
        if (item) {
            const quantidade = document.querySelector(`.input-quantidade[data-item-id="${itemId}"]`).value;
            const modelo = document.querySelector(`.input-modelo[data-item-id="${itemId}"]`).value;

            itensSelecionados.push({
                item_id: itemId,
                item_nome: `${item.codigo} - ${item.nome}`,
                tipo: item.tipo,
                quantidade: parseInt(quantidade),
                modelo: modelo || ''
            });
        }
    }
}

/**
 * Adiciona os itens com quantidade > 0 à requisição atual.
 */
function adicionarItensSelecionadosARequisicao() {
    console.log('=== DEBUG: adicionarItensSelecionadosARequisicao ===');
    console.log('Todos os itens carregados:', todosItens.length);
    console.log('Estado atual da requisição:', requisicaoAtual);
    console.log('Itens selecionados:', itensSelecionados);

    // Coleta todos os itens com quantidade > 0
    const itensParaAdicionar = [];
    const inputsQuantidade = document.querySelectorAll('.input-quantidade');
    console.log('Inputs de quantidade encontrados:', inputsQuantidade.length);
    console.log('Valores dos inputs de quantidade:', Array.from(inputsQuantidade).map(input => ({
        itemId: input.dataset.itemId,
        valor: input.value,
        quantidade: parseInt(input.value)
    })));

    inputsQuantidade.forEach(input => {
        const valorInput = input.value.trim();
        const quantidade = parseInt(valorInput);
        const itemId = input.dataset.itemId;

        console.log(`Input - ItemId: ${itemId}, Valor: ${valorInput}, Quantidade: ${quantidade}`);

        if (!isNaN(quantidade) && quantidade > 0) {
            const modelo = document.querySelector(`.input-modelo[data-item-id="${itemId}"]`).value;
            console.log(`Modelo para item ${itemId}: ${modelo}`);

            // Correção: O ID do dataset é uma string, e o ID do item é um número. Convertemos para o mesmo tipo.
            const item = todosItens.find(i => i.id === parseInt(itemId, 10));
            console.log('Item encontrado:', item);

            if (item) {
                itensParaAdicionar.push({
                    item_id: itemId,
                    item_nome: `${item.codigo} - ${item.nome}`,
                    tipo: item.tipo,
                    quantidade: quantidade,
                    modelo: modelo || ''
                });
                console.log('Item adicionado à lista:', item);
            }
        }
    });

    console.log('Itens para adicionar:', itensParaAdicionar);
    console.log('Total de itens para adicionar:', itensParaAdicionar.length);

    if (itensParaAdicionar.length === 0) {
        alert("⚠️ Defina a quantidade para pelo menos um item.");
        return;
    }

    // Adiciona cada item à requisição atual
    itensParaAdicionar.forEach(itemParaAdicionar => {
        // Verifica se um item idêntico (mesmo id, modelo e tipo) já foi adicionado
        const itemExistente = requisicaoAtual.itens.find(i =>
            i.item_id === itemParaAdicionar.item_id &&
            i.modelo.toLowerCase() === itemParaAdicionar.modelo.toLowerCase() &&
            i.tipo === itemParaAdicionar.tipo
        );

        if (itemExistente) {
            itemExistente.quantidade = parseInt(itemExistente.quantidade) + parseInt(itemParaAdicionar.quantidade);
            console.log('Item existente atualizado:', itemExistente);
        } else {
            requisicaoAtual.itens.push({
                item_id: itemParaAdicionar.item_id,
                item_nome: itemParaAdicionar.item_nome,
                modelo: itemParaAdicionar.modelo,
                tipo: itemParaAdicionar.tipo,
                quantidade: parseInt(itemParaAdicionar.quantidade),
            });
            console.log('Novo item adicionado:', itemParaAdicionar);
        }
    });

    console.log('Estado da requisição atual após adição:', requisicaoAtual);

    // Atualiza as tabelas
    renderizarItensRequisicaoAtual();
    renderizarTabelaResumo();

    // Reseta os campos de entrada
    document.querySelectorAll('.input-quantidade').forEach(input => {
        input.value = "0";
    });

    document.querySelectorAll('.input-modelo').forEach(input => {
        input.value = '';
    });

    // Fecha o modal
    document.getElementById('modalAdicionarItem').style.display = 'none';

    alert(`✅ ${itensParaAdicionar.length} item(ns) adicionado(s) com sucesso!`);
}

/**
 * Limpa a seleção visual dos itens na tabela.
 */
function limparSelecaoVisual() {
    document.querySelectorAll('.btn-selecionar-item').forEach(btn => {
        btn.classList.remove('selecionado');
        btn.innerHTML = '✓';
        btn.title = 'Selecionar item';
    });

    // Reseta os campos de entrada
    document.querySelectorAll('.input-quantidade').forEach(input => {
        input.value = "0";
    });

    document.querySelectorAll('.input-modelo').forEach(input => {
        input.value = '';
    });
}

/**
 * Carrega os motoristas do banco de dados e os popula em um elemento <datalist>.
 */
async function carregarMotoristasNoDatalist() {
    const datalist = document.getElementById('motoristasList');
    if (!datalist) return;

    datalist.innerHTML = ''; 

    const { data: motoristas, error } = await supabase
        .from('funcionario')
        .select('id, nome, nome_completo, funcao, status')
        .ilike('funcao', 'Motorista%')
        .eq('status', 'Ativo')
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar motoristas:', error);
        return;
    }

    motoristas.forEach(motorista => {
        const option = document.createElement('option');
        option.value = motorista.nome;
        option.label = motorista.nome_completo || motorista.funcao || '';
        option.setAttribute('data-id', motorista.id);
        datalist.appendChild(option);
    });
}

/**
 * Carrega os supervisores do banco de dados e os popula em um elemento <datalist>.
 */
async function carregarSupervisoresNoDatalist() {
    const datalist = document.getElementById('supervisoresList');
    if (!datalist) return;

    datalist.innerHTML = '';

    const { data: supervisores, error } = await supabase
        .from('supervisores')
        .select('id, nome')
        .eq('status', 'ATIVO')
        .order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar supervisores:', error);
        return;
    }

    supervisores.forEach(sup => {
        const option = document.createElement('option');
        option.value = sup.nome;
        option.setAttribute('data-id', sup.id);
        datalist.appendChild(option);
    });
}

/**
 * Obtém o nome de um motorista pelo ID.
 * @param {string} id O ID do motorista.
 * @returns {Promise<string|null>} O nome do motorista ou null.
 */
async function getMotoristaNomeById(id) {
    const { data, error } = await supabase.from('funcionario').select('nome').eq('id', id).single();
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
 * Adiciona um item à requisição que está sendo montada.
 */
async function handleAdicionarItemNaRequisicao(event) {
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
    const quantidade = document.getElementById('quantidadeItemModal').value;

    if (!itemId) {
        alert('⚠️ Item não encontrado. Verifique se o item está cadastrado.');
        return;
    }
    if (!quantidade || quantidade < 1) {
        alert('⚠️ Preencha a quantidade e selecione um item válido.');
        return;
    }

    // Busca os dados completos do item no banco de dados para obter o tipo
    const dadosItem = await obterDadosItemPorId(itemId);
    if (!dadosItem) {
        alert('⚠️ Erro ao obter dados do item. Tente novamente.');
        return;
    }

    const tipo = dadosItem.tipo; // Usa o tipo que vem do cadastro do item

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
    renderizarTabelaResumo(); // Atualiza o resumo quando um item é adicionado
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
    if (!tabela) return;
    if (tabela) tabela.classList.add('glass-table');
    tabela.innerHTML = `<thead><tr><th>ITEM</th><th>MODELO</th><th>TIPO</th><th>QTD</th><th style="width: 60px;">AÇÃO</th></tr></thead>`;
    const tbody = document.createElement('tbody');

    requisicaoAtual.itens.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.item_nome}</td>
            <td>${item.modelo}</td>
            <td>${item.tipo}</td>
            <td>${item.quantidade}</td>
            <td class="actions-cell"><button type="button" class="btn-icon delete btn-remover-item" data-index="${index}" title="Remover item"><i class="fas fa-trash"></i></button></td>
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

    // Separa as requisições nos grupos corretos
    if (MOTIVOS_QUE_ADICIONAM.includes(requisicaoAtual.motivo)) {
        carregamentoState.requisicoesCarregamento.push({ ...requisicaoAtual });
    } else if (MOTIVOS_QUE_NAO_ADICIONAM.includes(requisicaoAtual.motivo)) {
        carregamentoState.requisicoesTrocaRetirada.push({ ...requisicaoAtual });
    }

    renderizarTabelaCarregamento();
    renderizarTabelaTrocaRetirada();
    renderizarTabelaResumo(); // Atualiza o resumo quando uma requisição é incluída

    // Limpa para a próxima requisição
    requisicaoAtual = { cliente_id: null, cliente_nome: '', motivo: '', itens: [] };
    if (clienteInput) {
        clienteInput.value = '';
    }
    renderizarItensRequisicaoAtual();
    alert('✅ Requisição incluída no carregamento!');
}

/**
 * Renderiza a tabela de itens para carregamento (motivos que ADICIONAM itens).
 */
function renderizarTabelaCarregamento() {
    const tabela = document.getElementById('tabelaItensCarregados');
    if (!tabela) return;
    if (tabela) tabela.classList.add('glass-table');
    tabela.innerHTML = '<thead><tr><th>ITEM</th><th>MODELO</th><th>TIPO</th><th>TOTAL</th><th>MOTIVO</th></tr></thead>';
    const tbody = document.createElement('tbody');

    const itensAgrupados = {};

    carregamentoState.requisicoesCarregamento.forEach(req => {
        req.itens.forEach(item => {
            // Cria uma chave única para agrupar itens idênticos
            const chave = `${item.item_nome}|${item.modelo}|${item.tipo}`;
            if (itensAgrupados[chave]) {
                itensAgrupados[chave].quantidade += item.quantidade;
                itensAgrupados[chave].motivos.push(req.motivo);
            } else {
                itensAgrupados[chave] = {
                    ...item,
                    motivos: [req.motivo]
                };
            }
        });
    });

    for (const chave in itensAgrupados) {
        const item = itensAgrupados[chave];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.item_nome}</td>
            <td>${item.modelo}</td>
            <td>${item.tipo}</td>
            <td>${item.quantidade}</td>
            <td>${item.motivos.join(', ')}</td>
        `;
        tbody.appendChild(tr);
    }
    tabela.appendChild(tbody);
}

function normalizarTextoResumo(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function obterGrupoItemResumo(item) {
    const nome = normalizarTextoResumo(item?.item_nome);
    if (nome.includes('ARMARIO')) return 'demais';
    if (/\bESTEIRAS?\b/.test(nome)) return 'esteiras';
    if (/\bFORMAS?\b/.test(nome)) return 'formas';
    return 'demais';
}

function obterChaveClienteResumo(requisicao) {
    return String(requisicao?.cliente_id || normalizarTextoResumo(requisicao?.cliente_nome));
}

function calcularResumoCarregamento() {
    const motivos = {
        'Cliente Novo': 0,
        'Aumento': 0,
        'Aumento+Troca': 0,
        'Troca': 0,
        'Retirada Parcial': 0,
        'Retirada de Empréstimo': 0,
        'Retirada Total': 0
    };
    const movimentacao = {
        entrega: { demais: 0, esteiras: 0, formas: 0, total: 0 },
        retorno: { demais: 0, esteiras: 0, formas: 0, total: 0 },
        total: 0
    };
    const clientes = new Set();
    const clientesNovos = new Set();
    const todasRequisicoes = [
        ...carregamentoState.requisicoesCarregamento,
        ...carregamentoState.requisicoesTrocaRetirada
    ];

    todasRequisicoes.forEach(requisicao => {
        const chaveCliente = obterChaveClienteResumo(requisicao);
        if (chaveCliente) clientes.add(chaveCliente);
        if (requisicao.motivo === 'Cliente Novo' && chaveCliente) clientesNovos.add(chaveCliente);
        if (Object.hasOwn(motivos, requisicao.motivo)) motivos[requisicao.motivo]++;
    });

    [
        ['entrega', carregamentoState.requisicoesCarregamento],
        ['retorno', carregamentoState.requisicoesTrocaRetirada]
    ].forEach(([tipoMovimentacao, requisicoes]) => {
        requisicoes.forEach(requisicao => {
            (requisicao.itens || []).forEach(item => {
                const quantidade = Number(item.quantidade) || 0;
                const grupo = obterGrupoItemResumo(item);
                movimentacao[tipoMovimentacao][grupo] += quantidade;
                movimentacao[tipoMovimentacao].total += quantidade;
                movimentacao.total += quantidade;
            });
        });
    });

    return {
        movimentacao,
        motivos,
        totalClientes: clientes.size,
        clientesNovos: clientesNovos.size,
        totalRequisicoes: todasRequisicoes.length
    };
}

/**
 * Gera um PDF com todos os dados do carregamento atual.
 */
async function gerarPDF() {
    const botao = document.getElementById('btnGerarPDF');

    try {
        if (!window.jspdf) {
            alert('Biblioteca PDF não carregada.');
            return;
        }
        if (carregamentoState.requisicoesCarregamento.length === 0 &&
            carregamentoState.requisicoesTrocaRetirada.length === 0) {
            alert('⚠️ Adicione pelo menos uma requisição ao carregamento antes de gerar o PDF.');
            return;
        }

        // Coleta os dados do cabeçalho
        const semana = document.getElementById('semana').value.trim();
        const dataCarregamento = document.getElementById('dataCarregamento').value;
        const placa = document.getElementById('placa').value.trim();
        const motoristaTexto = document.getElementById('motoristaInput').value.trim();
        const motoristaId = obterIdMotoristaPorTexto(motoristaTexto);
        const conferente = document.getElementById('conferente').value.trim();
        const supervisor = document.getElementById('supervisor').value.trim();

        if (!semana || !dataCarregamento || !conferente) {
            alert('Preencha Semana, Data/Hora e Conferente antes de gerar o PDF.');
            return;
        }
        if (!valorExisteNoDatalist('placasVeiculosList', placa)) {
            alert('Selecione uma placa válida cadastrada em Veículos.');
            return;
        }
        if (!motoristaId) {
            alert('Selecione um motorista ativo cadastrado em Funcionários.');
            return;
        }
        if (supervisor && !valorExisteNoDatalist('supervisoresList', supervisor)) {
            alert('Selecione um supervisor ativo cadastrado em Supervisores.');
            return;
        }

        const motoristaNome = await getMotoristaNomeById(motoristaId);

        // Formata a data e hora informadas no formulario.
        const dataFormatada = formatarDataHoraLocal(dataCarregamento);
        if (!dataFormatada) {
            alert('Informe uma data e hora válidas.');
            return;
        }

        if (botao) {
            botao.disabled = true;
            botao.textContent = 'Gerando PDF...';
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margem = 8;
        const verde = [0, 105, 55];
        const resumo = calcularResumoCarregamento();

        try {
            const response = await fetch('logo.png');
            if (response.ok) {
                const blob = await response.blob();
                const logo = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                doc.addImage(logo, 'PNG', margem, 7, 40, 10);
            }
        } catch (error) {
            console.warn('Logo não carregado no PDF:', error);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.setTextColor(...verde);
        doc.text('RELATÓRIO DE CARREGAMENTO', pageWidth / 2, 14, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(80);
        doc.text(`Semana ${semana}`, pageWidth / 2, 20, { align: 'center' });
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margem, 9, { align: 'right' });

        doc.autoTable({
            startY: 25,
            margin: { left: margem, right: margem },
            theme: 'grid',
            body: [
                ['SEMANA', semana, 'DATA/HORA', dataFormatada, 'PLACA', placa],
                ['MOTORISTA', motoristaNome || motoristaTexto, 'CONFERENTE', conferente, 'SUPERVISOR', supervisor || '-']
            ],
            styles: { fontSize: 8, cellPadding: 1.8, valign: 'middle' },
            columnStyles: {
                0: { fontStyle: 'bold', fillColor: [235, 244, 239], cellWidth: 22 },
                1: { cellWidth: 45 },
                2: { fontStyle: 'bold', fillColor: [235, 244, 239], cellWidth: 25 },
                3: { cellWidth: 60 },
                4: { fontStyle: 'bold', fillColor: [235, 244, 239], cellWidth: 23 },
                5: { cellWidth: 58 }
            }
        });

        let finalY = doc.lastAutoTable.finalY + 5;

        finalY = adicionarTituloSecaoPDF(doc, 'MOVIMENTAÇÃO DE EQUIPAMENTOS', finalY, pageWidth, pageHeight, margem, verde);
        doc.autoTable({
            startY: finalY,
            margin: { left: margem, right: margem },
            theme: 'grid',
            head: [[
                'ENTREGA\nDEMAIS', 'ENTREGA\nESTEIRAS', 'ENTREGA\nFORMAS', 'TOTAL\nENTREGA',
                'RETORNO\nDEMAIS', 'RETORNO\nESTEIRAS', 'RETORNO\nFORMAS', 'TOTAL\nRETORNO',
                'TOTAL\nMOVIMENTADO', 'TOTAL\nCLIENTES'
            ]],
            body: [[
                resumo.movimentacao.entrega.demais,
                resumo.movimentacao.entrega.esteiras,
                resumo.movimentacao.entrega.formas,
                resumo.movimentacao.entrega.total,
                resumo.movimentacao.retorno.demais,
                resumo.movimentacao.retorno.esteiras,
                resumo.movimentacao.retorno.formas,
                resumo.movimentacao.retorno.total,
                resumo.movimentacao.total,
                resumo.totalClientes
            ]],
            styles: { fontSize: 7, cellPadding: 1.5, halign: 'center', valign: 'middle' },
            headStyles: { fillColor: verde, textColor: 255, fontStyle: 'bold' },
            bodyStyles: { fillColor: [247, 251, 248], fontStyle: 'bold' }
        });

        finalY = doc.lastAutoTable.finalY + 5;
        finalY = adicionarTituloSecaoPDF(doc, 'REQUISIÇÕES POR MOTIVO', finalY, pageWidth, pageHeight, margem, verde);
        doc.autoTable({
            startY: finalY,
            margin: { left: margem, right: margem },
            theme: 'grid',
            head: [[
                'CLIENTE NOVO\n(REQ.)', 'AUMENTO', 'AUMENTO+\nTROCA', 'TROCA',
                'RET.\nPARCIAL', 'RET.\nEMPRÉSTIMO', 'RET.\nTOTAL',
                'TOTAL\nREQUISIÇÕES', 'CLI. NOVOS\nÚNICOS', 'TOTAL\nCLIENTES'
            ]],
            body: [[
                resumo.motivos['Cliente Novo'],
                resumo.motivos['Aumento'],
                resumo.motivos['Aumento+Troca'],
                resumo.motivos['Troca'],
                resumo.motivos['Retirada Parcial'],
                resumo.motivos['Retirada de Empréstimo'],
                resumo.motivos['Retirada Total'],
                resumo.totalRequisicoes,
                resumo.clientesNovos,
                resumo.totalClientes
            ]],
            styles: { fontSize: 7, cellPadding: 1.5, halign: 'center', valign: 'middle' },
            headStyles: { fillColor: verde, textColor: 255, fontStyle: 'bold' },
            bodyStyles: { fillColor: [247, 251, 248], fontStyle: 'bold' }
        });

        finalY = doc.lastAutoTable.finalY + 5;
        finalY = adicionarTabelaItensPDF(
            doc,
            'ITENS CARREGADOS PARA ENTREGA',
            carregamentoState.requisicoesCarregamento,
            finalY,
            pageWidth,
            pageHeight,
            margem,
            verde
        );
        adicionarTabelaItensPDF(
            doc,
            'ITENS DE TROCA E RETIRADA',
            carregamentoState.requisicoesTrocaRetirada,
            finalY,
            pageWidth,
            pageHeight,
            margem,
            verde
        );

        const totalPaginas = doc.internal.getNumberOfPages();
        for (let pagina = 1; pagina <= totalPaginas; pagina++) {
            doc.setPage(pagina);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text('Sistema de Gerenciamento de Carregamentos - Marquespan', margem, pageHeight - 5);
            doc.text(`Página ${pagina} de ${totalPaginas}`, pageWidth - margem, pageHeight - 5, { align: 'right' });
        }

        const nomeData = dataFormatada.replace(/[/:,\s]+/g, '-').replace(/-+/g, '-');
        doc.save(`carregamento_semana_${semana}_${nomeData}.pdf`);
        alert('✅ PDF gerado com sucesso!');

    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('❌ Erro ao gerar PDF. Tente novamente.');
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.innerHTML = '📄 Gerar PDF';
        }
    }
}

function agruparItensPDF(requisicoes) {
    const itensAgrupados = {};

    requisicoes.forEach(req => {
        (req.itens || []).forEach(item => {
            const chave = `${item.item_nome}|${item.modelo}|${item.tipo}`;
            if (itensAgrupados[chave]) {
                itensAgrupados[chave].quantidade += Number(item.quantidade) || 0;
                itensAgrupados[chave].motivos.push(req.motivo);
            } else {
                itensAgrupados[chave] = {
                    ...item,
                    quantidade: Number(item.quantidade) || 0,
                    motivos: [req.motivo]
                };
            }
        });
    });

    return Object.values(itensAgrupados);
}

function adicionarTituloSecaoPDF(doc, titulo, y, pageWidth, pageHeight, margem, verde) {
    if (y > pageHeight - 25) {
        doc.addPage();
        y = 12;
    }
    doc.setFillColor(...verde);
    doc.rect(margem, y, pageWidth - (margem * 2), 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255);
    doc.text(titulo, pageWidth / 2, y + 4.2, { align: 'center' });
    return y + 7;
}

function adicionarTabelaItensPDF(doc, titulo, requisicoes, y, pageWidth, pageHeight, margem, verde) {
    const itens = agruparItensPDF(requisicoes);
    const inicioTabela = adicionarTituloSecaoPDF(doc, titulo, y, pageWidth, pageHeight, margem, verde);
    const body = itens.length
        ? itens.map(item => [
            item.item_nome || '',
            item.modelo || '',
            item.tipo || '',
            String(item.quantidade),
            [...new Set(item.motivos)].join(', ')
        ])
        : [['Nenhum item neste grupo.', '', '', '', '']];

    doc.autoTable({
        startY: inicioTabela,
        margin: { left: margem, right: margem, bottom: 12 },
        theme: 'grid',
        head: [['ITEM', 'MODELO', 'TIPO', 'QUANTIDADE', 'MOTIVO']],
        body,
        styles: { fontSize: 8, cellPadding: 1.5, valign: 'middle' },
        headStyles: { fillColor: verde, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [242, 247, 244] },
        columnStyles: {
            0: { cellWidth: 82 },
            1: { cellWidth: 42 },
            2: { cellWidth: 28, halign: 'center' },
            3: { cellWidth: 24, halign: 'center' },
            4: { cellWidth: 70 }
        }
    });

    return doc.lastAutoTable.finalY + 5;
}



/**
 * Renderiza a tabela de itens de troca e retirada (motivos que NÃO ADICIONAM itens).
 */
function renderizarTabelaTrocaRetirada() {
    const tabela = document.getElementById('tabelaItensTrocaRetirada');
    if (!tabela) return;
    if (tabela) tabela.classList.add('glass-table');
    tabela.innerHTML = '<thead><tr><th>ITEM</th><th>MODELO</th><th>TIPO</th><th>TOTAL</th><th>MOTIVO</th></tr></thead>';
    const tbody = document.createElement('tbody');

    const itensAgrupados = {};

    carregamentoState.requisicoesTrocaRetirada.forEach(req => {
        req.itens.forEach(item => {
            // Cria uma chave única para agrupar itens idênticos
            const chave = `${item.item_nome}|${item.modelo}|${item.tipo}`;
            if (itensAgrupados[chave]) {
                itensAgrupados[chave].quantidade += item.quantidade;
                itensAgrupados[chave].motivos.push(req.motivo);
            } else {
                itensAgrupados[chave] = {
                    ...item,
                    motivos: [req.motivo]
                };
            }
        });
    });

    for (const chave in itensAgrupados) {
        const item = itensAgrupados[chave];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.item_nome}</td>
            <td>${item.modelo}</td>
            <td>${item.tipo}</td>
            <td>${item.quantidade}</td>
            <td>${item.motivos.join(', ')}</td>
        `;
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
    const dataLocal = document.getElementById('dataCarregamento').value;
    const placa = document.getElementById('placa').value.trim();
    const motoristaTexto = document.getElementById('motoristaInput').value.trim();
    const motoristaId = obterIdMotoristaPorTexto(motoristaTexto);
    const conferente = document.getElementById('conferente').value.trim();
    const supervisor = document.getElementById('supervisor').value.trim();

    if (!valorExisteNoDatalist('placasVeiculosList', placa)) {
        alert('⚠️ Selecione uma placa válida cadastrada em Veículos.');
        return;
    }

    if (!motoristaId) {
        alert('⚠️ Selecione um motorista ativo cadastrado em Funcionários.');
        return;
    }

    if (supervisor && !valorExisteNoDatalist('supervisoresList', supervisor)) {
        alert('⚠️ Selecione um supervisor ativo cadastrado em Supervisores.');
        return;
    }

    const motoristaNome = await getMotoristaNomeById(motoristaId);

    if (!semana || !dataLocal || !placa || !conferente) {
        alert('⚠️ Preencha todos os campos obrigatórios do cabeçalho (Semana, Data/Hora, Placa, Motorista, Conferente).');
        return;
    }

    const data = converterDataHoraSaoPauloParaIso(dataLocal);
    if (!data) {
        alert('⚠️ Informe uma data e hora válidas.');
        return;
    }
    if (carregamentoState.requisicoesCarregamento.length === 0 && carregamentoState.requisicoesTrocaRetirada.length === 0) {
        alert('⚠️ Adicione pelo menos uma requisição ao carregamento.');
        return;
    }

    // 2. Insere o cabeçalho do carregamento
    const payloadCabecalho = { semana, data_hora: data, placa, motorista_nome: motoristaNome, conferente_nome: conferente, supervisor_nome: supervisor };
    console.log('DEBUG: payload cabeçalho carregamento ->', payloadCabecalho);

    // Função helper que tenta inserir e, caso o PostgREST reporte coluna inexistente,
    // faz uma tentativa substituindo o nome da coluna por uma alternativa comum.
    async function tryInsertWithColumnFallback(table, payload) {
        const attempt = await supabase.from(table).insert([payload]).select('id').single();
        if (!attempt.error) return attempt;

        // Se o erro for PGRST204 (coluna não encontrada), tenta ajustar o payload
        const err = attempt.error;
        const msg = err.message || '';
        const match = msg.match(/Could not find the '(.+?)' column/);
        if (match && match[1]) {
            const missingCol = match[1];
            console.warn(`Coluna ausente detectada: ${missingCol}. Tentando fallback...`);

            // Estratégias de fallback: remover sufixo _nome ou trocar por nome sem sufixo
            const fallbacks = [];
            if (missingCol.endsWith('_nome')) {
                fallbacks.push(missingCol.replace(/_nome$/, ''));
            }
            // remover sufixos comuns
            fallbacks.push(missingCol.replace(/_id$/, ''));
            fallbacks.push(missingCol.replace(/nome$/, ''));

            for (const alt of fallbacks) {
                if (!alt || alt === missingCol) continue;
                const newPayload = { ...payload };
                if (Object.prototype.hasOwnProperty.call(newPayload, missingCol)) {
                    newPayload[alt] = newPayload[missingCol];
                    delete newPayload[missingCol];
                }

                console.log('DEBUG: tentando novo payload com coluna alternativa ->', alt, newPayload);
                const retry = await supabase.from(table).insert([newPayload]).select('id').single();
                if (!retry.error) return retry;
                console.warn('Retry com alternativa', alt, 'falhou:', retry.error);
            }
        }

        // Se chegou aqui, retorna o erro original
        return attempt;
    }

    const { data: carregamentoData, error: carregamentoError } = await tryInsertWithColumnFallback('carregamentos', payloadCabecalho);

    if (carregamentoError) {
        alert('❌ Erro ao salvar o cabeçalho do carregamento. Verifique o console para detalhes.');
        console.error('Erro ao salvar cabeçalho do carregamento:', carregamentoError);
        try {
            console.error('Detalhes do erro (stringify):', JSON.stringify(carregamentoError, Object.getOwnPropertyNames(carregamentoError)));
        } catch (e) {
            console.error('Falha ao serializar erro:', e);
        }
        return;
    }

    const carregamentoId = carregamentoData.id;

    // 3. Insere as requisições e seus itens
    // Primeiro insere as requisições de carregamento (motivos que ADICIONAM itens)
    for (const req of carregamentoState.requisicoesCarregamento) {
        const { data: requisicaoData, error: requisicaoError } = await supabase
            .from('requisicoes')
            .insert([{ carregamento_id: carregamentoId, cliente_id: req.cliente_id, motivo: req.motivo }])
            .select('id')
            .single();

        if (requisicaoError) {
            console.error('Erro ao salvar requisição de carregamento:', requisicaoError);
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
            console.error('Erro ao salvar itens da requisição de carregamento:', itensError);
        }
    }

    // Depois insere as requisições de troca/retirada (motivos que NÃO ADICIONAM itens)
    for (const req of carregamentoState.requisicoesTrocaRetirada) {
        const { data: requisicaoData, error: requisicaoError } = await supabase
            .from('requisicoes')
            .insert([{ carregamento_id: carregamentoId, cliente_id: req.cliente_id, motivo: req.motivo }])
            .select('id')
            .single();

        if (requisicaoError) {
            console.error('Erro ao salvar requisição de troca/retirada:', requisicaoError);
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
            console.error('Erro ao salvar itens da requisição de troca/retirada:', itensError);
        }
    }

    alert('✅ Carregamento salvo com sucesso!');
    window.location.reload(); // Recarrega a página para um novo carregamento
}

// Verifica se há dados importados do PDF
function checkForImportedData() {
    const importedData = localStorage.getItem('pdfImportedData');
    if (importedData) {
        try {
            const data = JSON.parse(importedData);

            // Preenche os campos do cabeçalho se os dados estiverem disponíveis
            if (data.cliente) {
                // Busca o cliente no banco de dados para obter o ID
                buscarClientePorNome(data.cliente);
            }

            if (data.cidade) {
                // Pode ser usado para validar ou exibir informações adicionais
                console.log('Cidade identificada:', data.cidade);
            }

            if (data.data) {
                // Converte a data do formato DD/MM/YYYY para YYYY-MM-DD
                const dateParts = data.data.split('/');
                if (dateParts.length === 3) {
                    const formattedDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
                    document.getElementById('dataCarregamento').value = `${formattedDate}T${obterHoraLocalAtual()}`;
                }
            }

            if (data.motivo) {
                document.getElementById('motivoRequisicao').value = data.motivo;
            }

            if (data.requerente) {
                // Pode ser usado para preencher um campo de observação
                console.log('Requerente identificado:', data.requerente);
            }

            if (data.atendidoPor) {
                // Pode ser usado para preencher um campo de observação
                console.log('Atendido por:', data.atendidoPor);
            }

            // Preenche os itens se houver
            if (data.items && data.items.length > 0) {
                preencherItensImportados(data.items);
            }

            // Remove os dados do localStorage após usar
            localStorage.removeItem('pdfImportedData');

            alert(`✅ Dados importados com sucesso!\nCliente: ${data.cliente || 'N/A'}\nItens: ${data.items.length}`);

        } catch (error) {
            console.error('Erro ao processar dados importados:', error);
        }
    }
}

// Busca cliente por nome aproximado
async function buscarClientePorNome(nomeCliente) {
    try {
        const { data: clientes, error } = await supabase
            .from('clientes')
            .select('id, codigo, nome, cidade')
            .ilike('nome', `%${nomeCliente}%`)
            .limit(5);

        if (error) {
            console.error('Erro ao buscar cliente:', error);
            return;
        }

        if (clientes && clientes.length > 0) {
            // Se encontrou clientes, preenche o campo com o primeiro resultado
            const cliente = clientes[0];
            const clienteInput = document.getElementById('clienteInput');
            if (clienteInput) {
                clienteInput.value = `${cliente.codigo} - ${cliente.nome}`;
            }
        }
    } catch (error) {
        console.error('Erro ao buscar cliente:', error);
    }
}

// Preenche os itens importados na requisição atual
function preencherItensImportados(items) {
    console.log('Preenchendo itens importados:', items);

    items.forEach(item => {
        if (item.equipamento && item.quantidade) {
            // Adiciona o item à requisição atual
            const novoItem = {
                item_id: null, // Será preenchido quando buscar no banco
                item_nome: item.equipamento,
                modelo: item.modelo || '',
                tipo: 'EQUIPAMENTO', // Tipo padrão
                quantidade: item.quantidade || 1
            };

            requisicaoAtual.itens.push(novoItem);
        }
    });

    // Atualiza a tabela de itens
    renderizarItensRequisicaoAtual();
    renderizarTabelaResumo();

    console.log('Itens adicionados à requisição:', requisicaoAtual.itens);
}

function carregarImportacaoXlsx() {
    const raw = localStorage.getItem(IMPORTACAO_CARREGAMENTO_KEY);
    if (!raw) return false;

    try {
        const importacao = JSON.parse(raw);
        const cabecalho = importacao?.cabecalho || {};
        const requisicoes = Array.isArray(importacao?.requisicoes) ? importacao.requisicoes : [];

        if (!requisicoes.length) {
            throw new Error('A importação não possui requisições.');
        }

        document.getElementById('semana').value = cabecalho.semana || '';
        document.getElementById('dataCarregamento').value = cabecalho.data_hora || obterDataHoraLocalAtual();
        document.getElementById('placa').value = cabecalho.placa || '';
        document.getElementById('motoristaInput').value = cabecalho.motorista || '';
        document.getElementById('conferente').value = cabecalho.conferente || '';
        document.getElementById('supervisor').value = cabecalho.supervisor || '';

        carregamentoState.requisicoesCarregamento = [];
        carregamentoState.requisicoesTrocaRetirada = [];

        requisicoes.forEach(requisicao => {
            const normalizada = {
                cliente_id: requisicao.cliente_id,
                cliente_nome: requisicao.cliente_nome,
                motivo: requisicao.motivo,
                ordem: requisicao.ordem || '',
                arquivo: requisicao.arquivo || '',
                itens: (requisicao.itens || []).map(item => ({
                    item_id: item.item_id,
                    item_nome: item.item_nome,
                    modelo: item.modelo || '',
                    tipo: item.tipo || '',
                    quantidade: Number(item.quantidade) || 0
                }))
            };

            if (MOTIVOS_QUE_ADICIONAM.includes(normalizada.motivo)) {
                carregamentoState.requisicoesCarregamento.push(normalizada);
            } else if (MOTIVOS_QUE_NAO_ADICIONAM.includes(normalizada.motivo)) {
                carregamentoState.requisicoesTrocaRetirada.push(normalizada);
            }
        });

        renderizarTabelaCarregamento();
        renderizarTabelaTrocaRetirada();
        renderizarTabelaResumo();
        localStorage.removeItem(IMPORTACAO_CARREGAMENTO_KEY);

        alert(`${requisicoes.length} requisição(ões) importada(s) e pronta(s) para o carregamento.`);
        return true;
    } catch (error) {
        console.error('Erro ao carregar importação XLSX:', error);
        alert(`Não foi possível carregar as requisições importadas: ${error.message}`);
        return false;
    }
}

// Executa quando o DOM está totalmente carregado
document.addEventListener('DOMContentLoaded', async () => {
    // Preenche campos automáticos
    const campoDataCarregamento = document.getElementById('dataCarregamento');
    campoDataCarregamento.value = obterDataHoraLocalAtual();
    preencherSemanaPelaData();
    campoDataCarregamento.addEventListener('change', preencherSemanaPelaData);
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (usuario && usuario.nome) {
        document.getElementById('conferente').value = usuario.nome;
    }

    await Promise.all([
        carregarClientesNoDatalist(),
        carregarVeiculosNoDatalist(),
        carregarItensNoModal(),
        carregarMotoristasNoDatalist(),
        carregarSupervisoresNoDatalist()
    ]);

    const carregouXlsx = carregarImportacaoXlsx();
    if (!carregouXlsx) checkForImportedData();

    // Lógica para o Modal de Clientes
    const modalCliente = document.getElementById('modalCliente');
    const btnAbrirCliente = document.getElementById('btnAbrirModalCliente');
    const btnFecharCliente = document.getElementById('fecharModalCliente');

    btnAbrirCliente.onclick = () => { modalCliente.style.display = 'flex'; }
    btnFecharCliente.onclick = () => { modalCliente.style.display = 'none'; }

    // Lógica para o Modal de Adicionar Item
    const modalAdicionarItem = document.getElementById('modalAdicionarItem');
    const btnAbrirAdicionarItem = document.getElementById('btnAbrirModalAdicionarItem');
    const btnFecharAdicionarItem = document.getElementById('fecharModalAdicionarItem');
    const btnAdicionarItensSelecionados = document.getElementById('btnAdicionarItensSelecionados');
    const btnLimparSelecao = document.getElementById('btnLimparSelecao');
    const buscaItens = document.getElementById('buscaItens');

    btnAbrirAdicionarItem.onclick = async () => {
        modalAdicionarItem.style.display = 'flex';
        await carregarTodosItensParaModal();
    }

    btnFecharAdicionarItem.onclick = () => {
        modalAdicionarItem.style.display = 'none';
        limparSelecaoVisual();
        itensSelecionados = [];
    }

    // Event listener para adicionar itens selecionados
    if (btnAdicionarItensSelecionados) {
        btnAdicionarItensSelecionados.addEventListener('click', adicionarItensSelecionadosARequisicao);
    }

    // Event listener para limpar seleção
    if (btnLimparSelecao) {
        btnLimparSelecao.addEventListener('click', () => {
            itensSelecionados = [];
            limparSelecaoVisual();
        });
    }

    // Event listener para busca em tempo real
    if (buscaItens) {
        buscaItens.addEventListener('input', (e) => {
            const termoBusca = e.target.value.trim();
            renderizarTabelaItensModal(termoBusca);
        });
    }

    // Lógica para fechar modais clicando fora
    window.addEventListener('click', (event) => {
        if (event.target == modalCliente) {
            modalCliente.style.display = 'none';
        }
        if (event.target == modalAdicionarItem) {
            modalAdicionarItem.style.display = 'none';
        }
    });

    // Event Listeners dos formulários e botões principais
    document.getElementById('formNovoCliente').addEventListener('submit', salvarNovoCliente);
    document.getElementById('btnIncluirRequisicao').addEventListener('click', handleIncluirRequisicao);
    document.getElementById('btnSalvarCarregamento').addEventListener('click', salvarCarregamentoCompleto);
    document.getElementById('btnGerarPDF').addEventListener('click', gerarPDF);

    // Renderiza tabelas vazias inicialmente
    renderizarItensRequisicaoAtual();
    renderizarTabelaResumo();
});

/**
 * Renderiza a tabela de resumo geral do carregamento.
 */
function renderizarTabelaResumo() {
    const tabela = document.getElementById('tabelaResumo');
    if (!tabela) return;

    const resumo = calcularResumoCarregamento();
    tabela.className = 'glass-table data-grid';

    if (!resumo.totalRequisicoes) {
        tabela.innerHTML = `
            <thead>
                <tr><th>RESUMO GERAL DO CARREGAMENTO</th></tr>
            </thead>
            <tbody>
                <tr><td style="text-align: center; color: #666;">Nenhuma requisição adicionada ao carregamento.</td></tr>
            </tbody>
        `;
        return;
    }

    tabela.innerHTML = `
        <thead>
            <tr>
                <th colspan="10" style="text-align: center; background-color: #f8f9fa;">MOVIMENTAÇÃO DE EQUIPAMENTOS</th>
            </tr>
            <tr>
                <th>ENTREGA DEMAIS</th>
                <th>ENTREGA ESTEIRAS</th>
                <th>ENTREGA FORMAS</th>
                <th>TOTAL ENTREGA</th>
                <th>RETORNO DEMAIS</th>
                <th>RETORNO ESTEIRAS</th>
                <th>RETORNO FORMAS</th>
                <th>TOTAL RETORNO</th>
                <th>TOTAL MOVIMENTADO</th>
                <th>TOTAL CLIENTES</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>${resumo.movimentacao.entrega.demais}</td>
                <td>${resumo.movimentacao.entrega.esteiras}</td>
                <td>${resumo.movimentacao.entrega.formas}</td>
                <td><strong>${resumo.movimentacao.entrega.total}</strong></td>
                <td>${resumo.movimentacao.retorno.demais}</td>
                <td>${resumo.movimentacao.retorno.esteiras}</td>
                <td>${resumo.movimentacao.retorno.formas}</td>
                <td><strong>${resumo.movimentacao.retorno.total}</strong></td>
                <td><strong>${resumo.movimentacao.total}</strong></td>
                <td><strong>${resumo.totalClientes}</strong></td>
            </tr>
            <tr>
                <th colspan="10" style="text-align: center; background-color: #f8f9fa;">REQUISIÇÕES POR MOTIVO</th>
            </tr>
            <tr>
                <th>CLIENTE NOVO (REQ.)</th>
                <th>AUMENTO</th>
                <th>AUMENTO+TROCA</th>
                <th>TROCA</th>
                <th>RET. PARCIAL</th>
                <th>RET. EMPRÉSTIMO</th>
                <th>RET. TOTAL</th>
                <th>TOTAL REQUISIÇÕES</th>
                <th>CLI. NOVOS ÚNICOS</th>
                <th>TOTAL CLIENTES</th>
            </tr>
            <tr>
                <td>${resumo.motivos['Cliente Novo']}</td>
                <td>${resumo.motivos['Aumento']}</td>
                <td>${resumo.motivos['Aumento+Troca']}</td>
                <td>${resumo.motivos['Troca']}</td>
                <td>${resumo.motivos['Retirada Parcial']}</td>
                <td>${resumo.motivos['Retirada de Empréstimo']}</td>
                <td>${resumo.motivos['Retirada Total']}</td>
                <td><strong>${resumo.totalRequisicoes}</strong></td>
                <td><strong>${resumo.clientesNovos}</strong></td>
                <td><strong>${resumo.totalClientes}</strong></td>
            </tr>
        </tbody>
    `;
}
