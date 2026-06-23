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
    if (filtros.filial) query = query.eq('coletas_manutencao.filial', normalizarFilial(filtros.filial));
    if (filtros.dataIni) query = query.gte('coletas_manutencao.data_hora', filtros.dataIni + 'T00:00:00');
    if (filtros.dataFim) query = query.lte('coletas_manutencao.data_hora', filtros.dataFim + 'T23:59:59');

    return query;
}

async function buscarTodosEmBlocos(montarQuery, tamanhoBloco = 1000) {
    const countQuery = montarQuery({ count: 'exact', head: true });
    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    const total = count || 0;
    const data = [];

    if (total === 0) {
        return { data, meta: { total, carregados: 0, blocos: 0, tamanhoBloco } };
    }

    for (let inicio = 0; inicio < total; inicio += tamanhoBloco) {
        const fim = Math.min(inicio + tamanhoBloco - 1, total - 1);
        const { data: lote, error } = await montarQuery().range(inicio, fim);
        if (error) throw error;
        data.push(...(lote || []));
    }

    return {
        data,
        meta: {
            total,
            carregados: data.length,
            blocos: Math.ceil(total / tamanhoBloco),
            tamanhoBloco
        }
    };
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

    const montarQuery = (selectOptions = {}) => {
        let query = supabaseClient
            .from('coletas_manutencao_checklist')
            .select(selectQuery, selectOptions);

        if (filialUsuario) {
            query = query.ilike('coletas_manutencao.filial', filialUsuario);
        }

        if (nivel === 'moleiro') query = query.eq('item', 'MOLEIRO');
        if (nivel === 'mecanica_externa') query = query.in('item', ['MECANICA EXTERNA', 'MECANICA - EXTERNA']);

        return aplicarFiltros(query, filtros, { oficinasMap, filtroOficinaPorDetalhes });
    };

    const resultado = await buscarTodosEmBlocos(montarQuery);
    const resultados = resultado.data || [];
    resultados.meta = resultado.meta;
    if (!filialUsuario) return resultados;

    const filtrados = resultados.filter(item =>
        normalizarFilial(item.coletas_manutencao?.filial) === filialUsuario
    );
    filtrados.meta = {
        ...resultado.meta,
        carregados: filtrados.length
    };
    return filtrados;
}
