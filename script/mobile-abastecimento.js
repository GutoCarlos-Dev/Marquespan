import { supabaseClient } from './supabase.js';

let tanquesDisponiveis = []; // Armazena os tanques para uso na distribuição

document.addEventListener('DOMContentLoaded', () => {
    // Define a data/hora atual no input
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('saidaDataHora').value = now.toISOString().slice(0, 16);
    document.getElementById('entradaData').value = now.toISOString().slice(0, 16);
    document.getElementById('transfData').value = now.toISOString().slice(0, 16);

    // Preenche o usuário logado na aba de Entrada
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (usuarioLogado) {
        const inputUsuario = document.getElementById('entradaUsuario');
        if (inputUsuario) inputUsuario.value = usuarioLogado.nome;
        const inputUsuarioSaida = document.getElementById('saidaUsuario');
        if (inputUsuarioSaida) inputUsuarioSaida.value = usuarioLogado.nome;
    }

    carregarDadosIniciais();
    carregarHistoricoRecente();
    carregarEstoque(); // Carrega dados para a aba de estoque e select de entrada

    // Event Listeners de Formulários
    document.getElementById('formMobileAbastecimento').addEventListener('submit', salvarAbastecimento);
    document.getElementById('formMobileEntrada').addEventListener('submit', salvarEntrada);
    document.getElementById('formMobileTransferencia').addEventListener('submit', salvarTransferencia);
    
    // Botões de Atualização
    document.getElementById('btnAtualizarHistorico').addEventListener('click', carregarHistoricoRecente);
    document.getElementById('btnAtualizarEstoque').addEventListener('click', carregarEstoque);

    // Botão Adicionar Tanque na Entrada
    const btnAddTanque = document.getElementById('btnAdicionarTanque');
    if (btnAddTanque) btnAddTanque.addEventListener('click', () => adicionarLinhaTanqueMobile());

    // Botão para Adicionar/Remover 2º Bico
    const btnToggleBico2 = document.getElementById('btnToggleBico2');
    const camposBico2 = document.getElementById('camposBico2');
    btnToggleBico2.addEventListener('click', () => {
        const isHidden = camposBico2.classList.contains('hidden');
        if (isHidden) {
            camposBico2.classList.remove('hidden');
            btnToggleBico2.innerHTML = '<i class="fas fa-minus"></i> Remover 2º Bico';
            btnToggleBico2.style.backgroundColor = '#dc3545'; // Red
        } else {
            camposBico2.classList.add('hidden');
            // Limpa os campos ao remover
            document.getElementById('saidaBico2').value = '';
            document.getElementById('saidaLitros2').value = '';
            btnToggleBico2.innerHTML = '<i class="fas fa-plus"></i> Adicionar 2º Bico';
            btnToggleBico2.style.backgroundColor = '#6c757d'; // Gray
        }
    });

    // Navegação por Abas
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active de todos
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

            // Ativa o clicado
            tab.classList.add('active');
            const targetId = tab.dataset.target;
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    // Cálculo automático do total na Entrada
    const calcTotalEntrada = () => {
        const qtd = parseFloat(document.getElementById('entradaQtdTotal').value) || 0;
        const vlr = parseFloat(document.getElementById('entradaVlrLitro').value) || 0;
        const total = qtd * vlr;
        document.getElementById('entradaTotal').value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        updateLitrosRestantesMobile();
    };
    document.getElementById('entradaQtdTotal').addEventListener('input', calcTotalEntrada);
    document.getElementById('entradaVlrLitro').addEventListener('input', calcTotalEntrada);

    // Listener para ajuste de estoque (delegação de evento para botões dinâmicos)
    document.getElementById('listaEstoque').addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-ajustar-estoque');
        if (btn) {
            const id = btn.dataset.id;
            const nome = btn.dataset.nome;
            const atual = parseFloat(btn.dataset.atual);
            realizarAjusteEstoque(id, nome, atual);
        }
    });
});

