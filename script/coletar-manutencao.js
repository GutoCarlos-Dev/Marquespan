import { supabaseClient } from './supabase.js';

// --- Variáveis Globais ---
let currentReportData = []; // Armazena os dados da última busca para exportação

// --- Funções de Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    // Navegação por abas
    const painelBtns = document.querySelectorAll('#menu-coletar-manutencao .painel-btn');
    painelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const secaoId = btn.dataset.secao;
            document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
            document.getElementById(secaoId).classList.remove('hidden');
            painelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Adiciona listeners aos botões de exportação
    document.getElementById('btnExportarPDFServicos').addEventListener('click', () => exportPDF('servico'));
    document.getElementById('btnExportarPDFOficina').addEventListener('click', () => exportPDF('oficina'));

    // Adiciona listener ao botão de busca do relatório
    document.getElementById('btnBuscarRelatorio').addEventListener('click', buscarRelatorio);
});

/**
 * Busca os dados do relatório com base nos filtros da tela.
 * Esta é uma função de exemplo e precisa ser implementada com a lógica de filtro correta.
 */
async function buscarRelatorio() {
    alert("A lógica de busca principal ainda precisa ser implementada. Usando dados de exemplo para a exportação de PDF.");
    
    // Exemplo de como os dados seriam buscados e armazenados
    // const { data, error } = await supabaseClient.from('coletas_manutencao_checklist')...
    
    // Dados de exemplo para demonstrar a funcionalidade do PDF
    currentReportData = [
        { id: 1, coletas_manutencao_id: 101, item: 'TROCA DE OLEO', oficina: 'Oficina Central', valor: '150.50', data_hora: '2026-01-20T10:00:00' },
        { id: 2, coletas_manutencao_id: 102, item: 'ALINHAMENTO', oficina: 'Auto Center SP', valor: '80.00', data_hora: '2026-01-20T11:00:00' },
        { id: 3, coletas_manutencao_id: 103, item: 'TROCA DE OLEO', oficina: 'Oficina Central', valor: '160.00', data_hora: '2026-01-21T09:00:00' },
        { id: 4, coletas_manutencao_id: 104, item: 'FREIOS', oficina: 'Oficina Central', valor: '350.00', data_hora: '2026-01-21T14:00:00' },
        { id: 5, coletas_manutencao_id: 105, item: 'ALINHAMENTO', oficina: 'Auto Center SP', valor: '80.00', data_hora: '2026-01-22T15:00:00' },
    ];

    // Aqui você chamaria a função para renderizar a tabela com os dados
    // renderizarTabelaRelatorio(currentReportData);
    document.getElementById('contadorResultados').textContent = `(${currentReportData.length})`;
    alert(`Busca de exemplo concluída. ${currentReportData.length} registros encontrados. Agora você pode exportar o PDF.`);
}

/**
 * Exporta os dados do relatório para PDF, agrupados por serviço ou oficina.
 * @param {'servico' | 'oficina'} tipoRelatorio - O tipo de agrupamento para o relatório.
 */
function exportPDF(tipoRelatorio) {
    if (currentReportData.length === 0) {
        alert("Nenhum dado para exportar. Realize uma busca primeiro.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    // 1. Calcular valor total do filtro
    const valorTotalFiltro = currentReportData.reduce((sum, item) => {
        const valor = parseFloat(String(item.valor).replace(',', '.')) || 0;
        return sum + valor;
    }, 0);
    const valorTotalFormatado = valorTotalFiltro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    let columns, body, title;
    const hoje = new Date().toLocaleDateString('pt-BR');

    // Helper para agrupar dados
    const groupBy = (array, key) => {
        return array.reduce((result, currentValue) => {
            const groupKey = currentValue[key] || 'Não Informado';
            (result[groupKey] = result[groupKey] || []).push(currentValue);
            return result;
        }, {});
    };

    if (tipoRelatorio === 'servico') {
        title = 'Relatório de Manutenção por Serviços';
        const groupedByServico = groupBy(currentReportData, 'item');
        
        columns = ["Serviço", "Qtd.", "Valor Total"];
        body = Object.keys(groupedByServico).sort().map(servico => {
            const items = groupedByServico[servico];
            const qtd = items.length;
            const valor = items.reduce((acc, i) => acc + (parseFloat(String(i.valor).replace(',', '.')) || 0), 0);
            return [
                servico,
                qtd,
                valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            ];
        });

    } else if (tipoRelatorio === 'oficina') {
        title = 'Relatório de Manutenção por Oficina';
        const groupedByOficina = groupBy(currentReportData, 'oficina');

        columns = ["Oficina", "Qtd. Manutenções", "Valor Total"];
        body = Object.keys(groupedByOficina).sort().map(oficina => {
            const items = groupedByOficina[oficina];
            const qtd = new Set(items.map(i => i.coletas_manutencao_id)).size; 
            const valor = items.reduce((acc, i) => acc + (parseFloat(String(i.valor).replace(',', '.')) || 0), 0);
            return [
                oficina,
                qtd,
                valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            ];
        });
    }

    doc.autoTable({
        head: [columns],
        body: body,
        startY: 25,
        didDrawPage: function (data) {
            // Cabeçalho do Documento
            doc.setFontSize(18);
            doc.setTextColor(40);
            doc.text(title, data.settings.margin.left, 15);

            // Valor Total (canto superior direito)
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold'); // Negrito
            const text = `Valor Total do Filtro: ${valorTotalFormatado}`;
            const textWidth = doc.getStringUnitWidth(text) * doc.internal.getFontSize() / doc.internal.scaleFactor;
            const pageWidth = doc.internal.pageSize.getWidth();
            doc.text(text, pageWidth - data.settings.margin.right - textWidth, 15);
            doc.setFont(undefined, 'normal'); // Volta ao normal

            // Data de emissão no rodapé
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Emitido em: ${hoje}`, data.settings.margin.left, doc.internal.pageSize.getHeight() - 10);
        },
        headStyles: { fillColor: [0, 105, 55], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: { 2: { halign: 'right' } }
    });

    doc.save(`relatorio_${tipoRelatorio}_${new Date().toISOString().split('T')[0]}.pdf`);
}