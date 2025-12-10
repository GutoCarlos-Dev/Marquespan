// Para a exportação, você precisará instalar bibliotecas como jsPDF e SheetJS (xlsx)
// import { jsPDF } from "jspdf";
// import "jspdf-autotable";
// import * as XLSX from "xlsx";

document.addEventListener('DOMContentLoaded', () => {
    const formFiltro = document.getElementById('formFiltroRelatorio');
    const resultadoRelatorio = document.getElementById('resultadoRelatorio');
    const relatorioTableBody = document.getElementById('relatorioTableBody');
    const periodoRelatorioSpan = document.getElementById('periodoRelatorio');
    const totalGeralRelatorioSpan = document.getElementById('totalGeralRelatorio');
    const btnExportarXLSX = document.getElementById('btnExportarXLSX');
    const btnExportarPDF = document.getElementById('btnExportarPDF');

    let reportData = [];

    // Função para formatar moeda
    const formatCurrency = (value) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // Função para buscar dados (simulação)
    const fetchDespesas = async (startDate, endDate) => {
        // Em um cenário real, você faria uma chamada de API aqui:
        // const response = await fetch(`/api/despesas?checkin_start=${startDate}&checkin_end=${endDate}`);
        // const data = await response.json();
        // return data;

        // Dados de exemplo para simulação:
        console.log(`Buscando despesas entre ${startDate} e ${endDate}`);
        return [
            { id: 1, numero_rota: '101', valor_total: 450.00, data_checkin: '2024-07-20' },
            { id: 2, numero_rota: '102', valor_total: 500.00, data_checkin: '2024-07-21' },
            { id: 3, numero_rota: '101', valor_total: 480.50, data_checkin: '2024-07-22' },
            { id: 4, numero_rota: '103', valor_total: 600.00, data_checkin: '2024-07-23' },
            { id: 5, numero_rota: '102', valor_total: 510.00, data_checkin: '2024-07-24' },
            { id: 6, numero_rota: '101', valor_total: 460.00, data_checkin: '2024-07-25' },
        ].filter(d => d.data_checkin >= startDate && d.data_checkin <= endDate);
    };

    const processarRelatorio = (despesas) => {
        const gastosPorRota = despesas.reduce((acc, despesa) => {
            const { numero_rota, valor_total } = despesa;
            if (!acc[numero_rota]) {
                acc[numero_rota] = { total: 0, count: 0 };
            }
            acc[numero_rota].total += valor_total;
            acc[numero_rota].count++;
            return acc;
        }, {});

        return Object.entries(gastosPorRota).map(([rota, dados]) => ({
            rota,
            totalGasto: dados.total,
            quantidade: dados.count
        })).sort((a, b) => b.totalGasto - a.totalGasto);
    };

    const renderizarTabela = (dados) => {
        relatorioTableBody.innerHTML = '';
        if (dados.length === 0) {
            relatorioTableBody.innerHTML = '<tr><td colspan="3">Nenhum dado encontrado para o período selecionado.</td></tr>';
            return;
        }

        dados.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.rota}</td>
                <td>${formatCurrency(item.totalGasto)}</td>
                <td>
                    <button class="action-btn" title="Ver Detalhes"><i class="fas fa-eye"></i></button>
                </td>
            `;
            // Adicionar evento para ver detalhes (funcionalidade futura)
            tr.querySelector('.action-btn').addEventListener('click', () => {
                alert(`Detalhes para a Rota ${item.rota}:\n- Total de Lançamentos: ${item.quantidade}\n- Valor Total: ${formatCurrency(item.totalGasto)}`);
            });
            relatorioTableBody.appendChild(tr);
        });
    };

    formFiltro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dataInicio = document.getElementById('dataInicio').value;
        const dataFim = document.getElementById('dataFim').value;

        if (!dataInicio || !dataFim) {
            alert('Por favor, selecione as datas de início e fim.');
            return;
        }

        const despesas = await fetchDespesas(dataInicio, dataFim);
        reportData = processarRelatorio(despesas);
        
        const totalGeral = reportData.reduce((sum, item) => sum + item.totalGasto, 0);

        periodoRelatorioSpan.textContent = `${new Date(dataInicio + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(dataFim + 'T00:00:00').toLocaleDateString('pt-BR')}`;
        totalGeralRelatorioSpan.textContent = formatCurrency(totalGeral);

        renderizarTabela(reportData);
        resultadoRelatorio.style.display = 'block';
    });

    // --- Funções de Exportação ---

    btnExportarXLSX.addEventListener('click', () => {
        if (reportData.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }
        alert("Funcionalidade de exportar para XLSX a ser implementada.\nVocê precisará da biblioteca SheetJS (xlsx).");
        // Exemplo com SheetJS:
        // const worksheet = XLSX.utils.json_to_sheet(reportData.map(item => ({
        //     'Rota': item.rota,
        //     'Total Gasto': item.totalGasto
        // })));
        // const workbook = XLSX.utils.book_new();
        // XLSX.utils.book_append_sheet(workbook, worksheet, "RelatorioDespesas");
        // XLSX.writeFile(workbook, "Relatorio_Despesas.xlsx");
    });

    btnExportarPDF.addEventListener('click', () => {
        if (reportData.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }
        alert("Funcionalidade de exportar para PDF a ser implementada.\nVocê precisará das bibliotecas jsPDF e jspdf-autotable.");
        // Exemplo com jsPDF:
        // const doc = new jsPDF();
        // doc.text("Relatório de Despesas por Rota", 14, 16);
        // doc.autoTable({
        //     head: [['Rota', 'Total Gasto']],
        //     body: reportData.map(item => [item.rota, formatCurrency(item.totalGasto)]),
        //     startY: 20
        // });
        // doc.save('Relatorio_Despesas.pdf');
    });
});