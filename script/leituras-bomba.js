import { supabaseClient } from './supabase.js';

const LeiturasBomba = {
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.setDefaultDate();
        this.carregarLeituras(); // A única função de carregamento agora
    },

    cacheDOM() {
        // Filtros e Tabela
        this.dateInput = document.getElementById('leituraData');
        this.tbody = document.getElementById('tableBodyLeituras');
    },

    bindEvents() {
        this.dateInput.addEventListener('change', () => this.carregarLeituras());
        // Adiciona um único listener na tabela para delegar eventos de clique
        this.tbody.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-salvar-leitura')) {
                const bicoId = e.target.dataset.bicoId;
                this.salvarLeitura(bicoId);
            }
        });
        // Listener para cálculo dinâmico do total de litros
        this.tbody.addEventListener('input', (e) => {
            if (e.target.classList.contains('leitura-final-input')) {
                this.calcularTotalLitros(e.target);
            }
        });
    },

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        this.dateInput.value = today;
    },

    async carregarLeituras() {
        const dataSelecionada = this.dateInput.value;
        this.tbody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';

        try {
            // 1. Buscar todos os bicos cadastrados
            const { data: bicos, error: bicosError } = await supabaseClient
                .from('bicos')
                .select('id, nome, bombas (nome, tanques (nome))')
                .order('nome');
            if (bicosError) throw bicosError;

            // 2. Buscar as leituras já salvas para a data selecionada
            const { data: leiturasSalvas, error: leiturasError } = await supabaseClient
                .from('leituras_bomba')
                .select('id, bomba_id, leitura_inicial, leitura_final') // Usando 'bomba_id' como tentativa
                .eq('data_leitura', dataSelecionada);
            if (leiturasError) throw leiturasError;
            const leiturasMap = new Map(leiturasSalvas.map(l => [l.bomba_id, l]));

            // 3. Buscar a última leitura final (encerrante) para CADA bico ANTES da data selecionada
            // Substituímos a chamada RPC por um loop para maior robustez e para testar o nome da coluna.
            const encerrantesMap = new Map();
            for (const bico of bicos) {
                const { data: ultimaLeitura, error: ultimaLeituraError } = await supabaseClient
                    .from('leituras_bomba')
                    .select('leitura_final')
                    .eq('bomba_id', bico.id) // Usando 'bomba_id' como tentativa
                    .lt('data_leitura', dataSelecionada)
                    .order('data_leitura', { ascending: false })
                    .order('created_at', { ascending: false }) // Adicionado para desempate
                    .limit(1)
                    .single();

                // Ignora o erro "nenhuma linha encontrada", que é esperado se não houver leitura anterior
                if (ultimaLeituraError && ultimaLeituraError.code !== 'PGRST116') {
                    throw ultimaLeituraError;
                }

                if (ultimaLeitura) {
                    encerrantesMap.set(bico.id, ultimaLeitura.leitura_final);
                }
            }

            // 4. Montar os dados para renderização
            const dadosParaTabela = bicos.map(bico => {
                const leituraDoDia = leiturasMap.get(bico.id);
                const encerranteAnterior = encerrantesMap.get(bico.id) || 0;
                
                return {
                    bico: bico,
                    leituraSalva: leituraDoDia, // undefined se não houver leitura
                    leituraInicial: leituraDoDia ? leituraDoDia.leitura_inicial : encerranteAnterior,
                };
            });

            this.renderTabela(dadosParaTabela);

        } catch (err) {
            console.error('Erro ao carregar leituras:', err);
            this.tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro ao carregar dados: ${err.message}</td></tr>`;
        }
    },

    renderTabela(dados) {
        if (!dados || dados.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum bico cadastrado.</td></tr>';
            return;
        }

        this.tbody.innerHTML = dados.map(item => {
            const bico = item.bico;
            const leituraSalva = item.leituraSalva;
            const leituraInicial = parseFloat(item.leituraInicial).toFixed(2);

            let inputFinalHtml;
            let totalLitrosHtml;
            let acoesHtml;

            if (leituraSalva) {
                // Se já existe leitura, mostra os dados e desabilita
                const leituraFinal = parseFloat(leituraSalva.leitura_final).toFixed(2);
                const totalLitros = (leituraFinal - leituraInicial).toFixed(2);
                inputFinalHtml = `<input type="number" class="leitura-final-input" value="${leituraFinal}" disabled style="background-color: #e9ecef;" />`;
                totalLitrosHtml = `<td class="total-litros-cell">${totalLitros} L</td>`;
                acoesHtml = `<td><button class="btn-acao salvo" disabled><i class="fas fa-check-circle"></i> Salvo</button></td>`;
            } else {
                // Se não existe, mostra input para preenchimento
                inputFinalHtml = `<input type="number" step="0.01" inputmode="decimal" class="leitura-final-input" data-bico-id="${bico.id}" placeholder="0.00" required />`;
                totalLitrosHtml = `<td class="total-litros-cell" data-bico-id="${bico.id}">0.00 L</td>`;
                acoesHtml = `<td><button class="btn-acao salvar btn-salvar-leitura" data-bico-id="${bico.id}"><i class="fas fa-save"></i> Salvar</button></td>`;
            }

            return `
            <tr id="row-bico-${bico.id}">
                <td>${bico.nome || '-'}</td>
                <td>${bico.bombas?.nome || '-'}</td>
                <td>${bico.bombas?.tanques?.nome || '-'}</td>
                <td class="leitura-inicial-cell">${leituraInicial}</td>
                <td>${inputFinalHtml}</td>
                ${totalLitrosHtml}
                ${acoesHtml}
            </tr>
            `;
        }).join('');
    },

    calcularTotalLitros(inputFinal) {
        const bicoId = inputFinal.dataset.bicoId;
        const linha = document.getElementById(`row-bico-${bicoId}`);
        if (!linha) return;

        const celulaInicial = linha.querySelector('.leitura-inicial-cell');
        const celulaTotal = linha.querySelector('.total-litros-cell');

        const inicial = parseFloat(celulaInicial.textContent) || 0;
        const final = parseFloat(inputFinal.value) || 0;

        const total = final - inicial;

        celulaTotal.textContent = total.toFixed(2) + ' L';
        // Adiciona classe de erro se o valor for negativo
        if (total < 0) {
            inputFinal.classList.add('input-error');
        } else {
            inputFinal.classList.remove('input-error');
        }
    },

    async salvarLeitura(bicoId) {
        const linha = document.getElementById(`row-bico-${bicoId}`);
        const inputFinal = linha.querySelector('.leitura-final-input');
        const celulaInicial = linha.querySelector('.leitura-inicial-cell');
        const btnSalvar = linha.querySelector('.btn-salvar-leitura');

        const dataLeitura = this.dateInput.value;
        const inicial = parseFloat(celulaInicial.textContent);
        const final = parseFloat(inputFinal.value);

        if (isNaN(final) || final <= 0) {
            alert('Por favor, insira um valor válido para a Leitura Final.');
            inputFinal.focus();
            return;
        }

        if (final < inicial) {
            alert('A leitura final não pode ser menor que a leitura inicial (Encerrante Anterior)!');
            inputFinal.focus();
            return;
        }
        
        // Desabilita o botão para evitar cliques duplos
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            const { error } = await supabaseClient
                .from('leituras_bomba')
                .insert({
                    data_leitura: dataLeitura,
                    bomba_id: bicoId, // Usando 'bomba_id' como tentativa
                    leitura_inicial: inicial,
                    leitura_final: final,
                });

            if (error) throw error;

            // Atualiza a UI da linha para o estado "Salvo"
            inputFinal.disabled = true;
            inputFinal.style.backgroundColor = '#e9ecef';
            btnSalvar.className = 'btn-acao salvo';
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<i class="fas fa-check-circle"></i> Salvo';

        } catch (err) {
            console.error('Erro ao salvar:', err);
            alert('Erro ao salvar leitura: ' + err.message);
            // Reabilita o botão em caso de erro
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }
};

// Expõe o objeto para o escopo global para que os botões onclick funcionem (embora não estejamos mais usando onclick)
window.LeiturasBomba = LeiturasBomba;

document.addEventListener('DOMContentLoaded', () => {
    LeiturasBomba.init();
});