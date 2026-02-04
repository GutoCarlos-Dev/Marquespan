import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const AbastecimentoUI = {
        init() {
            this.tanquesDisponiveis = [];
            this.bicosDisponiveis = [];
            this.initTabs();
            this.cache();
            this.bind();
            this.loadTanques();
            this.renderTable();
            this.initSaida(); // Inicializa a aba de saída
            this.renderSaidasTable();
            this.loadEstoqueAtual(); // Carrega a aba de estoque
            
            // Define a data de hoje como padrão
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            this.dataInput.value = now.toISOString().slice(0, 16);

        },

        initTabs() {
            const buttons = document.querySelectorAll('#menu-abastecimento .painel-btn');
            const sections = document.querySelectorAll('.main-content .section');

            buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    buttons.forEach(b => b.classList.remove('active'));
                    sections.forEach(s => s.classList.add('hidden'));

                    btn.classList.add('active');
                    const targetId = btn.getAttribute('data-secao');
                    document.getElementById(targetId)?.classList.remove('hidden');
                });
            });
        },

        cache() {
            this.form = document.getElementById('formAbastecimento');
            this.editingIdInput = document.getElementById('abastecimentoEditingId');
            this.dataInput = document.getElementById('absData');
            this.notaInput = document.getElementById('absNota');
            this.qtdTotalNotaInput = document.getElementById('absQtdTotalNota');
            this.vlrLitroInput = document.getElementById('absVlrLitro');
            this.totalInput = document.getElementById('absTotal');
            this.tableBody = document.getElementById('tableBodyAbastecimentos');
            this.btnSalvar = document.getElementById('btnSalvarAbs');
            this.btnLimpar = document.getElementById('btnLimparAbs');
            this.distribuicaoContainer = document.getElementById('distribuicao-container');
            this.btnAdicionarTanque = document.getElementById('btnAdicionarTanque');
            this.litrosRestantesValor = document.getElementById('litros-restantes-valor');

            // Elementos da Aba Saída
            this.formSaida = document.getElementById('formSaidaCombustivel');
            this.saidaEditingId = document.getElementById('saidaEditingId');
            this.saidaDataHora = document.getElementById('saidaDataHora');
            this.saidaUsuario = document.getElementById('saidaUsuario');
            this.saidaBico = document.getElementById('saidaBico');
            this.saidaVeiculo = document.getElementById('saidaVeiculo');
            this.listaVeiculos = document.getElementById('listaVeiculos'); // This is for veiculos, not motoristas
            this.saidaRota = document.getElementById('saidaRota');
            this.listaRotas = document.getElementById('listaRotas');
            this.saidaKm = document.getElementById('saidaKm');
            this.saidaLitros = document.getElementById('saidaLitros');
            this.btnSalvarSaida = document.getElementById('btnSalvarSaida');
            this.tableBodySaidas = document.getElementById('tableBodySaidas');

            // Elementos da Aba Estoque
            this.tbodyEstoque = document.getElementById('tbodyEstoqueAtual');
            this.btnSalvarEstoque = document.getElementById('btnSalvarEstoque');
        },

        bind() {
            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.tableBody.addEventListener('click', this.handleTableClick.bind(this));
            this.btnLimpar.addEventListener('click', this.clearForm.bind(this));
            
            // Cálculo automático do total
            this.qtdTotalNotaInput.addEventListener('input', this.calculateTotal.bind(this));
            this.vlrLitroInput.addEventListener('input', this.calculateTotal.bind(this));

            this.btnAdicionarTanque.addEventListener('click', () => this.adicionarLinhaTanque());
            this.distribuicaoContainer.addEventListener('input', this.updateLitrosRestantes.bind(this));
            this.distribuicaoContainer.addEventListener('click', this.handleDistribuicaoClick.bind(this));

            this.formSaida.addEventListener('submit', this.handleSaidaSubmit.bind(this));
            this.saidaBico.addEventListener('change', this.verificarLeituraBomba.bind(this));
            this.tableBodySaidas.addEventListener('click', this.handleSaidaTableClick.bind(this));

            if (this.btnSalvarEstoque) this.btnSalvarEstoque.addEventListener('click', this.handleSalvarEstoque.bind(this));
            if (this.tbodyEstoque) this.tbodyEstoque.addEventListener('change', this.handleEstoqueChange.bind(this));
        },

        getUsuarioLogado() {
            try {
                const usuarioLogado = localStorage.getItem('usuarioLogado');
                if (usuarioLogado) {
                    const usuario = JSON.parse(usuarioLogado);
                    return usuario.nome || 'Desconhecido';
                }
            } catch (e) { console.error(e); }
            return 'Desconhecido';
        },

        calculateTotal() {
            const qtd = parseFloat(this.qtdTotalNotaInput.value.replace(',', '.')) || 0;
            const vlr = parseFloat(this.vlrLitroInput.value.replace(',', '.')) || 0;
            const total = qtd * vlr;
            
            this.totalInput.value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        },

        async loadTanques() {
            try {
                const { data, error } = await supabaseClient
                    .from('tanques')
                    .select('id, nome, tipo_combustivel')
                    .order('nome');

                if (error) throw error;

                this.tanquesDisponiveis = data || [];                

                this.adicionarLinhaTanque(); // Adiciona a primeira linha para a ENTRADA
            } catch (error) {
                console.error('Erro ao carregar tanques:', error);
            }
        },

        async loadEstoqueAtual() {
            if (!this.tbodyEstoque) return;
            this.tbodyEstoque.innerHTML = '<tr><td colspan="4" class="text-center">Carregando...</td></tr>';

            try {
                // 1. Buscar todos os tanques
                const { data: tanques, error: tanquesError } = await supabaseClient
                    .from('tanques')
                    .select('id, nome, capacidade, tipo_combustivel');
                if (tanquesError) throw tanquesError;

                // 2. Buscar todas as entradas (abastecimentos)
                const { data: entradas, error: entradasError } = await supabaseClient
                    .from('abastecimentos')
                    .select('tanque_id, qtd_litros');
                if (entradasError) throw entradasError;

                // 3. Buscar todas as saídas
                const { data: saidas, error: saidasError } = await supabaseClient
                    .from('saidas_combustivel')
                    .select('qtd_litros, bicos(bombas(tanque_id))');
                if (saidasError) throw saidasError;

                // 4. Calcular o estoque atual
                const estoqueMap = new Map();
                tanques.forEach(t => {
                    estoqueMap.set(t.id, { ...t, estoque_atual: 0 });
                });
                entradas.forEach(e => {
                    if (estoqueMap.has(e.tanque_id)) {
                        estoqueMap.get(e.tanque_id).estoque_atual += e.qtd_litros;
                    }
                });
                saidas.forEach(s => {
                    const tanqueId = s.bicos?.bombas?.tanque_id;
                    if (tanqueId && estoqueMap.has(tanqueId)) {
                        estoqueMap.get(tanqueId).estoque_atual -= s.qtd_litros;
                    }
                });
                const estoqueCalculado = Array.from(estoqueMap.values());

                // 5. Renderizar a tabela
                this.tbodyEstoque.innerHTML = '';
                if (estoqueCalculado.length === 0) {
                    this.tbodyEstoque.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum tanque cadastrado.</td></tr>';
                    return;
                }

                estoqueCalculado.forEach(tanque => {
                    const tr = document.createElement('tr');
                    // Armazena o estoque calculado em um atributo de dados para comparação posterior
                    tr.dataset.calculatedStock = tanque.estoque_atual;
                    
                    const capacidade = parseFloat(tanque.capacidade) || 0;
                    const estoque = parseFloat(tanque.estoque_atual) || 0;
                    const percentual = capacidade > 0 ? ((estoque / capacidade) * 100).toFixed(0) : 0;
                    
                    let color = '#006937'; // Verde
                    if(percentual < 20) color = '#dc3545'; // Vermelho
                    else if(percentual < 50) color = '#ffc107'; // Amarelo

                    tr.innerHTML = `
                        <td>${tanque.nome}</td>
                        <td>${tanque.tipo_combustivel}</td>
                        <td>${tanque.capacidade ? tanque.capacidade.toLocaleString('pt-BR') + ' L' : '-'}</td>
                        <td style="width: 250px; vertical-align: middle;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="flex-grow: 1; background: #e9ecef; height: 10px; border-radius: 5px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">
                                    <div style="width: ${Math.min(percentual, 100)}%; background: ${color}; height: 100%; border-radius: 5px; transition: width 0.5s ease;"></div>
                                </div>
                                <span style="font-weight: bold; color: ${color}; font-size: 0.9rem; min-width: 40px; text-align: right;">${percentual}%</span>
                            </div>
                        </td>
                        <td>
                            <input type="text" class="input-estoque-atual" data-id="${tanque.id}" 
                                   data-capacidade="${tanque.capacidade || 0}"
                                   value="${tanque.estoque_atual.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}" 
                                   oninput="this.value = this.value.replace(/[^0-9,.]/g, '')"
                                   style="width: 150px; padding: 5px; border: 1px solid #ccc; border-radius: 4px; font-weight: bold; color: #333;">
                        </td>
                    `;
                    this.tbodyEstoque.appendChild(tr);
                });

            } catch (error) {
                console.error('Erro ao carregar estoque:', error);
                this.tbodyEstoque.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
            }
        },

        handleEstoqueChange(e) {
            if (!e.target.classList.contains('input-estoque-atual')) return;
            const input = e.target;
            const rawValue = input.value;
            const normalizedValue = parseFloat(rawValue.replace(/\./g, '').replace(',', '.'));
            const capacidade = parseFloat(input.dataset.capacidade);

            if (!isNaN(normalizedValue) && !isNaN(capacidade) && normalizedValue > capacidade) {
                alert(`O valor informado excede a capacidade máxima do tanque (${capacidade.toLocaleString('pt-BR')} L).`);
                input.value = capacidade.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            }
        },

        async handleSalvarEstoque() {
            const dataAjuste = new Date().toISOString();
            const usuario = this.getUsuarioLogado();
            const ajustes = [];
            let erroCapacidade = false;

            this.tbodyEstoque.querySelectorAll('tr').forEach(tr => {
                if (erroCapacidade) return;
                const input = tr.querySelector('.input-estoque-atual');
                if (!input) return;

                const tanqueId = input.dataset.id;
                const estoqueCalculado = parseFloat(tr.dataset.calculatedStock);
                
                // Converte o valor do input (formato PT-BR) para float
                const rawValue = input.value;
                const normalizedValue = rawValue.replace(/\./g, '').replace(',', '.');
                const novoEstoque = parseFloat(normalizedValue);
                const capacidade = parseFloat(input.dataset.capacidade);

                if (isNaN(estoqueCalculado) || isNaN(novoEstoque)) return;

                if (!isNaN(capacidade) && novoEstoque > capacidade) {
                    alert(`O valor informado para o tanque excede a capacidade máxima (${capacidade.toLocaleString('pt-BR')} L).`);
                    erroCapacidade = true;
                    return;
                }

                const delta = novoEstoque - estoqueCalculado;

                // Cria uma transação apenas se houver diferença
                if (Math.abs(delta) > 0.001) {
                    ajustes.push({
                        data: dataAjuste,
                        numero_nota: 'AJUSTE DE ESTOQUE',
                        tanque_id: parseInt(tanqueId),
                        qtd_litros: delta, // Pode ser positivo ou negativo
                        valor_litro: 0,
                        valor_total: 0,
                        usuario: usuario
                    });
                }
            });

            if (erroCapacidade) return;

            if (ajustes.length === 0) {
                alert('Nenhum ajuste necessário. Estoque conferido e abas liberadas.');
                this.unlockTabs(); // Libera as abas pois o estoque foi conferido (mesmo sem alterações)
                return;
            }

            try {
                this.btnSalvarEstoque.disabled = true;
                this.btnSalvarEstoque.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

                const { error } = await supabaseClient.from('abastecimentos').insert(ajustes);
                if (error) throw error;

                alert('Ajuste(s) de estoque salvo(s) com sucesso!');
                await this.loadEstoqueAtual(); // Recarrega para mostrar os novos valores calculados

            } catch (error) {
                console.error('Erro ao salvar ajuste de estoque:', error);
                alert('Erro ao salvar ajuste: ' + error.message);
            } finally {
                this.btnSalvarEstoque.disabled = false;
                this.btnSalvarEstoque.innerHTML = '<i class="fas fa-save"></i> Atualizar Estoque';
            }
        },

        async initSaida() {
            // Define data/hora atual para saída
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            this.saidaDataHora.value = now.toISOString().slice(0, 16);
            if(this.saidaUsuario) this.saidaUsuario.value = this.getUsuarioLogado();

            this.toggleSaidaForm(false); // Bloqueia o formulário inicialmente
            // Carregar Bicos
            this.loadBicos();

            // Carregar Veículos
            try {
                const { data: veiculos } = await supabaseClient.from('veiculos').select('placa, modelo').eq('situacao', 'ativo');
                if (veiculos) {
                    this.listaVeiculos.innerHTML = veiculos.map(v => `<option value="${v.placa}">${v.modelo}</option>`).join('');
                }
            } catch (e) { console.error('Erro ao carregar veículos', e); }
            
            // Carregar Rotas (substituindo Motoristas)
            try {
                const { data: rotas, error: errRotas } = await supabaseClient
                    .from('rotas')
                    .select('numero');
                
                if (errRotas) throw errRotas;

                if (rotas) {
                    // Ordenação numérica correta
                    rotas.sort((a, b) => {
                        return String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true, sensitivity: 'base' });
                    });

                    this.listaRotas.innerHTML = rotas.map(r => `<option value="${r.numero}"></option>`).join('');
                }
            } catch (e) { console.error('Erro ao carregar rotas', e); }
        },

        async loadBicos() {
            if (!this.saidaBico) return;
            try {
                const { data, error } = await supabaseClient
                    .from('bicos')
                    .select('id, nome, bombas(nome, tanques(nome))')
                    .order('nome');

                if (error) throw error;

                this.bicosDisponiveis = data || [];
                this.saidaBico.innerHTML = '<option value="">-- Selecione o Bico --</option>';
                this.bicosDisponiveis.forEach(bico => {
                    const tanqueInfo = bico.bombas?.tanques?.nome || 'Tanque desconhecido';
                    const bombaInfo = bico.bombas?.nome || 'Bomba desconhecida';
                    const option = new Option(`${bico.nome} (Bomba: ${bombaInfo} - Tanque: ${tanqueInfo})`, bico.id);
                    option.dataset.bombaId = bico.bombas?.id; // Armazena o ID da bomba
                    this.saidaBico.appendChild(option);
                });
            } catch (error) {
                console.error('Erro ao carregar bicos:', error);
                this.saidaBico.innerHTML = '<option value="">Erro ao carregar</option>';
            }
        },

        toggleSaidaForm(enabled, mensagem = '') {
            const campos = [this.saidaVeiculo, this.saidaRota, this.saidaKm, this.saidaLitros, this.btnSalvarSaida];
            campos.forEach(campo => {
                if (campo) campo.disabled = !enabled;
            });

            let alertDiv = document.getElementById('saida-form-alert');
            if (!alertDiv) {
                alertDiv = document.createElement('div');
                alertDiv.id = 'saida-form-alert';
                alertDiv.className = 'form-alert';
                this.formSaida.insertAdjacentElement('afterbegin', alertDiv);
            }

            if (mensagem) {
                alertDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${mensagem}`;
                alertDiv.style.display = 'block';
            } else {
                alertDiv.style.display = 'none';
            }
        },

        async verificarLeituraBomba() {
            const selectedOption = this.saidaBico.options[this.saidaBico.selectedIndex];
            const bombaId = selectedOption?.dataset.bombaId;

            if (!bombaId) {
                this.toggleSaidaForm(false);
                return;
            }

            const hoje = new Date().toISOString().slice(0, 10);
            const { data, error } = await supabaseClient.from('leituras_bomba').select('id').eq('bomba_id', bombaId).eq('data', hoje).single();

            if (error || !data) {
                this.toggleSaidaForm(false, `É necessário registrar a leitura inicial da bomba para hoje. <a href="leituras-bomba.html" target="_blank">Registrar agora</a>.`);
            } else {
                this.toggleSaidaForm(true);
            }
        },

        adicionarLinhaTanque(tanqueId = '', qtd = '') {
            const row = document.createElement('div');
            row.className = 'distribuicao-row';

            const select = document.createElement('select');
            select.className = 'tanque-select';
            select.innerHTML = '<option value="">-- Selecione um Tanque --</option>';
            this.tanquesDisponiveis.forEach(t => {
                const option = new Option(`${t.nome} (${t.tipo_combustivel})`, t.id);
                select.add(option);
            });
            select.value = tanqueId;

            const inputQtd = document.createElement('input');
            inputQtd.type = 'number';
            inputQtd.className = 'tanque-qtd';
            inputQtd.placeholder = 'Litros';
            inputQtd.step = '0.01';
            inputQtd.min = '0.01';
            inputQtd.value = qtd;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn-remove-tanque';
            removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
            removeBtn.title = 'Remover linha';

            row.appendChild(select);
            row.appendChild(inputQtd);
            row.appendChild(removeBtn);

            this.distribuicaoContainer.appendChild(row);
            this.updateLitrosRestantes();
        },

        updateLitrosRestantes() {
            const totalNota = parseFloat(this.qtdTotalNotaInput.value) || 0;
            let totalDistribuido = 0;
            this.distribuicaoContainer.querySelectorAll('.tanque-qtd').forEach(input => {
                totalDistribuido += parseFloat(input.value) || 0;
            });

            const restantes = totalNota - totalDistribuido;
            this.litrosRestantesValor.textContent = restantes.toFixed(2);
            this.litrosRestantesValor.className = restantes < 0 ? 'negativo' : 'positivo';
        },

        async getAbastecimentos() {
            try {
                // Faz join com a tabela de tanques para pegar o nome
                const { data, error } = await supabaseClient
                    .from('abastecimentos')
                    .select('*, tanques(nome, tipo_combustivel)')
                    .order('data', { ascending: false });
                
                if (error) throw error;
                return data || [];
            } catch (error) {
                console.error('Erro ao buscar abastecimentos:', error);
                return [];
            }
        },

        async handleFormSubmit(e) {
            e.preventDefault();

            const totalNota = parseFloat(this.qtdTotalNotaInput.value.replace(',', '.')) || 0;
            const vlr = parseFloat(this.vlrLitroInput.value.replace(',', '.')) || 0;
            const notaFiscal = this.notaInput.value;

            if (totalNota <= 0 || vlr <= 0) {
                alert('Quantidade Total e Valor por Litro devem ser maiores que zero.');
                return;
            }

            const linhas = this.distribuicaoContainer.querySelectorAll('.distribuicao-row');
            if (linhas.length === 0) {
                alert('Adicione pelo menos um tanque para a distribuição.');
                return;
            }

            const payloads = [];
            const tanquesUsados = new Set();
            let totalDistribuido = 0;

            for (const linha of linhas) {
                const tanqueId = linha.querySelector('.tanque-select').value;
                const qtd = parseFloat(linha.querySelector('.tanque-qtd').value.replace(',', '.')) || 0;

                if (!tanqueId || isNaN(qtd) || qtd <= 0) {
                    alert('Todas as linhas de distribuição devem ter um tanque e uma quantidade válida.');
                    return;
                }
                if (tanquesUsados.has(tanqueId)) {
                    alert('Não é permitido selecionar o mesmo tanque mais de uma vez.');
                    return;
                }

                tanquesUsados.add(tanqueId);
                totalDistribuido += qtd;

                payloads.push({
                    data: this.dataInput.value ? new Date(this.dataInput.value).toISOString() : new Date().toISOString(),
                    numero_nota: notaFiscal,
                    tanque_id: parseInt(tanqueId),
                    qtd_litros: qtd,
                    valor_litro: vlr,
                    valor_total: qtd * vlr,
                    usuario: this.getUsuarioLogado()
                });
            }

            if (Math.abs(totalDistribuido - totalNota) > 0.001) {
                alert(`A soma dos litros distribuídos (${totalDistribuido.toFixed(2)} L) não corresponde à Quantidade Total da Nota (${totalNota.toFixed(2)} L).`);
                return;
            }

            try {
                // Se estiver editando, primeiro apaga os registros antigos da mesma nota
                if (this.editingIdInput.value) {
                    const { error: deleteError } = await supabaseClient.from('abastecimentos').delete().eq('numero_nota', this.editingIdInput.value);
                    if (deleteError) throw deleteError;
                }

                const { error } = await supabaseClient.from('abastecimentos').insert(payloads);
                if (error) throw error;

                alert(`Abastecimento ${this.editingIdInput.value ? 'atualizado' : 'registrado'} com sucesso!`);
                this.clearForm();
                this.renderTable();
            } catch (error) {
                console.error('Erro ao salvar:', error);
                alert('Erro ao salvar abastecimento: ' + error.message + '. Se estiver atualizando, os dados antigos podem ter sido removidos.');
            }
        },

        async renderTable() {
            this.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';
            const registros = await this.getAbastecimentos();
            this.tableBody.innerHTML = '';

            if (registros.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="7">Nenhum registro encontrado.</td></tr>';
                return;
            }

            registros.forEach(reg => {
                const tr = document.createElement('tr');
                const dataFormatada = new Date(reg.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                // Formata o valor por litro para exibir mais casas decimais
                const vlrLitroFormatado = (reg.valor_litro || 0).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6 // Aumenta o número de casas decimais exibidas
                });
                // O valor total também precisa de mais precisão
                const totalFormatado = (reg.valor_total || 0).toLocaleString('pt-BR', {
                    style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 6
                });
                const tanqueNome = reg.tanques ? reg.tanques.nome : 'Tanque excluído';

                tr.innerHTML = `
                    <td>${dataFormatada}</td>
                    <td>${reg.numero_nota}</td>
                    <td>${tanqueNome}</td>
                    <td>${reg.qtd_litros.toLocaleString('pt-BR')} L</td>
                    <td>${vlrLitroFormatado}</td>
                    <td>${totalFormatado}</td>
                    <td>${reg.usuario || '-'}</td>
                    <td class="actions-cell">
                        <button class="btn-action btn-edit" data-id="${reg.id}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="btn-action btn-delete" data-id="${reg.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBody.appendChild(tr);
            });
        },

        handleDistribuicaoClick(e) {
            const removeBtn = e.target.closest('.btn-remove-tanque');
            if (removeBtn) {
                removeBtn.closest('.distribuicao-row').remove();
                this.updateLitrosRestantes();
            }
        },

        async handleTableClick(e) {
            const button = e.target.closest('button');
            if (!button) return;
            const id = parseInt(button.dataset.id);

            if (button.classList.contains('btn-edit')) {
                const { data: registroClicado } = await supabaseClient.from('abastecimentos').select('numero_nota').eq('id', id).single();
                if (!registroClicado) return;

                const { data: todosRegistrosDaNota, error } = await supabaseClient.from('abastecimentos').select('*').eq('numero_nota', registroClicado.numero_nota);
                if (error || !todosRegistrosDaNota || todosRegistrosDaNota.length === 0) {
                    alert('Erro ao carregar dados para edição.');
                    return;
                }

                this.clearForm(false); // Limpa o formulário sem resetar a data
                this.distribuicaoContainer.innerHTML = ''; // Limpa as linhas de tanque

                const primeiroRegistro = todosRegistrosDaNota[0];
                const qtdTotal = todosRegistrosDaNota.reduce((sum, reg) => sum + reg.qtd_litros, 0);

                this.editingIdInput.value = primeiroRegistro.numero_nota; // Armazena a nota fiscal para a lógica de update
                // Formata a data para o input datetime-local
                const date = new Date(primeiroRegistro.data);
                date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                this.dataInput.value = date.toISOString().slice(0, 16);
                this.notaInput.value = primeiroRegistro.numero_nota;
                this.vlrLitroInput.value = primeiroRegistro.valor_litro;
                this.qtdTotalNotaInput.value = qtdTotal;

                todosRegistrosDaNota.forEach(reg => {
                    this.adicionarLinhaTanque(reg.tanque_id, reg.qtd_litros);
                });

                this.calculateTotal();
                this.updateLitrosRestantes();
                this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Atualizar';
                this.form.scrollIntoView({ behavior: 'smooth' });

            } else if (button.classList.contains('btn-delete')) {
                if (confirm('Tem certeza que deseja excluir este lançamento?')) {
                    try {
                        const { error } = await supabaseClient.from('abastecimentos').delete().eq('id', id);
                        if (error) throw error;
                        this.renderTable();
                    } catch (error) {
                        console.error('Erro ao excluir:', error);
                        alert('Erro ao excluir lançamento: ' + error.message);
                    }
                }
            }
        },

        clearForm(resetDate = true) {
            this.form.reset();
            this.editingIdInput.value = '';
            if (resetDate) {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                this.dataInput.value = now.toISOString().slice(0, 16);
            }
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Registrar Entrada';
            this.distribuicaoContainer.innerHTML = '';
            this.adicionarLinhaTanque(); // Adiciona a primeira linha de volta
        },

        clearSaidaForm() {
            this.formSaida.reset();
            this.saidaEditingId.value = '';
            this.btnSalvarSaida.innerHTML = '<i class="fas fa-gas-pump"></i> CONFIRMAR ABASTECIMENTO';
            // Reseta a data para o momento atual
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            this.saidaDataHora.value = now.toISOString().slice(0, 16);
            if(this.saidaUsuario) this.saidaUsuario.value = this.getUsuarioLogado();
        },

        async handleSaidaSubmit(e) {
            e.preventDefault();
            
            const payload = {
                data_hora: this.saidaDataHora.value ? new Date(this.saidaDataHora.value).toISOString() : new Date().toISOString(),
                bico_id: parseInt(this.saidaBico.value),
                veiculo_placa: this.saidaVeiculo.value.toUpperCase(),
                rota: this.saidaRota.value,
                km_atual: parseFloat(this.saidaKm.value),
                qtd_litros: parseFloat(this.saidaLitros.value),
                usuario: this.getUsuarioLogado()
            };

            if (this.saidaEditingId.value) {
                payload.id = parseInt(this.saidaEditingId.value);
            }

            if (!payload.bico_id || !payload.qtd_litros || payload.qtd_litros <= 0) {
                alert('Preencha os campos obrigatórios.');
                return;
            }

            try {
                const { error } = await supabaseClient.from('saidas_combustivel').upsert(payload);
                if (error) throw error;

                alert(`Abastecimento ${this.saidaEditingId.value ? 'atualizado' : 'registrado'} com sucesso!`);
                this.clearSaidaForm();
                this.renderSaidasTable();
            } catch (error) {
                console.error('Erro ao salvar saída:', error);
                alert('Erro ao registrar saída: ' + error.message);
            }
        },

        async renderSaidasTable() {
            if (!this.tableBodySaidas) return;
            this.tableBodySaidas.innerHTML = '<tr><td colspan="6" class="text-center">Carregando...</td></tr>';

            try {
                const { data, error } = await supabaseClient
                    .from('saidas_combustivel')
                    .select('*')
                    .order('data_hora', { ascending: false })
                    .limit(50); // Limita aos 50 mais recentes para performance

                if (error) throw error;

                if (data.length === 0) {
                    this.tableBodySaidas.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma saída registrada.</td></tr>';
                    return;
                }

                this.tableBodySaidas.innerHTML = data.map(saida => `
                    <tr>
                        <td>${new Date(saida.data_hora).toLocaleString('pt-BR')}</td>
                        <td>${saida.veiculo_placa || ''}</td>
                        <td>${saida.rota || ''}</td>
                        <td>${saida.qtd_litros.toLocaleString('pt-BR')} L</td>
                        <td>${saida.km_atual || ''}</td>
                        <td>${saida.usuario || '-'}</td>
                        <td class="actions-cell">
                            <button class="btn-action btn-edit" data-id="${saida.id}" title="Editar"><i class="fas fa-pen"></i></button>
                            <button class="btn-action btn-delete" data-id="${saida.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('');

            } catch (error) {
                console.error('Erro ao carregar histórico de saídas:', error);
                this.tableBodySaidas.innerHTML = '<tr><td colspan="6" class="text-center" style="color:red;">Erro ao carregar histórico.</td></tr>';
            }
        },

        async handleSaidaTableClick(e) {
            const button = e.target.closest('button');
            if (!button || !button.dataset.id) return;

            const id = button.dataset.id;

            if (button.classList.contains('btn-edit')) {
                this.loadSaidaForEditing(id);
            } else if (button.classList.contains('btn-delete')) {
                if (confirm('Tem certeza que deseja excluir este registro de saída?')) {
                    this.deleteSaida(id);
                }
            }
        },

        async loadSaidaForEditing(id) {
            try {
                const { data, error } = await supabaseClient.from('saidas_combustivel').select('*').eq('id', id).single();
                if (error) throw error;

                this.saidaEditingId.value = data.id;
                const date = new Date(data.data_hora);
                date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                this.saidaDataHora.value = date.toISOString().slice(0, 16);
                if(this.saidaUsuario) this.saidaUsuario.value = data.usuario || this.getUsuarioLogado();
                this.saidaBico.value = data.bico_id;
                this.saidaVeiculo.value = data.veiculo_placa; // This is correct
                this.saidaRota.value = data.rota;
                this.saidaKm.value = data.km_atual;
                this.saidaLitros.value = data.qtd_litros;

                this.btnSalvarSaida.innerHTML = '<i class="fas fa-save"></i> ATUALIZAR SAÍDA';
                this.formSaida.scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error('Erro ao carregar saída para edição:', error);
                alert('Não foi possível carregar os dados para edição.');
            }
        },

        async deleteSaida(id) {
            try {
                const { error } = await supabaseClient.from('saidas_combustivel').delete().eq('id', id);
                if (error) throw error;
                alert('Registro de saída excluído com sucesso!');
                this.renderSaidasTable();
            } catch (error) {
                console.error('Erro ao excluir saída:', error);
                alert('Erro ao excluir o registro.');
            }
        },
    };

    AbastecimentoUI.init();
});