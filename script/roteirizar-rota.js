import { supabaseClient } from './supabase.js';

const PAGE_ID = 'roteirizar-rota.html';
const GEOCODE_DELAY_MS = 1100;
const MAX_GEOCODE_CLIENTES = 120;

function cleanCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getUsuarioAtual() {
  try {
    return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
  } catch {
    return null;
  }
}

const RoteirizarRotaUI = {
  map: null,
  markersLayer: null,
  clientes: [],
  usuarioAtual: null,

  async init() {
    this.cache();
    const acessoPermitido = await this.verificarPermissaoPagina();
    if (!acessoPermitido) return;
    this.initMap();
    this.bind();
    await this.carregarRotas();
  },

  cache() {
    this.rotaSelect = document.getElementById('rotaSelect');
    this.statusSelect = document.getElementById('statusSelect');
    this.btnPlotar = document.getElementById('btnPlotarRota');
    this.status = document.getElementById('roteirizarStatus');
    this.lista = document.getElementById('rotaClientesList');
    this.count = document.getElementById('rotaClienteCount');
  },

  bind() {
    this.btnPlotar?.addEventListener('click', () => this.plotarRotaSelecionada());
    this.rotaSelect?.addEventListener('change', () => this.limparResultado());
  },

  async verificarPermissaoPagina() {
    this.usuarioAtual = getUsuarioAtual();
    const nivel = String(this.usuarioAtual?.nivel || '').toLowerCase();
    if (!nivel) {
      window.location.href = 'index.html';
      return false;
    }
    if (nivel === 'administrador') return true;

    try {
      const { data, error } = await supabaseClient
        .from('nivel_permissoes')
        .select('paginas_permitidas')
        .eq('nivel', nivel)
        .single();
      if (error) throw error;
      if ((data?.paginas_permitidas || []).includes(PAGE_ID)) return true;
    } catch (error) {
      console.error('Erro ao validar permissao de roteirizacao:', error);
    }

    document.body.innerHTML = '<div style="text-align:center; padding:50px;"><h1>Acesso Negado</h1><p>Voce nao tem permissao para acessar esta pagina.</p><a href="dashboard.html">Voltar ao Dashboard</a></div>';
    return false;
  },

  initMap() {
    if (!window.L) {
      this.setStatus('Biblioteca do mapa nao carregada. Atualize a pagina e tente novamente.', true);
      return;
    }

    this.map = window.L.map('rotaMap').setView([-22.5, -47.5], 7);
    const mapaPadrao = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    });
    const satelite = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri'
    });
    const rotulos = window.L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Labels &copy; Esri'
    });
    const hibrido = window.L.layerGroup([satelite, rotulos]);

    mapaPadrao.addTo(this.map);
    window.L.control.layers({
      Padrao: mapaPadrao,
      Satelite: satelite,
      Hibrido: hibrido
    }, null, { position: 'topright' }).addTo(this.map);
    this.markersLayer = window.L.layerGroup().addTo(this.map);
  },

  setStatus(message, erro = false) {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.classList.toggle('erro', erro);
  },

  async carregarRotas() {
    if (!this.rotaSelect) return;
    this.rotaSelect.innerHTML = '<option value="">Carregando rotas...</option>';

    try {
      const rotas = await this.buscarRotas();
      this.rotaSelect.innerHTML = '<option value="">Selecione uma rota</option>' + rotas
        .map((rota) => `<option value="${escapeHtml(rota)}">${escapeHtml(rota)}</option>`)
        .join('');
      this.setStatus(`${rotas.length.toLocaleString('pt-BR')} rotas disponiveis.`);
    } catch (error) {
      console.error('Erro ao carregar rotas:', error);
      this.rotaSelect.innerHTML = '<option value="">Erro ao carregar</option>';
      this.setStatus('Erro ao carregar rotas.', true);
    }
  },

  async buscarRotas() {
    const todas = [];
    const tamanhoPagina = 1000;

    for (let inicio = 0; ; inicio += tamanhoPagina) {
      const { data, error } = await supabaseClient
        .from('cliente_rotas')
        .select('rota')
        .order('rota', { ascending: true })
        .range(inicio, inicio + tamanhoPagina - 1);
      if (error) throw error;
      todas.push(...(data || []));
      if (!data || data.length < tamanhoPagina) break;
    }

    return [...new Set(todas.map((item) => cleanCell(item.rota)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  },

  limparResultado() {
    this.clientes = [];
    this.markersLayer?.clearLayers();
    if (this.count) this.count.textContent = '(0)';
    if (this.lista) this.lista.innerHTML = '<div class="rota-empty">Clique em Plotar no mapa.</div>';
  },

  async plotarRotaSelecionada() {
    const rota = this.rotaSelect?.value || '';
    if (!rota) {
      this.setStatus('Selecione uma rota.', true);
      return;
    }

    this.btnPlotar.disabled = true;
    this.markersLayer?.clearLayers();
    this.setStatus(`Carregando clientes da rota ${rota}...`);
    if (this.lista) this.lista.innerHTML = '<div class="rota-empty">Carregando clientes...</div>';

    try {
      const clientes = await this.buscarClientesDaRota(rota, this.statusSelect?.value || '');
      this.clientes = clientes.slice(0, MAX_GEOCODE_CLIENTES);
      if (clientes.length > MAX_GEOCODE_CLIENTES) {
        this.setStatus(`A rota tem ${clientes.length} clientes. Geocodificando os primeiros ${MAX_GEOCODE_CLIENTES} para evitar bloqueio do mapa.`);
      } else {
        this.setStatus(`Geocodificando ${clientes.length} clientes da rota ${rota}...`);
      }

      await this.geocodificarClientes();
      this.renderLista();
      this.enquadrarMapa();
    } catch (error) {
      console.error('Erro ao plotar rota:', error);
      this.setStatus(error?.message || 'Erro ao plotar rota.', true);
    } finally {
      this.btnPlotar.disabled = false;
    }
  },

  async buscarClientesDaRota(rota, status) {
    const rotas = [];
    const tamanhoPagina = 1000;

    for (let inicio = 0; ; inicio += tamanhoPagina) {
      const { data, error } = await supabaseClient
        .from('cliente_rotas')
        .select('cliente_codigo, rota, supervisor, consultor, ativo')
        .eq('rota', rota)
        .range(inicio, inicio + tamanhoPagina - 1);
      if (error) throw error;
      rotas.push(...(data || []));
      if (!data || data.length < tamanhoPagina) break;
    }

    const codigos = [...new Set(rotas.map((item) => item.cliente_codigo).filter(Boolean))];
    if (!codigos.length) return [];

    const clientes = [];
    for (let inicio = 0; inicio < codigos.length; inicio += 500) {
      const lote = codigos.slice(inicio, inicio + 500);
      const { data, error } = await supabaseClient
        .from('clientes')
        .select('codigo, fantasia, nome, uf, municipio, endereco, bairro, cep, cnpj_cpf, ativo')
        .in('codigo', lote);
      if (error) throw error;
      clientes.push(...(data || []));
    }

    const rotasPorCodigo = new Map(rotas.map((item) => [item.cliente_codigo, item]));
    return clientes
      .map((cliente) => ({
        ...cliente,
        rota,
        ativo: rotasPorCodigo.get(cliente.codigo)?.ativo || cliente.ativo || '',
        supervisor: rotasPorCodigo.get(cliente.codigo)?.supervisor || '',
        consultor: rotasPorCodigo.get(cliente.codigo)?.consultor || ''
      }))
      .filter((cliente) => !status || cliente.ativo === status)
      .sort((a, b) => String(a.fantasia || a.nome || '').localeCompare(String(b.fantasia || b.nome || ''), 'pt-BR'));
  },

  montarEndereco(cliente) {
    return [
      cliente.endereco,
      cliente.bairro,
      cliente.municipio,
      cliente.uf,
      cliente.cep,
      'Brasil'
    ].map(cleanCell).filter(Boolean).join(', ');
  },

  normalizarLogradouro(endereco) {
    return cleanCell(endereco)
      .replace(/^(R|RUA)\s*[:.-]?\s*/i, 'Rua ')
      .replace(/^(AV|AVENIDA)\s*[:.-]?\s*/i, 'Avenida ')
      .replace(/^(ROD|RODOVIA)\s*[:.-]?\s*/i, 'Rodovia ')
      .replace(/^(EST|ESTRADA)\s*[:.-]?\s*/i, 'Estrada ');
  },

  montarConsultasGeocode(cliente) {
    const rua = this.normalizarLogradouro(cliente.endereco);
    const bairro = cleanCell(cliente.bairro);
    const cidade = cleanCell(cliente.municipio);
    const uf = cleanCell(cliente.uf);
    const cep = cleanCell(cliente.cep);
    const consultas = [];

    if (rua && cidade && uf) {
      consultas.push({ street: rua, city: cidade, state: uf, country: 'Brasil', postalcode: cep });
      consultas.push({ q: [rua, bairro, cidade, uf, 'Brasil'].filter(Boolean).join(', ') });
      consultas.push({ q: [rua, cidade, uf, 'Brasil'].filter(Boolean).join(', ') });
    }
    if (cep && cidade && uf) consultas.push({ q: [cep, cidade, uf, 'Brasil'].join(', ') });
    if (cidade && uf) consultas.push({ city: cidade, state: uf, country: 'Brasil' });

    return consultas;
  },

  getGeocodeCache() {
    try {
      return JSON.parse(localStorage.getItem('roteirizar_rota_geocode_cache') || '{}');
    } catch {
      return {};
    }
  },

  setGeocodeCache(cache) {
    localStorage.setItem('roteirizar_rota_geocode_cache', JSON.stringify(cache));
  },

  async geocodificarClientes() {
    const cache = this.getGeocodeCache();
    let sucesso = 0;

    for (let index = 0; index < this.clientes.length; index += 1) {
      const cliente = this.clientes[index];
      const endereco = this.montarEndereco(cliente);
      cliente.enderecoMapa = endereco;
      this.setStatus(`Geocodificando ${index + 1} de ${this.clientes.length}: ${cliente.fantasia || cliente.nome || cliente.codigo}`);

      if (cache[endereco]) {
        cliente.lat = cache[endereco].lat;
        cliente.lng = cache[endereco].lng;
        this.adicionarMarcador(cliente);
        sucesso += 1;
        continue;
      }

      const posicao = await this.geocodificarCliente(cliente);
      if (posicao) {
        cliente.lat = posicao.lat;
        cliente.lng = posicao.lng;
        cache[endereco] = posicao;
        this.setGeocodeCache(cache);
        this.adicionarMarcador(cliente);
        sucesso += 1;
      }
      await sleep(GEOCODE_DELAY_MS);
    }

    this.setStatus(`${sucesso} de ${this.clientes.length} clientes localizados no mapa.`);
  },

  async geocodificarCliente(cliente) {
    const consultas = this.montarConsultasGeocode(cliente);
    for (const consulta of consultas) {
      const posicao = await this.geocodificarEndereco(consulta);
      if (posicao) return posicao;
      await sleep(350);
    }
    return null;
  },

  async geocodificarEndereco(consulta) {
    if (!consulta || Object.keys(consulta).length === 0) return null;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'br');
    Object.entries(consulta).forEach(([key, value]) => {
      const texto = cleanCell(value);
      if (texto) url.searchParams.set(key, texto);
    });

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return null;

    const data = await response.json();
    const item = Array.isArray(data) ? data[0] : null;
    if (!item) return null;
    return {
      lat: Number(item.lat),
      lng: Number(item.lon)
    };
  },

  adicionarMarcador(cliente) {
    if (!this.markersLayer || !Number.isFinite(cliente.lat) || !Number.isFinite(cliente.lng)) return;

    const marker = window.L.marker([cliente.lat, cliente.lng]).addTo(this.markersLayer);
    marker.bindPopup(`
      <strong>${escapeHtml(cliente.fantasia || cliente.nome || cliente.codigo)}</strong><br>
      Codigo: ${escapeHtml(cliente.codigo)}<br>
      Rota: ${escapeHtml(cliente.rota)}<br>
      ${escapeHtml(cliente.enderecoMapa)}
    `);
    cliente.marker = marker;
  },

  renderLista() {
    if (this.count) this.count.textContent = `(${this.clientes.length.toLocaleString('pt-BR')})`;
    if (!this.lista) return;
    if (!this.clientes.length) {
      this.lista.innerHTML = '<div class="rota-empty">Nenhum cliente encontrado para a rota.</div>';
      return;
    }

    this.lista.innerHTML = this.clientes.map((cliente, index) => {
      const localizado = Number.isFinite(cliente.lat) && Number.isFinite(cliente.lng);
      return `
        <div class="rota-item" data-index="${index}" title="Clique para focar no mapa. Botao direito abre no Google Maps.">
          <div class="rota-item-title">${escapeHtml(cliente.fantasia || cliente.nome || cliente.codigo)}</div>
          <div class="rota-item-meta">${escapeHtml(cliente.codigo)} | ${escapeHtml(cliente.municipio)} / ${escapeHtml(cliente.uf)}</div>
          <div class="rota-item-meta">${escapeHtml(cliente.endereco || '')}</div>
          <div class="rota-item-footer">
            <span class="rota-item-status ${localizado ? 'ok' : 'fail'}">${localizado ? 'Localizado' : 'Nao localizado'}</span>
            <button type="button" class="street-view-btn" data-action="streetview" data-index="${index}" title="Abrir no Google Street View">
              <i class="fas fa-street-view"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.lista.querySelectorAll('.rota-item').forEach((item) => {
      item.addEventListener('click', (event) => {
        const streetButton = event.target.closest('[data-action="streetview"]');
        if (streetButton) {
          event.stopPropagation();
          const cliente = this.clientes[Number(streetButton.dataset.index)];
          if (cliente) this.abrirClienteNoGoogleStreetView(cliente);
          return;
        }
        const cliente = this.clientes[Number(item.dataset.index)];
        if (!cliente?.marker) return;
        this.map.setView([cliente.lat, cliente.lng], 16);
        cliente.marker.openPopup();
      });
      item.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const cliente = this.clientes[Number(item.dataset.index)];
        if (cliente) this.abrirClienteNoGoogleMaps(cliente);
      });
    });
  },

  abrirClienteNoGoogleMaps(cliente) {
    let url;
    if (Number.isFinite(cliente.lat) && Number.isFinite(cliente.lng)) {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cliente.lat},${cliente.lng}`)}`;
    } else {
      const busca = [
        cliente.fantasia || cliente.nome,
        cliente.enderecoMapa || this.montarEndereco(cliente)
      ].map(cleanCell).filter(Boolean).join(', ');
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  abrirClienteNoGoogleStreetView(cliente) {
    let url;
    if (Number.isFinite(cliente.lat) && Number.isFinite(cliente.lng)) {
      url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(`${cliente.lat},${cliente.lng}`)}`;
    } else {
      const busca = [
        cliente.fantasia || cliente.nome,
        cliente.enderecoMapa || this.montarEndereco(cliente)
      ].map(cleanCell).filter(Boolean).join(', ');
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  enquadrarMapa() {
    const pontos = this.clientes
      .filter((cliente) => Number.isFinite(cliente.lat) && Number.isFinite(cliente.lng))
      .map((cliente) => [cliente.lat, cliente.lng]);
    if (!pontos.length || !this.map) return;
    this.map.fitBounds(window.L.latLngBounds(pontos), { padding: [36, 36], maxZoom: 15 });
  }
};

document.addEventListener('DOMContentLoaded', () => RoteirizarRotaUI.init());
