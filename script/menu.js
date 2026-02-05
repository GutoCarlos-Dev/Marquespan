import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', function() {
  // Carregar o menu
  fetch('menu.html')
    .then(response => response.text())
    .then(async data => {
      // Correção: Inserir no container específico em vez do body
      const menuContainer = document.getElementById('menu-container');
      if (menuContainer) {
        menuContainer.innerHTML = data;
      } else {
        document.body.insertAdjacentHTML('afterbegin', data);
      }
 
      // Inicializar funcionalidades do menu após carregamento
      let usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
      const divUsuario = document.getElementById('usuario-logado');

      // 1. Exibe o nome atual do cache imediatamente (para não ficar vazio enquanto carrega)
      if (usuario && usuario.nome) {
        divUsuario.textContent = `👤 Olá, ${usuario.nome}`;
      }

      // 2. Busca dados atualizados do banco para garantir Nome Completo e permissões
      if (usuario && usuario.id) {
        try {
          const { data: dadosAtualizados, error } = await supabaseClient
            .from('usuarios')
            .select('*')
            .eq('id', usuario.id)
            .single();

          if (!error && dadosAtualizados) {
            const nomeCompleto = dadosAtualizados.nomecompleto || dadosAtualizados.nome_completo;
            // Atualiza objeto local com dados do banco
            usuario = { ...usuario, ...dadosAtualizados };
            
            if (nomeCompleto) {
              usuario.usuario_login = usuario.usuario_login || usuario.nome; // Preserva login original
              usuario.nome = nomeCompleto; // Usa Nome Completo para exibição
            }
            
            localStorage.setItem('usuarioLogado', JSON.stringify(usuario));
            
            // Atualiza a exibição com o nome novo
            if (divUsuario) divUsuario.textContent = `👤 Olá, ${usuario.nome}`;
          }
        } catch (err) {
          console.error('Erro ao atualizar dados do usuário:', err);
        }
      }

      // Controlar visibilidade do menu baseado no nível do usuário
      // A verificação de `usuario` já acontece dentro da função
      controlarMenuPorNivel();

      // Adiciona funcionalidade de toggle para os submenus

      document.querySelectorAll('.menu-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          btn.parentElement.classList.toggle('active');
        });
      });
    })
    .catch(error => console.error('Erro ao carregar o menu:', error));
});

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.querySelector('.toggle-btn');

  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
    // Fechar sidebar quando clicar fora dela no mobile
    if (!sidebar.classList.contains('mobile-open')) {
      document.addEventListener('click', closeSidebarOnClickOutside);
    } else {
      document.removeEventListener('click', closeSidebarOnClickOutside);
    }
  } else {
    sidebar.classList.toggle('collapsed');
  }
}
window.toggleSidebar = toggleSidebar;

function closeSidebarOnClickOutside(event) {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.querySelector('.toggle-btn');

  if (!sidebar.contains(event.target) && !toggleBtn.contains(event.target)) {
    sidebar.classList.remove('mobile-open');
    document.removeEventListener('click', closeSidebarOnClickOutside);
  }
}

async function controlarMenuPorNivel() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const nav = sidebar.querySelector('nav');
  if (!nav) return;

  const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
  if (!usuario || !usuario.nivel) {
    // Se não houver usuário ou nível, esconde tudo exceto o link de login/logout
    nav.querySelectorAll('a, .menu-group').forEach(el => {
      if (el.getAttribute('href') !== 'index.html') {
        el.style.display = 'none';
      }
    });
    return;
  }

  const nivel = usuario.nivel.toLowerCase();
  const allMenuItems = nav.querySelectorAll('a, .menu-group');
  allMenuItems.forEach(el => el.style.display = 'none'); // Esconde tudo por padrão

  // Administrador sempre vê tudo
  if (nivel === 'administrador') {
    allMenuItems.forEach(el => el.style.display = 'block');
    return;
  }

  // Para outros níveis, busca as permissões no banco de dados
  try {
    const { data, error } = await supabaseClient
      .from('nivel_permissoes')
      .select('paginas_permitidas')
      .eq('nivel', nivel)
      .single();

    if (error) throw error;

    const paginasPermitidas = data ? data.paginas_permitidas || [] : [];
    // Adiciona dashboard e index como páginas sempre permitidas
    paginasPermitidas.push('dashboard.html', 'index.html');

    nav.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href');
      if (paginasPermitidas.includes(href)) {
        link.style.display = 'block';
        // Mostra o grupo pai do link, se houver
        const parentGroup = link.closest('.menu-group');
        if (parentGroup) parentGroup.style.display = 'block';
      }
    });
  } catch (error) {
    console.error('Erro ao buscar permissões do menu:', error);
    // Em caso de erro, mostra apenas o link do dashboard para segurança
    const dashboardLink = nav.querySelector('a[href="dashboard.html"]');
    if (dashboardLink) dashboardLink.style.display = 'block';
  }
}
