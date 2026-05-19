function parseDecimal(value) {
    return parseFloat(String(value || '').replace(',', '.')) || 0;
}

export function montarPayloadsEntrada({
    totalNota,
    valorLitro,
    notaFiscal,
    data,
    linhas,
    usuario
}) {
    if (totalNota <= 0 || valorLitro <= 0) {
        throw new Error('Quantidade Total e Valor por Litro devem ser maiores que zero.');
    }

    if (!linhas.length) {
        throw new Error('Adicione pelo menos um tanque para a distribuição.');
    }

    const payloads = [];
    const tanquesUsados = new Set();
    let totalDistribuido = 0;

    for (const linha of linhas) {
        const tanqueId = linha.querySelector('.tanque-select').value;
        const qtd = parseDecimal(linha.querySelector('.tanque-qtd').value);

        if (!tanqueId || qtd <= 0) {
            throw new Error('Todas as linhas de distribuição devem ter um tanque e uma quantidade válida.');
        }

        if (tanquesUsados.has(tanqueId)) {
            throw new Error('Não é permitido selecionar o mesmo tanque mais de uma vez.');
        }

        tanquesUsados.add(tanqueId);
        totalDistribuido += qtd;

        payloads.push({
            data: data ? new Date(data).toISOString() : new Date().toISOString(),
            numero_nota: notaFiscal,
            tanque_id: parseInt(tanqueId),
            qtd_litros: qtd,
            valor_litro: valorLitro,
            valor_total: qtd * valorLitro,
            usuario
        });
    }

    if (Math.abs(totalDistribuido - totalNota) > 0.001) {
        throw new Error(`A soma dos litros distribuídos (${totalDistribuido.toFixed(2)} L) não corresponde à Quantidade Total da Nota (${totalNota.toFixed(2)} L).`);
    }

    return payloads;
}

export function montarPayloadsSaida({
    veiculosDisponiveis,
    dataHora,
    placa,
    rota,
    motorista,
    km,
    usuario,
    bico1,
    litros1,
    bico2,
    litros2,
    bico2Visivel
}) {
    const placaInput = String(placa || '').toUpperCase();
    const veiculoObj = (veiculosDisponiveis || []).find(v => v.placa === placaInput);

    if (!veiculoObj) {
        throw new Error('Placa inválida. Por favor, selecione um veículo cadastrado na lista.');
    }

    const kmValue = parseFloat(km);
    const commonData = {
        data_hora: dataHora ? new Date(dataHora).toISOString() : new Date().toISOString(),
        veiculo_placa: placaInput,
        rota,
        motorista,
        km_atual: kmValue,
        usuario
    };

    const payloads = [];
    const bico1Id = parseInt(bico1);
    const litrosBico1 = parseFloat(litros1);

    if (bico1Id && litrosBico1 > 0) {
        payloads.push({ ...commonData, bico_id: bico1Id, qtd_litros: litrosBico1 });
    } else {
        throw new Error('Informe o Bico e a Quantidade de Litros para o primeiro abastecimento.');
    }

    const bico2Id = parseInt(bico2);
    const litrosBico2 = parseFloat(litros2);

    if (bico2Visivel && bico2Id && litrosBico2 > 0) {
        if (bico1Id === bico2Id) {
            throw new Error('Não é possível utilizar o mesmo bico duas vezes no mesmo registro.');
        }

        const dataBico2 = new Date(commonData.data_hora);
        dataBico2.setSeconds(dataBico2.getSeconds() + 1);
        payloads.push({ ...commonData, data_hora: dataBico2.toISOString(), bico_id: bico2Id, qtd_litros: litrosBico2 });
    }

    return { payloads, commonData, kmValue, placaInput, veiculoObj, usuario };
}

export function montarPayloadExterno({
    postosCache,
    postoTexto,
    dataHora,
    filial,
    veiculo,
    tipo,
    kmAtual,
    kmAnterior,
    kmRodado,
    litros,
    valorTotal,
    valorUnitario,
    motorista,
    rota,
    usuario
}) {
    const posto = (postosCache || []).find(p => `${p.razao_social} (${p.cnpj || 'S/CNPJ'})` === postoTexto);

    if (!posto) {
        throw new Error('Selecione um posto válido da lista.');
    }

    const payload = {
        data_hora: dataHora ? new Date(dataHora).toISOString() : new Date().toISOString(),
        filial,
        posto_id: posto.id,
        valor_negociado: posto.valor_negociado,
        veiculo_placa: String(veiculo || '').toUpperCase(),
        tipo_veiculo: tipo,
        km_atual: parseFloat(kmAtual),
        km_anterior: parseFloat(kmAnterior),
        km_rodado: parseFloat(kmRodado),
        litros: parseFloat(litros),
        valor_total: parseFloat(valorTotal),
        valor_unitario: parseFloat(valorUnitario),
        motorista: String(motorista || '').trim() ? String(motorista).trim().toUpperCase() : null,
        rota,
        usuario
    };

    if (!payload.posto_id || !payload.veiculo_placa || !payload.km_atual) {
        throw new Error('Preencha os campos obrigatórios.');
    }

    return payload;
}

export function montarPayloadPosto({
    filial,
    razaoSocial,
    cnpj,
    cidade,
    uf,
    faturado,
    valorNegociado
}) {
    return {
        filial,
        razao_social: razaoSocial,
        cnpj,
        cidade,
        uf,
        faturado: faturado === 'Sim',
        valor_negociado: parseFloat(valorNegociado) || null
    };
}
