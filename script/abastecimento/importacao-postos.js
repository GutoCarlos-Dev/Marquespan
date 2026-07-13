function normalizarLinha(row) {
    const normalizada = {};
    Object.keys(row || {}).forEach(key => {
        normalizada[String(key).toUpperCase().trim()] = row[key];
    });
    return normalizada;
}

function limparCnpj(value) {
    return String(value || '').replace(/\D/g, '');
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

function montarPayloadsPostos(rows, existingCnpjs) {
    const payloads = [];
    const cnpjsNoArquivo = new Set();
    let duplicados = 0;

    for (const row of rows) {
        const razao = row['RAZAO SOCIAL'] || row['RAZÃO SOCIAL'] || row['RAZAO'] || row['NOME'];
        if (!razao) continue;

        const cnpjRaw = row['CNPJ'] ? String(row['CNPJ']) : '';
        const cnpjClean = limparCnpj(cnpjRaw);

        if (cnpjClean) {
            if (existingCnpjs.has(cnpjClean) || cnpjsNoArquivo.has(cnpjClean)) {
                duplicados++;
                continue;
            }
            cnpjsNoArquivo.add(cnpjClean);
        }

        payloads.push({
            razao_social: razao,
            cidade: row['CIDADE'] || '',
            uf: row['UF'] || '',
            endereco: row['ENDERECO'] || row['ENDEREÇO'] || '',
            geolocalizacao: row['GEOLOCALIZACAO'] || row['GEOLOCALIZAÇÃO'] || '',
            filial: row['FILIAL'] || '',
            cnpj: cnpjRaw,
            faturado: false
        });
    }

    return { payloads, duplicados };
}

export async function importarPostos({ file, XLSX, supabaseClient }) {
    const rows = await lerXlsx(file, XLSX);
    const { data: existingData } = await supabaseClient.from('postos').select('cnpj');
    const existingCnpjs = new Set((existingData || []).map(posto => limparCnpj(posto.cnpj)).filter(Boolean));
    const { payloads, duplicados } = montarPayloadsPostos(rows, existingCnpjs);

    if (payloads.length > 0) {
        const { error } = await supabaseClient.from('postos').insert(payloads);
        if (error) throw error;
    }

    return { importados: payloads.length, duplicados };
}
