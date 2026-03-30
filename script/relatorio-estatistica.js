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

            // 3. Buscar Hospedagens (Despesas)
            let queryHosp = supabaseClient.from('despesas').select('valor_total, data_checkin, numero_rota')
                .gte('data_checkin', dtIni)
                .lte('data_checkin', dtFim);
            
            if (rota) queryHosp = queryHosp.eq('numero_rota', rota);
            
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

                // Encontra hospedagem vinculada à ROTA EXATA e DATA
                const valorHospedagem = resHosp.data?.filter(h => 
                    h.data_checkin === sup.data && String(h.numero_rota) === String(sup.rota)
                ).reduce((acc, curr) => acc + (curr.valor_total || 0), 0) || 0;

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
    }
};

document.addEventListener('DOMContentLoaded', () => RelatorioEstatistica.init());