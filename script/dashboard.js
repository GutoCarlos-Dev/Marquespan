import { supabaseClient } from './supabase.js';

// ─── Mapa completo do menu → atalhos do dashboard ────────────────────────────
const MODULOS = [
  {
    grupo: 'Administração', cor: 'dark',
    itens: [
      { label: 'Usuários',    desc: 'Gestão de usuários',     pagina: 'usuarios.html',    icon: 'fa-users' },
      { label: 'Permissões',  desc: 'Controle de acesso',     pagina: 'permissoes.html',  icon: 'fa-key' },
      { label: 'Filiais',     desc: 'Cadastro de filiais',    pagina: 'filiais.html',     icon: 'fa-building' },
    ]
  },
  {
    grupo: 'Abastecimentos', cor: 'blue',
    itens: [
      { label: 'Registrar Abastecimento', desc: 'Lançar abastecimento',    pagina: 'abastecimento.html',                        icon: 'fa-gas-pump' },
      { label: 'Cadastrar Tanque',        desc: 'Gestão de tanques',        pagina: 'cadastro-tanque.html',                      icon: 'fa-oil-can' },
      { label: 'Bombas e Bicos',          desc: 'Cadastro de bombas',       pagina: 'cadastro-bombas-bicos.html',                icon: 'fa-plug' },
      { label: 'Leituras da Bomba',       desc: 'Registrar leituras',       pagina: 'leituras-bomba.html',                       icon: 'fa-tachometer-alt' },
      { label: 'Relatório',               desc: 'Histórico e análise',      pagina: 'relatorio-abastecimento.html',              icon: 'fa-chart-line' },
      { label: 'Estoque Combustível',     desc: 'Controle de estoque',      pagina: 'estoque-abastecimento.html',                icon: 'fa-database' },
    ]
  },
  {
    grupo: 'Cadastros', cor: 'gray',
    itens: [
      { label: 'Veículos',     desc: 'Cadastro de frota',        pagina: 'veiculos.html',    icon: 'fa-truck' },
      { label: 'Rotas',        desc: 'Cadastro de rotas',        pagina: 'rotas.html',       icon: 'fa-map-marked-alt' },
      { label: 'Clientes',     desc: 'Cadastro de clientes',     pagina: 'clientes.html',    icon: 'fa-address-book' },
      { label: 'Funcionários', desc: 'Cadastro de equipe',       pagina: 'funcionario.html', icon: 'fa-id-badge' },
      { label: 'Supervisores', desc: 'Cadastro de supervisores', pagina: 'supervisor.html',  icon: 'fa-user-tie' },
      { label: 'Oficinas',     desc: 'Cadastro de oficinas',     pagina: 'oficina.html',     icon: 'fa-hammer' },
      { label: 'Thermoking',   desc: 'Cadastro de thermoking',   pagina: 'thermoking.html',  icon: 'fa-snowflake' },
    ]
  },
  {
    grupo: 'Manutenções', cor: 'green',
    itens: [
      { label: 'Coletar Manutenção',  desc: 'Registrar serviços',      pagina: 'coletar-manutencao.html',  icon: 'fa-clipboard-list' },
      { label: 'Coletar KM',          desc: 'Registrar quilometragem', pagina: 'coletar-KM.html',          icon: 'fa-tachometer-alt' },
      { label: 'Engraxe',             desc: 'Controle de engraxe',     pagina: 'engraxe.html',             icon: 'fa-oil-can' },
      { label: 'Lavagem',             desc: 'Controle de lavagem',     pagina: 'lavagem.html',             icon: 'fa-soap' },
      { label: 'Incluir Manutenção',  desc: 'Nova ordem de serviço',   pagina: 'incluir-manutencao.html',  icon: 'fa-plus-circle' },
      { label: 'Relatório',           desc: 'Buscar manutenções',      pagina: 'buscar-manutencao.html',   icon: 'fa-tools' },
      { label: 'Tacógrafo',           desc: 'Controle de tacógrafo',   pagina: 'tacografo.html',           icon: 'fa-circle-dot' },
    ]
  },
  {
    grupo: 'Real Time', cor: 'cyan',
    itens: [
      { label: 'Manutenção RT',       desc: 'Monitoramento ao vivo',   pagina: 'monitoramento.html',                        icon: 'fa-satellite-dish' },
      { label: 'Serviços RT',         desc: 'Serviços em tempo real',  pagina: 'monitoramento-servicos.html',               icon: 'fa-tower-broadcast' },
      { label: 'Retorno de Rota RT',  desc: 'Acompanhar retornos',     pagina: 'monitoramento-retorno-rota.html',           icon: 'fa-route' },
      { label: 'Abastecimento RT',    desc: 'Abastecimento ao vivo',   pagina: 'monitoramento-abastecimento-interno.html',  icon: 'fa-gas-pump' },
    ]
  },
  {
    grupo: 'Pneus', cor: 'gray',
    itens: [
      { label: 'Entrada de Pneu', desc: 'Registrar entrada', pagina: 'pneu.html',          icon: 'fa-circle-dot' },
      { label: 'Consumo',         desc: 'Controle de consumo', pagina: 'consumo-pneu.html', icon: 'fa-chart-pie' },
      { label: 'Saída de Pneus',  desc: 'Registrar saída',   pagina: 'saidas-pneus.html',  icon: 'fa-right-from-bracket' },
      { label: 'Estoque',         desc: 'Inventário de pneus', pagina: 'estoque-pneus.html', icon: 'fa-warehouse' },
    ]
  },
  {
    grupo: 'Carregamento', cor: 'orange',
    itens: [
      { label: 'Requisição',        desc: 'Novo carregamento',   pagina: 'cadastro-carregamento.html', icon: 'fa-plus' },
      { label: 'Iniciar',           desc: 'Operação de carga',   pagina: 'iniciar-carregamento.html',  icon: 'fa-play' },
      { label: 'Buscar',            desc: 'Consultar registros', pagina: 'buscar-carregamento.html',   icon: 'fa-magnifying-glass' },
    ]
  },
  {
    grupo: 'Organização', cor: 'purple',
    itens: [
      { label: 'Escala',               desc: 'Organização de equipes', pagina: 'escala.html',                    icon: 'fa-calendar-alt' },
      { label: 'Retorno de Rota',      desc: 'Registrar retorno',      pagina: 'retorno-rota.html',              icon: 'fa-rotate-left' },
      { label: 'Peso de Rota',         desc: 'Controle de peso',       pagina: 'peso-rota.html',                 icon: 'fa-weight-hanging' },
      { label: 'Controle de Cadeado',  desc: 'Gestão de cadeados',     pagina: 'controle-cadeado.html',          icon: 'fa-lock' },
      { label: 'Kit Higienização',     desc: 'Controle de kits',       pagina: 'controle-kit-higienizacao.html', icon: 'fa-spray-can-sparkles' },
    ]
  },
  {
    grupo: 'Estoque', cor: 'teal',
    itens: [
      { label: 'Estoque de Pneus', desc: 'Inventário de pneus', pagina: 'estoque-pneus.html',  icon: 'fa-circle-dot' },
      { label: 'Estoque de Peças', desc: 'Almoxarifado geral',  pagina: 'estoque_geral.html',  icon: 'fa-warehouse' },
    ]
  },
  {
    grupo: 'Comodato', cor: 'brown',
    itens: [
      { label: 'Reservar',  desc: 'Nova reserva',       pagina: 'reserva_comodato.html',  icon: 'fa-calendar-check' },
      { label: 'Estoque',   desc: 'Itens em comodato',  pagina: 'estoque_comodato.html',  icon: 'fa-boxes-stacked' },
      { label: 'Buscar',    desc: 'Consultar registros', pagina: 'buscar_comodato.html',   icon: 'fa-magnifying-glass' },
      { label: 'Cadastro',  desc: 'Cadastrar itens',    pagina: 'cadastro_comodato.html', icon: 'fa-plus' },
    ]
  },
  {
    grupo: 'Compras', cor: 'pink',
    itens: [
      { label: 'Cotações e Cadastros', desc: 'Gestão de compras', pagina: 'compras.html', icon: 'fa-shopping-cart' },
    ]
  },
  {
    grupo: 'Hotelaria', cor: 'indigo',
    itens: [
      { label: 'Cadastro de Hotel',      desc: 'Hotéis e convênios',  pagina: 'hotel.html',              icon: 'fa-hotel' },
      { label: 'Lançamento de Despesas', desc: 'Registrar despesas',  pagina: 'despesas.html',            icon: 'fa-receipt' },
      { label: 'Relatório de Despesas',  desc: 'Histórico e análise', pagina: 'relatorio-despesas.html',  icon: 'fa-file-invoice-dollar' },
    ]
  },
  {
    grupo: 'Pedágio', cor: 'indigo',
    itens: [
      { label: 'Gestão de Pedágios',   desc: 'Lançar passagens',    pagina: 'pedagio.html',           icon: 'fa-road' },
      { label: 'Relatório de Pedágios', desc: 'Histórico e análise', pagina: 'relatorio-pedagio.html', icon: 'fa-chart-bar' },
    ]
  },
  {
    grupo: 'Fiscalização', cor: 'red',
    itens: [
      { label: 'Acompanhamento', desc: 'Acompanhamento de rota', pagina: 'fiscalizacao-acompanhamento.html', icon: 'fa-clipboard-check' },
      { label: 'Localização da Frota', desc: 'Monitoramento da frota em tempo real', pagina: 'monitoramento-frota.html', icon: 'fa-satellite-dish' },
    ]
  },
  {
    grupo: 'Colisão', cor: 'red',
    itens: [
      { label: 'Ocorrências', desc: 'Registrar ocorrências', pagina: 'fiscalizacao-ocorrencia.html', icon: 'fa-car-burst' },
    ]
  },
  {
    grupo: 'Portaria', cor: 'dark',
    itens: [
      { label: 'Controle de Acesso',  desc: 'Registrar entradas/saídas', pagina: 'portaria-controle-acesso.html',  icon: 'fa-door-open' },
      { label: 'Monitoramento RT',    desc: 'Portaria em tempo real',     pagina: 'monitoramento-portaria.html',    icon: 'fa-eye' },
    ]
  },
  {
    grupo: 'Desenvolvimento', cor: 'dark',
    itens: [
      { label: 'Mapa de Rotas',       desc: 'Visualização de rotas', pagina: 'mapa.html',                icon: 'fa-map' },
      { label: 'Localização de Veículos', desc: 'Posição atual da frota', pagina: 'localizacao-veiculo.html', icon: 'fa-location-dot' },
      { label: 'Controle de Jornada', desc: 'Gestão de jornada',     pagina: 'controle-de-jornada.html', icon: 'fa-user-clock' },
    ]
  },
  {
    grupo: 'Relatórios', cor: 'green',
    itens: [
      { label: 'Estatística', desc: 'Relatórios gerenciais', pagina: 'relatorio-estatistica.html', icon: 'fa-chart-line' },
      { label: 'Relatório de Localização', desc: 'Histórico de posições da frota', pagina: 'relatorio-localizacao.html', icon: 'fa-route' },
    ]
  },
];

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const raw = localStorage.getItem('usuarioLogado');
  if (!raw) {
    alert('Você precisa fazer login para acessar o dashboard.');
    window.location.href = 'index.html';
    return;
  }

  const usuario = JSON.parse(raw);
  document.getElementById('dash-nome-usuario').textContent = (usuario.nome || 'Usuário').split(' ')[0];

  atualizarDataHora();
  setInterval(atualizarDataHora, 60000);
  initCarousel();

  renderModulos();
  await filtrarPorPermissao(usuario.nivel || '');
});

