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

  // Esconder todos os links inicialmente
  const allLinks = nav.querySelectorAll('a');
  allLinks.forEach(link => link.style.display = 'none');

  // Esconder todos os grupos de menu
  const allGroups = nav.querySelectorAll('.menu-group');
  allGroups.forEach(group => group.style.display = 'none');

  // Define quais links e grupos cada perfil pode ver.
  const permissoes = {
    estoque: [
      'a[href="dashboard.html"]',
      'a[href="estoque-pneus.html"]',
      'a[href="estoque_geral.html"]',
      'a[href="compras.html"]', // O próprio scriptcompras.js já limita as abas internas
      'a[href="index.html"]'
    ],
    compras: [
      'a[href="dashboard.html"]',
      'a[href="compras.html"]',
      'a[href="index.html"]'
    ],
    administrador: 'all', // Administrador pode ver tudo
    default: [
      'a[href="dashboard.html"]',
      'a[href="index.html"]'
    ]
  };

  const nivelAtual = nivel.toLowerCase();
  const linksPermitidos = permissoes[nivelAtual] || permissoes.default;

  if (linksPermitidos === 'all') {
    // Administrador vê tudo
    allLinks.forEach(link => link.style.display = 'block');
    allGroups.forEach(group => group.style.display = 'block');
  } else {
    // Outros perfis
    linksPermitidos.forEach(seletor => {
      const link = nav.querySelector(seletor);
      if (link) {
        link.style.display = 'block';
        // Se o link estiver dentro de um grupo, mostra o grupo
        const parentGroup = link.closest('.menu-group');
        if (parentGroup) parentGroup.style.display = 'block';
      }
    });
  }
}
