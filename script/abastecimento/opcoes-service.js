export async function buscarTanques(supabaseClient, filial) {
    const filiais = Array.isArray(filial) ? filial.filter(Boolean) : (filial ? [filial] : []);
    let query = supabaseClient
        .from('tanques')
        .select('id, nome, tipo_combustivel');

    if (filiais.length > 0) query = query.in('filial', filiais);

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
    const filiais = Array.isArray(filial) ? filial.filter(Boolean) : (filial ? [filial] : []);
    let query = supabaseClient
        .from('bicos')
        .select('id, nome, bombas!inner(nome, tanques!inner(nome, filial))');

    if (filiais.length > 0) query = query.in('bombas.tanques.filial', filiais);

    const { data, error } = await query.order('nome');
    if (error) throw error;

    return (data || []).sort((a, b) => (
        a.nome.localeCompare(b.nome, undefined, { numeric: true, sensitivity: 'base' })
    ));
}

export async function buscarVeiculos(supabaseClient, filial) {
    const filiais = Array.isArray(filial) ? filial.filter(Boolean) : (filial ? [filial] : []);
    let query = supabaseClient
        .from('veiculos')
        .select('placa, modelo, tipo, volume_tanque');

    if (filiais.length > 0) query = query.in('filial', filiais);

    const { data, error } = await query.order('placa');

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

// Posto e compartilhado entre filiais: nao filtra por filial, senao um posto cadastrado por uma
// filial fica invisivel para outra que tambem abastece la (ex.: mesmo posto usado por SP e MG).
export async function buscarPostosParaDatalist(supabaseClient) {
    const postos = [];
    let from = 0;
    const step = 1000;

    while (true) {
        const { data, error } = await supabaseClient
            .from('postos')
            .select('id, razao_social, cnpj, valor_negociado')
            .order('razao_social')
            .range(from, from + step - 1);
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
