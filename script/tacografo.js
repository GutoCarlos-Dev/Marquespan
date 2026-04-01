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
        this.btnAtualizar = document.getElementById('btnAtualizar');
    },

    bindEvents() {
        this.btnAtualizar.addEventListener('click', () => this.carregarDados());
        this.searchInput.addEventListener('input', () => this.renderGrid());
        this.statusFilter.addEventListener('change', () => this.renderGrid());
        
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
                status: tData.status || 'Pendente'
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

        let filtered = this.data.filter(item => {
            const matchSearch = item.placa.includes(term) || 
                               item.modelo.toUpperCase().includes(term) || 
                               item.filial.toUpperCase().includes(term);
            const matchStatus = !statusFilter || item.status === statusFilter;
            return matchSearch && matchStatus;
        });

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

            const statusOptions = ['Pendente', 'Preliminar', 'Pago', 'Batido'];
            let optionsHtml = statusOptions.map(opt => 
                `<option value="${opt}" ${item.status === opt ? 'selected' : ''}>${opt}</option>`
            ).join('');

            tr.innerHTML = `
                <td>${item.filial}</td>
                <td><strong>${item.placa}</strong></td>
                <td>${item.modelo}</td>
                <td>${item.renavan}</td>
                <td>${item.tipo}</td>
                <td><input type="date" class="glass-input input-emissao" value="${item.data_emissao}"></td>
                <td><input type="date" class="glass-input input-vencimento ${this.checkVencimento(item.data_vencimento)}" value="${item.data_vencimento}"></td>
                <td>
                    <select class="glass-input status-select-grid ${this.getStatusClass(item.status)}">
                        ${optionsHtml}
                    </select>
                </td>
                <td>
                    <button class="btn-icon save" onclick="TacografoUI.salvarLinha('${item.placa}')" title="Salvar Alterações">
                        <i class="fas fa-save"></i>
                    </button>
                </td>
            `;
            this.tbody.appendChild(tr);
        });
    },

    getStatusClass(status) {
        if (status === 'Preliminar') return 'status-preliminar';
        if (status === 'Pago') return 'status-pago';
        if (status === 'Batido') return 'status-batido';
        return '';
    },

    async salvarLinha(placa) {
        const tr = document.querySelector(`tr[data-placa="${placa}"]`);
        const btn = tr.querySelector('.btn-icon.save');
        
        const status = tr.querySelector('.status-select-grid').value;
        const data_emissao = tr.querySelector('.input-emissao').value;
        const data_vencimento = tr.querySelector('.input-vencimento').value;

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const { error } = await supabaseClient
                .from('tacografos')
                .upsert({
                    placa: placa,
                    status: status,
                    data_emissao: data_emissao || null,
                    data_vencimento: data_vencimento || null,
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
    }
};

document.addEventListener('DOMContentLoaded', () => TacografoUI.init());