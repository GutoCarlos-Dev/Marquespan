import { supabaseClient } from './supabase.js';

const ColetarManutencaoUI = {
    init() {
        console.log('Página de Coleta de Manutenção iniciada.');
        this.cacheDOM();
        this.bindEvents();
        this.initTabs();
        this.carregarLancamentos(); // Carrega a lista ao iniciar
        this.veiculosData = [];
        this.editingId = null; // Variável para controlar o estado de edição
        this.currentSort = { column: 'data_hora', direction: 'desc' }; // Estado inicial da ordenação
    },

    cacheDOM() {
        this.btnAdicionarLancamento = document.getElementById('btnAdicionarLancamento');
        
        // Modal
        this.modal = document.getElementById('modalLancamento');
        this.btnCloseModal = this.modal.querySelector('.close-button');
        this.formColeta = document.getElementById('formLancamentoColeta');
        this.coletaDataHoraInput = document.getElementById('coletaDataHora');
        this.coletaUsuarioInput = document.getElementById('coletaUsuario');
        this.coletaPlacaInput = document.getElementById('coletaPlaca');
        this.coletaModeloInput = document.getElementById('coletaModelo');
        this.veiculosList = document.getElementById('veiculosList');
        this.tableBodyLancamentos = document.getElementById('tableBodyLancamentos');
        this.searchPlacaInput = document.getElementById('searchPlaca');

        // Exportação
        this.formExportacao = document.getElementById('formExportacao');
        this.filtroSemana = document.getElementById('filtroSemana');
        this.filtroDataIni = document.getElementById('filtroDataIni');
        this.filtroDataFim = document.getElementById('filtroDataFim');
        this.filtroItem = document.getElementById('filtroItem');
        this.filtroStatus = document.getElementById('filtroStatus');
        this.btnBuscarRelatorio = document.getElementById('btnBuscarRelatorio');
        this.tableBodyRelatorio = document.getElementById('tableBodyRelatorio');
        this.btnExportarPDF = document.getElementById('btnExportarPDF');
    },

    bindEvents() {
        this.btnAdicionarLancamento.addEventListener('click', () => this.abrirModal());
        this.btnCloseModal.addEventListener('click', () => this.fecharModal());
        this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this.fecharModal(); });
        this.coletaPlacaInput.addEventListener('change', () => this.preencherModeloVeiculo());
        this.formColeta.addEventListener('submit', (e) => this.registrarColeta(e));
        
        // Event delegation para botões da tabela
        this.tableBodyLancamentos.addEventListener('click', (e) => {
            const btnDelete = e.target.closest('.btn-delete');
            const btnEdit = e.target.closest('.btn-edit');
            if (btnDelete) this.excluirColeta(btnDelete.dataset.id);
            if (btnEdit) this.editarColeta(btnEdit.dataset.id);
        });

        if (this.searchPlacaInput) {
            this.searchPlacaInput.addEventListener('input', () => this.carregarLancamentos());
        }

        if(this.formExportacao) this.formExportacao.addEventListener('submit', (e) => this.gerarRelatorioExcel(e));
        if(this.btnBuscarRelatorio) this.btnBuscarRelatorio.addEventListener('click', () => this.buscarRelatorio());
        if(this.btnExportarPDF) this.btnExportarPDF.addEventListener('click', (e) => this.gerarRelatorioPDF(e));

        // Automação do status ao digitar detalhes
        document.querySelectorAll('.checklist-details').forEach(input => {
            input.addEventListener('input', (e) => {
                const statusSelect = e.target.closest('.checklist-item').querySelector('.checklist-status');
                if (statusSelect && statusSelect.value === "") {
                    statusSelect.value = "NAO REALIZADO";
                }
            });
        });

        // Lógica específica para ELETRICA INTERNA
        const eletricaItem = document.querySelector('.checklist-item[data-item="ELETRICA INTERNA"]');
        if (eletricaItem) {
            const statusSelect = eletricaItem.querySelector('.checklist-status');
            statusSelect.addEventListener('change', (e) => {
                const extraField = document.getElementById('extra-eletrica-interna');
                if (e.target.value === 'OK') {
                    extraField.classList.remove('hidden');
                } else {
                    extraField.classList.add('hidden');
                    extraField.querySelector('input').value = ''; // Limpa se não for OK
                }
            });
        }

        // Eventos de ordenação da grid
        document.querySelectorAll('#sectionLancamento th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.sort));
        });
    },

    initTabs() {
        const buttons = document.querySelectorAll('#menu-coletar-manutencao .painel-btn');
        const sections = document.querySelectorAll('.main-content .section');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                sections.forEach(s => s.classList.add('hidden'));

                btn.classList.add('active');
                const targetId = btn.getAttribute('data-secao');
                document.getElementById(targetId)?.classList.remove('hidden');
            });
        });
    },

    abrirModal() {
        this.editingId = null; // Reseta o ID de edição para criar um novo
        this.formColeta.reset();
        this.preencherDadosPadrao();
        this.carregarVeiculos();
        this.modal.classList.remove('hidden');
    },

    fecharModal() {
        this.modal.classList.add('hidden');
    },

    preencherDadosPadrao() {
        // Preenche data e hora
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        this.coletaDataHoraInput.value = now.toISOString().slice(0, 16);

        // Preenche usuário
        const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
        if (usuario && usuario.nome) {
            this.coletaUsuarioInput.value = usuario.nome;
        }

        // Preenche Semana (Calculada a partir de 28/12/2025)
        const semana = this.calculateCurrentWeek();
        const semanaInput = document.getElementById('coletaSemana');
        if (semanaInput) {
            semanaInput.value = semana;
        }
    },

    calculateCurrentWeek() {
        const startDate = new Date('2025-12-28T00:00:00');
        const today = new Date();
        const diffInMs = today.getTime() - startDate.getTime();
        const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
        
        let weekNumber = Math.floor(diffInDays / 7) + 1;
        if (weekNumber < 1) weekNumber = 1; // Garante que não seja menor que 1
        return String(weekNumber).padStart(2, '0');
    },

    async carregarVeiculos() {
        try {
            const { data, error } = await supabaseClient
                .from('veiculos')
                .select('placa, modelo')
                .order('placa');
            if (error) throw error;

            this.veiculosList.innerHTML = '';
            this.veiculosData = data; // Armazena para uso posterior
            data.forEach(veiculo => {
                const option = document.createElement('option');
                option.value = veiculo.placa;
                option.textContent = veiculo.modelo;
                this.veiculosList.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar veículos:', error);
        }
    },

    preencherModeloVeiculo() {
        const placaSelecionada = this.coletaPlacaInput.value;
        const veiculo = this.veiculosData.find(v => v.placa === placaSelecionada);
        if (veiculo) {
            this.coletaModeloInput.value = veiculo.modelo;
        } else {
            this.coletaModeloInput.value = '';
        }
    },

    async registrarColeta(e) {
        e.preventDefault();
        
        const semana = document.getElementById('coletaSemana').value;
        const dataHora = document.getElementById('coletaDataHora').value;
        const usuario = document.getElementById('coletaUsuario').value;
        const placa = document.getElementById('coletaPlaca').value.toUpperCase();
        const modelo = document.getElementById('coletaModelo').value;
        const km = document.getElementById('coletaKm').value;

        // Validação de duplicidade visual na grid atual
        if (!this.editingId) { // Só valida duplicidade se for novo registro
            const duplicado = Array.from(this.tableBodyLancamentos.querySelectorAll('tr td:nth-child(3)'))
                .some(td => td.textContent === placa);
                
            if (duplicado) {
                if (!confirm(`⚠️ ATENÇÃO: A placa ${placa} já consta na lista de lançamentos abaixo. Deseja registrar novamente?`)) {
                    return;
                }
            }
        }

        const checklistItems = [];
        document.querySelectorAll('.checklist-item').forEach(item => {
            const nomeItem = item.dataset.item;
            const detalhes = item.querySelector('.checklist-details').value;
            const status = item.querySelector('.checklist-status').value;
            let pecasUsadas = null;

            // Captura peças usadas se for Elétrica Interna e estiver visível
            if (nomeItem === 'ELETRICA INTERNA') {
                const extraInput = document.getElementById('extra-eletrica-interna').querySelector('input');
                if (!document.getElementById('extra-eletrica-interna').classList.contains('hidden')) {
                    pecasUsadas = extraInput.value;
                }
            }
            
            checklistItems.push({
                item: nomeItem, detalhes, status, pecas_usadas: pecasUsadas
            });
        });

        try {
            let coletaId;

            if (this.editingId) {
                // --- MODO EDIÇÃO ---
                const { error: updateError } = await supabaseClient
                    .from('coletas_manutencao')
                    .update({
                        semana,
                        data_hora: dataHora,
                        usuario,
                        placa,
                        modelo,
                        km: parseInt(km)
                    })
                    .eq('id', this.editingId);

                if (updateError) throw updateError;
                coletaId = this.editingId;

                // Remove itens antigos do checklist para inserir os novos
                await supabaseClient.from('coletas_manutencao_checklist').delete().eq('coleta_id', coletaId);

            } else {
                // --- MODO INSERÇÃO ---
                const { data: coleta, error: coletaError } = await supabaseClient
                    .from('coletas_manutencao')
                    .insert([{
                        semana, data_hora: dataHora, usuario, placa, modelo, km: parseInt(km)
                    }])
                    .select()
                    .single();

                if (coletaError) throw coletaError;
                coletaId = coleta.id;
            }

            // 2. Salvar itens do checklist
            const checklistPayload = checklistItems.map(i => ({
                coleta_id: coletaId,
                item: i.item,
                detalhes: i.detalhes,
                status: i.status,
                pecas_usadas: i.pecas_usadas
            }));

            const { error: checklistError } = await supabaseClient
                .from('coletas_manutencao_checklist')
                .insert(checklistPayload);

            if (checklistError) throw checklistError;

            alert(`✅ Coleta ${this.editingId ? 'atualizada' : 'registrada'} com sucesso!`);
            this.fecharModal();
            this.carregarLancamentos(); // Atualiza a grid

        } catch (err) {
            console.error('Erro ao salvar coleta:', err);
            alert('Erro ao salvar coleta: ' + err.message);
        }
    },

    async carregarLancamentos() {
        this.tableBodyLancamentos.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
        try {
            let query = supabaseClient
                .from('coletas_manutencao')
                .select('*');

            // Ordenação dinâmica
            query = query.order(this.currentSort.column, { ascending: this.currentSort.direction === 'asc' });
            query = query.limit(50);

            const searchTerm = this.searchPlacaInput?.value.trim().toUpperCase();
            if (searchTerm) {
                query = query.ilike('placa', `%${searchTerm}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

            this.tableBodyLancamentos.innerHTML = '';
            if (!data || data.length === 0) {
                this.tableBodyLancamentos.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum lançamento encontrado.</td></tr>';
                return;
            }

            data.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(item.data_hora).toLocaleString('pt-BR')}</td>
                    <td>${item.semana}</td>
                    <td>${item.placa}</td>
                    <td>${item.usuario}</td>
                    <td>
                        <button class="btn-action btn-edit" data-id="${item.id}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="btn-action btn-delete" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBodyLancamentos.appendChild(tr);
            });
        } catch (err) {
            console.error('Erro ao carregar lançamentos:', err);
            this.tableBodyLancamentos.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        }
    },

    handleSort(column) {
        if (this.currentSort.column === column) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = column;
            this.currentSort.direction = 'asc';
        }
        this.updateSortIcons();
        this.carregarLancamentos();
    },

    updateSortIcons() {
        document.querySelectorAll('#sectionLancamento th[data-sort] i').forEach(icon => {
            icon.className = 'fas fa-sort'; // Reset
            const th = icon.closest('th');
            if (th.dataset.sort === this.currentSort.column) {
                icon.className = this.currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    async editarColeta(id) {
        try {
            // 1. Buscar dados do cabeçalho
            const { data: coleta, error: coletaError } = await supabaseClient
                .from('coletas_manutencao')
                .select('*')
                .eq('id', id)
                .single();
            
            if (coletaError) throw coletaError;

            // 2. Buscar itens do checklist
            const { data: checklist, error: checklistError } = await supabaseClient
                .from('coletas_manutencao_checklist')
                .select('*')
                .eq('coleta_id', id);

            if (checklistError) throw checklistError;

            // 3. Preencher o formulário
            this.editingId = id;
            document.getElementById('coletaSemana').value = coleta.semana;
            
            // Ajuste de fuso horário para o input datetime-local
            const date = new Date(coleta.data_hora);
            date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
            document.getElementById('coletaDataHora').value = date.toISOString().slice(0, 16);
            
            document.getElementById('coletaUsuario').value = coleta.usuario;
            document.getElementById('coletaPlaca').value = coleta.placa;
            document.getElementById('coletaModelo').value = coleta.modelo;
            document.getElementById('coletaKm').value = coleta.km;

            // 4. Preencher o checklist
            // Primeiro limpa tudo
            document.querySelectorAll('.checklist-item').forEach(div => {
                div.querySelector('.checklist-details').value = '';
                div.querySelector('.checklist-status').value = '';
            });
            // Limpa campo extra
            const extraField = document.getElementById('extra-eletrica-interna');
            extraField.classList.add('hidden');
            extraField.querySelector('input').value = '';

            // Depois preenche com o que veio do banco
            checklist.forEach(item => {
                const div = document.querySelector(`.checklist-item[data-item="${item.item}"]`);
                if (div) {
                    div.querySelector('.checklist-details').value = item.detalhes || '';
                    div.querySelector('.checklist-status').value = item.status || '';

                    // Lógica específica para preencher Elétrica Interna
                    if (item.item === 'ELETRICA INTERNA' && item.status === 'OK') {
                        extraField.classList.remove('hidden');
                        extraField.querySelector('input').value = item.pecas_usadas || '';
                    }
                }
            });

            this.modal.classList.remove('hidden');
        } catch (err) {
            console.error('Erro ao carregar para edição:', err);
            alert('Erro ao carregar dados: ' + err.message);
        }
    },

    async excluirColeta(id) {
        if (!confirm('Deseja realmente excluir este lançamento?')) return;
        try {
            // Supabase deve estar configurado com ON DELETE CASCADE, mas por segurança deletamos os itens primeiro se necessário
            await supabaseClient.from('coletas_manutencao_checklist').delete().eq('coleta_id', id);
            
            const { error } = await supabaseClient.from('coletas_manutencao').delete().eq('id', id);
            if (error) throw error;
            
            this.carregarLancamentos();
        } catch (err) {
            alert('Erro ao excluir: ' + err.message);
        }
    },

    async buscarRelatorio() {
        this.tableBodyRelatorio.innerHTML = '<tr><td colspan="7" class="text-center">Buscando...</td></tr>';
        
        try {
            // Busca na tabela de checklist fazendo join com a tabela pai (coletas_manutencao)
            // O !inner força que o registro pai exista e obedeça aos filtros aplicados nele
            let query = supabaseClient
                .from('coletas_manutencao_checklist')
                .select('*, coletas_manutencao!inner(*)');

            // Filtros do Checklist
            if (this.filtroItem.value) query = query.eq('item', this.filtroItem.value);
            if (this.filtroStatus.value) query = query.eq('status', this.filtroStatus.value);
            
            // Filtros da Coleta (Pai)
            if (this.filtroSemana.value) query = query.eq('coletas_manutencao.semana', this.filtroSemana.value);
            if (this.filtroDataIni.value) query = query.gte('coletas_manutencao.data_hora', this.filtroDataIni.value + 'T00:00:00');
            if (this.filtroDataFim.value) query = query.lte('coletas_manutencao.data_hora', this.filtroDataFim.value + 'T23:59:59');

            const { data, error } = await query;
            if (error) throw error;

            this.tableBodyRelatorio.innerHTML = '';
            if (!data || data.length === 0) {
                this.tableBodyRelatorio.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum registro encontrado.</td></tr>';
                return;
            }

            // Ordenação local por data (decrescente)
            data.sort((a, b) => new Date(b.coletas_manutencao.data_hora) - new Date(a.coletas_manutencao.data_hora));

            data.forEach(item => {
                const coleta = item.coletas_manutencao;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(coleta.data_hora).toLocaleString('pt-BR')}</td>
                    <td>${coleta.semana}</td>
                    <td>${coleta.placa}</td>
                    <td>${item.item}</td>
                    <td>${item.status}</td>
                    <td>${item.detalhes || '-'}</td>
                    <td>${item.pecas_usadas || '-'}</td>
                `;
                this.tableBodyRelatorio.appendChild(tr);
            });

        } catch (err) {
            console.error('Erro ao buscar relatório:', err);
            this.tableBodyRelatorio.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao buscar dados.</td></tr>';
        }
    },

    async gerarRelatorioExcel(e) {
        e.preventDefault();
        const btn = this.formExportacao.querySelector('button');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

        try {
            // Mesma lógica de query do buscarRelatorio para consistência
            let query = supabaseClient
                .from('coletas_manutencao_checklist')
                .select('*, coletas_manutencao!inner(*)');

            if (this.filtroItem.value) query = query.eq('item', this.filtroItem.value);
            if (this.filtroStatus.value) query = query.eq('status', this.filtroStatus.value);
            
            if (this.filtroSemana.value) query = query.eq('coletas_manutencao.semana', this.filtroSemana.value);
            if (this.filtroDataIni.value) query = query.gte('coletas_manutencao.data_hora', this.filtroDataIni.value + 'T00:00:00');
            if (this.filtroDataFim.value) query = query.lte('coletas_manutencao.data_hora', this.filtroDataFim.value + 'T23:59:59');

            const { data, error } = await query;
            if (error) throw error;

            if (!data || data.length === 0) {
                alert('Nenhum dado encontrado para os filtros selecionados.');
                return;
            }

            // Ordenação
            data.sort((a, b) => new Date(b.coletas_manutencao.data_hora) - new Date(a.coletas_manutencao.data_hora));

            const dadosPlanilha = [];
            data.forEach(item => {
                const coleta = item.coletas_manutencao;
                dadosPlanilha.push({
                    'Data/Hora': new Date(coleta.data_hora).toLocaleString('pt-BR'),
                    'Semana': coleta.semana,
                    'Placa': coleta.placa,
                    'Modelo': coleta.modelo,
                    'KM': coleta.km,
                    'Usuário': coleta.usuario,
                    'Item Verificado': item.item,
                    'Status': item.status,
                    'Detalhes': item.detalhes,
                    'Peças Usadas': item.pecas_usadas || ''
                });
            });

            const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Relatorio_Manutencao");
            XLSX.writeFile(wb, `Coleta_Manutencao_${new Date().toISOString().slice(0,10)}.xlsx`);

        } catch (err) {
            console.error('Erro ao exportar:', err);
            alert('Erro ao gerar arquivo: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },

    async gerarRelatorioPDF(e) {
        e.preventDefault();
        const btn = this.btnExportarPDF;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

        try {
            // Mesma lógica de query para consistência
            let query = supabaseClient
                .from('coletas_manutencao_checklist')
                .select('*, coletas_manutencao!inner(*)');

            if (this.filtroItem.value) query = query.eq('item', this.filtroItem.value);
            if (this.filtroStatus.value) query = query.eq('status', this.filtroStatus.value);
            
            if (this.filtroSemana.value) query = query.eq('coletas_manutencao.semana', this.filtroSemana.value);
            if (this.filtroDataIni.value) query = query.gte('coletas_manutencao.data_hora', this.filtroDataIni.value + 'T00:00:00');
            if (this.filtroDataFim.value) query = query.lte('coletas_manutencao.data_hora', this.filtroDataFim.value + 'T23:59:59');

            const { data, error } = await query;
            if (error) throw error;

            if (!data || data.length === 0) {
                alert('Nenhum dado encontrado para os filtros selecionados.');
                return;
            }

            // Ordenação
            data.sort((a, b) => new Date(b.coletas_manutencao.data_hora) - new Date(a.coletas_manutencao.data_hora));

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape' });

            // 1. Carregar a imagem do logo
            const getLogoBase64 = async () => {
                try {
                    const response = await fetch('logo.png');
                    const blob = await response.blob();
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.warn('Logo não encontrado');
                    return null;
                }
            };

            const logoBase64 = await getLogoBase64();

            // 2. Cabeçalho com Logo
            if (logoBase64) {
                doc.addImage(logoBase64, 'PNG', 14, 10, 40, 10);
            }

            doc.setFontSize(18);
            doc.text("Relatório de Coleta de Manutenção", 14, 28);
            doc.setFontSize(10);
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 34);

            // 3. Tabela
            const tableBody = data.map(item => {
                const coleta = item.coletas_manutencao;
                return [
                    new Date(coleta.data_hora).toLocaleString('pt-BR'),
                    coleta.semana,
                    coleta.placa,
                    coleta.modelo || '-',
                    coleta.km,
                    coleta.usuario,
                    item.item,
                    item.status,
                    item.detalhes || '',
                    item.pecas_usadas || ''
                ];
            });

            doc.autoTable({
                head: [['Data/Hora', 'Semana', 'Placa', 'Modelo', 'KM', 'Usuário', 'Item', 'Status', 'Detalhes', 'Peças']],
                body: tableBody,
                startY: 40,
                headStyles: { fillColor: [0, 105, 55] }, // Verde Marquespan
                styles: { fontSize: 8 },
                columnStyles: {
                    8: { cellWidth: 40 }, // Detalhes
                    9: { cellWidth: 30 }  // Peças
                }
            });

            doc.save(`Relatorio_Manutencao_${new Date().toISOString().slice(0,10)}.pdf`);

        } catch (err) {
            console.error('Erro ao exportar PDF:', err);
            alert('Erro ao gerar PDF: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ColetarManutencaoUI.init();
});