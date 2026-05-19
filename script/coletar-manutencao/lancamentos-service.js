import { supabaseClient } from '../supabase.js';

function getRoleFilterItem(nivel) {
    if (nivel === 'moleiro') return 'MOLEIRO';
    if (nivel === 'mecanica_externa') return 'MECANICA - EXTERNA';
    return null;
}

function usuarioRestritoPorNome(nomeUsuario, nivel) {
    const nome = String(nomeUsuario || '').toUpperCase();
    return nome === 'ROMO' ||
        nome === 'ROMO DIESEL' ||
        nivel === 'mecanica_externa' ||
        nome === 'MOLEIRO' ||
        nome === 'TREVO DE MOLAS' ||
        nivel === 'moleiro';
}

async function buscarIdsPorChecklist({ searchItem, searchStatus, searchOficina, roleFilterItem, oficinasMap }) {
    let idQuery = supabaseClient
        .from('coletas_manutencao_checklist')
        .select('coleta_id');

    if (searchItem) idQuery = idQuery.eq('item', searchItem);
    if (searchStatus) idQuery = idQuery.eq('status', searchStatus);
    if (searchOficina) {
        const oficinaId = oficinasMap[searchOficina];
        if (oficinaId) idQuery = idQuery.eq('oficina_id', oficinaId);
    }
    if (roleFilterItem) idQuery = idQuery.eq('item', roleFilterItem);

    const { data, error } = await idQuery;
    if (error) throw error;

    return [...new Set(data.map(item => item.coleta_id))];
}

export async function buscarLancamentosManutencao({ filtros, sortConfig, oficinasMap }) {
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    const nivel = usuarioLogado ? usuarioLogado.nivel.toLowerCase() : '';
    const nomeUsuario = usuarioLogado ? usuarioLogado.nome : '';
    const filialUsuario = usuarioLogado ? usuarioLogado.filial : '';
    const isRestricted = ['mecanica_externa', 'moleiro'].includes(nivel);
    const roleFilterItem = getRoleFilterItem(nivel);

    let query = supabaseClient
        .from('coletas_manutencao')
        .select('*, veiculos!inner(filial)')
        .gte('data_hora', `${filtros.dataInicial}T00:00:00`)
        .lte('data_hora', `${filtros.dataFinal}T23:59:59`);

    if (filialUsuario) {
        query = query.eq('veiculos.filial', filialUsuario);
    }

    if (usuarioRestritoPorNome(nomeUsuario, nivel)) {
        query = query.eq('usuario', nomeUsuario);
    }

    if (filtros.searchItem || filtros.searchStatus || roleFilterItem || filtros.searchOficina) {
        const matchingIds = await buscarIdsPorChecklist({
            searchItem: filtros.searchItem,
            searchStatus: filtros.searchStatus,
            searchOficina: filtros.searchOficina,
            roleFilterItem,
            oficinasMap
        });

        if (matchingIds.length === 0) {
            return {
                data: [],
                roleFilterItem,
                podeExcluir: !['mecanica_externa', 'mecanica_interna', 'moleiro'].includes(nivel),
                isRestricted,
                emptyReason: 'filters'
            };
        }

        query = query.in('id', matchingIds);
    }

    if (filtros.searchPlaca) {
        query = query.ilike('placa', `%${filtros.searchPlaca}%`);
    }

    query = query.order(sortConfig.column, { ascending: sortConfig.direction === 'asc' });
    query = query.limit(200);

    const { data: coletas, error: errorColetas } = await query;
    if (errorColetas) throw errorColetas;

    if (!coletas || coletas.length === 0) {
        return {
            data: [],
            roleFilterItem,
            podeExcluir: !['mecanica_externa', 'mecanica_interna', 'moleiro'].includes(nivel),
            isRestricted,
            emptyReason: 'none'
        };
    }

    const coletaIds = coletas.map(c => c.id);
    const { data: checklists, error: errorChecklist } = await supabaseClient
        .from('coletas_manutencao_checklist')
        .select('coleta_id, status, item, valor')
        .in('coleta_id', coletaIds);

    if (errorChecklist) throw errorChecklist;

    const data = coletas.map(coleta => {
        coleta.coletas_manutencao_checklist = checklists.filter(ch => ch.coleta_id === coleta.id);
        coleta.valor_total = coleta.coletas_manutencao_checklist.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
        return coleta;
    });

    return {
        data,
        roleFilterItem,
        podeExcluir: !['mecanica_externa', 'mecanica_interna', 'moleiro'].includes(nivel),
        isRestricted,
        emptyReason: null
    };
}

