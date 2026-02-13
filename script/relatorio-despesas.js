import { supabaseClient } from './supabase.js';

const RelatorioDespesasUI = {
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.setDefaultDates();
        this.carregarRotas();
        this.carregarHoteis();
        this.carregarDados();
        this.filteredData = []; // Armazena dados filtrados para exportação
        this.chartHoteis = null;
        this.chartRotas = null;
        this.chartDespesasPorRota = null;
        this.chartTopHoteis = null;
        this.chartEvolucaoDiaria = null;
        this.chartTopFuncionarios = null;
        
        this.iniciarRolagemAutomatica();
    },

    cacheDOM() {
        this.formFiltros = document.getElementById('formFiltros');
        this.dataInicio = document.getElementById('dataInicio');
        this.dataFim = document.getElementById('dataFim');
        this.filtroRotaDisplay = document.getElementById('filtroRotaDisplay');
        this.filtroRotaOptions = document.getElementById('filtroRotaOptions');
        this.filtroRotaText = document.getElementById('filtroRotaText');
        this.filtroHotelDisplay = document.getElementById('filtroHotelDisplay');
        this.filtroHotelOptions = document.getElementById('filtroHotelOptions');
        this.filtroHotelText = document.getElementById('filtroHotelText');
        this.kpiCustoTotal = document.getElementById('kpiCustoTotal');
        this.kpiTotalDiarias = document.getElementById('kpiTotalDiarias');
        this.chartHoteisCanvas = document.getElementById('chartHoteis');
        this.chartRotasCanvas = document.getElementById('chartRotas');
        this.chartDespesasPorRotaCanvas = document.getElementById('chartDespesasPorRota');
        this.chartTopHoteisCanvas = document.getElementById('chartTopHoteis');
        this.chartEvolucaoDiariaCanvas = document.getElementById('chartEvolucaoDiaria');
        this.chartTopFuncionariosCanvas = document.getElementById('chartTopFuncionarios');
        
        this.btnExportarExcel = document.getElementById('btnExportarExcel');
        this.btnExportarPDF = document.getElementById('btnExportarPDF');
        this.totalQtd = document.getElementById('totalQtd');
        this.totalValor = document.getElementById('totalValor');
        this.tableBodyResultados = document.getElementById('tableBodyResultados');
    },

    bindEvents() {
        this.formFiltros.addEventListener('submit', (e) => {
            e.preventDefault();
            this.carregarDados();
        });
        this.btnExportarExcel?.addEventListener('click', () => this.exportarExcel());
        this.btnExportarPDF?.addEventListener('click', () => this.exportarPDF());

        // Eventos do Multiselect de Rotas
        if (this.filtroRotaDisplay) {
            this.filtroRotaDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                this.filtroRotaOptions.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!this.filtroRotaDisplay.contains(e.target) && !this.filtroRotaOptions.contains(e.target)) {
                    this.filtroRotaOptions.classList.add('hidden');
                }
            });

            this.filtroRotaOptions.addEventListener('change', () => {
                this.atualizarTextoRota();
            });
        }

        // Eventos do Multiselect de Hotéis
        if (this.filtroHotelDisplay) {
            this.filtroHotelDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                this.filtroHotelOptions.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!this.filtroHotelDisplay.contains(e.target) && !this.filtroHotelOptions.contains(e.target)) {
                    this.filtroHotelOptions.classList.add('hidden');
                }
            });

            this.filtroHotelOptions.addEventListener('change', () => {
                this.atualizarTextoHotel();
            });
        }
    },

    setDefaultDates() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        this.dataInicio.value = firstDay.toISOString().split('T')[0];
        this.dataFim.value = lastDay.toISOString().split('T')[0];
    },

    async carregarRotas() {
        try {
            const { data: rotas, error } = await supabaseClient
                .from('rotas')
                .select('numero')
                .order('numero', { ascending: true });

            if (error) throw error;

            this.filtroRotaOptions.innerHTML = '';
            
            // Container Sticky para busca e limpar
            const stickyContainer = document.createElement('div');
            stickyContainer.style.cssText = 'position: sticky; top: 0; background: white; z-index: 20; border-bottom: 1px solid #eee;';

            // Input de Busca
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Buscar rota...';
            searchInput.style.cssText = 'width: 100%; padding: 10px; border: none; border-bottom: 1px solid #eee; outline: none; box-sizing: border-box;';
            searchInput.onclick = (e) => e.stopPropagation();
            searchInput.addEventListener('input', (e) => {
                 const term = e.target.value.toLowerCase();
                 const options = this.filtroRotaOptions.querySelectorAll('label.custom-option');
                 options.forEach(opt => {
                     const text = opt.textContent.toLowerCase();
                     opt.style.display = text.includes(term) ? 'block' : 'none';
                 });
            });
            stickyContainer.appendChild(searchInput);

            // Botão para limpar seleção
            const btnLimpar = document.createElement('div');
            btnLimpar.className = 'custom-option';
            btnLimpar.style.cssText = 'color: #dc3545; font-weight: bold; text-align: center; cursor: pointer;';
            btnLimpar.textContent = 'Limpar Seleção';
            btnLimpar.onclick = (e) => {
                e.stopPropagation();
                this.filtroRotaOptions.querySelectorAll('.rota-checkbox').forEach(cb => cb.checked = false);
                this.atualizarTextoRota();
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
            };
            stickyContainer.appendChild(btnLimpar);
            
            this.filtroRotaOptions.appendChild(stickyContainer);

            if (rotas && rotas.length > 0) {
                rotas.forEach(r => {
                    const label = document.createElement('label');
                    label.className = 'custom-option';
                    label.innerHTML = `<input type="checkbox" class="rota-checkbox" value="${r.numero}" style="margin-right: 8px;"> ${r.numero}`;
                    this.filtroRotaOptions.appendChild(label);
                });
            }
        } catch (err) {
            console.error('Erro ao carregar rotas:', err);
        }
    },

    async carregarHoteis() {
        try {
            const { data: hoteis, error } = await supabaseClient
                .from('hoteis')
                .select('id, nome')
                .order('nome', { ascending: true });

            if (error) throw error;

            this.filtroHotelOptions.innerHTML = '';
            
            // Container Sticky para busca e limpar
            const stickyContainer = document.createElement('div');
            stickyContainer.style.cssText = 'position: sticky; top: 0; background: white; z-index: 20; border-bottom: 1px solid #eee;';

            // Input de Busca
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Buscar hotel...';
            searchInput.style.cssText = 'width: 100%; padding: 10px; border: none; border-bottom: 1px solid #eee; outline: none; box-sizing: border-box;';
            searchInput.onclick = (e) => e.stopPropagation();
            searchInput.addEventListener('input', (e) => {
                 const term = e.target.value.toLowerCase();
                 const options = this.filtroHotelOptions.querySelectorAll('label.custom-option');
                 options.forEach(opt => {
                     const text = opt.textContent.toLowerCase();
                     opt.style.display = text.includes(term) ? 'block' : 'none';
                 });
            });
            stickyContainer.appendChild(searchInput);

            // Botão para limpar seleção
            const btnLimpar = document.createElement('div');
            btnLimpar.className = 'custom-option';
            btnLimpar.style.cssText = 'color: #dc3545; font-weight: bold; text-align: center; cursor: pointer;';
            btnLimpar.textContent = 'Limpar Seleção';
            btnLimpar.onclick = (e) => {
                e.stopPropagation();
                this.filtroHotelOptions.querySelectorAll('.hotel-checkbox').forEach(cb => cb.checked = false);
                this.atualizarTextoHotel();
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
            };
            stickyContainer.appendChild(btnLimpar);
            
            this.filtroHotelOptions.appendChild(stickyContainer);

            if (hoteis && hoteis.length > 0) {
                hoteis.forEach(h => {
                    const label = document.createElement('label');
                    label.className = 'custom-option';
                    label.innerHTML = `<input type="checkbox" class="hotel-checkbox" value="${h.id}" style="margin-right: 8px;"> ${h.nome}`;
                    this.filtroHotelOptions.appendChild(label);
                });
            }
        } catch (err) {
            console.error('Erro ao carregar hotéis:', err);
        }
    },

    atualizarTextoRota() {
        const checkboxes = this.filtroRotaOptions.querySelectorAll('.rota-checkbox:checked');
        const selecionados = Array.from(checkboxes).map(cb => cb.value);
        
        if (selecionados.length === 0) {
            this.filtroRotaText.textContent = 'Todas';
        } else if (selecionados.length <= 3) {
            this.filtroRotaText.textContent = selecionados.join(', ');
        } else {
            this.filtroRotaText.textContent = `${selecionados.length} selecionadas`;
        }
    },

    atualizarTextoHotel() {
        const checkboxes = this.filtroHotelOptions.querySelectorAll('.hotel-checkbox:checked');
        const selecionados = Array.from(checkboxes).map(cb => cb.parentElement.textContent.trim());
        
        if (selecionados.length === 0) {
            this.filtroHotelText.textContent = 'Todos';
        } else if (selecionados.length <= 2) {
            this.filtroHotelText.textContent = selecionados.join(', ');
        } else {
            this.filtroHotelText.textContent = `${selecionados.length} selecionados`;
        }
    },

    async carregarDados() {
        try {
            this.tableBodyResultados.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';
            let query = supabaseClient
                .from('despesas')
                .select('*, hoteis(nome), funcionario1:id_funcionario1(nome_completo), funcionario2:id_funcionario2(nome_completo)')
                .gte('data_checkin', this.dataInicio.value)
                .lte('data_checkin', this.dataFim.value);

            // Filtro de Múltiplas Rotas
            const rotasSelecionadas = Array.from(this.filtroRotaOptions.querySelectorAll('.rota-checkbox:checked')).map(cb => cb.value);
            if (rotasSelecionadas.length > 0) {
                // Cria uma condição OR para buscar se a rota está presente no campo numero_rota
                // Ex: numero_rota.ilike.%101%,numero_rota.ilike.%102%
                const orCondition = rotasSelecionadas.map(r => `numero_rota.ilike.%${r}%`).join(',');
                query = query.or(orCondition);
            }
            
            // Filtro de Múltiplos Hotéis
            const hoteisSelecionados = Array.from(this.filtroHotelOptions.querySelectorAll('.hotel-checkbox:checked')).map(cb => cb.value);
            if (hoteisSelecionados.length > 0) {
                query = query.in('id_hotel', hoteisSelecionados);
            }

            const { data, error } = await query;
            if (error) throw error;

            this.filteredData = data;

            this.atualizarKPIs(this.filteredData);
            this.renderizarGraficos(this.filteredData);
            this.renderizarTabela(this.filteredData);
            
        } catch (err) {
            console.error('Erro ao carregar relatório:', err);
            alert('Erro ao carregar dados.');
        }
    },

    atualizarKPIs(data) {
        const totalCusto = data.reduce((acc, item) => acc + (item.valor_total || 0), 0);
        const totalDiarias = data.reduce((acc, item) => acc + (item.qtd_diarias || 0), 0);

        this.kpiCustoTotal.textContent = totalCusto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        this.kpiTotalDiarias.textContent = totalDiarias;
    },

    renderizarGraficos(data) {
        // Agrupar por Hotel
        const hotelMap = {};
        const rotaMap = {};

        data.forEach(item => {
            const hotel = item.hoteis?.nome || 'N/A';
            hotelMap[hotel] = (hotelMap[hotel] || 0) + (item.valor_total || 0);

            const rota = item.numero_rota || 'N/A';
            rotaMap[rota] = (rotaMap[rota] || 0) + (item.valor_total || 0);
        });

        this.criarGrafico(this.chartHoteisCanvas, 'pie', Object.keys(hotelMap), Object.values(hotelMap), 'Custos por Hotel');
        this.criarGrafico(this.chartRotasCanvas, 'bar', Object.keys(rotaMap), Object.values(rotaMap), 'Custos por Rota');
        this.renderChartDespesasPorRota(data);
        this.renderChartTopHoteis(data);
        this.renderChartEvolucaoDiaria(data);
        this.renderChartTopFuncionarios(data);
    },

    renderChartDespesasPorRota(data) {
        const rotaCounts = data.reduce((acc, item) => {
            const rota = item.numero_rota || 'N/A';
            acc[rota] = (acc[rota] || 0) + 1;
            return acc;
        }, {});
        const sortedRotas = Object.entries(rotaCounts).sort(([,a], [,b]) => b - a).slice(0, 15);
        this.criarGrafico(this.chartDespesasPorRotaCanvas, 'bar', sortedRotas.map(([k]) => k), sortedRotas.map(([,v]) => v), 'Qtd. Despesas');
    },

    renderChartTopHoteis(data) {
        const hotelCosts = data.reduce((acc, item) => {
            const hotel = item.hoteis?.nome || 'N/A';
            acc[hotel] = (acc[hotel] || 0) + (item.valor_total || 0);
            return acc;
        }, {});
        const sortedHoteis = Object.entries(hotelCosts).sort(([,a], [,b]) => b - a).slice(0, 5);
        this.criarGrafico(this.chartTopHoteisCanvas, 'doughnut', sortedHoteis.map(([k]) => k), sortedHoteis.map(([,v]) => v), 'Top 5 Hotéis');
    },

    renderChartEvolucaoDiaria(data) {
        const dailyCosts = data.reduce((acc, item) => {
            const date = item.data_checkin;
            if (date) acc[date] = (acc[date] || 0) + (item.valor_total || 0);
            return acc;
        }, {});
        const sortedDates = Object.keys(dailyCosts).sort((a, b) => new Date(a) - new Date(b));
        const values = sortedDates.map(date => dailyCosts[date]);
        this.criarGrafico(this.chartEvolucaoDiariaCanvas, 'line', sortedDates.map(d => new Date(d+'T00:00:00').toLocaleDateString('pt-BR')), values, 'Custo Diário');
    },

    renderChartTopFuncionarios(data) {
        const duplaCosts = data.reduce((acc, item) => {
            const func1 = item.funcionario1?.nome_completo;
            const func2 = item.funcionario2?.nome_completo;
            if (func1) {
                const key = func2 ? [func1, func2].sort().join(' & ') : func1;
                acc[key] = (acc[key] || 0) + (item.valor_total || 0);
            }
            return acc;
        }, {});
        const sortedDuplas = Object.entries(duplaCosts).sort(([,a], [,b]) => b - a).slice(0, 10);
        this.criarGrafico(this.chartTopFuncionariosCanvas, 'bar', sortedDuplas.map(([k]) => k), sortedDuplas.map(([,v]) => v), 'Top 10 Gastos', { indexAxis: 'y' });
    },

    criarGrafico(canvas, type, labels, values, label, options = {}) {
        // Destruir gráfico anterior se existir
        if (canvas.chartInstance) {
            canvas.chartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        canvas.chartInstance = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: values,
                    backgroundColor: ['#006937', '#28a745', '#007bff', '#17a2b8', '#ffc107', '#dc3545', '#6c757d'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                ...options
            }
        });
    },

    renderizarTabela(data) {
        this.tableBodyResultados.innerHTML = '';
        
        if (!data || data.length === 0) {
            this.tableBodyResultados.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
            this.totalQtd.textContent = '0';
            this.totalValor.textContent = 'R$ 0,00';
            return;
        }

        let totalValor = 0;

        data.forEach(item => {
            const tr = document.createElement('tr');
            const dataCheckin = new Date(item.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR');
            
            let funcionariosHtml = '';
            if (item.funcionario1?.nome_completo) {
                funcionariosHtml += `<strong>${item.funcionario1.nome_completo}</strong>`;
            }
            if (item.funcionario2?.nome_completo) {
                if (funcionariosHtml) funcionariosHtml += '<br>';
                funcionariosHtml += `<small style="color: #555;">${item.funcionario2.nome_completo}</small>`;
            }

            const valor = item.valor_total || 0;
            totalValor += valor;

            tr.innerHTML = `
                <td>${dataCheckin}</td>
                <td>${item.numero_rota || '-'}</td>
                <td>${item.hoteis?.nome || '-'}</td>
                <td>${funcionariosHtml || '-'}</td>
                <td>${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            `;
            this.tableBodyResultados.appendChild(tr);
        });

        this.totalQtd.textContent = data.length;
        this.totalValor.textContent = totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },

    exportarExcel() {
        if (this.filteredData.length === 0) return alert('Sem dados para exportar.');

        const dadosExportacao = this.filteredData.map(item => ({
            'Data Check-in': new Date(item.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR'),
            'Rota': item.numero_rota,
            'Hotel': item.hoteis?.nome,
            'Funcionários': [item.funcionario1?.nome_completo, item.funcionario2?.nome_completo].filter(Boolean).join(', '),
            'Valor Total': item.valor_total,
            'Qtd Diárias': item.qtd_diarias,
            'Nota Fiscal': item.nota_fiscal || ''
        }));

        const ws = XLSX.utils.json_to_sheet(dadosExportacao);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Despesas");
        XLSX.writeFile(wb, `Relatorio_Despesas_${new Date().toISOString().slice(0,10)}.xlsx`);
    },

    exportarPDF() {
        if (this.filteredData.length === 0) return alert('Sem dados para exportar.');
        if (!window.jspdf) return alert('Biblioteca PDF não carregada.');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text('Relatório de Despesas', 14, 22);
        doc.setFontSize(10);
        doc.text(`Período: ${new Date(this.dataInicio.value + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(this.dataFim.value + 'T00:00:00').toLocaleDateString('pt-BR')}`, 14, 30);

        const tableColumn = ["Data", "Rota", "Hotel", "Funcionários", "Valor"];
        const tableRows = this.filteredData.map(item => [
            new Date(item.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR'),
            item.numero_rota,
            item.hoteis?.nome || '-',
            { func1: item.funcionario1?.nome_completo || '', func2: item.funcionario2?.nome_completo || '' },
            (item.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        ]);

        // Adiciona linha de total
        const totalValor = this.filteredData.reduce((acc, item) => acc + (item.valor_total || 0), 0);
        tableRows.push(['', '', '', 'TOTAL GERAL', totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })]);

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [0, 105, 55] },
            columnStyles: { 
                4: { halign: 'right', fontStyle: 'bold', cellWidth: 40 } 
            },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 3) {
                    const raw = data.cell.raw;
                    if (raw && typeof raw === 'object') {
                        // Define o texto para cálculo de altura da linha, mas não para desenho
                        data.cell.text = raw.func1 + (raw.func2 ? '\n' + raw.func2 : '');
                    }
                }
            },
            willDrawCell: function(data) {
                if (data.section === 'body' && data.column.index === 3) {
                    const raw = data.cell.raw;
                    if (raw && typeof raw === 'object') {
                        // Limpa o texto para que o autoTable desenhe apenas as bordas/fundo
                        data.cell.text = '';
                    }
                }
            },
            didDrawCell: function(data) {
                if (data.section === 'body' && data.column.index === 3) {
                    const raw = data.cell.raw;
                    if (raw && typeof raw === 'object') {
                        const doc = data.doc;
                        const x = data.cell.x + data.cell.padding('left');
                        let y = data.cell.y + data.cell.padding('top') + 3;
                        
                        doc.setFont(undefined, 'bold');
                        doc.setFontSize(8);
                        doc.setTextColor(0, 0, 0);
                        doc.text(String(raw.func1), x, y);
                        
                        if (raw.func2) {
                            doc.setFont(undefined, 'normal');
                            doc.setFontSize(6); // Fonte menor para o segundo funcionário
                            doc.text(String(raw.func2), x, y + 3.5);
                        }
                    }
                }
            }
        });

        doc.save(`Relatorio_Despesas_${new Date().toISOString().slice(0,10)}.pdf`);
    },

    iniciarRolagemAutomatica() {
        const wrapper = document.querySelector('.charts-scroll-container');
        if (!wrapper) return;

        let direction = 1; // 1 = direita, -1 = esquerda
        const speed = 1; // Velocidade suave (pixels por frame)

        const step = () => {
            // Verifica se chegou ao fim ou ao início com tolerância
            if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 1) {
                direction = -1;
            } else if (wrapper.scrollLeft <= 0) {
                direction = 1;
            }
            wrapper.scrollLeft += speed * direction;
            requestAnimationFrame(step);
        };
        
        // Inicia o loop de animação
        requestAnimationFrame(step);

        // Pausar ao passar o mouse
        wrapper.addEventListener('mouseenter', () => direction = 0);
        wrapper.addEventListener('mouseleave', () => {
            // Recalcula direção baseado na posição atual para retomar
            if (wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 10) direction = -1;
            else direction = 1;
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    RelatorioDespesasUI.init();
});
