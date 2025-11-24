import { supabase } from './supabase.js';

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

async function controlarMenuPorNivel(nivel) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const nav = sidebar.querySelector('nav');
  if (!nav) return;

  const allLinks = nav.querySelectorAll('a');
  const allGroups = nav.querySelectorAll('.menu-group');

  // Esconde tudo por padrão
  allLinks.forEach(link => link.style.display = 'none');
  allGroups.forEach(group => group.style.display = 'none');

  const nivelAtual = nivel.toLowerCase();

  // Busca as permissões do banco de dados
  const { data, error } = await supabase.from('nivel_permissoes').select('paginas_permitidas', { count: 'exact' }).eq('nivel', nivelAtual).single();
  if (error && error.code !== 'PGRST116') { console.error('Erro ao buscar permissões do menu:', error); return; }
  const paginasPermitidas = data ? data.paginas_permitidas : [];
  paginasPermitidas.forEach(paginaHref => {
    const link = nav.querySelector(`a[href="${paginaHref}"]`);
    if (link) {
      link.style.display = 'block';
      const parentGroup = link.closest('.menu-group');
      if (parentGroup) parentGroup.style.display = 'block';
    }
  });
}
