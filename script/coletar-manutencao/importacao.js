import { supabaseClient } from '../supabase.js';
import { converterDataPlanilha, lerXlsxComoJson } from '../shared/importacao-xlsx.js';

const MAP_ITENS_GERAL = {
    ACESSORIOS: 'ACESSORIOS',
    'ALINHAMENTO / BALANCEAMENTO': 'ALINHAMENTO / BALANCEAMENTO',
    'AR-CONDICIONADO': 'AR-CONDICIONADO',
    BORRACHARIA: 'BORRACHARIA',
    'MECANICA EXTERNA': 'MECANICA EXTERNA',
    MOLEIRO: 'MOLEIRO',
    TACOGRAFO: 'TACOGRAFO',
    'TAPEÇARIA': 'TAPEÇARIA',
    'THERMO KING': 'THERMO KING',
    'VIDROS / FECHADURAS': 'VIDROS / FECHADURAS',
    'SERVIÇOS_GERAIS': 'SERVIÇOS_GERAIS',
    CONCESSIONARIA: 'CONCESSIONARIA',
    ANKA: 'ANKA',
    TARRAXA: 'TARRAXA',
    USIMAC: 'USIMAC',
    'LUCAS BAU': 'LUCAS BAU',
    IBIFURGO: 'IBIFURGO',
    IBIPORAN: 'IBIPORAN'
};

function montarColetaBase(row, dataHora, usuario, calcularSemana) {
    return {
        semana: calcularSemana(dataHora),
        data_hora: dataHora.toISOString(),
        usuario,
        placa: String(row.PLACA || 'SEM PLACA').toUpperCase(),
        modelo: row.MODELO || '',
        km: 0,
        filial: null
    };
}

function aplicarFilialContexto(coleta, contexto) {
    return {
        ...coleta,
        filial: coleta.filial || contexto.filial || null
    };
}

async function inserirColetasEmLote(coletas) {
    const { data, error } = await supabaseClient
        .from('coletas_manutencao')
        .insert(coletas)
        .select('id');

    if (error) throw error;
    if (data.length !== coletas.length) {
        throw new Error('Falha ao inserir todos os cabecalhos de manutencao.');
    }

    return data;
}

async function inserirChecklistEmLote(itens) {
    if (itens.length === 0) return;

    const { error } = await supabaseClient
        .from('coletas_manutencao_checklist')
        .insert(itens);

    if (error) throw error;
}

export async function processarArquivoMoleiro(arquivo, contexto) {
    const rows = await lerXlsxComoJson(arquivo);
    const coletasParaInserir = rows.map(row => {
        const dataHora = converterDataPlanilha(row.DATA);
        return {
            ...aplicarFilialContexto(
                montarColetaBase(row, dataHora, contexto.usuario, contexto.calcularSemana),
                contexto
            ),
            _descricaoOriginal: String(row.DESCRICAO || '').toUpperCase()
        };
    });

    const coletasInseridas = await inserirColetasEmLote(
        coletasParaInserir.map(({ _descricaoOriginal, ...rest }) => rest)
    );

    await inserirChecklistEmLote(coletasInseridas.map((coleta, index) => ({
        coleta_id: coleta.id,
        item: 'MOLEIRO',
        status: 'PENDENTE',
        detalhes: coletasParaInserir[index]._descricaoOriginal
    })));
}

export async function processarArquivoMecanicaExterna(arquivo, contexto) {
    const rows = await lerXlsxComoJson(arquivo);
    const coletasParaInserir = rows.map(row => {
        const dataHora = converterDataPlanilha(row.DATA);
        const descricao = String(row.DESCRICAO || '').toUpperCase();
        const observacao = String(row.OBSERVACAO || '').toUpperCase();

        return {
            ...aplicarFilialContexto(
                montarColetaBase(row, dataHora, contexto.usuario, contexto.calcularSemana),
                contexto
            ),
            _detalhesOriginais: observacao ? `${descricao}, ${observacao}` : descricao
        };
    });

    const coletasInseridas = await inserirColetasEmLote(
        coletasParaInserir.map(({ _detalhesOriginais, ...rest }) => rest)
    );

    await inserirChecklistEmLote(coletasInseridas.map((coleta, index) => ({
        coleta_id: coleta.id,
        item: 'MECANICA - EXTERNA',
        status: 'PENDENTE',
        detalhes: coletasParaInserir[index]._detalhesOriginais
    })));
}

export async function processarArquivoGeral(arquivo, contexto) {
    const rows = await lerXlsxComoJson(arquivo);

    for (const row of rows) {
        const dataHora = converterDataPlanilha(row.DATA);
        const semanaRaw = row.SEMANA;
        const semana = semanaRaw && !isNaN(semanaRaw) && !String(semanaRaw).includes('-')
            ? `${String(semanaRaw).padStart(2, '0')}-${dataHora.getFullYear()}`
            : (semanaRaw ? String(semanaRaw) : contexto.calcularSemana(dataHora));

        const { data: coleta, error: errColeta } = await supabaseClient
            .from('coletas_manutencao')
            .insert([{
                semana,
                data_hora: dataHora.toISOString(),
                usuario: contexto.usuario,
                placa: String(row.PLACA || 'SEM PLACA').toUpperCase(),
                modelo: row.MODELO || '',
                km: parseInt(row.KM) || 0,
                filial: contexto.filial || null
            }])
            .select()
            .single();

        if (errColeta) throw errColeta;

        const checklistItems = [];
        const descEletrica = row['ELETRICA INTERNA'];
        const statusEletricaRaw = row.STATUS;
        const pecaEletrica = row.PECA;

        if (descEletrica || statusEletricaRaw !== undefined || pecaEletrica) {
            const statusEletrica = statusEletricaRaw === true ||
                String(statusEletricaRaw).toUpperCase() === 'TRUE' ||
                String(statusEletricaRaw).toUpperCase() === 'OK'
                    ? 'FINALIZADO'
                    : 'PENDENTE';

            checklistItems.push({
                coleta_id: coleta.id,
                item: 'ELETRICA INTERNA',
                status: statusEletrica,
                detalhes: String(descEletrica || '').toUpperCase(),
                pecas_usadas: pecaEletrica ? String(pecaEletrica).toUpperCase() : null
            });
        }

        for (const [colExcel, itemDb] of Object.entries(MAP_ITENS_GERAL)) {
            const valorCelula = row[colExcel];
            if (valorCelula) {
                checklistItems.push({
                    coleta_id: coleta.id,
                    item: itemDb,
                    status: 'PENDENTE',
                    detalhes: String(valorCelula).toUpperCase()
                });
            }
        }

        await inserirChecklistEmLote(checklistItems);
    }
}

export async function processarImportacaoColetaManutencao(tipo, arquivo, contexto) {
    if (tipo === 'MOLEIRO') {
        await processarArquivoMoleiro(arquivo, contexto);
        return;
    }

    if (tipo === 'MECANICA_EXTERNA') {
        await processarArquivoMecanicaExterna(arquivo, contexto);
        return;
    }

    if (tipo === 'GERAL') {
        await processarArquivoGeral(arquivo, contexto);
        return;
    }

    throw new Error(`A importacao para o tipo ${tipo} ainda nao esta implementada.`);
}
