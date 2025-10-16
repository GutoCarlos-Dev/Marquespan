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
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

function controlarMenuPorNivel(nivel) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const nav = sidebar.querySelector('nav');
  if (!nav) return;

  // Esconder todos os links inicialmente
  const allLinks = nav.querySelectorAll('a');
  allLinks.forEach(link => link.style.display = 'none');

  // Esconder todos os grupos de menu
  const allGroups = nav.querySelectorAll('.menu-group');
  allGroups.forEach(group => group.style.display = 'none');

  // Mostrar links baseado no nível
  switch (nivel.toLowerCase()) {
    case 'estoque':
      // Mostrar Dashboard, submenu de Pneus (apenas Movimentação) e Sair
      const dashboardLink = nav.querySelector('a[href="dashboard.html"]');
      if (dashboardLink) dashboardLink.style.display = 'block';

      const pneusGroup = nav.querySelector('.menu-group:has(a[href="estoque-pneus.html"])');
      if (pneusGroup) pneusGroup.style.display = 'block';

      // Mostrar apenas Movimentação no submenu de Pneus
      const pneusSubmenu = pneusGroup.querySelectorAll('a');
      pneusSubmenu.forEach(link => {
        if (link.getAttribute('href') === 'pneu.html') {
          link.style.display = 'block';
        } else {
          link.style.display = 'none';
        }
      });

      // Mostrar link de Sair
      const sairLink = nav.querySelector('a[href="index.html"]');
      if (sairLink) sairLink.style.display = 'block';
      break;

    case 'administrador':
      // Mostrar tudo
      allLinks.forEach(link => link.style.display = 'block');
      allGroups.forEach(group => group.style.display = 'block');
      break;

    // Adicionar outros níveis conforme necessário
    default:
      // Para outros níveis, mostrar apenas dashboard e sair
      const defaultDashboard = nav.querySelector('a[href="dashboard.html"]');
      if (defaultDashboard) defaultDashboard.style.display = 'block';

      const defaultSair = nav.querySelector('a[href="index.html"]');
      if (defaultSair) defaultSair.style.display = 'block';
      break;
  }
}
