import { supabase } from './supabase.js';

/**
 * Carrega os clientes do banco de dados e os popula em um elemento <select>.
 */
async function carregarClientesNoSelect() {
    const selectCliente = document.getElementById('clienteSelect');
    if (!selectCliente) return;

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

    if (clientes.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'Nenhum cliente cadastrado';
        option.disabled = true;
        selectCliente.appendChild(option);
    } else {
        clientes.forEach(cliente => {
            const option = document.createElement('option');
            option.value = cliente.id; // Usar o ID como valor
            option.textContent = `${cliente.codigo} - ${cliente.nome}`; // Exibir código e nome
            selectCliente.appendChild(option);
        });
    }
}

// Executa quando o DOM está totalmente carregado
document.addEventListener('DOMContentLoaded', () => {
    carregarClientesNoSelect();
});