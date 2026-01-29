// Importa o cliente Supabase, assumindo que ele está configurado em supabase.js
import { supabaseClient } from './supabase.js';
let editingId = null;

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
    const selectSemana = document.getElementById('escalaSemana');
    const selectFuncionario = document.getElementById('escalaFuncionario');
    const selectTurno = document.getElementById('escalaTurno');
    const tabelaBody = document.getElementById('tabelaEscalasBody');
    const btnLimpar = document.getElementById('btnLimparEscala');

    // --- FUNÇÕES ---

    /**
     * Calcula o número da semana atual do ano.
     * @param {Date} d - A data atual.
     * @returns {number} O número da semana.
     */
    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return weekNo;
    }

    /**
     * Popula o select de semanas com as 52 semanas do ano e seleciona a atual.
     */
    function carregarSemanas() {
        const semanaAtual = getWeekNumber(new Date());
        selectSemana.innerHTML = ''; // Limpa opções existentes

        for (let i = 1; i <= 52; i++) {
            const nomeSemana = `SEMANA ${String(i).padStart(2, '0')}`;
            const option = new Option(nomeSemana, nomeSemana);
            selectSemana.appendChild(option);
        }
        selectSemana.value = `SEMANA ${String(semanaAtual).padStart(2, '0')}`;
    }

    /**
     * Carrega a lista de funcionários ativos do banco de dados.
     */
    async function carregarFuncionarios() {
        selectFuncionario.innerHTML = '<option value="">Carregando...</option>';
        try {
            const { data, error } = await supabaseClient
                .from('funcionario')
                .select('id, nome_completo')
                .eq('status', 'Ativo')
                .order('nome_completo', { ascending: true });

            if (error) throw error;

            selectFuncionario.innerHTML = '<option value="" disabled selected>Selecione o funcionário</option>';
            data.forEach(func => {
                selectFuncionario.add(new Option(func.nome_completo, func.id));
            });
        } catch (error) {
            console.error('Erro ao carregar funcionários:', error);
            selectFuncionario.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    }

    /**
     * Carrega as escalas do banco de dados e as renderiza na tabela.
     */
    async function carregarEscalas() {
        tabelaBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Carregando...</td></tr>';

        const { data, error } = await supabaseClient
            .from('escalas')
            .select(`
                id,
                semana,
                turno,
                funcionario:id_funcionario ( nome_completo )
            `)
            .order('created_at', { ascending: false });

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
    }

    /**
     * Renderiza os dados na tabela.
     * @param {Array} escalas - A lista de escalas a ser renderizada.
     */
    function renderizarTabela(escalas) {
        tabelaBody.innerHTML = '';

        escalas.forEach(escala => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escala.id}</td>
                <td>${escala.funcionario.nome_completo}</td>
                <td>${escala.semana}</td>
                <td>${escala.turno}</td>
                <td class="actions-cell">
                    <button class="btn-acao editar" data-id="${escala.id}" title="Editar"><i class="fas fa-pen"></i></button>
                    <button class="btn-acao excluir" data-id="${escala.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tabelaBody.appendChild(tr);
        });
    }

    /**
     * Limpa o formulário e reseta o estado de edição.
     */
    function limparFormulario() {
        form.reset();
        editingId = null;
        document.getElementById('escalaId').value = '';
        document.getElementById('btnSalvarEscala').innerHTML = '<i class="fas fa-save"></i> Salvar Escala';
        carregarSemanas(); // Reseta para a semana atual
    }

    /**
     * Carrega os dados de uma escala para edição no formulário.
     * @param {number} id - O ID da escala a ser editada.
     */
    async function carregarParaEdicao(id) {
        try {
            const { data, error } = await supabaseClient
                .from('escalas')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            editingId = id;
            document.getElementById('escalaId').value = data.id;
            selectSemana.value = data.semana;
            selectFuncionario.value = data.id_funcionario;
            selectTurno.value = data.turno;

            document.getElementById('btnSalvarEscala').innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Escala';
            form.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error('Erro ao carregar escala para edição:', error);
            alert('Não foi possível carregar os dados para edição.');
        }
    }

    /**
     * Exclui uma escala do banco de dados.
     * @param {number} id - O ID da escala a ser excluída.
     */
    async function excluirEscala(id) {
        if (!confirm('Tem certeza que deseja excluir esta escala?')) return;

        try {
            const { error } = await supabaseClient.from('escalas').delete().eq('id', id);
            if (error) throw error;
            alert('Escala excluída com sucesso!');
            carregarEscalas();
        } catch (error) {
            console.error('Erro ao excluir escala:', error);
            alert('Erro ao excluir escala.');
        }
    }

    // --- EVENT LISTENERS ---

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const payload = {
                semana: selectSemana.value,
                id_funcionario: selectFuncionario.value,
                turno: selectTurno.value,
                usuario_logado: usuarioLogado.nome
            };

            if (editingId) {
                payload.id = editingId;
            }

            try {
                const { error } = await supabaseClient.from('escalas').upsert(payload);
                if (error) throw error;

                alert(`Escala ${editingId ? 'atualizada' : 'salva'} com sucesso!`);
                limparFormulario();
                carregarEscalas();
            } catch (error) {
                console.error('Erro ao salvar escala:', error);
                alert('Erro ao salvar escala: ' + error.message);
            }
        });
    }

    if (btnLimpar) {
        btnLimpar.addEventListener('click', limparFormulario);
    }

    tabelaBody.addEventListener('click', (e) => {
        const editButton = e.target.closest('.btn-acao.editar');
        const deleteButton = e.target.closest('.btn-acao.excluir');

        if (editButton) {
            carregarParaEdicao(editButton.dataset.id);
        } else if (deleteButton) {
            excluirEscala(deleteButton.dataset.id);
        }
    });

    // --- INICIALIZAÇÃO ---
    carregarSemanas();
    carregarFuncionarios();
    carregarEscalas();
});