import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Define a data/hora atual no input
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('saidaDataHora').value = now.toISOString().slice(0, 16);
    document.getElementById('entradaData').value = now.toISOString().slice(0, 16);

    // Preenche o usuário logado na aba de Entrada
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (usuarioLogado) {
        const inputUsuario = document.getElementById('entradaUsuario');
        if (inputUsuario) inputUsuario.value = usuarioLogado.nome;
    }

    carregarDadosIniciais();
    carregarHistoricoRecente();
    carregarEstoque(); // Carrega dados para a aba de estoque e select de entrada

    // Event Listeners de Formulários
    document.getElementById('formMobileAbastecimento').addEventListener('submit', salvarAbastecimento);
    document.getElementById('formMobileEntrada').addEventListener('submit', salvarEntrada);
    
    // Botões de Atualização
    document.getElementById('btnAtualizarHistorico').addEventListener('click', carregarHistoricoRecente);
    document.getElementById('btnAtualizarEstoque').addEventListener('click', carregarEstoque);

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
    };
    document.getElementById('entradaQtdTotal').addEventListener('input', calcTotalEntrada);
    document.getElementById('entradaVlrLitro').addEventListener('input', calcTotalEntrada);
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

    // Carregar Motoristas
    try {
        const { data: motoristas, error: errMot } = await supabaseClient
            .from('funcionario')
            .select('nome')
            .eq('funcao', 'Motorista')
            .eq('status', 'Ativo')
            .order('nome');
        
        if (errMot) throw errMot;

        const dlMotoristas = document.getElementById('listaMotoristas');
        dlMotoristas.innerHTML = '';
        if (motoristas) {
            motoristas.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.nome;
                dlMotoristas.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Erro ao carregar motoristas:', e);
    }
}

async function salvarAbastecimento(e) {
    e.preventDefault();
    
    // Dados comuns
    const dataHora = document.getElementById('saidaDataHora').value;
    const placa = document.getElementById('saidaVeiculo').value.toUpperCase();
    const motorista = document.getElementById('saidaMotorista').value;
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
            motorista_nome: motorista,
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
            motorista_nome: motorista,
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
        document.getElementById('saidaMotorista').value = '';
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
                    <p><i class="far fa-user"></i> ${item.motorista_nome || 'N/I'}</p>
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
    const selectTanqueEntrada = document.getElementById('entradaTanque');
    
    // Limpa lista visual mas mantém loading se for a primeira vez
    if(listaEstoque.children.length === 0) listaEstoque.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Atualizando...</p>';

    try {
        // 1. Buscar Tanques
        const { data: tanques, error: errTanques } = await supabaseClient
            .from('tanques')
            .select('id, nome, capacidade, tipo_combustivel')
            .order('nome');

        if (errTanques) throw errTanques;

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
        selectTanqueEntrada.innerHTML = '<option value="">Selecione o Tanque</option>';

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
                    <div style="width: 100%; background: #eee; height: 5px; border-radius: 3px; margin-top: 5px;">
                        <div style="width: ${Math.min(percentual, 100)}%; background: ${colorClass}; height: 100%; border-radius: 3px;"></div>
                    </div>
                </div>
            `;
            listaEstoque.appendChild(div);

            // Opção do Select de Entrada
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.nome} (${t.tipo_combustivel})`;
            selectTanqueEntrada.appendChild(opt);
        });

    } catch (e) {
        console.error('Erro ao carregar estoque:', e);
        listaEstoque.innerHTML = '<p style="text-align:center; color:red;">Erro ao carregar dados.</p>';
    }
}

async function salvarEntrada(e) {
    e.preventDefault();
    
    const data = document.getElementById('entradaData').value;
    const nota = document.getElementById('entradaNota').value;
    const tanqueId = document.getElementById('entradaTanque').value;
    const litros = document.getElementById('entradaQtdTotal').value;
    const vlrLitro = document.getElementById('entradaVlrLitro').value;
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const usuario = usuarioLogado ? usuarioLogado.nome : 'App Mobile';

    const valorTotal = (parseFloat(litros) * parseFloat(vlrLitro)).toFixed(2);

    try {
        // 1. Insere na tabela de entradas
        const { error: errInsert } = await supabaseClient
            .from('abastecimentos')
            .insert([{
                data: data,
                numero_nota: nota,
                tanque_id: tanqueId,
                qtd_litros: litros,
                valor_litro: vlrLitro,
                valor_total: valorTotal,
                usuario: usuario
            }]);

        if (errInsert) throw errInsert;

        alert('Entrada registrada com sucesso!');
        document.getElementById('formMobileEntrada').reset();
        
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