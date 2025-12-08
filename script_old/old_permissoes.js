let PAGINAS_SISTEMA = [];

let nivelSelecionado = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Proteção de página: apenas administradores podem ver
    const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuario || usuario.nivel.toLowerCase() !== 'administrador') {
        document.body.innerHTML = '<div style="text-align: center; padding: 50px;"><h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta página.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
        return;
    }

    await carregarPaginasDisponiveis();
    await carregarNiveis();

    document.getElementById('btnSalvarPermissoes').addEventListener('click', salvarPermissoes);
    document.getElementById('marcar-todos').addEventListener('change', marcarDesmarcarTodos);
});

/**
 * Carrega dinamicamente as páginas disponíveis a partir do menu.html.
 */
async function carregarPaginasDisponiveis() {
    try {
        const response = await fetch('menu.html');
        const menuHtml = await response.text();
        const parser = new DOMParser();
        const menuDoc = parser.parseFromString(menuHtml, 'text/html');
        
        const links = menuDoc.querySelectorAll('nav a');
        const paginasUnicas = new Map();

        links.forEach(link => {
            const href = link.getAttribute('href');
            // Usa o texto do span, ou o texto do link como fallback
            const nome = link.querySelector('span')?.textContent.trim() || link.textContent.trim();
            if (href && href !== '#' && !paginasUnicas.has(href)) {
                paginasUnicas.set(href, { id: href, nome: nome });
            }
        });

        PAGINAS_SISTEMA = Array.from(paginasUnicas.values());
    } catch (error) {
        console.error("Erro ao carregar páginas do menu:", error);
        alert("Não foi possível carregar a lista de páginas do sistema.");
    }
}

async function carregarNiveis() {
    const listaNiveisEl = document.getElementById('lista-niveis');
    listaNiveisEl.innerHTML = '<li class="loading-state">Carregando...</li>';

    const { data, error } = await supabaseClient
        .from('usuarios')
        .select('nivel');

    if (error) {
        listaNiveisEl.innerHTML = '<li class="loading-state">Erro ao carregar níveis</li>';
        console.error(error);
        return;
    }

    const niveisUnicos = [...new Set(data.map(u => u.nivel.toLowerCase()))].sort();
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
            <input type="checkbox" id="chk-${pagina.id}" data-pagina-id="${pagina.id}" class="custom-checkbox">
            <label for="chk-${pagina.id}" class="checkbox-label">${pagina.nome}</label>
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
    renderizarGridPaginas(); // Renderiza o grid de páginas após selecionar o nível

    // Limpa todos os checkboxes
    document.querySelectorAll('#grid-paginas input[type="checkbox"]').forEach(chk => chk.checked = false);
    document.getElementById('marcar-todos').checked = false; // Desmarca o master checkbox por padrão

    if (nivel.toLowerCase() === 'administrador') {
        // Para o administrador, marca todas as páginas por padrão
        document.querySelectorAll('#grid-paginas input[type="checkbox"]').forEach(chk => chk.checked = true);
        document.getElementById('marcar-todos').checked = true; // Marca o master checkbox
    } else {
        // Para outros níveis, busca e marca as permissões salvas no banco
        const { data, error } = await supabaseClient
            .from('nivel_permissoes')
            .select('paginas_permitidas')
            .eq('nivel', nivel.toLowerCase())
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
        // Verifica se todos os checkboxes estão marcados para atualizar o master checkbox
        const allCheckboxes = document.querySelectorAll('#grid-paginas input[type="checkbox"]');
        const allChecked = Array.from(allCheckboxes).every(chk => chk.checked);
        document.getElementById('marcar-todos').checked = allChecked;
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

    const { error } = await supabaseClient
        .from('nivel_permissoes')
        .upsert(
            { nivel: nivelSelecionado.toLowerCase(), paginas_permitidas: paginasPermitidas },
            { onConflict: 'nivel' } // Garante que ele atualize se o nível já existir, ou crie se for novo.
        );

    if (error) {
        alert('❌ Erro ao salvar permissões.');
        console.error(error);
    } else {
        alert('✅ Permissões salvas com sucesso!');
    }
}

function marcarDesmarcarTodos(event) {
    const isChecked = event.target.checked;
    const checkboxes = document.querySelectorAll('#grid-paginas input[type="checkbox"]');
    checkboxes.forEach(chk => {
        chk.checked = isChecked;
    });
}