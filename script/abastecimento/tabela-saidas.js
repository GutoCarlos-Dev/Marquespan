function compararValores(a, b, sortState) {
    let valA = a[sortState.key];
    let valB = b[sortState.key];

    if (valA === null || valA === undefined) valA = '';
    if (valB === null || valB === undefined) valB = '';
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return sortState.asc ? -1 : 1;
    if (valA > valB) return sortState.asc ? 1 : -1;
    return 0;
}

export function filtrarOrdenarSaidas(saidasData, term, sortState) {
    const busca = String(term || '').toLowerCase();
    const filtradas = (saidasData || []).filter(item => {
        const data = new Date(item.data_hora).toLocaleString('pt-BR').toLowerCase();
        return String(item.veiculo_placa || '').toLowerCase().includes(busca) ||
            String(item.rota || '').toLowerCase().includes(busca) ||
            String(item.motorista || '').toLowerCase().includes(busca) ||
            data.includes(busca);
    });

    return filtradas.sort((a, b) => compararValores(a, b, sortState));
}

export function montarHtmlSaidas(saidas) {
    if (!saidas.length) {
        return '<tr><td colspan="8" class="text-center">Nenhuma sa&iacute;da registrada.</td></tr>';
    }

    return saidas.map(saida => `
        <tr>
            <td>${new Date(saida.data_hora).toLocaleString('pt-BR')}</td>
            <td>${saida.veiculo_placa || ''}</td>
            <td>${saida.motorista || '-'}</td>
            <td>${saida.rota || ''}</td>
            <td>${parseFloat(saida.qtd_litros).toLocaleString('pt-BR')} L</td>
            <td>${saida.km_atual || ''}</td>
            <td>${saida.usuario || '-'}</td>
            <td style="display: flex; gap: 5px; justify-content: center;">
                <button class="btn-action btn-edit" data-id="${saida.id}" style="color: #007bff; border: none; background: transparent; cursor: pointer;" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-action btn-delete" data-id="${saida.id}" style="color: #dc3545; border: none; background: transparent; cursor: pointer;" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}
