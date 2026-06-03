import { supabaseClient } from './supabase.js';

const MapaUI = {
    map: null,
    activeRouteId: null,
    activeRouteColor: '#3388ff',
    routeLayers: L.layerGroup(), // Camada para marcadores e linhas da rota ativa
    routingControl: null, // Controle de roteamento
    routingLineColor: '#006937',

    init() {
        // Proteção de Rota
        if (!localStorage.getItem('usuarioLogado')) {
            window.location.href = 'index.html';
            return;
        }
        this.cacheDOM();
        this.initMap();
        this.bindEvents();
        this.loadSupervisores();
        this.loadRoutes();
    },

    cacheDOM() {
        this.mapContainer = document.getElementById('map');
        this.formNovaRota = document.getElementById('formNovaRota');
        this.listaRotas = document.getElementById('listaRotas');
        this.painelPontos = document.getElementById('painelPontos');
        this.tituloPainelPontos = document.getElementById('tituloPainelPontos');
        this.listaPontos = document.getElementById('listaPontos');
        this.rotaInfo = document.getElementById('rotaInfo');
        this.distanciaRota = document.getElementById('distanciaRota');
        this.tempoRota = document.getElementById('tempoRota');
        this.btnFecharRota = document.getElementById('btnFecharRota');
        this.inputOrigem = document.getElementById('inputOrigem');
        this.inputDestino = document.getElementById('inputDestino');
        this.btnTracarRotaInteligente = document.getElementById('btnTracarRotaInteligente');
        this.supervisorNovaRota = document.getElementById('supervisorNovaRota');
        this.listaSupervisoresMapa = document.getElementById('listaSupervisoresMapa');
        this.formNovaParada = document.getElementById('formNovaParada');
        this.clienteNovaParada = document.getElementById('clienteNovaParada');
        this.enderecoNovaParada = document.getElementById('enderecoNovaParada');
        this.observacaoNovaParada = document.getElementById('observacaoNovaParada');
    },

    initMap() {
        // Coordenadas centradas no Brasil
        this.map = L.map('map').setView([-14.235, -51.925], 4);

        // Adiciona o mapa base (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);

        // Adiciona o grupo de camadas ao mapa
        this.routeLayers.addTo(this.map);

        // Adiciona controle de busca de endereços (Lupa)
        L.Control.geocoder({
            // Trocando para Photon para ter sugestões enquanto digita (autocomplete)
            geocoder: L.Control.Geocoder.photon({
                geocodingQueryParams: { lang: 'pt', countrycodes: 'BR' } // Prioriza resultados em português e no Brasil
            }),
            defaultMarkGeocode: true,
            showResultIcons: false,
            usemapBounds: false,
            collapsed: true,
            placeholder: 'Buscar endereço...',
            errorMessage: 'Não encontrado.'
        }).addTo(this.map);

        // Adiciona controle de rotas (Painel A -> B)
        this.routingControl = L.Routing.control({
            waypoints: [], // Inicia vazio
            routeWhileDragging: true,
            geocoder: L.Control.Geocoder.photon({ geocodingQueryParams: { lang: 'pt', countrycodes: 'BR' } }), // Autocomplete também na rota
            showAlternatives: true, // Permite mostrar rotas alternativas
            language: 'pt-BR',
            createMarker: function() { return null; }, // Não cria marcadores padrão (usamos os nossos personalizados)
            lineOptions: {
                styles: [{color: this.routingLineColor, opacity: 0.85, weight: 5}] // Estilo da linha da rota
            }
        }).addTo(this.map);

        // Evento disparado quando uma rota é encontrada/calculada
        this.routingControl.on('routesfound', (e) => {
            const routes = e.routes;
            const summary = routes[0].summary;
            // Converte metros para km e segundos para minutos
            const km = (summary.totalDistance / 1000).toFixed(1);
            const tempo = Math.round(summary.totalTime / 60);
            
            if (this.distanciaRota) this.distanciaRota.innerText = `${km} km`;
            if (this.tempoRota) this.tempoRota.innerText = `${tempo} min`;
            if (this.rotaInfo) this.rotaInfo.style.display = 'block';
            this.aplicarCorNoTracado();
        });

        // Evento de clique no mapa para adicionar novo ponto
        this.map.on('click', (e) => this.handleMapClick(e));
    },

    bindEvents() {
        this.formNovaRota.addEventListener('submit', (e) => this.handleNewRoute(e));
        if (this.formNovaParada) this.formNovaParada.addEventListener('submit', (e) => this.handleNewStop(e));
        if (this.btnFecharRota) this.btnFecharRota.addEventListener('click', () => this.closeRouteLoop());
        if (this.btnTracarRotaInteligente) this.btnTracarRotaInteligente.addEventListener('click', () => this.tracarRotaInteligente());
    },

    // --- LÓGICA DE ROTAS ---

    async loadSupervisores() {
        if (!this.listaSupervisoresMapa) return;

        try {
            const { data, error } = await supabaseClient
                .from('supervisores')
                .select('nome, nome_completo')
                .eq('status', 'ATIVO')
                .order('nome', { ascending: true });

            if (error) throw error;

            const supervisores = [...new Set((data || [])
                .map(item => item.nome_completo || item.nome)
                .filter(Boolean))]
                .sort();

            this.listaSupervisoresMapa.innerHTML = supervisores
                .map(nome => `<option value="${this.escapeHtml(nome)}"></option>`)
                .join('');
        } catch (err) {
            console.error('Erro ao carregar supervisores do mapa:', err);
        }
    },

    async loadRoutes() {
        this.listaRotas.innerHTML = '<li>Carregando...</li>';
        try {
            const { data: rotas, error } = await supabaseClient
                .from('mapa_rotas')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.renderRouteList(rotas);
        } catch (err) {
            console.error("Erro ao carregar rotas:", err);
            this.listaRotas.innerHTML = '<li>Erro ao carregar rotas.</li>';
        }
    },

    renderRouteList(rotas) {
        this.listaRotas.innerHTML = '';
        if (rotas.length === 0) {
            this.listaRotas.innerHTML = '<li>Nenhuma rota cadastrada.</li>';
            return;
        }

        const grupos = rotas.reduce((acc, rota) => {
            const supervisor = rota.supervisor || 'Sem supervisor';
            if (!acc[supervisor]) acc[supervisor] = [];
            acc[supervisor].push(rota);
            return acc;
        }, {});

        Object.keys(grupos).sort().forEach(supervisor => {
            const grupoLi = document.createElement('li');
            grupoLi.className = 'route-group-title';
            grupoLi.innerHTML = `<i class="fas fa-user-tie"></i> ${this.escapeHtml(supervisor)}`;
            this.listaRotas.appendChild(grupoLi);

            grupos[supervisor].forEach(rota => {
                const li = document.createElement('li');
                li.className = 'route-item';
                li.dataset.routeId = rota.id;
                li.innerHTML = `
                    <span class="item-name" style="flex-direction: column; align-items: flex-start; gap: 2px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span class="color-swatch" style="background-color: ${this.escapeHtml(rota.cor_rgb || '#3388ff')};"></span>
                            <strong>${this.escapeHtml(rota.nome_rota)}</strong>
                        </div>
                        ${rota.supervisor ? `<small style="color: #006937; font-weight: bold; font-size: 0.85em; margin-left: 25px;">Sup: ${this.escapeHtml(rota.supervisor)}</small>` : ''}
                        ${rota.endereco ? `<small style="color: #666; font-size: 0.85em; margin-left: 25px;">${this.escapeHtml(rota.endereco)}</small>` : ''}
                    </span>
                    <span class="item-actions">
                        <button class="btn-delete-route" title="Excluir Rota"><i class="fas fa-trash"></i></button>
                    </span>
                `;

                li.querySelector('.item-name').addEventListener('click', () => this.selectRoute(rota.id, rota.nome_rota, rota.cor_rgb));

                li.querySelector('.btn-delete-route').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteRoute(rota.id, rota.nome_rota);
                });

                this.listaRotas.appendChild(li);
            });
        });
    },

    async handleNewRoute(e) {
        e.preventDefault();
        const nomeInput = document.getElementById('nomeNovaRota');
        const corInput = document.getElementById('corNovaRota');
        const enderecoInput = document.getElementById('enderecoNovaRota');
        const supervisorInput = document.getElementById('supervisorNovaRota');
        const nome = nomeInput.value.trim();
        const cor = corInput.value;
        const endereco = enderecoInput ? enderecoInput.value.trim() : null;
        const supervisor = supervisorInput ? supervisorInput.value.trim() : null;

        if (!nome) {
            alert('O nome da rota é obrigatório.');
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('mapa_rotas')
                .insert({ nome_rota: nome, cor_rgb: cor, endereco: endereco, supervisor: supervisor });

            if (error) throw error;

            alert('Rota criada com sucesso!');
            nomeInput.value = '';
            if(enderecoInput) enderecoInput.value = '';
            if(supervisorInput) supervisorInput.value = '';
            this.loadRoutes();

        } catch (err) {
            console.error('Erro ao criar rota:', err);
            alert('Erro ao criar rota.');
        }
    },

    async deleteRoute(routeId, routeName) {
        if (!confirm(`Tem certeza que deseja excluir a rota "${routeName}" e todos os seus pontos?`)) {
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('mapa_rotas')
                .delete()
                .eq('id', routeId);

            if (error) throw error;

            alert('Rota excluída com sucesso.');
            
            // Se a rota excluída era a ativa, limpa o painel
            if (this.activeRouteId === routeId) {
                this.activeRouteId = null;
                this.painelPontos.classList.add('hidden');
                this.routeLayers.clearLayers();
                if (this.routingControl) this.routingControl.setWaypoints([]);
                if (this.rotaInfo) this.rotaInfo.style.display = 'none';
            }
            
            this.loadRoutes();

        } catch (err) {
            console.error('Erro ao excluir rota:', err);
            alert('Erro ao excluir rota.');
        }
    },

    async selectRoute(routeId, routeName, routeColor) {
        this.activeRouteId = routeId;
        this.activeRouteColor = routeColor || '#3388ff';
        this.setRoutingColor(this.activeRouteColor);

        // Destaca a rota ativa na lista
        document.querySelectorAll('#listaRotas li.route-item').forEach(li => {
            li.classList.toggle('active', li.dataset.routeId === routeId);
        });

        // Mostra e atualiza o painel de pontos
        this.tituloPainelPontos.innerHTML = `<i class="fas fa-map-marker-alt"></i> Pontos da Rota: <strong>${routeName}</strong>`;
        this.painelPontos.classList.remove('hidden');

        await this.loadAndDrawPoints(routeId, routeColor);
    },

    // --- LÓGICA DE PONTOS/MARCADORES ---

    async handleMapClick(e) {
        if (!this.activeRouteId) {
            alert('Selecione uma rota antes de adicionar um ponto.');
            return;
        }

        const { lat, lng } = e.latlng;
        const cliente = prompt("Digite o cliente ou uma descrição para esta parada:", "");

        if (cliente === null) return; // Usuário cancelou

        try {
            await this.salvarPontoRota({
                cliente_nome: cliente,
                endereco: cliente,
                latitude: lat,
                longitude: lng
            });
            this.loadAndDrawPoints(this.activeRouteId, this.activeRouteColor);

        } catch (err) {
            console.error('Erro ao adicionar ponto:', err);
            alert('Erro ao adicionar ponto no mapa.');
        }
    },

    async handleNewStop(e) {
        e.preventDefault();
        if (!this.activeRouteId) {
            alert('Selecione uma rota antes de adicionar uma parada.');
            return;
        }

        const cliente = this.clienteNovaParada.value.trim();
        const endereco = this.enderecoNovaParada.value.trim();
        const observacao = this.observacaoNovaParada.value.trim();

        if (!cliente || !endereco) {
            alert('Informe o cliente e o endereco da parada.');
            return;
        }

        const btn = this.formNovaParada.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Localizando...';
        btn.disabled = true;

        try {
            const coordenadas = await this.geocodeAddress(endereco);
            await this.salvarPontoRota({
                cliente_nome: cliente,
                endereco,
                latitude: coordenadas.lat,
                longitude: coordenadas.lng,
                observacao: observacao || null
            });

            this.formNovaParada.reset();
            await this.loadAndDrawPoints(this.activeRouteId, this.activeRouteColor);
        } catch (err) {
            console.error('Erro ao adicionar parada:', err);
            alert(err.message || 'Erro ao adicionar parada.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async loadAndDrawPoints(routeId, routeColor) {
        this.listaPontos.innerHTML = '<li>Carregando pontos...</li>';
        this.routeLayers.clearLayers(); // Limpa marcadores e linhas antigas
        this.activeRouteColor = routeColor || this.activeRouteColor || '#3388ff';
        this.setRoutingColor(this.activeRouteColor);
        if (this.routingControl) {
            this.routingControl.setWaypoints([]); // Limpa a rota antiga
            if (this.rotaInfo) this.rotaInfo.style.display = 'none'; // Esconde info até recalcular
        }

        try {
            const { data: pontos, error } = await supabaseClient
                .from('mapa_pontos')
                .select('*')
                .eq('rota_id', routeId)
                .order('ordem', { ascending: true });

            if (error) throw error;

            this.renderPointList(pontos);
            this.drawPointsOnMap(pontos, routeColor);

        } catch (err) {
            console.error('Erro ao carregar pontos:', err);
            this.listaPontos.innerHTML = '<li>Erro ao carregar pontos.</li>';
        }
    },

    async getProximaOrdemPonto() {
        const { data: pontos, error } = await supabaseClient
            .from('mapa_pontos')
            .select('ordem')
            .eq('rota_id', this.activeRouteId)
            .order('ordem', { ascending: false })
            .limit(1);

        if (error) throw error;
        return pontos?.length ? Number(pontos[0].ordem || 0) + 1 : 1;
    },

    async salvarPontoRota(dados) {
        const proximaOrdem = await this.getProximaOrdemPonto();
        const payload = {
            rota_id: this.activeRouteId,
            cliente_nome: dados.cliente_nome || null,
            endereco: dados.endereco || dados.cliente_nome || null,
            latitude: dados.latitude,
            longitude: dados.longitude,
            ordem: proximaOrdem,
            observacao: dados.observacao || null
        };

        const { error } = await supabaseClient
            .from('mapa_pontos')
            .insert(payload);

        if (!error) return;

        const mensagem = String(error.message || '');
        if (!mensagem.includes('cliente_nome')) throw error;

        const { cliente_nome, ...payloadSemClienteNome } = payload;
        if (cliente_nome && payloadSemClienteNome.endereco) {
            payloadSemClienteNome.endereco = `${cliente_nome} - ${payloadSemClienteNome.endereco}`;
        }
        const { error: fallbackError } = await supabaseClient
            .from('mapa_pontos')
            .insert(payloadSemClienteNome);

        if (fallbackError) throw fallbackError;
    },

    geocodeAddress(endereco) {
        const geocoder = L.Control.Geocoder.photon({
            geocodingQueryParams: { lang: 'pt', countrycodes: 'BR' }
        });

        return new Promise((resolve, reject) => {
            geocoder.geocode(endereco, (results) => {
                if (results && results.length > 0) {
                    resolve(results[0].center);
                    return;
                }
                reject(new Error(`Endereco nao encontrado: ${endereco}`));
            });
        });
    },

    renderPointList(pontos) {
        this.listaPontos.innerHTML = '';
        if (pontos.length === 0) {
            this.listaPontos.innerHTML = '<li>Nenhum ponto nesta rota.</li>';
            return;
        }

        pontos.forEach(ponto => {
            const li = document.createElement('li');
            li.dataset.pointId = ponto.id;
            const cliente = ponto.cliente_nome || ponto.endereco || `Ponto (${Number(ponto.latitude).toFixed(2)}, ${Number(ponto.longitude).toFixed(2)})`;
            const endereco = ponto.cliente_nome && ponto.endereco ? `<small>${this.escapeHtml(ponto.endereco)}</small>` : '';
            li.innerHTML = `
                <span class="item-name">
                    <span class="color-swatch" style="background-color: #6c757d;"></span>
                    <span class="point-text">
                        <strong>${ponto.ordem}. ${this.escapeHtml(cliente)}</strong>
                        ${endereco}
                    </span>
                </span>
                <span class="item-actions">
                    <button class="btn-delete-point" title="Excluir Ponto"><i class="fas fa-trash"></i></button>
                </span>
            `;
            
            li.querySelector('.btn-delete-point').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePoint(ponto.id);
            });

            this.listaPontos.appendChild(li);
        });
    },

    drawPointsOnMap(pontos, routeColor) {
        if (pontos.length === 0) return;

        const latLngs = [];

        pontos.forEach(ponto => {
            const latLng = [ponto.latitude, ponto.longitude];
            latLngs.push(latLng);

            const marker = L.marker(latLng).addTo(this.routeLayers);
            const clientePopup = ponto.cliente_nome || ponto.endereco || 'Localizacao sem nome';
            const enderecoPopup = ponto.cliente_nome && ponto.endereco ? `<br>${this.escapeHtml(ponto.endereco)}` : '';
            const observacaoPopup = ponto.observacao ? `<br><small>${this.escapeHtml(ponto.observacao)}</small>` : '';
            marker.bindPopup(`<b>${ponto.ordem}. ${this.escapeHtml(clientePopup)}</b>${enderecoPopup}${observacaoPopup}`);
        });

        // Calcula e desenha a trajetória usando o Routing Machine
        if (this.routingControl) {
            this.routingControl.setWaypoints(latLngs);
        }

        if (latLngs.length === 1) {
            // Se houver apenas um ponto, centraliza nele
            this.map.setView(latLngs[0], 13);
        }
    },

    async deletePoint(pointId) {
        if (!confirm('Tem certeza que deseja excluir este ponto?')) return;

        try {
            const { error } = await supabaseClient
                .from('mapa_pontos')
                .delete()
                .eq('id', pointId);

            if (error) throw error;

            // Recarrega e redesenha os pontos da rota ativa
            this.loadAndDrawPoints(this.activeRouteId, this.activeRouteColor);

        } catch (err) {
            console.error('Erro ao excluir ponto:', err);
            alert('Erro ao excluir ponto.');
        }
    },

    async closeRouteLoop() {
        if (!this.activeRouteId) return;

        try {
            const { data: pontos, error } = await supabaseClient
                .from('mapa_pontos')
                .select('*')
                .eq('rota_id', this.activeRouteId)
                .order('ordem', { ascending: true });

            if (error) throw error;

            if (!pontos || pontos.length === 0) {
                alert('Adicione pontos à rota antes de finalizar.');
                return;
            }

            const primeiroPonto = pontos[0];
            const ultimoPonto = pontos[pontos.length - 1];

            // Verifica se já está fechado (coordenadas muito próximas)
            if (pontos.length > 1 && 
                Math.abs(primeiroPonto.latitude - ultimoPonto.latitude) < 0.00001 && 
                Math.abs(primeiroPonto.longitude - ultimoPonto.longitude) < 0.00001) {
                alert('A rota já termina no ponto inicial.');
                return;
            }

            const proximaOrdem = ultimoPonto.ordem + 1;

            const { error: insertError } = await supabaseClient
                .from('mapa_pontos')
                .insert({
                    rota_id: this.activeRouteId,
                    endereco: primeiroPonto.endereco + ' (Retorno)',
                    latitude: primeiroPonto.latitude,
                    longitude: primeiroPonto.longitude,
                    ordem: proximaOrdem,
                    observacao: 'Retorno ao ponto inicial'
                });

            if (insertError) throw insertError;

            // Recarrega a rota
            this.loadAndDrawPoints(this.activeRouteId, this.activeRouteColor);

        } catch (err) {
            console.error('Erro ao fechar rota:', err);
            alert('Erro ao finalizar rota.');
        }
    },

    setRoutingColor(color) {
        this.routingLineColor = color || '#3388ff';
        if (!this.routingControl) return;
        this.routingControl.options.lineOptions = {
            ...(this.routingControl.options.lineOptions || {}),
            styles: [{ color: this.routingLineColor, opacity: 0.85, weight: 5 }]
        };
        this.aplicarCorNoTracado();
    },

    aplicarCorNoTracado() {
        if (!this.routingControl || !this.routingLineColor) return;

        const linhas = [
            this.routingControl._line,
            ...(this.routingControl._alternatives || [])
        ].filter(Boolean);

        linhas.forEach((linha, index) => {
            if (typeof linha.setStyle === 'function') {
                linha.setStyle({
                    color: this.routingLineColor,
                    opacity: index === 0 ? 0.85 : 0.35,
                    weight: index === 0 ? 5 : 4
                });
            }
        });
    },

    async tracarRotaInteligente() {
        const origem = this.inputOrigem.value;
        const destino = this.inputDestino.value;

        if (!origem || !destino) {
            alert('Por favor, informe o Ponto Inicial e o Ponto Final.');
            return;
        }

        const btn = this.btnTracarRotaInteligente;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...';
        btn.disabled = true;

        const geocoder = L.Control.Geocoder.nominatim();
        
        const geocode = (query) => new Promise((resolve, reject) => {
            geocoder.geocode(query, (results) => {
                if (results && results.length > 0) resolve(results[0].center);
                else reject('Endereço não encontrado: ' + query);
            });
        });

        try {
            const startCoords = await geocode(origem);
            const endCoords = await geocode(destino);

            // Limpa rotas anteriores e define os novos pontos
            this.setRoutingColor(this.activeRouteColor || '#006937');
            this.routingControl.setWaypoints([
                startCoords,
                endCoords
            ]);
            
            this.routeLayers.clearLayers();
            L.marker(startCoords).addTo(this.routeLayers).bindPopup('<b>Origem</b><br>' + origem);
            L.marker(endCoords).addTo(this.routeLayers).bindPopup('<b>Destino</b><br>' + destino);

        } catch (e) {
            alert(e);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
};

// Inicializa a UI quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    MapaUI.init();
});
