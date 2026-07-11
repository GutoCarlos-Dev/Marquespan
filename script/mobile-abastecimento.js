import { supabaseClient } from './supabase.js';
import { calcularEstoqueAtual } from './abastecimento/estoque-service.js';
import { registrarAuditoria } from './auditoria-utils.js';
import { getValoresFilialRelacionados } from './shared/filial-utils.js';

const TIMEZONE_SAO_PAULO = 'America/Sao_Paulo';
const OFFSET_SAO_PAULO = '-03:00';

function getDataHoraSaoPaulo(date = new Date(), incluirSegundos = false) {
    const partes = new Intl.DateTimeFormat('sv-SE', {
        timeZone: TIMEZONE_SAO_PAULO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});

    const dataHora = `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
    return incluirSegundos ? `${dataHora}:${partes.second}` : dataHora;
}

function getDataHoraLocalParaBanco(valor) {
    const dataHora = valor || getDataHoraSaoPaulo(new Date(), true);
    const dataHoraComSegundos = dataHora.length === 16 ? `${dataHora}:00` : dataHora;
    return new Date(`${dataHoraComSegundos}${OFFSET_SAO_PAULO}`).toISOString();
}

function formatarDataHoraLancamento(valor) {
    if (!valor) return '--/--/---- --:--:--';
    const [data, hora = ''] = valor.split('T');
    const [ano, mes, dia] = data.split('-');
    const horaCompleta = hora.length === 5 ? `${hora}:00` : hora;
    return `${dia}/${mes}/${ano} ${horaCompleta}`;
}

function atualizarRelogioLancamentoSaida() {
    const dataHoraAtual = getDataHoraSaoPaulo(new Date(), true);
    const inputDataSaida = document.getElementById('saidaDataHora');
    const displayDataSaida = document.getElementById('saidaDataHoraDisplay');

    if (inputDataSaida) inputDataSaida.value = dataHoraAtual;
    if (displayDataSaida) displayDataSaida.textContent = formatarDataHoraLancamento(dataHoraAtual);
}

function iniciarRelogioLancamentoSaida() {
    atualizarRelogioLancamentoSaida();
    window.setInterval(atualizarRelogioLancamentoSaida, 1000);
}

let tanquesDisponiveis = []; // Armazena os tanques para uso na distribuição
let veiculosDisponiveisCache = []; // Cache para validação de placa
let saidaVeiculoLookupTimer = null;
let filiaisCache = null;

async function exigirSessaoSupabaseAtiva() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) {
        throw new Error('Sessao expirada. Faca login novamente antes de salvar o abastecimento.');
    }
    return session;
}

function getUserFilial() {
    try {
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        return usuarioLogado?.filial || '';
    } catch (e) {
        console.error('Erro ao identificar a filial do usuário:', e);
        return '';
    }
}

async function getFiliaisCache() {
    if (filiaisCache) return filiaisCache;

    const { data, error } = await supabaseClient
        .from('filiais')
        .select('nome, sigla');

    if (error) {
        console.warn('Nao foi possivel carregar filiais para filtros mobile:', error);
        filiaisCache = [];
    } else {
        filiaisCache = data || [];
    }

    return filiaisCache;
}

async function getValoresFilialUsuario() {
    const filialUsuario = getUserFilial();
    if (!filialUsuario) return [];

    const filiais = await getFiliaisCache();
    const valores = getValoresFilialRelacionados(filialUsuario, filiais);
    return valores.length ? valores : [filialUsuario];
}

function formatarLitrosMobile(valor) {
    const digitos = String(valor || '').replace(/\D/g, '');
    if (!digitos) return '';

    const numero = parseInt(digitos, 10) / 100;
    return numero.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function parseLitrosMobile(valor) {
    const normalizado = String(valor || '').replace(/\./g, '').replace(',', '.');
    const numero = parseFloat(normalizado);
    return Number.isFinite(numero) ? numero : 0;
}

function getEstoqueInformadoAjusteMobile(entrada) {
    const valorLitroInformado = parseFloat(entrada.valor_litro) || 0;
    if (valorLitroInformado > 0) return valorLitroInformado;

    const valorInformado = parseFloat(entrada.valor_total) || 0;
    if (valorInformado > 0) return valorInformado;

    const diferencaLegada = parseFloat(entrada.qtd_litros) || 0;
    return diferencaLegada !== 0 ? Math.abs(diferencaLegada) : null;
}

function formatarLitrosDisplay(valor, casas = 2) {
    const numero = parseFloat(valor) || 0;
    return numero.toLocaleString('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas
    });
}

function aplicarMascaraLitrosMobile(input) {
    if (!input) return;

    input.addEventListener('input', () => {
        input.value = formatarLitrosMobile(input.value);
    });

    input.addEventListener('blur', () => {
        input.value = formatarLitrosMobile(input.value);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Define a data/hora atual de Sao Paulo no input.
    const agoraSaoPaulo = getDataHoraSaoPaulo();
    iniciarRelogioLancamentoSaida();
    document.getElementById('entradaData').value = agoraSaoPaulo;
    document.getElementById('transfData').value = agoraSaoPaulo;

    // Preenche o usuário logado na aba de Entrada
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (usuarioLogado) {
        const inputUsuario = document.getElementById('entradaUsuario');
        if (inputUsuario) inputUsuario.value = usuarioLogado.nome;
        const inputUsuarioSaida = document.getElementById('saidaUsuario');
        if (inputUsuarioSaida) inputUsuarioSaida.value = usuarioLogado.nome;
    }

    carregarDadosIniciais();
    carregarMotoristas();
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
        const qtd = parseFloat(document.getElementById('entradaQtdTotal').value.replace(',', '.')) || 0;
        const vlr = parseFloat(document.getElementById('entradaVlrLitro').value.replace(',', '.')) || 0;
        const total = qtd * vlr;
        document.getElementById('entradaTotal').value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        updateLitrosRestantesMobile();
    };
    document.getElementById('entradaQtdTotal').addEventListener('input', calcTotalEntrada);
    document.getElementById('entradaVlrLitro').addEventListener('input', calcTotalEntrada);

    aplicarMascaraLitrosMobile(document.getElementById('saidaLitros'));
    aplicarMascaraLitrosMobile(document.getElementById('saidaLitros2'));

    // Listener para ajuste de estoque (delegação de evento para botões dinâmicos)
    document.getElementById('listaEstoque').addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-ajustar-estoque');
        if (btn) {
            const id = btn.dataset.id;
            const nome = btn.dataset.nome;
            const atual = parseFloat(btn.dataset.atual);
            realizarAjusteEstoque(id, nome, atual, btn);
        }
    });

    // Busca o Último KM ao selecionar um veículo (Aba Saída)
    const inputVeiculo = document.getElementById('saidaVeiculo');
    if (inputVeiculo) {
        const atualizarDadosSaidaPorPlaca = (e, delay = 300) => {
            clearTimeout(saidaVeiculoLookupTimer);
            const placa = e.target.value;
            saidaVeiculoLookupTimer = setTimeout(() => {
                buscarUltimoKm(placa);
                buscarDadosRetornoRota(placa);
            }, delay);
        };
        inputVeiculo.addEventListener('input', (e) => atualizarDadosSaidaPorPlaca(e));
        inputVeiculo.addEventListener('change', (e) => atualizarDadosSaidaPorPlaca(e, 0));
    }

    const inputDataSaida = document.getElementById('saidaDataHora');
    if (inputDataSaida) {
        inputDataSaida.addEventListener('change', () => {
            if (inputVeiculo?.value) {
                buscarDadosRetornoRota(inputVeiculo.value);
            }
        });
    }
});


async function carregarMotoristas() {
    try {
        const { data: motoristas } = await supabaseClient
            .from('funcionario')
            .select('nome')
            .ilike('funcao', '%Motorista%')
            .eq('status', 'Ativo');
        
        if (motoristas && document.getElementById('listaMotoristasMobile')) {
            document.getElementById('listaMotoristasMobile').innerHTML = 
                motoristas.map(m => `<option value="${m.nome}"></option>`).join('');
        }
    } catch (e) { console.error('Erro ao carregar motoristas', e); }
}


async function carregarDadosIniciais() {
    // Carregar Bicos e Bombas
    try {
        let queryBicos = supabaseClient
            .from('bicos')
            .select('id, nome, bomba_id, bombas!inner(tanque_id, tanques!inner(nome, tipo_combustivel, filial))');

        const filiaisUsuario = await getValoresFilialUsuario();
        if (filiaisUsuario.length > 0) {
            queryBicos = queryBicos.in('bombas.tanques.filial', filiaisUsuario);
        }

        const { data: bicos, error: errBicos } = await queryBicos.order('nome');
        
        if (errBicos) throw errBicos;

        const selectBico = document.getElementById('saidaBico');
        const selectBico2 = document.getElementById('saidaBico2');
        selectBico.innerHTML = '<option value="">Selecione o Bico</option>';
        selectBico2.innerHTML = '<option value="">Selecione o Bico</option>';
        
        if (bicos) {
            bicos.sort((a, b) => a.nome.localeCompare(b.nome, undefined, { numeric: true, sensitivity: 'base' }));
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
        let queryVeiculos = supabaseClient
            .from('veiculos')
            .select('placa, modelo, tipo, volume_tanque');

        const filiaisUsuario = await getValoresFilialUsuario();
        if (filiaisUsuario.length > 0) {
            queryVeiculos = queryVeiculos.in('filial', filiaisUsuario);
        }

        const { data: veiculos, error: errVeic } = await queryVeiculos.order('placa');
        
        if (errVeic) throw errVeic;

        veiculosDisponiveisCache = veiculos || []; // Armazena no cache

        const dlVeiculos = document.getElementById('listaVeiculos');
        dlVeiculos.innerHTML = '';
        if (veiculos) {
            veiculos.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.placa;
                opt.textContent = v.modelo;
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
    const btnSubmit = e.target.querySelector('button[type="submit"]');

    // Bloqueia o botão para evitar cliques duplos durante instabilidade de rede
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.dataset.originalContent = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }
    
    try {
        await exigirSessaoSupabaseAtiva();

        // Dados comuns
        const dataHoraInput = document.getElementById('saidaDataHora').value;
        const dataHora = getDataHoraLocalParaBanco(dataHoraInput);
        const placa = document.getElementById('saidaVeiculo').value.toUpperCase();
        const rota = document.getElementById('saidaRota').value;
        const motorista = document.getElementById('saidaMotorista').value;
        const km = document.getElementById('saidaKm').value;

        // Validação da Placa
        const veiculoObj = veiculosDisponiveisCache.find(v => v.placa === placa);
        if (!veiculoObj) {
            alert('Placa inválida. Por favor, selecione um veículo cadastrado na lista.');
            document.getElementById('saidaVeiculo').focus();
            return;
        }
        const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
        const usuario = usuarioLogado ? usuarioLogado.nome : 'App Mobile';

        // Dados do Bico 1
        const bicoId1 = document.getElementById('saidaBico').value;
        const litros1 = parseLitrosMobile(document.getElementById('saidaLitros').value);

        // Dados do Bico 2 (opcional)
        const bicoId2 = document.getElementById('saidaBico2').value;
        const litros2 = parseLitrosMobile(document.getElementById('saidaLitros2').value);
        const dataReferencia = null; // campo disponível apenas no modo desktop

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
                rota: rota,
                motorista: motorista,
                km_atual: km,
                qtd_litros: litros1,
                usuario: usuario,
                data_referencia: dataReferencia
            });
        } else {
            alert('Preencha os dados do Bico 1 (Bico e Litros).');
            return;
        }

        // Prepara payload para o Bico 2 (se preenchido)
        if (bicoId2 && litros2 > 0) {
            if (bicoId1 === bicoId2) {
                alert('Não é possível usar o mesmo bico duas vezes no mesmo abastecimento.');
                return;
            }
            payloads.push({
                data_hora: dataHora,
                bico_id: bicoId2,
                veiculo_placa: placa,
                rota: rota,
                motorista: motorista,
                km_atual: km,
                qtd_litros: litros2,
                usuario: usuario,
                data_referencia: dataReferencia
            });
        }

        // VALIDAÇÕES DE NEGÓCIO (Gerador fica isento)
        if (veiculoObj.tipo !== 'GERADOR') {
            // 1. Validar diferença de KM (máx. 5.000 km)
            const ultimoKmRaw = document.getElementById('saidaUltimoKm')?.value || '';
            const ultimoKm = parseFloat(ultimoKmRaw);
            const kmValue2 = parseFloat(km);
            if (!isNaN(ultimoKm) && ultimoKm > 0 && !isNaN(kmValue2) && kmValue2 > 0) {
                const difKm = kmValue2 - ultimoKm;
                if (difKm > 5000) {
                    alert(
                        `⚠️ KM Inválido!\n\n` +
                        `O KM atual informado (${kmValue2.toLocaleString('pt-BR')}) excede em ` +
                        `${difKm.toLocaleString('pt-BR')} km o Último KM registrado (${ultimoKm.toLocaleString('pt-BR')}).\n\n` +
                        `A diferença máxima permitida é de 5.000 km.\n` +
                        `Verifique o odômetro e tente novamente.`
                    );
                    return;
                }
            }

            // 2. Validar capacidade total do tanque do veículo
            const capacidade = parseFloat(veiculoObj.volume_tanque) || 0;
            if (capacidade > 0) {
                const totalLitros = payloads.reduce((soma, p) => soma + (parseFloat(p.qtd_litros) || 0), 0);
                if (totalLitros > capacidade) {
                    alert(
                        `⚠️ Capacidade do Tanque Excedida!\n\n` +
                        `Total informado: ${totalLitros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L\n` +
                        `Capacidade do veículo: ${capacidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L\n\n` +
                        `Corrija a litragem e tente novamente.`
                    );
                    return;
                }
            }
        }

        // Salva um ou dois registros de uma vez
        const { error } = await supabaseClient
            .from('saidas_combustivel')
            .insert(payloads);

        if (error) throw error;

        registrarAuditoria('INCLUIR', 'Abastecimento', `Abastecimento(s) registrado(s) via app mobile: placa ${placa}`);
        alert(`Abastecimento(s) registrado(s) com sucesso!`);
        
        // Limpa campos específicos, mantendo data e bico para agilizar o próximo
        document.getElementById('saidaVeiculo').value = '';
        document.getElementById('saidaMotorista').value = '';
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
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = btnSubmit.dataset.originalContent;
        }
    }
}

async function carregarHistoricoRecente() {
    const lista = document.getElementById('listaHistorico');
    lista.innerHTML = '<p style="text-align:center; color:#666;">Atualizando...</p>';

    try {
        const filiaisUsuario = await getValoresFilialUsuario();
        let queryHistorico = supabaseClient
            .from('saidas_combustivel')
            .select('*, bicos!inner(bombas!inner(tanques!inner(filial)))');

        if (filiaisUsuario.length > 0) {
            queryHistorico = queryHistorico.in('bicos.bombas.tanques.filial', filiaisUsuario);
        }

        const { data, error } = await queryHistorico
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
        // 1. Calcular estoque usando o serviço compartilhado (com paginação completa)
        const filiaisUsuario = await getValoresFilialUsuario();
        const tanquesComEstoque = await calcularEstoqueAtual(supabaseClient, filiaisUsuario);

        tanquesDisponiveis = tanquesComEstoque;
        const tanqueIds = tanquesDisponiveis.map(tanque => tanque.id);

        if (tanqueIds.length === 0) {
            listaEstoque.innerHTML = '<p style="text-align:center; padding:20px;">Nenhum tanque cadastrado para esta filial.</p>';
            if (selectOrigem) selectOrigem.innerHTML = '<option value="">Nenhum tanque disponível</option>';
            if (selectDestino) selectDestino.innerHTML = '<option value="">Nenhum tanque disponível</option>';
            const distContainer = document.getElementById('distribuicao-container');
            if (distContainer) distContainer.innerHTML = '';
            await carregarHistoricoMovimentacao();
            return;
        }

        const estoqueMap = new Map();
        tanquesDisponiveis.forEach(t => estoqueMap.set(t.id, t));

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


            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.nome} (${t.tipo_combustivel})`;

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
    const btnSubmit = e.target.querySelector('button[type="submit"]');

    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.dataset.originalContent = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    }
    
    try {
        const dataInput = document.getElementById('entradaData').value;
        const data = getDataHoraLocalParaBanco(dataInput);
        const nota = document.getElementById('entradaNota').value;
        const litrosTotal = parseFloat(document.getElementById('entradaQtdTotal').value.replace(',', '.')) || 0;
        const vlrLitro = parseFloat(document.getElementById('entradaVlrLitro').value.replace(',', '.')) || 0;
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
            const qtd = parseFloat(linha.querySelector('.tanque-qtd').value.replace(',', '.')) || 0;

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
                valor_total: qtd * vlrLitro,
                usuario: usuario
            });
        }

        if (Math.abs(totalDistribuido - litrosTotal) > 0.01) {
            alert(`A soma distribuída (${totalDistribuido.toFixed(2)} L) não corresponde ao total da nota (${litrosTotal.toFixed(2)} L).`);
            return;
        }

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
        
        // Reseta a data para hoje em Sao Paulo.
        document.getElementById('entradaData').value = getDataHoraSaoPaulo();

        carregarEstoque(); // Atualiza a visualização

    } catch (err) {
        console.error('Erro ao salvar entrada:', err);
        alert('Erro ao registrar entrada: ' + err.message);
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = btnSubmit.dataset.originalContent;
        }
    }
}

