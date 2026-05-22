function getNivelEstoque(estoque, capacidade) {
    const percentualRaw = capacidade > 0 ? (estoque / capacidade) * 100 : 0;
    const percentual = Math.round(percentualRaw);
    let color = '#006937';

    if (percentual < 20) color = '#dc3545';
    else if (percentual < 50) color = '#ffc107';

    return { percentual, color };
}

export function montarHtmlEstoque(tanques, { canViewAuditoria, formatLitros, totalColunas }) {
    if (!tanques.length) {
        return `<tr><td colspan="${totalColunas}" class="text-center">Nenhum tanque cadastrado.</td></tr>`;
    }

    return tanques.map(tanque => {
        const capacidade = parseFloat(tanque.capacidade) || 0;
        const estoque = parseFloat(tanque.estoque_atual) || 0;
        const { percentual, color } = getNivelEstoque(estoque, capacidade);

        return `
            <tr data-calculated-stock="${tanque.estoque_atual}">
                <td>${tanque.nome}</td>
                <td>${tanque.tipo_combustivel}</td>
                <td>${tanque.capacidade ? tanque.capacidade.toLocaleString('pt-BR') + ' L' : '-'}</td>
                <td style="width: 250px; vertical-align: middle;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="flex-grow: 1; background: #e9ecef; height: 10px; border-radius: 5px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">
                            <div class="estoque-nivel-barra" style="width: ${Math.min(percentual, 100)}%; background: ${color}; height: 100%; border-radius: 5px; transition: width 0.5s ease;"></div>
                        </div>
                        <span class="estoque-nivel-percentual" style="font-weight: bold; color: ${color}; font-size: 0.9rem; min-width: 40px; text-align: right;">${percentual}%</span>
                    </div>
                </td>
                ${canViewAuditoria ? `<td class="estoque-anterior">${formatLitros(estoque)} L</td>` : ''}
                <td>
                    <input type="text" class="input-estoque-atual glass-input" data-id="${tanque.id}"
                        data-capacidade="${tanque.capacidade || 0}"
                        value="${formatLitros(tanque.estoque_atual)}"
                        oninput="this.value = this.value.replace(/[^0-9,.]/g, '')">
                </td>
                ${canViewAuditoria ? '<td class="estoque-diferenca diferenca-zero">0,00 L</td>' : ''}
            </tr>
        `;
    }).join('');
}
