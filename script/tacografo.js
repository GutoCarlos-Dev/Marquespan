import { supabaseClient } from './supabase.js';

const TacografoUI = {
    data: [],
    filteredData: [], // Armazena os dados filtrados para exportação global
    sortConfig: { key: 'placa', asc: true },

    async init() {
        this.injectStyles();
        this.cacheDOM();
        this.bindEvents();
        await this.carregarDados();
    },

    injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            .status-dispensado {
                background-color: #6c757d !important;
                color: white !important;
            }
            .badge.status-dispensado {
                background-color: #6c757d !important;
                color: white !important;
            }
        `;
        document.head.appendChild(style);
    },

    cacheDOM() {
        this.tbody = document.getElementById('tbodyTacografo');
        this.searchInput = document.getElementById('searchTacografo');
        this.statusFilterDisplay = document.getElementById('filterStatusDisplay');
        this.statusFilterOptions = document.getElementById('filterStatusOptions');
        this.statusFilterText = document.getElementById('filterStatusText');

        this.vencIniFilter = document.getElementById('filterVencIni');
        this.vencFimFilter = document.getElementById('filterVencFim');
        this.btnAtualizar = document.getElementById('btnAtualizar');
        this.btnImportar = document.getElementById('btnImportar');
        this.btnExportarPDF = document.getElementById('btnExportarPDF'); // Botão global (se existir no HTML)
        this.fileImportar = document.getElementById('fileImportar');
        // Contadores de legenda
        this.counterPendente = document.getElementById('count-pendente');
        this.counterPreliminar = document.getElementById('count-preliminar');
        this.counterEmDia = document.getElementById('count-em-dia');
        this.counterDispensado = document.getElementById('count-dispensado');
    },

    bindEvents() {
        this.btnAtualizar.addEventListener('click', () => this.carregarDados());
        this.btnImportar?.addEventListener('click', () => this.fileImportar.click());
        this.fileImportar?.addEventListener('change', (e) => this.importarXLSX(e));
        this.searchInput.addEventListener('input', () => this.renderGrid());
        
        this.statusFilterDisplay?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.statusFilterOptions.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!this.statusFilterDisplay?.contains(e.target) && !this.statusFilterOptions?.contains(e.target)) {
                this.statusFilterOptions?.classList.add('hidden');
            }
        });

        this.statusFilterOptions?.addEventListener('change', () => {
            this.updateStatusFilterText();
            this.renderGrid();
        });

        this.vencIniFilter.addEventListener('change', () => this.renderGrid());
        this.vencFimFilter.addEventListener('change', () => this.renderGrid());
        
        this.btnExportarPDF?.addEventListener('click', () => this.exportarGridPDF());

        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.sort));
        });
    },

    updateStatusFilterText() {
        const checked = Array.from(this.statusFilterOptions.querySelectorAll('.status-checkbox:checked'));
        if (checked.length === 0) {
            this.statusFilterText.textContent = 'Todos';
        } else if (checked.length <= 2) {
            this.statusFilterText.textContent = checked.map(cb => cb.value).join(', ');
        } else {
            this.statusFilterText.textContent = `${checked.length} selecionados`;
        }
    },

    async carregarDados() {
        this.tbody.innerHTML = '<tr><td colspan="9" class="text-center">Buscando dados no banco...</td></tr>';
        
        try {
            // Buscamos veículos ativos
            const { data: veiculos, error: errV } = await supabaseClient
                .from('veiculos')
                .select('filial, placa, modelo, renavan, tipo')
                .eq('situacao', 'ativo')
                .order('placa');

            if (errV) throw errV;

            // Buscamos dados da tabela de tacógrafos separadamente para evitar erro 400 de join
            const { data: tacografos, error: errT } = await supabaseClient
                .from('tacografos')
                .select('*');

            // Criamos um mapa para busca rápida por placa
            const tMap = new Map();
            if (tacografos) {
                tacografos.forEach(t => tMap.set(t.placa, t));
            }

            // Data de hoje no fuso do Brasil (AAAA-MM-DD)
            const todayStr = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});

            this.data = veiculos.map(v => {
                const tData = tMap.get(v.placa) || {};
                let status = tData.status || 'Pendente';
                const venc = tData.data_vencimento;

                // Automação: Sem data vira Dispensado. Com data, segue regra se não for manual.
                if (!venc) {
                    status = 'Dispensado';
                } else if (status !== 'Preliminar' && status !== 'Dispensado') {
                    status = (venc > todayStr) ? 'Em Dia' : 'Pendente';
                }

                return {
                    filial: v.filial || '-',
                    placa: v.placa,
                    modelo: v.modelo || '-',
                    renavan: v.renavan || '-',
                    tipo: v.tipo || '-',
                    data_emissao: tData.data_emissao || '',
                    data_vencimento: venc || '',
                    guia_gru: tData.guia_gru || '',
                    status: status,
                    observacao: tData.observacao || ''
                };
            });

            this.renderGrid();
        } catch (err) {
            console.error('Erro:', err);
            this.tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Erro ao carregar dados: ${err.message}</td></tr>`;
        }
    },

    handleSort(key) {
        if (this.sortConfig.key === key) {
            this.sortConfig.asc = !this.sortConfig.asc;
        } else {
            this.sortConfig.key = key;
            this.sortConfig.asc = true;
        }
        this.updateSortIcons();
        this.renderGrid();
    },

    updateSortIcons() {
        document.querySelectorAll('th[data-sort] i').forEach(icon => {
            icon.className = 'fas fa-sort';
            const th = icon.closest('th');
            if (th.dataset.sort === this.sortConfig.key) {
                icon.className = this.sortConfig.asc ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        });
    },

    renderGrid() {
        const term = this.searchInput.value.toUpperCase();
        const selectedStatuses = Array.from(this.statusFilterOptions.querySelectorAll('.status-checkbox:checked')).map(cb => cb.value);

        const vencIni = this.vencIniFilter.value;
        const vencFim = this.vencFimFilter.value;

        let filtered = this.data.filter(item => {
            const matchSearch = item.placa.includes(term) || 
                               item.modelo.toUpperCase().includes(term) || 
                               item.filial.toUpperCase().includes(term);
            const matchStatus = selectedStatuses.length === 0 || selectedStatuses.includes(item.status);

            let matchVenc = true;
            if (vencIni || vencFim) {
                if (!item.data_vencimento) {
                    matchVenc = false;
                } else {
                    // Compara strings YYYY-MM-DD diretamente
                    if (vencIni && item.data_vencimento < vencIni) matchVenc = false;
                    if (vencFim && item.data_vencimento > vencFim) matchVenc = false;
                }
            }

            return matchSearch && matchStatus && matchVenc;
        });

        this.filteredData = filtered; // Salva para exportação

        // Calcular quantidades por status com base no que está filtrado
        const counts = { Pendente: 0, Preliminar: 0, 'Em Dia': 0, Dispensado: 0 };
        filtered.forEach(item => {
            if (counts.hasOwnProperty(item.status)) counts[item.status]++;
        });

        // Atualizar as legendas no cabeçalho
        this.updateCounters(counts);

        // Ordenação Dinâmica
        filtered.sort((a, b) => {
            let valA = a[this.sortConfig.key] || '';
            let valB = b[this.sortConfig.key] || '';
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return this.sortConfig.asc ? -1 : 1;
            if (valA > valB) return this.sortConfig.asc ? 1 : -1;
            return 0;
        });

        this.tbody.innerHTML = '';
        filtered.forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.placa = item.placa;

            const statusOptions = ['Pendente', 'Preliminar', 'Em Dia', 'Dispensado'];
            let optionsHtml = statusOptions.map(opt => 
                `<option value="${opt}" ${item.status === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');

            const guiaGruOptions = ['', 'PAGO'];
            let guiaGruHtml = guiaGruOptions.map(opt => 
                `<option value="${opt}" ${item.guia_gru === opt ? 'selected' : ''}>${opt || '-'}</option>`
            ).join('');

            tr.innerHTML = `
                <td>${item.filial}</td>
                <td><strong>${item.placa}</strong></td>
                <td>${item.modelo}</td>
                <td class="renavan-cell" data-placa="${item.placa}" ondblclick="TacografoUI.startRenavanEdit(this)">${item.renavan || '-'}</td>
                <td>${item.tipo}</td>
                <td><input type="date" class="table-date-input input-emissao" value="${item.data_emissao}"></td>
                <td><input type="date" class="table-date-input input-vencimento ${this.checkVencimento(item.data_vencimento)}" value="${item.data_vencimento}" onchange="TacografoUI.handleDateChange(this)"></td>
                <td>
                    <select class="status-select-grid guia-gru-select">
                        ${guiaGruHtml}
                    </select>
                </td>
                <td>
                    <select class="status-select-grid ${this.getStatusClass(item.status)}" onchange="this.className = 'status-select-grid ' + TacografoUI.getStatusClass(this.value)">
                        ${optionsHtml}
                    </select>
                </td>
                <td>
                    <input type="text" class="table-date-input input-obs" value="${item.observacao || ''}" placeholder="Observações...">
                </td>
                <td style="display: flex; gap: 5px; justify-content: center;">
                    <button class="btn-icon save" onclick="TacografoUI.salvarLinha('${item.placa}')" title="Salvar">
                        <i class="fas fa-save"></i>
                    </button>
                </td>
            `;
            this.tbody.appendChild(tr);
        });
    },

    updateCounters(counts) {
        if (this.counterPendente) this.counterPendente.textContent = counts.Pendente || 0;
        if (this.counterPreliminar) this.counterPreliminar.textContent = counts.Preliminar || 0;
        if (this.counterEmDia) this.counterEmDia.textContent = counts['Em Dia'] || 0;
        if (this.counterDispensado) this.counterDispensado.textContent = counts.Dispensado || 0;
    },

    getStatusClass(status) {
        if (status === 'Preliminar') return 'status-preliminar';
        if (status === 'Em Dia') return 'status-em-dia';
        if (status === 'Pendente') return 'status-pendente';
        if (status === 'Dispensado') return 'status-dispensado';
        return '';
    },

    /**
     * Atualiza o status automaticamente quando a data de vencimento é alterada na grid
     */
    handleDateChange(input) {
        const tr = input.closest('tr');
        const statusSelect = tr.querySelector('.status-select-grid:not(.guia-gru-select)');
        const currentStatus = statusSelect.value;
        const newVenc = input.value;

        let newStatus = currentStatus;
        if (!newVenc) {
            newStatus = 'Dispensado';
        } else if (currentStatus !== 'Preliminar' && currentStatus !== 'Dispensado') {
            const todayStr = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
            newStatus = (newVenc > todayStr) ? 'Em Dia' : 'Pendente';
        }

        if (statusSelect.value !== newStatus) {
            statusSelect.value = newStatus;
            statusSelect.className = 'status-select-grid ' + this.getStatusClass(newStatus);
        }
        
        // Atualiza a cor do input de data
        input.className = `table-date-input input-vencimento ${this.checkVencimento(newVenc)}`;
    },

    /**
     * Inicia o modo de edição para o campo Renavan via duplo clique.
     */
    async startRenavanEdit(cell) {
        if (!cell || cell.querySelector('input')) return;

        const placa = cell.dataset.placa;
        const originalRenavan = cell.textContent.trim() === '-' ? '' : cell.textContent.trim();

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'table-date-input';
        input.value = originalRenavan;
        input.style.width = '100%';
        input.style.textAlign = 'center';

        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();

        const saveAndExit = async () => {
            const newRenavan = input.value.trim().toUpperCase();
            if (newRenavan === originalRenavan) {
                cell.textContent = originalRenavan || '-';
                return;
            }
            
            try {
                const { error } = await supabaseClient
                    .from('veiculos')
                    .update({ renavan: newRenavan || null })
                    .eq('placa', placa);

                if (error) throw error;

                cell.textContent = newRenavan || '-';
                // Atualiza o cache local para que a ordenação e filtros funcionem com o novo dado
                const item = this.data.find(d => d.placa === placa);
                if (item) item.renavan = newRenavan;
            } catch (err) {
                alert('Erro ao salvar Renavan: ' + err.message);
                cell.textContent = originalRenavan || '-';
            }
        };
        input.addEventListener('blur', saveAndExit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    },

    async salvarLinha(placa) {
        const tr = document.querySelector(`tr[data-placa="${placa}"]`);
        const btn = tr.querySelector('.btn-icon.save');
        
        const status = tr.querySelector('.status-select-grid:not(.guia-gru-select)').value;
        const guia_gru = tr.querySelector('.guia-gru-select').value;
        const data_emissao = tr.querySelector('.input-emissao').value;
        const data_vencimento = tr.querySelector('.input-vencimento').value;
        const observacao = tr.querySelector('.input-obs').value;

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const { error } = await supabaseClient
                .from('tacografos')
                .upsert({
                    placa: placa,
                    status: status,
                    guia_gru: guia_gru,
                    data_emissao: data_emissao || null,
                    data_vencimento: data_vencimento || null,
                    observacao: observacao || null,
                    atualizado_em: new Date().toISOString()
                }, { onConflict: 'placa' });

            if (error) throw error;

            tr.style.backgroundColor = 'rgba(40, 167, 69, 0.1)';
            setTimeout(() => tr.style.backgroundColor = '', 1000);
        } catch (err) {
            alert('Erro ao salvar: ' + err.message);
        } finally {
            btn.innerHTML = '<i class="fas fa-save"></i>';
        }
    },

    checkVencimento(dataVenc) {
        if (!dataVenc) return '';
        const todayStr = new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
        return (dataVenc <= todayStr) ? 'text-danger font-bold' : '';
    },

    async importarXLSX(e) {
        const arquivo = e.target.files[0];
        if (!arquivo) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                if (jsonData.length === 0) throw new Error('O arquivo está vazio.');

                await this.processarImportacao(jsonData);
            } catch (error) {
                console.error('Erro na importação:', error);
                alert('Erro ao processar arquivo: ' + error.message);
            } finally {
                this.fileImportar.value = ''; // Limpa o input
            }
        };
        reader.readAsArrayBuffer(arquivo);
    },

    async processarImportacao(dados) {
        const placasNaoEncontradas = [];
        const atualizacoes = [];
        
        // Criamos um Set com as placas que temos no sistema para busca rápida
        const placasNoSistema = new Set(this.data.map(v => v.placa.toUpperCase()));

        for (const row of dados) {
            // Normalização das chaves para ignorar case e espaços
            const normalizedRow = {};
            Object.keys(row).forEach(key => {
                normalizedRow[key.trim().toUpperCase()] = row[key];
            });

            const placa = String(normalizedRow['PLACA'] || '').trim().toUpperCase();
            const dataEmissao = normalizedRow['DATA EMISSÃO'] || normalizedRow['DATA EMISSAO'];
            const dtVencimento = normalizedRow['DT VENCIMENTO'] || normalizedRow['DATA VENCIMENTO'];

            if (!placa) continue;

            if (placasNoSistema.has(placa)) {
                atualizacoes.push({
                    placa: placa,
                    data_emissao: this.formatarDataExcel(dataEmissao),
                    data_vencimento: this.formatarDataExcel(dtVencimento),
                    atualizado_em: new Date().toISOString()
                });
            } else {
                placasNaoEncontradas.push(placa);
            }
        }

        if (atualizacoes.length > 0) {
            const { error } = await supabaseClient
                .from('tacografos')
                .upsert(atualizacoes, { onConflict: 'placa' });

            if (error) throw error;
            alert(`${atualizacoes.length} veículos atualizados com sucesso!`);
            await this.carregarDados();
        }

        if (placasNaoEncontradas.length > 0) {
            this.gerarRelatorioErros(placasNaoEncontradas);
            alert(`Atenção: ${placasNaoEncontradas.length} placas não foram localizadas no sistema. Um relatório foi baixado.`);
        }
    },

    formatarDataExcel(data) {
        if (!data) return null;
        // Se for número (serial do Excel)
        if (typeof data === 'number') {
            const date = new Date((data - 25569) * 86400 * 1000);
            return date.toISOString().split('T')[0];
        }
        // Se for string, tenta converter (esperado YYYY-MM-DD ou DD/MM/YYYY)
        if (typeof data === 'string') {
            if (data.includes('/')) {
                const [d, m, y] = data.split('/');
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            return data;
        }
        return null;
    },

    /**
     * Exporta os dados filtrados da grid para PDF
     */
    async exportarGridPDF() {
        if (!this.filteredData || this.filteredData.length === 0) {
            return alert('Não há dados para exportar.');
        }
        await this.gerarPDF(this.filteredData, "Relatório Geral de Tacógrafos");
    },

    /**
     * Exporta os dados de um veículo específico via botão na coluna Ações
     */
    async exportarLinhaPDF(placa) {
        const item = this.data.find(d => d.placa === placa);
        if (!item) return;
        await this.gerarPDF([item], `Ficha de Tacógrafo - ${placa}`);
    },

    /**
     * Lógica principal de geração de PDF seguindo o padrão do sistema
     */
    async gerarPDF(dados, titulo) {
        if (!window.jspdf) return alert('Biblioteca jsPDF não carregada.');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // Paisagem

        // Função para carregar o logo e garantir fundo branco
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
                    ctx.fillStyle = '#FFFFFF'; // Fundo branco solicitado
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg'));
                };
                img.onerror = () => resolve(null);
            });
        };

        const logoBase64 = await getLogoBase64();
        if (logoBase64) {
            doc.addImage(logoBase64, 'JPEG', 14, 10, 40, 12);
        }

        doc.setFontSize(18);
        doc.setTextColor(0, 105, 55); // Verde Marquespan
        doc.text(titulo, 60, 18);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 283, 18, { align: 'right' });

        const columns = ['Filial', 'Placa', 'Modelo', 'Renavan', 'Tipo', 'Emissão', 'Vencimento', 'Guia GRU', 'Status', 'Observação'];
        const rows = dados.map(item => [
            item.filial,
            item.placa,
            item.modelo,
            item.renavan,
            item.tipo,
            item.data_emissao ? new Date(item.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
            item.data_vencimento ? new Date(item.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
            item.guia_gru || '-',
            item.status,
            item.observacao || ''
        ]);

        doc.autoTable({
            head: [columns],
            body: rows,
            startY: 25,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55], fontSize: 9 },
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            alternateRowStyles: { fillColor: [240, 240, 240] },
            columnStyles: {
                8: { fontStyle: 'bold' },
                9: { cellWidth: 50 } // Mais espaço para observação
            },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 6) { // Vencimento
                    const dateStr = data.cell.raw;
                    if (dateStr && new Date(dateStr + 'T00:00:00') < new Date()) {
                        data.cell.styles.textColor = [220, 53, 69]; // Vermelho se vencido
                    }
                }
                if (data.section === 'body' && data.column.index === 8) { // Status
                    if (data.cell.raw === 'Dispensado') {
                        data.cell.styles.textColor = [108, 117, 125]; // Cinza #6c757d
                    }
                }
            }
        });

        doc.save(`Tacografo_${new Date().toISOString().split('T')[0]}.pdf`);
    },

    gerarRelatorioErros(placas) {
        const conteudo = "PLACAS NÃO LOCALIZADAS NO SISTEMA MARQUESPAN\n" + 
                         "Data do Processamento: " + new Date().toLocaleString() + "\n" +
                         "------------------------------------------\n\n" + 
                         placas.join('\n');
        
        const blob = new Blob([conteudo], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `placas_nao_encontradas_tacografo_${new Date().getTime()}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
};

document.addEventListener('DOMContentLoaded', () => TacografoUI.init());
window.TacografoUI = TacografoUI;