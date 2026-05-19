import { buscarDadosRelatorio } from './relatorio-service.js';

const ITEM_COLORS = {
    ACESSORIOS: [255, 205, 210],
    'ALINHAMENTO / BALANCEAMENTO': [200, 230, 201],
    'AR-CONDICIONADO': [187, 222, 251],
    BORRACHARIA: [255, 249, 196],
    'ELETRICA INTERNA': [225, 190, 231],
    'ELETRICA / MECANICA - INTERNA': [225, 190, 231],
    'MECANICA EXTERNA': [178, 235, 242],
    'MECANICA - EXTERNA': [178, 235, 242],
    MOLEIRO: [255, 224, 178],
    TACOGRAFO: [209, 196, 233],
    'TAPEÇARIA': [197, 202, 233],
    'THERMO KING': [248, 187, 208],
    'VIDROS / FECHADURAS': [220, 220, 220],
    'SERVIÇOS_GERAIS': [207, 216, 220],
    CONCESSIONARIA: [255, 224, 130],
    ANKA: [197, 225, 165],
    TARRAXA: [179, 229, 252],
    USIMAC: [225, 190, 231],
    'LUCAS BAU': [255, 204, 188],
    IBIFURGO: [207, 216, 220],
    IBIPORAN: [207, 216, 220]
};

function getItemColor(item) {
    return ITEM_COLORS[item] || [238, 238, 238];
}

function getOfficeColor(name) {
    const colors = [
        [187, 222, 251],
        [255, 224, 178],
        [200, 230, 201],
        [255, 205, 210],
        [225, 190, 231],
        [178, 235, 242],
        [255, 249, 196],
        [248, 187, 208],
        [209, 196, 233],
        [215, 204, 200]
    ];

    if (!name || name === 'SEM OFICINA') return [220, 220, 220];

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
}

function ordenarDados(data, tipoAgrupamento, sortConfig) {
    const col = sortConfig.column;
    const dir = sortConfig.direction === 'asc' ? 1 : -1;

    data.sort((a, b) => {
        if (tipoAgrupamento === 'OFICINA') {
            const oficinaA = a.oficinas ? a.oficinas.nome : 'ZZZ';
            const oficinaB = b.oficinas ? b.oficinas.nome : 'ZZZ';
            if (oficinaA < oficinaB) return -1;
            if (oficinaA > oficinaB) return 1;
        } else {
            if (a.item < b.item) return -1;
            if (a.item > b.item) return 1;
        }

        let valA;
        let valB;

        if (col === 'data_hora') {
            valA = new Date(a.coletas_manutencao.data_hora);
            valB = new Date(b.coletas_manutencao.data_hora);
        } else if (['semana', 'placa', 'modelo'].includes(col)) {
            valA = a.coletas_manutencao[col];
            valB = b.coletas_manutencao[col];
        } else if (col === 'oficina') {
            valA = a.oficinas ? a.oficinas.nome : '';
            valB = b.oficinas ? b.oficinas.nome : '';
        } else {
            valA = a[col] || '';
            valB = b[col] || '';
        }

        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
}

function carregarLogoBase64() {
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
        img.onerror = () => {
            console.warn('Logo nao encontrado');
            resolve(null);
        };
    });
}

function montarTabela(data, tipoAgrupamento) {
    const tableBody = [];
    let currentGroup = null;

    data.forEach(row => {
        let groupValue;
        let groupColor;

        if (tipoAgrupamento === 'OFICINA') {
            groupValue = row.oficinas ? row.oficinas.nome : 'SEM OFICINA';
            groupColor = getOfficeColor(groupValue);
        } else {
            groupValue = row.item;
            groupColor = getItemColor(groupValue);
        }

        if (groupValue !== currentGroup) {
            currentGroup = groupValue;
            tableBody.push([{
                content: currentGroup,
                colSpan: 9,
                styles: {
                    fillColor: groupColor,
                    textColor: [0, 0, 0],
                    fontStyle: 'bold',
                    halign: 'center',
                    fontSize: 10
                }
            }]);
        }

        const coleta = row.coletas_manutencao;

        if (tipoAgrupamento === 'OFICINA') {
            tableBody.push([
                new Date(coleta.data_hora).toLocaleString('pt-BR'),
                coleta.placa,
                coleta.modelo || '-',
                row.item,
                row.status,
                row.detalhes || '',
                row.pecas_usadas || ''
            ]);
        } else {
            tableBody.push([
                new Date(coleta.data_hora).toLocaleString('pt-BR'),
                coleta.semana,
                coleta.placa,
                coleta.modelo || '-',
                coleta.km,
                coleta.usuario,
                row.status,
                row.detalhes || '',
                row.pecas_usadas || ''
            ]);
        }
    });

    tableBody.push([{
        content: `Total de Registros: ${data.length}`,
        colSpan: 9,
        styles: {
            fillColor: [220, 220, 220],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'right'
        }
    }]);

    return tableBody;
}