async function carregarDadosIniciais() {
    // Carregar Bicos e Bombas
    try {
        const { data: bicos, error: errBicos } = await supabaseClient
            .from('bicos')
            .select('id, nome, bomba_id, bombas(tanque_id, tanques(nome, tipo_combustivel))')
            .order('nome');
        
        if (errBicos) throw errBicos;

        const selectBico = document.getElementById('saidaBico');
        const selectBico2 = document.getElementById('saidaBico2');
        selectBico.innerHTML = '<option value="">Selecione o Bico</option>';
        selectBico2.innerHTML = '<option value="">Selecione o Bico</option>';
        
        if (bicos) {
            bicos.forEach(bico => {
                const nomeTanque = bico.bombas?.tanques?.nome || 'Tanque N/A';
                const combustivel = bico.bombas?.tanques?.tipo_combustivel || '';
                const option = document.createElement('option');
                option.value = bico.id;
                option.textContent = `${bico.nome} - ${combustivel} (${nomeTanque})`;
                
                selectBico.appendChild(option.cloneNode(true));
                selectBico2.appendChild(option.cloneNode(true));
            });
        }
    } catch (e) {
        console.error('Erro ao carregar bicos:', e);
    }

    // Carregar Veículos
    try {
        const { data: veiculos, error: errVeic } = await supabaseClient
            .from('veiculos')
            .select('placa, modelo')
            .eq('situacao', 'ativo')
            .order('placa');
        
        if (errVeic) throw errVeic;

        const dlVeiculos = document.getElementById('listaVeiculos');
        dlVeiculos.innerHTML = '';
        if (veiculos) {
            veiculos.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.placa;
                opt.textContent = `${v.modelo}`;
                dlVeiculos.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Erro ao carregar veículos:', e);
    }

    // Carregar Rotas (Substituindo Motoristas)
    try {
        const { data: rotas, error: errRotas } = await supabaseClient
            .from('rotas')
            .select('numero');
        
        if (errRotas) throw errRotas;

        const dlRotas = document.getElementById('listaRotas');
        dlRotas.innerHTML = '';
        
        if (rotas) {
            // Ordenação numérica correta (1, 2, 10 em vez de 1, 10, 2)
            rotas.sort((a, b) => {
                return String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true, sensitivity: 'base' });
            });

            rotas.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.numero;
                dlRotas.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Erro ao carregar rotas:', e);
    }
}

async function salvarAbastecimento(e) {
    e.preventDefault();
    
    // Dados comuns
    const dataHoraInput = document.getElementById('saidaDataHora').value;
    const dataHora = dataHoraInput ? new Date(dataHoraInput).toISOString() : new Date().toISOString();
    const placa = document.getElementById('saidaVeiculo').value.toUpperCase();
    const rota = document.getElementById('saidaRota').value;
    const km = document.getElementById('saidaKm').value;
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const usuario = usuarioLogado ? usuarioLogado.nome : 'App Mobile';

    // Dados do Bico 1
    const bicoId1 = document.getElementById('saidaBico').value;
    const litros1 = document.getElementById('saidaLitros').value;

    // Dados do Bico 2 (opcional)
    const bicoId2 = document.getElementById('saidaBico2').value;
    const litros2 = document.getElementById('saidaLitros2').value;

    if (!placa || !km) {
        alert('Preencha a Placa e o KM.');
        return;
    }

    const payloads = [];

    // Prepara payload para o Bico 1 (obrigatório)
    if (bicoId1 && litros1 > 0) {
        payloads.push({
            data_hora: dataHora,
            bico_id: bicoId1,
            veiculo_placa: placa,
            rota: rota, // Salva no campo rota
            km_atual: km,
            qtd_litros: litros1,
            usuario: usuario
        });
    } else {
        alert('Preencha os dados do Bico 1 (Bico e Litros).');
        return;
    }

    // Prepara payload para o Bico 2 (se preenchido)
    if (bicoId2 && litros2 > 0) {
        // Validação: não pode usar o mesmo bico duas vezes
        if (bicoId1 === bicoId2) {
            alert('Não é possível usar o mesmo bico duas vezes no mesmo abastecimento.');
            return;
        }
        payloads.push({
            data_hora: dataHora,
            bico_id: bicoId2,
            veiculo_placa: placa,
            rota: rota, // Salva no campo rota
            km_atual: km,
            qtd_litros: litros2,
            usuario: usuario
        });
    }

    try {
        // Salva um ou dois registros de uma vez
        const { error } = await supabaseClient
            .from('saidas_combustivel')
            .insert(payloads);

        if (error) throw error;

        alert(`Abastecimento(s) registrado(s) com sucesso!`);
        
        // Limpa campos específicos, mantendo data e bico para agilizar o próximo
        document.getElementById('saidaVeiculo').value = '';
        document.getElementById('saidaRota').value = '';
        document.getElementById('saidaKm').value = '';
        document.getElementById('saidaLitros').value = '';
        document.getElementById('saidaBico2').value = '';
        document.getElementById('saidaLitros2').value = '';
        
        // Esconde campos do bico 2
        const camposBico2 = document.getElementById('camposBico2');
        const btnToggleBico2 = document.getElementById('btnToggleBico2');
        camposBico2.classList.add('hidden');
        btnToggleBico2.innerHTML = '<i class="fas fa-plus"></i> Adicionar 2º Bico';
        btnToggleBico2.style.backgroundColor = '#6c757d';

        document.getElementById('saidaVeiculo').focus();

        carregarHistoricoRecente();

    } catch (err) {
        console.error('Erro ao salvar:', err);
        alert('Erro ao salvar abastecimento: ' + err.message);
    }
}