async function salvarTransferencia(e) {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');

    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.dataset.originalContent = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transferindo...';
    }

    try {
        const dataInput = document.getElementById('transfData').value;
        const data = getDataHoraLocalParaBanco(dataInput);
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

        const records = [
            { data: data, numero_nota: 'TRANSFERENCIA', tanque_id: origemId, qtd_litros: -qtd, valor_litro: 0, valor_total: 0, usuario: usuario },
            { data: data, numero_nota: 'TRANSFERENCIA', tanque_id: destinoId, qtd_litros: qtd, valor_litro: 0, valor_total: 0, usuario: usuario }
        ];

        const { error } = await supabaseClient.from('abastecimentos').insert(records);
        if (error) throw error;

        alert('Transferência realizada com sucesso!');
        document.getElementById('formMobileTransferencia').reset();
        
        // Reseta a data para hoje em Sao Paulo.
        document.getElementById('transfData').value = getDataHoraSaoPaulo();

        carregarEstoque();

    } catch (err) {
        console.error('Erro ao transferir:', err);
        alert('Erro ao realizar transferência: ' + err.message);
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = btnSubmit.dataset.originalContent;
        }
    }
}

async function realizarAjusteEstoque(id, nome, estoqueCalculado, btn) {
    if (btn) {
        btn.disabled = true;
        btn.dataset.originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    const novoValorStr = prompt(`Informe a quantidade real (física) para o tanque ${nome}:`, estoqueCalculado);
    if (novoValorStr === null) {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalContent;
        }
        return;
    }

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
    const dataAjuste = getDataHoraLocalParaBanco();

    try {
        const { error } = await supabaseClient.from('abastecimentos').insert([{
            data: dataAjuste,
            numero_nota: 'AJUSTE DE ESTOQUE',
            tanque_id: parseInt(id),
            qtd_litros: diferenca, // Pode ser positivo (entrada) ou negativo (saída)
            valor_litro: novoValor,
            valor_total: novoValor,
            usuario: usuario
        }]);

        if (error) throw error;

        alert('Estoque ajustado com sucesso!');
        carregarEstoque(); // Recarrega a lista para mostrar o novo valor

    } catch (err) {
        console.error('Erro ao ajustar estoque:', err);
        alert('Erro ao salvar ajuste: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalContent;
        }
    }
}

