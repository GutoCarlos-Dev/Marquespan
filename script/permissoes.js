import { supabaseClient } from './supabase.js';
import { registrarAuditoria } from './auditoria-utils.js';

let PAGINAS_SISTEMA = [];

let nivelSelecionado = null;
let niveisAtuais = []; // Armazena os níveis carregados para verificação

document.addEventListener('DOMContentLoaded', async () => {
    // Proteção de página: apenas administradores podem ver
    const acessoPermitido = await verificarAdministradorAtual();
    if (!acessoPermitido) {
        mostrarAcessoNegado();
        return;
    }

    await carregarPaginasDisponiveis();
    await carregarNiveis();

    document.getElementById('btnSalvarPermissoes').addEventListener('click', salvarPermissoes);
    document.getElementById('marcar-todos').addEventListener('change', marcarDesmarcarTodos);
    document.getElementById('btn-adicionar-nivel').addEventListener('click', adicionarNovoNivel);
});

async function verificarAdministradorAtual() {
    const {
        data: { session },
        error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session?.user?.id) {
        return false;
    }

    const { data, error } = await supabaseClient
        .from('usuarios')
        .select('nivel, status')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

    if (error || !data) {
        console.error('Erro ao validar administrador:', error);
        return false;
    }

    return String(data.status || 'ATIVO').toUpperCase() !== 'INATIVO'
        && String(data.nivel || '').toLowerCase() === 'administrador';
}

function mostrarAcessoNegado() {
    document.body.innerHTML = '<div style="text-align: center; padding: 50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
}

function normalizarPaginaId(valor) {
    const pagina = String(valor || '').trim();
    return /^[a-z0-9._/-]+\.html$/i.test(pagina) ? pagina : '';
}

function normalizarNivel(valor) {
    const nivel = String(valor || '').trim().toLowerCase();
    return /^[a-z0-9_ -]{2,40}$/.test(nivel) ? nivel : '';
}

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
            const href = normalizarPaginaId(link.getAttribute('href'));
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
        .from('nivel_permissoes') // <<< MUDANÇA AQUI
        .select('nivel'); // Busca da tabela correta

    if (error) {
        listaNiveisEl.innerHTML = '<li class="loading-state">Erro ao carregar níveis</li>';
        console.error(error);
        return;
    }

    niveisAtuais = [...new Set(data.map(u => normalizarNivel(u.nivel)).filter(Boolean))].sort();
    listaNiveisEl.innerHTML = '';

    niveisAtuais.forEach(nivel => {
        const li = document.createElement('li');
        li.dataset.nivel = nivel;
        li.addEventListener('click', () => selecionarNivel(nivel));

        const nomeNivel = document.createElement('span');
        nomeNivel.className = 'nivel-nome';
        nomeNivel.textContent = nivel;
        li.appendChild(nomeNivel);

        if (nivel !== 'administrador') {
            const acoes = document.createElement('div');
            acoes.className = 'nivel-acoes';

            const btnRenomear = document.createElement('button');
            btnRenomear.type = 'button';
            btnRenomear.className = 'btn-nivel-acao';
            btnRenomear.title = 'Renomear nivel';
            btnRenomear.innerHTML = '<i class="fas fa-pen"></i>';
            btnRenomear.addEventListener('click', (event) => {
                event.stopPropagation();
                renomearNivel(nivel);
            });

            const btnExcluir = document.createElement('button');
            btnExcluir.type = 'button';
            btnExcluir.className = 'btn-nivel-acao btn-nivel-excluir';
            btnExcluir.title = 'Excluir nivel';
            btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
            btnExcluir.addEventListener('click', (event) => {
                event.stopPropagation();
                excluirNivel(nivel);
            });

            acoes.appendChild(btnRenomear);
            acoes.appendChild(btnExcluir);
            li.appendChild(acoes);
        }

        listaNiveisEl.appendChild(li);
    });

    // Seleciona o primeiro nível por padrão
    if (niveisAtuais.length > 0 && !nivelSelecionado) {
        selecionarNivel(niveisAtuais[0]);
    }
}

