document.addEventListener('DOMContentLoaded', function() {
  // Carregar o menu
  fetch('menu.html')
    .then(response => response.text())
    .then(data => {
      document.body.insertAdjacentHTML('afterbegin', data);

      // Inicializar funcionalidades do menu após carregamento
      const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
      const divUsuario = document.getElementById('usuario-logado');
      if (usuario && usuario.nome) {
        divUsuario.textContent = `👤 Olá, ${usuario.nome}`;
      }

      // Controlar visibilidade do menu baseado no nível do usuário
      if (usuario && usuario.nivel) {
        controlarMenuPorNivel(usuario.nivel);
      }

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

function closeSidebarOnClickOutside(event) {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.querySelector('.toggle-btn');

  if (!sidebar.contains(event.target) && !toggleBtn.contains(event.target)) {
    sidebar.classList.remove('mobile-open');
    document.removeEventListener('click', closeSidebarOnClickOutside);
  }
}

function controlarMenuPorNivel(nivel) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const nav = sidebar.querySelector('nav');
  if (!nav) return;

  const allLinks = nav.querySelectorAll('a, .menu-group');
  allLinks.forEach(el => el.style.display = 'none'); // Esconde tudo por padrão

  // Links que todos os usuários veem
  const linksComuns = ['a[href="dashboard.html"]', 'a[href="index.html"]'];
  linksComuns.forEach(sel => {
    const el = nav.querySelector(sel);
    if (el) el.style.display = 'block';
  });

  const nivelAtual = nivel.toLowerCase();

  // Lógica de permissão hardcoded
  switch (nivelAtual) {
    case 'administrador':
      // Mostra todos os links e grupos
      allLinks.forEach(el => el.style.display = 'block');
      break;

    case 'estoque':
      // Mostra os grupos de Estoque e Compras
      const grupoEstoque = nav.querySelector('.menu-group:has(a[href="estoque_geral.html"])');
      if (grupoEstoque) {
        grupoEstoque.style.display = 'block';
        grupoEstoque.querySelectorAll('a').forEach(link => link.style.display = 'block');
      }
      const grupoComprasEstoque = nav.querySelector('.menu-group:has(a[href="compras.html"])');
      if (grupoComprasEstoque) {
        grupoComprasEstoque.style.display = 'block';
        grupoComprasEstoque.querySelectorAll('a').forEach(link => link.style.display = 'block');
      }
      break;

    case 'compras':
      // Mostra apenas o grupo de Compras
      const grupoCompras = nav.querySelector('.menu-group:has(a[href="compras.html"])');
      if (grupoCompras) {
        grupoCompras.style.display = 'block';
        grupoCompras.querySelectorAll('a').forEach(link => link.style.display = 'block');
      }
      break;

    // Outros níveis não veem menus específicos por padrão
  }
}
