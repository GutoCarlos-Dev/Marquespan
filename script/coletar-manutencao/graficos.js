const STATUS_COLORS = {
    FINALIZADO: '#28a745',
    OK: '#28a745',
    PENDENTE: '#dc3545',
    'NAO REALIZADO': '#dc3545',
    INTERNADO: '#007bff',
    'CHECK-IN OFICINA': '#ffc107',
    'CHECK-IN ROTA': '#fd7e14',
    'FINALIZADO ROTA': '#006400',
    'N/A': '#6c757d'
};

function contarPor(data, getKey) {
    return data.reduce((acc, row) => {
        const key = getKey(row);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function destruirGraficos(graficosAtuais) {
    Object.values(graficosAtuais).forEach(chart => {
        if (chart) chart.destroy();
    });
}

export function renderizarGraficosManutencao(reportData, graficosContainer, graficosAtuais = {}) {
    if (!reportData || reportData.length === 0) {
        if (graficosContainer) graficosContainer.style.display = 'none';
        destruirGraficos(graficosAtuais);
        return {
            chartStatus: null,
            chartItems: null,
            chartOficinas: null
        };
    }

    if (typeof Chart === 'undefined') {
        console.warn('Biblioteca Chart.js nao carregada.');
        return graficosAtuais;
    }

    if (graficosContainer) graficosContainer.style.display = 'block';

    const statusCounts = contarPor(reportData, row => row.status || 'N/A');
    const itemCounts = contarPor(reportData, row => row.item || 'Outros');
    const oficinaCounts = contarPor(reportData, row => row.oficinas ? row.oficinas.nome : 'N/A');

    destruirGraficos(graficosAtuais);

    const ctxStatus = document.getElementById('grafico-status')?.getContext('2d');
    const ctxItems = document.getElementById('grafico-itens')?.getContext('2d');
    const ctxOficinas = document.getElementById('grafico-oficinas')?.getContext('2d');

    return {
        chartStatus: ctxStatus ? new Chart(ctxStatus, {
            type: 'pie',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: Object.keys(statusCounts).map(s => STATUS_COLORS[s] || '#17a2b8')
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        }) : null,

        chartItems: ctxItems ? new Chart(ctxItems, {
            type: 'bar',
            data: {
                labels: Object.keys(itemCounts),
                datasets: [{
                    label: 'Quantidade',
                    data: Object.values(itemCounts),
                    backgroundColor: '#007bff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } }
            }
        }) : null,

        chartOficinas: ctxOficinas ? new Chart(ctxOficinas, {
            type: 'bar',
            data: {
                labels: Object.keys(oficinaCounts),
                datasets: [{
                    label: 'Quantidade de Manutenções',
                    data: Object.values(oficinaCounts),
                    backgroundColor: '#17a2b8'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } }
            }
        }) : null
    };
}

