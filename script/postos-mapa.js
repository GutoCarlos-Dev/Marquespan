import { supabaseClient } from './supabase.js';

const GEOAPIFY_API_KEY = '0f54f744cbbb4620b9eb08a407a2a40f';
const MAX_GEOCODE_ENDERECOS = 300;
const CACHE_COORDENADAS_KEY = 'postos_mapa_coord_cache_v1';
const CACHE_COORDENADAS_MAX = 2000;
const COR_MARCADOR = '#f97316';

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

function montarEndereco(posto) {
    return [posto.endereco, posto.cidade, posto.uf, 'Brasil'].map(cleanCell).filter(Boolean).join(', ');
}

function normalizarAssinatura(value) {
    return cleanCell(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
}

function chavePosto(posto) {
    return cleanCell(posto.id) || normalizarAssinatura([posto.razao_social, posto.cnpj, montarEndereco(posto)].filter(Boolean).join('|'));
}

function assinaturaLocalizacaoPosto(posto) {
    return [posto.geolocalizacao, montarEndereco(posto)].map(normalizarAssinatura).join('|');
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

function googleMapsUrl(posto, coords) {
    const query = coords
        ? `${coords.lat},${coords.lng}`
        : montarEndereco(posto);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const PostosMapaUI = {
    map: null,
    layer: null,
    postos: [],
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
        this.processarPostos();
    },

    cache() {
        this.status = document.getElementById('postosMapaStatus');
        this.totalPostos = document.getElementById('mapaTotalPostos');
        this.totalLocalizados = document.getElementById('mapaTotalLocalizados');
        this.pendentesEl = document.getElementById('postosMapaPendentes');
        this.btnExportarPendentes = document.getElementById('btnExportarPendentesPostos');
    },

    bindEvents() {
        this.btnExportarPendentes?.addEventListener('click', () => this.exportarPendentesXlsx());

        document.addEventListener('click', (event) => {
            const botao = event.target.closest('[data-action="atualizar-coordenadas-posto"]');
            if (botao) this.atualizarCoordenadasPosto(botao);
        });
    },

    initMap() {
        this.map = L.map('postosMapa').setView([-23.330692, -47.851799], 7);
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
            const payload = JSON.parse(localStorage.getItem('postos_mapa_payload') || sessionStorage.getItem('postos_mapa_payload') || 'null');
            this.postos = Array.isArray(payload?.postos) ? payload.postos : [];
        } catch {
            this.postos = [];
        }

        if (!this.postos.length) {
            this.setStatus('Nenhum posto recebido. Volte para Cadastro de Posto e clique em Localizar no Mapa novamente.');
        }
    },

    async processarPostos() {
        if (!this.postos.length) {
            this.atualizarResumo();
            return;
        }

        this.setStatus(`Localizando ${this.postos.length.toLocaleString('pt-BR')} posto(s)...`);
        let geocodificados = 0;

        for (const posto of this.postos) {
            let coords = parseGeolocalizacao(posto.geolocalizacao);
            if (!coords) coords = this.obterCoordenadasCache(posto);

            if (!coords && geocodificados < MAX_GEOCODE_ENDERECOS) {
                const endereco = montarEndereco(posto);
                try {
                    coords = await geocodificarEndereco(endereco);
                } catch (error) {
                    console.warn('Erro ao geocodificar posto:', posto.id, error);
                }
                geocodificados += 1;
            }

            if (coords) {
                this.salvarCoordenadasCache(posto, coords);
                this.localizados.push({ posto, coords });
                this.adicionarPostoNoMapa(posto, coords);
            } else {
                this.pendentes.push(posto);
            }

            const processados = this.localizados.length + this.pendentes.length;
            if (processados <= 10 || processados % 10 === 0) {
                this.atualizarResumo();
                this.setStatus(`Processados ${processados} de ${this.postos.length} posto(s)...`);
            }
            if (processados % 50 === 0) {
                this.persistirCacheCoordenadas();
            }
        }

        this.atualizarResumo();
        this.ajustarMapaAosPontos(true);
        this.persistirCacheCoordenadas();
        this.setStatus(`${this.localizados.length.toLocaleString('pt-BR')} posto(s) localizados no mapa.`);
    },

    carregarCacheCoordenadas() {
        try {
            const cache = JSON.parse(localStorage.getItem(CACHE_COORDENADAS_KEY) || '{}');
            this.coordCache = cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
        } catch {
            this.coordCache = {};
        }
    },

    obterCoordenadasCache(posto) {
        const chave = chavePosto(posto);
        const assinatura = assinaturaLocalizacaoPosto(posto);
        const item = chave ? this.coordCache[chave] : null;
        if (!item || item.assinatura !== assinatura) return null;

        const lat = Number(item.lat);
        const lng = Number(item.lng);
        if (!coordenadasValidas(lat, lng)) return null;
        const origemBase = String(item.origem || '').replace(/\s*\(cache\)\s*$/i, '') || 'cache';
        return { lat, lng, origem: `${origemBase} (cache)` };
    },

    salvarCoordenadasCache(posto, coords) {
        const chave = chavePosto(posto);
        if (!chave || !coordenadasValidas(coords.lat, coords.lng)) return;

        this.coordCache[chave] = {
            lat: coords.lat,
            lng: coords.lng,
            origem: String(coords.origem || ''),
            assinatura: assinaturaLocalizacaoPosto(posto),
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

    adicionarPostoNoMapa(posto, coords) {
        const latLng = [coords.lat, coords.lng];
        this.bounds.push(latLng);

        const marcador = L.circleMarker(latLng, {
            radius: 8,
            color: '#ffffff',
            weight: 2,
            fillColor: COR_MARCADOR,
            fillOpacity: 0.9
        }).addTo(this.layer).bindPopup(this.montarPopup(posto, coords));
        this.marcadores.set(chavePosto(posto), marcador);

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

    montarPopup(posto, coords) {
        const nome = posto.razao_social || 'Posto sem nome';
        const endereco = montarEndereco(posto);
        const chave = chavePosto(posto);

        return `
            <div class="posto-mapa-popup" data-posto-chave="${escapeHtml(chave)}">
                <strong>${escapeHtml(nome)}</strong>
                <p><b>CNPJ:</b> ${escapeHtml(posto.cnpj || '-')}</p>
                <p><b>Filial:</b> ${escapeHtml(posto.filial || '-')}</p>
                <p><b>Faturado:</b> ${posto.faturado ? 'Sim' : 'Não'}</p>
                <p>${escapeHtml(endereco || 'Endereco nao informado')}</p>
                <a href="${googleMapsUrl(posto, coords)}" target="_blank" rel="noopener noreferrer">Abrir no Google Maps</a>
                <div class="posto-mapa-coordenadas">
                    <label>Geolocalizacao
                        <input type="text" class="posto-mapa-geolocalizacao" value="${escapeHtml(`${Number(coords.lat).toFixed(6)}, ${Number(coords.lng).toFixed(6)}`)}" placeholder="-24.70713905086516, -47.561149054910686">
                    </label>
                    <button type="button" data-action="atualizar-coordenadas-posto" data-posto-chave="${escapeHtml(chave)}">
                        Atualizar coordenadas
                    </button>
                    <small class="posto-mapa-update-status"></small>
                </div>
            </div>
        `;
    },

    encontrarLocalizadoPorChave(chave) {
        return this.localizados.find(({ posto }) => chavePosto(posto) === chave) || null;
    },

    obterCoordenadasPopup(container) {
        const input = container?.querySelector('.posto-mapa-geolocalizacao');
        const raw = cleanCell(input?.value);

        const coordenadasColadas = parseGeolocalizacao(raw);
        if (coordenadasColadas) {
            if (input) input.value = `${coordenadasColadas.lat.toFixed(6)}, ${coordenadasColadas.lng.toFixed(6)}`;
            return coordenadasColadas;
        }

        return null;
    },

    async atualizarCoordenadasPosto(botao) {
        const chave = botao.dataset.postoChave;
        const container = botao.closest('.posto-mapa-popup');
        const status = container?.querySelector('.posto-mapa-update-status');
        const coordsForm = this.obterCoordenadasPopup(container);
        const localizado = this.encontrarLocalizadoPorChave(chave);

        if (!localizado) {
            if (status) status.textContent = 'Posto nao encontrado no mapa.';
            return;
        }
        if (!coordsForm) {
            if (status) status.textContent = 'Cole no formato -24.70713905086516, -47.561149054910686.';
            return;
        }
        if (!cleanCell(localizado.posto.id)) {
            if (status) status.textContent = 'Posto sem identificador para atualizar.';
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
                .from('postos')
                .update({ geolocalizacao: textoCoordenadas })
                .eq('id', localizado.posto.id);
            if (error) throw error;

            localizado.posto.geolocalizacao = textoCoordenadas;
            localizado.coords = { lat, lng, origem: 'geolocalizacao atualizada' };
            this.salvarCoordenadasCache(localizado.posto, localizado.coords);
            this.persistirCacheCoordenadas();
            this.atualizarMarcadorPosto(chave, localizado.posto, localizado.coords);

            if (status) status.textContent = 'Coordenadas atualizadas.';
        } catch (error) {
            console.error('Erro ao atualizar coordenadas do posto:', error);
            if (status) status.textContent = 'Erro ao salvar coordenadas.';
        } finally {
            botao.disabled = false;
            botao.textContent = textoOriginal;
        }
    },

    atualizarMarcadorPosto(chave, posto, coords) {
        const marcador = this.marcadores.get(chave);
        if (!marcador) return;

        marcador.setLatLng([coords.lat, coords.lng]);
        marcador.setPopupContent(this.montarPopup(posto, coords));
        marcador.openPopup();
        this.bounds = this.localizados.map((item) => [item.coords.lat, item.coords.lng]);
        this.ajustarMapaAosPontos(false);
    },

    atualizarResumo() {
        this.totalPostos.textContent = this.postos.length.toLocaleString('pt-BR');
        this.totalLocalizados.textContent = this.localizados.length.toLocaleString('pt-BR');

        if (!this.pendentes.length) {
            this.pendentesEl.textContent = 'Nenhum.';
            if (this.btnExportarPendentes) this.btnExportarPendentes.hidden = true;
            return;
        }

        if (this.btnExportarPendentes) this.btnExportarPendentes.hidden = false;

        this.pendentesEl.innerHTML = `
            <ul>
                ${this.pendentes.slice(0, 80).map((posto) => `
                    <li>${escapeHtml(posto.razao_social || 'Posto sem nome')}</li>
                `).join('')}
            </ul>
            ${this.pendentes.length > 80 ? `<p>Mais ${(this.pendentes.length - 80).toLocaleString('pt-BR')} posto(s) nao exibidos.</p>` : ''}
        `;
    },

    exportarPendentesXlsx() {
        if (typeof window.XLSX === 'undefined') {
            this.setStatus('Biblioteca XLSX nao carregada. Atualize a pagina e tente novamente.');
            return;
        }
        if (!this.pendentes.length) return;

        const dados = this.pendentes.map((posto) => ({
            'RAZÃO SOCIAL': posto.razao_social || '',
            'CNPJ': posto.cnpj || '',
            'FILIAL': posto.filial || '',
            'CIDADE': posto.cidade || '',
            'UF': posto.uf || '',
            'ENDEREÇO': montarEndereco(posto)
        }));

        const worksheet = window.XLSX.utils.json_to_sheet(dados);
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, 'NAO LOCALIZADOS');
        window.XLSX.writeFile(workbook, `postos_nao_localizados_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    setStatus(message) {
        if (this.status) this.status.textContent = message;
    }
};

document.addEventListener('DOMContentLoaded', () => PostosMapaUI.init());
