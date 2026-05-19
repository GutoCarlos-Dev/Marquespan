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

export function filtrarOrdenarPostos(postosData, term, sortState) {
    const busca = String(term || '').toLowerCase();
    const filtrados = (postosData || []).filter(posto => {
        return String(posto.razao_social || '').toLowerCase().includes(busca) ||
            String(posto.cnpj || '').toLowerCase().includes(busca) ||
            String(posto.cidade || '').toLowerCase().includes(busca);
    });

    return filtrados.sort((a, b) => compararValores(a, b, sortState));
}

export function montarHtmlPostos(postos) {
    if (!postos.length) {
        return '<tr><td colspan="7" style="text-align:center;">Nenhum posto encontrado.</td></tr>';
    }

    return postos.map(posto => `
        <tr>
            <td>${posto.filial || '-'}</td>
            <td>${posto.razao_social}</td>
            <td>${posto.cnpj || '-'}</td>
            <td>${posto.cidade || '-'}</td>
            <td>${posto.uf || '-'}</td>
            <td>${posto.faturado ? 'Sim' : 'N&atilde;o'}</td>
            <td>${(posto.valor_negociado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
            <td style="display: flex; gap: 5px; justify-content: center;">
                <button class="btn-action btn-edit-posto" data-id="${posto.id}" style="color: #007bff; border: none; background: transparent; cursor: pointer;" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-action btn-delete-posto" data-id="${posto.id}" style="color: #dc3545; border: none; background: transparent; cursor: pointer;" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}
