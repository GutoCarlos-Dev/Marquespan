function normalizarChave(value) {
    return String(value || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '');
}

function normalizarLinha(row) {
    const normalizada = {};
    Object.keys(row || {}).forEach(key => {
        normalizada[String(key).toUpperCase().trim()] = row[key];
    });
    return normalizada;
}

function getFlexVal(row, aliases) {
    const keys = Object.keys(row);

    for (const alias of aliases) {
        const normalizedAlias = normalizarChave(alias);
        const foundKey = keys.find(key => normalizarChave(key).includes(normalizedAlias));
        if (foundKey) return row[foundKey];
    }

    return undefined;
}

function normalizarCnpj(value) {
    return String(value || '').replace(/\D/g, '');
}

function parseDecimal(value) {
    return parseFloat(String(value || 0).replace(',', '.')) || 0;
}

function parseDataHora(value) {
    if (!value) return new Date().toISOString();
    if (value instanceof Date) return value.toISOString();

    const raw = String(value).trim();
    const ptBr = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (ptBr) {
        const [, dia, mes, ano, hora = '00', minuto = '00'] = ptBr;
        return new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(minuto)).toISOString();
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function lerXlsx(file, XLSX) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(firstSheet);

                if (json.length === 0) {
                    throw new Error('Arquivo vazio.');
                }

                resolve(json.map(normalizarLinha));
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = error => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

async function carregarMapaPostos(supabaseClient) {
    let postos = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
        const { data: page, error } = await supabaseClient
            .from('postos')
            .select('id, razao_social, cnpj')
            .range(from, from + pageSize - 1);

        if (error) throw error;

        postos = postos.concat(page || []);
        if (!page || page.length < pageSize) break;
        from += pageSize;
    }

    const mapPostos = new Map();
    postos.forEach(posto => {
        const cnpj = normalizarCnpj(posto.cnpj);
        if (cnpj) mapPostos.set(cnpj, posto.id);
    });

    return mapPostos;
}

async function buscarKmAnterior({ supabaseClient, veiculo, dataHora }) {
    const { data, error } = await supabaseClient
        .from('abastecimento_externo')
        .select('km_atual')
        .eq('veiculo_placa', veiculo)
        .lt('data_hora', dataHora)
        .order('data_hora', { ascending: false })
        .limit(1);

    if (error && error.code !== 'PGRST116') {
        console.error(`Erro ao buscar KM anterior para ${veiculo}:`, error);
    }

    return data && data.length > 0 ? data[0].km_atual : 0;
}

export async function importarAbastecimentoExterno({
    file,
    XLSX,
    supabaseClient,
    veiculosDisponiveis,
    usuario
}) {
    const rows = await lerXlsx(file, XLSX);
    const mapPostos = await carregarMapaPostos(supabaseClient);
    const payloads = [];
    const importedRows = [];
    const rejectedRows = [];

    for (const row of rows) {
        const filial = getFlexVal(row, ['FILIAL']) || '';
        const veiculo = getFlexVal(row, ['PLACA', 'VEICULO', 'VEICULO(PLACA)']);
        const cnpjRaw = getFlexVal(row, ['CNPJ', 'POSTO', 'POSTO(CNPJ)']);
        const rota = getFlexVal(row, ['ROTA']) || '';
        const kmAtual = parseDecimal(getFlexVal(row, ['KM ATUAL', 'KM_ATUAL', 'KM']));
        const litros = parseDecimal(getFlexVal(row, ['LITROS', 'LITROS_ABASTECIDOS']));
        const valorTotal = parseDecimal(getFlexVal(row, ['VALOR TOTAL', 'TOTAL']));
        const valorUnitario = parseDecimal(getFlexVal(row, ['VALOR UNITARIO', 'VALOR_UNITARIO', 'UNITARIO']));
        const motoristaRaw = getFlexVal(row, ['MOTORISTA']);
        const motorista = motoristaRaw ? String(motoristaRaw).trim() : null;
        const dataHora = parseDataHora(getFlexVal(row, ['DATA E HORA', 'DATAEHORA', 'DATA']));

        if (!veiculo || !kmAtual || !litros) {
            rejectedRows.push({ ...row, motivo_rejeicao: 'Faltam dados essenciais (Placa, KM ou Litros).' });
            continue;
        }

        const postoId = mapPostos.get(normalizarCnpj(cnpjRaw));
        if (!postoId) {
            rejectedRows.push({ ...row, motivo_rejeicao: `Posto com CNPJ '${cnpjRaw || 'vazio'}' nao encontrado.` });
            continue;
        }

        const kmAnterior = await buscarKmAnterior({ supabaseClient, veiculo, dataHora });
        const veiculoInfo = (veiculosDisponiveis || []).find(item => item.placa === veiculo);

        payloads.push({
            filial,
            data_hora: dataHora,
            posto_id: postoId || null,
            veiculo_placa: veiculo,
            rota,
            tipo_veiculo: veiculoInfo ? veiculoInfo.tipo : null,
            km_atual: kmAtual,
            km_anterior: kmAnterior,
            km_rodado: kmAtual > kmAnterior ? kmAtual - kmAnterior : 0,
            litros,
            valor_total: valorTotal,
            valor_unitario: valorUnitario,
            motorista,
            usuario
        });

        importedRows.push({ placa: veiculo, data: dataHora, litros });
    }

    if (payloads.length > 0) {
        const { error } = await supabaseClient.from('abastecimento_externo').insert(payloads);
        if (error) throw error;
    }

    return { importedRows, rejectedRows };
}

export function baixarRelatorioImportacaoExterna(importedRows, rejectedRows) {
    let txtContent = 'RESUMO DE IMPORTACAO - ABASTECIMENTO EXTERNO\n';
    txtContent += '============================================================\n';
    txtContent += `Data do Processamento: ${new Date().toLocaleString('pt-BR')}\n`;
    txtContent += `Total de Registros no Arquivo: ${importedRows.length + rejectedRows.length}\n`;
    txtContent += `Importados com Sucesso: ${importedRows.length}\n`;
    txtContent += `Registros Rejeitados: ${rejectedRows.length}\n`;
    txtContent += '============================================================\n\n';

    if (importedRows.length > 0) {
        txtContent += 'REGISTROS IMPORTADOS COM SUCESSO:\n';
        txtContent += '------------------------------------------------------------\n';
        importedRows.forEach((row, index) => {
            txtContent += `${index + 1}. Veiculo: ${row.placa} | Data: ${new Date(row.data).toLocaleString('pt-BR')} | Litros: ${row.litros}L\n`;
        });
        txtContent += '\n';
    }

    if (rejectedRows.length > 0) {
        txtContent += 'REGISTROS REJEITADOS / ERROS:\n';
        txtContent += '------------------------------------------------------------\n';
        rejectedRows.forEach((row, index) => {
            txtContent += `Erro ${index + 1}:\n`;
            txtContent += `  Motivo: ${row.motivo_rejeicao}\n`;
            txtContent += '  Dados da Linha:\n';
            Object.keys(row).forEach(key => {
                if (key !== 'motivo_rejeicao') {
                    txtContent += `    - ${key}: ${row[key]}\n`;
                }
            });
            txtContent += '\n';
        });
    }

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    link.setAttribute('download', `resumo_importacao_externa_${timestamp}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
