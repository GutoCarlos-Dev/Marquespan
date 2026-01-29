// Importa o cliente Supabase, assumindo que ele está configurado em supabase.js
import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Página de Controle de Escala carregada.');

    // Proteção de página: verifica se o usuário está logado
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado) {
        alert('Acesso negado. Por favor, faça login.');
        window.location.href = '../index.html'; // Redireciona para a página de login na raiz
        return;
    }

    // --- ELEMENTOS DO DOM ---
    const form = document.getElementById('formEscala');
    const tabelaBody = document.getElementById('tabelaEscalasBody');

    // --- FUNÇÕES ---

    /**
     * Carrega as escalas do banco de dados e as renderiza na tabela.
     */
    async function carregarEscalas() {
        // Exemplo de como carregar dados do Supabase (descomente quando a tabela 'escalas' existir)
        /*
        tabelaBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Carregando...</td></tr>';

        const { data, error } = await supabaseClient
            .from('escalas') // Substitua 'escalas' pelo nome da sua tabela
            .select(`
                id,
                data_inicio,
                data_fim,
                turno,
                funcionarios ( nome ) // Exemplo de join com a tabela de funcionários
            `)
            .order('data_inicio', { ascending: false });

        if (error) {
            console.error('Erro ao carregar escalas:', error);
            tabelaBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Erro ao carregar escalas.</td></tr>';
            return;
        }

        if (data.length === 0) {
            tabelaBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhuma escala cadastrada.</td></tr>';
            return;
        }

        renderizarTabela(data);
        */
    }

    /**
     * Renderiza os dados na tabela.
     * @param {Array} escalas - A lista de escalas a ser renderizada.
     */
    function renderizarTabela(escalas) {
        tabelaBody.innerHTML = ''; // Limpa a tabela

        escalas.forEach(escala => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escala.id}</td>
                <td>${escala.funcionarios.nome}</td>
                <td>${new Date(escala.data_inicio).toLocaleDateString('pt-BR')}</td>
                <td>${new Date(escala.data_fim).toLocaleDateString('pt-BR')}</td>
                <td>${escala.turno}</td>
                <td class="actions-cell">
                    <button class="btn-acao editar" data-id="${escala.id}" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="btn-acao excluir" data-id="${escala.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tabelaBody.appendChild(tr);
        });
    }

    // --- EVENT LISTENERS ---

    // Exemplo de listener para o formulário
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            // Lógica para salvar ou atualizar uma escala
            alert('Funcionalidade de salvar ainda não implementada.');
        });
    }

    // --- INICIALIZAÇÃO ---
    // carregarEscalas(); // Chama a função para carregar os dados quando a página carregar
});