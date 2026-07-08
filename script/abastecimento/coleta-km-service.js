export async function salvarColetaKmAbastecimento({
    supabaseClient,
    dataColeta,
    placa,
    kmAtual,
    usuario,
    modelo,
    observacao
}) {
    const km = parseFloat(kmAtual);
    const placaNormalizada = String(placa || '').trim().toUpperCase();

    if (!supabaseClient || !dataColeta || !placaNormalizada || Number.isNaN(km) || km <= 0) {
        return { skipped: true };
    }

    const payload = {
        data_coleta: dataColeta,
        placa: placaNormalizada,
        km_atual: km,
        usuario,
        modelo: modelo || '',
        observacao
    };

    const { data: existentes, error: selectError } = await supabaseClient
        .from('coleta_km')
        .select('id')
        .eq('data_coleta', dataColeta)
        .eq('placa', placaNormalizada)
        .order('id', { ascending: false })
        .limit(1);

    if (selectError) throw selectError;

    const idExistente = existentes?.[0]?.id;
    if (idExistente) {
        const { error: updateError } = await supabaseClient
            .from('coleta_km')
            .update(payload)
            .eq('id', idExistente);

        if (updateError) throw updateError;
        return { updated: true, id: idExistente };
    }

    const { error: insertError } = await supabaseClient
        .from('coleta_km')
        .insert([payload]);

    if (insertError) {
        // Se a constraint unica existir e outro lancamento criou o registro no mesmo instante,
        // atualiza o registro existente sem bloquear o abastecimento.
        if (insertError.code === '23505') {
            const { data: duplicado, error: retrySelectError } = await supabaseClient
                .from('coleta_km')
                .select('id')
                .eq('data_coleta', dataColeta)
                .eq('placa', placaNormalizada)
                .order('id', { ascending: false })
                .limit(1);

            if (retrySelectError) throw retrySelectError;

            const retryId = duplicado?.[0]?.id;
            if (retryId) {
                const { error: retryUpdateError } = await supabaseClient
                    .from('coleta_km')
                    .update(payload)
                    .eq('id', retryId);

                if (retryUpdateError) throw retryUpdateError;
                return { updated: true, id: retryId };
            }
        }

        throw insertError;
    }

    return { inserted: true };
}
