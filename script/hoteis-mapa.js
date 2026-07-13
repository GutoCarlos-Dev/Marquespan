import { supabaseClient } from './supabase.js';

const GEOAPIFY_API_KEY = '0f54f744cbbb4620b9eb08a407a2a40f';
const MAX_GEOCODE_ENDERECOS = 300;
const CACHE_COORDENADAS_KEY = 'hoteis_mapa_coord_cache_v1';
const CACHE_COORDENADAS_MAX = 2000;
const COR_MARCADOR = '#006937';

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

function montarEndereco(hotel) {
    return [hotel.endereco, 'Brasil'].map(cleanCell).filter(Boolean).join(', ');
}

function normalizarAssinatura(value) {
    return cleanCell(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
}

function chaveHotel(hotel) {
    return cleanCell(hotel.id) || normalizarAssinatura([hotel.nome, hotel.razao_social, montarEndereco(hotel)].filter(Boolean).join('|'));
}

function assinaturaLocalizacaoHotel(hotel) {
    return [hotel.geolocalizacao, montarEndereco(hotel)].map(normalizarAssinatura).join('|');
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

function googleMapsUrl(hotel, coords) {
    const query = coords
        ? `${coords.lat},${coords.lng}`
        : montarEndereco(hotel);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const HoteisMapaUI = {
    map: null,
    layer: null,
    hoteis: [],
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
        this.processarHoteis();
    },

    cache() {
        this.status = document.getElementById('hoteisMapaStatus');
        this.totalHoteis = document.getElementById('mapaTotalHoteis');
        this.totalLocalizados = document.getElementById('mapaTotalLocalizados');
        this.pendentesEl = document.getElementById('hoteisMapaPendentes');
        this.btnExportarPendentes = document.getElementById('btnExportarPendentesHoteis');
    },

    bindEvents() {
        this.btnExportarPendentes?.addEventListener('click', () => this.exportarPendentesXlsx());

        document.addEventListener('click', (event) => {
            const botao = event.target.closest('[data-action="atualizar-coordenadas-hotel"]');
            if (botao) this.atualizarCoordenadasHotel(botao);
        });
    },

    initMap() {
        this.map = L.map('hoteisMapa').setView([-23.330692, -47.851799], 7);
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
            const payload = JSON.parse(localStorage.getItem('hoteis_mapa_payload') || sessionStorage.getItem('hoteis_mapa_payload') || 'null');
            this.hoteis = Array.isArray(payload?.hoteis) ? payload.hoteis : [];
        } catch {
            this.hoteis = [];
        }

        if (!this.hoteis.length) {
            this.setStatus('Nenhum hotel recebido. Volte para Hoteis e clique em Visualizar Hoteis no Mapa novamente.');
        }
    },

    async processarHoteis() {
        if (!this.hoteis.length) {
            this.atualizarResumo();
            return;
        }

        this.setStatus(`Localizando ${this.hoteis.length.toLocaleString('pt-BR')} hotel(is)...`);
        let geocodificados = 0;

        for (const hotel of this.hoteis) {
            let coords = parseGeolocalizacao(hotel.geolocalizacao);
            if (!coords) coords = this.obterCoordenadasCache(hotel);

            if (!coords && geocodificados < MAX_GEOCODE_ENDERECOS) {
                const endereco = montarEndereco(hotel);
                try {
                    coords = await geocodificarEndereco(endereco);
                } catch (error) {
                    console.warn('Erro ao geocodificar hotel:', hotel.id, error);
                }
                geocodificados += 1;
            }

            if (coords) {
                this.salvarCoordenadasCache(hotel, coords);
                this.localizados.push({ hotel, coords });
                this.adicionarHotelNoMapa(hotel, coords);
            } else {
                this.pendentes.push(hotel);
            }

            const processados = this.localizados.length + this.pendentes.length;
            if (processados <= 10 || processados % 10 === 0) {
                this.atualizarResumo();
                this.setStatus(`Processados ${processados} de ${this.hoteis.length} hotel(is)...`);
            }
            if (processados % 50 === 0) {
                this.persistirCacheCoordenadas();
            }
        }

        this.atualizarResumo();
        this.ajustarMapaAosPontos(true);
        this.persistirCacheCoordenadas();
        this.setStatus(`${this.localizados.length.toLocaleString('pt-BR')} hotel(is) localizados no mapa.`);
    },

    carregarCacheCoordenadas() {
        try {
            const cache = JSON.parse(localStorage.getItem(CACHE_COORDENADAS_KEY) || '{}');
            this.coordCache = cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
        } catch {
            this.coordCache = {};
        }
    },

    obterCoordenadasCache(hotel) {
        const chave = chaveHotel(hotel);
        const assinatura = assinaturaLocalizacaoHotel(hotel);
        const item = chave ? this.coordCache[chave] : null;
        if (!item || item.assinatura !== assinatura) return null;

        const lat = Number(item.lat);
        const lng = Number(item.lng);
        if (!coordenadasValidas(lat, lng)) return null;
        const origemBase = String(item.origem || '').replace(/\s*\(cache\)\s*$/i, '') || 'cache';
        return { lat, lng, origem: `${origemBase} (cache)` };
    },

    salvarCoordenadasCache(hotel, coords) {
        const chave = chaveHotel(hotel);
        if (!chave || !coordenadasValidas(coords.lat, coords.lng)) return;

        this.coordCache[chave] = {
            lat: coords.lat,
            lng: coords.lng,
            origem: String(coords.origem || ''),
            assinatura: assinaturaLocalizacaoHotel(hotel),
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

    adicionarHotelNoMapa(hotel, coords) {
        const latLng = [coords.lat, coords.lng];
        this.bounds.push(latLng);

        const marcador = L.circleMarker(latLng, {
            radius: 8,
            color: '#ffffff',
            weight: 2,
            fillColor: COR_MARCADOR,
            fillOpacity: 0.9
        }).addTo(this.layer).bindPopup(this.montarPopup(hotel, coords));
        this.marcadores.set(chaveHotel(hotel), marcador);

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

    montarPopup(hotel, coords) {
        const nome = hotel.nome || hotel.razao_social || 'Hotel sem nome';
        const endereco = montarEndereco(hotel);
        const chave = chaveHotel(hotel);

        return `
            <div class="hotel-mapa-popup" data-hotel-chave="${escapeHtml(chave)}">
                <strong>${escapeHtml(nome)}</strong>
                <p><b>Razao Social:</b> ${escapeHtml(hotel.razao_social || '-')}</p>
                <p><b>CNPJ:</b> ${escapeHtml(hotel.cnpj || '-')}</p>
                <p><b>Telefone:</b> ${escapeHtml(hotel.telefone || '-')}</p>
                <p><b>Responsavel:</b> ${escapeHtml(hotel.responsavel || '-')}</p>
                <p>${escapeHtml(endereco || 'Endereco nao informado')}</p>
                <a href="${googleMapsUrl(hotel, coords)}" target="_blank" rel="noopener noreferrer">Abrir no Google Maps</a>
                <div class="hotel-mapa-coordenadas">
                    <label>Geolocalizacao
                        <input type="text" class="hotel-mapa-geolocalizacao" value="${escapeHtml(`${Number(coords.lat).toFixed(6)}, ${Number(coords.lng).toFixed(6)}`)}" placeholder="-24.70713905086516, -47.561149054910686">
                    </label>
                    <button type="button" data-action="atualizar-coordenadas-hotel" data-hotel-chave="${escapeHtml(chave)}">
                        Atualizar coordenadas
                    </button>
                    <small class="hotel-mapa-update-status"></small>
                </div>
            </div>
        `;
    },

    encontrarLocalizadoPorChave(chave) {
        return this.localizados.find(({ hotel }) => chaveHotel(hotel) === chave) || null;
    },

    obterCoordenadasPopup(container) {
        const input = container?.querySelector('.hotel-mapa-geolocalizacao');
        const raw = cleanCell(input?.value);

        const coordenadasColadas = parseGeolocalizacao(raw);
        if (coordenadasColadas) {
            if (input) input.value = `${coordenadasColadas.lat.toFixed(6)}, ${coordenadasColadas.lng.toFixed(6)}`;
            return coordenadasColadas;
        }

        return null;
    },

    async atualizarCoordenadasHotel(botao) {
        const chave = botao.dataset.hotelChave;
        const container = botao.closest('.hotel-mapa-popup');
        const status = container?.querySelector('.hotel-mapa-update-status');
        const coordsForm = this.obterCoordenadasPopup(container);
        const localizado = this.encontrarLocalizadoPorChave(chave);

        if (!localizado) {
            if (status) status.textContent = 'Hotel nao encontrado no mapa.';
            return;
        }
        if (!coordsForm) {
            if (status) status.textContent = 'Cole no formato -24.70713905086516, -47.561149054910686.';
            return;
        }
        if (!cleanCell(localizado.hotel.id)) {
            if (status) status.textContent = 'Hotel sem identificador para atualizar.';
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
                .from('hoteis')
                .update({ geolocalizacao: textoCoordenadas })
                .eq('id', localizado.hotel.id);
            if (error) throw error;

            localizado.hotel.geolocalizacao = textoCoordenadas;
            localizado.coords = { lat, lng, origem: 'geolocalizacao atualizada' };
            this.salvarCoordenadasCache(localizado.hotel, localizado.coords);
            this.persistirCacheCoordenadas();
            this.atualizarMarcadorHotel(chave, localizado.hotel, localizado.coords);

            if (status) status.textContent = 'Coordenadas atualizadas.';
        } catch (error) {
            console.error('Erro ao atualizar coordenadas do hotel:', error);
            if (status) status.textContent = 'Erro ao salvar coordenadas.';
        } finally {
            botao.disabled = false;
            botao.textContent = textoOriginal;
        }
    },

    atualizarMarcadorHotel(chave, hotel, coords) {
        const marcador = this.marcadores.get(chave);
        if (!marcador) return;

        marcador.setLatLng([coords.lat, coords.lng]);
        marcador.setPopupContent(this.montarPopup(hotel, coords));
        marcador.openPopup();
        this.bounds = this.localizados.map((item) => [item.coords.lat, item.coords.lng]);
        this.ajustarMapaAosPontos(false);
    },

    atualizarResumo() {
        this.totalHoteis.textContent = this.hoteis.length.toLocaleString('pt-BR');
        this.totalLocalizados.textContent = this.localizados.length.toLocaleString('pt-BR');

        if (!this.pendentes.length) {
            this.pendentesEl.textContent = 'Nenhum.';
            if (this.btnExportarPendentes) this.btnExportarPendentes.hidden = true;
            return;
        }

        if (this.btnExportarPendentes) this.btnExportarPendentes.hidden = false;

        this.pendentesEl.innerHTML = `
            <ul>
                ${this.pendentes.slice(0, 80).map((hotel) => `
                    <li>${escapeHtml(hotel.nome || hotel.razao_social || 'Hotel sem nome')}</li>
                `).join('')}
            </ul>
            ${this.pendentes.length > 80 ? `<p>Mais ${(this.pendentes.length - 80).toLocaleString('pt-BR')} hotel(is) nao exibidos.</p>` : ''}
        `;
    },

    exportarPendentesXlsx() {
        if (typeof window.XLSX === 'undefined') {
            this.setStatus('Biblioteca XLSX nao carregada. Atualize a pagina e tente novamente.');
            return;
        }
        if (!this.pendentes.length) return;

        const dados = this.pendentes.map((hotel) => ({
            'RAZÃO SOCIAL': hotel.razao_social || '',
            'NOME FANTASIA': hotel.nome || '',
            'CNPJ': hotel.cnpj || '',
            'TELEFONE': hotel.telefone || '',
            'RESPONSÁVEL': hotel.responsavel || '',
            'ENDEREÇO': montarEndereco(hotel)
        }));

        const worksheet = window.XLSX.utils.json_to_sheet(dados);
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, 'NAO LOCALIZADOS');
        window.XLSX.writeFile(workbook, `hoteis_nao_localizados_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    setStatus(message) {
        if (this.status) this.status.textContent = message;
    }
};

document.addEventListener('DOMContentLoaded', () => HoteisMapaUI.init());
