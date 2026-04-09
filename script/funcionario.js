import { supabaseClient } from './supabase.js';

const FuncionarioUI = {
    currentFuncaoBeforeEdit: null,
    sortConfig: { column: 'nome', direction: 'asc' }, // Estado inicial da ordenação
    listData: [], // Armazena os dados atuais da grid para exportação
    init() {
        this.cache();
        this.bind();
        this.renderGrid();
        this.renderSummary(); // Adiciona a chamada para renderizar o resumo
    },

    cache() {
        this.form = document.getElementById('formCadastrarFuncionario');
        this.tableBody = document.getElementById('funcTableBody');
        this.btnSubmit = document.getElementById('btnSubmitFunc');
        this.btnClearForm = document.getElementById('btnClearFuncForm');
        this.searchInput = document.getElementById('searchFuncInput');
        this.editingIdInput = document.getElementById('funcEditingId');
        this.statusSelect = document.getElementById('funcStatus');
        this.groupDesligamento = document.getElementById('groupDesligamento');
        this.histFuncContainer = document.getElementById('historicoFuncaoContainer');
        this.histFuncTableBody = document.getElementById('histFuncTableBody');
        this.statusFilterDisplay = document.getElementById('statusFilterDisplay');
        this.statusFilterOptions = document.getElementById('statusFilterOptions');
        this.statusFilterText = document.getElementById('statusFilterText');
        this.monthFilter = document.getElementById('monthFilter');
        this.btnExportXLSX = document.getElementById('btnExportXLSX');
        this.btnExportPDF = document.getElementById('btnExportPDF');
        this.funcSummaryBody = document.getElementById('funcSummaryBody'); // Novo cache para o corpo da tabela de resumo
    },

    // Adiciona o campo Data de Nascimento ao cache
    bind() {
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
        if (this.btnClearForm) {
            this.btnClearForm.addEventListener('click', () => this.clearForm());
        }
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.renderGrid());
        }
        if (this.monthFilter) {
            this.monthFilter.addEventListener('change', () => this.renderGrid());
        }
        if (this.statusSelect) {
            this.statusSelect.addEventListener('change', () => this.toggleDesligamentoField());
        }
        if (this.histFuncTableBody) {
            this.histFuncTableBody.addEventListener('dblclick', (e) => this.handleHistoricoDblClick(e));
        }
        
        if (this.btnExportXLSX) {
            this.btnExportXLSX.addEventListener('click', () => this.exportToXLSX());
        }
        if (this.btnExportPDF) {
            this.btnExportPDF.addEventListener('click', () => this.exportToPDF());
        }
        
        // Listeners para o filtro de status
        if (this.statusFilterDisplay) {
            this.statusFilterDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                this.statusFilterOptions.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!this.statusFilterDisplay.contains(e.target) && !this.statusFilterOptions.contains(e.target)) {
                    this.statusFilterOptions.classList.add('hidden');
                }
            });
            this.statusFilterOptions.querySelectorAll('.status-checkbox').forEach(cb => {
                cb.addEventListener('change', () => {
                    this.updateStatusFilterText();
                    this.renderGrid();
                });
            });
        }

        // Listeners para ordenação da tabela principal
        document.querySelectorAll('#sectionCadastrarFuncionarios .data-grid thead th[data-sort]').forEach(th => {
            const column = th.dataset.sort;
            th.addEventListener('click', () => this.handleSort(column));
        });
    },

    updateStatusFilterText() {
        const checked = Array.from(this.statusFilterOptions.querySelectorAll('.status-checkbox:checked'));
        if (checked.length === 0) {
            this.statusFilterText.textContent = 'Nenhum';
        } else if (checked.length === 4) {
            this.statusFilterText.textContent = 'Todos';
        } else if (checked.length <= 2) {
            this.statusFilterText.textContent = checked.map(cb => cb.parentElement.textContent.trim()).join(', ');
        } else {
            this.statusFilterText.textContent = `${checked.length} selecionados`;
        }
    },

    toggleDesligamentoField() {
        if (this.statusSelect.value === 'Desligado') {
            this.groupDesligamento.classList.remove('hidden');
        } else {
            this.groupDesligamento.classList.add('hidden');
            document.getElementById('funcDesligamento').value = '';
        }
    },

    async handleFormSubmit(e) {
        e.preventDefault();

        const rh = document.getElementById('funcRH').value;
        const novaFuncao = document.getElementById('funcFuncao').value;
        const dataHoje = new Date().toISOString().split('T')[0];

        // Lógica de Histórico: Se estiver editando e a função mudou, registra na tabela de histórico
        if (this.editingIdInput.value && this.currentFuncaoBeforeEdit && this.currentFuncaoBeforeEdit !== novaFuncao) {
            await supabaseClient.from('funcionario_historico_funcao').insert({
                rh_registro: rh,
                funcao_anterior: this.currentFuncaoBeforeEdit,
                funcao_nova: novaFuncao,
                data_mudanca: dataHoje
            });

            // Atualiza os campos do formulário para que o payload salve a informação correta na tabela principal
            document.getElementById('funcPromocao').value = this.currentFuncaoBeforeEdit;
            document.getElementById('funcDataPromocao').value = dataHoje;
        }

        const payload = {
            rh_registro: rh,
            nome: document.getElementById('funcNome').value,
            nome_completo: document.getElementById('funcNomeCompleto').value,
            data_nascimento: document.getElementById('funcDataNascimento').value || null, // Adiciona data de nascimento
            cpf: document.getElementById('funcCPF').value,
            data_admissao: document.getElementById('funcAdmissao').value,
            funcao: novaFuncao,
            contato_corp: document.getElementById('funcContatoCorp').value,
            contato_pessoal: document.getElementById('funcContatoPessoal').value,
            status: document.getElementById('funcStatus').value,
            data_desligamento: document.getElementById('funcDesligamento').value || null,
            funcao_anterior: document.getElementById('funcPromocao').value || null,
            data_alteracao_funcao: document.getElementById('funcDataPromocao').value || null,
            id: this.editingIdInput.value || undefined
        };

        try {
            // Se temos um ID, o upsert resolve pelo ID (padrão). 
            // Se não temos, usamos o rh_registro para evitar duplicidade de matrícula.
            const options = this.editingIdInput.value ? {} : { onConflict: 'rh_registro' };
            const { error } = await supabaseClient.from('funcionario').upsert(payload, options);
            if (error) throw error;

            if (this.editingIdInput.value) await this.carregarHistoricoFuncao(rh);
            await this.renderSummary();
            alert('✅ Colaborador salvo com sucesso!');
            this.clearForm();
            this.renderGrid();
        } catch (err) {
            console.error('Erro ao salvar funcionário:', err);
            alert(`❌ Erro ao salvar registro: ${err.message}`);
        }
    },

    clearForm() {
        this.form?.reset();
        this.editingIdInput.value = '';
        this.currentFuncaoBeforeEdit = null;
        this.btnSubmit.textContent = 'Salvar Registro';
        this.btnClearForm.classList.add('hidden');
        this.toggleDesligamentoField();
        if (this.histFuncContainer) this.histFuncContainer.classList.add('hidden');
        if (this.histFuncTableBody) this.histFuncTableBody.innerHTML = '';
    },

    async renderGrid() {
        const searchTerm = this.searchInput?.value.toLowerCase().trim() || '';
        const selectedStatuses = Array.from(this.statusFilterOptions?.querySelectorAll('.status-checkbox:checked') || []).map(cb => cb.value);
        const selectedMonth = this.monthFilter?.value || '';

        try {
            let query = supabaseClient.from('funcionario').select('*');
            
            if (selectedStatuses.length > 0) {
                query = query.in('status', selectedStatuses);
            } else {
                query = query.in('status', []); // Mostra nada se nenhum estiver marcado
            }

            if (searchTerm) {
                query = query.or(`nome.ilike.%${searchTerm}%,nome_completo.ilike.%${searchTerm}%,rh_registro.ilike.%${searchTerm}%,funcao.ilike.%${searchTerm}%,cpf.ilike.%${searchTerm}%`);
            }
            
            // Aplica a ordenação configurada
            query = query.order(this.sortConfig.column, { ascending: this.sortConfig.direction === 'asc' });

            let { data: list, error } = await query;
            if (error) throw error;

            // Filtro de mês (realizado no cliente para simplificar a lógica de data)
            if (selectedMonth) {
                list = list.filter(f => {
                    if (!f.data_nascimento) return false;
                    const mes = f.data_nascimento.split('-')[1];
                    return mes === selectedMonth;
                });
            }

            this.listData = list; // Atualiza cache para exportação
            this.tableBody.innerHTML = list.map(f => `
                <tr>
                    <td><strong>${f.rh_registro}</strong></td>
                    <td title="${f.nome_completo || ''}">${f.nome}</td>
                    <td>${f.data_nascimento ? new Date(f.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}) : '-'}</td>
                    <td>${f.funcao}</td>
                    <td title="${f.data_admissao ? this.calculateTenure(f.data_admissao) : ''}">${f.data_admissao ? new Date(f.data_admissao).toLocaleDateString('pt-BR') : '-'}</td>
                    <td>${f.contato_corp || f.contato_pessoal || '-'}</td>
                    <td><span class="status-badge status-${f.status.toLowerCase()}">${f.status}</span></td>
                    <td>
                        <button class="btn-icon edit" onclick="window.FuncionarioUI.loadForEditing('${f.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" onclick="window.FuncionarioUI.deleteFuncionario('${f.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
            this.updateSortIcons(); // Atualiza os ícones após renderizar
        } catch (e) { console.error('Erro ao carregar grid:', e); }
    },

    handleSort(column) {
        // Se a coluna clicada for a mesma, inverte a direção
        if (this.sortConfig.column === column) {
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // Se for uma nova coluna, define como padrão ascendente
            this.sortConfig.column = column;
            this.sortConfig.direction = 'asc';
        }
        this.updateSortIcons();
        this.renderGrid(); // Re-renderiza a grid com a nova ordenação
    },

    updateSortIcons() {
        // Remove todos os ícones de ordenação
        document.querySelectorAll('#sectionCadastrarFuncionarios .data-grid thead th i').forEach(icon => {
            icon.className = 'fas fa-sort'; // Ícone neutro
        });

        // Adiciona o ícone correto à coluna ativa
        const activeHeader = document.querySelector(`#sectionCadastrarFuncionarios .data-grid thead th[data-sort="${this.sortConfig.column}"] i`);
        if (activeHeader) {
            activeHeader.className = this.sortConfig.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    },

    async handleHistoricoDblClick(e) {
        const td = e.target.closest('td');
        const tr = td?.closest('tr');
        if (!td || !tr || !tr.dataset.id) return;

        const key = td.dataset.key;
        if (!key) return;

        if (td.querySelector('input')) return;

        const originalValue = key === 'data_mudanca' ? td.dataset.value : td.textContent.trim();
        const input = document.createElement('input');
        input.type = key === 'data_mudanca' ? 'date' : 'text';
        input.className = 'glass-input';
        input.value = originalValue || '';
        input.style.width = '100%';
        input.style.padding = '2px 5px';
        input.style.height = 'auto';

        td.innerHTML = '';
        td.appendChild(input);
        input.focus();

        const save = async () => {
            const newValue = input.value.trim();
            const rh = document.getElementById('funcRH').value;
            if (newValue === originalValue) {
                this.carregarHistoricoFuncao(rh);
                return;
            }

            try {
                const { error } = await supabaseClient.from('funcionario_historico_funcao').update({ [key]: newValue || null }).eq('id', tr.dataset.id);
                if (error) throw error;
                this.carregarHistoricoFuncao(rh);
            } catch (err) {
                console.error('Erro ao atualizar histórico:', err);
                this.carregarHistoricoFuncao(rh);
            }
        };

        input.onblur = save;
        input.onkeydown = (ev) => {
            if (ev.key === 'Enter') input.blur();
            if (ev.key === 'Escape') { input.value = originalValue; input.blur(); }
        };
    },

    async carregarHistoricoFuncao(rh) {
        if (!this.histFuncTableBody) return;
        
        try {
            const { data, error } = await supabaseClient
                .from('funcionario_historico_funcao')
                .select('*')
                .eq('rh_registro', rh)
                .order('data_mudanca', { ascending: false });

            if (error) throw error;

            if (data && data.length > 0) {
                this.histFuncContainer.classList.remove('hidden');
                this.histFuncTableBody.innerHTML = data.map(h => `
                    <tr data-id="${h.id}">
                        <td data-key="funcao_anterior">${h.funcao_anterior}</td>
                        <td data-key="funcao_nova">${h.funcao_nova}</td>
                        <td data-key="data_mudanca" data-value="${h.data_mudanca || ''}">${h.data_mudanca ? new Date(h.data_mudanca + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                    </tr>
                `).join('');
            } else {
                this.histFuncContainer.classList.add('hidden');
            }
        } catch (err) { console.error('Erro ao carregar histórico de função:', err); }
    },

    /**
     * Calcula a duração entre a data de admissão e a data atual em anos, meses e dias.
     * @param {string} admissionDateStr - Data de admissão no formato YYYY-MM-DD.
     * @returns {string} Duração formatada (ex: "3 anos, 5 meses, 10 dias").
     */
    calculateTenure(admissionDateStr) {
        if (!admissionDateStr) return '';

        const admission = new Date(admissionDateStr + 'T00:00:00'); // Garante que a data seja interpretada corretamente
        const today = new Date();

        let years = today.getFullYear() - admission.getFullYear();
        let months = today.getMonth() - admission.getMonth();
        let days = today.getDate() - admission.getDate();

        if (days < 0) {
            months--;
            const prevMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
            days = prevMonthLastDay - admission.getDate() + today.getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }

        const result = [];
        if (years > 0) result.push(`${years} ano${years > 1 ? 's' : ''}`);
        if (months > 0) result.push(`${months} mês${months > 1 ? 'es' : ''}`);
        if (days > 0) result.push(`${days} dia${days > 1 ? 's' : ''}`);

        return result.length > 0 ? result.join(', ') : 'Menos de 1 dia';
    },

    async renderSummary() {
        if (!this.funcSummaryBody) return;

        try {
            const { data: list, error } = await supabaseClient.from('funcionario').select('funcao, status');
            if (error) throw error;

            const summaryData = {}; 
            const grandTotals = { 'Ativo': 0, 'Desligado': 0, 'Ferias': 0, 'Afastado': 0, 'Total': 0 };

            list.forEach(f => {
                const funcao = f.funcao || 'Não Definida';
                const status = f.status || 'Ativo'; 

                if (!summaryData[funcao]) {
                    summaryData[funcao] = { 'Ativo': 0, 'Desligado': 0, 'Ferias': 0, 'Afastado': 0, 'Total': 0 };
                }

                if (summaryData[funcao][status] !== undefined) summaryData[funcao][status]++;
                if (grandTotals[status] !== undefined) grandTotals[status]++;

                // A coluna "Total" agora contabiliza apenas funcionários ativos (exclui desligados)
                if (status !== 'Desligado') {
                    summaryData[funcao]['Total']++;
                    grandTotals['Total']++;
                }
            });

            this.funcSummaryBody.innerHTML = '';
            for (const funcao in summaryData) {
                const data = summaryData[funcao];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${funcao}</strong></td>
                    <td>${data['Ativo']}</td>
                    <td>${data['Desligado']}</td>
                    <td>${data['Ferias']}</td>
                    <td>${data['Afastado']}</td>
                    <td><strong>${data['Total']}</strong></td>
                `;
                this.funcSummaryBody.appendChild(tr);
            }
            this.funcSummaryBody.innerHTML += `
                <tr style="font-weight: bold; background-color: rgba(0,0,0,0.05);">
                    <td>TOTAIS GERAIS</td>
                    <td>${grandTotals['Ativo']}</td>
                    <td>${grandTotals['Desligado']}</td>
                    <td>${grandTotals['Ferias']}</td>
                    <td>${grandTotals['Afastado']}</td>
                    <td>${grandTotals['Total']}</td>
                </tr>`;
        } catch (e) { console.error('Erro ao carregar resumo:', e); }
    },

    async loadForEditing(id) {
        const { data: f } = await supabaseClient.from('funcionario').select('*').eq('id', id).single();
        if (!f) return;
        this.currentFuncaoBeforeEdit = f.funcao;
        this.editingIdInput.value = f.id;
        document.getElementById('funcRH').value = f.rh_registro;
        document.getElementById('funcNome').value = f.nome;
        document.getElementById('funcNomeCompleto').value = f.nome_completo || '';
        document.getElementById('funcDataNascimento').value = f.data_nascimento || ''; // Preenche data de nascimento
        document.getElementById('funcCPF').value = f.cpf || '';
        document.getElementById('funcAdmissao').value = f.data_admissao;
        document.getElementById('funcFuncao').value = f.funcao;
        document.getElementById('funcContatoCorp').value = f.contato_corp || '';
        document.getElementById('funcContatoPessoal').value = f.contato_pessoal || '';
        document.getElementById('funcStatus').value = f.status;
        document.getElementById('funcDesligamento').value = f.data_desligamento || '';
        document.getElementById('funcPromocao').value = f.funcao_anterior || '';
        document.getElementById('funcDataPromocao').value = f.data_alteracao_funcao || '';
        this.toggleDesligamentoField();
        await this.carregarHistoricoFuncao(f.rh_registro);
        this.btnSubmit.textContent = 'Atualizar Registro';
        this.btnClearForm.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async deleteFuncionario(id) {
        if (confirm('Deseja realmente excluir este colaborador?')) {
            await supabaseClient.from('funcionario').delete().eq('id', id);
            this.renderGrid();
            await this.renderSummary();
        }
    },

    /**
     * Exporta os dados atuais da grid para XLSX
     */
    exportToXLSX() {
        if (!this.listData || this.listData.length === 0) return alert('Não há dados para exportar.');

        const dataToExport = this.listData.map(f => ({
            'RH Registro': f.rh_registro,
            'Nome': f.nome,
            'Nome Completo': f.nome_completo,
            'CPF': f.cpf || '-',
            'Data Nascimento': f.data_nascimento ? new Date(f.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
            'Data Admissão': f.data_admissao ? new Date(f.data_admissao + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
            'Função': f.funcao,
            'Contato Corp': f.contato_corp || '-',
            'Contato Pessoal': f.contato_pessoal || '-',
            'Status': f.status,
            'Data Desligamento': f.data_desligamento ? new Date(f.data_desligamento + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
            'Função Anterior': f.funcao_anterior || '-',
            'Data Alt. Função': f.data_alteracao_funcao ? new Date(f.data_alteracao_funcao + 'T00:00:00').toLocaleDateString('pt-BR') : '-'
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        XLSX.utils.book_append_sheet(wb, ws, "Funcionários");
        XLSX.writeFile(wb, `Quadro_Funcionarios_${new Date().toISOString().split('T')[0]}.xlsx`);
    },

    /**
     * Exporta os dados atuais da grid para PDF com padrão visual do sistema
     */
    async exportToPDF() {
        if (!this.listData || this.listData.length === 0) return alert('Não há dados para exportar.');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4'); // Alterado para Vertical (Portrait)

        // Função para garantir logo com fundo branco (padrão world-class)
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

        const logo = await getLogoBase64();
        if (logo) doc.addImage(logo, 'JPEG', 14, 10, 40, 12);

        doc.setFontSize(18);
        doc.setTextColor(0, 105, 55); // Verde Marquespan
        doc.text('Lista de Funcionários', 60, 18);

        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 196, 18, { align: 'right' }); // Ajustado para margem da folha vertical

        const headers = [['RH', 'Nome', 'Nasc.', 'Admissão', 'Função', 'Status', 'Contato', 'Alt. Função']];
        const rows = this.listData.map(f => [
            f.rh_registro,
            f.nome,
            f.data_nascimento ? new Date(f.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}) : '-',
            f.data_admissao ? new Date(f.data_admissao + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
            f.funcao,
            f.status,
            f.contato_corp || f.contato_pessoal || '-',
            f.data_alteracao_funcao ? new Date(f.data_alteracao_funcao + 'T00:00:00').toLocaleDateString('pt-BR') : '-'
        ]);

        doc.autoTable({
            head: headers,
            body: rows,
            startY: 25,
            theme: 'grid',
            headStyles: { fillColor: [0, 105, 55], fontSize: 7 }, // Fonte reduzida no cabeçalho
            styles: { fontSize: 6, cellPadding: 1.5 }, // Fonte reduzida e menos padding no corpo
            alternateRowStyles: { fillColor: [245, 245, 245] },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 5) { // Coluna Status
                    const status = data.cell.raw;
                    if (status === 'Ativo') data.cell.styles.textColor = [40, 167, 69];
                    if (status === 'Desligado') data.cell.styles.textColor = [220, 53, 69];
                }
            }
        });

        doc.save(`Quadro_Funcionarios_${new Date().toISOString().split('T')[0]}.pdf`);
    }
};

window.FuncionarioUI = FuncionarioUI;
document.addEventListener('DOMContentLoaded', () => FuncionarioUI.init());