const PAGE_SIZE = 1000;

function parseNumero(value) {
    const numero = parseFloat(value);
    return Number.isFinite(numero) ? numero : 0;
}

function getEstoqueInformadoAjuste(entrada) {
    const valorLitroInformado = parseNumero(entrada.valor_litro);
    if (valorLitroInformado > 0) return valorLitroInformado;

    const valorInformado = parseNumero(entrada.valor_total);
    if (valorInformado > 0) return valorInformado;

    const diferencaLegada = parseNumero(entrada.qtd_litros);
    return diferencaLegada !== 0 ? Math.abs(diferencaLegada) : null;
}

async function fetchAll(buildQuery) {
    const rows = [];
    let from = 0;

    while (true) {
        const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
        if (error) throw error;

        if (!data || data.length === 0) break;

        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return rows;
}

function criarMapaEstoque(tanques) {
    const estoqueMap = new Map();

    (tanques || []).forEach(tanque => {
        estoqueMap.set(Number(tanque.id), {
            ...tanque,
            capacidade: parseNumero(tanque.capacidade),
            entradas_total: 0,
            saidas_total: 0,
            ultimo_ajuste_data: null,
            estoque_ultimo_ajuste: null,
            estoque_atual: 0
        });
    });

    return estoqueMap;
}

function calcularEstoquePorMovimentos(tanques, entradas, saidas) {
    const estoqueMap = criarMapaEstoque(tanques);
    const movimentosPorTanque = new Map();

    estoqueMap.forEach((_, tanqueId) => movimentosPorTanque.set(tanqueId, []));

    (entradas || []).forEach(entrada => {
        const tanqueId = Number(entrada.tanque_id);
        if (!movimentosPorTanque.has(tanqueId)) return;

        movimentosPorTanque.get(tanqueId).push({
            data: entrada.data,
            tipo: entrada.numero_nota === 'AJUSTE DE ESTOQUE' ? 'AJUSTE' : 'ENTRADA',
            litros: parseNumero(entrada.qtd_litros),
            estoqueInformado: entrada.numero_nota === 'AJUSTE DE ESTOQUE'
                ? getEstoqueInformadoAjuste(entrada)
                : null
        });
    });

    (saidas || []).forEach(saida => {
        const tanqueId = Number(saida.bicos?.bombas?.tanque_id);
        if (!movimentosPorTanque.has(tanqueId)) return;

        movimentosPorTanque.get(tanqueId).push({
            data: saida.data_hora,
            tipo: 'SAIDA',
            litros: parseNumero(saida.qtd_litros)
        });
    });

    movimentosPorTanque.forEach((movimentos, tanqueId) => {
        const tanque = estoqueMap.get(tanqueId);
        if (!tanque) return;

        movimentos
            .filter(movimento => movimento.data)
            .sort((a, b) => new Date(a.data) - new Date(b.data))
            .forEach(movimento => {
                if (movimento.tipo === 'SAIDA') {
                    tanque.saidas_total += movimento.litros;
                    tanque.estoque_atual -= movimento.litros;
                    return;
                }

                if (movimento.tipo === 'AJUSTE') {
                    tanque.entradas_total += movimento.litros;
                    tanque.estoque_atual = movimento.estoqueInformado !== null
                        ? movimento.estoqueInformado
                        : tanque.estoque_atual + movimento.litros;
                    tanque.ultimo_ajuste_data = movimento.data;
                    tanque.estoque_ultimo_ajuste = tanque.estoque_atual;
                    return;
                }

                tanque.entradas_total += movimento.litros;
                tanque.estoque_atual += movimento.litros;
            });
    });

    return Array.from(estoqueMap.values());
}

export async function calcularEstoqueAtual(supabaseClient, filial) {
    const filiais = Array.isArray(filial) ? filial.filter(Boolean) : (filial ? [filial] : []);
    const tanques = await fetchAll(() => {
        let query = supabaseClient
            .from('tanques')
            .select('id, nome, capacidade, tipo_combustivel')
            .order('nome');

        if (filiais.length > 0) query = query.in('filial', filiais);
        return query;
    });

    const tanqueIds = (tanques || []).map(tanque => tanque.id).filter(id => id !== null && id !== undefined);
    if (filiais.length > 0 && tanqueIds.length === 0) {
        return calcularEstoquePorMovimentos(tanques, [], []);
    }

    const [entradas, saidas] = await Promise.all([
        fetchAll(() => {
            let query = supabaseClient
                .from('abastecimentos')
                .select('tanque_id, qtd_litros, data, numero_nota, valor_litro, valor_total')
                .order('data', { ascending: true });

            if (filiais.length > 0) query = query.in('tanque_id', tanqueIds);
            return query;
        }),
        fetchAll(() => {
            let query = supabaseClient
                .from('saidas_combustivel')
                .select(filiais.length > 0
                    ? 'qtd_litros, data_hora, bicos!inner(bombas!inner(tanque_id, tanques!inner(id, filial)))'
                    : 'qtd_litros, data_hora, bicos(bombas(tanque_id))')
                .order('data_hora', { ascending: true });

            if (filiais.length > 0) query = query.in('bicos.bombas.tanques.filial', filiais);
            return query;
        })
    ]);

    return calcularEstoquePorMovimentos(tanques, entradas, saidas);
}

export async function calcularEstoqueAntes(supabaseClient, tanqueId, dataHora) {
    const tanque = { id: Number(tanqueId), capacidade: 0 };

    const [entradas, saidas] = await Promise.all([
        fetchAll(() => supabaseClient
            .from('abastecimentos')
            .select('tanque_id, qtd_litros, data, numero_nota, valor_litro, valor_total')
            .eq('tanque_id', tanqueId)
            .lt('data', dataHora)
            .order('data', { ascending: true })),
        fetchAll(() => supabaseClient
            .from('saidas_combustivel')
            .select('qtd_litros, data_hora, bicos(bombas(tanque_id))')
            .lt('data_hora', dataHora)
            .order('data_hora', { ascending: true }))
    ]);

    const estoque = calcularEstoquePorMovimentos([tanque], entradas, saidas);
    return estoque[0]?.estoque_atual || 0;
}
