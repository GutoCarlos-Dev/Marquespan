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

function hashString(value) {
    return Array.from(String(value || '')).reduce((hash, char) => {
        return ((hash << 5) - hash) + char.charCodeAt(0);
    }, 0);
}

function corDaRota(rota) {
    const chave = cleanCell(rota) || 'Sem rota';
    return PALETA_ROTAS[Math.abs(hashString(chave)) % PALETA_ROTAS.length];
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
    layer: null,
    clientes: [],
    localizados: [],
    pendentes: [],
    bounds: [],
    fitTimer: null,
    coordCache: {},
    cacheAlterado: false,
    marcadores: new Map(),

    init() {
        this.cache();
        this.initMap();
        this.bindEvents();
        this.carregarCacheCoordenadas();
        this.carregarPayload();
        this.processarClientes();
    },

    cache() {
        this.status = document.getElementById('clientesMapaStatus');
        this.totalClientes = document.getElementById('mapaTotalClientes');
        this.totalLocalizados = document.getElementById('mapaTotalLocalizados');
        this.totalRotas = document.getElementById('mapaTotalRotas');
        this.legenda = document.getElementById('clientesMapaLegenda');
        this.pendentesEl = document.getElementById('clientesMapaPendentes');
    },

    bindEvents() {
        document.addEventListener('click', (event) => {
            const botao = event.target.closest('[data-action="atualizar-coordenadas-cliente"]');
            if (botao) this.atualizarCoordenadasCliente(botao);
        });
    },

    initMap() {
        this.map = L.map('clientesMapa').setView([-23.330692, -47.851799], 7);
        const mapaPadrao = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        });
        const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri'
        });

        mapaPadrao.addTo(this.map);
        L.control.layers({
            'Mapa': mapaPadrao,
            'Satelite': satelite
        }, null, { collapsed: false }).addTo(this.map);

        this.layer = L.layerGroup().addTo(this.map);
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

    async processarClientes() {
        if (!this.clientes.length) {
            this.atualizarResumo();
            return;
        }

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
        return { lat, lng, origem: item.origem ? `${item.origem} (cache)` : 'cache' };
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

    adicionarClienteNoMapa(cliente, coords) {
        const rota = cleanCell(cliente.rota) || 'Sem rota';
        const cor = corDaRota(rota);
        const latLng = [coords.lat, coords.lng];
        this.bounds.push(latLng);

        const marcador = L.circleMarker(latLng, {
            radius: 8,
            color: '#ffffff',
            weight: 2,
            fillColor: cor,
            fillOpacity: 0.9
        }).addTo(this.layer).bindPopup(this.montarPopup(cliente, coords, cor));
        this.marcadores.set(chaveInstanciaCliente(cliente), marcador);

        this.ajustarMapaAosPontos(false);
    },

    ajustarMapaAosPontos(imediato = false) {
        if (!this.bounds.length) return;
        if (this.fitTimer) clearTimeout(this.fitTimer);

        const ajustar = () => {
            if (this.bounds.length === 1) {
                this.map.setView(this.bounds[0], 13);
                return;
            }
            this.map.fitBounds(L.latLngBounds(this.bounds), { padding: [40, 40], maxZoom: 14 });
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
        const origem = coords.origem === 'endereco' ? 'endereco geocodificado' : coords.origem;
        const chave = chaveInstanciaCliente(cliente);

        return `
            <div class="cliente-mapa-popup" data-cliente-chave="${escapeHtml(chave)}">
                <strong>${escapeHtml(nome)}</strong>
                <p><b>Codigo:</b> ${escapeHtml(cliente.codigo || '-')}</p>
                <p><b>Rota:</b> <span style="color:${escapeHtml(cor)};font-weight:700">${escapeHtml(rota)}</span></p>
                <p><b>Supervisor:</b> ${escapeHtml(cliente.supervisor || '-')}</p>
                <p>${escapeHtml(endereco || 'Endereco nao informado')}</p>
                <p><small>Origem: ${escapeHtml(origem)}</small></p>
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
        marcador.setLatLng([coords.lat, coords.lng]);
        marcador.setPopupContent(this.montarPopup(cliente, coords, corDaRota(rota)));
        marcador.openPopup();
        this.bounds = this.localizados.map((item) => [item.coords.lat, item.coords.lng]);
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
                <div class="clientes-mapa-legenda-item">
                    <span class="clientes-mapa-cor" style="background:${escapeHtml(corDaRota(rota))}"></span>
                    <strong>${escapeHtml(rota)}</strong>
                    <span>${total.toLocaleString('pt-BR')}</span>
                </div>
            `).join('') || '<div class="clientes-mapa-pendentes">Nenhuma rota localizada.</div>';

        if (!this.pendentes.length) {
            this.pendentesEl.textContent = 'Nenhum.';
            return;
        }

        this.pendentesEl.innerHTML = `
            <ul>
                ${this.pendentes.slice(0, 80).map((cliente) => `
                    <li>${escapeHtml(cliente.codigo || '-')}: ${escapeHtml(cliente.fantasia || cliente.nome || 'Cliente sem nome')}</li>
                `).join('')}
            </ul>
            ${this.pendentes.length > 80 ? `<p>Mais ${(this.pendentes.length - 80).toLocaleString('pt-BR')} cliente(s) nao exibidos.</p>` : ''}
        `;
    },

    setStatus(message) {
        if (this.status) this.status.textContent = message;
    }
};

document.addEventListener('DOMContentLoaded', () => ClientesMapaUI.init());
