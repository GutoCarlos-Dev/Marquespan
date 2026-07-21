import { supabaseClient } from './supabase.js';

const GEOAPIFY_API_KEY = '0f54f744cbbb4620b9eb08a407a2a40f';
const MAX_GEOCODE_ENDERECOS = 300;
const CACHE_COORDENADAS_KEY = 'clientes_mapa_coord_cache_v1';
const CACHE_COORDENADAS_MAX = 5000;
const PALETA_ROTAS = [
    '#006937', '#2563eb', '#dc2626', '#9333ea', '#f97316',
    '#0891b2', '#65a30d', '#be123c', '#7c3aed', '#0f766e',
    '#ca8a04', '#1d4ed8', '#b91c1c', '#15803d', '#c026d3'
];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function cleanCell(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizarNumeroCoordenada(value) {
    const texto = cleanCell(value).replace(',', '.');
    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : null;
}

function coordenadasValidas(lat, lng) {
    return Number.isFinite(lat)
        && Number.isFinite(lng)
        && Math.abs(lat) <= 90
        && Math.abs(lng) <= 180
        && lat !== 0
        && lng !== 0;
}

function parseCoordenadasSeparadas(cliente) {
    const lat = normalizarNumeroCoordenada(cliente.latitude ?? cliente.Latitude ?? cliente.LATITUDE ?? cliente.lat ?? cliente.LAT);
    const lng = normalizarNumeroCoordenada(cliente.longitude ?? cliente.Longitude ?? cliente.LONGITUDE ?? cliente.lng ?? cliente.LNG ?? cliente.lon ?? cliente.LON);
    if (!coordenadasValidas(lat, lng)) return null;
    return { lat, lng, origem: 'latitude/longitude cadastrada' };
}

function parseGeolocalizacao(value) {
    const texto = cleanCell(value);
    if (!texto) return null;

    const latRotulada = texto.match(/lat(?:itude)?\.?\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
    const lngRotulada = texto.match(/(?:lng|lon|long|longitude)\.?\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)/i);
    if (latRotulada && lngRotulada) {
        const lat = normalizarNumeroCoordenada(latRotulada[1]);
        const lng = normalizarNumeroCoordenada(lngRotulada[1]);
        if (coordenadasValidas(lat, lng)) return { lat, lng, origem: 'geolocalizacao cadastrada' };
    }

    const match = texto.match(/(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)/);
    if (!match) return null;

    const primeiro = normalizarNumeroCoordenada(match[1]);
    const segundo = normalizarNumeroCoordenada(match[2]);

    // Heuristica para Brasil: longitude costuma ficar entre -74 e -34, latitude entre -34 e 6.
    if (primeiro >= -74 && primeiro <= -34 && segundo >= -34 && segundo <= 6) {
        return { lat: segundo, lng: primeiro, origem: 'geolocalizacao cadastrada longitude/latitude' };
    }

    let lat = primeiro;
    let lng = segundo;
    if (coordenadasValidas(lat, lng)) return { lat, lng, origem: 'geolocalizacao cadastrada' };

    // Se veio no formato longitude, latitude, tenta inverter.
    lat = normalizarNumeroCoordenada(match[2]);
    lng = normalizarNumeroCoordenada(match[1]);
    if (coordenadasValidas(lat, lng)) return { lat, lng, origem: 'geolocalizacao cadastrada invertida' };

    return null;
}

function montarEndereco(cliente) {
    return [
        cliente.endereco,
        cliente.bairro,
        cliente.municipio,
        cliente.uf,
        cliente.cep,
        'Brasil'
    ].map(cleanCell).filter(Boolean).join(', ');
}

function normalizarAssinatura(value) {
    return cleanCell(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
}

function chaveCacheCliente(cliente) {
    return cleanCell(cliente.codigo)
        || normalizarAssinatura([cliente.fantasia, cliente.nome, montarEndereco(cliente)].filter(Boolean).join('|'));
}

function chaveInstanciaCliente(cliente) {
    return [
        chaveCacheCliente(cliente),
        cleanCell(cliente.rota) || 'Sem rota'
    ].join('|');
}

function assinaturaLocalizacaoCliente(cliente) {
    return [
        cliente.geolocalizacao,
        cliente.latitude ?? cliente.Latitude ?? cliente.LATITUDE ?? cliente.lat ?? cliente.LAT,
        cliente.longitude ?? cliente.Longitude ?? cliente.LONGITUDE ?? cliente.lng ?? cliente.LNG ?? cliente.lon ?? cliente.LON,
        montarEndereco(cliente)
    ].map(normalizarAssinatura).join('|');
}

function hslParaHex(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const cor = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(255 * cor).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function gerarCorExtra(indice) {
    // Angulo dourado garante matizes bem espalhados mesmo para muitas rotas.
    const hue = (indice * 137.508) % 360;
    return hslParaHex(hue, 0.62, 0.45);
}

async function geocodificarEndereco(endereco) {
    if (!GEOAPIFY_API_KEY || cleanCell(endereco).length < 5) return null;
    const params = new URLSearchParams({
        text: endereco,
        lang: 'pt',
        filter: 'countrycode:br',
        limit: '1',
        apiKey: GEOAPIFY_API_KEY
    });

    const response = await fetch(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`);
    if (!response.ok) return null;

    const data = await response.json();
    const coords = data?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;

    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, origem: 'endereco' };
}

function googleMapsUrl(cliente, coords) {
    const query = coords
        ? `${coords.lat},${coords.lng}`
        : montarEndereco(cliente);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const ClientesMapaUI = {
    map: null,
    infoWindow: null,
    clientes: [],
    localizados: [],
    pendentes: [],
    bounds: [],
    fitTimer: null,
    coordCache: {},
    cacheAlterado: false,
    marcadores: new Map(),
    rotaCores: new Map(),
    rotasAtivas: new Set(),

    // Preparo que nao depende do Google Maps ja estar carregado (roda no DOMContentLoaded).
    prepararDados() {
        this.cache();
        this.bindEvents();
        this.carregarCacheCoordenadas();
        this.carregarPayload();
    },

    // Chamado pelo callback do script do Google Maps (?callback=iniciarClientesMapa), quando
    // a API ja estiver pronta pra uso (google.maps disponivel).
    init() {
        this.initMap();
        this.processarClientes();
    },

    cache() {
        this.status = document.getElementById('clientesMapaStatus');
        this.totalClientes = document.getElementById('mapaTotalClientes');
        this.totalLocalizados = document.getElementById('mapaTotalLocalizados');
        this.totalRotas = document.getElementById('mapaTotalRotas');
        this.legenda = document.getElementById('clientesMapaLegenda');
        this.pendentesEl = document.getElementById('clientesMapaPendentes');
        this.btnExportarPendentes = document.getElementById('btnExportarPendentes');
    },

    bindEvents() {
        this.btnExportarPendentes?.addEventListener('click', () => this.exportarPendentesXlsx());

        document.addEventListener('click', (event) => {
            const botao = event.target.closest('[data-action="atualizar-coordenadas-cliente"]');
            if (botao) this.atualizarCoordenadasCliente(botao);

            const itemRota = event.target.closest('[data-action="destacar-rota"]');
            if (itemRota) this.destacarRota(itemRota.dataset.rota, event.ctrlKey || event.metaKey);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const itemRota = event.target.closest('[data-action="destacar-rota"]');
            if (!itemRota) return;
            event.preventDefault();
            this.destacarRota(itemRota.dataset.rota, event.ctrlKey || event.metaKey);
        });
    },

    initMap() {
        this.map = new google.maps.Map(document.getElementById('clientesMapa'), {
            center: { lat: -23.330692, lng: -47.851799 },
            zoom: 7,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE]
            },
            streetViewControl: false
        });
        this.infoWindow = new google.maps.InfoWindow();
    },

    // Google Maps nao tem um marcador "circulo" pronto como o Leaflet circleMarker — usamos um
    // icone SVG (google.maps.SymbolPath.CIRCLE) com o mesmo raio/cor/opacidade equivalentes.
    criarIcone(estilo) {
        return {
            path: google.maps.SymbolPath.CIRCLE,
            scale: estilo.radius,
            fillColor: estilo.fillColor,
            fillOpacity: estilo.fillOpacity,
            strokeColor: estilo.strokeColor,
            strokeWeight: estilo.strokeWeight
        };
    },

    // fitBounds do Google Maps nao aceita "maxZoom" como o Leaflet — se o resultado do fit
    // ficar exagerado (ex.: 1 unico ponto isolado), reduzimos o zoom depois que o mapa assentar.
    ajustarComLimiteZoom(bounds, maxZoom) {
        google.maps.event.addListenerOnce(this.map, 'idle', () => {
            if (this.map.getZoom() > maxZoom) this.map.setZoom(maxZoom);
        });
        this.map.fitBounds(bounds, 40);
    },

    carregarPayload() {
        try {
            const payload = JSON.parse(localStorage.getItem('clientes_mapa_payload') || sessionStorage.getItem('clientes_mapa_payload') || 'null');
            this.clientes = Array.isArray(payload?.clientes) ? payload.clientes : [];
        } catch {
            this.clientes = [];
        }

        if (!this.clientes.length) {
            this.setStatus('Nenhum cliente recebido. Volte para Clientes, clique em Buscar e abra o mapa novamente.');
        }
    },

    inicializarCoresRotas() {
        const rotasUnicas = [...new Set(this.clientes.map((cliente) => cleanCell(cliente.rota) || 'Sem rota'))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));

        rotasUnicas.forEach((rota, indice) => {
            const cor = indice < PALETA_ROTAS.length ? PALETA_ROTAS[indice] : gerarCorExtra(indice - PALETA_ROTAS.length);
            this.rotaCores.set(rota, cor);
        });
    },

    corDaRota(rota) {
        const chave = cleanCell(rota) || 'Sem rota';
        if (!this.rotaCores.has(chave)) {
            this.rotaCores.set(chave, gerarCorExtra(this.rotaCores.size));
        }
        return this.rotaCores.get(chave);
    },

    async processarClientes() {
        if (!this.clientes.length) {
            this.atualizarResumo();
            return;
        }

        this.inicializarCoresRotas();
        this.setStatus(`Localizando ${this.clientes.length.toLocaleString('pt-BR')} cliente(s)...`);
        let geocodificados = 0;

        for (const cliente of this.clientes) {
            let coords = parseCoordenadasSeparadas(cliente) || parseGeolocalizacao(cliente.geolocalizacao);
            if (!coords) coords = this.obterCoordenadasCache(cliente);

            if (!coords && geocodificados < MAX_GEOCODE_ENDERECOS) {
                const endereco = montarEndereco(cliente);
                try {
                    coords = await geocodificarEndereco(endereco);
                } catch (error) {
                    console.warn('Erro ao geocodificar cliente:', cliente.codigo, error);
                }
                geocodificados += 1;
            }

            if (coords) {
                this.salvarCoordenadasCache(cliente, coords);
                this.localizados.push({ cliente, coords });
                this.adicionarClienteNoMapa(cliente, coords);
            } else {
                this.pendentes.push(cliente);
            }

            const processados = this.localizados.length + this.pendentes.length;
            if (processados <= 10 || processados % 10 === 0) {
                this.atualizarResumo();
                this.setStatus(`Processados ${processados} de ${this.clientes.length} cliente(s)...`);
            }
            if (processados % 50 === 0) {
                this.persistirCacheCoordenadas();
            }
        }

        this.atualizarResumo();
        this.ajustarMapaAosPontos(true);
        this.persistirCacheCoordenadas();
        this.setStatus(`${this.localizados.length.toLocaleString('pt-BR')} cliente(s) localizados no mapa.`);
    },

    carregarCacheCoordenadas() {
        try {
            const cache = JSON.parse(localStorage.getItem(CACHE_COORDENADAS_KEY) || '{}');
            this.coordCache = cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
        } catch {
            this.coordCache = {};
        }
    },

    obterCoordenadasCache(cliente) {
        const chave = chaveCacheCliente(cliente);
        const assinatura = assinaturaLocalizacaoCliente(cliente);
        const item = chave ? this.coordCache[chave] : null;
        if (!item || item.assinatura !== assinatura) return null;

        const lat = Number(item.lat);
        const lng = Number(item.lng);
        if (!coordenadasValidas(lat, lng)) return null;
        const origemBase = String(item.origem || '').replace(/\s*\(cache\)\s*$/i, '') || 'cache';
        return { lat, lng, origem: `${origemBase} (cache)` };
    },

    salvarCoordenadasCache(cliente, coords) {
        const chave = chaveCacheCliente(cliente);
        if (!chave || !coordenadasValidas(coords.lat, coords.lng)) return;

        this.coordCache[chave] = {
            lat: coords.lat,
            lng: coords.lng,
            origem: String(coords.origem || ''),
            assinatura: assinaturaLocalizacaoCliente(cliente),
            atualizadoEm: new Date().toISOString()
        };
        this.cacheAlterado = true;
    },

    persistirCacheCoordenadas() {
        if (!this.cacheAlterado) return;

        const entradas = Object.entries(this.coordCache)
            .sort((a, b) => String(b[1]?.atualizadoEm || '').localeCompare(String(a[1]?.atualizadoEm || '')))
            .slice(0, CACHE_COORDENADAS_MAX);

        this.coordCache = Object.fromEntries(entradas);
        try {
            localStorage.setItem(CACHE_COORDENADAS_KEY, JSON.stringify(this.coordCache));
            this.cacheAlterado = false;
        } catch (error) {
            console.warn('Nao foi possivel salvar cache de coordenadas:', error);
        }
    },

    estiloMarcador(rota) {
        const cor = this.corDaRota(rota);
        if (!this.rotasAtivas.size) {
            return { radius: 8, strokeColor: '#ffffff', strokeWeight: 2, fillColor: cor, fillOpacity: 0.9 };
        }
        if (this.rotasAtivas.has(rota)) {
            return { radius: 11, strokeColor: '#111827', strokeWeight: 3, fillColor: cor, fillOpacity: 1 };
        }
        return { radius: 6, strokeColor: '#ffffff', strokeWeight: 1, fillColor: cor, fillOpacity: 0.15 };
    },

    adicionarClienteNoMapa(cliente, coords) {
        const rota = cleanCell(cliente.rota) || 'Sem rota';
        const cor = this.corDaRota(rota);
        const posicao = { lat: coords.lat, lng: coords.lng };
        this.bounds.push(posicao);

        const marcador = new google.maps.Marker({
            position: posicao,
            map: this.map,
            icon: this.criarIcone(this.estiloMarcador(rota))
        });
        marcador.rota = rota;
        marcador.addListener('click', () => {
            this.infoWindow.setContent(this.montarPopup(cliente, coords, cor));
            this.infoWindow.open(this.map, marcador);
        });
        this.marcadores.set(chaveInstanciaCliente(cliente), marcador);

        this.ajustarMapaAosPontos(false);
    },

    destacarRota(rota, multiplo = false) {
        const chave = cleanCell(rota) || 'Sem rota';

        if (multiplo) {
            if (this.rotasAtivas.has(chave)) {
                this.rotasAtivas.delete(chave);
            } else {
                this.rotasAtivas.add(chave);
            }
        } else if (this.rotasAtivas.size === 1 && this.rotasAtivas.has(chave)) {
            this.rotasAtivas.clear();
        } else {
            this.rotasAtivas = new Set([chave]);
        }

        this.aplicarDestaqueRota();
        this.atualizarLegendaAtiva();
    },

    aplicarDestaqueRota() {
        this.marcadores.forEach((marcador) => {
            marcador.setIcon(this.criarIcone(this.estiloMarcador(marcador.rota)));
            marcador.setZIndex(this.rotasAtivas.has(marcador.rota) ? google.maps.Marker.MAX_ZINDEX + 1 : null);
        });

        if (this.rotasAtivas.size) {
            const pontosRotas = this.localizados
                .filter(({ cliente }) => this.rotasAtivas.has(cleanCell(cliente.rota) || 'Sem rota'))
                .map(({ coords }) => ({ lat: coords.lat, lng: coords.lng }));
            if (pontosRotas.length === 1) {
                this.map.setCenter(pontosRotas[0]);
                this.map.setZoom(15);
            } else if (pontosRotas.length > 1) {
                const bounds = new google.maps.LatLngBounds();
                pontosRotas.forEach((ponto) => bounds.extend(ponto));
                this.ajustarComLimiteZoom(bounds, 15);
            }
        } else {
            this.ajustarMapaAosPontos(true);
        }
    },

    atualizarLegendaAtiva() {
        this.legenda.querySelectorAll('.clientes-mapa-legenda-item').forEach((item) => {
            item.classList.toggle('active', this.rotasAtivas.has(item.dataset.rota));
        });
    },

    ajustarMapaAosPontos(imediato = false) {
        if (!this.bounds.length) return;
        if (this.fitTimer) clearTimeout(this.fitTimer);

        const ajustar = () => {
            if (this.bounds.length === 1) {
                this.map.setCenter(this.bounds[0]);
                this.map.setZoom(13);
                return;
            }
            const bounds = new google.maps.LatLngBounds();
            this.bounds.forEach((ponto) => bounds.extend(ponto));
            this.ajustarComLimiteZoom(bounds, 14);
        };

        if (imediato || this.bounds.length <= 3) {
            ajustar();
        } else {
            this.fitTimer = setTimeout(ajustar, 350);
        }
    },

    montarPopup(cliente, coords, cor) {
        const nome = cliente.fantasia || cliente.nome || `Cliente ${cliente.codigo || ''}`.trim();
        const endereco = montarEndereco(cliente);
        const rota = cleanCell(cliente.rota) || 'Sem rota';
        const chave = chaveInstanciaCliente(cliente);

        return `
            <div class="cliente-mapa-popup" data-cliente-chave="${escapeHtml(chave)}">
                <strong>${escapeHtml(nome)}</strong>
                <p><b>Codigo:</b> ${escapeHtml(cliente.codigo || '-')}</p>
                <p><b>Rota:</b> <span style="color:${escapeHtml(cor)};font-weight:700">${escapeHtml(rota)}</span></p>
                <p><b>Supervisor:</b> ${escapeHtml(cliente.supervisor || '-')}</p>
                <p>${escapeHtml(endereco || 'Endereco nao informado')}</p>
                <a href="${googleMapsUrl(cliente, coords)}" target="_blank" rel="noopener noreferrer">Abrir no Google Maps</a>
                <div class="cliente-mapa-coordenadas">
                    <label>Geolocalizacao
                        <input type="text" class="cliente-mapa-geolocalizacao" value="${escapeHtml(`${Number(coords.lat).toFixed(6)}, ${Number(coords.lng).toFixed(6)}`)}" placeholder="-24.70713905086516, -47.561149054910686">
                    </label>
                    <button type="button" data-action="atualizar-coordenadas-cliente" data-cliente-chave="${escapeHtml(chave)}">
                        Atualizar coordenadas
                    </button>
                    <small class="cliente-mapa-update-status"></small>
                </div>
            </div>
        `;
    },

    encontrarLocalizadoPorChave(chave) {
        return this.localizados.find(({ cliente }) => chaveInstanciaCliente(cliente) === chave) || null;
    },

    obterCoordenadasPopup(container) {
        const input = container?.querySelector('.cliente-mapa-geolocalizacao');
        const raw = cleanCell(input?.value);

        const coordenadasColadas = parseGeolocalizacao(raw);
        if (coordenadasColadas) {
            if (input) input.value = `${coordenadasColadas.lat.toFixed(6)}, ${coordenadasColadas.lng.toFixed(6)}`;
            return coordenadasColadas;
        }

        return null;
    },

    async atualizarCoordenadasCliente(botao) {
        const chave = botao.dataset.clienteChave;
        const container = botao.closest('.cliente-mapa-popup');
        const status = container?.querySelector('.cliente-mapa-update-status');
        const coordsForm = this.obterCoordenadasPopup(container);
        const localizado = this.encontrarLocalizadoPorChave(chave);

        if (!localizado) {
            if (status) status.textContent = 'Cliente nao encontrado no mapa.';
            return;
        }
        if (!coordsForm) {
            if (status) status.textContent = 'Cole no formato -24.70713905086516, -47.561149054910686.';
            return;
        }
        if (!cleanCell(localizado.cliente.codigo)) {
            if (status) status.textContent = 'Cliente sem codigo para atualizar.';
            return;
        }

        const lat = coordsForm.lat;
        const lng = coordsForm.lng;
        const textoCoordenadas = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        const textoOriginal = botao.textContent;
        botao.disabled = true;
        botao.textContent = 'Salvando...';
        if (status) status.textContent = '';

        try {
            const { error } = await supabaseClient
                .from('clientes')
                .update({ geolocalizacao: textoCoordenadas })
                .eq('codigo', localizado.cliente.codigo);
            if (error) throw error;

            localizado.cliente.geolocalizacao = textoCoordenadas;
            localizado.cliente.latitude = lat;
            localizado.cliente.longitude = lng;
            localizado.coords = { lat, lng, origem: 'geolocalizacao atualizada' };
            this.salvarCoordenadasCache(localizado.cliente, localizado.coords);
            this.persistirCacheCoordenadas();
            this.atualizarMarcadorCliente(chave, localizado.cliente, localizado.coords);

            if (status) status.textContent = 'Coordenadas atualizadas.';
        } catch (error) {
            console.error('Erro ao atualizar coordenadas do cliente:', error);
            if (status) status.textContent = 'Erro ao salvar coordenadas.';
        } finally {
            botao.disabled = false;
            botao.textContent = textoOriginal;
        }
    },

    atualizarMarcadorCliente(chave, cliente, coords) {
        const marcador = this.marcadores.get(chave);
        if (!marcador) return;

        const rota = cleanCell(cliente.rota) || 'Sem rota';
        marcador.setPosition({ lat: coords.lat, lng: coords.lng });
        this.infoWindow.setContent(this.montarPopup(cliente, coords, this.corDaRota(rota)));
        this.infoWindow.open(this.map, marcador);
        this.bounds = this.localizados.map((item) => ({ lat: item.coords.lat, lng: item.coords.lng }));
        this.ajustarMapaAosPontos(false);
    },

    atualizarResumo() {
        const rotas = new Map();
        this.localizados.forEach(({ cliente }) => {
            const rota = cleanCell(cliente.rota) || 'Sem rota';
            rotas.set(rota, (rotas.get(rota) || 0) + 1);
        });

        this.totalClientes.textContent = this.clientes.length.toLocaleString('pt-BR');
        this.totalLocalizados.textContent = this.localizados.length.toLocaleString('pt-BR');
        this.totalRotas.textContent = rotas.size.toLocaleString('pt-BR');

        this.legenda.innerHTML = [...rotas.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true, sensitivity: 'base' }))
            .map(([rota, total]) => `
                <div class="clientes-mapa-legenda-item${this.rotasAtivas.has(rota) ? ' active' : ''}" data-action="destacar-rota" data-rota="${escapeHtml(rota)}" role="button" tabindex="0" title="Clique para destacar. Ctrl+clique para selecionar varias rotas">
                    <span class="clientes-mapa-cor" style="background:${escapeHtml(this.corDaRota(rota))}"></span>
                    <strong>${escapeHtml(rota)}</strong>
                    <span>${total.toLocaleString('pt-BR')}</span>
                </div>
            `).join('') || '<div class="clientes-mapa-pendentes">Nenhuma rota localizada.</div>';

        if (!this.pendentes.length) {
            this.pendentesEl.textContent = 'Nenhum.';
            if (this.btnExportarPendentes) this.btnExportarPendentes.hidden = true;
            return;
        }

        if (this.btnExportarPendentes) this.btnExportarPendentes.hidden = false;

        this.pendentesEl.innerHTML = `
            <ul>
                ${this.pendentes.slice(0, 80).map((cliente) => `
                    <li>${escapeHtml(cliente.codigo || '-')}: ${escapeHtml(cliente.fantasia || cliente.nome || 'Cliente sem nome')}</li>
                `).join('')}
            </ul>
            ${this.pendentes.length > 80 ? `<p>Mais ${(this.pendentes.length - 80).toLocaleString('pt-BR')} cliente(s) nao exibidos.</p>` : ''}
        `;
    },

    exportarPendentesXlsx() {
        if (typeof window.XLSX === 'undefined') {
            this.setStatus('Biblioteca XLSX nao carregada. Atualize a pagina e tente novamente.');
            return;
        }
        if (!this.pendentes.length) return;

        const dados = this.pendentes.map((cliente) => ({
            'CÓD': cliente.codigo || '',
            'FANTASIA': cliente.fantasia || '',
            'NOME': cliente.nome || '',
            'ROTA': cleanCell(cliente.rota) || 'Sem rota',
            'SUPERVISOR': cliente.supervisor || '',
            'ENDEREÇO': montarEndereco(cliente),
            'MUNICIPIO': cliente.municipio || '',
            'UF': cliente.uf || '',
            'CEP': cliente.cep || ''
        }));

        const worksheet = window.XLSX.utils.json_to_sheet(dados);
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, 'NAO LOCALIZADOS');
        window.XLSX.writeFile(workbook, `clientes_nao_localizados_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    setStatus(message) {
        if (this.status) this.status.textContent = message;
    }
};

// Coordena duas coisas assincronas independentes: o DOM/payload (DOMContentLoaded) e o
// script do Google Maps (que carrega em paralelo e avisa via callback=iniciarClientesMapa
// na URL do <script> no HTML). So inicializa o mapa quando as duas ja estiverem prontas,
// nao importa qual termine primeiro.
let googleMapsPronto = false;
let dadosPreparados = false;

function tentarIniciarClientesMapa() {
    if (googleMapsPronto && dadosPreparados) ClientesMapaUI.init();
}

window.iniciarClientesMapa = () => {
    googleMapsPronto = true;
    tentarIniciarClientesMapa();
};

document.addEventListener('DOMContentLoaded', () => {
    ClientesMapaUI.prepararDados();
    dadosPreparados = true;
    tentarIniciarClientesMapa();
});
