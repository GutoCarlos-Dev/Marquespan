function compararValores(a, b, sortState) {
    let valA = a[sortState.key];
    let valB = b[sortState.key];

    if (sortState.key === 'posto') {
        valA = a.postos?.razao_social || '';
        valB = b.postos?.razao_social || '';
    }

    if (valA === null || valA === undefined) valA = '';
    if (valB === null || valB === undefined) valB = '';
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return sortState.asc ? -1 : 1;
    if (valA > valB) return sortState.asc ? 1 : -1;
    return 0;
}

export function filtrarOrdenarExternos(extData, term, sortState) {
    const busca = String(term || '').toLowerCase();
    const filtrados = (extData || []).filter(item => {
        const postoNome = item.postos?.razao_social || '';
        return String(item.filial || '').toLowerCase().includes(busca) ||
            String(item.veiculo_placa || '').toLowerCase().includes(busca) ||
            String(postoNome).toLowerCase().includes(busca) ||
            String(item.motorista || '').toLowerCase().includes(busca) ||
            String(item.data_hora || '').toLowerCase().includes(busca);
    });

    return filtrados.sort((a, b) => compararValores(a, b, sortState));
}

export function montarHtmlExternos(registros, isAdmin) {
    const colCount = isAdmin ? 14 : 13;

    if (!registros.length) {
        return `<tr><td colspan="${colCount}">Nenhum registro.</td></tr>`;
    }

    return registros.map(item => {
        const data = new Date(item.data_hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        const valorTotal = item.valor_total ? item.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';
        const checkboxHtml = isAdmin
            ? `<td style="text-align:center;"><input type="checkbox" class="chk-ext-delete" value="${item.id}"></td>`
            : '';

        return `
            <tr>
                ${checkboxHtml}
                <td>${data}</td>
                <td>${item.filial || '-'}</td>
                <td>${item.usuario || '-'}</td>
                <td>${item.postos?.razao_social || '-'}</td>
                <td>${item.veiculo_placa}</td>
                <td>${item.motorista || '-'}</td>
                <td>${item.litros || '-'} L</td>
                <td>${valorTotal}</td>
                <td>${item.valor_unitario || '-'}</td>
                <td>${item.km_anterior || '0'}</td>
                <td>${item.km_atual || '-'}</td>
                <td>${item.km_rodado || '0'}</td>
                <td style="display: flex; gap: 5px; justify-content: center;">
                    <button class="btn-action btn-edit-ext" data-id="${item.id}" style="color: #007bff; border: none; background: transparent; cursor: pointer;" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn-action btn-delete-ext" data-id="${item.id}" style="color: #dc3545; border: none; background: transparent; cursor: pointer;" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}
