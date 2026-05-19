export function atualizarIconesOrdenacao({ selector, activeKey, asc, datasetKey = 'sort' }) {
    document.querySelectorAll(`${selector} i`).forEach(icon => {
        icon.className = 'fas fa-sort';
    });

    const activeTh = document.querySelector(`${selector}[data-${datasetKey}="${activeKey}"] i`);
    if (activeTh) {
        activeTh.className = asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
    }
}

export function atualizarIconesOrdenacaoEntrada(sortState) {
    const ths = document.querySelectorAll('#containerHistoricoEntrada th[data-field]');
    ths.forEach(th => {
        const icon = th.querySelector('i');
        if (!icon) return;

        icon.className = 'fas fa-sort';
        if (th.dataset.field === sortState.field) {
            icon.className = sortState.ascending ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    });
}
