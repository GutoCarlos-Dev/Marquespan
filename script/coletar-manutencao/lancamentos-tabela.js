function getStatusGeral(checklist) {
    if (checklist.length === 0) return 'NONE';

    const hasNaoRealizado = checklist.some(i => i.status === 'PENDENTE' || i.status === 'NAO REALIZADO' || i.status === 'NÃO REALIZADO');
    const hasInternado = checklist.some(i => i.status === 'INTERNADO');
    const hasCheckinOficina = checklist.some(i => i.status === 'CHECK-IN OFICINA');
    const hasCheckinRota = checklist.some(i => i.status === 'CHECK-IN ROTA');
    const hasFinalizadoRota = checklist.some(i => i.status === 'FINALIZADO ROTA');
    const allOk = checklist.every(i => i.status === 'FINALIZADO' || i.status === 'OK' || i.status === 'FINALIZADO ROTA');

    if (hasNaoRealizado) return 'PENDENTE';
    if (hasInternado) return 'INTERNADO';
    if (hasCheckinOficina) return 'CHECK-IN OFICINA';
    if (hasCheckinRota) return 'CHECK-IN ROTA';
    if (allOk) return hasFinalizadoRota ? 'FINALIZADO ROTA' : 'FINALIZADO';
    return 'NONE';
}

function aplicarCorStatusGeral(tr, status) {
    if (status === 'FINALIZADO' || status === 'OK') {
        tr.style.backgroundColor = '#d4edda';
        tr.style.color = '#155724';
    } else if (status === 'FINALIZADO ROTA') {
        tr.style.backgroundColor = '#d4edda';
        tr.style.color = '#006400';
        tr.style.fontWeight = 'bold';
    } else if (status === 'PENDENTE') {
        tr.style.backgroundColor = '#f8d7da';
        tr.style.color = '#721c24';
    } else if (status === 'INTERNADO') {
        tr.style.backgroundColor = '#cce5ff';
        tr.style.color = '#004085';
    } else if (status === 'CHECK-IN OFICINA') {
        tr.style.backgroundColor = '#fff3cd';
        tr.style.color = '#856404';
    } else if (status === 'CHECK-IN ROTA') {
        tr.style.backgroundColor = '#ffe0b2';
        tr.style.color = '#d35400';
    }
}

function montarBotoesAcao(id, podeExcluir) {
    const safeId = escapeHtml(id);
    let botoesAcao = `<button class="btn-action btn-edit" data-id="${safeId}" title="Editar"><i class="fas fa-pen"></i></button>`;
    if (podeExcluir) {
        botoesAcao += `\n            <button class="btn-action btn-delete" data-id="${safeId}" title="Excluir"><i class="fas fa-trash"></i></button>`;
    }
    return botoesAcao;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function renderizarTabelaLancamentos({ tbody, data, roleFilterItem, podeExcluir, isRestricted }) {
    if (!tbody) return;

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    data.forEach(item => {
        const tr = document.createElement('tr');
        let checklist = item.coletas_manutencao_checklist || [];

        if (roleFilterItem) {
            checklist = checklist.filter(i => i.item === roleFilterItem);
        }

        aplicarCorStatusGeral(tr, getStatusGeral(checklist));

        const valorDisplay = item.valor_total > 0
            ? `<strong>${item.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>`
            : '-';
        const valorStyle = isRestricted ? 'display: none;' : '';

        tr.innerHTML = `
            <td>${escapeHtml(new Date(item.data_hora).toLocaleString('pt-BR'))}</td>
            <td>${escapeHtml(item.semana)}</td>
            <td>${escapeHtml(item.placa)}</td>
            <td>${escapeHtml(item.usuario)}</td>
            <td style="${valorStyle}">${valorDisplay}</td>
            <td>${montarBotoesAcao(item.id, podeExcluir)}</td>
        `;

        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
}
