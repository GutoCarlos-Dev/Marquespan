import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Define a data/hora atual no input
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('saidaDataHora').value = now.toISOString().slice(0, 16);

    carregarDadosIniciais();
    carregarHistoricoRecente();

    document.getElementById('formMobileAbastecimento').addEventListener('submit', salvarAbastecimento);
    document.getElementById('btnAtualizarHistorico').addEventListener('click', carregarHistoricoRecente);
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