import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const formFiltro = document.getElementById('filtro-despesas-form');
    const resultadosContainer = document.getElementById('resultados-container');
    const tabelaResultadosBody = document.getElementById('tabela-resultados');
    const rotasList = document.getElementById('rotasList');
    const btnExportarXLSX = document.getElementById('btnExportarXLSX');
    const btnExportarPDF = document.getElementById('btnExportarPDF');

    let reportData = [];

    // Função para formatar moeda
    const formatCurrency = (value) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // Função para buscar rotas do banco de dados
    const fetchRotas = async () => {
        const { data, error } = await supabaseClient
            .from('rotas')
            .select('numero')
            .order('numero', { ascending: true });

        if (error) {
            console.error('Erro ao buscar rotas:', error);
            return [];
        }
        return data;
    };

    // Função para buscar despesas do banco de dados
    const fetchDespesas = async (startDate, endDate, rota) => {
        let query = supabaseClient
            .from('despesas')
            .select(`
                data_checkin,
                valor_total,
                numero_rota,
                funcionario1:funcionario!despesas_id_funcionario1_fkey(nome),
                funcionario2:funcionario!despesas_id_funcionario2_fkey(nome),
                obs:voucher
            `)
            .gte('data_checkin', startDate)
            .lte('data_checkin', endDate)
            .order('data_checkin', { ascending: false });

        if (rota) {
            query = query.eq('numero_rota', rota);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Erro ao buscar despesas:', error);
            return [];
        }
        return data;
    };

    const popularRotas = async () => {
        const rotas = await fetchRotas();
        rotasList.innerHTML = '';
        rotas.forEach(rota => {
            const option = document.createElement('option');
            option.value = rota.numero;
            rotasList.appendChild(option);
        });
    };

    const renderizarTabela = (dados) => {
        const tfoot = tabelaResultadosBody.parentElement.querySelector('tfoot');
        tabelaResultadosBody.innerHTML = '';
        if (tfoot) tfoot.innerHTML = ''; // Limpa o rodapé a cada nova busca
        let totalGeral = 0;

        if (dados.length === 0) {
            tabelaResultadosBody.innerHTML = '<tr><td colspan="5">Nenhuma despesa encontrada para os filtros selecionados.</td></tr>';
            if (tfoot) tfoot.style.display = 'none'; // Esconde o rodapé se não houver dados
            return;
        }

        dados.forEach(item => {
            totalGeral += item.valor_total;
            const tr = document.createElement('tr');

            // Formata os nomes dos funcionários para exibição
            const func1 = item.funcionario1?.nome || null;
            const func2 = item.funcionario2?.nome || null;
            let funcionariosDisplay = func1 || 'N/A';
            if (func1 && func2) {
                funcionariosDisplay = `<strong>${func1}</strong><br><small>${func2}</small>`;
            }

            tr.innerHTML = `
                <td>${new Date(item.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${item.numero_rota}</td>
                <td>${formatCurrency(item.valor_total)}</td>
                <td>${funcionariosDisplay}</td>
                <td>${item.obs || ''}</td>
            `;
            tabelaResultadosBody.appendChild(tr);
        });

        // Adiciona a linha de rodapé com o total
        if (tfoot) tfoot.style.display = 'table-footer-group'; // Garante que o rodapé seja exibido
        tfoot.innerHTML = `
            <tr>
                <td colspan="2"><strong>Total Geral</strong></td>
                <td><strong>${formatCurrency(totalGeral)}</strong></td>
                <td colspan="2"></td>
            </tr>
        `;
    };

    formFiltro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rota = document.getElementById('rota').value;
        const dataInicial = document.getElementById('data-inicial').value;
        const dataFinal = document.getElementById('data-final').value;

        if (!dataInicial || !dataFinal) {
            alert('Por favor, selecione as datas de início e fim.');
            return;
        }

        // Mostra um feedback de carregamento
        tabelaResultadosBody.innerHTML = '<tr><td colspan="5">Buscando...</td></tr>';
        resultadosContainer.style.display = 'block';

        const despesas = await fetchDespesas(dataInicial, dataFinal, rota);
        reportData = despesas; // Armazena os dados brutos para exportação

        renderizarTabela(reportData);
    });

    // --- Funções de Exportação ---

    const getExportData = () => {
        return reportData.map(item => {
            const func1 = item.funcionario1?.nome || '';
            const func2 = item.funcionario2?.nome || '';
            let funcionarios = func1;
            if (func1 && func2) {
                funcionarios = `${func1} / ${func2}`;
            }

            return {
                'Data': new Date(item.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR'),
                'Rota': item.numero_rota,
                'Valor': item.valor_total,
                'Funcionários': funcionarios,
                'Observação': item.obs || ''
            };
        });
    };

    btnExportarXLSX.addEventListener('click', () => {
        if (reportData.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }

        const dataToExport = getExportData();
        const totalGeral = reportData.reduce((sum, item) => sum + item.valor_total, 0);

        // Adiciona a linha de total ao final dos dados
        dataToExport.push({
            'Data': 'TOTAL GERAL',
            'Rota': '',
            'Valor': totalGeral,
            'Funcionários': '',
            'Observação': ''
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);

        // Formata a coluna de valor como moeda
        worksheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 40 }, { wch: 30 }];
        dataToExport.forEach((_, index) => {
            const cellRef = XLSX.utils.encode_cell({ r: index + 1, c: 2 }); // Coluna 'C' (Valor)
            if (worksheet[cellRef]) {
                worksheet[cellRef].t = 'n';
                worksheet[cellRef].z = 'R$ #,##0.00';
            }
        });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "RelatorioDespesas");
        XLSX.writeFile(workbook, "Relatorio_de_Despesas.xlsx");
    });

    btnExportarPDF.addEventListener('click', () => {
        if (reportData.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const dataToExport = getExportData();
        const totalGeral = reportData.reduce((sum, item) => sum + item.valor_total, 0);

        doc.text("Relatório de Despesas", 14, 16);
        doc.autoTable({
            head: [['Data', 'Rota', 'Valor', 'Funcionários', 'Observação']],
            body: dataToExport.map(item => [item.Data, item.Rota, formatCurrency(item.Valor), item.Funcionários, item.Observação]),
            foot: [['Total Geral', '', formatCurrency(totalGeral), '', '']],
            startY: 20,
            headStyles: { fillColor: [0, 86, 179] }, // Azul do cabeçalho da tabela
            footStyles: { fillColor: [233, 236, 239], textColor: [52, 58, 64], fontStyle: 'bold' }
        });

        doc.save('Relatorio_de_Despesas.pdf');
    });

    // Carrega as rotas ao iniciar a página
    popularRotas();
});