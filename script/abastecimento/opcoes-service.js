export async function buscarTanques(supabaseClient, filial) {
    let query = supabaseClient
        .from('tanques')
        .select('id, nome, tipo_combustivel');

    if (filial) query = query.eq('filial', filial);

    const { data, error } = await query.order('nome');
    if (error) throw error;
    return data || [];
}

export async function buscarFiliais(supabaseClient) {
    const { data, error } = await supabaseClient
        .from('filiais')
        .select('nome, sigla')
        .order('nome');

    if (error) throw error;
    return data || [];
}

export async function buscarBicos(supabaseClient, filial) {
    let query = supabaseClient
        .from('bicos')
        .select('id, nome, bombas!inner(nome, tanques!inner(nome, filial))');

    if (filial) query = query.eq('bombas.tanques.filial', filial);

    const { data, error } = await query.order('nome');
    if (error) throw error;

    return (data || []).sort((a, b) => (
        a.nome.localeCompare(b.nome, undefined, { numeric: true, sensitivity: 'base' })
    ));
}

export async function buscarVeiculos(supabaseClient) {
    const { data, error } = await supabaseClient
        .from('veiculos')
        .select('placa, modelo, tipo')
        .order('placa');

    if (error) throw error;
    return data || [];
}

export async function buscarMotoristasAtivos(supabaseClient) {
    const { data, error } = await supabaseClient
        .from('funcionario')
        .select('nome')
        .ilike('funcao', '%Motorista%')
        .eq('status', 'Ativo');

    if (error) throw error;
    return data || [];
}

export async function buscarRotas(supabaseClient) {
    const { data, error } = await supabaseClient
        .from('rotas')
        .select('numero');

    if (error) throw error;

    return (data || []).sort((a, b) => (
        String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true, sensitivity: 'base' })
    ));
}

export async function buscarPostosParaDatalist(supabaseClient, filiais) {
    const postos = [];
    let from = 0;
    const step = 1000;
    const filiaisValidas = (filiais || []).filter(Boolean);

    while (true) {
        let query = supabaseClient
            .from('postos')
            .select('id, razao_social, cnpj, valor_negociado')
            .order('razao_social');

        if (filiaisValidas.length > 0) {
            query = query.in('filial', filiaisValidas);
        }

        const { data, error } = await query.range(from, from + step - 1);
        if (error) throw error;

        if (data && data.length > 0) {
            postos.push(...data);
            if (data.length < step) break;
            from += step;
        } else {
            break;
        }
    }

    return postos;
}
