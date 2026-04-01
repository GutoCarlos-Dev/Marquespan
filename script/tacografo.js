import { supabaseClient } from './supabase.js';

const TacografoUI = {
    data: [],
    sortConfig: { key: 'placa', asc: true },

    async init() {
        this.cacheDOM();
        this.bindEvents();
        await this.carregarDados();
    },

    cacheDOM() {
        this.tbody = document.getElementById('tbodyTacografo');
        this.searchInput = document.getElementById('searchTacografo');
        this.statusFilter = document.getElementById('filterStatus');
        this.vencIniFilter = document.getElementById('filterVencIni');
        this.vencFimFilter = document.getElementById('filterVencFim');
        this.btnAtualizar = document.getElementById('btnAtualizar');
        this.btnImportar = document.getElementById('btnImportar');
        this.fileImportar = document.getElementById('fileImportar');
        // Contadores de legenda
        this.counterPendente = document.getElementById('count-pendente');
        this.counterPreliminar = document.getElementById('count-preliminar');
        this.counterPago = document.getElementById('count-pago');
        this.counterEmDia = document.getElementById('count-em-dia');
        this.counterManutencao = document.getElementById('count-manutencao');
    },

    bindEvents() {
        this.btnAtualizar.addEventListener('click', () => this.carregarDados());
        this.btnImportar?.addEventListener('click', () => this.fileImportar.click());
        this.fileImportar?.addEventListener('change', (e) => this.importarXLSX(e));
        this.searchInput.addEventListener('input', () => this.renderGrid());
        this.statusFilter.addEventListener('change', () => this.renderGrid());
        this.vencIniFilter.addEventListener('change', () => this.renderGrid());
        this.vencFimFilter.addEventListener('change', () => this.renderGrid());
        
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.handleSort(th.dataset.sort));
        });
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

            this.data = veiculos.map(v => {
                const tData = tMap.get(v.placa) || {};
                return {
                filial: v.filial || '-',
                placa: v.placa,
                modelo: v.modelo || '-',
                renavan: v.renavan || '-',
                tipo: v.tipo || '-',
                data_emissao: tData.data_emissao || '',
                data_vencimento: tData.data_vencimento || '',
                    status: tData.status || 'Pendente',
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
        const statusFilter = this.statusFilter.value;
        const vencIni = this.vencIniFilter.value;
        const vencFim = this.vencFimFilter.value;

        let filtered = this.data.filter(item => {
            const matchSearch = item.placa.includes(term) || 
                               item.modelo.toUpperCase().includes(term) || 
                               item.filial.toUpperCase().includes(term);
            const matchStatus = !statusFilter || item.status === statusFilter;

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

        // Calcular quantidades por status com base no que está filtrado
        const counts = { Pendente: 0, Preliminar: 0, Pago: 0, 'Em Dia': 0, Manutenção: 0 };
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

            const statusOptions = ['Pendente', 'Preliminar', 'Pago', 'Em Dia', 'Manutenção'];
            let optionsHtml = statusOptions.map(opt => 
                `<option value="${opt}" ${item.status === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');

            tr.innerHTML = `
                <td>${item.filial}</td>
                <td><strong>${item.placa}</strong></td>
                <td>${item.modelo}</td>
                <td>${item.renavan}</td>
                <td>${item.tipo}</td>
                <td><input type="date" class="table-date-input input-emissao" value="${item.data_emissao}"></td>
                <td><input type="date" class="table-date-input input-vencimento ${this.checkVencimento(item.data_vencimento)}" value="${item.data_vencimento}"></td>
                <td>
                    <select class="status-select-grid ${this.getStatusClass(item.status)}" onchange="this.className = 'status-select-grid ' + TacografoUI.getStatusClass(this.value)">
                        ${optionsHtml}
                    </select>
                </td>
                <td>
                    <input type="text" class="table-date-input input-obs" value="${item.observacao || ''}" placeholder="Observações...">
                </td>
                <td>
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
        if (this.counterPago) this.counterPago.textContent = counts.Pago || 0;
        if (this.counterEmDia) this.counterEmDia.textContent = counts['Em Dia'] || 0;
        if (this.counterManutencao) this.counterManutencao.textContent = counts.Manutenção || 0;
    },

    getStatusClass(status) {
        if (status === 'Preliminar') return 'status-preliminar';
        if (status === 'Pago') return 'status-pago';
        if (status === 'Em Dia') return 'status-em-dia';
        if (status === 'Manutenção') return 'status-manutencao';
        if (status === 'Pendente') return 'status-pendente';
        return '';
    },

    async salvarLinha(placa) {
        const tr = document.querySelector(`tr[data-placa="${placa}"]`);
        const btn = tr.querySelector('.btn-icon.save');
        
        const status = tr.querySelector('.status-select-grid').value;
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
        const hoje = new Date();
        const venc = new Date(dataVenc + 'T00:00:00');
        return (venc < hoje) ? 'text-danger font-bold' : '';
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