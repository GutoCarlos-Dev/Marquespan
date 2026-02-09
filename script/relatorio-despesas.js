import { supabaseClient } from './supabase.js';

class SupabaseService {
    static async fetchRotas() {
        const { data, error } = await supabaseClient.from('rotas').select('numero').order('numero', { ascending: true });
        if (error) {
            console.error('Erro ao buscar rotas:', error);
            return [];
        }
        return data;
    }

    static async fetchHoteis() {
        const { data, error } = await supabaseClient.from('hoteis').select('id, nome').order('nome', { ascending: true });
        if (error) {
            console.error('Erro ao buscar hotéis:', error);
            return [];
        }
        return data;
    }

    static async fetchDespesas(startDate, endDate, rotas, hotelId, valorMinimo) {
        let query = supabaseClient
            .from('despesas')
            .select(`
                data_checkin, numero_rota, hoteis:hoteis(nome), qtd_diarias, valor_diaria, valor_energia, valor_total,
                funcionario1:funcionario!despesas_id_funcionario1_fkey(nome),
                funcionario2:funcionario!despesas_id_funcionario2_fkey(nome),
                nota_fiscal, tipo_quarto
            `)
            .gte('data_checkin', startDate)
            .lte('data_checkin', endDate)
            .order('data_checkin', { ascending: false });

        if (rotas && rotas.length > 0) query = query.in('numero_rota', rotas);
        if (hotelId) query = query.eq('id_hotel', hotelId);
        if (valorMinimo) query = query.gte('valor_diaria', valorMinimo);

        const { data, error } = await query;
        if (error) {
            console.error('Erro ao buscar despesas:', error);
            return [];
        }
        return data;
    }
}

