import { supabaseClient } from './supabase.js';

const RelatorioDespesasUI = {
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.setDefaultDates();
        // Garante que rotas sejam carregadas antes dos dados para mapear o supervisor
        this.carregarRotas().then(() => {
            this.carregarHoteis();
            this.carregarDados();
        });
        this.filteredData = []; // Armazena dados filtrados para exportação
        this.chartHoteis = null;
        this.chartRotas = null;
        this.chartDespesasPorRota = null;
        this.chartTopHoteis = null;
        this.chartEvolucaoMensal = null;
        this.chartTopFuncionarios = null;
        this.rotasCache = []; // Cache para buscar supervisores
        this.currentSort = { column: 'data_checkin', direction: 'desc' }; // Estado de ordenação
        
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
        
        // Injeta o HTML do filtro de supervisor se não existir
        this.injectSupervisorFilterHTML();
        this.filtroSupervisorDisplay = document.getElementById('filtroSupervisorDisplay');
        this.filtroSupervisorOptions = document.getElementById('filtroSupervisorOptions');
        this.filtroSupervisorText = document.getElementById('filtroSupervisorText');

        this.kpiCustoTotal = document.getElementById('kpiCustoTotal');
        this.kpiTotalDiarias = document.getElementById('kpiTotalDiarias');
        this.chartHoteisCanvas = document.getElementById('chartHoteis');
        this.chartRotasCanvas = document.getElementById('chartRotas');
        this.chartDespesasPorRotaCanvas = document.getElementById('chartDespesasPorRota');
        this.chartTopHoteisCanvas = document.getElementById('chartTopHoteis');
        this.chartEvolucaoMensalCanvas = document.getElementById('chartEvolucaoMensal');
        this.chartTopFuncionariosCanvas = document.getElementById('chartTopFuncionarios');
        
        this.btnExportarExcel = document.getElementById('btnExportarExcel');
        this.btnExportarPDF = document.getElementById('btnExportarPDF');
        this.totalQtd = document.getElementById('totalQtd');
        this.totalValor = document.getElementById('totalValor');
        this.tableBodyResultados = document.getElementById('tableBodyResultados');
    },

    injectSupervisorFilterHTML() {
        if (document.getElementById('filtroSupervisorDisplay')) return;

        const rotaDisplay = this.filtroRotaDisplay || document.getElementById('filtroRotaDisplay');
        if (!rotaDisplay) return;

        // Encontra o grupo de formulário (.form-group) da Rota e seu container pai
        const rotaGroup = rotaDisplay.closest('.form-group');
        const container = rotaGroup?.parentElement;

        if (!container) return;

        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `
            <label>Supervisor</label>
            <div class="custom-multiselect" style="position: relative;">
                <div id="filtroSupervisorDisplay" class="glass-input multiselect-display"><span id="filtroSupervisorText">Todos</span> <i class="fas fa-chevron-down"></i></div>
                <div id="filtroSupervisorOptions" class="glass-dropdown hidden" style="position: absolute; z-index: 1000; width: 100%; background-color: #fff; max-height: 200px; overflow-y: auto;"></div>
            </div>
        `;
        // Insere o filtro de Supervisor logo APÓS o filtro de Rota, mantendo o alinhamento
        container.insertBefore(div, rotaGroup.nextSibling); 
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

        // Eventos do Multiselect de Supervisor
        if (this.filtroSupervisorDisplay) {
            this.filtroSupervisorDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                this.filtroSupervisorOptions.classList.toggle('hidden');
            });

            document.addEventListener('click', (e) => {
                if (!this.filtroSupervisorDisplay.contains(e.target) && !this.filtroSupervisorOptions.contains(e.target)) {
                    this.filtroSupervisorOptions.classList.add('hidden');
                }
            });
            this.filtroSupervisorOptions.addEventListener('change', () => {
                this.atualizarTextoSupervisor();
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
                .select('numero, supervisor')
                .order('numero', { ascending: true });

            if (error) throw error;

            this.filtroRotaOptions.innerHTML = '';
            
            // Prepara lista de Supervisores
            const supervisores = [...new Set(rotas.map(r => r.supervisor).filter(Boolean))].sort();
            this.popularFiltroSupervisor(supervisores);
            
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
                this.rotasCache = rotas; // Salva para lookup de supervisor
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

    popularFiltroSupervisor(supervisores) {
        if (!this.filtroSupervisorOptions) return;
        this.filtroSupervisorOptions.innerHTML = '';
        
        // Container Sticky para busca e limpar
        const stickyContainer = document.createElement('div');
        stickyContainer.style.cssText = 'position: sticky; top: 0; background: white; z-index: 20; border-bottom: 1px solid #eee;';

        // Input de Busca
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Buscar supervisor...';
        searchInput.style.cssText = 'width: 100%; padding: 10px; border: none; border-bottom: 1px solid #eee; outline: none; box-sizing: border-box;';
        searchInput.onclick = (e) => e.stopPropagation();
        searchInput.addEventListener('input', (e) => {
             const term = e.target.value.toLowerCase();
             const options = this.filtroSupervisorOptions.querySelectorAll('label.custom-option');
             options.forEach(opt => {
                 const text = opt.textContent.toLowerCase();
                 opt.style.display = text.includes(term) ? 'block' : 'none';
             });
        });
        stickyContainer.appendChild(searchInput);

        // Botão Limpar
        const btnLimpar = document.createElement('div');
        btnLimpar.className = 'custom-option';
        btnLimpar.style.cssText = 'color: #dc3545; font-weight: bold; text-align: center; cursor: pointer; border-bottom: 1px solid #eee; padding: 10px;';
        btnLimpar.textContent = 'Limpar Seleção';
        btnLimpar.onclick = (e) => {
            e.stopPropagation();
            this.filtroSupervisorOptions.querySelectorAll('.supervisor-checkbox').forEach(cb => cb.checked = false);
            this.atualizarTextoSupervisor();
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
        };
        stickyContainer.appendChild(btnLimpar);

        this.filtroSupervisorOptions.appendChild(stickyContainer);

        supervisores.forEach(sup => {
            const label = document.createElement('label');
            label.className = 'custom-option';
            label.innerHTML = `<input type="checkbox" class="supervisor-checkbox" value="${sup}" style="margin-right: 8px;"> ${sup}`;
            this.filtroSupervisorOptions.appendChild(label);
        });
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

    atualizarTextoSupervisor() {
        const checkboxes = this.filtroSupervisorOptions.querySelectorAll('.supervisor-checkbox:checked');
        const selecionados = Array.from(checkboxes).map(cb => cb.value);
        
        if (selecionados.length === 0) {
            this.filtroSupervisorText.textContent = 'Todos';
        } else if (selecionados.length <= 2) {
            this.filtroSupervisorText.textContent = selecionados.join(', ');
        } else {
            this.filtroSupervisorText.textContent = `${selecionados.length} selecionados`;
        }
    },

    async carregarDados() {
        try {
            this.tableBodyResultados.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';
            
            // Captura filtros selecionados antes do loop
            const rotasSelecionadas = Array.from(this.filtroRotaOptions.querySelectorAll('.rota-checkbox:checked')).map(cb => cb.value);
            const supervisoresSelecionados = Array.from(this.filtroSupervisorOptions.querySelectorAll('.supervisor-checkbox:checked')).map(cb => cb.value);
            const hoteisSelecionados = Array.from(this.filtroHotelOptions.querySelectorAll('.hotel-checkbox:checked')).map(cb => cb.value);

            // Define o intervalo de busca para o ano inteiro baseado na Data Início
            const anoReferencia = new Date(this.dataInicio.value).getFullYear();
            const dataInicioAno = `${anoReferencia}-01-01`;
            const dataFimAno = `${anoReferencia}-12-31`;

            let baseQuery = supabaseClient
                .from('despesas')
                .select('*, hoteis(nome), funcionario1:id_funcionario1(nome_completo), funcionario2:id_funcionario2(nome_completo)')
                .gte('data_checkin', dataInicioAno)
                .lte('data_checkin', dataFimAno);

            // Lógica de paginação para buscar todos os registros sem o limite de 1000
            let allData = [];
            let from = 0;
            const step = 1000;
            let keepFetching = true;

            while (keepFetching) {
                // Cria uma nova instância da query para cada página para evitar conflitos de range
                let query = baseQuery.range(from, from + step - 1);

                // Filtro de Múltiplas Rotas
                if (rotasSelecionadas.length > 0) {
                    const orCondition = rotasSelecionadas.map(r => `numero_rota.ilike.%${r}%`).join(',');
                    query = query.or(orCondition);
                }

                // Filtro de Supervisor (Server-side optimization)
                if (supervisoresSelecionados.length > 0) {
                    const rotasDosSupervisores = this.rotasCache
                        .filter(r => supervisoresSelecionados.includes(r.supervisor))
                        .map(r => r.numero);
                    
                    if (rotasDosSupervisores.length > 0) {
                        const orSupervisor = rotasDosSupervisores.map(r => `numero_rota.ilike.%${r}%`).join(',');
                        query = query.or(orSupervisor); 
                    } else {
                        query = query.eq('id', -1);
                    }
                }
                
                // Filtro de Hotéis
                if (hoteisSelecionados.length > 0) {
                    query = query.in('id_hotel', hoteisSelecionados);
                }

                const { data, error } = await query;

                if (error) throw error;

                if (data && data.length > 0) {
                    allData.push(...data);
                    if (data.length < step) {
                        keepFetching = false; // Última página
                    } else {
                        from += step; // Prepara para a próxima página
                    }
                } else {
                    keepFetching = false; // Não há mais dados
                }
            }

            // Enriquecer dados com Supervisor
            allData = allData.map(item => {
                if (item.numero_rota) {
                    // Suporta múltiplas rotas separadas por vírgula e remove espaços
                    const rotasArr = String(item.numero_rota).split(',').map(s => s.trim());
                    const supervisores = rotasArr.map(rNum => {
                        // Compara como string para garantir que ache '101' e 101
                        const r = this.rotasCache.find(rc => String(rc.numero) === rNum);
                        return r ? r.supervisor : null;
                    }).filter(Boolean); // Remove nulos
                    
                    const uniqueSupervisors = [...new Set(supervisores)];
                    item.supervisor = uniqueSupervisors.length > 0 ? uniqueSupervisors.join(', ') : '-';
                } else {
                    item.supervisor = '-';
                }
                return item;
            });

            // Refinamento de Filtro no Cliente (Para garantir precisão)
            if (supervisoresSelecionados.length > 0) {
                allData = allData.filter(item => {
                    if (item.supervisor === '-' || !item.supervisor) return false;
                    const itemSupers = item.supervisor.split(', ');
                    return itemSupers.some(s => supervisoresSelecionados.includes(s));
                });
            }

            // Refinamento de Filtro de Rota (opcional, para evitar falsos positivos do ilike)
            if (rotasSelecionadas.length > 0) {
                allData = allData.filter(item => {
                    const itemRotas = String(item.numero_rota || '').split(',').map(r => r.trim());
                    return itemRotas.some(r => rotasSelecionadas.includes(r));
                });
            }

            // Filtra os dados no cliente para o período selecionado (afeta Tabela e KPIs)
            const dadosFiltradosPeriodo = allData.filter(item => {
                return item.data_checkin >= this.dataInicio.value && item.data_checkin <= this.dataFim.value;
            });

            this.filteredData = dadosFiltradosPeriodo;

            this.atualizarKPIs(this.filteredData);
            this.renderizarGraficos(this.filteredData, allData);
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

    renderizarGraficos(data, dataAnoTodo) {
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
        this.renderChartEvolucaoMensal(dataAnoTodo || data);
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

    renderChartEvolucaoMensal(data) {
        const mesesLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const custosPorMes = new Array(12).fill(0);
        
        // Obtém o ano atual do filtro ou do sistema
        const anoReferencia = new Date(this.dataInicio.value).getFullYear();

        data.forEach(item => {
            if (item.data_checkin) {
                const dataCheckin = new Date(item.data_checkin + 'T00:00:00');
                // Agrupa apenas se for do mesmo ano que o filtro inicial para manter consistência
                if (dataCheckin.getFullYear() === anoReferencia) {
                    const mesIndex = dataCheckin.getMonth();
                    custosPorMes[mesIndex] += (item.valor_total || 0);
                }
            }
        });

        this.criarGrafico(this.chartEvolucaoMensalCanvas, 'line', mesesLabels, custosPorMes, `Custo Mensal (${anoReferencia})`, {
            fill: true,
            tension: 0.3
        });
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

    handleSort(column) {
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'asc';
        }
        this.renderizarTabela(this.filteredData);
    },

    updateTableHeaders() {
        const table = this.tableBodyResultados.closest('table');
        if (!table) return;
        
        let thead = table.querySelector('thead');
        if (!thead) {
            thead = document.createElement('thead');
            table.prepend(thead);
        }

        thead.innerHTML = `
            <tr>
                <th data-sort="data_checkin" style="cursor:pointer">DATA <i class="fas fa-sort"></i></th>
                <th data-sort="numero_rota" style="cursor:pointer">ROTA <i class="fas fa-sort"></i></th>
                <th data-sort="supervisor" style="cursor:pointer">SUPERVISOR <i class="fas fa-sort"></i></th>
                <th data-sort="hotel" style="cursor:pointer">HOTEL <i class="fas fa-sort"></i></th>
                <th data-sort="funcionarios" style="cursor:pointer">FUNCIONÁRIOS <i class="fas fa-sort"></i></th>
                <th data-sort="qtd_diarias" style="text-align: center; cursor:pointer">DIÁRIAS <i class="fas fa-sort"></i></th>
                <th data-sort="valor_total" style="cursor:pointer">VALOR <i class="fas fa-sort"></i></th>
            </tr>
        `;

        // Re-attach listeners
        thead.querySelectorAll('th[data-sort]').forEach(th => {
            const icon = th.querySelector('i');
            if (th.dataset.sort === this.currentSort.column) {
                icon.className = this.currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            } else {
                icon.className = 'fas fa-sort';
            }
            th.addEventListener('click', () => this.handleSort(th.dataset.sort));
        });
    },

    renderizarTabela(data) {
        this.updateTableHeaders();
        this.tableBodyResultados.innerHTML = '';
        
        if (!data || data.length === 0) {
            this.tableBodyResultados.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
            this.totalQtd.textContent = '0';
            this.totalValor.textContent = 'R$ 0,00';
            return;
        }

        // Ordenação
        data.sort((a, b) => {
            let valA = a[this.currentSort.column];
            let valB = b[this.currentSort.column];

            if (this.currentSort.column === 'data_checkin') {
                valA = new Date(valA);
                valB = new Date(valB);
            } else if (this.currentSort.column === 'hotel') {
                valA = a.hoteis?.nome || '';
                valB = b.hoteis?.nome || '';
            } else if (this.currentSort.column === 'funcionarios') {
                valA = a.funcionario1?.nome_completo || '';
                valB = b.funcionario1?.nome_completo || '';
            } else {
                // Trata nulls/undefined como string vazia ou 0
                valA = valA || '';
                valB = valB || '';
            }

            if (valA < valB) return this.currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return this.currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

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
                <td>${item.supervisor || '-'}</td>
                <td>${item.hoteis?.nome || '-'}</td>
                <td>${funcionariosHtml || '-'}</td>
                <td style="text-align: center;">${item.qtd_diarias || 1}</td>
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

        const tableColumn = ["Data", "Rota", "Hotel", "Funcionários", "Diárias", "Valor"];
        const tableRows = this.filteredData.map(item => [
            new Date(item.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR'),
            item.numero_rota,
            item.hoteis?.nome || '-',
            { func1: item.funcionario1?.nome_completo || '', func2: item.funcionario2?.nome_completo || '' },
            (item.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        ]);
        // Adiciona a coluna de diárias ao mapeamento
        tableRows.forEach(row => row.splice(4, 0, row[3].func1 ? this.filteredData.find(item => item.funcionario1?.nome_completo === row[3].func1).qtd_diarias : '-'));

        // Adiciona linha de total
        const totalValor = this.filteredData.reduce((acc, item) => acc + (item.valor_total || 0), 0);
        tableRows.push(['', '', '', 'TOTAL GERAL', '', totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })]);

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [0, 105, 55] },
            columnStyles: {
                4: { halign: 'center' }, // Alinha a coluna Diárias ao centro
                5: { halign: 'right', fontStyle: 'bold', cellWidth: 40 } // Alinha a coluna Valor à direita
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
