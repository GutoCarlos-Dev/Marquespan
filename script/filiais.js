// script/filiais.js
import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    carregarFiliais();
    document.getElementById('formFilial').addEventListener('submit', salvarFilial);
});

async function carregarFiliais() {
    const tbody = document.getElementById('tabelaFiliais');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center">Carregando...</td></tr>';

    const { data, error } = await supabaseClient
        .from('filiais')
        .select('*')
        .order('nome');

    if (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Erro ao carregar.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    data.forEach(filial => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${filial.nome}</td>
            <td><strong>${filial.sigla}</strong></td>
            <td>
                <button onclick="editarFilial('${filial.id}', '${filial.nome}', '${filial.sigla}')" class="btn-icon-small text-primary"><i class="fas fa-pen"></i></button>
                <button onclick="excluirFilial('${filial.id}')" class="btn-icon-small text-danger"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function salvarFilial(e) {
    e.preventDefault();
    const id = document.getElementById('filialId').value;
    const nome = document.getElementById('filialNome').value.trim();
    const sigla = document.getElementById('filialSigla').value.trim().toUpperCase();

    const payload = { nome, sigla };
    let error;

    if (id) {
        const res = await supabaseClient.from('filiais').update(payload).eq('id', id);
        error = res.error;
    } else {
        const res = await supabaseClient.from('filiais').insert([payload]);
        error = res.error;
    }

    if (error) {
        alert('Erro ao salvar: ' + error.message);
    } else {
        alert('Filial salva com sucesso!');
        limparFormulario();
        carregarFiliais();
    }
}

window.editarFilial = function(id, nome, sigla) {
    document.getElementById('filialId').value = id;
    document.getElementById('filialNome').value = nome;
    document.getElementById('filialSigla').value = sigla;
    document.getElementById('btnSalvar').innerHTML = '<i class="fas fa-sync"></i> Atualizar';
    document.getElementById('btnCancelar').classList.remove('hidden');
};

window.excluirFilial = async function(id) {
    if (confirm('Tem certeza? Isso não afetará veículos já cadastrados, mas removerá a opção da lista.')) {
        const { error } = await supabaseClient.from('filiais').delete().eq('id', id);
        if (error) alert('Erro ao excluir: ' + error.message);
        else carregarFiliais();
    }
};

window.limparFormulario = function() {
    document.getElementById('formFilial').reset();
    document.getElementById('filialId').value = '';
    document.getElementById('btnSalvar').innerHTML = '<i class="fas fa-save"></i> Salvar';
    document.getElementById('btnCancelar').classList.add('hidden');
};
