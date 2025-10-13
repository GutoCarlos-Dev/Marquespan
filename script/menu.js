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
