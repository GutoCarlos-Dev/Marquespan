import { supabase } from './supabase.js';

/**
 * Carrega os clientes do banco de dados e os popula em um elemento <select>.
 */
async function carregarClientesNoSelect() {
    const selectCliente = document.getElementById('clienteSelect');
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
        defaultOption.value = '';
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
    document.getElementById('clienteSelect').value = data.id;
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

// Executa quando o DOM está totalmente carregado
document.addEventListener('DOMContentLoaded', () => {
    carregarClientesNoSelect();
    carregarVeiculosNoDatalist();

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

    // Lógica para fechar modais clicando fora
    window.addEventListener('click', (event) => {
        if (event.target == modalCliente) {
            modalCliente.style.display = 'none';
        }
        if (event.target == modalVeiculo) {
            modalVeiculo.style.display = 'none';
        }
    });

    document.getElementById('formNovoCliente').addEventListener('submit', salvarNovoCliente);
    document.getElementById('formNovoVeiculo').addEventListener('submit', salvarNovoVeiculo);
});