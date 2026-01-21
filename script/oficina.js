import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    carregarItensVerificadores();
    listarItensVerificadores(); // Carrega a grid da aba Item Verificador
    carregarOficinas();
    
    // Eventos Oficina
    document.getElementById('formCadastrarOficina').addEventListener('submit', salvarOficina);
    document.getElementById('btnClearOficinaForm').addEventListener('click', limparFormulario);
    document.getElementById('searchOficinaInput').addEventListener('input', filtrarOficinas);

    // Eventos Item Verificador
    document.getElementById('formCadastrarItem').addEventListener('submit', salvarItemVerificador);
    document.getElementById('btnClearItemForm').addEventListener('click', limparFormularioItem);

    // Controle de Abas
    const tabs = document.querySelectorAll('.painel-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active de todas as abas e esconde seções
            document.querySelectorAll('.painel-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));

            // Ativa aba clicada e mostra seção correspondente
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });
});

let oficinasCache = [];
let itensCache = [];

// Carrega o select de Itens Verificadores
async function carregarItensVerificadores() {
    const select = document.getElementById('oficinaItemVerificador');
    select.innerHTML = '<option value="">Carregando...</option>';

    try {
        const { data, error } = await supabaseClient
            .from('itens_verificacao')
            .select('id, descricao')
            .order('descricao');

        if (error) throw error;

        select.innerHTML = '<option value="">Selecione um item...</option>';
        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.descricao;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar itens verificadores:', error);
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

// Lista os itens na grid da aba Item Verificador
async function listarItensVerificadores() {
    const tbody = document.getElementById('itemTableBody');
    tbody.innerHTML = '<tr><td colspan="2" class="text-center">Carregando...</td></tr>';

    try {
        const { data, error } = await supabaseClient
            .from('itens_verificacao')
            .select('*')
            .order('descricao');

        if (error) throw error;

        itensCache = data;
        renderizarTabelaItens(itensCache);
    } catch (error) {
        console.error('Erro ao listar itens:', error);
        tbody.innerHTML = `<tr><td colspan="2" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
    }
}

function renderizarTabelaItens(itens) {
    const tbody = document.getElementById('itemTableBody');
    
    if (itens.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center">Nenhum item cadastrado.</td></tr>';
        return;
    }

    tbody.innerHTML = itens.map(item => `
        <tr>
            <td>${item.descricao}</td>
            <td>
                <button class="btn-acao editar" onclick="editarItem(${item.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-acao excluir" onclick="excluirItem(${item.id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function carregarOficinas() {
    const tbody = document.getElementById('oficinaTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';

    try {
        // Faz o join com a tabela de itens_verificacao para pegar a descrição
        const { data, error } = await supabaseClient
            .from('oficinas')
            .select('*, itens_verificacao(descricao)')
            .order('nome');

        if (error) throw error;

        oficinasCache = data;
        renderizarTabela(oficinasCache);
    } catch (error) {
        console.error('Erro ao carregar oficinas:', error);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
    }
}

function renderizarTabela(oficinas) {
    const tbody = document.getElementById('oficinaTableBody');
    
    if (oficinas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhuma oficina cadastrada.</td></tr>';
        return;
    }

    tbody.innerHTML = oficinas.map(oficina => `
        <tr>
            <td>${oficina.nome}</td>
            <td><span class="badge badge-info">${oficina.filial}</span></td>
            <td>${oficina.itens_verificacao?.descricao || '-'}</td>
            <td>
                <button class="btn-acao editar" onclick="editarOficina(${oficina.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-acao excluir" onclick="excluirOficina(${oficina.id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function salvarOficina(e) {
    e.preventDefault();
    
    const id = document.getElementById('oficinaEditingId').value;
    const nome = document.getElementById('oficinaNome').value;
    const filial = document.getElementById('oficinaFilial').value;
    const itemVerificadorId = document.getElementById('oficinaItemVerificador').value;
    const btnSubmit = document.getElementById('btnSubmitOficina');

    if (!itemVerificadorId) {
        alert('Por favor, selecione um Item Verificador.');
        return;
    }

    const dados = {
        nome: nome,
        filial: filial,
        item_verificador_id: itemVerificadorId
    };

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Salvando...';

    try {
        let error;
        if (id) {
            // Atualizar
            const response = await supabaseClient.from('oficinas').update(dados).eq('id', id);
            error = response.error;
        } else {
            // Criar
            const response = await supabaseClient.from('oficinas').insert(dados);
            error = response.error;
        }

        if (error) throw error;

        alert('Oficina salva com sucesso!');
        limparFormulario();
        carregarOficinas();
    } catch (error) {
        console.error('Erro ao salvar oficina:', error);
        alert('Erro ao salvar: ' + error.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = id ? 'Atualizar Oficina' : 'Cadastrar Oficina';
    }
}

async function salvarItemVerificador(e) {
    e.preventDefault();
    
    const id = document.getElementById('itemEditingId').value;
    const descricao = document.getElementById('itemDescricao').value;
    const btnSubmit = document.getElementById('btnSubmitItem');

    const dados = { descricao: descricao };

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Salvando...';

    try {
        let error;
        if (id) {
            // Atualizar
            const response = await supabaseClient.from('itens_verificacao').update(dados).eq('id', id);
            error = response.error;
        } else {
            // Criar
            const response = await supabaseClient.from('itens_verificacao').insert(dados);
            error = response.error;
        }

        if (error) throw error;

        alert('Item salvo com sucesso!');
        limparFormularioItem();
        listarItensVerificadores();
        carregarItensVerificadores(); // Atualiza o select da outra aba
    } catch (error) {
        console.error('Erro ao salvar item:', error);
        alert('Erro ao salvar: ' + error.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = id ? 'Atualizar Item' : 'Cadastrar Item';
    }
}

window.editarOficina = function(id) {
    const oficina = oficinasCache.find(o => o.id === id);
    if (!oficina) return;

    document.getElementById('oficinaEditingId').value = oficina.id;
    document.getElementById('oficinaNome').value = oficina.nome;
    document.getElementById('oficinaFilial').value = oficina.filial;
    document.getElementById('oficinaItemVerificador').value = oficina.item_verificador_id;

    document.getElementById('btnSubmitOficina').textContent = 'Atualizar Oficina';
    document.getElementById('sectionCadastrarOficina').scrollIntoView({ behavior: 'smooth' });
};

window.editarItem = function(id) {
    const item = itensCache.find(i => i.id === id);
    if (!item) return;

    document.getElementById('itemEditingId').value = item.id;
    document.getElementById('itemDescricao').value = item.descricao;

    document.getElementById('btnSubmitItem').textContent = 'Atualizar Item';
    // A aba já deve estar ativa, mas podemos focar no input
    document.getElementById('itemDescricao').focus();
};

window.excluirOficina = async function(id) {
    if (!confirm('Tem certeza que deseja excluir esta oficina?')) return;

    try {
        const { error } = await supabaseClient.from('oficinas').delete().eq('id', id);
        if (error) throw error;
        carregarOficinas();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        alert('Erro ao excluir: ' + error.message);
    }
};

window.excluirItem = async function(id) {
    if (!confirm('Tem certeza que deseja excluir este item? Isso pode afetar oficinas vinculadas.')) return;

    try {
        const { error } = await supabaseClient.from('itens_verificacao').delete().eq('id', id);
        if (error) throw error;
        listarItensVerificadores();
        carregarItensVerificadores();
    } catch (error) {
        console.error('Erro ao excluir item:', error);
        alert('Erro ao excluir: ' + error.message);
    }
};

function limparFormulario() {
    document.getElementById('formCadastrarOficina').reset();
    document.getElementById('oficinaEditingId').value = '';
    document.getElementById('btnSubmitOficina').textContent = 'Cadastrar Oficina';
    // Garante que SP volte a ser o padrão se o reset não o fizer (embora reset faça)
    document.getElementById('oficinaFilial').value = 'SP';
}

function limparFormularioItem() {
    document.getElementById('formCadastrarItem').reset();
    document.getElementById('itemEditingId').value = '';
    document.getElementById('btnSubmitItem').textContent = 'Cadastrar Item';
}

function filtrarOficinas() {
    const termo = document.getElementById('searchOficinaInput').value.toLowerCase();
    const filtrados = oficinasCache.filter(o => 
        o.nome.toLowerCase().includes(termo) || 
        o.filial.toLowerCase().includes(termo)
    );
    renderizarTabela(filtrados);
}