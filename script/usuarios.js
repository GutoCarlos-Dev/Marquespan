import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    carregarUsuarios();
    carregarNiveis();
    setupEventListeners();
});

function setupEventListeners() {
    // Botão Novo Usuário
    document.getElementById('btnAdicionarNovo').addEventListener('click', () => {
        document.getElementById('cadastro').classList.remove('hidden');
        document.getElementById('busca').classList.add('hidden');
        limparFormulario();
    });

    // Botão Cancelar
    document.getElementById('btnCancelar').addEventListener('click', () => {
        document.getElementById('cadastro').classList.add('hidden');
        document.getElementById('busca').classList.remove('hidden');
        limparFormulario();
    });

    // Botão Atualizar Lista
    document.getElementById('btnAtualizarLista').addEventListener('click', carregarUsuarios);

    // Form Submit
    document.getElementById('formUsuario').addEventListener('submit', salvarUsuario);

    // Busca em tempo real
    document.getElementById('termoBusca').addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase();
        const linhas = document.querySelectorAll('#corpoTabelaUsuarios tr');
        
        linhas.forEach(linha => {
            const texto = linha.textContent.toLowerCase();
            linha.style.display = texto.includes(termo) ? '' : 'none';
        });
    });
}

async function carregarNiveis() {
    const selectNivel = document.getElementById('nivel');
    try {
        const { data, error } = await supabaseClient
            .from('nivel_permissoes')
            .select('nivel')
            .order('nivel');

        if (error) throw error;

        // Limpa opções exceto a primeira
        selectNivel.innerHTML = '<option value="" disabled selected>Selecione o nível</option>';
        
        // Adiciona "Administrador" manualmente se não vier do banco, pois é padrão
        const niveis = new Set(data.map(n => n.nivel));
        niveis.add('Administrador');

        Array.from(niveis).sort().forEach(nivel => {
            const option = document.createElement('option');
            option.value = nivel;
            option.textContent = nivel;
            selectNivel.appendChild(option);
        });

    } catch (err) {
        console.error('Erro ao carregar níveis:', err);
        // Fallback básico
        selectNivel.innerHTML += '<option value="Administrador">Administrador</option><option value="Usuario">Usuário</option>';
    }
}

async function carregarUsuarios() {
    const tbody = document.getElementById('corpoTabelaUsuarios');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';

    try {
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        renderTable(data);
    } catch (err) {
        console.error('Erro ao carregar usuários:', err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

function renderTable(usuarios) {
    const tbody = document.getElementById('corpoTabelaUsuarios');
    tbody.innerHTML = '';

    if (usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum usuário encontrado.</td></tr>';
        return;
    }

    usuarios.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.id}</td>
            <td>${u.nome}</td>
            <td>${u.nomecompleto || u.nome_completo || '-'}</td>
            <td>${u.email || '-'}</td>
            <td>${u.nivel || '-'}</td>
            <td>${u.filial || 'Todas'}</td>
            <td>
                <button class="btn-icon edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;

        // Eventos dos botões
        tr.querySelector('.edit').addEventListener('click', () => editarUsuario(u));
        tr.querySelector('.delete').addEventListener('click', () => excluirUsuario(u.id));

        tbody.appendChild(tr);
    });
}

async function salvarUsuario(e) {
    e.preventDefault();
    
    const id = document.getElementById('usuarioId').value;
    const nome = document.getElementById('nome').value;
    const nomecompleto = document.getElementById('nomecompleto').value;
    const email = document.getElementById('email').value;
    const nivel = document.getElementById('nivel').value;
    const filial = document.getElementById('filial').value;
    const senha = document.getElementById('senha').value;

    const usuarioData = {
        nome,
        nomecompleto, // ou nome_completo dependendo do banco, ajustando conforme necessidade
        email,
        nivel,
        filial: filial || null
    };

    // Só envia a senha se ela foi preenchida (para update) ou se é novo cadastro
    if (senha) {
        usuarioData.senha = senha;
    }

    try {
        let error;
        if (id) {
            // Update
            const response = await supabaseClient.from('usuarios').update(usuarioData).eq('id', id);
            error = response.error;
        } else {
            // Insert
            if (!senha) return alert('Senha é obrigatória para novos usuários.');
            const response = await supabaseClient.from('usuarios').insert([usuarioData]);
            error = response.error;
        }

        if (error) throw error;

        alert('Usuário salvo com sucesso!');
        document.getElementById('btnCancelar').click(); // Volta para a lista
        carregarUsuarios();

    } catch (err) {
        console.error('Erro ao salvar usuário:', err);
        alert('Erro ao salvar: ' + err.message);
    }
}

function editarUsuario(usuario) {
    document.getElementById('usuarioId').value = usuario.id;
    document.getElementById('nome').value = usuario.nome;
    document.getElementById('nomecompleto').value = usuario.nomecompleto || usuario.nome_completo || '';
    document.getElementById('email').value = usuario.email || '';
    document.getElementById('nivel').value = usuario.nivel;
    document.getElementById('filial').value = usuario.filial || '';
    document.getElementById('senha').value = ''; // Senha fica vazia para não alterar

    document.getElementById('cadastro').classList.remove('hidden');
    document.getElementById('busca').classList.add('hidden');
}

async function excluirUsuario(id) {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

    try {
        const { error } = await supabaseClient.from('usuarios').delete().eq('id', id);
        if (error) throw error;
        
        alert('Usuário excluído com sucesso!');
        carregarUsuarios();
    } catch (err) {
        console.error('Erro ao excluir:', err);
        alert('Erro ao excluir: ' + err.message);
    }
}

function limparFormulario() {
    document.getElementById('formUsuario').reset();
    document.getElementById('usuarioId').value = '';
}