async function carregarHistoricoRecente() {
    const lista = document.getElementById('listaHistorico');
    lista.innerHTML = '<p style="text-align:center; color:#666;">Atualizando...</p>';

    try {
        const { data, error } = await supabaseClient
            .from('saidas_combustivel')
            .select('*')
            .order('data_hora', { ascending: false })
            .limit(10);

        if (error) throw error;

        lista.innerHTML = '';
        if (!data || data.length === 0) {
            lista.innerHTML = '<p style="text-align:center; color:#666;">Nenhum registro recente.</p>';
            return;
        }

        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'historico-item';
            const dataObj = new Date(item.data_hora);
            const dataFormatada = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            const horaFormatada = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            div.innerHTML = `
                <div class="historico-info">
                    <h4>${item.veiculo_placa}</h4>
                    <p><i class="far fa-clock"></i> ${dataFormatada} às ${horaFormatada}</p>
                    <p><i class="fas fa-route"></i> Rota: ${item.rota || item.motorista_nome || 'N/I'}</p>
                </div>
                <div class="historico-litros">
                    ${parseFloat(item.qtd_litros).toFixed(2)} L
                    <small>KM: ${item.km_atual}</small>
                </div>
            `;
            lista.appendChild(div);
        });

    } catch (e) {
        console.error('Erro ao carregar histórico:', e);
        lista.innerHTML = '<p style="text-align:center; color:red;">Erro ao carregar histórico.</p>';
    }
}

