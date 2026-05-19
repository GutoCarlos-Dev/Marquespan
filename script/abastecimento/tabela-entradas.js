function formatarMoedaPrecisa(value) {
    return (value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
    });
}

export function montarHtmlEntradas(registros) {
    if (!registros.length) {
        return '<tr><td colspan="7">Nenhum registro encontrado.</td></tr>';
    }

    return registros.map(reg => {
        const data = new Date(reg.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        const tanqueNome = reg.tanques ? reg.tanques.nome : 'Tanque excluido';

        return `
            <tr>
                <td>${data}</td>
                <td>${reg.numero_nota}</td>
                <td>${tanqueNome}</td>
                <td>${reg.qtd_litros.toLocaleString('pt-BR')} L</td>
                <td>${formatarMoedaPrecisa(reg.valor_litro)}</td>
                <td>${formatarMoedaPrecisa(reg.valor_total)}</td>
                <td>${reg.usuario || '-'}</td>
                <td style="display: flex; gap: 5px; justify-content: center;">
                    <button class="btn-action btn-edit" data-id="${reg.id}" style="color: #007bff; border: none; background: transparent; cursor: pointer;" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn-action btn-delete" data-id="${reg.id}" style="color: #dc3545; border: none; background: transparent; cursor: pointer;" title="Excluir"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}