function renderizarGridPaginas() {
    const gridPaginasEl = document.getElementById('grid-paginas');
    gridPaginasEl.innerHTML = '';
    
    PAGINAS_SISTEMA.forEach(pagina => {
        const item = document.createElement('div');
        item.className = 'pagina-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `chk-${pagina.id}`;
        checkbox.dataset.paginaId = pagina.id;
        checkbox.className = 'custom-checkbox';

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.className = 'checkbox-label';
        label.textContent = pagina.nome;

        item.appendChild(checkbox);
        item.appendChild(label);
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
            .eq('nivel', nivel.toLowerCase());

        if (error) {
            console.error('Erro ao buscar permissões:', error);
            return;
        }
        if (data && data.length > 0 && data[0].paginas_permitidas) {
            data[0].paginas_permitidas.forEach(paginaId => {
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
        registrarAuditoria('ALTERAR', 'Permissões', `Atualização de permissões do nível: ${nivelSelecionado}`);
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

/**
 * Adiciona um novo nível de usuário.
 */
async function adicionarNovoNivel() {
    const input = document.getElementById('novo-nivel-input');
    const novoNivel = normalizarNivel(input.value);

    if (!novoNivel) {
        alert('Por favor, digite o nome do novo nível.');
        return;
    }

    // Verifica se o nível já existe (case-insensitive)
    if (niveisAtuais.includes(novoNivel)) {
        alert(`O nível "${novoNivel}" já existe.`);
        return;
    }

    // Insere o novo nível na tabela de permissões com uma lista de páginas vazia.
    // Isso garante que o nível exista para futuras configurações.
    const { error } = await supabaseClient
        .from('nivel_permissoes')
        .insert({ nivel: novoNivel, paginas_permitidas: [] });

    if (error) {
        alert('❌ Erro ao criar o novo nível.');
        console.error('Erro ao adicionar nível:', error);
    } else {
        registrarAuditoria('INCLUIR', 'Permissões', `Criação do novo nível de acesso: ${novoNivel}`);
        alert('✅ Nível adicionado com sucesso!');
        input.value = ''; // Limpa o campo
        
        // Adiciona o novo nível à lista e a re-renderiza
        niveisAtuais.push(novoNivel);
        niveisAtuais.sort();
        await carregarNiveis(); // Recarrega a lista para manter a ordem e os eventos
        selecionarNivel(novoNivel); // Seleciona o nível recém-criado
    }
}

async function renomearNivel(nivelAtual) {
    if (nivelAtual === 'administrador') {
        alert('O nivel administrador nao pode ser renomeado.');
        return;
    }

    const novoNivel = normalizarNivel(prompt('Digite o novo nome do nivel:', nivelAtual));

    if (!novoNivel) {
        alert('Nome de nivel invalido.');
        return;
    }

    if (novoNivel === nivelAtual) return;

    if (novoNivel === 'administrador' || niveisAtuais.includes(novoNivel)) {
        alert(`O nivel "${novoNivel}" ja existe ou e reservado.`);
        return;
    }

    if (!confirm(`Renomear "${nivelAtual}" para "${novoNivel}"? Os usuarios desse nivel tambem serao atualizados.`)) {
        return;
    }

    const { error: permissaoError } = await supabaseClient
        .from('nivel_permissoes')
        .update({ nivel: novoNivel })
        .eq('nivel', nivelAtual);

    if (permissaoError) {
        alert('Erro ao renomear o nivel.');
        console.error('Erro ao renomear nivel:', permissaoError);
        return;
    }

    const { error: usuariosError } = await supabaseClient
        .from('usuarios')
        .update({ nivel: novoNivel })
        .eq('nivel', nivelAtual);

    if (usuariosError) {
        console.error('Erro ao atualizar usuarios do nivel renomeado:', usuariosError);
        await supabaseClient
            .from('nivel_permissoes')
            .update({ nivel: nivelAtual })
            .eq('nivel', novoNivel);
        alert('O nivel nao foi renomeado porque nao foi possivel atualizar os usuarios vinculados.');
        return;
    }

    registrarAuditoria('ALTERAR', 'Permissões', `Renomeacao do nivel de acesso: ${nivelAtual} para ${novoNivel}`);
    nivelSelecionado = novoNivel;
    await carregarNiveis();
    await selecionarNivel(novoNivel);
    alert('Nivel renomeado com sucesso!');
}

async function excluirNivel(nivel) {
    if (nivel === 'administrador') {
        alert('O nivel administrador nao pode ser excluido.');
        return;
    }

    const { count, error: countError } = await supabaseClient
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('nivel', nivel);

    if (countError) {
        alert('Erro ao verificar usuarios vinculados a este nivel.');
        console.error('Erro ao verificar usuarios do nivel:', countError);
        return;
    }

    if ((count || 0) > 0) {
        alert(`Nao e possivel excluir este nivel porque existem ${count} usuario(s) usando ele. Altere esses usuarios para outro nivel primeiro.`);
        return;
    }

    if (!confirm(`Excluir definitivamente o nivel "${nivel}"?`)) {
        return;
    }

    const { error } = await supabaseClient
        .from('nivel_permissoes')
        .delete()
        .eq('nivel', nivel);

    if (error) {
        alert('Erro ao excluir o nivel.');
        console.error('Erro ao excluir nivel:', error);
        return;
    }

    registrarAuditoria('EXCLUIR', 'Permissões', `Exclusao do nivel de acesso: ${nivel}`);
    nivelSelecionado = null;
    await carregarNiveis();
    alert('Nivel excluido com sucesso!');
}
