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
        const selectFilial = document.getElementById('filtroFilial');
        filiais?.forEach(f => selectFilial.add(new Option(f.sigla || f.nome, f.sigla || f.nome)));
    },

    async fetchData() {
        this.tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Processando dados...</td></tr>';
        
        const dtIni = document.getElementById('dataInicio').value;
        const dtFim = document.getElementById('dataFim').value;
        const filial = document.getElementById('filtroFilial').value;
        const placa = document.getElementById('filtroPlaca').value.trim().toUpperCase();
        const rota = document.getElementById('filtroRota').value.trim();

        try {
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
            if (rota) queryHosp = queryHosp.ilike('numero_rota', `%${rota}%`);

            const [resSaidas, resExt, resHosp] = await Promise.all([querySaidas, queryExt, queryHosp]);

            // Unificar Abastecimentos
            const supplies = [
                ...(resSaidas.data || []).map(s => ({
                    data: s.data_hora.split('T')[0],
                    placa: s.veiculo_placa,
                    rota: s.rota,
                    litros: s.qtd_litros,
                    valor: 0, // Valor interno geralmente é calculado por custo médio, deixaremos 0 ou buscar do histórico
                    km_atual: s.km_atual
                })),
                ...(resExt.data || []).map(e => ({
                    data: e.data_hora.split('T')[0],
                    placa: e.veiculo_placa,
                    rota: e.rota,
                    litros: e.litros,
                    valor: e.valor_total,
                    km_atual: e.km_atual,
                    km_rodado: e.km_rodado
                }))
            ];

            // Processar Dados Finais
            this.data = supplies.map(sup => {
                // Encontra hospedagem para a mesma rota e data
                const hosp = resHosp.data?.filter(h => 
                    h.data_checkin === sup.data && 
                    String(h.numero_rota).includes(sup.rota)
                ).reduce((acc, curr) => acc + (curr.valor_total || 0), 0) || 0;

                return {
                    data: sup.data,
                    placa: sup.placa,
                    km_rodado: sup.km_rodado || 0,
                    litros: sup.litros,
                    valor_diesel: sup.valor,
                    valor_hospedagem: hosp
                };
            });

            this.renderTable();

        } catch (error) {
            console.error(error);
            this.tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Erro ao processar relatório.</td></tr>';
        }
    },

    renderTable() {
        this.tbody.innerHTML = '';
        if (this.data.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum dado encontrado.</td></tr>';
            return;
        }

        this.data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${item.placa}</td>
                <td>${item.km_rodado} km</td>
                <td>${item.litros.toFixed(2)} L</td>
                <td>${item.valor_diesel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${item.valor_hospedagem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            `;
            this.tbody.appendChild(tr);
        });
    },

    exportExcel() {
        if (this.data.length === 0) return alert('Sem dados para exportar.');
        const ws = XLSX.utils.json_to_sheet(this.data.map(i => ({
            'Data': i.data,
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