export async function calcularEstoqueAtual(supabaseClient, filial) {
    let queryTanques = supabaseClient
        .from('tanques')
        .select('id, nome, capacidade, tipo_combustivel');

    if (filial) queryTanques = queryTanques.eq('filial', filial);

    const [tanquesResult, entradasResult, saidasResult] = await Promise.all([
        queryTanques,
        supabaseClient
            .from('abastecimentos')
            .select('tanque_id, qtd_litros'),
        supabaseClient
            .from('saidas_combustivel')
            .select('qtd_litros, bicos(bombas(tanque_id))')
    ]);

    if (tanquesResult.error) throw tanquesResult.error;
    if (entradasResult.error) throw entradasResult.error;
    if (saidasResult.error) throw saidasResult.error;

    const estoqueMap = new Map();
    (tanquesResult.data || []).forEach(tanque => {
        estoqueMap.set(tanque.id, { ...tanque, estoque_atual: 0 });
    });

    (entradasResult.data || []).forEach(entrada => {
        if (estoqueMap.has(entrada.tanque_id)) {
            estoqueMap.get(entrada.tanque_id).estoque_atual += entrada.qtd_litros;
        }
    });

    (saidasResult.data || []).forEach(saida => {
        const tanqueId = saida.bicos?.bombas?.tanque_id;
        if (tanqueId && estoqueMap.has(tanqueId)) {
            estoqueMap.get(tanqueId).estoque_atual -= saida.qtd_litros;
        }
    });

    return Array.from(estoqueMap.values());
}

export async function calcularEstoqueAntes(supabaseClient, tanqueId, dataHora) {
    const [entradasResult, saidasResult] = await Promise.all([
        supabaseClient
            .from('abastecimentos')
            .select('qtd_litros')
            .eq('tanque_id', tanqueId)
            .lt('data', dataHora),
        supabaseClient
            .from('saidas_combustivel')
            .select('qtd_litros, bicos(bombas(tanque_id))')
            .lt('data_hora', dataHora)
    ]);

    if (entradasResult.error) throw entradasResult.error;
    if (saidasResult.error) throw saidasResult.error;

    const totalEntradas = (entradasResult.data || [])
        .reduce((total, item) => total + (parseFloat(item.qtd_litros) || 0), 0);

    const totalSaidas = (saidasResult.data || [])
        .filter(item => Number(item.bicos?.bombas?.tanque_id) === Number(tanqueId))
        .reduce((total, item) => total + (parseFloat(item.qtd_litros) || 0), 0);

    return totalEntradas - totalSaidas;
}
