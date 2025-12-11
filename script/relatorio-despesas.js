import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const formFiltro = document.getElementById('filtro-despesas-form');
    const resultadosContainer = document.getElementById('resultados-container');
    const graficosContainer = document.getElementById('graficos-container');
    const tabelaResultadosBody = document.getElementById('tabela-resultados');
    const rotasSelect = document.getElementById('rotas');
    const btnExportarXLSX = document.getElementById('btnExportarXLSX');
    const btnExportarPDF = document.getElementById('btnExportarPDF');

    // Variáveis para armazenar as instâncias dos gráficos
    let graficoRotasInstance = null;
    let graficoHoteisInstance = null;

    let reportData = [];

    // Função para formatar moeda
    const formatCurrency = (value) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // Função para buscar dados para os filtros
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

    const fetchHoteis = async () => {
        const { data, error } = await supabaseClient
            .from('hoteis')
            .select('id, nome')
            .order('nome', { ascending: true });

        if (error) {
            console.error('Erro ao buscar hotéis:', error);
            return [];
        }
        return data;
    };

    // Função para buscar despesas do banco de dados
    const fetchDespesas = async (startDate, endDate, rotas, hotelId) => {
        let query = supabaseClient
            .from('despesas')
            .select(`
                data_checkin,
                valor_total,
                numero_rota,
                hoteis:hoteis(nome),
                funcionario1:funcionario!despesas_id_funcionario1_fkey(nome),
                funcionario2:funcionario!despesas_id_funcionario2_fkey(nome),
                obs:voucher
            `)
            .gte('data_checkin', startDate)
            .lte('data_checkin', endDate)
            .order('data_checkin', { ascending: false });

        if (rotas && rotas.length > 0) {
            query = query.in('numero_rota', rotas);
        }

        if (hotelId) {
            query = query.eq('id_hotel', hotelId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Erro ao buscar despesas:', error);
            return [];
        }
        return data;
    };

    const popularFiltros = async () => {
        const rotas = await fetchRotas();
        rotasSelect.innerHTML = '';
        rotas.forEach(rota => {
            const option = document.createElement('option');
            option.value = rota.numero;
            option.textContent = `Rota ${rota.numero}`;
            rotasSelect.appendChild(option);
        });

        const hoteis = await fetchHoteis();
        const hoteisList = document.getElementById('hoteisList');
        hoteisList.innerHTML = '';
        hoteis.forEach(hotel => {
            const option = document.createElement('option');
            option.value = hotel.nome;
            option.dataset.id = hotel.id;
            hoteisList.appendChild(option);
        });
    };

    // Função auxiliar para obter o ID de um datalist
    const getValueFromDatalist = (inputId) => {
        const input = document.getElementById(inputId);
        const datalistId = input.getAttribute('list');
        const datalist = document.getElementById(datalistId);
        const inputValue = input.value;

        for (const option of datalist.options) {
            if (option.value === inputValue) {
                return option.dataset.id; // Retorna o ID armazenado
            }
        }
        return null; // Retorna nulo se não encontrar correspondência
    };

    const renderizarTabela = (dados) => {
        const tfoot = tabelaResultadosBody.parentElement.querySelector('tfoot');
        tabelaResultadosBody.innerHTML = '';
        if (tfoot) tfoot.innerHTML = ''; // Limpa o rodapé a cada nova busca
        let totalGeral = 0;

        // Esconde os gráficos se não houver dados
        graficosContainer.style.display = 'none';

        if (dados.length === 0) {
            tabelaResultadosBody.innerHTML = '<tr><td colspan="6">Nenhuma despesa encontrada para os filtros selecionados.</td></tr>';
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
                <td>${item.hoteis?.nome || 'N/A'}</td>
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
                <td colspan="3"><strong>Total Geral</strong></td>
                <td><strong>${formatCurrency(totalGeral)}</strong></td>
                <td colspan="2"></td>
            </tr>
        `;

        // Mostra e renderiza os gráficos
        graficosContainer.style.display = 'block';
        renderizarGraficos(dados);
    };

    formFiltro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rotasSelecionadas = Array.from(rotasSelect.selectedOptions).map(opt => opt.value);
        const hotelId = getValueFromDatalist('hotel');
        const dataInicial = document.getElementById('data-inicial').value;
        const dataFinal = document.getElementById('data-final').value;

        if (!dataInicial || !dataFinal) {
            alert('Por favor, selecione as datas de início e fim.');
            return;
        }

        // Mostra um feedback de carregamento
        tabelaResultadosBody.innerHTML = '<tr><td colspan="6">Buscando...</td></tr>';
        graficosContainer.style.display = 'none'; // Esconde gráficos durante a busca
        resultadosContainer.style.display = 'block';

        const despesas = await fetchDespesas(dataInicial, dataFinal, rotasSelecionadas, hotelId);
        reportData = despesas; // Armazena os dados brutos para exportação

        renderizarTabela(reportData);
    });

    // --- Funções de Gráficos ---

    const renderizarGraficos = (dados) => {
        // 1. Gráfico de Despesas por Rota
        const despesasPorRota = dados.reduce((acc, item) => {
            const rota = item.numero_rota || 'Sem Rota';
            acc[rota] = (acc[rota] || 0) + item.valor_total;
            return acc;
        }, {});

        const ctxRota = document.getElementById('grafico-despesas-rota').getContext('2d');
        if (graficoRotasInstance) {
            graficoRotasInstance.destroy(); // Destrói o gráfico anterior para evitar sobreposição
        }
        graficoRotasInstance = new Chart(ctxRota, {
            type: 'bar',
            data: {
                labels: Object.keys(despesasPorRota),
                datasets: [{
                    label: 'Total Gasto (R$)',
                    data: Object.values(despesasPorRota),
                    backgroundColor: 'rgba(0, 86, 179, 0.7)',
                    borderColor: 'rgba(0, 86, 179, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });

        // 2. Gráfico de Top 5 Hotéis com Maiores Despesas
        const despesasPorHotel = dados.reduce((acc, item) => {
            const hotel = item.hoteis?.nome || 'Hotel não especificado';
            acc[hotel] = (acc[hotel] || 0) + item.valor_total;
            return acc;
        }, {});

        const top5Hoteis = Object.entries(despesasPorHotel)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        const ctxHotel = document.getElementById('grafico-despesas-hotel').getContext('2d');
        if (graficoHoteisInstance) {
            graficoHoteisInstance.destroy();
        }
        graficoHoteisInstance = new Chart(ctxHotel, {
            type: 'pie',
            data: {
                labels: top5Hoteis.map(([nome]) => nome),
                datasets: [{
                    label: 'Total Gasto (R$)',
                    data: top5Hoteis.map(([, valor]) => valor),
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 206, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)',
                    ],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top' } }
            }
        });
    };

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
                'Hotel': item.hoteis?.nome || 'N/A',
                'Valor': item.valor_total,
                'Funcionários': funcionarios,
                'Voucher': item.obs || ''
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
            'Hotel': '',
            'Valor': totalGeral,
            'Funcionários': '',
            'Voucher': ''
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);

        // Formata a coluna de valor como moeda
        worksheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 15 }, { wch: 40 }, { wch: 30 }];
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
            head: [['Data', 'Rota', 'Hotel', 'Valor', 'Funcionários', 'Voucher']],
            body: dataToExport.map(item => [item.Data, item.Rota, item.Hotel, formatCurrency(item.Valor), item.Funcionários, item.Voucher]),
            foot: [['Total Geral', '', '', formatCurrency(totalGeral), '', '']],
            startY: 20,
            headStyles: { fillColor: [0, 86, 179] }, // Azul do cabeçalho da tabela
            footStyles: { fillColor: [233, 236, 239], textColor: [52, 58, 64], fontStyle: 'bold' }
        });

        doc.save('Relatorio_de_Despesas.pdf');
    });

    // Carrega as rotas ao iniciar a página
    popularFiltros();
});