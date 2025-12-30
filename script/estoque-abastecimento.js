import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const EstoqueUI = {
        init() {
            this.cache();
            this.loadEstoque();
        },

        cache() {
            this.tableBodyResumo = document.getElementById('tableBodyResumoEstoque');
            this.tableBodyHistorico = document.getElementById('tableBodyHistorico');
        },

        async loadEstoque() {
            if (!this.tableBodyResumo || !this.tableBodyHistorico) return;

            this.tableBodyResumo.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
            this.tableBodyHistorico.innerHTML = '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';

            try {
                // 1. Buscar todos os tanques
                const { data: tanques, error: tanquesError } = await supabaseClient
                    .from('tanques')
                    .select('id, nome, capacidade, tipo_combustivel');
                if (tanquesError) throw tanquesError;

                // 2. Buscar todas as entradas (abastecimentos)
                const { data: entradas, error: entradasError } = await supabaseClient
                    .from('abastecimentos')
                    .select('tanque_id, qtd_litros, data, numero_nota')
                    .order('data', { ascending: false });
                if (entradasError) throw entradasError;

                // 3. Buscar todas as saídas
                const { data: saidas, error: saidasError } = await supabaseClient
                    .from('saidas_combustivel')
                    .select('*, bicos(bombas(tanque_id))');
                if (saidasError) throw saidasError;

                // 4. Calcular o estoque atual
                const estoqueCalculado = this.calculateCurrentStock(tanques, entradas, saidas);

                // 5. Renderizar as tabelas
                this.renderResumo(estoqueCalculado);
                this.renderHistorico(entradas, saidas, tanques);

            } catch (error) {
                console.error('Erro ao carregar estoque:', error);
                this.tableBodyResumo.innerHTML = '<tr><td colspan="5" class="text-center" style="color:red;">Erro ao carregar dados.</td></tr>';
                this.tableBodyHistorico.innerHTML = '<tr><td colspan="4" class="text-center" style="color:red;">Erro ao carregar histórico.</td></tr>';
            }
        },

        calculateCurrentStock(tanques, entradas, saidas) {
            const estoque = new Map();

            // Inicializa o mapa com os dados dos tanques
            tanques.forEach(t => {
                estoque.set(t.id, {
                    ...t,
                    estoque_atual: 0
                });
            });

            // Soma as entradas
            entradas.forEach(e => {
                if (estoque.has(e.tanque_id)) {
                    estoque.get(e.tanque_id).estoque_atual += e.qtd_litros;
                }
            });

            // Subtrai as saídas
            saidas.forEach(s => {
                // Navega pela relação para encontrar o tanque_id
                const tanqueId = s.bicos?.bombas?.tanque_id;
                if (tanqueId && estoque.has(tanqueId)) {
                    const tanque = estoque.get(tanqueId);
                    tanque.estoque_atual -= s.qtd_litros;
                }
            });

            return Array.from(estoque.values());
        },

        renderResumo(estoque) {
            this.tableBodyResumo.innerHTML = '';
            if (estoque.length === 0) {
                this.tableBodyResumo.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum tanque cadastrado.</td></tr>';
                return;
            }

            estoque.sort((a, b) => a.nome.localeCompare(b.nome)).forEach(tanque => {
                const capacidade = tanque.capacidade || 0;
                const estoqueAtual = tanque.estoque_atual || 0;
                const percentual = capacidade > 0 ? (estoqueAtual / capacidade) * 100 : 0;
                
                let progressBarClass = 'progress-bar';
                if (percentual <= 20) progressBarClass += ' danger';
                else if (percentual <= 50) progressBarClass += ' warning';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${tanque.nome}</td>
                    <td>${tanque.tipo_combustivel}</td>
                    <td class="text-right">${capacidade.toLocaleString('pt-BR')} L</td>
                    <td class="text-right">${estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L</td>
                    <td>
                        <div class="progress-bar-container">
                            <div class="${progressBarClass}" style="width: ${Math.min(percentual, 100)}%;">${percentual.toFixed(1)}%</div>
                        </div>
                    </td>
                `;
                this.tableBodyResumo.appendChild(tr);
            });
        },

        renderHistorico(entradas, saidas, tanques) {
            this.tableBodyHistorico.innerHTML = '';
            const tanquesMap = new Map(tanques.map(t => [t.id, t.nome]));

            const historicoCombinado = [];

            // Mapeia as entradas
            entradas.forEach(e => {
                historicoCombinado.push({
                    data: e.data,
                    tipo: 'ENTRADA',
                    tanqueId: e.tanque_id,
                    litros: e.qtd_litros,
                    detalhe: `NF: ${e.numero_nota}`
                });
            });

            // Mapeia as saídas
            saidas.forEach(s => {
                const tanqueId = s.bicos?.bombas?.tanque_id;
                if (tanqueId) {
                    historicoCombinado.push({
                        data: s.data_hora,
                        tipo: 'SAÍDA',
                        tanqueId: tanqueId,
                        litros: s.qtd_litros,
                        detalhe: `Placa: ${s.veiculo_placa}`
                    });
                }
            });

            // Ordena do mais recente para o mais antigo
            historicoCombinado.sort((a, b) => new Date(b.data) - new Date(a.data));

            if (historicoCombinado.length === 0) {
                this.tableBodyHistorico.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum histórico de movimentação.</td></tr>';
                return;
            }

            historicoCombinado.forEach(mov => {
                const tr = document.createElement('tr');
                const tipoClasse = mov.tipo.toLowerCase();
                tr.innerHTML = `
                    <td>${new Date(mov.data).toLocaleString('pt-BR')}</td>
                    <td><span class="badge-movimentacao ${tipoClasse}">${mov.tipo}</span></td>
                    <td>${tanquesMap.get(mov.tanqueId) || 'Tanque Desconhecido'}</td>
                    <td class="text-right ${tipoClasse}">${mov.tipo === 'ENTRADA' ? '+' : '-'}${mov.litros.toLocaleString('pt-BR', {minimumFractionDigits: 2})} L</td>
                    <td>${mov.detalhe}</td>
                `;
                this.tableBodyHistorico.appendChild(tr);
            });
        }
    };

    EstoqueUI.init();
});