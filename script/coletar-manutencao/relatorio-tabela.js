function ordenarRelatorio(reportData, sortConfig) {
    const col = sortConfig.column;
    const dir = sortConfig.direction === 'asc' ? 1 : -1;

    reportData.sort((a, b) => {
        let valA;
        let valB;

        if (col === 'data_hora') {
            valA = new Date(a.coletas_manutencao.data_hora);
            valB = new Date(b.coletas_manutencao.data_hora);
        } else if (['semana', 'placa', 'modelo'].includes(col)) {
            valA = a.coletas_manutencao[col];
            valB = b.coletas_manutencao[col];
        } else {
            valA = a[col] || '';
            valB = b[col] || '';
        }

        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
}

function aplicarCorStatus(tr, status) {
    const statusUpper = status ? status.toUpperCase() : '';

    if (statusUpper === 'FINALIZADO' || statusUpper === 'OK') {
        tr.style.backgroundColor = '#d4edda';
        tr.style.color = '#155724';
    } else if (statusUpper === 'PENDENTE' || statusUpper === 'NAO REALIZADO' || statusUpper === 'NÃO REALIZADO') {
        tr.style.backgroundColor = '#f8d7da';
        tr.style.color = '#721c24';
    } else if (statusUpper === 'INTERNADO') {
        tr.style.backgroundColor = '#cce5ff';
        tr.style.color = '#004085';
    } else if (statusUpper === 'CHECK-IN OFICINA') {
        tr.style.backgroundColor = '#fff3cd';
        tr.style.color = '#856404';
    } else if (statusUpper === 'CHECK-IN ROTA') {
        tr.style.backgroundColor = '#ffe0b2';
        tr.style.color = '#d35400';
    } else if (statusUpper === 'FINALIZADO ROTA') {
        tr.style.backgroundColor = '#d4edda';
        tr.style.color = '#006400';
        tr.style.fontWeight = 'bold';
    }
}

function montarBotoesAcao(coletaId, podeExcluir) {
    const id = escapeHtml(coletaId);
    let botoesAcao = `<button class="btn-action btn-edit" data-id="${id}" title="Editar"><i class="fas fa-pen"></i></button>`;
    if (podeExcluir) {
        botoesAcao += `\n            <button class="btn-action btn-delete" data-id="${id}" title="Excluir"><i class="fas fa-trash"></i></button>`;
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

export function renderizarTabelaRelatorio({ tbody, reportData, sortConfig, nivelUsuario }) {
    if (!tbody) return;

    tbody.innerHTML = '';
    ordenarRelatorio(reportData, sortConfig);

    const podeExcluir = !['mecanica_externa', 'mecanica_interna', 'moleiro'].includes(nivelUsuario);
    const fragment = document.createDocumentFragment();

    reportData.forEach(item => {
        const coleta = item.coletas_manutencao;
        const tr = document.createElement('tr');
        aplicarCorStatus(tr, item.status);

        const nomeOficina = item.oficinas ? item.oficinas.nome : '-';
        tr.innerHTML = `
            <td>${escapeHtml(new Date(coleta.data_hora).toLocaleString('pt-BR'))}</td>
            <td>${escapeHtml(coleta.semana)}</td>
            <td>${escapeHtml(coleta.placa)}</td>
            <td>${escapeHtml(coleta.modelo || '-')}</td>
            <td>${escapeHtml(item.item)}</td>
            <td>${escapeHtml(item.status)}</td>
            <td>${escapeHtml(nomeOficina)}</td>
            <td>${escapeHtml(item.detalhes || '-')}</td>
            <td>${escapeHtml(item.pecas_usadas || '-')}</td>
            <td><strong>${(item.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
            <td>${montarBotoesAcao(coleta.id, podeExcluir)}</td>
        `;

        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
}
