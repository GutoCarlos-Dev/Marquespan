export async function buscarAbastecimentosEntrada({
    supabaseClient,
    filial,
    dataInicial,
    dataFinal,
    sortState
}) {
    let query = supabaseClient
        .from('abastecimentos')
        .select('*, tanques!inner(nome, tipo_combustivel, filial)')
        .neq('numero_nota', 'AJUSTE DE ESTOQUE');

    if (filial) query = query.eq('tanques.filial', filial);

    if (dataInicial && dataFinal) {
        query = query.gte('data', `${dataInicial}T00:00:00-03:00`);
        query = query.lte('data', `${dataFinal}T23:59:59-03:00`);
    }

    const { field, ascending } = sortState;
    if (field.includes('.')) {
        const [table, col] = field.split('.');
        query = query.order(col, { foreignTable: table, ascending });
    } else {
        query = query.order(field, { ascending });
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function buscarSaidasCombustivel({
    supabaseClient,
    filial,
    dataInicial,
    dataFinal,
    tanqueId
}) {
    let query = supabaseClient
        .from('saidas_combustivel')
        .select('*, bicos!inner(bombas!inner(tanque_id, tanques!inner(id, nome, filial)))');

    if (filial) query = query.eq('bicos.bombas.tanques.filial', filial);
    if (tanqueId) query = query.eq('bicos.bombas.tanque_id', tanqueId);

    if (dataInicial && dataFinal) {
        query = query.gte('data_hora', `${dataInicial}T00:00:00-03:00`);
        query = query.lte('data_hora', `${dataFinal}T23:59:59-03:00`);
    }

    const { data, error } = await query.order('data_hora', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function buscarAbastecimentosExternos({
    supabaseClient,
    filial,
    dataInicial,
    dataFinal
}) {
    let query = supabaseClient
        .from('abastecimento_externo')
        .select('*, postos(razao_social)');

    if (Array.isArray(filial) && filial.length > 0) {
        query = query.in('filial', filial);
    } else if (filial) {
        query = query.eq('filial', filial);
    }

    if (dataInicial && dataFinal) {
        query = query.gte('data_hora', `${dataInicial}T00:00:00-03:00`);
        query = query.lte('data_hora', `${dataFinal}T23:59:59-03:00`);
    }

    const { data, error } = await query.order('data_hora', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function buscarPostosPaginados({ supabaseClient, filial }) {
    const allPostos = [];
    let from = 0;
    const step = 1000;

    while (true) {
        let query = supabaseClient
            .from('postos')
            .select('*');

        if (Array.isArray(filial) && filial.length > 0) {
            query = query.in('filial', filial);
        } else if (filial) {
            query = query.eq('filial', filial);
        }

        const { data, error } = await query.range(from, from + step - 1);
        if (error) throw error;

        if (data && data.length > 0) {
            allPostos.push(...data);
            if (data.length < step) break;
            from += step;
        } else {
            break;
        }
    }

    return allPostos;
}