async function carregarEstoque() {
    const listaEstoque = document.getElementById('listaEstoque');
    const selectOrigem = document.getElementById('transfOrigem');
    const selectDestino = document.getElementById('transfDestino');
    
    // Limpa lista visual mas mantém loading se for a primeira vez
    if(listaEstoque.children.length === 0) listaEstoque.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Atualizando...</p>';

    try {
        // 1. Buscar Tanques
        const { data: tanques, error: errTanques } = await supabaseClient
            .from('tanques')
            .select('id, nome, capacidade, tipo_combustivel')
            .order('nome');

        if (errTanques) throw errTanques;
        tanquesDisponiveis = tanques; // Salva para usar na distribuição

        // 2. Buscar Entradas (Abastecimentos)
        const { data: entradas, error: errEntradas } = await supabaseClient
            .from('abastecimentos')
            .select('tanque_id, qtd_litros');
        
        if (errEntradas) throw errEntradas;

        // 3. Buscar Saídas
        const { data: saidas, error: errSaidas } = await supabaseClient
            .from('saidas_combustivel')
            .select('qtd_litros, bicos(bombas(tanque_id))');

        if (errSaidas) throw errSaidas;

        // 4. Calcular Estoque
        const estoqueMap = new Map();
        tanques.forEach(t => {
            estoqueMap.set(t.id, { ...t, estoque_atual: 0 });
        });

        entradas.forEach(e => {
            if (estoqueMap.has(e.tanque_id)) {
                estoqueMap.get(e.tanque_id).estoque_atual += (parseFloat(e.qtd_litros) || 0);
            }
        });

        saidas.forEach(s => {
            const tanqueId = s.bicos?.bombas?.tanque_id;
            if (tanqueId && estoqueMap.has(tanqueId)) {
                estoqueMap.get(tanqueId).estoque_atual -= (parseFloat(s.qtd_litros) || 0);
            }
        });

        // Popula Lista de Estoque (Aba 3)
        listaEstoque.innerHTML = '';
        // Popula Select de Entrada (Aba 2)
        if(selectOrigem) selectOrigem.innerHTML = '<option value="">Selecione Tanque Origem</option>';
        if(selectDestino) selectDestino.innerHTML = '<option value="">Selecione Tanque Destino</option>';

        if (estoqueMap.size === 0) {
            listaEstoque.innerHTML = '<p style="text-align:center; padding:20px;">Nenhum tanque cadastrado.</p>';
            return;
        }

        estoqueMap.forEach(t => {
            // Item da Lista de Estoque
            const div = document.createElement('div');
            div.className = 'stock-item';
            const percentual = t.capacidade > 0 ? ((t.estoque_atual / t.capacidade) * 100).toFixed(0) : 0;
            
            // Define cor da barra/texto baseado no nível
            let colorClass = '#006937'; // Verde
            if(percentual < 20) colorClass = '#dc3545'; // Vermelho
            else if(percentual < 50) colorClass = '#ffc107'; // Amarelo

            div.innerHTML = `
                <div class="stock-info">
                    <h4>${t.nome}</h4>
                    <p>${t.tipo_combustivel}</p>
                </div>
                <div class="stock-level">
                    <strong style="color: ${colorClass}">${parseFloat(t.estoque_atual).toFixed(0)} L</strong>
                    <small>${percentual}% de ${parseFloat(t.capacidade).toFixed(0)} L</small>
                    <div style="width: 100%; background: #eee; height: 5px; border-radius: 3px; margin-top: 5px; margin-bottom: 8px;">
                        <div style="width: ${Math.min(percentual, 100)}%; background: ${colorClass}; height: 100%; border-radius: 3px;"></div>
                    </div>
                    <button class="btn-ajustar-estoque" data-id="${t.id}" data-nome="${t.nome}" data-atual="${t.estoque_atual}" style="width: 100%; padding: 6px; background-color: #6c757d; color: white; border: none; border-radius: 4px; font-size: 0.85rem; cursor: pointer;">
                        <i class="fas fa-edit"></i> Informar Estoque
                    </button>
                </div>
            `;
            listaEstoque.appendChild(div);


            // Opções de Transferência
            if(selectOrigem) {
                const optO = opt.cloneNode(true);
                selectOrigem.appendChild(optO);
            }
            if(selectDestino) {
                const optD = opt.cloneNode(true);
                selectDestino.appendChild(optD);
            }
        });

        // Inicializa a distribuição se estiver vazia
        const distContainer = document.getElementById('distribuicao-container');
        if (distContainer && distContainer.children.length === 0) {
            adicionarLinhaTanqueMobile();
        }

        // Carrega o histórico de movimentação também
        carregarHistoricoMovimentacao();

    } catch (e) {
        console.error('Erro ao carregar estoque:', e);
        listaEstoque.innerHTML = '<p style="text-align:center; color:red;">Erro ao carregar dados.</p>';
    }
}

