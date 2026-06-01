import { buscarDadosRelatorio } from './relatorio-service.js';

const ITEM_COLUMNS = [
    'ACESSORIOS',
    'ALINHAMENTO/BALANCEAMENTO',
    'AR-CONDICIONADO',
    'BORRACHARIA',
    'ELETRICA / MECANICA - INTERNA',
    'MECANICA EXTERNA',
    'MECANICA - EXTERNA',
    'MOLEIRO',
    'TACOGRAFO',
    'TAPEÇARIA',
    'THERMO KING',
    'VIDROS / FECHADURAS',
    'SERVIÇOS_GERAIS',
    'CONCESSIONARIA',
    'ANKA',
    'TARRAXA',
    'USIMAC',
    'LUCAS BAU',
    'IBIFURGO',
    'IBIPORAN'
];

function formatarMoeda(valor) {
    return 'R$ ' + (valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function normalizarTexto(valor) {
    return String(valor || '').trim();
}

function normalizarStatus(status) {
    return normalizarTexto(status).toUpperCase();
}

function obterColunaItem(item) {
    const itemNormalizado = normalizarTexto(item).toUpperCase();
    if (itemNormalizado === 'ELETRICA INTERNA' || itemNormalizado === 'ELETRICA / MECANICA - INTERNA') {
        return 'ELETRICA / MECANICA - INTERNA';
    }
    if (itemNormalizado === 'MECANICA EXTERNA' || itemNormalizado === 'MECANICA - EXTERNA') {
        return 'MECANICA - EXTERNA';
    }
    return itemNormalizado;
}

function montarValorCelula(row) {
    let cellValue = '';

    if (row.item === 'ELETRICA INTERNA' || row.item === 'ELETRICA / MECANICA - INTERNA') {
        cellValue = `SOLICITAÇÃO: ${row.detalhes || ''}`;
        if (row.status === 'FINALIZADO' || row.status === 'OK') {
            cellValue += ', SOLICITAÇÃO REALIZADA';
        }
        if (row.pecas_usadas) {
            cellValue += ` ${row.pecas_usadas}`;
        }
    } else if (row.status === 'FINALIZADO' || row.status === 'OK') {
        cellValue = 'FINALIZADO';
    } else if (row.status === 'INTERNADO') {
        cellValue = 'INTERNADO';
    } else if (row.status === 'CHECK-IN OFICINA') {
        cellValue = 'CHECK-IN OFICINA';
    } else if (row.status === 'CHECK-IN ROTA') {
        cellValue = 'CHECK-IN ROTA';
    } else {
        cellValue = row.detalhes || '';
    }

    if (row.valor && Number(row.valor) > 0) {
        cellValue += ` (${formatarMoeda(Number(row.valor))})`;
    }

    return cellValue;
}

function montarValorCelulaExcel(row) {
    let cellValue = '';
    const colunaItem = obterColunaItem(row.item);
    const status = normalizarStatus(row.status);
    const detalhes = normalizarTexto(row.detalhes);
    const pecasUsadas = normalizarTexto(row.pecas_usadas);

    if (colunaItem === 'ELETRICA / MECANICA - INTERNA') {
        cellValue = `SOLICITA\u00c7\u00c3O: ${detalhes}`;
        if (status === 'FINALIZADO' || status === 'OK') {
            cellValue += ', SOLICITA\u00c7\u00c3O REALIZADA.';
        }
        if (pecasUsadas) {
            cellValue += ` ${pecasUsadas}`;
        }
    } else if (status === 'FINALIZADO' || status === 'OK') {
        cellValue = 'FINALIZADO';
    } else if (status === 'INTERNADO') {
        cellValue = 'INTERNADO';
    } else if (status === 'CHECK-IN OFICINA') {
        cellValue = 'CHECK-IN OFICINA';
    } else if (status === 'CHECK-IN ROTA') {
        cellValue = 'CHECK-IN ROTA';
    } else {
        cellValue = detalhes;
    }

    if (row.valor && Number(row.valor) > 0) {
        cellValue += ` (${formatarMoeda(Number(row.valor))})`;
    }

    return cellValue;
}

function montarDadosPlanilha(data) {
    data.sort((a, b) => new Date(b.coletas_manutencao.data_hora) - new Date(a.coletas_manutencao.data_hora));

    const coletasMap = new Map();
    data.forEach(row => {
        const coletaId = row.coletas_manutencao.id;
        if (!coletasMap.has(coletaId)) {
            coletasMap.set(coletaId, {
                meta: row.coletas_manutencao,
                items: {},
                itemDetails: {},
                totalCalculado: 0
            });
        }

        const entry = coletasMap.get(coletaId);
        entry.totalCalculado += (Number(row.valor) || 0);
        const colunaItem = obterColunaItem(row.item);
        entry.items[colunaItem] = montarValorCelulaExcel(row);
        entry.itemDetails[colunaItem] = row.detalhes || '';
    });

    const dadosPlanilha = [];
    const coletasArray = Array.from(coletasMap.values());
    coletasArray.sort((a, b) => new Date(b.meta.data_hora) - new Date(a.meta.data_hora));

    coletasArray.forEach(entry => {
        const row = {
            DATA: new Date(entry.meta.data_hora).toLocaleDateString('pt-BR'),
            SEMANA: entry.meta.semana,
            PLACA: entry.meta.placa,
            MODELO: entry.meta.modelo,
            KM: entry.meta.km,
            USUARIO: entry.meta.usuario,
            'VALOR TOTAL': formatarMoeda(entry.totalCalculado)
        };

        ITEM_COLUMNS.forEach(col => {
            row[col] = entry.items[col] || '';
        });

        dadosPlanilha.push(row);
    });

    const totalGeral = coletasArray.reduce((sum, entry) => sum + (entry.totalCalculado || 0), 0);
    const linhaSoma = {
        DATA: '',
        SEMANA: '',
        PLACA: '',
        MODELO: '',
        KM: '',
        USUARIO: 'TOTAL GERAL:',
        'VALOR TOTAL': formatarMoeda(totalGeral)
    };

    ITEM_COLUMNS.forEach(col => {
        linhaSoma[col] = '';
    });

    dadosPlanilha.push(linhaSoma);
    return dadosPlanilha;
}

export async function exportarRelatorioExcel({ usuarioLogado, filtros, oficinasMap }) {
    if (typeof XLSX === 'undefined') {
        throw new Error('Biblioteca XLSX nao carregada.');
    }

    const data = await buscarDadosRelatorio({ usuarioLogado, filtros, oficinasMap });

    if (!data || data.length === 0) {
        return false;
    }

    const ws = XLSX.utils.json_to_sheet(montarDadosPlanilha(data));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatorio_Manutencao');
    XLSX.writeFile(wb, `Coleta_Manutencao_${new Date().toISOString().slice(0, 10)}.xlsx`);

    return true;
}
