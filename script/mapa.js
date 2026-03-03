import { supabaseClient } from './supabase.js';

const MapaUI = {
    map: null,
    activeRouteId: null,
    routeLayers: L.layerGroup(), // Camada para marcadores e linhas da rota ativa
    routingControl: null, // Controle de roteamento

    init() {
        // Proteção de Rota
        if (!localStorage.getItem('usuarioLogado')) {
            window.location.href = 'index.html';
            return;
        }
        this.cacheDOM();
        this.initMap();
        this.bindEvents();
        this.loadRoutes();
    },

    cacheDOM() {
        this.mapContainer = document.getElementById('map');
        this.formNovaRota = document.getElementById('formNovaRota');
        this.listaRotas = document.getElementById('listaRotas');
        this.painelPontos = document.getElementById('painelPontos');
        this.tituloPainelPontos = document.getElementById('tituloPainelPontos');
        this.listaPontos = document.getElementById('listaPontos');
        this.btnFecharRota = document.getElementById('btnFecharRota');
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
            geocoder: L.Control.Geocoder.nominatim(),
            // feature comes from the geocoder service
            onSelect: (geocodeResult) => {
              console.log(geocodeResult);
              // Aqui você pode preencher automaticamente o campo de endereço
              // com o resultado selecionado
              // Ex: document.getElementById('endereco').value = geocodeResult.name;
            },
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
            geocoder: L.Control.Geocoder.nominatim(),
            language: 'pt-BR',
            createMarker: function() { return null; }, // Não cria marcadores padrão (usamos os nossos personalizados)
            lineOptions: {
                styles: [{color: '#006937', opacity: 0.7, weight: 5}] // Estilo da linha da rota
            }
        }).addTo(this.map);

        // Evento de clique no mapa para adicionar novo ponto
        this.map.on('click', (e) => this.handleMapClick(e));
    },

    bindEvents() {
        this.formNovaRota.addEventListener('submit', (e) => this.handleNewRoute(e));
        if (this.btnFecharRota) this.btnFecharRota.addEventListener('click', () => this.closeRouteLoop());
    },

    // --- LÓGICA DE ROTAS ---

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

        rotas.forEach(rota => {
            const li = document.createElement('li');
            li.dataset.routeId = rota.id;
            li.innerHTML = `
                <span class="item-name" style="flex-direction: column; align-items: flex-start; gap: 2px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="color-swatch" style="background-color: ${rota.cor_rgb};"></span>
                        <strong>${rota.nome_rota}</strong>
                    </div>
                    ${rota.supervisor ? `<small style="color: #006937; font-weight: bold; font-size: 0.85em; margin-left: 25px;">Sup: ${rota.supervisor}</small>` : ''}
                    ${rota.endereco ? `<small style="color: #666; font-size: 0.85em; margin-left: 25px;">${rota.endereco}</small>` : ''}
                </span>
                <span class="item-actions">
                    <button class="btn-delete-route" title="Excluir Rota"><i class="fas fa-trash"></i></button>
                </span>
            `;

            // Evento para selecionar a rota
            li.querySelector('.item-name').addEventListener('click', () => this.selectRoute(rota.id, rota.nome_rota, rota.cor_rgb));

            // Evento para excluir a rota
            li.querySelector('.btn-delete-route').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteRoute(rota.id, rota.nome_rota);
            });

            this.listaRotas.appendChild(li);
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
            }
            
            this.loadRoutes();

        } catch (err) {
            console.error('Erro ao excluir rota:', err);
            alert('Erro ao excluir rota.');
        }
    },

    async selectRoute(routeId, routeName, routeColor) {
        this.activeRouteId = routeId;

        // Destaca a rota ativa na lista
        document.querySelectorAll('#listaRotas li').forEach(li => {
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
        const endereco = prompt("Digite o endereço ou uma descrição para este ponto:", "");

        if (endereco === null) return; // Usuário cancelou

        try {
            const { data: pontos } = await supabaseClient.from('mapa_pontos').select('ordem').eq('rota_id', this.activeRouteId).order('ordem', {ascending: false}).limit(1);
            const proximaOrdem = (pontos && pontos.length > 0) ? pontos[0].ordem + 1 : 1;

            const { error } = await supabaseClient
                .from('mapa_pontos')
                .insert({
                    rota_id: this.activeRouteId,
                    endereco: endereco,
                    latitude: lat,
                    longitude: lng,
                    ordem: proximaOrdem
                });

            if (error) throw error;

            // Recarrega e redesenha os pontos da rota ativa
            const activeRouteLi = document.querySelector(`#listaRotas li[data-route-id="${this.activeRouteId}"]`);
            const routeColor = activeRouteLi.querySelector('.color-swatch').style.backgroundColor;
            this.loadAndDrawPoints(this.activeRouteId, routeColor);

        } catch (err) {
            console.error('Erro ao adicionar ponto:', err);
            alert('Erro ao adicionar ponto no mapa.');
        }
    },

    async loadAndDrawPoints(routeId, routeColor) {
        this.listaPontos.innerHTML = '<li>Carregando pontos...</li>';
        this.routeLayers.clearLayers(); // Limpa marcadores e linhas antigas
        if (this.routingControl) {
            this.routingControl.setWaypoints([]); // Limpa a rota antiga
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

    renderPointList(pontos) {
        this.listaPontos.innerHTML = '';
        if (pontos.length === 0) {
            this.listaPontos.innerHTML = '<li>Nenhum ponto nesta rota.</li>';
            return;
        }

        pontos.forEach(ponto => {
            const li = document.createElement('li');
            li.dataset.pointId = ponto.id;
            li.innerHTML = `
                <span class="item-name">
                    <span class="color-swatch" style="background-color: #6c757d;"></span>
                    ${ponto.ordem}. ${ponto.endereco || `Ponto (${ponto.latitude.toFixed(2)}, ${ponto.longitude.toFixed(2)})`}
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
            const enderecoPopup = ponto.endereco || 'Localização sem nome';
            marker.bindPopup(`<b>${ponto.ordem}. ${enderecoPopup}</b><br>${ponto.observacao || ''}`);
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
            const activeRouteLi = document.querySelector(`#listaRotas li[data-route-id="${this.activeRouteId}"]`);
            const routeColor = activeRouteLi.querySelector('.color-swatch').style.backgroundColor;
            this.loadAndDrawPoints(this.activeRouteId, routeColor);

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
            const activeRouteLi = document.querySelector(`#listaRotas li[data-route-id="${this.activeRouteId}"]`);
            const routeColor = activeRouteLi ? activeRouteLi.querySelector('.color-swatch').style.backgroundColor : '#3388ff';
            this.loadAndDrawPoints(this.activeRouteId, routeColor);

        } catch (err) {
            console.error('Erro ao fechar rota:', err);
            alert('Erro ao finalizar rota.');
        }
    }
};

// Inicializa a UI quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    MapaUI.init();
});