async function salvarEntrada(e) {
    e.preventDefault();
    
    const dataInput = document.getElementById('entradaData').value;
    const data = dataInput ? new Date(dataInput).toISOString() : new Date().toISOString();
    const nota = document.getElementById('entradaNota').value;
    const litrosTotal = parseFloat(document.getElementById('entradaQtdTotal').value);
    const vlrLitro = parseFloat(document.getElementById('entradaVlrLitro').value);
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const usuario = usuarioLogado ? usuarioLogado.nome : 'App Mobile';

    // Validação da Distribuição
    const linhas = document.querySelectorAll('.distribuicao-row');
    if (linhas.length === 0) {
        alert('Adicione pelo menos um tanque para distribuição.');
        return;
    }

    const payloads = [];
    let totalDistribuido = 0;
    const tanquesUsados = new Set();

    for (const linha of linhas) {
        const tanqueId = linha.querySelector('.tanque-select').value;
        const qtd = parseFloat(linha.querySelector('.tanque-qtd').value);

        if (!tanqueId || isNaN(qtd) || qtd <= 0) {
            alert('Preencha todos os campos de tanque e quantidade corretamente.');
            return;
        }
        if (tanquesUsados.has(tanqueId)) {
            alert('Não é permitido selecionar o mesmo tanque mais de uma vez.');
            return;
        }
        tanquesUsados.add(tanqueId);
        totalDistribuido += qtd;

        payloads.push({
            data: data,
            numero_nota: nota,
            tanque_id: parseInt(tanqueId),
            qtd_litros: qtd,
            valor_litro: vlrLitro,
            valor_total: (qtd * vlrLitro).toFixed(2),
            usuario: usuario
        });
    }

    if (Math.abs(totalDistribuido - litrosTotal) > 0.01) {
        alert(`A soma distribuída (${totalDistribuido.toFixed(2)} L) não corresponde ao total da nota (${litrosTotal.toFixed(2)} L).`);
        return;
    }

    try {
        // 1. Insere na tabela de entradas
        const { error: errInsert } = await supabaseClient
            .from('abastecimentos')
            .insert(payloads);

        if (errInsert) throw errInsert;

        alert('Entrada registrada com sucesso!');
        document.getElementById('formMobileEntrada').reset();
        
        // Limpa distribuição e adiciona uma linha nova
        document.getElementById('distribuicao-container').innerHTML = '';
        adicionarLinhaTanqueMobile();
        updateLitrosRestantesMobile();
        
        // Reseta a data para hoje
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('entradaData').value = now.toISOString().slice(0, 16);

        carregarEstoque(); // Atualiza a visualização

    } catch (err) {
        console.error('Erro ao salvar entrada:', err);
        alert('Erro ao registrar entrada: ' + err.message);
    }
}

async function salvarTransferencia(e) {
    e.preventDefault();
    const dataInput = document.getElementById('transfData').value;
    const data = dataInput ? new Date(dataInput).toISOString() : new Date().toISOString();
    const origemId = document.getElementById('transfOrigem').value;
    const destinoId = document.getElementById('transfDestino').value;
    const qtd = parseFloat(document.getElementById('transfQtd').value);
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const usuario = usuarioLogado ? usuarioLogado.nome : 'App Mobile';

    if (!origemId || !destinoId) {
        alert('Selecione os tanques de origem e destino.');
        return;
    }
    if (origemId === destinoId) {
        alert('Origem e Destino devem ser diferentes.');
        return;
    }
    if (isNaN(qtd) || qtd <= 0) {
        alert('Quantidade inválida.');
        return;
    }

    try {
        const records = [
            { data: data, numero_nota: 'TRANSFERENCIA', tanque_id: origemId, qtd_litros: -qtd, valor_litro: 0, valor_total: 0, usuario: usuario },
            { data: data, numero_nota: 'TRANSFERENCIA', tanque_id: destinoId, qtd_litros: qtd, valor_litro: 0, valor_total: 0, usuario: usuario }
        ];

        const { error } = await supabaseClient.from('abastecimentos').insert(records);
        if (error) throw error;

        alert('Transferência realizada com sucesso!');
        document.getElementById('formMobileTransferencia').reset();
        
        // Reset date
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('transfData').value = now.toISOString().slice(0, 16);

        carregarEstoque();

    } catch (err) {
        console.error('Erro ao transferir:', err);
        alert('Erro ao realizar transferência: ' + err.message);
    }
}

