import { supabaseClient } from '../supabase.js';

function aplicarFiltros(query, filtros, { oficinasMap = {}, filtroOficinaPorDetalhes = false } = {}) {
    if (filtros.items.length > 0) {
        query = query.in('item', filtros.items);
    }

    if (filtros.oficinas.length > 0) {
        if (filtroOficinaPorDetalhes) {
            const oficinaFilters = filtros.oficinas.map(of => `detalhes.ilike.%${of}%`).join(',');
            query = query.or(oficinaFilters);
        } else {
            const oficinaIds = filtros.oficinas.map(nome => oficinasMap[nome]).filter(id => id);
            if (oficinaIds.length > 0) {
                query = query.in('oficina_id', oficinaIds);
            }
        }
    }

    if (filtros.status.length > 0) {
        query = query.in('status', filtros.status);
    }

    if (filtros.semana) query = query.eq('coletas_manutencao.semana', filtros.semana);
    if (filtros.placa) query = query.ilike('coletas_manutencao.placa', `%${filtros.placa}%`);
    if (filtros.dataIni) query = query.gte('coletas_manutencao.data_hora', filtros.dataIni + 'T00:00:00');
    if (filtros.dataFim) query = query.lte('coletas_manutencao.data_hora', filtros.dataFim + 'T23:59:59');

    return query;
}

export async function buscarDadosRelatorio({
    usuarioLogado,
    filtros,
    oficinasMap = {},
    incluirOficinas = false,
    filtroOficinaPorDetalhes = false
}) {
    const nivel = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
    const filialUsuario = usuarioLogado ? usuarioLogado.filial : '';
    const oficinaSelect = incluirOficinas ? ', oficinas(nome)' : '';

    let selectQuery = `*, coletas_manutencao!inner(*)${oficinaSelect}`;
    if (filialUsuario) {
        selectQuery = `*, coletas_manutencao!inner(*, veiculos!inner(filial))${oficinaSelect}`;
    }

    let query = supabaseClient
        .from('coletas_manutencao_checklist')
        .select(selectQuery);

    if (filialUsuario) {
        query = query.eq('coletas_manutencao.veiculos.filial', filialUsuario);
    }

    if (nivel === 'moleiro') query = query.eq('item', 'MOLEIRO');
    if (nivel === 'mecanica_externa') query = query.in('item', ['MECANICA EXTERNA', 'MECANICA - EXTERNA']);

    query = aplicarFiltros(query, filtros, { oficinasMap, filtroOficinaPorDetalhes });

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
}
