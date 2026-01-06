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
        this.btnPreencher = document.getElementById('btnPreencherIniciais');
    },

    bindEvents() {
        this.dateInput.addEventListener('change', () => this.carregarLeituras());
        this.btnPreencher.addEventListener('click', () => this.preencherLeiturasIniciais());
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
        // Mostra o botão novamente ao carregar/recarregar a data
        this.btnPreencher.style.display = 'inline-block';
        this.btnPreencher.disabled = false;
        this.btnPreencher.innerHTML = '<i class="fas fa-magic"></i> Preencher Iniciais';

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
                .eq('data', dataSelecionada);
            if (leiturasError) throw leiturasError;
            const leiturasMap = new Map(leiturasSalvas.map(l => [l.bomba_id, l]));

            // 4. Montar os dados para renderização
            const dadosParaTabela = bicos.map(bico => {
                const leituraDoDia = leiturasMap.get(bico.id);
                
                return {
                    bico: bico,
                    leituraSalva: leituraDoDia, // undefined se não houver leitura
                    leituraInicial: leituraDoDia ? leituraDoDia.leitura_inicial : null, // Nulo se não houver leitura salva
                };
            });

            this.renderTabela(dadosParaTabela);

        } catch (err) {
            console.error('Erro ao carregar leituras:', err);
            this.tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro ao carregar dados: ${err.message}</td></tr>`;
        }
    },

    async preencherLeiturasIniciais() {
        this.btnPreencher.disabled = true;
        this.btnPreencher.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';

        const dataSelecionada = this.dateInput.value;
        const bicosParaBuscar = [];
        // Encontra todas as linhas que ainda não foram salvas
        this.tbody.querySelectorAll('tr[data-bico-id]').forEach(row => {
            if (!row.querySelector('.btn-acao.salvo')) {
                bicosParaBuscar.push(row.dataset.bicoId);
            }
        });

        if (bicosParaBuscar.length === 0) {
            this.btnPreencher.innerHTML = '<i class="fas fa-check"></i> Tudo preenchido';
            this.btnPreencher.style.display = 'none';
            return;
        }

        try {
            const encerrantesMap = new Map();
            for (const bicoId of bicosParaBuscar) {
                const { data: ultimasLeituras, error: ultimaLeituraError } = await supabaseClient
                    .from('leituras_bomba')
                    .select('leitura_final')
                    .eq('bomba_id', bicoId)
                    .lt('data', dataSelecionada)
                    .order('data', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (ultimaLeituraError) throw ultimaLeituraError;

                if (ultimasLeituras && ultimasLeituras.length > 0) {
                    encerrantesMap.set(bicoId, ultimasLeituras[0].leitura_final);
                }
            }

            // Atualiza a tabela com os valores encontrados
            bicosParaBuscar.forEach(bicoId => {
                const encerranteAnterior = encerrantesMap.get(bicoId) || 0;
                const linha = document.getElementById(`row-bico-${bicoId}`);
                if (linha) {
                    linha.querySelector('.leitura-inicial-cell').textContent = parseFloat(encerranteAnterior).toFixed(2);
                    linha.querySelector('.leitura-final-input').disabled = false;
                }
            });

            this.btnPreencher.style.display = 'none'; // Esconde o botão após o sucesso

        } catch (err) {
            console.error('Erro ao preencher leituras iniciais:', err);
            alert('Erro ao buscar os encerrantes anteriores: ' + err.message);
            this.btnPreencher.disabled = false;
            this.btnPreencher.innerHTML = '<i class="fas fa-magic"></i> Preencher Iniciais';
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
            const leituraInicial = item.leituraInicial !== null ? parseFloat(item.leituraInicial).toFixed(2) : '-';

            let inputFinalHtml;
            let totalLitrosHtml;
            let acoesHtml;

            if (leituraSalva) {
                // Se já existe leitura, mostra os dados e desabilita
                const leituraFinal = parseFloat(leituraSalva.leitura_final).toFixed(2);
                const totalLitros = (leituraFinal - parseFloat(leituraInicial)).toFixed(2);
                inputFinalHtml = `<input type="number" class="leitura-final-input" value="${leituraFinal}" disabled style="background-color: #e9ecef;" />`;
                totalLitrosHtml = `<td class="total-litros-cell">${totalLitros} L</td>`;
                acoesHtml = `<td><button class="btn-acao salvo" disabled><i class="fas fa-check-circle"></i> Salvo</button></td>`;
            } else {
                // Se não existe, mostra input desabilitado esperando o preenchimento
                inputFinalHtml = `<input type="number" step="0.01" inputmode="decimal" class="leitura-final-input" data-bico-id="${bico.id}" placeholder="0.00" required disabled />`;
                totalLitrosHtml = `<td class="total-litros-cell" data-bico-id="${bico.id}">0.00 L</td>`;
                acoesHtml = `<td><button class="btn-acao salvar btn-salvar-leitura" data-bico-id="${bico.id}"><i class="fas fa-save"></i> Salvar</button></td>`;
            }

            return `
            <tr id="row-bico-${bico.id}" data-bico-id="${bico.id}">
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
                    data: dataLeitura,
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