function normalizarChave(value) {
    return String(value || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '');
}

function normalizarBico(value) {
    return String(value || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]/g, '');
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

function parseBicoOrigem(value) {
    const raw = String(value || '').trim();
    const bicoMatch = raw.match(/^\s*([A-Za-z0-9]+)/);
    const bombaMatch = raw.match(/BOMBA\s*:\s*([^)]+?)(?:\s*-\s*TANQUE\s*:|\)|$)/i);
    const tanqueMatch = raw.match(/TANQUE\s*:\s*([^)]+)/i);

    return {
        raw,
        normalized: normalizarBico(raw),
        bico: normalizarBico(bicoMatch?.[1] || raw),
        bomba: normalizarBico(bombaMatch?.[1] || ''),
        tanque: normalizarBico(tanqueMatch?.[1] || ''),
        hasQualifiers: /BOMBA\s*:|TANQUE\s*:/i.test(raw)
    };
}

function normalizarLinha(row) {
    const normalizada = {};
    Object.keys(row || {}).forEach(key => {
        normalizada[String(key).toUpperCase().trim()] = row[key];
    });
    return normalizada;
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

function encontrarBico({ bicosDisponiveis, bicoNomeExcel, filialSelecionada }) {
    const bicoExcel = parseBicoOrigem(bicoNomeExcel);
    const filial = String(filialSelecionada || '').toUpperCase().trim();

    const bicosFiltrados = (bicosDisponiveis || []).filter(bico => {
        const sistemaFilial = String(bico.bombas?.tanques?.filial || '').toUpperCase().trim();
        return !filial || sistemaFilial === filial;
    });

    return bicosFiltrados.find(bico => {
        const sistemaBicoNome = normalizarBico(bico.nome);
        const sistemaBombaNome = normalizarBico(bico.bombas?.nome);
        const sistemaTanqueNome = normalizarBico(bico.bombas?.tanques?.nome);
        const labelSistema = normalizarBico(`${bico.nome} BOMBA ${bico.bombas?.nome || ''} TANQUE ${bico.bombas?.tanques?.nome || ''}`);

        if (bicoExcel.hasQualifiers) {
            const bicoConfere = !bicoExcel.bico || sistemaBicoNome === bicoExcel.bico;
            const bombaConfere = !bicoExcel.bomba || sistemaBombaNome === bicoExcel.bomba;
            const tanqueConfere = !bicoExcel.tanque || sistemaTanqueNome === bicoExcel.tanque;
            return bicoConfere && bombaConfere && tanqueConfere;
        }

        return sistemaBicoNome === bicoExcel.normalized || labelSistema === bicoExcel.normalized;
    });
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
                    throw new Error('Planilha vazia ou formato invalido.');
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

export async function montarPayloadsImportacaoSaida({
    file,
    XLSX,
    bicosDisponiveis,
    filialSelecionada,
    usuario
}) {
    const rows = await lerXlsx(file, XLSX);
    const payloads = [];

    for (const [index, row] of rows.entries()) {
        const placa = String(getFlexVal(row, ['VEICULO (PLACA)', 'PLACA', 'VEICULO']) || '').replace(/\s+/g, '').toUpperCase().trim();
        const bicoNomeExcel = String(getFlexVal(row, ['BICO DE ORIGEM', 'BICO']) || '').trim();
        const litros = parseFloat(String(getFlexVal(row, ['LITROS ABASTECIDOS', 'LITROS']) || 0).replace(',', '.'));
        const kmAtual = parseFloat(String(getFlexVal(row, ['KM / HORIMETRO ATUAL', 'KM ATUAL', 'KM']) || 0).replace(',', '.'));

        if (!placa || !bicoNomeExcel || litros <= 0 || kmAtual <= 0) {
            console.warn(`Linha ${index + 2} ignorada por dados incompletos ou zerados. Placa: ${placa}, Bico: ${bicoNomeExcel}, Litros: ${litros}, KM: ${kmAtual}`);
            continue;
        }

        const bico = encontrarBico({ bicosDisponiveis, bicoNomeExcel, filialSelecionada });
        if (!bico) {
            console.warn(`Bico "${bicoNomeExcel}" nao encontrado na filial "${filialSelecionada || 'Todas'}" para a placa ${placa}. Linha ignorada.`);
            continue;
        }

        payloads.push({
            data_hora: parseDataHora(getFlexVal(row, ['DATA E HORA', 'DATA'])),
            veiculo_placa: placa,
            motorista: String(getFlexVal(row, ['MOTORISTA (OPCIONAL)', 'MOTORISTA']) || '').trim(),
            rota: String(getFlexVal(row, ['ROTA']) || '').trim(),
            km_atual: kmAtual,
            bico_id: bico.id,
            qtd_litros: litros,
            usuario
        });
    }

    return payloads;
}
