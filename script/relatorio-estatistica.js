import { supabaseClient } from './supabase.js';

const RelatorioEstatistica = {
    data: [],
    pedagiosPeriodo: [],
    hospedagensPeriodo: [],
    tipoAtual: 'ANALITICO',

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadFilters();
        this.setDefaultDates();
        this.popularSemanas();
        this.atualizarModoFiltros();
        this.renderHeader();
    },

    cacheDOM() {
        this.form = document.getElementById('formFiltroEstatistica');
        this.tbody = document.getElementById('tableBodyEstatistica');
        this.theadRow = document.querySelector('.data-grid thead tr');
        this.btnExcel = document.getElementById('btnExportarExcel');
        this.btnPDF = document.getElementById('btnExportarPDF');
        this.tipoRelatorio = document.getElementById('tipoRelatorio');
        this.grupoPeriodo = document.getElementById('grupoPeriodo');
        this.grupoSemanas = document.getElementById('grupoSemanas');
        this.filtroSemanas = document.getElementById('filtroSemanas');
        this.btnLimparSemanas = document.getElementById('btnLimparSemanas');
    },

    bindEvents() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.fetchData();
        });
        this.btnExcel.addEventListener('click', () => this.exportExcel());
        this.btnPDF.addEventListener('click', () => this.exportPDF());
        this.tipoRelatorio.addEventListener('change', () => {
            this.atualizarModoFiltros();
            this.data = [];
            this.renderHeader();
            this.renderEmpty('Selecione os filtros e clique em buscar.');
        });
        this.btnLimparSemanas.addEventListener('click', () => {
            Array.from(this.filtroSemanas.options).forEach(option => option.selected = false);
        });
    },

    setDefaultDates() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        document.getElementById('dataInicio').value = firstDay.toISOString().split('T')[0];
        document.getElementById('dataFim').value = now.toISOString().split('T')[0];
    },

    atualizarModoFiltros() {
        this.tipoAtual = this.tipoRelatorio.value;
        const isConsolidado = this.tipoAtual === 'CONSOLIDADO';
        this.grupoPeriodo.classList.toggle('hidden', isConsolidado);
        this.grupoSemanas.classList.toggle('hidden', !isConsolidado);
    },

    getISOWeekInfo(dateInput) {
        const date = new Date(dateInput);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
        const week1 = new Date(date.getFullYear(), 0, 4);
        const week = 1 + Math.round((((date - week1) / 86400000) - 3 + ((week1.getDay() + 6) % 7)) / 7);
        return { year: date.getFullYear(), week };
    },

    getWeekRange(year, week) {
        const simple = new Date(year, 0, 1 + (week - 1) * 7);
        const day = simple.getDay();
        const isoWeekStart = new Date(simple);
        if (day <= 4) {
            isoWeekStart.setDate(simple.getDate() - simple.getDay() + 1);
        } else {
            isoWeekStart.setDate(simple.getDate() + 8 - simple.getDay());
        }
        const isoWeekEnd = new Date(isoWeekStart);
        isoWeekEnd.setDate(isoWeekStart.getDate() + 6);
        return { start: isoWeekStart, end: isoWeekEnd };
    },

    normalizarRota(rota) {
        const texto = String(rota || '').trim();
        const numero = texto.replace(/\D/g, '');
        return numero ? String(Number(numero)) : texto.toUpperCase();
    },

    separarRotas(rotas) {
        return String(rotas || '')
            .split(',')
            .map(r => r.trim())
            .filter(Boolean);
    },

    rotasIncluem(rotas, rotaBusca) {
        if (!rotaBusca) return true;
        const rotaNormalizada = this.normalizarRota(rotaBusca);
        return this.separarRotas(rotas).some(r => this.normalizarRota(r) === rotaNormalizada);
    },

    somenteData(data) {
        return String(data || '').split('T')[0];
    },

    formatDateISO(date) {
        return date.toISOString().split('T')[0];
    },

    popularSemanas() {
        const currentYear = new Date().getFullYear();
        const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear + 1];
        this.filtroSemanas.innerHTML = '';

        years.forEach(year => {
            for (let week = 1; week <= 53; week++) {
                const range = this.getWeekRange(year, week);
                if (range.start.getFullYear() > year && range.end.getFullYear() > year) continue;

                const value = `${year}-${String(week).padStart(2, '0')}`;
                const label = `Semana ${String(week).padStart(2, '0')} - ${year} (${range.start.toLocaleDateString('pt-BR')} a ${range.end.toLocaleDateString('pt-BR')})`;
                this.filtroSemanas.add(new Option(label, value));
            }
        });
    },

    async loadFilters() {
        const { data: filiais } = await supabaseClient.from('filiais').select('sigla, nome').order('nome');
        const selFilial = document.getElementById('filtroFilial');
        filiais?.forEach(f => selFilial.add(new Option(f.sigla || f.nome, f.sigla || f.nome)));

        const { data: rotas } = await supabaseClient.from('rotas').select('numero').order('numero');
        const dlRotas = document.getElementById('listaRotasEstatistica');
        if (dlRotas && rotas) {
            dlRotas.innerHTML = [...new Set(rotas.map(r => r.numero))].map(num => `<option value="${num}">`).join('');
        }

        const { data: veiculos } = await supabaseClient.from('veiculos').select('placa').eq('situacao', 'ativo').order('placa');
        const dlVeic = document.getElementById('listaVeiculosEstatistica');
        if (dlVeic && veiculos) {
            dlVeic.innerHTML = veiculos.map(v => `<option value="${v.placa}">`).join('');
        }
    },

    getSelectedWeeks() {
        return Array.from(this.filtroSemanas.selectedOptions).map(option => {
            const [year, week] = option.value.split('-').map(Number);
            return { year, week, value: option.value, label: `Semana ${String(week).padStart(2, '0')} - ${year}`, ...this.getWeekRange(year, week) };
        });
    },

    getPeriodoConsulta() {
        if (this.tipoAtual === 'CONSOLIDADO') {
            const weeks = this.getSelectedWeeks();
            if (weeks.length === 0) throw new Error('Selecione pelo menos uma semana para o relatório consolidado.');
            const start = new Date(Math.min(...weeks.map(w => w.start.getTime())));
            const end = new Date(Math.max(...weeks.map(w => w.end.getTime())));
            return { dtIni: this.formatDateISO(start), dtFim: this.formatDateISO(end), weeks };
        }

        const dtIni = document.getElementById('dataInicio').value;
        const dtFim = document.getElementById('dataFim').value;
        if (!dtIni || !dtFim) throw new Error('Informe o período do relatório analítico.');
        return { dtIni, dtFim, weeks: [] };
    },

    async buscarHospedagens(dtIni, dtFim) {
        const todasHospedagens = [];
        const pageSize = 1000;
        let from = 0;

        while (true) {
            const { data, error } = await supabaseClient
                .from('despesas')
                .select('valor_total, data_checkin, numero_rota, qtd_diarias, funcionario1:id_funcionario1(nome_completo)')
                .gte('data_checkin', dtIni)
                .lte('data_checkin', dtFim)
                .order('data_checkin', { ascending: true })
                .range(from, from + pageSize - 1);

            if (error) return { data: todasHospedagens, error };

            const pagina = data || [];
            todasHospedagens.push(...pagina);

            if (pagina.length < pageSize) break;
            from += pageSize;
        }

        return { data: todasHospedagens, error: null };
    },

    async fetchData() {
        this.tipoAtual = this.tipoRelatorio.value;
        this.renderHeader();
        this.renderLoading();

        try {
            const periodo = this.getPeriodoConsulta();
            const registros = await this.buscarRegistrosAnaliticos(periodo.dtIni, periodo.dtFim);

            if (this.tipoAtual === 'CONSOLIDADO') {
                this.data = this.consolidarPorSemanaRota(registros, periodo.weeks, this.hospedagensPeriodo);
            } else {
                this.data = registros;
            }

            this.renderTable();
        } catch (error) {
            console.error(error);
            this.renderError(error.message || 'Erro ao processar relatório.');
        }
    },

    async buscarRegistrosAnaliticos(dtIni, dtFim) {
        const filial = document.getElementById('filtroFilial').value;
        const placa = document.getElementById('filtroPlaca').value.trim().toUpperCase();
        const rota = document.getElementById('filtroRota').value.trim();

        const { data: priceHistory } = await supabaseClient
            .from('abastecimentos')
            .select('tanque_id, valor_litro, data')
            .neq('numero_nota', 'AJUSTE DE ESTOQUE')
            .gt('valor_litro', 0)
            .order('data', { ascending: false });

        const getInternalPrice = (tanqueId, supplyDate) => {
            if (!priceHistory) return 0;
            const record = priceHistory.find(p => Number(p.tanque_id) === Number(tanqueId) && new Date(p.data) <= new Date(supplyDate));
            return record ? Number(record.valor_litro) : 0;
        };

        let querySaidas = supabaseClient.from('saidas_combustivel').select('*, data_referencia, bicos(nome, bombas(tanque_id, tanques(nome, filial, tipo_combustivel)))')
            .gte('data_hora', `${dtIni}T00:00:00`)
            .lte('data_hora', `${dtFim}T23:59:59`);
        if (placa) querySaidas = querySaidas.eq('veiculo_placa', placa);
        if (rota) querySaidas = querySaidas.eq('rota', rota);

        let queryExt = supabaseClient.from('abastecimento_externo').select('*, data_referencia, postos(razao_social)')
            .gte('data_hora', `${dtIni}T00:00:00`)
            .lte('data_hora', `${dtFim}T23:59:59`);
        if (placa) queryExt = queryExt.eq('veiculo_placa', placa);
        if (rota) queryExt = queryExt.eq('rota', rota);
        if (filial) queryExt = queryExt.eq('filial', filial);

        const dtIniDate = new Date(`${dtIni}T00:00:00`);
        dtIniDate.setDate(dtIniDate.getDate() - 15);
        const dtIniRetroativa = this.formatDateISO(dtIniDate);

        let queryPedagio = supabaseClient.from('pedagios_lancamentos').select('valor, data_hora_passagem, placa, rota, motorista, filial')
            .gte('data_hora_passagem', `${dtIni}T00:00:00`)
            .lte('data_hora_passagem', `${dtFim}T23:59:59`);
        if (placa) queryPedagio = queryPedagio.eq('placa', placa);
        if (rota) queryPedagio = queryPedagio.eq('rota', rota);
        if (filial) queryPedagio = queryPedagio.eq('filial', filial);

        const [resSaidas, resExt, resHosp, resPedagio] = await Promise.all([
            querySaidas,
            queryExt,
            this.buscarHospedagens(dtIniRetroativa, dtFim),
            queryPedagio
        ]);
        if (resSaidas.error) throw resSaidas.error;
        if (resExt.error) throw resExt.error;
        if (resHosp.error) throw resHosp.error;
        if (resPedagio.error) throw resPedagio.error;
        this.pedagiosPeriodo = resPedagio.data || [];
        this.hospedagensPeriodo = (resHosp.data || []).filter(h => {
            const dataCheckin = this.somenteData(h.data_checkin);
            if (dataCheckin < dtIni || dataCheckin > dtFim) return false;

            if (rota) {
                if (!this.rotasIncluem(h.numero_rota, rota)) return false;
            }

            return true;
        });

        const saidas = (resSaidas.data || [])
            .filter(s => !filial || s.bicos?.bombas?.tanques?.filial === filial)
            .map(s => {
                const tanqueId = s.bicos?.bombas?.tanque_id;
                const precoCusto = tanqueId ? getInternalPrice(tanqueId, s.data_hora) : 0;
                return {
                    tipo: 'INTERNO',
                    data: s.data_referencia || s.data_hora.split('T')[0],
                    data_hora: s.data_hora,
                    rota: s.rota,
                    placa: s.veiculo_placa,
                    motorista: s.motorista || '',
                    km_atual: Number(s.km_atual) || 0,
                    litros: Number(s.qtd_litros) || 0,
                    valor_diesel: (Number(s.qtd_litros) || 0) * precoCusto,
                    valor_unitario: precoCusto,
                    bico_posto: s.bicos?.nome || '-',
                    tanque_combustivel: s.bicos?.bombas?.tanques?.nome || '-'
                };
            });

        const externos = (resExt.data || []).map(e => ({
            tipo: 'EXTERNO',
            data: e.data_referencia || e.data_hora.split('T')[0],
            data_hora: e.data_hora,
            rota: e.rota,
            placa: e.veiculo_placa,
            motorista: e.motorista || '',
            km_atual: Number(e.km_atual) || 0,
            litros: Number(e.litros) || 0,
            valor_diesel: Number(e.valor_total) || 0,
            valor_unitario: Number(e.valor_unitario) || 0,
            bico_posto: e.postos?.razao_social || 'Posto externo',
            tanque_combustivel: '-'
        }));

        const registros = [...saidas, ...externos].sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
        await this.preencherKmRodado(registros);

        return registros.map(reg => {
            const valorHospedagem = this.calcularHospedagem(reg, resHosp.data || []);
            const valorPedagio = this.calcularPedagio(reg, this.pedagiosPeriodo);
            const motorista = this.obterMotorista(reg, this.pedagiosPeriodo, resHosp.data || []);
            return {
                ...reg,
                motorista,
                semana: this.getSemanaLabel(reg.data),
                valor_hospedagem: valorHospedagem,
                valor_pedagio: valorPedagio,
                gasto_total: (reg.valor_diesel || 0) + (valorHospedagem || 0) + (valorPedagio || 0),
                media_km_lts: reg.litros > 0 ? reg.km_rodado / reg.litros : 0
            };
        });
    },

    async preencherKmRodado(registros) {
        for (const reg of registros) {
            const [prevInt, prevExt] = await Promise.all([
                supabaseClient.from('saidas_combustivel')
                    .select('km_atual')
                    .eq('veiculo_placa', reg.placa)
                    .lt('data_hora', reg.data_hora)
                    .order('data_hora', { ascending: false }).limit(1),
                supabaseClient.from('abastecimento_externo')
                    .select('km_atual')
                    .eq('veiculo_placa', reg.placa)
                    .lt('data_hora', reg.data_hora)
                    .order('data_hora', { ascending: false }).limit(1)
            ]);

            const kmAnteriorInt = Number(prevInt.data?.[0]?.km_atual) || 0;
            const kmAnteriorExt = Number(prevExt.data?.[0]?.km_atual) || 0;
            const kmAnterior = Math.max(kmAnteriorInt, kmAnteriorExt);
            reg.km_anterior = kmAnterior || null;
            reg.km_rodado = (reg.km_atual > kmAnterior && kmAnterior > 0) ? (reg.km_atual - kmAnterior) : 0;
        }
    },

    calcularHospedagem(registro, hospedagens) {
        return hospedagens.filter(h => {
            const rotaSup = String(registro.rota || '').trim();
            if (rotaSup && !this.rotasIncluem(h.numero_rota, rotaSup)) return false;

            const checkin = new Date(`${h.data_checkin}T00:00:00`);
            const dataAbastecimento = new Date(`${registro.data}T00:00:00`);
            const checkout = new Date(checkin);
            checkout.setDate(checkout.getDate() + (parseInt(h.qtd_diarias, 10) || 1));
            return dataAbastecimento >= checkin && dataAbastecimento <= checkout;
        }).reduce((acc, curr) => acc + (Number(curr.valor_total) || 0), 0);
    },

    buscarHospedagensRegistro(registro, hospedagens) {
        return hospedagens.filter(h => {
            const rotaSup = String(registro.rota || '').trim();
            if (rotaSup && !this.rotasIncluem(h.numero_rota, rotaSup)) return false;

            const checkin = new Date(`${h.data_checkin}T00:00:00`);
            const dataAbastecimento = new Date(`${registro.data}T00:00:00`);
            const checkout = new Date(checkin);
            checkout.setDate(checkout.getDate() + (parseInt(h.qtd_diarias, 10) || 1));
            return dataAbastecimento >= checkin && dataAbastecimento <= checkout;
        });
    },

    buscarPedagiosRegistro(registro, pedagios) {
        const dataRegistro = String(registro.data || '');
        const rotaRegistro = String(registro.rota || '').trim();
        const placaRegistro = String(registro.placa || '').trim().toUpperCase();

        return pedagios.filter(p => {
            const dataPedagio = String(p.data_hora_passagem || '').split('T')[0];
            const rotaPedagio = String(p.rota || '').trim();
            const placaPedagio = String(p.placa || '').trim().toUpperCase();
            return dataPedagio === dataRegistro
                && (!rotaRegistro || rotaPedagio === rotaRegistro)
                && (!placaRegistro || placaPedagio === placaRegistro);
        });
    },

    calcularPedagio(registro, pedagios) {
        return this.buscarPedagiosRegistro(registro, pedagios)
            .reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);
    },

    obterMotorista(registro, pedagios, hospedagens) {
        if (registro.motorista) return registro.motorista;

        const motoristaPedagio = this.buscarPedagiosRegistro(registro, pedagios)
            .map(p => p.motorista)
            .find(Boolean);
        if (motoristaPedagio) return motoristaPedagio;

        const motoristaHotel = this.buscarHospedagensRegistro(registro, hospedagens)
            .map(h => h.funcionario1?.nome_completo)
            .find(Boolean);
        return motoristaHotel || '';
    },

    getSemanaLabel(dateInput) {
        const info = this.getISOWeekInfo(`${dateInput}T00:00:00`);
        return `Semana ${String(info.week).padStart(2, '0')} - ${info.year}`;
    },

    consolidarPorSemanaRota(registros, semanasSelecionadas, hospedagens = []) {
        const semanasPermitidas = new Set(semanasSelecionadas.map(w => w.value));
        const map = new Map();
        const criarItem = (weekValue, week, year, rota) => ({
            semana: `Semana ${String(week).padStart(2, '0')} - ${year}`,
            semana_ordem: weekValue,
            rota,
            qtd_lancamentos: 0,
            placas: new Set(),
            motoristas: new Set(),
            kmsConsiderados: new Set(),
            km_rodado: 0,
            litros: 0,
            valor_diesel: 0,
            valor_hospedagem: 0,
            valor_pedagio: 0,
            gasto_total: 0
        });

        registros.forEach(reg => {
            const info = this.getISOWeekInfo(`${reg.data}T00:00:00`);
            const weekValue = `${info.year}-${String(info.week).padStart(2, '0')}`;
            if (!semanasPermitidas.has(weekValue)) return;

            const rota = reg.rota || '-';
            const key = `${weekValue}_${rota}`;
            if (!map.has(key)) {
                map.set(key, criarItem(weekValue, info.week, info.year, rota));
            }

            const item = map.get(key);
            item.qtd_lancamentos += 1;
            if (reg.placa) item.placas.add(reg.placa);
            if (reg.motorista) item.motoristas.add(reg.motorista);
            const kmKey = [
                reg.placa || '',
                reg.data_hora || reg.data || '',
                reg.km_anterior || '',
                reg.km_atual || ''
            ].join('|');
            if (!item.kmsConsiderados.has(kmKey)) {
                item.km_rodado += Number(reg.km_rodado) || 0;
                item.kmsConsiderados.add(kmKey);
            }
            item.litros += Number(reg.litros) || 0;
            item.valor_diesel += Number(reg.valor_diesel) || 0;
            item.gasto_total += Number(reg.valor_diesel) || 0;
        });

        hospedagens.forEach(h => {
            const dataCheckin = this.somenteData(h.data_checkin);
            if (!dataCheckin) return;

            const info = this.getISOWeekInfo(`${dataCheckin}T00:00:00`);
            const weekValue = `${info.year}-${String(info.week).padStart(2, '0')}`;
            if (!semanasPermitidas.has(weekValue)) return;

            const rotasHosp = this.separarRotas(h.numero_rota || '-').map(r => this.normalizarRota(r) || '-');
            const rotas = rotasHosp.length > 0 ? rotasHosp : ['-'];
            const valorPorRota = (Number(h.valor_total) || 0) / rotas.length;

            rotas.forEach(rota => {
                const key = `${weekValue}_${rota}`;
                if (!map.has(key)) {
                    map.set(key, criarItem(weekValue, info.week, info.year, rota));
                }

                const item = map.get(key);
                const motorista = h.funcionario1?.nome_completo;
                if (motorista) item.motoristas.add(motorista);
                item.valor_hospedagem += valorPorRota;
                item.gasto_total += valorPorRota;
            });
        });

        (this.pedagiosPeriodo || []).forEach(p => {
            const dataPedagio = String(p.data_hora_passagem || '').split('T')[0];
            if (!dataPedagio) return;

            const info = this.getISOWeekInfo(`${dataPedagio}T00:00:00`);
            const weekValue = `${info.year}-${String(info.week).padStart(2, '0')}`;
            if (!semanasPermitidas.has(weekValue)) return;

            const rota = p.rota || '-';
            const key = `${weekValue}_${rota}`;
            if (!map.has(key)) {
                map.set(key, criarItem(weekValue, info.week, info.year, rota));
            }

            const item = map.get(key);
            if (p.placa) item.placas.add(p.placa);
            item.valor_pedagio += Number(p.valor) || 0;
            item.gasto_total += Number(p.valor) || 0;
        });

        return Array.from(map.values())
            .map(item => {
                const { kmsConsiderados, ...dados } = item;
                return {
                    ...dados,
                    placas: Array.from(item.placas).sort().join(', '),
                    motoristas: Array.from(item.motoristas).sort().join(', '),
                    media_km_lts: item.litros > 0 ? item.km_rodado / item.litros : 0
                };
            })
            .sort((a, b) => a.semana_ordem.localeCompare(b.semana_ordem) || String(a.rota).localeCompare(String(b.rota), undefined, { numeric: true }));
    },

    formatCurrency(val) {
        return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },

    formatNumber(val, digits = 2) {
        return (Number(val) || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    },

    renderHeader() {
        const headers = this.tipoAtual === 'CONSOLIDADO'
            ? ['SEMANA', 'ROTA', 'QTD LANÇ.', 'PLACAS', 'MOTORISTA', 'KM RODADO', 'LITROS DIESEL', 'MÉDIA-KM/LTS', 'VALOR DIESEL', 'HOSPEDAGEM', 'PEDÁGIO', 'TOTAL GASTO']
            : ['DATA/HORA', 'PERÍODO', 'TIPO', 'ROTA', 'PLACA', 'MOTORISTA', 'KM ANTERIOR', 'KM ATUAL', 'KM RODADO', 'LITROS DIESEL', 'MÉDIA-KM/LTS', 'VALOR UNIT.', 'VALOR DIESEL', 'HOSPEDAGEM', 'PEDÁGIO', 'TOTAL GASTO', 'BICO/POSTO', 'TANQUE'];

        this.theadRow.innerHTML = headers.map(h => `<th>${h}</th>`).join('');
    },

    getColspan() {
        return this.tipoAtual === 'CONSOLIDADO' ? 12 : 18;
    },

    renderLoading() {
        this.tbody.innerHTML = `<tr><td colspan="${this.getColspan()}" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Processando relatório...</td></tr>`;
    },

    renderEmpty(message) {
        this.tbody.innerHTML = `<tr><td colspan="${this.getColspan()}" style="text-align: center;">${message}</td></tr>`;
    },

    renderError(message) {
        this.tbody.innerHTML = `<tr><td colspan="${this.getColspan()}" style="text-align: center; color: red;">${message}</td></tr>`;
    },

    renderTable() {
        this.tbody.innerHTML = '';
        if (this.data.length === 0) {
            this.renderEmpty('Nenhum dado encontrado para os filtros selecionados.');
            return;
        }

        if (this.tipoAtual === 'CONSOLIDADO') {
            this.renderTableConsolidado();
        } else {
            this.renderTableAnalitico();
        }
    },

    renderTableAnalitico() {
        this.data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(item.data_hora).toLocaleString('pt-BR')}</td>
                <td>${item.semana}</td>
                <td>${item.tipo}</td>
                <td style="font-weight: bold; color: var(--primary-color);">${item.rota || '-'}</td>
                <td>${item.placa || '-'}</td>
                <td>${item.motorista || '-'}</td>
                <td>${item.km_anterior ? `${this.formatNumber(item.km_anterior, 0)} km` : 'N/I'}</td>
                <td>${item.km_atual ? `${this.formatNumber(item.km_atual, 0)} km` : 'N/I'}</td>
                <td>${item.km_rodado > 0 ? `${this.formatNumber(item.km_rodado, 0)} km` : '<span style="color:#999">N/I</span>'}</td>
                <td>${this.formatNumber(item.litros)} L</td>
                <td>${item.media_km_lts > 0 ? this.formatNumber(item.media_km_lts, 2) : 'N/I'}</td>
                <td>${this.formatCurrency(item.valor_unitario)}</td>
                <td>${this.formatCurrency(item.valor_diesel)}</td>
                <td style="font-weight: 600;">${this.formatCurrency(item.valor_hospedagem)}</td>
                <td style="font-weight: 600;">${this.formatCurrency(item.valor_pedagio)}</td>
                <td style="font-weight: 700; color: var(--primary-color);">${this.formatCurrency(item.gasto_total)}</td>
                <td>${item.bico_posto || '-'}</td>
                <td>${item.tanque_combustivel || '-'}</td>
            `;
            this.tbody.appendChild(tr);
        });
    },

    renderTableConsolidado() {
        this.data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.semana}</td>
                <td style="font-weight: bold; color: var(--primary-color);">${item.rota || '-'}</td>
                <td>${item.qtd_lancamentos}</td>
                <td>${item.placas || '-'}</td>
                <td>${item.motoristas || '-'}</td>
                <td>${item.km_rodado > 0 ? `${this.formatNumber(item.km_rodado, 0)} km` : '<span style="color:#999">N/I</span>'}</td>
                <td>${this.formatNumber(item.litros)} L</td>
                <td>${item.media_km_lts > 0 ? this.formatNumber(item.media_km_lts, 2) : 'N/I'}</td>
                <td>${this.formatCurrency(item.valor_diesel)}</td>
                <td style="font-weight: 600;">${this.formatCurrency(item.valor_hospedagem)}</td>
                <td style="font-weight: 600;">${this.formatCurrency(item.valor_pedagio)}</td>
                <td style="font-weight: 700; color: var(--primary-color);">${this.formatCurrency(item.gasto_total)}</td>
            `;
            this.tbody.appendChild(tr);
        });
    },

    getExportRows() {
        if (this.tipoAtual === 'CONSOLIDADO') {
            return this.data.map(i => ({
                'SEMANA': i.semana,
                'ROTA': i.rota,
                'QTD LANÇ.': i.qtd_lancamentos,
                'PLACAS': i.placas,
                'MOTORISTA': i.motoristas,
                'KM RODADO': i.km_rodado,
                'LITROS DIESEL': i.litros,
                'MÉDIA-KM/LTS': i.media_km_lts,
                'VALOR DIESEL': i.valor_diesel,
                'HOSPEDAGEM': i.valor_hospedagem,
                'PEDÁGIO': i.valor_pedagio,
                'TOTAL GASTO': i.gasto_total
            }));
        }

        return this.data.map(i => ({
            'DATA/HORA': new Date(i.data_hora).toLocaleString('pt-BR'),
            'PERÍODO': i.semana,
            'TIPO': i.tipo,
            'ROTA': i.rota,
            'PLACA': i.placa,
            'MOTORISTA': i.motorista,
            'KM ANTERIOR': i.km_anterior || '',
            'KM ATUAL': i.km_atual || '',
            'KM RODADO': i.km_rodado,
            'LITROS DIESEL': i.litros,
            'MÉDIA-KM/LTS': i.media_km_lts,
            'VALOR UNIT.': i.valor_unitario,
            'VALOR DIESEL': i.valor_diesel,
            'HOSPEDAGEM': i.valor_hospedagem,
            'PEDÁGIO': i.valor_pedagio,
            'TOTAL GASTO': i.gasto_total,
            'BICO/POSTO': i.bico_posto,
            'TANQUE': i.tanque_combustivel
        }));
    },

    exportExcel() {
        if (this.data.length === 0) return alert('Sem dados para exportar.');
        const ws = XLSX.utils.json_to_sheet(this.getExportRows());
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, this.tipoAtual === 'CONSOLIDADO' ? 'Consolidado' : 'Analitico');
        XLSX.writeFile(wb, `Relatorio_Estatistica_${this.tipoAtual}.xlsx`);
    },

    async exportPDF() {
        if (this.data.length === 0) return alert('Sem dados para exportar.');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });

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
        doc.text(`Relatório Estatística - ${this.tipoAtual === 'CONSOLIDADO' ? 'Consolidado' : 'Analítico'}`, 14, 28);
        doc.setFontSize(10);

        if (this.tipoAtual === 'CONSOLIDADO') {
            const semanas = this.getSelectedWeeks().map(w => w.label).join(', ');
            doc.text(`Semanas: ${semanas}`, 14, 35);
        } else {
            const dtIniFmt = new Date(`${document.getElementById('dataInicio').value}T00:00:00`).toLocaleDateString('pt-BR');
            const dtFimFmt = new Date(`${document.getElementById('dataFim').value}T00:00:00`).toLocaleDateString('pt-BR');
            doc.text(`Período: ${dtIniFmt} a ${dtFimFmt}`, 14, 35);
        }
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 40);

        const rowsObject = this.getExportRows();
        const columns = Object.keys(rowsObject[0]);
        const rows = rowsObject.map(row => columns.map(col => {
            const value = row[col];
            if (col.includes('VALOR') || col.includes('HOSPEDAGEM') || col.includes('PEDÁGIO') || col.includes('TOTAL')) return this.formatCurrency(value);
            if (col.includes('LITROS')) return `${this.formatNumber(value)} L`;
            if (col.includes('LTS')) return Number(value) > 0 ? this.formatNumber(value, 2) : 'N/I';
            if (col.includes('KM')) return value ? `${this.formatNumber(value, 0)} km` : '';
            return value ?? '';
        }));

        doc.autoTable({
            head: [columns],
            body: rows,
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55] },
            styles: { fontSize: this.tipoAtual === 'CONSOLIDADO' ? 8 : 6, cellPadding: this.tipoAtual === 'CONSOLIDADO' ? 2 : 1.5 }
        });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() - 25, doc.internal.pageSize.getHeight() - 10);
        }

        doc.save(`Relatorio_Estatistica_${this.tipoAtual}_${new Date().toISOString().slice(0,10)}.pdf`);
    }
};

document.addEventListener('DOMContentLoaded', () => RelatorioEstatistica.init());