window.toggleSidebar = function () {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('mobile-open');
};

// ─── Data / hora ──────────────────────────────────────────────────────────────
function atualizarDataHora() {
  const agora = new Date();
  const h = agora.getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('dash-saudacao').textContent = saudacao;

  const dias   = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const meses  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const min    = String(agora.getMinutes()).padStart(2, '0');

  document.getElementById('dash-data-hora').textContent =
    `${dias[agora.getDay()]}, ${agora.getDate()} de ${meses[agora.getMonth()]} de ${agora.getFullYear()} — ${String(h).padStart(2,'0')}:${min}`;
}

// ─── Carrossel ────────────────────────────────────────────────────────────────
function initCarousel() {
  const slides = document.querySelectorAll('.banner-slide');
  let current = 0;
  if (slides.length > 0) {
    setInterval(() => {
      slides[current].classList.remove('active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('active');
    }, 4500);
  }
}

// ─── Render módulos ───────────────────────────────────────────────────────────
function renderModulos() {
  const container = document.getElementById('dashModulosContainer');
  if (!container) return;

  container.innerHTML = MODULOS.map(grupo => `
    <div class="dash-modules-group" data-grupo="${grupo.grupo}">
      <p class="dash-group-label">${grupo.grupo}</p>
      <div class="dash-modules-grid">
        ${grupo.itens.map(item => `
          <a href="${item.pagina}" class="dash-module-card" data-pagina="${item.pagina}">
            <div class="dash-module-icon ${grupo.cor}"><i class="fas ${item.icon}"></i></div>
            <div class="dash-module-info">
              <h3>${item.label}</h3>
              <p>${item.desc}</p>
            </div>
            <i class="fas fa-chevron-right dash-module-arrow"></i>
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// ─── Permissões ───────────────────────────────────────────────────────────────
async function filtrarPorPermissao(nivel) {
  if (!nivel || nivel.toLowerCase() === 'administrador') return;

  try {
    const { data, error } = await supabaseClient
      .from('nivel_permissoes')
      .select('paginas_permitidas')
      .eq('nivel', nivel.toLowerCase())
      .single();

    if (error) throw error;

    const paginas = new Set(data?.paginas_permitidas || []);
    paginas.add('dashboard.html');
    paginas.add('index.html');

    document.querySelectorAll('.dash-module-card').forEach(card => {
      if (!paginas.has(card.dataset.pagina)) card.style.display = 'none';
    });

    document.querySelectorAll('.dash-modules-group').forEach(group => {
      const visiveis = group.querySelectorAll('.dash-module-card:not([style*="display: none"])');
      if (visiveis.length === 0) group.style.display = 'none';
    });

  } catch (err) {
    console.error('Erro ao carregar permissões:', err);
    document.querySelectorAll('.dash-module-card').forEach(el => el.style.display = 'none');
  }
}