async function realizarAjusteEstoque(id, nome, estoqueCalculado) {
    const novoValorStr = prompt(`Informe a quantidade real (física) para o tanque ${nome}:`, estoqueCalculado);
    if (novoValorStr === null) return; // Cancelado pelo usuário

    const novoValor = parseFloat(novoValorStr.replace(',', '.'));
    if (isNaN(novoValor) || novoValor < 0) {
        alert('Valor inválido. Informe um número positivo.');
        return;
    }

    const diferenca = novoValor - estoqueCalculado;
    if (Math.abs(diferenca) < 0.01) {
        alert('O valor informado é igual ao calculado. Nenhum ajuste necessário.');
        return;
    }

    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const usuario = usuarioLogado ? usuarioLogado.nome : 'App Mobile';
    const dataAjuste = new Date().toISOString();

    try {
        const { error } = await supabaseClient.from('abastecimentos').insert([{
            data: dataAjuste,
            numero_nota: 'AJUSTE DE ESTOQUE',
            tanque_id: parseInt(id),
            qtd_litros: diferenca, // Pode ser positivo (entrada) ou negativo (saída)
            valor_litro: 0,
            valor_total: 0,
            usuario: usuario
        }]);

        if (error) throw error;

        alert('Estoque ajustado com sucesso!');
        carregarEstoque(); // Recarrega a lista para mostrar o novo valor

    } catch (err) {
        console.error('Erro ao ajustar estoque:', err);
        alert('Erro ao salvar ajuste: ' + err.message);
    }
}

async function carregarHistoricoMovimentacao() {
    const lista = document.getElementById('listaHistoricoEstoque');
    if (!lista) return;
    
    lista.innerHTML = '<p style="text-align:center; color:#666;">Atualizando...</p>';

    try {
        // 1. Buscar Entradas e Ajustes (Tabela abastecimentos)
        const { data: entradas, error: errEntradas } = await supabaseClient
            .from('abastecimentos')
            .select('id, data, numero_nota, qtd_litros, usuario, tanques(nome)')
            .order('data', { ascending: false })
            .limit(20);
        
        if (errEntradas) throw errEntradas;

        // 2. Buscar Saídas (Tabela saidas_combustivel)
        const { data: saidas, error: errSaidas } = await supabaseClient
            .from('saidas_combustivel')
            .select('id, data_hora, veiculo_placa, qtd_litros, usuario, bicos(bombas(tanques(nome)))')
            .order('data_hora', { ascending: false })
            .limit(20);

        if (errSaidas) throw errSaidas;

        // 3. Combinar e Ordenar
        const historico = [];

        entradas.forEach(e => {
            historico.push({
                tipo: 'ENTRADA', // Pode ser AJUSTE ou TRANSFERENCIA também
                data: e.data,
                detalhe: e.numero_nota === 'AJUSTE DE ESTOQUE' ? 'Ajuste Manual' : (e.numero_nota === 'TRANSFERENCIA' ? 'Transferência' : `NF: ${e.numero_nota}`),
                tanque: e.tanques?.nome || 'N/A',
                qtd: e.qtd_litros,
                usuario: e.usuario
            });
        });

        saidas.forEach(s => {
            historico.push({
                tipo: 'SAIDA',
                data: s.data_hora,
                detalhe: `Veículo: ${s.veiculo_placa}`,
                tanque: s.bicos?.bombas?.tanques?.nome || 'N/A',
                qtd: s.qtd_litros,
                usuario: s.usuario
            });
        });

        // Ordena do mais recente para o mais antigo
        historico.sort((a, b) => new Date(b.data) - new Date(a.data));
        const top20 = historico.slice(0, 20);

        lista.innerHTML = '';
        if (top20.length === 0) {
            lista.innerHTML = '<p style="text-align:center; padding:20px;">Nenhuma movimentação recente.</p>';
            return;
        }

        top20.forEach(item => {
            const div = document.createElement('div');
            div.className = 'historico-item';
            
            // Define cor da borda lateral baseada no tipo
            if (item.tipo === 'SAIDA') {
                div.style.borderLeftColor = '#dc3545'; // Vermelho
            } else if (item.detalhe === 'Transferência') {
                div.style.borderLeftColor = '#ffc107'; // Amarelo
            } else {
                div.style.borderLeftColor = '#28a745'; // Verde
            }

            const dataObj = new Date(item.data);
            const dataFormatada = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            const horaFormatada = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            const qtdFormatted = parseFloat(item.qtd).toFixed(2);
            const sinal = item.tipo === 'SAIDA' || (item.tipo === 'ENTRADA' && item.qtd < 0) ? '-' : '+';
            const corQtd = item.tipo === 'SAIDA' || item.qtd < 0 ? '#dc3545' : '#28a745';

            div.innerHTML = `
                <div class="historico-info">
                    <h4>${item.tanque}</h4>
                    <p><i class="far fa-clock"></i> ${dataFormatada} ${horaFormatada !== '00:00' ? horaFormatada : ''}</p>
                    <p><i class="fas fa-info-circle"></i> ${item.detalhe}</p>
                    <p><i class="far fa-user"></i> ${item.usuario || 'N/I'}</p>
                </div>
                <div class="historico-litros" style="color: ${corQtd}">
                    ${sinal}${Math.abs(qtdFormatted)} L
                </div>
            `;
            lista.appendChild(div);
        });

    } catch (e) {
        console.error('Erro ao carregar histórico de movimentação:', e);
        lista.innerHTML = '<p style="text-align:center; color:red;">Erro ao carregar histórico.</p>';
    }
}

