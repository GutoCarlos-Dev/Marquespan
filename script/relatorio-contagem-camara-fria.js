import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const RelatorioContagemCamaraFria = {
        filialRestrita: '',
        acessoGlobal: true,
        fabricasCache: [],
        produtosCache: [],
        resumoRows: [],
        detalheRows: [],

        async init() {
            this.cache();
            this.bind();
            this.aplicarRestricaoFilial();
            await Promise.all([this.loadFiliais(), this.loadFabricas(), this.loadProdutos()]);
            await this.carregarRelatorio();
        },

        cache() {
            this.filialSelect = document.getElementById('relatorioContagemFilial');
            this.semanaInput = document.getElementById('relatorioContagemSemana');
            this.fabricaSelect = document.getElementById('relatorioContagemFabrica');
            this.produtoSelect = document.getElementById('relatorioContagemProduto');
            this.statusSelect = document.getElementById('relatorioContagemStatus');
            this.btnFiltrar = document.getElementById('btnFiltrarRelatorioContagem');
            this.btnLimpar = document.getElementById('btnLimparRelatorioContagem');
            this.btnExcel = document.getElementById('btnExportarRelatorioContagemExcel');
            this.btnPDF = document.getElementById('btnExportarRelatorioContagemPDF');
            this.resumoBody = document.getElementById('relatorioResumoBody');
            this.detalheBody = document.getElementById('relatorioDetalheBody');
            this.resumoCount = document.getElementById('relatorioResumoCount');
            this.detalheCount = document.getElementById('relatorioDetalheCount');
            this.kpiCaixas = document.getElementById('relatorioKpiCaixas');
            this.kpiPeso = document.getElementById('relatorioKpiPeso');
            this.kpiProdutos = document.getElementById('relatorioKpiProdutos');
            this.kpiContagens = document.getElementById('relatorioKpiContagens');
        },

        bind() {
            this.btnFiltrar.addEventListener('click', () => this.carregarRelatorio());
            this.btnLimpar.addEventListener('click', () => this.limparFiltros());
            this.btnExcel.addEventListener('click', () => this.exportarExcel());
            this.btnPDF.addEventListener('click', () => this.exportarPDF());
            [this.filialSelect, this.semanaInput, this.fabricaSelect, this.produtoSelect, this.statusSelect].forEach(input => {
                input.addEventListener('change', () => this.carregarRelatorio());
            });
        },

        aplicarRestricaoFilial() {
            const usuario = this.getUsuarioLogado();
            const nivel = String(usuario?.nivel || '').trim().toLowerCase();
            this.acessoGlobal = ['administrador', 'gerencia'].includes(nivel) || !String(usuario?.filial || '').trim();
            this.filialRestrita = this.acessoGlobal ? '' : String(usuario.filial).trim();
        },

        async loadFiliais() {
            try {
                const { data, error } = await supabaseClient
                    .from('filiais')
                    .select('nome, sigla')
                    .order('nome');
                if (error) throw error;

                this.filialSelect.innerHTML = '<option value="">Todas</option>'
                    + (data || []).map(f => {
                        const value = this.escapeHtml(f.sigla || f.nome);
                        const label = this.escapeHtml(f.sigla ? `${f.nome} (${f.sigla})` : f.nome);
                        return `<option value="${value}">${label}</option>`;
                    }).join('');

                if (this.filialRestrita) {
                    if (!Array.from(this.filialSelect.options).some(option => option.value === this.filialRestrita)) {
                        this.filialSelect.add(new Option(this.filialRestrita, this.filialRestrita));
                    }
                    this.filialSelect.value = this.filialRestrita;
                    this.filialSelect.disabled = true;
                }
            } catch (error) {
                console.error('Erro ao carregar filiais:', error);
            }
        },

        async loadFabricas() {
            try {
                const { data, error } = await supabaseClient
                    .from('fabricas_camara_fria')
                    .select('id, nome')
                    .eq('ativo', true)
                    .order('nome');
                if (error) throw error;

                this.fabricasCache = data || [];
                this.fabricaSelect.innerHTML = '<option value="">Todas</option>'
                    + this.fabricasCache.map(f => `<option value="${f.id}">${this.escapeHtml(f.nome)}</option>`).join('');
            } catch (error) {
                console.error('Erro ao carregar fabricas:', error);
            }
        },

        async loadProdutos() {
            try {
                const { data, error } = await supabaseClient
                    .from('produtos_camara_fria')
                    .select('id, codigo, nome, tipo, filial')
                    .eq('ativo', true)
                    .order('nome');
                if (error) throw error;

                this.produtosCache = data || [];
                this.produtoSelect.innerHTML = '<option value="">Todos</option>'
                    + this.produtosCache.map(produto => {
                        const codigo = produto.codigo ? `${produto.codigo} - ` : '';
                        return `<option value="${produto.id}">${this.escapeHtml(codigo + produto.nome)}</option>`;
                    }).join('');
            } catch (error) {
                console.error('Erro ao carregar produtos:', error);
            }
        },

        async carregarRelatorio() {
            this.setLoading(true);
            try {
                const contagens = await this.buscarContagens();
                if (contagens.length === 0) {
                    this.resumoRows = [];
                    this.detalheRows = [];
                    this.renderResumo();
                    this.renderDetalhe();
                    this.renderKPIs();
                    return;
                }

                const itens = await this.buscarItens(contagens.map(contagem => contagem.id));
                const contagensPorId = new Map(contagens.map(contagem => [String(contagem.id), contagem]));
                this.detalheRows = itens.map(item => this.montarDetalhe(item, contagensPorId.get(String(item.contagem_id))))
                    .filter(Boolean)
                    .sort((a, b) => a.produtoNome.localeCompare(b.produtoNome) || a.semana.localeCompare(b.semana));
                this.resumoRows = this.montarResumo(this.detalheRows);

                this.renderResumo();
                this.renderDetalhe();
                this.renderKPIs();
            } catch (error) {
                console.error('Erro ao carregar relatorio de contagem:', error);
                alert('Erro ao carregar relatorio: ' + error.message);
            } finally {
                this.setLoading(false);
            }
        },

        async buscarContagens() {
            let query = supabaseClient
                .from('contagens_camara_fria')
                .select('id, filial, semana, fabrica_id, funcionario, status, updated_at, fabricas_camara_fria(nome)')
                .order('semana', { ascending: false });

            if (this.filialSelect.value) query = query.eq('filial', this.filialSelect.value);
            if (this.semanaInput.value) query = query.eq('semana', this.semanaInput.value);
            if (this.fabricaSelect.value) query = query.eq('fabrica_id', this.fabricaSelect.value);
            if (this.statusSelect.value) query = query.eq('status', this.statusSelect.value);

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },

        async buscarItens(contagemIds) {
            let query = supabaseClient
                .from('contagem_camara_fria_itens')
                .select('contagem_id, quantidade_caixas, observacao, produtos_camara_fria(id, codigo, nome, tipo, peso_caixa, caixas_por_palete, filial)')
                .in('contagem_id', contagemIds)
                .gt('quantidade_caixas', 0);

            if (this.produtoSelect.value) query = query.eq('produto_id', this.produtoSelect.value);

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },

        montarDetalhe(item, contagem) {
            if (!contagem || !item.produtos_camara_fria) return null;
            const produto = item.produtos_camara_fria;
            const caixas = Number(item.quantidade_caixas) || 0;
            const pesoCaixa = Number(produto.peso_caixa) || 0;
            const paletes = this.calcularPaletesPorCaixas(caixas, produto.caixas_por_palete);
            return {
                filial: contagem.filial || '-',
                semana: contagem.semana || '-',
                semanaDisplay: this.formatSemanaDisplay(contagem.semana),
                fabrica: contagem.fabricas_camara_fria?.nome || '-',
                status: contagem.status || '-',
                funcionario: contagem.funcionario || '-',
                updatedAt: contagem.updated_at,
                produtoId: produto.id,
                produtoCodigo: produto.codigo || '-',
                produtoNome: produto.nome || '-',
                produtoTipo: produto.tipo || '-',
                produtoFilial: produto.filial || 'TODAS',
                paletes,
                caixas,
                pesoTotal: caixas * pesoCaixa
            };
        },

        montarResumo(rows) {
            const mapa = new Map();
            rows.forEach(row => {
                const key = String(row.produtoId);
                if (!mapa.has(key)) {
                    mapa.set(key, {
                        produtoCodigo: row.produtoCodigo,
                        produtoNome: row.produtoNome,
                        produtoTipo: row.produtoTipo,
                        produtoFilial: row.produtoFilial,
                        paletes: 0,
                        caixas: 0,
                        pesoTotal: 0,
                        contagens: new Set()
                    });
                }
                const item = mapa.get(key);
                item.paletes += row.paletes;
                item.caixas += row.caixas;
                item.pesoTotal += row.pesoTotal;
                item.contagens.add(`${row.filial}|${row.semana}|${row.fabrica}`);
            });

            return Array.from(mapa.values())
                .map(item => ({ ...item, totalContagens: item.contagens.size }))
                .sort((a, b) => b.caixas - a.caixas || a.produtoNome.localeCompare(b.produtoNome));
        },

        renderResumo() {
            this.resumoCount.textContent = `${this.resumoRows.length} produto${this.resumoRows.length === 1 ? '' : 's'}`;
            if (this.resumoRows.length === 0) {
                this.resumoBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum produto encontrado para os filtros.</td></tr>';
                return;
            }

            this.resumoBody.innerHTML = this.resumoRows.map(row => `
                <tr>
                    <td>${this.escapeHtml(row.produtoCodigo)}</td>
                    <td><strong>${this.escapeHtml(row.produtoNome)}</strong></td>
                    <td>${this.escapeHtml(row.produtoTipo)}</td>
                    <td>${this.escapeHtml(row.produtoFilial)}</td>
                    <td class="relatorio-numero">${row.caixas}</td>
                    <td class="relatorio-numero">${this.formatPeso(row.pesoTotal)} KG</td>
                    <td class="relatorio-numero">${row.totalContagens}</td>
                </tr>
            `).join('');
        },

        renderDetalhe() {
            this.detalheCount.textContent = `${this.detalheRows.length} registro${this.detalheRows.length === 1 ? '' : 's'}`;
            if (this.detalheRows.length === 0) {
                this.detalheBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum detalhe encontrado.</td></tr>';
                return;
            }

            this.detalheBody.innerHTML = this.detalheRows.map(row => `
                <tr>
                    <td>${this.escapeHtml(row.filial)}</td>
                    <td>${this.escapeHtml(row.semanaDisplay)}</td>
                    <td>${this.escapeHtml(row.fabrica)}</td>
                    <td><span class="relatorio-status ${row.status === 'FINALIZADA' ? 'finalizada' : 'em-andamento'}">${row.status === 'FINALIZADA' ? 'Finalizada' : 'Em andamento'}</span></td>
                    <td>
                        <strong>${this.escapeHtml(row.produtoNome)}</strong>
                        <div class="produto-meta">${this.escapeHtml(row.produtoCodigo)} | ${this.escapeHtml(row.produtoTipo)}</div>
                    </td>
                    <td class="relatorio-numero">${row.caixas}</td>
                    <td class="relatorio-numero">${this.formatPeso(row.pesoTotal)} KG</td>
                    <td>${this.escapeHtml(row.funcionario)}</td>
                    <td>${this.formatDateTime(row.updatedAt)}</td>
                </tr>
            `).join('');
        },

        renderKPIs() {
            const totalCaixas = this.resumoRows.reduce((acc, row) => acc + row.caixas, 0);
            const totalPaletes = this.resumoRows.reduce((acc, row) => acc + row.paletes, 0);
            const totalPeso = this.resumoRows.reduce((acc, row) => acc + row.pesoTotal, 0);
            const totalContagens = new Set(this.detalheRows.map(row => `${row.filial}|${row.semana}|${row.fabrica}`)).size;

            this.kpiCaixas.textContent = String(totalCaixas);
            this.kpiPeso.textContent = `${this.formatPeso(totalPeso)} KG`;
            this.kpiProdutos.textContent = String(this.resumoRows.length);
            this.kpiContagens.textContent = String(totalContagens);
            this.totalPaletesPDF = totalPaletes;
        },

        limparFiltros() {
            if (!this.filialRestrita) this.filialSelect.value = '';
            this.semanaInput.value = '';
            this.fabricaSelect.value = '';
            this.produtoSelect.value = '';
            this.statusSelect.value = '';
            this.carregarRelatorio();
        },

        exportarExcel() {
            if (!window.XLSX) return alert('Biblioteca XLSX nao carregada.');
            if (this.resumoRows.length === 0 && this.detalheRows.length === 0) return alert('Nao ha dados para exportar.');

            const resumo = this.resumoRows.map(row => ({
                Codigo: row.produtoCodigo,
                Produto: row.produtoNome,
                Tipo: row.produtoTipo,
                FilialProduto: row.produtoFilial,
                TotalCaixas: row.caixas,
                PesoTotalKG: Number(row.pesoTotal.toFixed(3)),
                Contagens: row.totalContagens
            }));
            const detalhe = this.detalheRows.map(row => ({
                Filial: row.filial,
                Semana: row.semanaDisplay,
                Fabrica: row.fabrica,
                Status: row.status === 'FINALIZADA' ? 'Finalizada' : 'Em andamento',
                Codigo: row.produtoCodigo,
                Produto: row.produtoNome,
                Tipo: row.produtoTipo,
                Caixas: row.caixas,
                PesoTotalKG: Number(row.pesoTotal.toFixed(3)),
                Funcionario: row.funcionario,
                Atualizado: this.formatDateTime(row.updatedAt)
            }));

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resumo), 'Resumo');
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detalhe), 'Detalhe');
            XLSX.writeFile(workbook, `Relatorio_Contagem_Camara_Fria_${this.getDataArquivo()}.xlsx`);
        },

        async exportarPDF() {
            if (!window.jspdf?.jsPDF) return alert('Biblioteca jsPDF nao carregada.');
            if (this.resumoRows.length === 0) return alert('Nao ha dados para exportar.');

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const logo = await this.getLogoBase64PDF();
            if (logo) doc.addImage(logo, 'JPEG', 14, 8, 40, 12);

            doc.setFontSize(16);
            doc.setTextColor(0, 105, 55);
            doc.text('RELATORIO DE CONTAGEM - CAMARA FRIA', 14, 28);
            doc.setFontSize(9);
            doc.setTextColor(40);
            doc.text(`Filtros: ${this.getDescricaoFiltros()}`, 14, 35);
            const totalPaletes = this.resumoRows.reduce((acc, row) => acc + row.paletes, 0);
            doc.text(`Total paletes: ${totalPaletes} | Total caixas: ${this.kpiCaixas.textContent} | Peso total: ${this.kpiPeso.textContent} | Produtos: ${this.kpiProdutos.textContent}`, 14, 41);

            doc.autoTable({
                head: [['Codigo', 'Produto', 'Tipo', 'Paletes', 'Caixas', 'Peso Total', 'Contagens']],
                body: this.resumoRows.map(row => [
                    row.produtoCodigo,
                    row.produtoNome,
                    row.produtoTipo,
                    String(row.paletes),
                    String(row.caixas),
                    `${this.formatPeso(row.pesoTotal)} KG`,
                    String(row.totalContagens)
                ]),
                startY: 48,
                theme: 'grid',
                headStyles: { fillColor: [0, 105, 55], textColor: [255, 255, 255], fontSize: 8 },
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: {
                    3: { halign: 'right' },
                    4: { halign: 'right' },
                    5: { halign: 'right' },
                    6: { halign: 'right' }
                }
            });

            doc.save(`Relatorio_Contagem_Camara_Fria_${this.getDataArquivo()}.pdf`);
        },

        getDescricaoFiltros() {
            const fabrica = this.fabricaSelect.value
                ? this.fabricaSelect.options[this.fabricaSelect.selectedIndex]?.text
                : 'Todas';
            const produto = this.produtoSelect.value
                ? this.produtoSelect.options[this.produtoSelect.selectedIndex]?.text
                : 'Todos';
            const status = this.statusSelect.value
                ? this.statusSelect.options[this.statusSelect.selectedIndex]?.text
                : 'Todos';
            return [
                `Filial ${this.filialSelect.value || 'Todas'}`,
                `Semana ${this.formatSemanaDisplay(this.semanaInput.value)}`,
                `Fabrica ${fabrica}`,
                `Produto ${produto}`,
                `Status ${status}`
            ].join(' | ');
        },

        calcularPaletesPorCaixas(caixas, caixasPorPalete) {
            const totalCaixas = Number(caixas) || 0;
            const capacidadePalete = Number(caixasPorPalete) || 0;
            if (!totalCaixas || !capacidadePalete) return 0;
            return Math.floor(totalCaixas / capacidadePalete);
        },

        setLoading(loading) {
            this.btnFiltrar.disabled = loading;
            this.btnFiltrar.innerHTML = loading
                ? '<i class="fas fa-spinner fa-spin"></i> Filtrando...'
                : '<i class="fas fa-search"></i> Filtrar';
        },

        getUsuarioLogado() {
            try {
                return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
            } catch {
                return null;
            }
        },

        getDataArquivo() {
            return new Date().toISOString().slice(0, 10);
        },

        formatDateTime(value) {
            if (!value) return '-';
            return new Date(value).toLocaleString('pt-BR');
        },

        formatSemanaDisplay(value) {
            const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
            return match ? `${match[2]}-${match[1]}` : (value || 'Todas');
        },

        formatPeso(value) {
            return Number(value || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
            });
        },

        escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        },

        getLogoBase64PDF() {
            return new Promise(resolve => {
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
    };

    RelatorioContagemCamaraFria.init();
});
