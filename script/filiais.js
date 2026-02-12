import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    carregarFiliais();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('formFilial').addEventListener('submit', salvarFilial);
    
    document.getElementById('btnCancelar').addEventListener('click', () => {
        limparFormulario();
    });
}

async function carregarFiliais() {
    const tbody = document.getElementById('tabelaFiliais');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Carregando...</td></tr>';

    try {
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        renderTable(data);
    } catch (err) {
        console.error('Erro ao carregar filiais:', err);
        // Fallback se a tabela não existir ou erro
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderTable(filiais) {
    const tbody = document.getElementById('tabelaFiliais');
    tbody.innerHTML = '';

    if (!filiais || filiais.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhuma filial cadastrada.</td></tr>';
        return;
    }

    filiais.forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${f.nome}</td>
            <td><strong>${f.sigla}</strong></td>
            <td>
                <button class="btn-icon edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;

        // Eventos
        tr.querySelector('.edit').addEventListener('click', () => editarFilial(f));
        tr.querySelector('.delete').addEventListener('click', () => excluirFilial(f.id));

        tbody.appendChild(tr);
    });
}

async function salvarFilial(e) {
    e.preventDefault();

    const id = document.getElementById('filialId').value;
    const nome = document.getElementById('filialNome').value.trim();
    const sigla = document.getElementById('filialSigla').value.trim().toUpperCase();

    if (!nome || !sigla) {
        alert('Preencha todos os campos.');
        return;
    }

    try {
        let error;
        if (id) {
            // Update
            const response = await supabaseClient.from('filiais').update({ nome, sigla }).eq('id', id);
            error = response.error;
        } else {
            // Insert
            const response = await supabaseClient.from('filiais').insert([{ nome, sigla }]);
            error = response.error;
        }

        if (error) throw error;

        alert('Filial salva com sucesso!');
        limparFormulario();
        carregarFiliais();

    } catch (err) {
        console.error('Erro ao salvar filial:', err);
        alert('Erro ao salvar: ' + err.message);
    }
}

function editarFilial(filial) {
    document.getElementById('filialId').value = filial.id;
    document.getElementById('filialNome').value = filial.nome;
    document.getElementById('filialSigla').value = filial.sigla;
    document.getElementById('btnCancelar').classList.remove('hidden');
}

async function excluirFilial(id) {
    if (!confirm('Tem certeza que deseja excluir esta filial?')) return;

    const { error } = await supabaseClient.from('filiais').delete().eq('id', id);
    if (error) return alert('Erro ao excluir: ' + error.message);
    
    carregarFiliais();
}

function limparFormulario() {
    document.getElementById('formFilial').reset();
    document.getElementById('filialId').value = '';
    document.getElementById('btnCancelar').classList.add('hidden');
}