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

// Executa quando o DOM está totalmente carregado
document.addEventListener('DOMContentLoaded', () => {
    carregarClientesNoSelect();

    const modal = document.getElementById('modalCliente');
    const btnAbrir = document.getElementById('btnAbrirModalCliente');
    const btnFechar = document.getElementById('fecharModalCliente');

    btnAbrir.onclick = () => {
        modal.style.display = 'block';
    }

    btnFechar.onclick = () => {
        modal.style.display = 'none';
    }

    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }

    document.getElementById('formNovoCliente').addEventListener('submit', salvarNovoCliente);
});