function desenharTabela(doc, data, tipoAgrupamento) {
    const tableHead = tipoAgrupamento === 'OFICINA'
        ? [['Data/Hora', 'Placa', 'Modelo', 'Item', 'Status', 'Detalhes', 'Peças']]
        : [['Data/Hora', 'Semana', 'Placa', 'Modelo', 'KM', 'Usuário', 'Status', 'Detalhes', 'Peças']];

    doc.autoTable({
        head: tableHead,
        body: montarTabela(data, tipoAgrupamento),
        startY: 45,
        headStyles: { fillColor: [0, 105, 55] },
        styles: { fontSize: 8 },
        columnStyles: {},
        willDrawCell(cellData) {
            const indexDetalhes = tipoAgrupamento === 'OFICINA' ? 5 : 7;

            if (cellData.section === 'body' && cellData.column.index === indexDetalhes) {
                const text = String(cellData.cell.raw || '');
                const regex = /(\( <-- FINALIZADO(?: ROTA)? \))/g;

                if (regex.test(text)) {
                    const parts = text.split(regex);
                    const cellWidth = cellData.cell.width - cellData.cell.padding('left') - cellData.cell.padding('right');
                    const startX = cellData.cell.x + cellData.cell.padding('left');
                    let cursorX = startX;
                    let cursorY = cellData.cell.y + cellData.cell.padding('top') + 3;
                    const lineHeight = 3.5;

                    doc.setFontSize(8);

                    parts.forEach(part => {
                        const isMarker = /(\( <-- FINALIZADO(?: ROTA)? \))/.test(part);
                        doc.setTextColor(isMarker ? '#ff0000' : '#000000');

                        const words = part.split(/(\s+)/);
                        words.forEach(word => {
                            const wordWidth = doc.getTextWidth(word);
                            if (cursorX + wordWidth > startX + cellWidth) {
                                cursorX = startX;
                                cursorY += lineHeight;
                            }
                            doc.text(word, cursorX, cursorY);
                            cursorX += wordWidth;
                        });
                    });
                    return false;
                }
            }
        }
    });
}

function adicionarRodape(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100);

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const dateText = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
        const pageText = `Página ${i} de ${pageCount}`;
        const textWidth = doc.getTextWidth(pageText);

        doc.text(dateText, 14, pageHeight - 10);
        doc.text(pageText, pageWidth - 14 - textWidth, pageHeight - 10);
    }
}

export async function exportarRelatorioPDF({
    tipoAgrupamento,
    usuarioLogado,
    filtros,
    sortConfig,
    oficinasMap
}) {
    if (!window.jspdf?.jsPDF) {
        throw new Error('Biblioteca jsPDF nao carregada.');
    }

    const data = await buscarDadosRelatorio({
        usuarioLogado,
        filtros,
        oficinasMap,
        incluirOficinas: true,
        filtroOficinaPorDetalhes: true
    });

    if (!data || data.length === 0) {
        return false;
    }

    ordenarDados(data, tipoAgrupamento, sortConfig);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });
    const logoBase64 = await carregarLogoBase64();

    if (logoBase64) {
        doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);
    }

    doc.setFontSize(18);
    const tituloRelatorio = tipoAgrupamento === 'OFICINA'
        ? 'Relatório de Manutenção por Oficina'
        : 'Relatório de Coleta de Manutenção';
    doc.text(tituloRelatorio, 14, 28);
    doc.setFontSize(10);
    doc.text(`Exportado por: ${usuarioLogado?.nome || 'Sistema'}`, 14, 34);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 39);

    desenharTabela(doc, data, tipoAgrupamento);
    adicionarRodape(doc);

    doc.save(`Relatorio_Manutencao_${new Date().toISOString().slice(0, 10)}.pdf`);
    return true;
}
