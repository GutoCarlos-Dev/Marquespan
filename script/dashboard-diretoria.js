import { supabaseClient } from './supabase.js';

const TIPOS_FROTA_EXCLUIDOS = '("SEMI-REBOQUE","EMPILHADEIRA","GERADOR")';
const TIPOS_PEDAGIO_MENSALIDADE = ['TRUCK', 'CAMINHÃO 3/4', 'CAMINHÂO 3/4', 'BITRUCK', 'BITREM', 'HR/VAN', 'LS', 'MUNCK'];

document.addEventListener('DOMContentLoaded', async () => {
    const perfilCarregado = await carregarFiliais();
    if (!perfilCarregado) return;
    initDashboard();
});

function initDashboard() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    document.getElementById('dataInicial').valueAsDate = primeiroDia;
    document.getElementById('dataFinal').valueAsDate = hoje;

    document.getElementById('btn-aplicar-filtro').addEventListener('click', carregarDados);
    document.getElementById('btn-toggle-sidebar').addEventListener('click', () => window.toggleSidebar && window.toggleSidebar());

    carregarDados();
}

async function carregarFiliais() {
    const select = document.getElementById('filtroFilial');
    if (!select) return;

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();
        if (authError || !user?.id) throw authError || new Error('Usuario autenticado nao encontrado.');

        const { data: perfil, error: perfilError } = await supabaseClient
            .from('usuarios')
            .select('filial')
            .eq('auth_user_id', user.id)
            .single();
        if (perfilError) throw perfilError;

        const filialUsuario = String(perfil?.filial || '').trim().toUpperCase();
        const { data, error } = await supabaseClient
            .from('filiais')
            .select('nome, sigla')
            .order('nome');

        if (error) throw error;
        select.innerHTML = filialUsuario ? '' : '<option value="">Todas</option>';
        select.disabled = !!filialUsuario;

        if (data) {
            data
                .filter(f => !filialUsuario || String(f.sigla || f.nome || '').trim().toUpperCase() === filialUsuario)
                .forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = String(f.sigla || f.nome || '').trim().toUpperCase();
                    opt.textContent = f.sigla ? `${f.nome} (${f.sigla})` : f.nome;
                    select.appendChild(opt);
                });
        }

        if (filialUsuario) {
            if (!select.options.length) select.add(new Option(filialUsuario, filialUsuario));
            select.value = filialUsuario;
            select.disabled = true;
        }
        return true;
    } catch (err) {
        console.error('Erro ao carregar filiais', err);
        select.innerHTML = '<option value="">Acesso indisponivel</option>';
        select.disabled = true;
        return false;
    }
}

async function carregarDados() {
    const filial = document.getElementById('filtroFilial').value;
    const dataInicial = document.getElementById('dataInicial').value;
    const dataFinal = document.getElementById('dataFinal').value;

    document.getElementById('last-update').textContent = `Atualizado às: ${new Date().toLocaleTimeString('pt-BR')}`;

    await Promise.all([
        carregarFrotaPesada(filial),
        carregarTotalRotas(filial),
        carregarTotalColaboradores(filial),
        carregarManutencoes(filial, dataInicial, dataFinal),
        carregarAbastecimento(filial, dataInicial, dataFinal),
        carregarHospedagens(filial, dataInicial, dataFinal),
        carregarPedagio(filial, dataInicial, dataFinal),
        carregarOperacionalLogistica(filial, dataInicial, dataFinal)
    ]);
}

// Busca em lotes de 1000 (limite padrão do Supabase/PostgREST por requisição) — sem
// isso, tabelas grandes silenciosamente trazem só os 1000 registros mais recentes.
// montarQuery deve retornar uma query nova a cada chamada (sem .range()).
async function buscarTodosEmLotes(montarQuery) {
    const TAMANHO_LOTE = 1000;
    let offset = 0;
    const todos = [];

    while (true) {
        const { data, error } = await montarQuery().range(offset, offset + TAMANHO_LOTE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        todos.push(...data);
        if (data.length < TAMANHO_LOTE) break;
        offset += TAMANHO_LOTE;
    }
    return todos;
}

async function fetchItensEmLotes(ids) {
    const chunkSize = 200;
    let allItems = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await supabaseClient
            .from('manutencao_itens')
            .select('id_manutencao, quantidade, valor')
            .in('id_manutencao', chunk);
        if (error) throw error;
        if (data) allItems = allItems.concat(data);
    }
    return allItems;
}