async function carregarHistoricoMovimentacao() {
    const lista = document.getElementById('listaHistoricoEstoque');
    if (!lista) return;
    
    lista.innerHTML = '<p style="text-align:center; color:#666;">Atualizando...</p>';

    try {
        const filiaisUsuario = await getValoresFilialUsuario();

        // 1. Buscar Entradas e Ajustes (Tabela abastecimentos)
        let queryEntradas = supabaseClient
            .from('abastecimentos')
            .select('id, data, numero_nota, qtd_litros, valor_litro, valor_total, usuario, tanques!inner(nome, filial)');

        if (filiaisUsuario.length > 0) {
            queryEntradas = queryEntradas.in('tanques.filial', filiaisUsuario);
        }

        const { data: entradas, error: errEntradas } = await queryEntradas
            .order('data', { ascending: false })
            .limit(20);
        
        if (errEntradas) throw errEntradas;

        // 2. Buscar Saídas (Tabela saidas_combustivel)
        let querySaidas = supabaseClient
            .from('saidas_combustivel')
            .select('id, data_hora, veiculo_placa, qtd_litros, usuario, bicos!inner(bombas!inner(tanques!inner(nome, filial)))');

        if (filiaisUsuario.length > 0) {
            querySaidas = querySaidas.in('bicos.bombas.tanques.filial', filiaisUsuario);
        }

        const { data: saidas, error: errSaidas } = await querySaidas
            .order('data_hora', { ascending: false })
            .limit(20);

        if (errSaidas) throw errSaidas;

        // 3. Combinar e Ordenar
        const historico = [];

        entradas.forEach(e => {
            const isAjuste = e.numero_nota === 'AJUSTE DE ESTOQUE';
            historico.push({
                tipo: isAjuste ? 'AJUSTE' : 'ENTRADA',
                data: e.data,
                detalhe: isAjuste ? 'Ajuste Manual' : (e.numero_nota === 'TRANSFERENCIA' ? 'Transferencia' : 'NF: ' + e.numero_nota),
                tanque: e.tanques?.nome || 'N/A',
                qtd: e.qtd_litros,
                estoqueInformado: isAjuste ? getEstoqueInformadoAjusteMobile(e) : null,
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
            
            const qtd = parseFloat(item.qtd) || 0;
            const isAjuste = item.tipo === 'AJUSTE';
            const sinal = item.tipo === 'SAIDA' || qtd < 0 ? '-' : '+';
            const corQtd = isAjuste ? '#0d6efd' : (item.tipo === 'SAIDA' || qtd < 0 ? '#dc3545' : '#28a745');
            const valorPrincipal = isAjuste && item.estoqueInformado !== null
                ? `${formatarLitrosDisplay(item.estoqueInformado)} L`
                : `${sinal}${formatarLitrosDisplay(Math.abs(qtd))} L`;
            const detalheAjuste = isAjuste
                ? `<small>Correcao: ${qtd > 0 ? '+' : ''}${formatarLitrosDisplay(qtd)} L</small>`
                : '';

            div.innerHTML = `
                <div class="historico-info">
                    <h4>${item.tanque}</h4>
                    <p><i class="far fa-clock"></i> ${dataFormatada} ${horaFormatada !== '00:00' ? horaFormatada : ''}</p>
                    <p><i class="fas fa-info-circle"></i> ${item.detalhe}</p>
                    <p><i class="far fa-user"></i> ${item.usuario || 'N/I'}</p>
                </div>
                <div class="historico-litros" style="color: ${corQtd}">
                    ${valorPrincipal}
                    ${detalheAjuste}
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

async function buscarUltimoKm(placaInput) {
    const inputUltimoKm = document.getElementById('saidaUltimoKm');
    if (!inputUltimoKm) return;

    const placa = placaInput ? placaInput.trim().toUpperCase() : '';
    if (!placa) {
        inputUltimoKm.value = '';
        return;
    }

    inputUltimoKm.value = '...';

    try {
        const [resInt, resExt] = await Promise.all([
            supabaseClient
                .from('saidas_combustivel')
                .select('km_atual')
                .eq('veiculo_placa', placa)
                .order('km_atual', { ascending: false })
                .limit(1),
            supabaseClient
                .from('abastecimento_externo')
                .select('km_atual')
                .eq('veiculo_placa', placa)
                .order('km_atual', { ascending: false })
                .limit(1)
        ]);

        const kmInt = (resInt.data && resInt.data.length > 0) ? (parseFloat(resInt.data[0].km_atual) || 0) : 0;
        const kmExt = (resExt.data && resExt.data.length > 0) ? (parseFloat(resExt.data[0].km_atual) || 0) : 0;
        const maiorKm = Math.max(kmInt, kmExt);

        inputUltimoKm.value = maiorKm > 0 ? maiorKm : 'Sem registro';
    } catch (e) {
        console.error('Erro ao buscar último KM:', e);
        inputUltimoKm.value = '';
    }
}

async function buscarDadosRetornoRota(placaInput) {
    const rotaInput = document.getElementById('saidaRota');
    const motoristaInput = document.getElementById('saidaMotorista');
    const dataInput = document.getElementById('saidaDataHora');
    
    if (!rotaInput || !motoristaInput) return;
    
    const placa = placaInput ? placaInput.trim().toUpperCase() : '';
    if (!placa) {
        rotaInput.value = '';
        motoristaInput.value = '';
        return;
    }

    // Obtém a data do formulário (formato YYYY-MM-DD)
    const dataBase = dataInput.value ? dataInput.value.split('T')[0] : getDataHoraSaoPaulo().split('T')[0];

    try {
        rotaInput.value = '';
        motoristaInput.value = '';

        // Busca o retorno de rota cadastrado exatamente no dia informado.
        const { data, error } = await supabaseClient
            .from('retorno_rota')
            .select('rota, nome_mot')
            .eq('placa', placa)
            .eq('data_retorno', dataBase)
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data) {
            const inputVeiculo = document.getElementById('saidaVeiculo');
            if (inputVeiculo && inputVeiculo.value.trim().toUpperCase() !== placa) return;
            rotaInput.value = data.rota || '';
            motoristaInput.value = data.nome_mot || '';
        }
    } catch (e) {
        console.error('Erro ao buscar rota/motorista do retorno:', e);
    }
}
