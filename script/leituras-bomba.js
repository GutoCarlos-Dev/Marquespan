import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const LeiturasUI = {
        bombas: [],
        leiturasDoDia: new Map(),

        init() {
            this.cache();
            this.bind();
            this.dataInput.valueAsDate = new Date();
            this.loadData();
        },

        cache() {
            this.dataInput = document.getElementById('leituraData');
            this.tableBody = document.getElementById('tableBodyLeituras');
        },

        bind() {
            this.dataInput.addEventListener('change', () => this.loadData());
            this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
            this.tableBody.addEventListener('change', (e) => this.handleInputChange(e));
        },

        async loadData() {
            this.tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Carregando...</td></tr>';
            const dataSelecionada = this.dataInput.value;

            try {
                // 1. Carregar todas as bombas
                const { data: bombasData, error: bombasError } = await supabaseClient
                    .from('bombas')
                    .select('id, nome, tanques(nome)')
                    .order('nome');
                if (bombasError) throw bombasError;
                this.bombas = bombasData;

                // 2. Carregar leituras para a data selecionada
                const { data: leiturasData, error: leiturasError } = await supabaseClient
                    .from('leituras_bomba')
                    .select('*')
                    .eq('data', dataSelecionada);
                if (leiturasError) throw leiturasError;

                this.leiturasDoDia = new Map(leiturasData.map(l => [l.bomba_id, l]));

                this.renderTable();

            } catch (error) {
                console.error('Erro ao carregar dados:', error);
                this.tableBody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:red;">Erro ao carregar.</td></tr>';
            }
        },

        renderTable() {
            this.tableBody.innerHTML = '';
            if (this.bombas.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma bomba cadastrada.</td></tr>';
                return;
            }

            this.bombas.forEach(bomba => {
                const leitura = this.leiturasDoDia.get(bomba.id);
                const leituraInicial = leitura?.leitura_inicial ?? '';
                const leituraFinal = leitura?.leitura_final ?? '';
                const totalLitros = (leituraFinal && leituraInicial) ? (leituraFinal - leituraInicial).toFixed(2) : '0.00';

                const tr = document.createElement('tr');
                tr.dataset.bombaId = bomba.id;
                tr.innerHTML = `
                    <td>${bomba.nome}</td>
                    <td>${bomba.tanques.nome}</td>
                    <td><input type="number" class="leitura-input" data-field="leitura_inicial" value="${leituraInicial}" placeholder="0.00"></td>
                    <td><input type="number" class="leitura-input" data-field="leitura_final" value="${leituraFinal}" placeholder="0.00"></td>
                    <td class="total-litros-cell">${totalLitros} L</td>
                    <td class="actions-cell">
                        <button class="btn-action btn-save" title="Salvar Leitura desta Bomba"><i class="fas fa-save"></i></button>
                    </td>
                `;
                this.tableBody.appendChild(tr);
            });
        },

        handleInputChange(e) {
            if (!e.target.classList.contains('leitura-input')) return;

            const tr = e.target.closest('tr');
            const inicialInput = tr.querySelector('[data-field="leitura_inicial"]');
            const finalInput = tr.querySelector('[data-field="leitura_final"]');
            const totalCell = tr.querySelector('.total-litros-cell');

            const inicial = parseFloat(inicialInput.value) || 0;
            const final = parseFloat(finalInput.value) || 0;

            if (final > 0 && inicial > 0 && final >= inicial) {
                totalCell.textContent = (final - inicial).toFixed(2) + ' L';
            } else {
                totalCell.textContent = '0.00 L';
            }
        },

        async handleTableClick(e) {
            const saveBtn = e.target.closest('.btn-save');
            if (!saveBtn) return;

            const tr = saveBtn.closest('tr');
            const bombaId = tr.dataset.bombaId;
            const inicial = tr.querySelector('[data-field="leitura_inicial"]').value;
            const final = tr.querySelector('[data-field="leitura_final"]').value;

            if (!inicial) {
                alert('A Leitura Inicial (Encerrante Anterior) é obrigatória.');
                return;
            }

            const payload = {
                bomba_id: bombaId,
                data: this.dataInput.value,
                leitura_inicial: parseFloat(inicial),
                leitura_final: final ? parseFloat(final) : null
            };

            try {
                const { error } = await supabaseClient
                    .from('leituras_bomba')
                    .upsert(payload, { onConflict: 'bomba_id, data' });

                if (error) throw error;

                alert('Leitura salva com sucesso!');
                saveBtn.innerHTML = '<i class="fas fa-check" style="color:green;"></i>';
                setTimeout(() => { saveBtn.innerHTML = '<i class="fas fa-save"></i>'; }, 2000);

            } catch (error) {
                console.error('Erro ao salvar leitura:', error);
                alert('Erro ao salvar: ' + error.message);
            }
        }
    };

    LeiturasUI.init();
});