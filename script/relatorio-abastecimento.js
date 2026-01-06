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
            const incluirAjuste = this.incluirAjusteCheckbox.checked;

            if (!dtIni || !dtFim) {
                alert('Por favor, selecione o período.');
                return;
            }

            this.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Buscando dados...</td></tr>';
            this.cardResultados.classList.remove('hidden');

            try {
                let query = supabaseClient
                    .from('abastecimentos')
                    .select('*, tanques(nome, tipo_combustivel)')
                    .gte('data', dtIni)
                    .lte('data', dtFim)
                    .order('data', { ascending: false });

                if (tanqueId) {
                    query = query.eq('tanque_id', tanqueId);
                }

                // Adiciona o filtro para excluir ajustes de estoque se o checkbox não estiver marcado
                if (!incluirAjuste) {
                    query = query.neq('numero_nota', 'AJUSTE DE ESTOQUE');
                }

                const { data, error } = await query;

                if (error) throw error;

                this.dadosRelatorio = data || [];
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
                this.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum registro encontrado no período.</td></tr>';
                this.totalLitrosEl.textContent = '0,00 L';
                this.totalValorEl.textContent = 'R$ 0,00';
                return;
            }

            this.dadosRelatorio.forEach(reg => {
                somaLitros += Number(reg.qtd_litros);
                somaValor += Number(reg.valor_total);

                const tr = document.createElement('tr');
                const dataFormatada = new Date(reg.data + 'T00:00:00').toLocaleDateString('pt-BR');
                const tanqueNome = reg.tanques ? reg.tanques.nome : 'N/A';
                const tipoCombustivel = reg.tanques ? reg.tanques.tipo_combustivel : '-';

                tr.innerHTML = `
                    <td>${dataFormatada}</td>
                    <td>${reg.numero_nota || '-'}</td>
                    <td>${tanqueNome}</td>
                    <td>${tipoCombustivel}</td>
                    <td>${Number(reg.qtd_litros).toLocaleString('pt-BR', {minimumFractionDigits: 2})} L</td>
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
                'Data': new Date(reg.data + 'T00:00:00').toLocaleDateString('pt-BR'),
                'Nº Nota': reg.numero_nota,
                'Tanque': reg.tanques ? reg.tanques.nome : 'N/A',
                'Combustível': reg.tanques ? reg.tanques.tipo_combustivel : '-',
                'Litros': Number(reg.qtd_litros),
                'Valor Unit.': Number(reg.valor_litro),
                'Valor Total': Number(reg.valor_total)
            }));

            const ws = XLSX.utils.json_to_sheet(dadosFormatados);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Abastecimentos");
            XLSX.writeFile(wb, "Relatorio_Abastecimentos.xlsx");
        },

        async exportPDF() {
            if (this.dadosRelatorio.length === 0) return alert('Sem dados para exportar.');

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Título
            doc.setFontSize(16);
            doc.text("Relatório de Abastecimentos", 14, 20);
            
            doc.setFontSize(10);
            doc.text(`Período: ${new Date(this.dataInicial.value + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(this.dataFinal.value + 'T00:00:00').toLocaleDateString('pt-BR')}`, 14, 28);

            const tableColumn = ["Data", "Nota", "Tanque", "Combustível", "Litros", "Vlr. Unit", "Total"];
            const tableRows = [];

            this.dadosRelatorio.forEach(reg => {
                const row = [
                    new Date(reg.data + 'T00:00:00').toLocaleDateString('pt-BR'),
                    reg.numero_nota,
                    reg.tanques ? reg.tanques.nome : 'N/A',
                    reg.tanques ? reg.tanques.tipo_combustivel : '-',
                    Number(reg.qtd_litros).toLocaleString('pt-BR', {minimumFractionDigits: 2}),
                    Number(reg.valor_litro).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}),
                    Number(reg.valor_total).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})
                ];
                tableRows.push(row);
            });

            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 35,
            });

            doc.save("Relatorio_Abastecimentos.pdf");
        },

        clearFilters() {
            this.form.reset();
            this.incluirAjusteCheckbox.checked = true;
            const hoje = new Date();
            const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            this.dataInicial.valueAsDate = primeiroDia;
            this.dataFinal.valueAsDate = hoje;
            this.cardResultados.classList.add('hidden');
        }
    };

    RelatorioUI.init();
});