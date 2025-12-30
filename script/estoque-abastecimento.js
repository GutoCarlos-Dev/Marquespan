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

                // 3. Buscar todas as saídas (a ser implementado)
                // const { data: saidas, error: saidasError } = await supabaseClient.from('saidas_combustivel').select('*');
                const saidas = []; // Placeholder

                // 4. Calcular o estoque atual
                const estoqueCalculado = this.calculateCurrentStock(tanques, entradas, saidas);

                // 5. Renderizar as tabelas
                this.renderResumo(estoqueCalculado);
                this.renderHistorico(entradas, tanques);

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

            // Subtrai as saídas (quando implementado)
            saidas.forEach(s => {
                if (estoque.has(s.tanque_id)) {
                    estoque.get(s.tanque_id).estoque_atual -= s.qtd_litros;
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

        renderHistorico(entradas, tanques) {
            this.tableBodyHistorico.innerHTML = '';
            const tanquesMap = new Map(tanques.map(t => [t.id, t.nome]));

            entradas.forEach(e => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(e.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>${tanquesMap.get(e.tanque_id) || 'Tanque Desconhecido'}</td>
                    <td class="text-right">${e.qtd_litros.toLocaleString('pt-BR')} L</td>
                    <td>${e.numero_nota}</td>
                `;
                this.tableBodyHistorico.appendChild(tr);
            });
        }
    };

    EstoqueUI.init();
});