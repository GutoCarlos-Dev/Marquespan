function escapeHTML(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

function getDiferencaClasse(diferenca) {
    if (diferenca > 0.001) return 'diferenca-positiva';
    if (diferenca < -0.001) return 'diferenca-negativa';
    return 'diferenca-zero';
}

export function montarHtmlAuditoriaEstoque(rows, formatLitros) {
    if (!rows.length) {
        return '<tr><td colspan="8" class="text-center">Nenhum ajuste encontrado para a data selecionada.</td></tr>';
    }

    return rows.map(item => {
        const diferencaClasse = getDiferencaClasse(item.diferenca);

        return `
            <tr>
                <td>${new Date(item.data).toLocaleString('pt-BR')}</td>
                <td>${escapeHTML(item.usuario || '-')}</td>
                <td>${escapeHTML(item.tanques?.nome || '-')}</td>
                <td>${escapeHTML(item.tanques?.tipo_combustivel || '-')}</td>
                <td class="estoque-anterior">${formatLitros(item.estoqueAnterior)} L</td>
                <td class="estoque-anterior">${formatLitros(item.estoqueAtual)} L</td>
                <td class="estoque-diferenca ${diferencaClasse}">${item.diferenca > 0 ? '+' : ''}${formatLitros(item.diferenca)} L</td>
                <td style="display: flex; gap: 5px; justify-content: center;">
                    <button class="btn-action btn-edit btn-edit-auditoria" data-id="${item.id}" data-estoque-anterior="${item.estoqueAnterior}" style="color: #007bff; border: none; background: transparent; cursor: pointer;" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn-action btn-delete btn-delete-auditoria" data-id="${item.id}" style="color: #dc3545; border: none; background: transparent; cursor: pointer;" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}
