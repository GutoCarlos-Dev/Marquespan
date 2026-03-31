import { supabaseClient } from './supabase.js';

const RelatorioEstatistica = {
    data: [],

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadFilters();
        this.setDefaultDates();
    },

    cacheDOM() {
        this.form = document.getElementById('formFiltroEstatistica');
        this.tbody = document.getElementById('tableBodyEstatistica');
        this.btnExcel = document.getElementById('btnExportarExcel');
        this.btnPDF = document.getElementById('btnExportarPDF');
    },

    bindEvents() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.fetchData();
        });
        this.btnExcel.addEventListener('click', () => this.exportExcel());
        this.btnPDF.addEventListener('click', () => this.exportPDF());
    },

    setDefaultDates() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        document.getElementById('dataInicio').value = firstDay.toISOString().split('T')[0];
        document.getElementById('dataFim').value = now.toISOString().split('T')[0];
    },

    async loadFilters() {
        // Carrega Filiais
        const { data: filiais } = await supabaseClient.from('filiais').select('sigla, nome').order('nome');
        const selFilial = document.getElementById('filtroFilial');
        filiais?.forEach(f => selFilial.add(new Option(f.sigla || f.nome, f.sigla || f.nome)));

        // Carrega Rotas para Datalist
        const { data: rotas } = await supabaseClient.from('rotas').select('numero').order('numero');
        const dlRotas = document.getElementById('listaRotasEstatistica');
        if (dlRotas && rotas) {
            dlRotas.innerHTML = [...new Set(rotas.map(r => r.numero))].map(num => `<option value="${num}">`).join('');
        }

        // Carrega Veículos para Datalist
        const { data: veiculos } = await supabaseClient.from('veiculos').select('placa').eq('situacao', 'ativo').order('placa');
        const dlVeic = document.getElementById('listaVeiculosEstatistica');
        if (dlVeic && veiculos) {
            dlVeic.innerHTML = veiculos.map(v => `<option value="${v.placa}">`).join('');
        }
    },

    async fetchData() {
        this.tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Calculando KM e agrupando bicos...</td></tr>';
        
        const dtIni = document.getElementById('dataInicio').value;
        const dtFim = document.getElementById('dataFim').value;
        const filial = document.getElementById('filtroFilial').value;
        const placa = document.getElementById('filtroPlaca').value.trim().toUpperCase();
        const rota = document.getElementById('filtroRota').value.trim();

        try {
            // 0. Buscar histórico de preços de compra para abastecimentos internos
            const { data: priceHistory } = await supabaseClient
                .from('abastecimentos')
                .select('tanque_id, valor_litro, data')
                .neq('numero_nota', 'AJUSTE DE ESTOQUE')
                .gt('valor_litro', 0)
                .order('data', { ascending: false });

            const getInternalPrice = (tanqueId, supplyDate) => {
                if (!priceHistory) return 0;
                const record = priceHistory.find(p => p.tanque_id === tanqueId && new Date(p.data) <= new Date(supplyDate));
                return record ? record.valor_litro : 0;
            };

            // 1. Buscar Abastecimentos Internos (Saídas)
            let querySaidas = supabaseClient.from('saidas_combustivel').select('*, bicos(bombas(tanque_id))')
                .gte('data_hora', `${dtIni}T00:00:00`)
                .lte('data_hora', `${dtFim}T23:59:59`);
            if (placa) querySaidas = querySaidas.eq('veiculo_placa', placa);
            if (rota) querySaidas = querySaidas.eq('rota', rota);

            // 2. Buscar Abastecimentos Externos
            let queryExt = supabaseClient.from('abastecimento_externo').select('*')
                .gte('data_hora', `${dtIni}T00:00:00`)
                .lte('data_hora', `${dtFim}T23:59:59`);
            if (placa) queryExt = queryExt.eq('veiculo_placa', placa);
            if (rota) queryExt = queryExt.eq('rota', rota);
            if (filial) queryExt = queryExt.eq('filial', filial);

            // 3. Buscar Hospedagens (Despesas) - Busca retroativa de 15 dias para capturar estadias que iniciaram antes do filtro mas cobrem o período
            const dtIniDate = new Date(dtIni + 'T00:00:00');
            dtIniDate.setDate(dtIniDate.getDate() - 15);
            const dtIniRetroativa = dtIniDate.toISOString().split('T')[0];

            let queryHosp = supabaseClient.from('despesas').select('valor_total, data_checkin, numero_rota, qtd_diarias')
                .gte('data_checkin', dtIniRetroativa)
                .lte('data_checkin', dtFim);
            
            const [resSaidas, resExt, resHosp] = await Promise.all([querySaidas, queryExt, queryHosp]);

            // Unificar Abastecimentos
            const rawSupplies = [
                ...(resSaidas.data || []).map(s => {
                    const tanqueId = s.bicos?.bombas?.tanque_id;
                    const precoCusto = tanqueId ? getInternalPrice(tanqueId, s.data_hora) : 0;
                    return {
                        data: s.data_hora.split('T')[0],
                        data_hora: s.data_hora,
                        placa: s.veiculo_placa,
                        rota: s.rota,
                        litros: s.qtd_litros,
                        valor: s.qtd_litros * precoCusto, 
                        km_atual: s.km_atual
                    };
                }),
                ...(resExt.data || []).map(e => ({
                    data: e.data_hora.split('T')[0],
                    data_hora: e.data_hora,
                    placa: e.veiculo_placa,
                    rota: e.rota,
                    litros: e.litros,
                    valor: e.valor_total,
                    km_atual: e.km_atual
                }))
            ];

            // 4. Agrupar por Placa e Timestamp (Soma bicos usados juntos no mesmo momento)
            const groupedMap = new Map();
            rawSupplies.forEach(s => {
                const key = `${s.placa}_${s.data_hora}`;
                if (!groupedMap.has(key)) {
                    groupedMap.set(key, { ...s });
                } else {
                    const existing = groupedMap.get(key);
                    existing.litros += s.litros;
                    existing.valor += s.valor;
                }
            });

            const sortedSupplies = Array.from(groupedMap.values()).sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

            // 5. Processar Dados Finais com cálculo de KM (Diferença para o registro anterior)
            this.data = [];
            for (const sup of sortedSupplies) {
                // Busca o KM do abastecimento anterior para este veículo
                const [prevInt, prevExt] = await Promise.all([
                    supabaseClient.from('saidas_combustivel')
                        .select('km_atual')
                        .eq('veiculo_placa', sup.placa)
                        .lt('data_hora', sup.data_hora)
                        .order('data_hora', { ascending: false }).limit(1),
                    supabaseClient.from('abastecimento_externo')
                        .select('km_atual')
                        .eq('veiculo_placa', sup.placa)
                        .lt('data_hora', sup.data_hora)
                        .order('data_hora', { ascending: false }).limit(1)
                ]);

                const kmAnteriorInt = prevInt.data?.[0]?.km_atual || 0;
                const kmAnteriorExt = prevExt.data?.[0]?.km_atual || 0;
                const kmAnterior = Math.max(kmAnteriorInt, kmAnteriorExt);

                const kmRodado = (sup.km_atual > kmAnterior && kmAnterior > 0) ? (sup.km_atual - kmAnterior) : 0;

                // Encontra hospedagem vinculada à ROTA e dentro do período de estada (Check-in + Diárias)
                const valorHospedagem = resHosp.data?.filter(h => {
                    // Suporta múltiplas rotas na despesa (separadas por vírgula)
                    const rotasHosp = String(h.numero_rota || '').split(',').map(r => r.trim());
                    const rotaSup = String(sup.rota || '').trim();
                    
                    if (rotaSup && !rotasHosp.includes(rotaSup)) return false;
                    
                    const checkin = new Date(h.data_checkin + 'T00:00:00');
                    const dataAbastecimento = new Date(sup.data + 'T00:00:00');
                    const checkout = new Date(checkin);
                    checkout.setDate(checkout.getDate() + (parseInt(h.qtd_diarias) || 1));

                    // Verifica se a data do abastecimento está entre o check-in (inclusive) e o check-out (inclusive)
                    return dataAbastecimento >= checkin && dataAbastecimento <= checkout;
                }).reduce((acc, curr) => acc + (curr.valor_total || 0), 0) || 0;

                this.data.push({
                    data: sup.data,
                    rota: sup.rota,
                    placa: sup.placa,
                    km_rodado: kmRodado,
                    litros: sup.litros,
                    valor_diesel: sup.valor,
                    valor_hospedagem: valorHospedagem
                });
            }

            this.renderTable();

        } catch (error) {
            console.error(error);
            this.tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Erro ao processar relatório.</td></tr>';
        }
    },

    formatCurrency(val) {
        return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },

    renderTable() {
        this.tbody.innerHTML = '';
        if (this.data.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhum dado encontrado para os filtros selecionados.</td></tr>';
            return;
        }

        this.data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td style="font-weight: bold; color: var(--primary-color);">${item.rota || '-'}</td>
                <td>${item.placa}</td>
                <td>${item.km_rodado > 0 ? item.km_rodado + ' km' : '<span style="color:#999">N/I</span>'}</td>
                <td>${item.litros.toFixed(2)} L</td>
                <td>${this.formatCurrency(item.valor_diesel)}</td>
                <td style="font-weight: 600;">${this.formatCurrency(item.valor_hospedagem)}</td>
            `;
            this.tbody.appendChild(tr);
        });
    },

    exportExcel() {
        if (this.data.length === 0) return alert('Sem dados para exportar.');
        const ws = XLSX.utils.json_to_sheet(this.data.map(i => ({
            'Data': i.data,
            'Rota': i.rota,
            'Placa': i.placa,
            'KM Rodado': i.km_rodado,
            'Litros Diesel': i.litros,
            'Valor Diesel': i.valor_diesel,
            'Hospedagem': i.valor_hospedagem
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Estatistica");
        XLSX.writeFile(wb, "Relatorio_Estatistica.xlsx");
    },

    async exportPDF() {
        if (this.data.length === 0) return alert('Sem dados para exportar.');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });

        // Logo
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
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg'));
                };
                img.onerror = () => resolve(null);
            });
        };

        const logoBase64 = await getLogoBase64();
        if (logoBase64) doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 10);

        doc.setFontSize(18);
        doc.text("Relatório Estatística", 14, 28);
        
        doc.setFontSize(10);
        doc.text(`Período: ${document.getElementById('dataInicio').value} a ${document.getElementById('dataFim').value}`, 14, 35);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 40);

        const columns = ['DATA', 'ROTA', 'PLACA', 'KM RODADO', 'LITROS DIESEL', 'VALOR DIESEL', 'HOSPEDAGEM'];
        const rows = this.data.map(i => [
            new Date(i.data + 'T00:00:00').toLocaleDateString('pt-BR'),
            i.rota || '-',
            i.placa,
            i.km_rodado > 0 ? i.km_rodado + ' km' : 'N/I',
            i.litros.toFixed(2) + ' L',
            this.formatCurrency(i.valor_diesel),
            this.formatCurrency(i.valor_hospedagem)
        ]);

        doc.autoTable({
            head: [columns],
            body: rows,
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55] },
            styles: { fontSize: 9 }
        });

        // Numeração de páginas
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() - 25, doc.internal.pageSize.getHeight() - 10);
        }

        doc.save(`Relatorio_Estatistica_${new Date().toISOString().slice(0,10)}.pdf`);
    }
};

document.addEventListener('DOMContentLoaded', () => RelatorioEstatistica.init());