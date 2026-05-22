import { supabaseClient } from './supabase.js';

const PAGE_SIZE = 1000;
const REALTIME_REFRESH_DELAY = 700;

function parseNumero(value) {
    const numero = parseFloat(value);
    return Number.isFinite(numero) ? numero : 0;
}

function formatLitros(value) {
    return parseNumero(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatPercentual(value) {
    return parseNumero(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getEstoqueInformadoAjuste(entrada) {
    const valorInformado = parseNumero(entrada.valor_total);
    if (valorInformado > 0) return valorInformado;

    const diferencaLegada = parseNumero(entrada.qtd_litros);
    return diferencaLegada !== 0 ? Math.abs(diferencaLegada) : null;
}

async function fetchAll(buildQuery) {
    const rows = [];
    let from = 0;

    while (true) {
        const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
        if (error) throw error;

        if (!data || data.length === 0) break;

        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return rows;
}

document.addEventListener('DOMContentLoaded', () => {
    const EstoqueUI = {
        chartNivel: null,
        chartLitros: null,
        realtimeChannel: null,
        realtimeTimer: null,
        fallbackTimer: null,

        init() {
            this.cache();
            this.bind();
            this.loadEstoque();
            this.startRealtime();
        },

        cache() {
            this.tableBodyResumo = document.getElementById('tableBodyResumoEstoque');
            this.tableBodyHistorico = document.getElementById('tableBodyHistorico');
            this.btnAtualizar = document.getElementById('btnAtualizarDados');
            this.statusTempoReal = document.getElementById('statusTempoReal');
            this.ultimaAtualizacao = document.getElementById('ultimaAtualizacao');
            this.kpiCapacidadeTotal = document.getElementById('kpiCapacidadeTotal');
            this.kpiEstoqueAtual = document.getElementById('kpiEstoqueAtual');
            this.kpiVolumeLivre = document.getElementById('kpiVolumeLivre');
            this.kpiNivelGeral = document.getElementById('kpiNivelGeral');
        },

        bind() {
            this.btnAtualizar?.addEventListener('click', () => this.loadEstoque());

            window.addEventListener('beforeunload', () => {
                if (this.realtimeChannel) supabaseClient.removeChannel(this.realtimeChannel);
                if (this.fallbackTimer) clearInterval(this.fallbackTimer);
                if (this.realtimeTimer) clearTimeout(this.realtimeTimer);
            });
        },

        getUserFilial() {
            try {
                const usuarioLogado = localStorage.getItem('usuarioLogado');
                if (!usuarioLogado) return '';
                return JSON.parse(usuarioLogado).filial || '';
            } catch (error) {
                console.error('Erro ao obter filial do usuario:', error);
                return '';
            }
        },

        setRealtimeStatus(status, text) {
            if (!this.statusTempoReal) return;
            this.statusTempoReal.className = `realtime-status ${status}`;
            this.statusTempoReal.innerHTML = `<i class="fas fa-circle"></i> ${text}`;
        },

        scheduleRefresh() {
            clearTimeout(this.realtimeTimer);
            this.realtimeTimer = setTimeout(() => this.loadEstoque(false), REALTIME_REFRESH_DELAY);
        },

        startRealtime() {
            const agendar = () => this.scheduleRefresh();

            this.realtimeChannel = supabaseClient
                .channel('estoque-abastecimento-tempo-real')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'abastecimentos' }, agendar)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'saidas_combustivel' }, agendar)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tanques' }, agendar)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'bombas' }, agendar)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'bicos' }, agendar)
                .subscribe(status => {
                    if (status === 'SUBSCRIBED') {
                        this.setRealtimeStatus('online', 'Ao vivo');
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        this.setRealtimeStatus('error', 'Reconectando');
                    } else {
                        this.setRealtimeStatus('offline', 'Conectando...');
                    }
                });

            this.fallbackTimer = setInterval(() => this.loadEstoque(false), 30000);
        },

        async carregarDados() {
            const filial = this.getUserFilial();

            const tanques = await fetchAll(() => {
                let query = supabaseClient
                    .from('tanques')
                    .select('id, nome, capacidade, tipo_combustivel, filial')
                    .order('nome');

                if (filial) query = query.eq('filial', filial);
                return query;
            });

            const entradas = await fetchAll(() => supabaseClient
                .from('abastecimentos')
                .select('tanque_id, qtd_litros, data, numero_nota, usuario, valor_total')
                .order('data', { ascending: false }));

            const saidas = await fetchAll(() => supabaseClient
                .from('saidas_combustivel')
                .select('data_hora, veiculo_placa, rota, motorista, qtd_litros, bicos(bombas(tanque_id))')
                .order('data_hora', { ascending: false }));

            return { tanques, entradas, saidas };
        },

        async loadEstoque(showLoading = true) {
            if (!this.tableBodyResumo || !this.tableBodyHistorico) return;

            if (this.btnAtualizar) {
                this.btnAtualizar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
                this.btnAtualizar.disabled = true;
            }

            if (showLoading) {
                this.tableBodyResumo.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
                this.tableBodyHistorico.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
            }

            try {
                const { tanques, entradas, saidas } = await this.carregarDados();
                const estoqueCalculado = this.calculateCurrentStock(tanques, entradas, saidas);

                this.renderKpis(estoqueCalculado);
                this.renderResumo(estoqueCalculado);
                this.renderGraficos(estoqueCalculado);
                this.renderHistorico(entradas, saidas, tanques);

                if (this.ultimaAtualizacao) {
                    this.ultimaAtualizacao.textContent = `Atualizado: ${new Date().toLocaleTimeString('pt-BR')}`;
                }
            } catch (error) {
                console.error('Erro ao carregar estoque:', error);
                this.tableBodyResumo.innerHTML = '<tr><td colspan="5" class="text-center" style="color:red;">Erro ao carregar dados.</td></tr>';
                this.tableBodyHistorico.innerHTML = '<tr><td colspan="5" class="text-center" style="color:red;">Erro ao carregar historico.</td></tr>';
            } finally {
                if (this.btnAtualizar) {
                    this.btnAtualizar.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
                    this.btnAtualizar.disabled = false;
                }
            }
        },

        calculateCurrentStock(tanques, entradas, saidas) {
            const estoque = new Map();
            const movimentosPorTanque = new Map();

            (tanques || []).forEach(tanque => {
                const tanqueId = Number(tanque.id);
                estoque.set(tanqueId, {
                    ...tanque,
                    capacidade: parseNumero(tanque.capacidade),
                    entradas_total: 0,
                    saidas_total: 0,
                    ultimo_ajuste_data: null,
                    estoque_ultimo_ajuste: null,
                    estoque_atual: 0
                });
                movimentosPorTanque.set(tanqueId, []);
            });

            (entradas || []).forEach(entrada => {
                const tanqueId = Number(entrada.tanque_id);
                if (!movimentosPorTanque.has(tanqueId)) return;

                const litros = parseNumero(entrada.qtd_litros);
                movimentosPorTanque.get(tanqueId).push({
                    data: entrada.data,
                    tipo: entrada.numero_nota === 'AJUSTE DE ESTOQUE' ? 'AJUSTE' : 'ENTRADA',
                    litros,
                    estoqueInformado: entrada.numero_nota === 'AJUSTE DE ESTOQUE'
                        ? getEstoqueInformadoAjuste(entrada)
                        : null
                });
            });

            (saidas || []).forEach(saida => {
                const tanqueId = Number(saida.bicos?.bombas?.tanque_id);
                if (!movimentosPorTanque.has(tanqueId)) return;

                const litros = parseNumero(saida.qtd_litros);
                movimentosPorTanque.get(tanqueId).push({
                    data: saida.data_hora,
                    tipo: 'SAIDA',
                    litros
                });
            });

            movimentosPorTanque.forEach((movimentos, tanqueId) => {
                const tanque = estoque.get(tanqueId);
                if (!tanque) return;

                movimentos
                    .filter(movimento => movimento.data)
                    .sort((a, b) => new Date(a.data) - new Date(b.data))
                    .forEach(movimento => {
                        if (movimento.tipo === 'SAIDA') {
                            tanque.saidas_total += movimento.litros;
                            tanque.estoque_atual -= movimento.litros;
                            return;
                        }

                        if (movimento.tipo === 'AJUSTE') {
                            tanque.entradas_total += movimento.litros;
                            tanque.estoque_atual = movimento.estoqueInformado !== null
                                ? movimento.estoqueInformado
                                : tanque.estoque_atual + movimento.litros;
                            tanque.ultimo_ajuste_data = movimento.data;
                            tanque.estoque_ultimo_ajuste = tanque.estoque_atual;
                            return;
                        }

                        tanque.entradas_total += movimento.litros;
                        tanque.estoque_atual += movimento.litros;
                    });
            });

            return Array.from(estoque.values()).sort((a, b) => (
                String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true, sensitivity: 'base' })
            ));
        },

        getNivel(tanque) {
            const capacidade = parseNumero(tanque.capacidade);
            const estoqueAtual = parseNumero(tanque.estoque_atual);
            return capacidade > 0 ? (estoqueAtual / capacidade) * 100 : 0;
        },

        getNivelCor(percentual) {
            if (percentual <= 20) return 'rgba(220, 53, 69, 0.78)';
            if (percentual <= 50) return 'rgba(255, 193, 7, 0.82)';
            return 'rgba(40, 167, 69, 0.78)';
        },

        renderKpis(estoque) {
            const capacidadeTotal = estoque.reduce((total, tanque) => total + parseNumero(tanque.capacidade), 0);
            const estoqueAtual = estoque.reduce((total, tanque) => total + parseNumero(tanque.estoque_atual), 0);
            const volumeLivre = capacidadeTotal - estoqueAtual;
            const nivelGeral = capacidadeTotal > 0 ? (estoqueAtual / capacidadeTotal) * 100 : 0;

            if (this.kpiCapacidadeTotal) this.kpiCapacidadeTotal.textContent = `${formatLitros(capacidadeTotal)} L`;
            if (this.kpiEstoqueAtual) this.kpiEstoqueAtual.textContent = `${formatLitros(estoqueAtual)} L`;
            if (this.kpiVolumeLivre) this.kpiVolumeLivre.textContent = `${formatLitros(volumeLivre)} L`;
            if (this.kpiNivelGeral) this.kpiNivelGeral.textContent = `${formatPercentual(nivelGeral)}%`;
        },

        renderResumo(estoque) {
            if (!estoque.length) {
                this.tableBodyResumo.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum tanque cadastrado.</td></tr>';
                return;
            }

            this.tableBodyResumo.innerHTML = estoque.map(tanque => {
                const capacidade = parseNumero(tanque.capacidade);
                const estoqueAtual = parseNumero(tanque.estoque_atual);
                const percentual = this.getNivel(tanque);
                const largura = Math.max(0, Math.min(percentual, 100));
                let progressBarClass = 'progress-bar';

                if (percentual <= 20) progressBarClass += ' danger';
                else if (percentual <= 50) progressBarClass += ' warning';

                return `
                    <tr>
                        <td>${escapeHtml(tanque.nome)}</td>
                        <td>${escapeHtml(tanque.tipo_combustivel)}</td>
                        <td class="text-right">${formatLitros(capacidade)} L</td>
                        <td class="text-right">${formatLitros(estoqueAtual)} L</td>
                        <td>
                            <div class="progress-bar-container">
                                <div class="${progressBarClass}" style="width: ${largura}%;">${formatPercentual(percentual)}%</div>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        renderGraficos(estoque) {
            if (typeof Chart === 'undefined') return;

            const labels = estoque.map(tanque => `${tanque.nome} (${tanque.tipo_combustivel || '-'})`);
            const percentuais = estoque.map(tanque => Number(this.getNivel(tanque).toFixed(1)));
            const litros = estoque.map(tanque => Number(parseNumero(tanque.estoque_atual).toFixed(2)));
            const capacidades = estoque.map(tanque => parseNumero(tanque.capacidade));
            const cores = percentuais.map(percentual => this.getNivelCor(percentual));

            const ctxNivel = document.getElementById('chartNivelTanques')?.getContext('2d');
            if (ctxNivel) {
                if (this.chartNivel) this.chartNivel.destroy();
                this.chartNivel = new Chart(ctxNivel, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Nivel do tanque (%)',
                            data: percentuais,
                            backgroundColor: cores,
                            borderRadius: 5
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                beginAtZero: true,
                                max: 100,
                                ticks: { callback: value => `${value}%` }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: context => `${context.parsed.x}% - ${formatLitros(litros[context.dataIndex])} L de ${formatLitros(capacidades[context.dataIndex])} L`
                                }
                            }
                        }
                    }
                });
            }

            const ctxLitros = document.getElementById('chartLitrosTanques')?.getContext('2d');
            if (ctxLitros) {
                if (this.chartLitros) this.chartLitros.destroy();
                this.chartLitros = new Chart(ctxLitros, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: 'Estoque atual (L)',
                                data: litros,
                                backgroundColor: 'rgba(0, 105, 55, 0.76)',
                                borderRadius: 5
                            },
                            {
                                label: 'Capacidade (L)',
                                data: capacidades,
                                backgroundColor: 'rgba(148, 163, 184, 0.35)',
                                borderRadius: 5
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { callback: value => `${Number(value).toLocaleString('pt-BR')} L` }
                            }
                        },
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: context => `${context.dataset.label}: ${formatLitros(context.parsed.y)} L`
                                }
                            }
                        }
                    }
                });
            }
        },

        renderHistorico(entradas, saidas, tanques) {
            const tanquesMap = new Map((tanques || []).map(t => [Number(t.id), t.nome]));
            const historicoCombinado = [];

            (entradas || []).forEach(entrada => {
                const tanqueId = Number(entrada.tanque_id);
                if (!tanquesMap.has(tanqueId)) return;
                const isAjuste = entrada.numero_nota === 'AJUSTE DE ESTOQUE';

                historicoCombinado.push({
                    data: entrada.data,
                    tipo: isAjuste ? 'AJUSTE' : 'ENTRADA',
                    tanqueId,
                    litros: parseNumero(entrada.qtd_litros),
                    detalhe: isAjuste ? 'Estoque fisico conferido' : `NF: ${entrada.numero_nota || '-'}`
                });
            });

            (saidas || []).forEach(saida => {
                const tanqueId = Number(saida.bicos?.bombas?.tanque_id);
                if (!tanquesMap.has(tanqueId)) return;

                historicoCombinado.push({
                    data: saida.data_hora,
                    tipo: 'SAIDA',
                    tanqueId,
                    litros: parseNumero(saida.qtd_litros),
                    detalhe: `Placa: ${saida.veiculo_placa || '-'}${saida.rota ? ` | Rota: ${saida.rota}` : ''}`
                });
            });

            historicoCombinado.sort((a, b) => new Date(b.data) - new Date(a.data));

            if (!historicoCombinado.length) {
                this.tableBodyHistorico.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum historico de movimentacao.</td></tr>';
                return;
            }

            this.tableBodyHistorico.innerHTML = historicoCombinado.slice(0, 300).map(mov => {
                const tipoClasse = mov.tipo === 'SAIDA' ? 'saida' : 'entrada';
                const sinal = mov.tipo === 'SAIDA' ? '-' : '+';

                return `
                    <tr>
                        <td>${new Date(mov.data).toLocaleString('pt-BR')}</td>
                        <td><span class="badge-movimentacao ${tipoClasse}">${mov.tipo}</span></td>
                        <td>${escapeHtml(tanquesMap.get(mov.tanqueId) || 'Tanque desconhecido')}</td>
                        <td class="text-right ${tipoClasse}">${sinal}${formatLitros(mov.litros)} L</td>
                        <td>${escapeHtml(mov.detalhe)}</td>
                    </tr>
                `;
            }).join('');
        }
    };

    EstoqueUI.init();
});
