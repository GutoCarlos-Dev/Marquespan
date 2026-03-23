import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const RelatorioUI = {
        dadosRelatorio: [],
        sortConfig: {
            column: null,
            direction: 'asc'
        },

        init() {
            this.cache();
            this.bind();
            this.loadTanques();
            this.updateFilterOptions();
            
            // Define datas padrão (início do mês até hoje)
            const hoje = new Date();
            const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            this.dataInicial.valueAsDate = primeiroDia;
            this.dataFinal.valueAsDate = hoje;
        },

        cache() {
            this.form = document.getElementById('formFiltroAbastecimento');
            this.dataInicial = document.getElementById('dataInicial');
            this.dataFinal = document.getElementById('dataFinal');
            this.filtroTanque = document.getElementById('filtroTanque');
            this.filtroTipo = document.getElementById('filtroTipoMovimentacao');
            this.incluirAjusteCheckbox = document.getElementById('incluirAjusteEstoque');
            this.btnLimpar = document.getElementById('btnLimparFiltros');
            
            this.cardResultados = document.getElementById('cardResultados');
            this.tableBody = document.getElementById('tableBodyRelatorio');
            this.totalLitrosEl = document.getElementById('totalLitros');
            this.totalValorEl = document.getElementById('totalValor');
            
            this.btnExportarXLS = document.getElementById('btnExportarXLS');
            this.btnExportarPDF = document.getElementById('btnExportarPDF');
        },

        bind() {
            this.form.addEventListener('submit', this.handleSearch.bind(this));
            this.btnLimpar.addEventListener('click', this.clearFilters.bind(this));
            this.btnExportarXLS.addEventListener('click', this.exportXLS.bind(this));
            this.btnExportarPDF.addEventListener('click', this.exportPDF.bind(this));
            
            // Eventos de ordenação nos cabeçalhos
            document.querySelectorAll('th[data-sort]').forEach(th => {
                th.addEventListener('click', () => {
                    this.handleSort(th.dataset.sort);
                });
            });
        },

        async loadTanques() {
            try {
                const { data, error } = await supabaseClient
                    .from('tanques')
                    .select('id, nome, tipo_combustivel')
                    .order('nome');

                if (error) throw error;

                // Limpa opções e adiciona "Todos" como padrão
                this.filtroTanque.innerHTML = '<option value="">Todos</option>';

                data.forEach(tanque => {
                    const option = document.createElement('option');
                    option.value = tanque.id;
                    option.textContent = `${tanque.nome} (${tanque.tipo_combustivel})`;
                    this.filtroTanque.appendChild(option);
                });
            } catch (error) {
                console.error('Erro ao carregar tanques:', error);
            }
        },

        updateFilterOptions() {
            if (document.getElementById('filtroTipoDisplay')) return;
            const select = this.filtroTipo;
            if (!select) return;

            // Cria a estrutura do multiselect
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-multiselect';
            wrapper.style.position = 'relative';

            const display = document.createElement('div');
            display.id = 'filtroTipoDisplay';
            display.className = 'glass-input multiselect-display';
            display.style.cssText = 'cursor: pointer; display: flex; justify-content: space-between; align-items: center; height: 38px;';
            display.innerHTML = '<span id="filtroTipoText">Todos</span> <i class="fas fa-chevron-down"></i>';

            const optionsContainer = document.createElement('div');
            optionsContainer.id = 'filtroTipoOptions';
            optionsContainer.className = 'glass-dropdown hidden';
            optionsContainer.style.cssText = 'position: absolute; z-index: 1000; width: 100%; background-color: #fff; max-height: 200px; overflow-y: auto; border: 1px solid #ccc; border-radius: 4px; padding: 5px; top: 100%;';

            const options = [
                { value: 'ENTRADA', text: 'Entrada (Recebimento)' },
                { value: 'SAIDA', text: 'Abastecimento Interno (Saída)' },
                { value: 'EXTERNO', text: 'Abastecimento Externo' },
                { value: 'AJUSTE', text: 'Ajuste de Estoque' }
            ];

            options.forEach(opt => {
                const label = document.createElement('label');
                label.style.display = 'block';
                label.style.padding = '5px';
                label.style.cursor = 'pointer';
                label.innerHTML = `<input type="checkbox" class="tipo-checkbox" value="${opt.value}" style="margin-right: 8px;"> ${opt.text}`;
                optionsContainer.appendChild(label);
            });

            wrapper.appendChild(display);
            wrapper.appendChild(optionsContainer);
            select.parentNode.replaceChild(wrapper, select);

            this.filtroTipoDisplay = display;
            this.filtroTipoOptions = optionsContainer;
            this.filtroTipoText = document.getElementById('filtroTipoText');

            this.bindMultiselectEvents();
        },

        bindMultiselectEvents() {
            if (this.filtroTipoDisplay) {
                this.filtroTipoDisplay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.filtroTipoOptions.classList.toggle('hidden');
                });
                document.addEventListener('click', (e) => {
                    if (!this.filtroTipoDisplay.contains(e.target) && !this.filtroTipoOptions.contains(e.target)) {
                        this.filtroTipoOptions.classList.add('hidden');
                    }
                });
                this.filtroTipoOptions.addEventListener('change', () => {
                    this.updateMultiselectText();
                });
            }
        },

        updateMultiselectText() {
            const checked = Array.from(this.filtroTipoOptions.querySelectorAll('.tipo-checkbox:checked'));
            if (checked.length === 0) {
                this.filtroTipoText.textContent = 'Todos';
            } else if (checked.length <= 2) {
                this.filtroTipoText.textContent = checked.map(cb => cb.parentElement.textContent.trim()).join(', ');
            } else {
                this.filtroTipoText.textContent = `${checked.length} selecionados`;
            }
        },

        async handleSearch(e) {
            e.preventDefault();
            
            const dtIni = this.dataInicial.value;
            const dtFim = this.dataFinal.value;
            const tanqueId = this.filtroTanque.value;
            const tiposMov = this.filtroTipoOptions 
                ? Array.from(this.filtroTipoOptions.querySelectorAll('.tipo-checkbox:checked')).map(cb => cb.value)
                : [];
            const incluirAjuste = this.incluirAjusteCheckbox.checked;

            if (!dtIni || !dtFim) {
                alert('Por favor, selecione o período.');
                return;
            }

            this.tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Buscando dados...</td></tr>';
            this.cardResultados.classList.remove('hidden');

            try {
                let dadosEntradas = [];
                let dadosSaidas = [];
                let dadosExternos = [];

                // 1. Buscar Entradas e Ajustes (se o filtro permitir)
                if (tiposMov.length === 0 || tiposMov.includes('ENTRADA') || tiposMov.includes('AJUSTE')) {
                    let queryEntradas = supabaseClient
                        .from('abastecimentos')
                        .select('*, tanques(nome, tipo_combustivel)')
                        .gte('data', `${dtIni}T00:00:00`)
                        .lte('data', `${dtFim}T23:59:59`);

                    if (tanqueId) {
                        queryEntradas = queryEntradas.eq('tanque_id', tanqueId);
                    }

                    const wantEntrada = tiposMov.length === 0 || tiposMov.includes('ENTRADA');
                    const wantAjuste = tiposMov.length === 0 || tiposMov.includes('AJUSTE');

                    if (wantEntrada && !wantAjuste) {
                        queryEntradas = queryEntradas.neq('numero_nota', 'AJUSTE DE ESTOQUE');
                    } else if (!wantEntrada && wantAjuste) {
                        queryEntradas = queryEntradas.eq('numero_nota', 'AJUSTE DE ESTOQUE');
                    } else if (tiposMov.length === 0 && !incluirAjuste) {
                        // Se "Todos" selecionado, respeita o checkbox de incluir ajuste
                        queryEntradas = queryEntradas.neq('numero_nota', 'AJUSTE DE ESTOQUE');
                    }

                    const { data: resEntradas, error: errEntradas } = await queryEntradas;
                    if (errEntradas) throw errEntradas;
                    
                    // Normalizar dados de entrada
                    dadosEntradas = (resEntradas || []).map(e => ({
                        tipo: e.numero_nota === 'AJUSTE DE ESTOQUE' ? 'AJUSTE' : 'ENTRADA',
                        data_hora: e.data,
                        usuario: e.usuario,
                        placa: '-',
                        rota: '-',
                        km_atual: '-',
                        numero_nota: e.numero_nota,
                        tanque: e.tanques ? e.tanques.nome : 'N/A',
                        combustivel: e.tanques ? e.tanques.tipo_combustivel : '-',
                        litros: Number(e.qtd_litros),
                        valor_litro: Number(e.valor_litro),
                        valor_total: Number(e.valor_total)
                    }));
                }

                // 2. Buscar Saídas (se o filtro permitir)
                if (tiposMov.length === 0 || tiposMov.includes('SAIDA')) {
                    let querySaidas = supabaseClient
                        .from('saidas_combustivel')
                        .select('*, bicos(bombas(tanques(nome, tipo_combustivel)))')
                        .gte('data_hora', `${dtIni}T00:00:00`)
                        .lte('data_hora', `${dtFim}T23:59:59`);

                    // Filtro de tanque para saídas é mais complexo pois está aninhado
                    // Faremos o filtro no cliente para simplificar, já que o volume filtrado por data não deve ser gigante
                    
                    const { data: resSaidas, error: errSaidas } = await querySaidas;
                    if (errSaidas) throw errSaidas;

                    let saidasFiltradas = resSaidas || [];
                    if (tanqueId) {
                        saidasFiltradas = saidasFiltradas.filter(s => s.bicos?.bombas?.tanques?.id == tanqueId); // Comparação fraca int/string
                    }

                    // Normalizar dados de saída
                    dadosSaidas = saidasFiltradas.map(s => {
                        const tanqueInfo = s.bicos?.bombas?.tanques;
                        return {
                            tipo: 'SAIDA',
                            data_hora: s.data_hora,
                            usuario: s.usuario,
                            placa: s.veiculo_placa || '-',
                            rota: s.rota || s.motorista_nome || '-', // Fallback para motorista se rota for nula (legado)
                            km_atual: s.km_atual || '-',
                            numero_nota: '-',
                            tanque: tanqueInfo ? tanqueInfo.nome : 'N/A',
                            combustivel: tanqueInfo ? tanqueInfo.tipo_combustivel : '-',
                            litros: Number(s.qtd_litros), // Saída é negativa no estoque, mas positiva no relatório de consumo
                            valor_litro: 0, // Saída interna geralmente não tem valor unitário no momento
                            valor_total: 0
                        };
                    });
                }

                // 3. Buscar Abastecimentos Externos (se o filtro permitir)
                // Nota: Externo não tem 'tanque_id' da empresa, então ignoramos o filtro de tanque.
                if (tiposMov.length === 0 || tiposMov.includes('EXTERNO')) {
                    let queryExterno = supabaseClient
                        .from('abastecimento_externo')
                        .select('data_hora, usuario, veiculo_placa, rota, km_atual, litros, valor_unitario, valor_total, postos(razao_social)')
                        .gte('data_hora', `${dtIni}T00:00:00`)
                        .lte('data_hora', `${dtFim}T23:59:59`);

                    const { data: resExterno, error: errExterno } = await queryExterno;
                    if (errExterno) throw errExterno;

                    dadosExternos = (resExterno || []).map(e => ({
                        tipo: 'EXTERNO',
                        data_hora: e.data_hora,
                        usuario: e.usuario,
                        placa: e.veiculo_placa || '-',
                        rota: e.rota || '-',
                        km_atual: e.km_atual || '-',
                        numero_nota: '-', // Externo usa controle interno geralmente
                        tanque: e.postos ? e.postos.razao_social : 'Posto Externo', // Exibe o Posto no lugar do Tanque
                        combustivel: '-', 
                        litros: Number(e.litros),
                        valor_litro: Number(e.valor_unitario),
                        valor_total: Number(e.valor_total)
                    }));
                }

                // 4. Unificar e Ordenar
                this.dadosRelatorio = [...dadosEntradas, ...dadosSaidas, ...dadosExternos].sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));
                this.renderTable();

            } catch (error) {
                console.error('Erro na busca:', error);
                this.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Erro ao buscar dados.</td></tr>';
            }
        },

        handleSort(column) {
            // Alterna a direção se clicar na mesma coluna, senão define como ASC
            if (this.sortConfig.column === column) {
                this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortConfig.column = column;
                this.sortConfig.direction = 'asc';
            }

            this.updateSortIcons();
            this.sortData();
            this.renderTable();
        },

        sortData() {
            const { column, direction } = this.sortConfig;
            if (!column) return;

            const factor = direction === 'asc' ? 1 : -1;

            this.dadosRelatorio.sort((a, b) => {
                let valA = a[column];
                let valB = b[column];

                // Trata nulos e undefined
                if (valA === null || valA === undefined) valA = '';
                if (valB === null || valB === undefined) valB = '';

                // Comparação de strings (case insensitive) ou números
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return -1 * factor;
                if (valA > valB) return 1 * factor;
                return 0;
            });
        },

        updateSortIcons() {
            // Reseta todos os ícones
            document.querySelectorAll('th[data-sort] i').forEach(i => i.className = 'fas fa-sort');
            
            // Atualiza o ícone da coluna ativa
            const activeHeader = document.querySelector(`th[data-sort="${this.sortConfig.column}"] i`);
            if (activeHeader) {
                activeHeader.className = this.sortConfig.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        },

        renderTable() {
            this.tableBody.innerHTML = '';
            let somaLitros = 0;
            let somaValor = 0;

            if (this.dadosRelatorio.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="11" style="text-align:center;">Nenhum registro encontrado no período.</td></tr>';
                this.totalLitrosEl.textContent = '0,00 L';
                this.totalValorEl.textContent = 'R$ 0,00';
                return;
            }

            this.dadosRelatorio.forEach(reg => {
                // Para o totalizador, somamos tudo como valor absoluto de movimentação ou consideramos sinal?
                // Geralmente relatório de movimentação soma o volume movimentado.
                // Se for ajuste negativo, ele vem negativo do banco.
                somaLitros += Number(reg.litros);
                somaValor += Number(reg.valor_total);

                const tr = document.createElement('tr');
                const dataFormatada = new Date(reg.data_hora).toLocaleString('pt-BR');
                
                // Estilo para diferenciar tipos
                let tipoClass = '';
                if (reg.tipo === 'SAIDA') tipoClass = 'text-danger'; 
                else if (reg.tipo === 'ENTRADA') tipoClass = 'text-success';
                else if (reg.tipo === 'EXTERNO') tipoClass = 'text-warning'; // Laranja/Amarelo para Externo
                else tipoClass = 'text-primary';

                tr.innerHTML = `
                    <td>${dataFormatada}</td>
                    <td>${reg.usuario || '-'}</td>
                    <td>${reg.placa}</td>
                    <td>${reg.rota}</td>
                    <td>${reg.km_atual}</td>
                    <td>${reg.numero_nota}</td>
                    <td>${reg.tanque}</td>
                    <td>${reg.combustivel}</td>
                    <td class="font-bold ${tipoClass}" style="text-align: right;">${reg.tipo === 'EXTERNO' ? '' : (reg.tipo === 'SAIDA' ? '-' : '+')}${Number(reg.litros).toLocaleString('pt-BR', {minimumFractionDigits: 2})} L</td>
                    <td style="text-align: right;">${Number(reg.valor_litro).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
                    <td style="text-align: right;">${Number(reg.valor_total).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
                `;
                this.tableBody.appendChild(tr);
            });

            this.totalLitrosEl.textContent = somaLitros.toLocaleString('pt-BR', {minimumFractionDigits: 2}) + ' L';
            this.totalValorEl.textContent = somaValor.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        },

        exportXLS() {
            if (this.dadosRelatorio.length === 0) return alert('Sem dados para exportar.');

            const dadosFormatados = this.dadosRelatorio.map(reg => ({
                'Data/Hora': new Date(reg.data_hora).toLocaleString('pt-BR'),
                'Tipo': reg.tipo,
                'Usuário': reg.usuario || '-',
                'Placa': reg.placa,
                'Rota': reg.rota,
                'KM Atual': reg.km_atual,
                'Nº Nota': reg.numero_nota,
                'Tanque': reg.tanque,
                'Combustível': reg.combustivel,
                'Litros': Number(reg.litros),
                'Vlr. Litro': Number(reg.valor_litro),
                'Total': Number(reg.valor_total)
            }));

            // Calcular totais para adicionar ao final da planilha
            const totalLitros = this.dadosRelatorio.reduce((sum, reg) => sum + Number(reg.litros), 0);
            const totalValor = this.dadosRelatorio.reduce((sum, reg) => sum + Number(reg.valor_total), 0);

            dadosFormatados.push({
                'Data/Hora': 'TOTAIS GERAIS',
                'Tipo': '',
                'Usuário': '',
                'Placa': '',
                'Rota': '',
                'KM Atual': '',
                'Nº Nota': '',
                'Tanque': '',
                'Combustível': '',
                'Litros': totalLitros,
                'Vlr. Litro': '',
                'Total': totalValor
            });

            const ws = XLSX.utils.json_to_sheet(dadosFormatados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
            XLSX.writeFile(wb, "Relatorio_Abastecimentos.xlsx");
        },

        async exportPDF() {
            if (this.dadosRelatorio.length === 0) return alert('Sem dados para exportar.');

            const btn = this.btnExportarPDF;
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape' }); // Paisagem para caber mais colunas

                // 1. Carregar a imagem do logo e converter para JPEG com fundo branco
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

                // 2. Cabeçalho com Logo
                if (logoBase64) {
                    doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);
                }

                doc.setFontSize(18);
                doc.text("Relatório de Movimentação de Combustível", 14, 28);
                
                doc.setFontSize(10);
                doc.text(`Período: ${new Date(this.dataInicial.value + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(this.dataFinal.value + 'T00:00:00').toLocaleDateString('pt-BR')}`, 14, 34);

                const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
                const nomeUsuario = usuarioLogado?.nome || 'Sistema';
                doc.text(`Gerado por: ${nomeUsuario}`, 14, 39);

                const tableColumn = ["Data/Hora", "Usuário", "Placa", "Rota", "KM", "Nota", "Tanque", "Combustível", "Litros", "Vlr. Unit", "Total"];
                const tableRows = [];
                let totalLitros = 0;
                let totalValor = 0;

                this.dadosRelatorio.forEach(reg => {
                    totalLitros += Number(reg.litros);
                    totalValor += Number(reg.valor_total);

                    const row = [
                        new Date(reg.data_hora).toLocaleString('pt-BR'),
                        reg.usuario || '-',
                        reg.placa,
                        reg.rota,
                        reg.km_atual,
                        reg.numero_nota,
                        reg.tanque,
                        reg.combustivel,
                        Number(reg.litros).toLocaleString('pt-BR', {minimumFractionDigits: 2}),
                        Number(reg.valor_litro).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}),
                        Number(reg.valor_total).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})
                    ];
                    tableRows.push(row);
                });

                // Adiciona linha de total
                tableRows.push([
                    { content: 'TOTAL GERAL', colSpan: 8, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: totalLitros.toLocaleString('pt-BR', {minimumFractionDigits: 2}), styles: { fontStyle: 'bold' } },
                    '',
                    { content: totalValor.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}), styles: { fontStyle: 'bold' } }
                ]);

                doc.autoTable({
                    head: [tableColumn],
                    body: tableRows,
                    startY: 45,
                    headStyles: { fillColor: [0, 105, 55] }, // Verde Marquespan
                    styles: { fontSize: 8 },
                    columnStyles: {
                        0: { cellWidth: 25 }, // Data
                        8: { halign: 'right' }, // Litros
                        9: { halign: 'right' }, // Vlr Unit
                        10: { halign: 'right' } // Total
                    }
                });

                // Adicionar rodapé com numeração de páginas
                const pageCount = doc.internal.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFontSize(8);
                    doc.setTextColor(100); // Cinza escuro

                    const pageWidth = doc.internal.pageSize.getWidth();
                    const pageHeight = doc.internal.pageSize.getHeight();

                    // Texto da esquerda (Data de geração)
                    const dateText = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
                    doc.text(dateText, 14, pageHeight - 10);

                    // Texto da direita (Paginação)
                    const pageText = `Página ${i} de ${pageCount}`;
                    const textWidth = doc.getTextWidth(pageText);
                    doc.text(pageText, pageWidth - 14 - textWidth, pageHeight - 10);
                }

                doc.save(`Relatorio_Abastecimentos_${new Date().toISOString().slice(0,10)}.pdf`);
            } catch (err) {
                console.error('Erro ao exportar PDF:', err);
                alert('Erro ao gerar PDF: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        },

        clearFilters() {
            this.form.reset();
            this.incluirAjusteCheckbox.checked = true;
            if (this.filtroTipoOptions) {
                this.filtroTipoOptions.querySelectorAll('.tipo-checkbox').forEach(cb => cb.checked = false);
                this.updateMultiselectText();
            } else if (this.filtroTipo) {
                this.filtroTipo.value = "";
            }
            const hoje = new Date();
            const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            this.dataInicial.valueAsDate = primeiroDia;
            this.dataFinal.valueAsDate = hoje;
            this.cardResultados.classList.add('hidden');
        }
    };

    RelatorioUI.init();
});