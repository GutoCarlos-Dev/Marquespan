import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Define a data/hora atual no input
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('saidaDataHora').value = now.toISOString().slice(0, 16);
    document.getElementById('entradaData').value = now.toISOString().slice(0, 10);

    carregarDadosIniciais();
    carregarHistoricoRecente();
    carregarEstoque(); // Carrega dados para a aba de estoque e select de entrada

    // Event Listeners de Formulários
    document.getElementById('formMobileAbastecimento').addEventListener('submit', salvarAbastecimento);
    document.getElementById('formMobileEntrada').addEventListener('submit', salvarEntrada);
    
    // Botões de Atualização
    document.getElementById('btnAtualizarHistorico').addEventListener('click', carregarHistoricoRecente);
    document.getElementById('btnAtualizarEstoque').addEventListener('click', carregarEstoque);

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
        selectBico.innerHTML = '<option value="">Selecione o Bico</option>';
        
        if (bicos) {
            bicos.forEach(bico => {
                const nomeTanque = bico.bombas?.tanques?.nome || 'Tanque N/A';
                const combustivel = bico.bombas?.tanques?.tipo_combustivel || '';
                const option = document.createElement('option');
                option.value = bico.id;
                option.textContent = `${bico.nome} - ${combustivel} (${nomeTanque})`;
                selectBico.appendChild(option);
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
    
    const dataHora = document.getElementById('saidaDataHora').value;
    const bicoId = document.getElementById('saidaBico').value;
    const placa = document.getElementById('saidaVeiculo').value.toUpperCase();
    const motorista = document.getElementById('saidaMotorista').value;
    const km = document.getElementById('saidaKm').value;
    const litros = document.getElementById('saidaLitros').value;
    
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const usuario = usuarioLogado ? usuarioLogado.nome : 'App Mobile';

    if (!bicoId || !placa || !litros) {
        alert('Preencha os campos obrigatórios.');
        return;
    }

    try {
        // Salva na tabela de saídas (ajuste o nome da tabela conforme seu banco, assumindo 'abastecimentos_saida')
        const { error } = await supabaseClient
            .from('abastecimentos_saida')
            .insert([{
                data_hora: dataHora,
                bico_id: bicoId,
                placa: placa,
                motorista: motorista,
                km_atual: km,
                litros: litros,
                usuario: usuario
            }]);

        if (error) throw error;

        alert('Abastecimento registrado com sucesso!');
        
        // Limpa campos específicos, mantendo data e bico para agilizar o próximo
        document.getElementById('saidaVeiculo').value = '';
        document.getElementById('saidaMotorista').value = '';
        document.getElementById('saidaKm').value = '';
        document.getElementById('saidaLitros').value = '';
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
            .from('abastecimentos_saida')
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
                    <h4>${item.placa}</h4>
                    <p><i class="far fa-clock"></i> ${dataFormatada} às ${horaFormatada}</p>
                    <p><i class="far fa-user"></i> ${item.motorista || 'N/I'}</p>
                </div>
                <div class="historico-litros">
                    ${parseFloat(item.litros).toFixed(2)} L
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
        const { data: tanques, error } = await supabaseClient
            .from('tanques')
            .select('*')
            .order('nome');

        if (error) throw error;

        // Popula Lista de Estoque (Aba 3)
        listaEstoque.innerHTML = '';
        // Popula Select de Entrada (Aba 2)
        selectTanqueEntrada.innerHTML = '<option value="">Selecione o Tanque</option>';

        if (!tanques || tanques.length === 0) {
            listaEstoque.innerHTML = '<p style="text-align:center; padding:20px;">Nenhum tanque cadastrado.</p>';
            return;
        }

        tanques.forEach(t => {
            // Item da Lista de Estoque
            const div = document.createElement('div');
            div.className = 'stock-item';
            const percentual = t.capacidade > 0 ? ((t.estoque_atual / t.capacidade) * 100).toFixed(0) : 0;
            
            div.innerHTML = `
                <div class="stock-info">
                    <h4>${t.nome}</h4>
                    <p>${t.tipo_combustivel}</p>
                </div>
                <div class="stock-level">
                    <strong>${parseFloat(t.estoque_atual).toFixed(0)} L</strong>
                    <small>${percentual}% de ${parseFloat(t.capacidade).toFixed(0)} L</small>
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
    const litros = document.getElementById('entradaLitros').value;
    const valorTotal = document.getElementById('entradaValor').value;
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const usuario = usuarioLogado ? usuarioLogado.nome : 'App Mobile';

    try {
        // 1. Insere na tabela de entradas
        const { error: errInsert } = await supabaseClient
            .from('abastecimentos_entradas')
            .insert([{
                data: data,
                nota_fiscal: nota,
                tanque_id: tanqueId,
                litros: litros,
                valor_total: valorTotal,
                usuario: usuario
            }]);

        if (errInsert) throw errInsert;

        // 2. Atualiza o estoque do tanque (RPC ou Update direto)
        // Aqui faremos um update direto buscando o valor atual primeiro para garantir consistência simples
        const { data: tanqueAtual } = await supabaseClient.from('tanques').select('estoque_atual').eq('id', tanqueId).single();
        const novoEstoque = (parseFloat(tanqueAtual.estoque_atual) + parseFloat(litros));

        const { error: errUpdate } = await supabaseClient
            .from('tanques')
            .update({ estoque_atual: novoEstoque })
            .eq('id', tanqueId);

        if (errUpdate) throw errUpdate;

        alert('Entrada registrada com sucesso!');
        document.getElementById('formMobileEntrada').reset();
        
        // Reseta a data para hoje
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('entradaData').value = now.toISOString().slice(0, 10);

        carregarEstoque(); // Atualiza a visualização

    } catch (err) {
        console.error('Erro ao salvar entrada:', err);
        alert('Erro ao registrar entrada: ' + err.message);
    }
}