const ReportUI = {
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.popularFiltros();
    },

    cacheDOM() {
        this.formFiltro = document.getElementById('filtro-despesas-form');
        this.btnBuscar = this.formFiltro.querySelector('button[type="submit"]');
        this.resultadosContainer = document.getElementById('resultados-container');
        this.graficosContainer = document.getElementById('graficos-container');
        this.tabelaResultadosBody = document.getElementById('tabela-resultados');
        this.rotasSelect = document.getElementById('rotas');
        this.hoteisList = document.getElementById('hoteisList');
        this.valorAcimaDeInput = document.getElementById('valor-acima-de');
        this.btnExportarXLSX = document.getElementById('btnExportarXLSX');
        this.btnExportarPDF = document.getElementById('btnExportarPDF');

        this.graficoRotasInstance = null;
        this.graficoHoteisInstance = null;
        this.graficoMensalInstance = null;
        this.graficoFuncionariosInstance = null;
        this.reportData = [];
        this.currentSort = { key: null, direction: 'asc' };
    },

    bindEvents() {
        this.formFiltro.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.valorAcimaDeInput.addEventListener('input', (e) => {
            this.formatCurrencyInput(e.target);
        });
        this.btnExportarXLSX.addEventListener('click', () => this.exportarXLSX());
        this.btnExportarPDF.addEventListener('click', () => this.exportarPDF());

        // Event listener para ordenação da tabela
        const thead = document.querySelector('.data-grid thead');
        if (thead) {
            thead.addEventListener('click', (e) => {
                const th = e.target.closest('th');
                if (th && th.dataset.key) {
                    this.handleSort(th.dataset.key);
                }
            });
        }
    },

    setLoading(button, isLoading) {
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || button.innerHTML;
        }
    },

    formatCurrency(value) {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },

    formatCurrencyInput(input) {
        let value = input.value.replace(/\D/g, '');
        if (value === '') {
            input.value = '';
            return;
        }
        const numberValue = parseFloat(value) / 100;
        input.value = numberValue.toLocaleString('pt-BR', {
            style: 'currency', currency: 'BRL'
        });
    },

    async popularFiltros() {
        const [rotas, hoteis] = await Promise.all([
            SupabaseService.fetchRotas(),
            SupabaseService.fetchHoteis()
        ]);

        this.rotasSelect.innerHTML = '';
        // Ordena as rotas numericamente, pois o banco de dados pode retornar uma ordenação de texto (ex: 1, 10, 2).
        rotas.sort((a, b) => {
            // Usa localeCompare com numeric: true para ordenar corretamente misturas de números e letras (ex: 3, 30, 283B)
            return String(a.numero).localeCompare(String(b.numero), 'pt-BR', { numeric: true });
        });
        rotas.forEach(rota => {
            const option = new Option(rota.numero, rota.numero);
            this.rotasSelect.appendChild(option);
        });

        this.hoteisList.innerHTML = '';
        hoteis.forEach(hotel => {
            const option = document.createElement('option');
            option.value = hotel.nome;
            option.dataset.id = hotel.id;
            this.hoteisList.appendChild(option);
        });
    },

    getValueFromDatalist(inputId) {
        const input = document.getElementById(inputId);
        const datalist = document.getElementById(input.getAttribute('list'));
        const inputValue = input.value;

        for (const option of datalist.options) {
            if (option.value === inputValue) return option.dataset.id;
        }
        return null;
    },

    async handleFormSubmit(e) {
        e.preventDefault();
        this.btnBuscar.dataset.originalText = this.btnBuscar.innerHTML;
        this.setLoading(this.btnBuscar, true);

        const rotasSelecionadas = Array.from(this.rotasSelect.selectedOptions).map(opt => opt.value);
        const hotelId = this.getValueFromDatalist('hotel');
        const dataInicial = document.getElementById('data-inicial').value;
        const dataFinal = document.getElementById('data-final').value;

        const valorAcimaDeString = this.valorAcimaDeInput.value;
        let valorAcimaDe = null;
        if (valorAcimaDeString) {
            valorAcimaDe = parseFloat(valorAcimaDeString.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || null;
        }

        if (!dataInicial || !dataFinal) {
            alert('Por favor, selecione as datas de início e fim.');
            this.setLoading(this.btnBuscar, false);
            return;
        }

        this.tabelaResultadosBody.innerHTML = '<tr><td colspan="8">Buscando...</td></tr>';
        this.graficosContainer.style.display = 'none';
        this.resultadosContainer.style.display = 'block';

        this.reportData = await SupabaseService.fetchDespesas(dataInicial, dataFinal, rotasSelecionadas, hotelId, valorAcimaDe);
        this.renderizarTabela(this.reportData);
        this.setLoading(this.btnBuscar, false);
    },

    handleSort(key) {
        if (this.currentSort.key === key) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.key = key;
            this.currentSort.direction = 'asc';
        }
        this.sortData();
        this.updateHeaderIcons();
        this.renderizarTabela(this.reportData);
    },

    sortData() {
        const key = this.currentSort.key;
        const direction = this.currentSort.direction === 'asc' ? 1 : -1;

        this.reportData.sort((a, b) => {
            let valA = this.getValueByKey(a, key);
            let valB = this.getValueByKey(b, key);

            if (valA === null || valA === undefined) valA = '';
            if (valB === null || valB === undefined) valB = '';

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return -1 * direction;
            if (valA > valB) return 1 * direction;
            return 0;
        });
    },

    getValueByKey(item, key) {
        switch (key) {
            case 'hotel': return item.hoteis?.nome;
            case 'funcionarios': return item.funcionario1?.nome;
            default: return item[key];
        }
    },

    updateHeaderIcons() {
        const ths = document.querySelectorAll('.data-grid th');
        ths.forEach(th => {
            const icon = th.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-sort'; // Reset
                if (th.dataset.key === this.currentSort.key) {
                    icon.className = this.currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
                }
            }
        });
    },

    renderizarTabela(dados) {
        const tfoot = this.tabelaResultadosBody.parentElement.querySelector('tfoot');
        this.tabelaResultadosBody.innerHTML = '';
        if (tfoot) tfoot.innerHTML = '';

        // Atualiza os totais no cabeçalho do card
        const totalRegistros = dados.length;
        const valorTotalGeral = dados.reduce((acc, item) => acc + (item.valor_total || 0), 0);

        const elTotalRegistros = document.getElementById('total-registros');
        const elValorTotalGeral = document.getElementById('valor-total-geral');
        if (elTotalRegistros) elTotalRegistros.textContent = totalRegistros;
        if (elValorTotalGeral) elValorTotalGeral.textContent = this.formatCurrency(valorTotalGeral);

        this.graficosContainer.style.display = 'none';

        if (dados.length === 0) {
            this.tabelaResultadosBody.innerHTML = '<tr><td colspan="9">Nenhuma despesa encontrada para os filtros selecionados.</td></tr>';
            if (tfoot) tfoot.style.display = 'none';
            return;
        }

        let totalGeral = 0;
        dados.forEach(item => {
            totalGeral += item.valor_total;
            const func1 = item.funcionario1?.nome;
            const func2 = item.funcionario2?.nome;
            const funcionariosDisplay = (func1 && func2) ? `<strong>${func1}</strong><br><small>${func2}</small>` : (func1 || 'N/A');

            const tr = document.createElement('tr');
            tr.title = `Tipo de Quarto: ${item.tipo_quarto || 'Não informado'}`;
            tr.innerHTML = `
                <td>${new Date(item.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${item.numero_rota}</td>
                <td>${item.hoteis?.nome || 'N/A'}</td>
                <td>${item.qtd_diarias || 'N/A'}</td>
                <td>${this.formatCurrency(item.valor_diaria)}</td>
                <td>${this.formatCurrency(item.valor_energia)}</td>
                <td>${this.formatCurrency(item.valor_total)}</td>
                <td>${funcionariosDisplay}</td>
                <td>${item.nota_fiscal || ''}</td>
            `;
            this.tabelaResultadosBody.appendChild(tr);
        });

        if (tfoot) {
            tfoot.style.display = 'table-footer-group';
            tfoot.innerHTML = `
                <tr>
                    <td colspan="6"><strong>Total Geral</strong></td>
                    <td><strong>${this.formatCurrency(totalGeral)}</strong></td>
                    <td colspan="2"></td>
                </tr>
            `;
        }

        this.graficosContainer.style.display = 'block';
        this.renderizarGraficos(dados);
    },

    renderizarGraficos(dados) {
        // Gráfico de Despesas por Rota
        const despesasPorRota = dados.reduce((acc, item) => {
            const rota = `Rota ${item.numero_rota || 'N/A'}`;
            acc[rota] = (acc[rota] || 0) + item.valor_total;
            return acc;
        }, {});

        if (this.graficoRotasInstance) this.graficoRotasInstance.destroy();
        this.graficoRotasInstance = new Chart(document.getElementById('grafico-despesas-rota').getContext('2d'), {
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
            options: { responsive: true, scales: { y: { beginAtZero: true } } }
        });

        // Gráfico de Top 5 Hotéis
        const despesasPorHotel = dados.reduce((acc, item) => {
            const hotel = item.hoteis?.nome || 'Hotel não especificado';
            acc[hotel] = (acc[hotel] || 0) + item.valor_total;
            return acc;
        }, {});

        const top5Hoteis = Object.entries(despesasPorHotel).sort(([, a], [, b]) => b - a).slice(0, 5);

        if (this.graficoHoteisInstance) this.graficoHoteisInstance.destroy();
        this.graficoHoteisInstance = new Chart(document.getElementById('grafico-despesas-hotel').getContext('2d'), {
            type: 'pie',
            data: {
                labels: top5Hoteis.map(([nome]) => nome),
                datasets: [{
                    label: 'Total Gasto (R$)',
                    data: top5Hoteis.map(([, valor]) => valor),
                    backgroundColor: ['#0056b3', '#007bff', '#4da2ff', '#99caff', '#cce5ff'],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'top' } } }
        });

        // Gráfico de Evolução Mensal
        this.renderizarGraficoMensal(dados);

        // Gráfico de Top 10 Funcionários
        this.renderizarGraficoFuncionarios(dados);
    },

    renderizarGraficoMensal(dados) {
        const canvas = document.getElementById('grafico-despesas-mensal');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const despesasPorMes = {};
        dados.forEach(item => {
            if (item.data_checkin) {
                const date = new Date(item.data_checkin + 'T00:00:00');
                // Chave YYYY-MM para ordenação correta
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                // Label para exibição
                const label = date.toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
                
                if (!despesasPorMes[key]) {
                    despesasPorMes[key] = { label: label, valor: 0 };
                }
                despesasPorMes[key].valor += item.valor_total;
            }
        });

        const sortedKeys = Object.keys(despesasPorMes).sort();
        const labels = sortedKeys.map(key => despesasPorMes[key].label);
        const data = sortedKeys.map(key => despesasPorMes[key].valor);

        if (this.graficoMensalInstance) this.graficoMensalInstance.destroy();

        this.graficoMensalInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Evolução Mensal',
                    data: data,
                    backgroundColor: 'rgba(255, 193, 7, 0.2)',
                    borderColor: 'rgba(255, 193, 7, 1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    },

    renderizarGraficoFuncionarios(dados) {
        const canvas = document.getElementById('grafico-despesas-funcionarios');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const despesasPorDupla = {};
        dados.forEach(item => {
            const func1 = item.funcionario1?.nome || 'N/A';
            const func2 = item.funcionario2?.nome || '';
            const dupla = func2 ? `${func1} & ${func2}` : func1;
            
            if (!despesasPorDupla[dupla]) {
                despesasPorDupla[dupla] = 0;
            }
            despesasPorDupla[dupla] += item.valor_total || 0;
        });

        const sortedDuplas = Object.entries(despesasPorDupla)
            .sort(([, valorA], [, valorB]) => valorB - valorA)
            .slice(0, 10);

        const labels = sortedDuplas.map(([nome]) => nome);
        const data = sortedDuplas.map(([, valor]) => valor);

        if (this.graficoFuncionariosInstance) this.graficoFuncionariosInstance.destroy();

        this.graficoFuncionariosInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Gasto',
                    data: data,
                    backgroundColor: 'rgba(220, 53, 69, 0.7)',
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // Gráfico de barras horizontais para facilitar a leitura dos nomes
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { beginAtZero: true } },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    },

    getExportData() {
        return this.reportData.map(item => {
            const func1 = item.funcionario1?.nome || '';
            const func2 = item.funcionario2?.nome || '';
            const funcionarios = (func1 && func2) ? `${func1} / ${func2}` : func1;

            return {
                'Data': new Date(item.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR'),
                'Rota': item.numero_rota,
                'Hotel': item.hoteis?.nome || 'N/A',
                'Qtd Diarias': item.qtd_diarias,
                'Valor Diaria': item.valor_diaria,
                'Valor Energia': item.valor_energia || 0,
                'Valor Total': item.valor_total,
                'Funcionários': funcionarios,
                'Nota Fiscal': item.nota_fiscal || ''
            };
        });
    },

    exportarXLSX() {
        if (this.reportData.length === 0) return alert("Não há dados para exportar.");

        const dataToExport = this.getExportData();
        const totalGeral = this.reportData.reduce((sum, item) => sum + item.valor_total, 0);

        dataToExport.push({
            'Data': 'TOTAL GERAL', 'Rota': '', 'Hotel': '', 'Qtd Diarias': '',
            'Valor Diaria': '', 'Valor Energia': '', 'Valor Total': totalGeral, 'Funcionários': '', 'Nota Fiscal': ''
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        worksheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 20 }];

        // Aplica formatação de moeda
        dataToExport.forEach((row, index) => {
            ['E', 'F', 'G'].forEach(col => { // Colunas Valor Diaria, Energia e Valor Total
                const cellRef = `${col}${index + 2}`;
                if (worksheet[cellRef] && typeof worksheet[cellRef].v === 'number') {
                    worksheet[cellRef].t = 'n';
                    worksheet[cellRef].z = 'R$ #,##0.00';
                }
            });
        });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "RelatorioDespesas");
        XLSX.writeFile(workbook, "Relatorio_de_Despesas.xlsx");
    },

    async exportarPDF() {
        if (this.reportData.length === 0) return alert("Não há dados para exportar.");

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });

        // 1. Carregar a imagem do logo e converter para JPEG com fundo branco (Correção do fundo preto)
        const getLogoBase64 = async () => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = 'logo.png';
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF'; // Fundo branco
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg'));
                };
                img.onerror = () => {
                    console.warn('Logo não encontrado');
                    resolve(null);
                };
            });
        };

        const logoBase64 = await getLogoBase64();

        // 2. Adiciona o logo (agora JPEG com fundo branco)
        if (logoBase64) {
            doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);
        }

        const dataToExport = this.getExportData();
        const totalGeral = this.reportData.reduce((sum, item) => sum + item.valor_total, 0);

        doc.setFontSize(18);
        doc.text("Relatório de Despesas", 14, 28); // Ajusta a posição Y do título para baixo do logo

        doc.autoTable({
            head: [['Data', 'Rota', 'Hotel', 'Qtd Diárias', 'Valor Diária', 'Valor Energia', 'Valor Total', 'Funcionários', 'Nota Fiscal']],
            body: dataToExport.map(item => [item.Data, item.Rota, item.Hotel, item['Qtd Diarias'], this.formatCurrency(item['Valor Diaria']), this.formatCurrency(item['Valor Energia']), this.formatCurrency(item['Valor Total']), item.Funcionários, item['Nota Fiscal']]),
            foot: [['Total Geral', '', '', '', '', '', this.formatCurrency(totalGeral), '', '']],
            startY: 35, // Ajusta o início da tabela
            showFoot: 'lastPage', // Correção: Total Geral apenas na última página
            styles: { fontSize: 8, cellPadding: 2 }, // Fonte reduzida para evitar quebras de linha
            headStyles: { fillColor: [0, 105, 55] }, // Cor verde da Marquespan
            footStyles: { fillColor: [233, 236, 239], textColor: [52, 58, 64], fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 22 }, // Data
                1: { cellWidth: 15 }, // Rota
                2: { cellWidth: 40 }, // Hotel
                3: { cellWidth: 15, halign: 'center' }, // Qtd Diarias
                4: { halign: 'right', cellWidth: 28 }, // Valor Diaria (Largura fixa para não quebrar)
                5: { halign: 'right', cellWidth: 28 }, // Valor Energia
                6: { halign: 'right', cellWidth: 32 }, // Valor Total (Largura fixa para não quebrar)
                7: { cellWidth: 'auto' }, // Funcionários (Flexível)
                8: { cellWidth: 25 }  // Nota Fiscal
            }
        });

        // Adicionar rodapé com paginação profissional
        const pageCount = doc.internal.getNumberOfPages();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const dateStr = new Date().toLocaleString('pt-BR');

        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            // Linha separadora sutil
            doc.setDrawColor(200, 200, 200);
            doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);

            doc.setFontSize(8);
            doc.setTextColor(100);

            // Data de geração à esquerda
            doc.text(`Gerado em: ${dateStr}`, 14, pageHeight - 10);

            // Paginação à direita
            doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
        }

        doc.save('Relatorio_de_Despesas.pdf');
    }
};

document.addEventListener('DOMContentLoaded', () => ReportUI.init());

document.addEventListener('DOMContentLoaded', () => {
    // Lógica do botão de limpar rotas
    const btnLimpar = document.getElementById('btnLimparRotas');
    if(btnLimpar) {
        btnLimpar.addEventListener('click', () => {
            const select = document.getElementById('rotas');
            if(select) select.selectedIndex = -1; // Limpa a seleção (equivale a Todas)
        });
    }

    // Pré-preencher datas
    const dataInicialInput = document.getElementById('data-inicial');
    const dataFinalInput = document.getElementById('data-final');
    
    if (dataInicialInput && dataFinalInput) {
        const hoje = new Date();
        const primeiroDiaDoAno = new Date(hoje.getFullYear(), 0, 1);

        // Função auxiliar para formatar data local YYYY-MM-DD
        // Evita problemas de fuso horário que o toISOString() pode causar
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        dataFinalInput.value = formatDate(hoje);
        dataInicialInput.value = formatDate(primeiroDiaDoAno);
    }
});
