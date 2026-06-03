import { supabaseClient } from './supabase.js';

const GEOAPIFY_API_KEY = '0f54f744cbbb4620b9eb08a407a2a40f';
const MARQUESPAN_ORIGEM = {
    label: 'Empresa Marquespan',
    endereco: 'CEP 18280-005, Tatui, SP, Brasil'
};

const MapaUI = {
    map: null,
    activeRouteId: null,
    activeRouteColor: '#3388ff',
    activeRouteOrigin: '',
    activeRouteOriginCoords: null,
    activeRouteLabel: '',
    editingRouteId: null,
    routeLayers: L.layerGroup(), // Camada para marcadores e linhas da rota ativa
    routingControl: null, // Controle de roteamento
    routingLineColor: '#006937',
    rotasOperacionais: [],
    rotasMapa: [],
    viewingAllRoutes: false,
    collapsedRouteGroups: new Set(),

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
        this.loadRotasOperacionais();
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
        this.btnVisualizarTodasRotas = document.getElementById('btnVisualizarTodasRotas');
        this.btnSalvarRotaMapa = document.getElementById('btnSalvarRotaMapa');
        this.btnCancelarEdicaoRota = document.getElementById('btnCancelarEdicaoRota');
        this.rotaCadastradaMapa = document.getElementById('rotaCadastradaMapa');
        this.listaRotasCadastradasMapa = document.getElementById('listaRotasCadastradasMapa');
        this.nomeNovaRota = document.getElementById('nomeNovaRota');
        this.corNovaRota = document.getElementById('corNovaRota');
        this.supervisorNovaRota = document.getElementById('supervisorNovaRota');
        this.enderecoNovaRota = document.getElementById('enderecoNovaRota');
        this.cidadesNovaRota = document.getElementById('cidadesNovaRota');
        this.listaSupervisoresMapa = document.getElementById('listaSupervisoresMapa');
        this.formNovaParada = document.getElementById('formNovaParada');
        this.clienteNovaParada = document.getElementById('clienteNovaParada');
        this.cepNovaParada = document.getElementById('cepNovaParada');
        this.numeroNovaParada = document.getElementById('numeroNovaParada');
        this.enderecoNovaParada = document.getElementById('enderecoNovaParada');
        this.btnBuscarCepParada = document.getElementById('btnBuscarCepParada');
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
            geocoder: L.Control.Geocoder.nominatim(),
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
            geocoder: L.Control.Geocoder.nominatim(),
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
        if (this.rotaCadastradaMapa) this.rotaCadastradaMapa.addEventListener('change', () => this.prepararNovaRotaSelecionada());
        if (this.rotaCadastradaMapa) this.rotaCadastradaMapa.addEventListener('blur', () => this.prepararNovaRotaSelecionada());
        if (this.formNovaParada) this.formNovaParada.addEventListener('submit', (e) => this.handleNewStop(e));
        if (this.btnBuscarCepParada) this.btnBuscarCepParada.addEventListener('click', () => this.buscarCepParada());
        if (this.cepNovaParada) {
            this.cepNovaParada.addEventListener('input', () => this.formatarCepInput(this.cepNovaParada));
            this.cepNovaParada.addEventListener('blur', () => {
                if (this.normalizarCep(this.cepNovaParada.value).length === 8) this.buscarCepParada();
            });
        }
        if (this.btnFecharRota) this.btnFecharRota.addEventListener('click', () => this.closeRouteLoop());
        if (this.btnTracarRotaInteligente) this.btnTracarRotaInteligente.addEventListener('click', () => this.tracarRotaInteligente());
        if (this.btnVisualizarTodasRotas) this.btnVisualizarTodasRotas.addEventListener('click', () => this.visualizarTodasRotas());
        if (this.btnCancelarEdicaoRota) this.btnCancelarEdicaoRota.addEventListener('click', () => this.limparFormularioNovaRota());
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

    async loadRotasOperacionais() {
        if (!this.listaRotasCadastradasMapa) return;

        try {
            const { data, error } = await supabaseClient
                .from('rotas')
                .select('id, numero, supervisor, cidades, filial, status')
                .order('numero', { ascending: true });

            if (error) throw error;

            this.rotasOperacionais = (data || []).filter(rota => String(rota.status || 'ATIVA').toUpperCase() !== 'INATIVA');
            this.listaRotasCadastradasMapa.innerHTML = this.rotasOperacionais
                .map(rota => `<option value="${this.escapeHtml(rota.numero)}">${this.escapeHtml(this.descreverRotaOperacional(rota))}</option>`)
                .join('');
        } catch (err) {
            console.error('Erro ao carregar rotas cadastradas:', err);
        }
    },

    descreverRotaOperacional(rota) {
        return [
            `Rota ${rota.numero || ''}`.trim(),
            rota.supervisor ? `Sup: ${rota.supervisor}` : '',
            rota.cidades || ''
        ].filter(Boolean).join(' - ');
    },

    getRotaOperacionalSelecionada() {
        const numero = String(this.rotaCadastradaMapa?.value || '').trim();
        if (!numero) return null;
        return this.rotasOperacionais.find(rota => String(rota.numero || '').trim().toUpperCase() === numero.toUpperCase()) || null;
    },

    preencherRotaOperacionalSelecionada() {
        const rota = this.getRotaOperacionalSelecionada();
        if (!rota) return null;

        this.nomeNovaRotaValue = `Rota ${rota.numero}`;
        this.nomeNovaRota.value = this.nomeNovaRotaValue;
        this.supervisorNovaRota.value = rota.supervisor || '';
        this.enderecoNovaRota.value = `${MARQUESPAN_ORIGEM.label} - ${MARQUESPAN_ORIGEM.endereco}`;
        this.cidadesNovaRota.value = rota.cidades || '';
        return rota;
    },

    prepararNovaRotaSelecionada() {
        this.editingRouteId = null;
        this.atualizarModoFormularioRota(false);
        const rotaOperacional = this.preencherRotaOperacionalSelecionada();
        if (!rotaOperacional) return;

        const ultimaRotaSupervisor = this.encontrarUltimaRotaMapaPorSupervisor(rotaOperacional.supervisor);
        this.corNovaRota.value = ultimaRotaSupervisor?.cor_rgb || '#3388ff';
    },

    preencherFormularioEdicaoRota(rota) {
        this.editingRouteId = rota.id;
        const numeroRota = this.extrairNumeroRotaMapa(rota);
        const rotaOperacional = numeroRota
            ? this.rotasOperacionais.find(item => String(item.numero || '').trim() === numeroRota)
            : null;

        this.rotaCadastradaMapa.value = numeroRota || rota.nome_rota || '';
        this.nomeNovaRota.value = rota.nome_rota || '';
        this.supervisorNovaRota.value = rota.supervisor || rotaOperacional?.supervisor || '';
        this.enderecoNovaRota.value = rota.endereco || `${MARQUESPAN_ORIGEM.label} - ${MARQUESPAN_ORIGEM.endereco}`;
        this.cidadesNovaRota.value = rotaOperacional?.cidades || '';
        this.corNovaRota.value = rota.cor_rgb || '#3388ff';
        this.atualizarModoFormularioRota(true);
    },

    extrairNumeroRotaMapa(rota) {
        const match = String(rota.nome_rota || '').match(/\d+/);
        return match ? match[0] : '';
    },

    encontrarUltimaRotaMapaPorSupervisor(supervisor) {
        const supervisorNormalizado = this.normalizarTextoBusca(supervisor);
        if (!supervisorNormalizado) return null;

        return (this.rotasMapa || []).find(rota => (
            this.normalizarTextoBusca(rota.supervisor) === supervisorNormalizado
            && rota.cor_rgb
        )) || null;
    },

    normalizarTextoBusca(texto) {
        return String(texto || '')
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .toUpperCase();
    },

    atualizarModoFormularioRota(editando) {
        if (this.btnSalvarRotaMapa) {
            this.btnSalvarRotaMapa.title = editando ? 'Salvar cor da rota' : 'Salvar Rota';
            this.btnSalvarRotaMapa.innerHTML = editando ? '<i class="fas fa-save"></i>' : '<i class="fas fa-plus"></i>';
        }
        if (this.btnCancelarEdicaoRota) {
            this.btnCancelarEdicaoRota.classList.toggle('hidden', !editando);
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

            this.rotasMapa = rotas || [];
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
            const grupoRecolhido = this.collapsedRouteGroups.has(supervisor);
            const corSupervisor = this.obterCorSupervisor(grupos[supervisor]);
            const grupoLi = document.createElement('li');
            grupoLi.className = `route-group-title${grupoRecolhido ? ' collapsed' : ''}`;
            grupoLi.dataset.supervisor = supervisor;
            grupoLi.innerHTML = `
                <span class="route-group-name">
                    <i class="fas fa-chevron-down route-group-toggle"></i>
                    <i class="fas fa-user-tie"></i>
                    ${this.escapeHtml(supervisor)}
                </span>
                <span class="route-group-actions">
                    <span class="route-count">${grupos[supervisor].length}</span>
                    <input type="color" class="supervisor-color-input" value="${this.escapeHtml(corSupervisor)}" title="Alterar cor das rotas deste supervisor">
                </span>
            `;
            grupoLi.addEventListener('click', () => this.toggleRouteGroup(supervisor));
            const supervisorColorInput = grupoLi.querySelector('.supervisor-color-input');
            supervisorColorInput.addEventListener('click', (e) => e.stopPropagation());
            supervisorColorInput.addEventListener('input', (e) => e.stopPropagation());
            supervisorColorInput.addEventListener('change', (e) => {
                e.stopPropagation();
                this.atualizarCorSupervisor(supervisor, e.target.value);
            });
            this.listaRotas.appendChild(grupoLi);

            grupos[supervisor].forEach(rota => {
                const li = document.createElement('li');
                li.className = `route-item${grupoRecolhido ? ' hidden' : ''}`;
                li.dataset.routeId = rota.id;
                li.dataset.supervisor = supervisor;
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

                li.querySelector('.item-name').addEventListener('click', () => this.selectRoute(rota));

                li.querySelector('.btn-delete-route').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteRoute(rota.id, rota.nome_rota);
                });

                this.listaRotas.appendChild(li);
            });
        });
    },

    obterCorSupervisor(rotasSupervisor = []) {
        return rotasSupervisor.find(rota => rota.cor_rgb)?.cor_rgb || '#3388ff';
    },

    toggleRouteGroup(supervisor) {
        if (this.collapsedRouteGroups.has(supervisor)) {
            this.collapsedRouteGroups.delete(supervisor);
        } else {
            this.collapsedRouteGroups.add(supervisor);
        }

        const recolhido = this.collapsedRouteGroups.has(supervisor);
        const grupoLi = [...this.listaRotas.querySelectorAll('li.route-group-title')]
            .find(item => item.dataset.supervisor === supervisor);
        if (grupoLi) grupoLi.classList.toggle('collapsed', recolhido);

        [...this.listaRotas.querySelectorAll('li.route-item')]
            .filter(item => item.dataset.supervisor === supervisor)
            .forEach(item => item.classList.toggle('hidden', recolhido));
    },

    async atualizarCorSupervisor(supervisor, cor) {
        const routeIds = (this.rotasMapa || [])
            .filter(rota => (rota.supervisor || 'Sem supervisor') === supervisor)
            .map(rota => rota.id);

        if (!routeIds.length) return;

        try {
            const { error } = await supabaseClient
                .from('mapa_rotas')
                .update({ cor_rgb: cor })
                .in('id', routeIds);

            if (error) throw error;

            const rotaAtivaAtualizada = this.activeRouteId && routeIds.includes(this.activeRouteId);
            const estavaVisualizandoTodas = this.viewingAllRoutes;

            await this.loadRoutes();

            if (estavaVisualizandoTodas) {
                await this.visualizarTodasRotas();
                return;
            }

            if (rotaAtivaAtualizada) {
                const rotaAtualizada = this.rotasMapa.find(rota => rota.id === this.activeRouteId);
                if (rotaAtualizada) await this.selectRoute(rotaAtualizada);
            }
        } catch (err) {
            console.error('Erro ao atualizar cor do supervisor:', err);
            alert('Erro ao atualizar a cor das rotas deste supervisor.');
            await this.loadRoutes();
        }
    },

    async handleNewRoute(e) {
        e.preventDefault();
        const corInput = this.corNovaRota || document.getElementById('corNovaRota');
        const cor = corInput.value;

        if (this.editingRouteId) {
            await this.atualizarCorRotaEditada(cor);
            return;
        }

        const rotaOperacional = this.getRotaOperacionalSelecionada();
        const nome = rotaOperacional ? `Rota ${rotaOperacional.numero}` : '';
        const endereco = `${MARQUESPAN_ORIGEM.label} - ${MARQUESPAN_ORIGEM.endereco}`;
        const supervisor = rotaOperacional?.supervisor || null;

        if (!rotaOperacional) {
            alert('Selecione uma rota cadastrada antes de salvar no mapa.');
            return;
        }

        if (!this.extrairCidadesRota(rotaOperacional.cidades).length) {
            alert('A rota selecionada nao possui cidades cadastradas.');
            return;
        }

        try {
            const { data: rotaMapa, error } = await supabaseClient
                .from('mapa_rotas')
                .insert({ nome_rota: nome, cor_rgb: cor, endereco, supervisor })
                .select('*')
                .single();

            if (error) throw error;

            const resultado = await this.criarPontosDaRotaOperacional(rotaMapa.id, rotaOperacional);
            alert(`Rota criada com sucesso! Pontos gerados: ${resultado.criados}. ${resultado.falhas.length ? `Nao localizados: ${resultado.falhas.join(', ')}` : ''}`);
            this.limparFormularioNovaRota();
            await this.loadRoutes();
            await this.selectRoute(rotaMapa);

        } catch (err) {
            console.error('Erro ao criar rota:', err);
            alert(err.message || 'Erro ao criar rota.');
        }
    },

    async atualizarCorRotaEditada(cor) {
        try {
            const { data: rotaAtualizada, error } = await supabaseClient
                .from('mapa_rotas')
                .update({ cor_rgb: cor })
                .eq('id', this.editingRouteId)
                .select('*')
                .single();

            if (error) throw error;

            alert('Cor da rota atualizada com sucesso.');
            await this.loadRoutes();
            await this.selectRoute(rotaAtualizada);
        } catch (err) {
            console.error('Erro ao atualizar cor da rota:', err);
            alert(err.message || 'Erro ao atualizar cor da rota.');
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

            if (this.editingRouteId === routeId) {
                this.limparFormularioNovaRota();
            }
            
            this.loadRoutes();

        } catch (err) {
            console.error('Erro ao excluir rota:', err);
            alert('Erro ao excluir rota.');
        }
    },

    limparFormularioNovaRota() {
        this.editingRouteId = null;
        this.rotaCadastradaMapa.value = '';
        this.nomeNovaRota.value = '';
        this.corNovaRota.value = '#3388ff';
        this.supervisorNovaRota.value = '';
        this.enderecoNovaRota.value = `${MARQUESPAN_ORIGEM.label} - ${MARQUESPAN_ORIGEM.endereco}`;
        this.cidadesNovaRota.value = '';
        this.atualizarModoFormularioRota(false);
    },

    extrairCidadesRota(cidades) {
        return [...new Set(String(cidades || '')
            .split(/[\/;,|\n]+|\s+-\s+/)
            .map(cidade => cidade.trim())
            .filter(Boolean))];
    },

    async criarPontosDaRotaOperacional(rotaMapaId, rotaOperacional) {
        const pontos = [];
        const falhas = [];
        const cidades = this.extrairCidadesRota(rotaOperacional.cidades);

        const origemCoords = await this.geocodeAddress(MARQUESPAN_ORIGEM.endereco);
        pontos.push({
            rota_id: rotaMapaId,
            cliente_nome: `${MARQUESPAN_ORIGEM.label} (Inicio)`,
            endereco: MARQUESPAN_ORIGEM.endereco,
            latitude: origemCoords.lat,
            longitude: origemCoords.lng,
            ordem: 1,
            observacao: 'Ponto inicial da rota'
        });

        for (const cidade of cidades) {
            try {
                const coords = await this.geocodeAddress(this.montarEnderecoCidade(cidade, rotaOperacional));
                pontos.push({
                    rota_id: rotaMapaId,
                    cliente_nome: cidade,
                    endereco: this.montarEnderecoCidade(cidade, rotaOperacional),
                    latitude: coords.lat,
                    longitude: coords.lng,
                    ordem: pontos.length + 1,
                    observacao: 'Cidade cadastrada na rota'
                });
            } catch (err) {
                console.warn('Cidade nao localizada:', cidade, err);
                falhas.push(cidade);
            }
        }

        pontos.push({
            rota_id: rotaMapaId,
            cliente_nome: `${MARQUESPAN_ORIGEM.label} (Retorno)`,
            endereco: MARQUESPAN_ORIGEM.endereco,
            latitude: origemCoords.lat,
            longitude: origemCoords.lng,
            ordem: pontos.length + 1,
            observacao: 'Retorno ao ponto inicial'
        });

        const { error } = await supabaseClient
            .from('mapa_pontos')
            .insert(pontos);

        if (!error) return { criados: pontos.length, falhas };

        const mensagem = String(error.message || '');
        if (!mensagem.includes('cliente_nome')) throw error;

        const pontosSemClienteNome = pontos.map(({ cliente_nome, ...ponto }) => ({
            ...ponto,
            endereco: cliente_nome ? `${cliente_nome} - ${ponto.endereco}` : ponto.endereco
        }));

        const { error: fallbackError } = await supabaseClient
            .from('mapa_pontos')
            .insert(pontosSemClienteNome);

        if (fallbackError) throw fallbackError;
        return { criados: pontos.length, falhas };
    },

    montarEnderecoCidade(cidade, rotaOperacional = {}) {
        const cidadeNormalizada = String(cidade || '').trim();
        if (/\b[A-Z]{2}\b/i.test(cidadeNormalizada) || cidadeNormalizada.includes(',')) {
            return `${cidadeNormalizada}, Brasil`;
        }

        const ufPadrao = String(rotaOperacional.filial || '').trim().length === 2
            ? rotaOperacional.filial
            : 'SP';
        return `${cidadeNormalizada}, ${ufPadrao}, Brasil`;
    },

    async selectRoute(rota) {
        const routeId = rota.id;
        this.viewingAllRoutes = false;
        this.atualizarBotaoVisualizarTodas(false);
        this.activeRouteId = routeId;
        this.activeRouteColor = rota.cor_rgb || '#3388ff';
        this.activeRouteOrigin = rota.endereco || '';
        this.activeRouteOriginCoords = null;
        this.activeRouteLabel = this.montarResumoRota(rota);
        this.setRoutingColor(this.activeRouteColor);
        this.preencherFormularioEdicaoRota(rota);

        // Destaca a rota ativa na lista
        document.querySelectorAll('#listaRotas li.route-item').forEach(li => {
            li.classList.toggle('active', li.dataset.routeId === routeId);
        });

        // Mostra e atualiza o painel de pontos
        this.tituloPainelPontos.innerHTML = `<i class="fas fa-map-marker-alt"></i> Pontos da Rota: <strong>${this.escapeHtml(rota.nome_rota)}</strong>`;
        this.painelPontos.classList.remove('hidden');

        await this.loadAndDrawPoints(routeId, this.activeRouteColor);
    },

    // --- LÓGICA DE PONTOS/MARCADORES ---

    async visualizarTodasRotas() {
        const rotas = this.rotasMapa || [];
        if (!rotas.length) {
            alert('Nenhuma rota cadastrada para visualizar.');
            return;
        }

        this.viewingAllRoutes = true;
        this.activeRouteId = null;
        this.activeRouteOrigin = '';
        this.activeRouteOriginCoords = null;
        this.activeRouteLabel = '';
        this.atualizarBotaoVisualizarTodas(true);
        this.painelPontos.classList.add('hidden');
        document.querySelectorAll('#listaRotas li.route-item').forEach(li => li.classList.remove('active'));
        this.routeLayers.clearLayers();

        if (this.routingControl) {
            this.routingControl.setWaypoints([]);
            if (this.rotaInfo) this.rotaInfo.style.display = 'none';
        }

        const originalText = this.btnVisualizarTodasRotas?.innerHTML;
        if (this.btnVisualizarTodasRotas) {
            this.btnVisualizarTodasRotas.disabled = true;
            this.btnVisualizarTodasRotas.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
        }

        try {
            const routeIds = rotas.map(rota => rota.id);
            const { data: pontos, error } = await supabaseClient
                .from('mapa_pontos')
                .select('*')
                .in('rota_id', routeIds)
                .order('ordem', { ascending: true });

            if (error) throw error;

            this.drawAllRoutesOnMap(rotas, pontos || []);
        } catch (err) {
            console.error('Erro ao visualizar todas as rotas:', err);
            alert('Erro ao carregar todas as rotas no mapa.');
        } finally {
            if (this.btnVisualizarTodasRotas) {
                this.btnVisualizarTodasRotas.disabled = false;
                this.btnVisualizarTodasRotas.innerHTML = originalText;
                this.atualizarBotaoVisualizarTodas(this.viewingAllRoutes);
            }
        }
    },

    drawAllRoutesOnMap(rotas, pontos) {
        const bounds = [];
        const pontosPorRota = pontos.reduce((acc, ponto) => {
            if (!acc[ponto.rota_id]) acc[ponto.rota_id] = [];
            acc[ponto.rota_id].push(ponto);
            return acc;
        }, {});

        rotas.forEach(rota => {
            const routeColor = rota.cor_rgb || '#3388ff';
            const resumoRota = this.montarResumoRota(rota);
            const pontosRota = pontosPorRota[rota.id] || [];
            const latLngs = pontosRota
                .filter(ponto => ponto.latitude && ponto.longitude)
                .map(ponto => [Number(ponto.latitude), Number(ponto.longitude)]);

            if (!latLngs.length) return;

            if (latLngs.length > 1) {
                const linhaRota = L.polyline(latLngs, {
                    color: routeColor,
                    opacity: 0.8,
                    weight: 5
                }).addTo(this.routeLayers);

                this.aplicarTooltipLinha(linhaRota, resumoRota);
                linhaRota.bindPopup(`<b>${this.escapeHtml(resumoRota)}</b>`);
            }

            pontosRota.forEach(ponto => {
                if (!ponto.latitude || !ponto.longitude) return;
                const latLng = [Number(ponto.latitude), Number(ponto.longitude)];
                bounds.push(latLng);
                const nomePonto = ponto.cliente_nome || ponto.endereco || 'Ponto da rota';
                L.circleMarker(latLng, {
                    radius: 7,
                    color: '#ffffff',
                    weight: 2,
                    fillColor: routeColor,
                    fillOpacity: 0.95
                }).addTo(this.routeLayers).bindPopup(`
                    <b>${this.escapeHtml(rota.nome_rota || 'Rota')}</b><br>
                    ${this.escapeHtml(ponto.ordem || '')}. ${this.escapeHtml(nomePonto)}
                    ${ponto.endereco && ponto.cliente_nome ? `<br><small>${this.escapeHtml(ponto.endereco)}</small>` : ''}
                `);
            });
        });

        if (bounds.length === 1) {
            this.map.setView(bounds[0], 13);
        } else if (bounds.length > 1) {
            this.map.fitBounds(L.latLngBounds(bounds), { padding: [35, 35] });
        } else {
            alert('As rotas cadastradas ainda nao possuem pontos para exibir.');
        }
    },

    atualizarBotaoVisualizarTodas(ativo) {
        if (!this.btnVisualizarTodasRotas) return;
        this.btnVisualizarTodasRotas.classList.toggle('active', ativo);
        this.btnVisualizarTodasRotas.innerHTML = ativo
            ? '<i class="fas fa-layer-group"></i> Todas as rotas no mapa'
            : '<i class="fas fa-layer-group"></i> Ver todas as rotas';
    },

    montarResumoRota(rota) {
        const rotaNome = rota?.nome_rota || 'Rota';
        const supervisor = rota?.supervisor || 'Sem supervisor';
        return `${rotaNome} - Supervisor: ${supervisor}`;
    },

    aplicarTooltipLinha(linha, texto) {
        if (!linha || !texto) return;

        const tooltipOptions = {
            sticky: true,
            direction: 'top',
            opacity: 0.95
        };

        if (typeof linha.bindTooltip === 'function') {
            linha.bindTooltip(this.escapeHtml(texto), tooltipOptions);
            return;
        }

        if (typeof linha.eachLayer === 'function') {
            linha.eachLayer(layer => {
                if (typeof layer.bindTooltip === 'function') {
                    layer.bindTooltip(this.escapeHtml(texto), tooltipOptions);
                }
            });
        }
    },

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
        const endereco = this.montarEnderecoParada();
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
            await this.drawPointsOnMap(pontos, routeColor);

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

    async geocodeAddress(endereco) {
        const query = this.normalizarEnderecoBusca(endereco);
        if (query.length < 5) {
            throw new Error('Informe um endereco mais completo para localizar a parada.');
        }

        const tentativas = this.criarTentativasEndereco(query);

        try {
            return await this.executarGeocodeGeoapify(tentativas);
        } catch (geoapifyError) {
            console.warn('Geoapify nao localizou o endereco, usando fallback:', geoapifyError);
        }

        for (const tentativa of tentativas) {
            try {
                return await this.executarGeocodeNominatim(tentativa);
            } catch (err) {
                console.warn('Endereco nao localizado nesta tentativa:', tentativa, err);
            }
        }

        throw new Error(`Endereco nao encontrado: ${query}. Confira numero, cidade e UF, ou marque a parada clicando no mapa.`);
    },

    async obterOrigemAtiva() {
        if (!this.activeRouteOrigin) return null;
        if (this.activeRouteOriginCoords) return this.activeRouteOriginCoords;

        try {
            this.activeRouteOriginCoords = await this.geocodeAddress(this.activeRouteOrigin);
            return this.activeRouteOriginCoords;
        } catch (err) {
            console.warn('Origem da rota nao localizada para tracado:', err);
            return null;
        }
    },

    async executarGeocodeNominatim(query) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const params = new URLSearchParams({
            format: 'jsonv2',
            limit: '1',
            countrycodes: 'br',
            q: query
        });

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
                signal: controller.signal
            });

            if (!response.ok) throw new Error(`Falha na busca do endereco (${response.status}).`);

            const results = await response.json();
            if (!Array.isArray(results) || !results.length) {
                throw new Error(`Endereco nao encontrado: ${query}`);
            }

            return {
                lat: Number(results[0].lat),
                lng: Number(results[0].lon)
            };
        } finally {
            clearTimeout(timeoutId);
        }
    },

    async executarGeocodeGeoapify(tentativas) {
        if (!GEOAPIFY_API_KEY) throw new Error('Chave Geoapify nao configurada.');

        for (const tentativa of tentativas) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const params = new URLSearchParams({
                text: tentativa,
                lang: 'pt',
                filter: 'countrycode:br',
                limit: '1',
                apiKey: GEOAPIFY_API_KEY
            });

            try {
                const response = await fetch(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`, {
                    signal: controller.signal
                });

                if (!response.ok) throw new Error(`Falha Geoapify (${response.status}).`);

                const data = await response.json();
                const feature = data?.features?.[0];
                const coordinates = feature?.geometry?.coordinates;
                if (Array.isArray(coordinates) && coordinates.length >= 2) {
                    return {
                        lat: Number(coordinates[1]),
                        lng: Number(coordinates[0])
                    };
                }
            } finally {
                clearTimeout(timeoutId);
            }
        }

        throw new Error('Endereco nao encontrado no Geoapify.');
    },

    criarTentativasEndereco(query) {
        const tentativas = [`${query}, Brasil`, query];
        const semNumeroFinal = query.replace(/,\s*\d+[a-zA-Z]?\s*$/i, '').trim();
        if (semNumeroFinal && semNumeroFinal !== query) {
            tentativas.push(`${semNumeroFinal}, Brasil`, semNumeroFinal);
        }

        return [...new Set(tentativas)];
    },

    normalizarEnderecoBusca(endereco) {
        return String(endereco || '')
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[,\s]+$/g, '');
    },

    async buscarCepParada() {
        await this.buscarCep({
            cepInput: this.cepNovaParada,
            enderecoInput: this.enderecoNovaParada,
            btn: this.btnBuscarCepParada,
            focusAfter: this.numeroNovaParada
        });
    },

    async buscarCepRota() {
        await this.buscarCep({
            cepInput: this.cepNovaRota,
            enderecoInput: this.enderecoNovaRota,
            btn: this.btnBuscarCepRota
        });
    },

    async buscarCep({ cepInput, enderecoInput, btn, focusAfter = null }) {
        const cep = this.normalizarCep(cepInput?.value);
        if (cep.length !== 8) {
            alert('Informe um CEP com 8 digitos.');
            return;
        }

        const originalText = btn?.innerHTML;
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
        }

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!response.ok) throw new Error('Nao foi possivel consultar o CEP.');

            const data = await response.json();
            if (data.erro) throw new Error('CEP nao encontrado.');

            const endereco = [
                data.logradouro,
                data.bairro,
                data.localidade,
                data.uf
            ].filter(Boolean).join(', ');

            if (!endereco) throw new Error('CEP encontrado, mas sem endereco completo.');

            enderecoInput.value = endereco;
            focusAfter?.focus();
        } catch (err) {
            console.error('Erro ao buscar CEP:', err);
            alert(err.message || 'Erro ao buscar CEP.');
        } finally {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    },

    formatarCepInput(input = this.cepNovaParada) {
        if (!input) return;
        const cep = this.normalizarCep(input.value).slice(0, 8);
        input.value = cep.length > 5
            ? `${cep.slice(0, 5)}-${cep.slice(5)}`
            : cep;
    },

    normalizarCep(value) {
        return String(value || '').replace(/\D/g, '');
    },

    montarEnderecoParada() {
        const endereco = this.enderecoNovaParada.value.trim();
        const numero = this.numeroNovaParada?.value.trim();
        if (!numero) return endereco;
        return `${endereco}, ${numero}`;
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

    async drawPointsOnMap(pontos, routeColor) {
        if (pontos.length === 0 && !this.activeRouteOrigin) return;

        const latLngs = [];
        const origem = this.deveAdicionarOrigemSeparada(pontos)
            ? await this.obterOrigemAtiva()
            : null;
        if (origem) {
            const origemLatLng = [origem.lat, origem.lng];
            latLngs.push(origemLatLng);
            L.marker(origemLatLng, {
                title: 'Origem da rota'
            }).addTo(this.routeLayers).bindPopup(`<b>Origem da Rota</b><br>${this.escapeHtml(this.activeRouteOrigin)}`);
        }

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
            this.map.setView(latLngs[0], 13);
        } else if (latLngs.length > 1) {
            this.map.fitBounds(L.latLngBounds(latLngs), { padding: [30, 30] });
        }
    },

    deveAdicionarOrigemSeparada(pontos) {
        if (!this.activeRouteOrigin || !pontos.length) return Boolean(this.activeRouteOrigin);
        const primeiro = pontos[0];
        const nome = String(primeiro.cliente_nome || primeiro.endereco || '').toUpperCase();
        return !nome.includes('MARQUESPAN') && !nome.includes('INICIO');
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
            this.aplicarTooltipLinha(linha, this.activeRouteLabel);
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
