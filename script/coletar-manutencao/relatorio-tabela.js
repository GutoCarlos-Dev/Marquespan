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
    let botoesAcao = `<button class="btn-action btn-edit" data-id="${coletaId}" title="Editar"><i class="fas fa-pen"></i></button>`;
    if (podeExcluir) {
        botoesAcao += `\n            <button class="btn-action btn-delete" data-id="${coletaId}" title="Excluir"><i class="fas fa-trash"></i></button>`;
    }
    return botoesAcao;
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
            <td>${new Date(coleta.data_hora).toLocaleString('pt-BR')}</td>
            <td>${coleta.semana}</td>
            <td>${coleta.placa}</td>
            <td>${coleta.modelo || '-'}</td>
            <td>${item.item}</td>
            <td>${item.status}</td>
            <td>${nomeOficina}</td>
            <td>${item.detalhes || '-'}</td>
            <td>${item.pecas_usadas || '-'}</td>
            <td><strong>${(item.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
            <td>${montarBotoesAcao(coleta.id, podeExcluir)}</td>
        `;

        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
}

