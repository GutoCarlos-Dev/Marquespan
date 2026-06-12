import { supabaseClient } from './supabase.js';

const DIARIA_NIVEIS_PERMITIDOS = new Set([
  'administrador',
  'gerencia',
  'lider_balanca'
]);

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
            .select('id, auth_user_id, nome, nomecompleto, email, nivel, filial, status, status_updated_at')
            .eq('id', usuario.id)
            .single();

          if (!error && dadosAtualizados) {
            const nomeCompleto = dadosAtualizados.nomecompleto;
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

      // Presença online — anuncia o usuário no canal compartilhado
      if (usuario?.id) {
        // Canal de presença (apenas para rastrear quem está online)
        const canalPresenca = supabaseClient.channel('presenca_usuarios', {
          config: { presence: { key: String(usuario.id) } }
        });
        canalPresenca.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await canalPresenca.track({
              user_id:   usuario.id,
              nome:      usuario.nome || 'Usuário',
              filial:    usuario.filial || '',
              pagina:    window.location.pathname.split('/').pop() || 'dashboard.html',
              entrou_em: new Date().toISOString()
            });
          }
        });

        // Canal dedicado exclusivamente para sinais do admin (força logout, etc.)
        const canalSinais = supabaseClient.channel('sinais_admin');
        canalSinais
          .on('broadcast', { event: 'force_logout' }, async ({ payload }) => {
            if (String(payload?.user_id) !== String(usuario.id)) return;

            // Confirma ao admin que o logout foi recebido
            canalSinais.send({
              type: 'broadcast',
              event: 'logout_confirmado',
              payload: { nome: usuario.nome }
            });

            await supabaseClient.auth.signOut();
            localStorage.removeItem('usuarioLogado');
            localStorage.removeItem('marquespan_auth_version');
            window.location.href = 'index.html';
          })
          .subscribe();
      }

      // Adiciona funcionalidade de toggle para os submenus
      const linkSair = document.querySelector('#sidebar a[href="index.html"]');
      linkSair?.addEventListener('click', async event => {
        event.preventDefault();
        await supabaseClient.auth.signOut();
        localStorage.removeItem('usuarioLogado');
        localStorage.removeItem('marquespan_auth_version');
        localStorage.removeItem('marquespan_ultima_atividade');
        window.location.href = 'index.html';
      });

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

  const nivel = String(usuario.nivel || '').trim().toLowerCase();
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

    const paginasPermitidas = data ? [...(data.paginas_permitidas || [])] : [];
    // Adiciona dashboard e index como páginas sempre permitidas
    paginasPermitidas.push('dashboard.html', 'index.html');
    const diariaIndex = paginasPermitidas.indexOf('diaria.html');
    if (!DIARIA_NIVEIS_PERMITIDOS.has(nivel) && diariaIndex >= 0) {
      paginasPermitidas.splice(diariaIndex, 1);
    } else if (DIARIA_NIVEIS_PERMITIDOS.has(nivel) && diariaIndex < 0) {
      paginasPermitidas.push('diaria.html');
    }

    nav.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href');
      if (paginasPermitidas.includes(href)) {
        link.style.display = 'block';
        // Mostra todos os grupos pais do link, incluindo menus aninhados.
        let parent = link.parentElement;
        while (parent && parent !== nav) {
          if (parent.classList?.contains('menu-group')) parent.style.display = 'block';
          parent = parent.parentElement;
        }
      }
    });
  } catch (error) {
    console.error('Erro ao buscar permissões do menu:', error);
    // Em caso de erro, mostra apenas o link do dashboard para segurança
    const dashboardLink = nav.querySelector('a[href="dashboard.html"]');
    if (dashboardLink) dashboardLink.style.display = 'block';
  }
}
