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
            // Busca veículos e tenta trazer dados da tabela tacografos via Left Join
            // Se a tabela tacografos não existir, trará apenas dados de veículos
            const { data, error } = await supabaseClient
                .from('veiculos')
                .select(`
                    filial, placa, modelo, renavan, tipo,
                    tacografos (
                        id, data_emissao, data_vencimento, status
                    )
                `)
                .order('placa');

            if (error) throw error;

            this.data = data.map(v => ({
                filial: v.filial || '-',
                placa: v.placa,
                modelo: v.modelo || '-',
                renavan: v.renavan || '-',
                tipo: v.tipo || '-',
                data_emissao: v.tacografos?.[0]?.data_emissao || null,
                data_vencimento: v.tacografos?.[0]?.data_vencimento || null,
                status: v.tacografos?.[0]?.status || 'Pendente'
            }));

            this.renderGrid();
        } catch (err) {
            console.error('Erro:', err);
            this.tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro ao carregar dados do Supabase.</td></tr>';
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
            
            const dtEmissao = item.data_emissao ? new Date(item.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
            const dtVenc = item.data_vencimento ? new Date(item.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
            
            let statusClass = 'status-default';
            if (item.status === 'Preliminar') statusClass = 'status-preliminar';
            if (item.status === 'Pago') statusClass = 'status-pago';
            if (item.status === 'Batido') statusClass = 'status-batido';

            tr.innerHTML = `
                <td>${item.filial}</td>
                <td><strong>${item.placa}</strong></td>
                <td>${item.modelo}</td>
                <td>${item.renavan}</td>
                <td>${item.tipo}</td>
                <td>${dtEmissao}</td>
                <td class="${this.checkVencimento(item.data_vencimento)}">${dtVenc}</td>
                <td><span class="badge ${statusClass}">${item.status}</span></td>
                <td>
                    <button class="btn-icon edit" title="Editar dados"><i class="fas fa-pen-to-square"></i></button>
                </td>
            `;
            this.tbody.appendChild(tr);
        });
    },

    checkVencimento(dataVenc) {
        if (!dataVenc) return '';
        const hoje = new Date();
        const venc = new Date(dataVenc + 'T00:00:00');
        return (venc < hoje) ? 'text-danger font-bold' : '';
    }
};

document.addEventListener('DOMContentLoaded', () => TacografoUI.init());