function criarLookupPreco(priceHistory) {
    const lookup = {};
    priceHistory.forEach(p => {
        if (!lookup[p.tanque_id]) lookup[p.tanque_id] = [];
        lookup[p.tanque_id].push(p);
    });

    return (tanqueId, consumptionDate) => {
        const history = lookup[tanqueId];
        if (!history) return 0;
        const targetDate = new Date(consumptionDate);
        const record = history.find(p => new Date(p.data) <= targetDate);
        return record ? record.valor_litro : 0;
    };
}

function formatarMoeda(valor) {
    return 'R$ ' + (Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function carregarFrotaPesada(filial) {
    try {
        let query = supabaseClient.from('veiculos')
            .select('*', { count: 'exact', head: true })
            .eq('situacao', 'ativo')
            .not('tipo', 'in', TIPOS_FROTA_EXCLUIDOS)
            .neq('filial', 'RS');
        if (filial) query = query.eq('filial', filial);

        const { count, error } = await query;
        if (error) throw error;
        document.getElementById('kpi-frota-pesada').textContent = count ?? 0;
    } catch (err) {
        console.error('Erro ao carregar frota pesada:', err);
        document.getElementById('kpi-frota-pesada').textContent = '-';
    }
}

async function carregarTotalRotas(filial) {
    try {
        let query = supabaseClient.from('rotas')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'ATIVA');
        if (filial) query = query.eq('filial', filial);

        const { count, error } = await query;
        if (error) throw error;
        document.getElementById('kpi-total-rotas').textContent = count ?? 0;
    } catch (err) {
        console.error('Erro ao carregar total de rotas:', err);
        document.getElementById('kpi-total-rotas').textContent = '-';
    }
}

async function carregarTotalColaboradores(filial) {
    try {
        let query = supabaseClient.from('funcionario')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Ativo');
        if (filial) query = query.eq('filial', filial);

        const { count, error } = await query;
        if (error) throw error;
        document.getElementById('kpi-total-colaboradores').textContent = count ?? 0;
    } catch (err) {
        console.error('Erro ao carregar total de colaboradores:', err);
        document.getElementById('kpi-total-colaboradores').textContent = '-';
    }
}

async function carregarManutencoes(filial, dataInicial, dataFinal) {
    try {
        const registros = await buscarTodosEmLotes(() => {
            let q = supabaseClient.from('manutencao')
                .select('id, valorNfe, valorNfse')
                .order('id', { ascending: true });
            if (filial) q = q.eq('filial', filial);
            if (dataInicial) q = q.gte('data', `${dataInicial}T00:00:00-03:00`);
            if (dataFinal) q = q.lte('data', `${dataFinal}T23:59:59-03:00`);
            return q;
        });

        const idsSemValorCabecalho = registros
            .filter(m => (m.valorNfe || 0) + (m.valorNfse || 0) <= 0)
            .map(m => m.id);

        const itens = idsSemValorCabecalho.length ? await fetchItensEmLotes(idsSemValorCabecalho) : [];

        const valorItensPorManutencao = {};
        itens.forEach(item => {
            const totalItem = (item.quantidade || 0) * (item.valor || 0);
            valorItensPorManutencao[item.id_manutencao] = (valorItensPorManutencao[item.id_manutencao] || 0) + totalItem;
        });

        const valorTotal = registros.reduce((acc, m) => {
            const totalCabecalho = (m.valorNfe || 0) + (m.valorNfse || 0);
            const valorFinal = totalCabecalho > 0 ? totalCabecalho : (valorItensPorManutencao[m.id] || 0);
            return acc + valorFinal;
        }, 0);

        document.getElementById('kpi-manutencao-qtd').textContent = registros.length;
        document.getElementById('kpi-manutencao-valor').textContent = formatarMoeda(valorTotal);
    } catch (err) {
        console.error('Erro ao carregar manutenções:', err);
        document.getElementById('kpi-manutencao-qtd').textContent = '-';
        document.getElementById('kpi-manutencao-valor').textContent = 'R$ -';
    }
}

async function carregarAbastecimento(filial, dataInicial, dataFinal) {
    try {
        const gteHora = dataInicial ? `${dataInicial}T00:00:00-03:00` : null;
        const lteHora = dataFinal ? `${dataFinal}T23:59:59-03:00` : null;

        // 1. Histórico de preços de compra (entradas) até a data final, para valorizar o consumo interno.
        const priceHistory = await buscarTodosEmLotes(() => {
            let q = supabaseClient.from('abastecimentos')
                .select('tanque_id, valor_litro, data')
                .neq('numero_nota', 'AJUSTE DE ESTOQUE')
                .gt('valor_litro', 0)
                .order('data', { ascending: false });
            if (lteHora) q = q.lte('data', lteHora);
            return q;
        });
        const findLastPrice = criarLookupPreco(priceHistory);

        // 2. Consumo interno (saídas de tanque próprio).
        const saidas = await buscarTodosEmLotes(() => {
            let q = supabaseClient.from('saidas_combustivel')
                .select('qtd_litros, data_hora, bicos!inner(bombas!inner(tanque_id, tanques!inner(filial)))')
                .order('data_hora', { ascending: false });
            if (gteHora) q = q.gte('data_hora', gteHora);
            if (lteHora) q = q.lte('data_hora', lteHora);
            if (filial) q = q.eq('bicos.bombas.tanques.filial', filial);
            return q;
        });

        const valorInterno = saidas.reduce((acc, s) => {
            const tanqueId = s.bicos?.bombas?.tanque_id;
            const preco = findLastPrice(tanqueId, s.data_hora);
            return acc + (Number(s.qtd_litros || 0) * preco);
        }, 0);

        // 3. Abastecimento externo (postos parceiros) — já vem com valor_total gravado.
        const externos = await buscarTodosEmLotes(() => {
            let q = supabaseClient.from('abastecimento_externo')
                .select('valor_total, data_hora, filial')
                .order('data_hora', { ascending: false });
            if (gteHora) q = q.gte('data_hora', gteHora);
            if (lteHora) q = q.lte('data_hora', lteHora);
            if (filial) q = q.eq('filial', filial);
            return q;
        });

        const valorExterno = externos.reduce((acc, e) => acc + (Number(e.valor_total) || 0), 0);

        document.getElementById('kpi-abastecimento-qtd').textContent = saidas.length + externos.length;
        document.getElementById('kpi-abastecimento-valor').textContent = formatarMoeda(valorInterno + valorExterno);
    } catch (err) {
        console.error('Erro ao carregar abastecimento:', err);
        document.getElementById('kpi-abastecimento-qtd').textContent = '-';
        document.getElementById('kpi-abastecimento-valor').textContent = 'R$ -';
    }
}

async function carregarHospedagens(filial, dataInicial, dataFinal) {
    try {
        const registros = await buscarTodosEmLotes(() => {
            let q = supabaseClient.from('despesas')
                .select('valor_total, data_checkin, filial')
                .order('data_checkin', { ascending: false });
            if (dataInicial) q = q.gte('data_checkin', dataInicial);
            if (dataFinal) q = q.lte('data_checkin', dataFinal);
            if (filial) q = q.eq('filial', filial);
            return q;
        });

        const valorTotal = registros.reduce((acc, d) => acc + (Number(d.valor_total) || 0), 0);

        document.getElementById('kpi-hospedagem-qtd').textContent = registros.length;
        document.getElementById('kpi-hospedagem-valor').textContent = formatarMoeda(valorTotal);
    } catch (err) {
        console.error('Erro ao carregar hospedagens:', err);
        document.getElementById('kpi-hospedagem-qtd').textContent = '-';
        document.getElementById('kpi-hospedagem-valor').textContent = 'R$ -';
    }
}

async function carregarPedagio(filial, dataInicial, dataFinal) {
    try {
        const gteHora = dataInicial ? `${dataInicial}T00:00:00-03:00` : null;
        const lteHora = dataFinal ? `${dataFinal}T23:59:59-03:00` : null;

        // Meses cobertos pelo período, para ratear a mensalidade da frota de pedágio.
        let diffMeses = 1;
        if (dataInicial && dataFinal) {
            const dIni = new Date(`${dataInicial}T00:00:00`);
            const dFim = new Date(`${dataFinal}T23:59:59`);
            diffMeses = (dFim.getFullYear() - dIni.getFullYear()) * 12 + (dFim.getMonth() - dIni.getMonth()) + 1;
            if (!Number.isFinite(diffMeses) || diffMeses < 1) diffMeses = 1;
        }

        const passagens = await buscarTodosEmLotes(() => {
            let q = supabaseClient.from('pedagios_lancamentos')
                .select('valor, data_hora_passagem, veiculos!inner(filial)')
                .order('data_hora_passagem', { ascending: false });
            if (gteHora) q = q.gte('data_hora_passagem', gteHora);
            if (lteHora) q = q.lte('data_hora_passagem', lteHora);
            if (filial) q = q.eq('veiculos.filial', filial);
            return q;
        });

        const valorPassagens = passagens.reduce((acc, p) => acc + (parseFloat(p.valor) || 0), 0);

        let fleetQuery = supabaseClient.from('veiculos')
            .select('*', { count: 'exact', head: true })
            .in('situacao', ['ativo', 'INTERNADO'])
            .in('tipo', TIPOS_PEDAGIO_MENSALIDADE);
        if (filial) fleetQuery = fleetQuery.eq('filial', filial);

        const [resFrota, resEmpresa] = await Promise.all([
            fleetQuery,
            supabaseClient.from('pedagios_empresas').select('mensalidade').limit(1).single()
        ]);

        const qtdFrota = resFrota.count || 0;
        const valorMensalidadeUnitario = Number(resEmpresa.data?.mensalidade) || 0;
        const valorMensalidades = qtdFrota * valorMensalidadeUnitario * diffMeses;

        document.getElementById('kpi-pedagio-qtd').textContent = passagens.length;
        document.getElementById('kpi-pedagio-valor').textContent = formatarMoeda(valorPassagens + valorMensalidades);
    } catch (err) {
        console.error('Erro ao carregar pedágio:', err);
        document.getElementById('kpi-pedagio-qtd').textContent = '-';
        document.getElementById('kpi-pedagio-valor').textContent = 'R$ -';
    }
}

async function carregarOperacionalLogistica(filial, dataInicial, dataFinal) {
    try {
        // peso_rota nao tem coluna de data de saida — dia_retorno e a unica data
        // calendario gravada (indexada), por isso e usada como referencia de periodo.
        const registros = await buscarTodosEmLotes(() => {
            let q = supabaseClient.from('peso_rota')
                .select('peso_carga, qtd_caixas, dia_retorno, filial')
                .order('dia_retorno', { ascending: false });
            if (dataInicial) q = q.gte('dia_retorno', dataInicial);
            if (dataFinal) q = q.lte('dia_retorno', dataFinal);
            if (filial) q = q.eq('filial', filial);
            return q;
        });

        const totalCaixas = registros.reduce((acc, r) => acc + (Number(r.qtd_caixas) || 0), 0);
        const totalToneladas = registros.reduce((acc, r) => acc + (Number(r.peso_carga) || 0), 0) / 1000;

        document.getElementById('kpi-entregas-qtd').textContent = registros.length.toLocaleString('pt-BR');
        document.getElementById('kpi-caixas-qtd').textContent = totalCaixas.toLocaleString('pt-BR');
        document.getElementById('kpi-toneladas').textContent = totalToneladas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' t';
    } catch (err) {
        console.error('Erro ao carregar operacional logística:', err);
        document.getElementById('kpi-entregas-qtd').textContent = '-';
        document.getElementById('kpi-caixas-qtd').textContent = '-';
        document.getElementById('kpi-toneladas').textContent = '-';
    }
}
