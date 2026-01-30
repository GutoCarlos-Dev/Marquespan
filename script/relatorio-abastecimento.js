import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const RelatorioUI = {
        dadosRelatorio: [],

        init() {
            this.cache();
            this.bind();
            this.loadTanques();
            
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
        },

        async loadTanques() {
            try {
                const { data, error } = await supabaseClient
                    .from('tanques')
                    .select('id, nome, tipo_combustivel')
                    .order('nome');

                if (error) throw error;

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

        async handleSearch(e) {
            e.preventDefault();
            
            const dtIni = this.dataInicial.value;
            const dtFim = this.dataFinal.value;
            const tanqueId = this.filtroTanque.value;
            const tipoMov = this.filtroTipo.value;
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

                // 1. Buscar Entradas e Ajustes (se o filtro permitir)
                if (!tipoMov || tipoMov === 'ENTRADA' || tipoMov === 'AJUSTE') {
                    let queryEntradas = supabaseClient
                        .from('abastecimentos')
                        .select('*, tanques(nome, tipo_combustivel)')
                        .gte('data', `${dtIni}T00:00:00`)
                        .lte('data', `${dtFim}T23:59:59`);

                    if (tanqueId) {
                        queryEntradas = queryEntradas.eq('tanque_id', tanqueId);
                    }

                    if (tipoMov === 'ENTRADA') {
                        queryEntradas = queryEntradas.neq('numero_nota', 'AJUSTE DE ESTOQUE');
                    } else if (tipoMov === 'AJUSTE') {
                        queryEntradas = queryEntradas.eq('numero_nota', 'AJUSTE DE ESTOQUE');
                    } else if (!incluirAjuste) {
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
                if (!tipoMov || tipoMov === 'SAIDA') {
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

                // 3. Unificar e Ordenar
                this.dadosRelatorio = [...dadosEntradas, ...dadosSaidas].sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));
                this.renderTable();

            } catch (error) {
                console.error('Erro na busca:', error);
                this.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Erro ao buscar dados.</td></tr>';
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
                let rowClass = '';
                if (reg.tipo === 'SAIDA') rowClass = 'color: #dc3545;'; // Vermelho
                else if (reg.tipo === 'ENTRADA') rowClass = 'color: #28a745;'; // Verde
                else rowClass = 'color: #007bff;'; // Azul (Ajuste)

                tr.innerHTML = `
                    <td>${dataFormatada}</td>
                    <td>${reg.usuario || '-'}</td>
                    <td>${reg.placa}</td>
                    <td>${reg.rota}</td>
                    <td>${reg.km_atual}</td>
                    <td>${reg.numero_nota}</td>
                    <td>${reg.tanque}</td>
                    <td>${reg.combustivel}</td>
                    <td style="font-weight:bold; ${rowClass}">${Number(reg.litros).toLocaleString('pt-BR', {minimumFractionDigits: 2})} L</td>
                    <td>${Number(reg.valor_litro).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
                    <td>${Number(reg.valor_total).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
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
                'Usuário': reg.usuario,
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

            const ws = XLSX.utils.json_to_sheet(dadosFormatados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Abastecimentos");
            XLSX.writeFile(wb, "Relatorio_Abastecimentos.xlsx");
        },

        async exportPDF() {
            if (this.dadosRelatorio.length === 0) return alert('Sem dados para exportar.');

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape' }); // Paisagem para caber mais colunas

            // Título
            doc.setFontSize(16);
            doc.text("Relatório de Movimentação de Combustível", 14, 20);
            
            doc.setFontSize(10);
            doc.text(`Período: ${new Date(this.dataInicial.value + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(this.dataFinal.value + 'T00:00:00').toLocaleDateString('pt-BR')}`, 14, 28);

            const tableColumn = ["Data/Hora", "Usuário", "Placa", "Rota", "KM", "Nota", "Tanque", "Combustível", "Litros", "Vlr. Unit", "Total"];
            const tableRows = [];

            this.dadosRelatorio.forEach(reg => {
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

            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 35,
                styles: { fontSize: 8 } // Fonte menor para caber tudo
            });

            doc.save("Relatorio_Abastecimentos.pdf");
        },

        clearFilters() {
            this.form.reset();
            this.incluirAjusteCheckbox.checked = true;
            this.filtroTipo.value = "";
            const hoje = new Date();
            const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            this.dataInicial.valueAsDate = primeiroDia;
            this.dataFinal.valueAsDate = hoje;
            this.cardResultados.classList.add('hidden');
        }
    };

    RelatorioUI.init();
});