import { supabase } from './supabase.js';

// Lista de todas as páginas disponíveis no sistema
const PAGINAS_SISTEMA = [
    { id: 'dashboard.html', nome: 'Dashboard' },
    { id: 'veiculos.html', nome: 'Veículos' },
    { id: 'incluir-manutencao.html', nome: 'Incluir Manutenção' },
    { id: 'buscar-manutencao.html', nome: 'Buscar Manutenção' },
    { id: 'usuarios.html', nome: 'Usuários' },
    { id: 'cadastro-carregamento.html', nome: 'Cadastro Carregamento' },
    { id: 'iniciar-carregamento.html', nome: 'Iniciar Carregamento' },
    { id: 'importar-xlsx.html', nome: 'Importar XLSX' },
    { id: 'buscar-carregamento.html', nome: 'Buscar Carregamento' },
    { id: 'estoque-pneus.html', nome: 'Estoque de Pneus' },
    { id: 'estoque_geral.html', nome: 'Estoque Geral' },
    { id: 'compras.html', nome: 'Compras' },
    { id: 'permissoes.html', nome: 'Configurar Permissões' },
    { id: 'index.html', nome: 'Sair (Login)' }
];

let nivelSelecionado = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Proteção de página: apenas administradores podem ver
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario || usuario.nivel.toLowerCase() !== 'administrador') {
        document.body.innerHTML = '<div style="text-align: center; padding: 50px;"><h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta página.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
        return;
    }

    await carregarNiveis();
    renderizarGridPaginas();

    document.getElementById('btnSalvarPermissoes').addEventListener('click', salvarPermissoes);
});

async function carregarNiveis() {
    const listaNiveisEl = document.getElementById('lista-niveis');
    listaNiveisEl.innerHTML = '<li>Carregando...</li>';

    const { data, error } = await supabase
        .from('usuarios')
        .select('nivel');

    if (error) {
        listaNiveisEl.innerHTML = '<li>Erro ao carregar níveis</li>';
        console.error(error);
        return;
    }

    const niveisUnicos = [...new Set(data.map(u => u.nivel))].sort();
    listaNiveisEl.innerHTML = '';

    niveisUnicos.forEach(nivel => {
        const li = document.createElement('li');
        li.textContent = nivel;
        li.dataset.nivel = nivel;
        li.addEventListener('click', () => selecionarNivel(nivel));
        listaNiveisEl.appendChild(li);
    });

    // Seleciona o primeiro nível por padrão
    if (niveisUnicos.length > 0) {
        selecionarNivel(niveisUnicos[0]);
    }
}

function renderizarGridPaginas() {
    const gridPaginasEl = document.getElementById('grid-paginas');
    gridPaginasEl.innerHTML = '';

    PAGINAS_SISTEMA.forEach(pagina => {
        const item = document.createElement('div');
        item.className = 'pagina-item';
        item.innerHTML = `
            <input type="checkbox" id="chk-${pagina.id}" data-pagina-id="${pagina.id}">
            <label for="chk-${pagina.id}">${pagina.nome}</label>
        `;
        gridPaginasEl.appendChild(item);
    });
}

async function selecionarNivel(nivel) {
    nivelSelecionado = nivel;

    // Destaca o nível selecionado na lista
    document.querySelectorAll('#lista-niveis li').forEach(li => {
        li.classList.toggle('active', li.dataset.nivel === nivel);
    });

    document.getElementById('nivel-selecionado').textContent = nivel;

    // Limpa todos os checkboxes
    document.querySelectorAll('#grid-paginas input[type="checkbox"]').forEach(chk => chk.checked = false);

    // Busca e marca as permissões atuais
    const { data, error } = await supabase
        .from('nivel_permissoes')
        .select('paginas_permitidas')
        .eq('nivel', nivel)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: no rows found
        console.error('Erro ao buscar permissões:', error);
        return;
    }

    if (data && data.paginas_permitidas) {
        data.paginas_permitidas.forEach(paginaId => {
            const chk = document.getElementById(`chk-${paginaId}`);
            if (chk) chk.checked = true;
        });
    }
}

async function salvarPermissoes() {
    if (!nivelSelecionado) {
        alert('Selecione um nível para configurar.');
        return;
    }

    const paginasPermitidas = [];
    document.querySelectorAll('#grid-paginas input[type="checkbox"]:checked').forEach(chk => {
        paginasPermitidas.push(chk.dataset.paginaId);
    });

    const { error } = await supabase
        .from('nivel_permissoes')
        .upsert({ nivel: nivelSelecionado, paginas_permitidas: paginasPermitidas });

    if (error) {
        alert('❌ Erro ao salvar permissões.');
        console.error(error);
    } else {
        alert('✅ Permissões salvas com sucesso!');
    }
}