// Funções Auxiliares para Distribuição Mobile
function adicionarLinhaTanqueMobile(tanqueId = '', qtd = '') {
    const container = document.getElementById('distribuicao-container');
    const row = document.createElement('div');
    row.className = 'distribuicao-row';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.marginBottom = '10px';
    row.style.alignItems = 'center';

    const select = document.createElement('select');
    select.className = 'tanque-select';
    select.style.flex = '2';
    select.style.padding = '10px';
    select.style.border = '1px solid #ccc';
    select.style.borderRadius = '4px';
    
    select.innerHTML = '<option value="">Tanque</option>';
    tanquesDisponiveis.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = `${t.nome} (${t.tipo_combustivel})`;
        select.appendChild(option);
    });
    select.value = tanqueId;

    const inputQtd = document.createElement('input');
    inputQtd.type = 'number';
    inputQtd.className = 'tanque-qtd';
    inputQtd.placeholder = 'Litros';
    inputQtd.step = '0.01';
    inputQtd.min = '0.01';
    inputQtd.value = qtd;
    inputQtd.style.flex = '1';
    inputQtd.style.padding = '10px';
    inputQtd.style.border = '1px solid #ccc';
    inputQtd.style.borderRadius = '4px';
    inputQtd.style.width = '80px';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
    removeBtn.style.background = '#dc3545';
    removeBtn.style.color = 'white';
    removeBtn.style.border = 'none';
    removeBtn.style.borderRadius = '4px';
    removeBtn.style.padding = '10px';
    removeBtn.style.cursor = 'pointer';

    removeBtn.addEventListener('click', () => {
        row.remove();
        updateLitrosRestantesMobile();
    });

    inputQtd.addEventListener('input', updateLitrosRestantesMobile);

    row.appendChild(select);
    row.appendChild(inputQtd);
    row.appendChild(removeBtn);

    container.appendChild(row);
    updateLitrosRestantesMobile();
}

function updateLitrosRestantesMobile() {
    const totalNota = parseFloat(document.getElementById('entradaQtdTotal').value) || 0;
    let totalDistribuido = 0;
    document.querySelectorAll('.tanque-qtd').forEach(input => {
        totalDistribuido += parseFloat(input.value) || 0;
    });

    const restantes = totalNota - totalDistribuido;
    const el = document.getElementById('litros-restantes-valor');
    if(el) {
        el.textContent = restantes.toFixed(2);
        el.style.color = restantes < 0 ? 'red' : (Math.abs(restantes) < 0.01 ? 'green' : 'orange');
    }
}