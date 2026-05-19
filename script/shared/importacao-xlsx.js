export function normalizarLinha(row) {
    const normalizada = {};
    Object.keys(row || {}).forEach(key => {
        normalizada[String(key).toUpperCase().trim()] = row[key];
    });
    return normalizada;
}

export function converterDataPlanilha(valor) {
    if (valor instanceof Date) return valor;

    if (typeof valor === 'string') {
        const parts = valor.split('/');
        if (parts.length === 3) {
            return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
        }
    }

    return new Date();
}

export function lerXlsxComoJson(arquivo) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
            reject(new Error('Biblioteca XLSX nao carregada.'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                if (jsonData.length === 0) {
                    throw new Error('Arquivo vazio ou formato invalido.');
                }

                resolve(jsonData.map(normalizarLinha));
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(arquivo);
    });
}

