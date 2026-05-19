function baixarPlanilhaModelo({ XLSX, headers, data, sheetName, fileName }) {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
}

export function baixarModeloImportacaoExterno(XLSX) {
    baixarPlanilhaModelo({
        XLSX,
        headers: [
            'FILIAL',
            'DATA E HORA',
            'CNPJ',
            'PLACA',
            'ROTA',
            'KM ATUAL',
            'LITROS',
            'VALOR TOTAL',
            'VALOR UNITARIO',
            'MOTORISTA'
        ],
        data: [
            ['SP', '2026-05-11 16:21', '31.465.255/0001-53', 'FXL9D11', 'EQUIP', 972838, 140.06, 945.40, 6.75]
        ],
        sheetName: 'Modelo Externo',
        fileName: 'Modelo_Importacao_Abastecimento_Externo.xlsx'
    });
}

export function baixarModeloImportacaoSaida(XLSX) {
    baixarPlanilhaModelo({
        XLSX,
        headers: [
            'DATA E HORA',
            'VEICULO (PLACA)',
            'MOTORISTA (OPCIONAL)',
            'ROTA',
            'KM / HORIMETRO ATUAL',
            'BICO DE ORIGEM (NOME COMPLETO)',
            'LITROS ABASTECIDOS'
        ],
        data: [
            ['2025-05-12 10:30', 'ABC1234', 'JOAO SILVA', '101', '150000', '1 (BOMBA: A - TANQUE: FABRICA 2)', '50.00']
        ],
        sheetName: 'Modelo Saida',
        fileName: 'Modelo_Importacao_Saida.xlsx'
    });
}
