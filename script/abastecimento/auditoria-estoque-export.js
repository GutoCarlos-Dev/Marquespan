function formatAuditoriaRows(rows, formatLitros) {
    return (rows || []).map(item => ({
        dataHora: new Date(item.data).toLocaleString('pt-BR'),
        usuario: item.usuario || '-',
        tanque: item.tanques?.nome || '-',
        combustivel: item.tanques?.tipo_combustivel || '-',
        estoqueAnterior: formatLitros(item.estoqueAnterior),
        estoqueAtual: formatLitros(item.estoqueAtual),
        diferenca: `${item.diferenca > 0 ? '+' : ''}${formatLitros(item.diferenca)}`
    }));
}

function getLogoBase64() {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = 'logo.png';
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg'));
        };
        img.onerror = () => resolve(null);
    });
}

export function exportarAuditoriaEstoqueXLSX({ rows, dataInicial, dataFinal, formatLitros, XLSX }) {
    const exportRows = formatAuditoriaRows(rows, formatLitros).map(item => ({
        'Data/Hora': item.dataHora,
        'Usuario': item.usuario,
        'Tanque': item.tanque,
        'Combustivel': item.combustivel,
        'Estoque Anterior (Litros)': item.estoqueAnterior,
        'Estoque Atual (Litros)': item.estoqueAtual,
        'Diferenca (Litros)': item.diferenca
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws['!cols'] = [
        { wch: 20 }, { wch: 24 }, { wch: 22 }, { wch: 18 },
        { wch: 24 }, { wch: 22 }, { wch: 18 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoria Estoque');
    XLSX.writeFile(wb, `Auditoria_Estoque_${dataInicial || 'inicio'}_a_${dataFinal || 'fim'}.xlsx`);
}

export async function exportarAuditoriaEstoquePDF({ rows, dataInicial, dataFinal, formatLitros }) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('Biblioteca PDF nao carregada.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    const logoBase64 = await getLogoBase64();

    if (logoBase64) {
        doc.addImage(logoBase64, 'JPEG', 14, 8, 40, 12);
    }

    doc.setFontSize(16);
    doc.setTextColor(0, 105, 55);
    doc.text('Auditoria de Ajustes de Estoque', logoBase64 ? 60 : 14, 15);

    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Periodo: ${dataInicial || ''} ate ${dataFinal || ''}`, logoBase64 ? 60 : 14, 22);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 283, 22, { align: 'right' });

    const tableRows = formatAuditoriaRows(rows, formatLitros);
    doc.autoTable({
        startY: 28,
        head: [[
            'Data/Hora',
            'Usuario',
            'Tanque',
            'Combustivel',
            'Estoque Anterior',
            'Estoque Atual',
            'Diferenca'
        ]],
        body: tableRows.map(item => [
            item.dataHora,
            item.usuario,
            item.tanque,
            item.combustivel,
            `${item.estoqueAnterior} L`,
            `${item.estoqueAtual} L`,
            `${item.diferenca} L`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [0, 105, 55], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 6) {
                const raw = String(data.cell.raw || '');
                if (raw.startsWith('+')) data.cell.styles.textColor = [25, 135, 84];
                else if (raw.startsWith('-')) data.cell.styles.textColor = [220, 53, 69];
            }
        }
    });

    doc.save(`Auditoria_Estoque_${dataInicial || 'inicio'}_a_${dataFinal || 'fim'}.pdf`);
}
