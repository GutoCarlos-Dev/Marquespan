import { supabaseClient } from '../supabase.js';

function normalizarFilial(value) {
    return String(value || '').trim().toUpperCase();
}

async function buscarPerfilAtual(usuarioFallback) {
    const {
        data: { user },
        error: authError
    } = await supabaseClient.auth.getUser();

    if (authError || !user?.id) {
        if (usuarioFallback) return usuarioFallback;
        throw authError || new Error('Usuario autenticado nao encontrado.');
    }

    const { data: perfil, error: perfilError } = await supabaseClient
        .from('usuarios')
        .select('nome, nivel, filial')
        .eq('auth_user_id', user.id)
        .single();

    if (perfilError) throw perfilError;
    return perfil;
}

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
    const perfilAtual = await buscarPerfilAtual(usuarioLogado);
    const nivel = String(perfilAtual?.nivel || '').toLowerCase();
    const filialUsuario = normalizarFilial(perfilAtual?.filial);
    const oficinaSelect = incluirOficinas ? ', oficinas(nome)' : '';

    const selectQuery = `*, coletas_manutencao!inner(*)${oficinaSelect}`;

    let query = supabaseClient
        .from('coletas_manutencao_checklist')
        .select(selectQuery);

    if (filialUsuario) {
        query = query.ilike('coletas_manutencao.filial', filialUsuario);
    }

    if (nivel === 'moleiro') query = query.eq('item', 'MOLEIRO');
    if (nivel === 'mecanica_externa') query = query.in('item', ['MECANICA EXTERNA', 'MECANICA - EXTERNA']);

    query = aplicarFiltros(query, filtros, { oficinasMap, filtroOficinaPorDetalhes });

    const { data, error } = await query;
    if (error) throw error;

    const resultados = data || [];
    if (!filialUsuario) return resultados;

    return resultados.filter(item =>
        normalizarFilial(item.coletas_manutencao?.filial) === filialUsuario
    );
}
