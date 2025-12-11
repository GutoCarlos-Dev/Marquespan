// rotas.js - Lógica para o módulo de Cadastro de Rotas
import { supabaseClient } from './supabase.js';

class SupabaseService {
  static async list(table, cols='*', opts={}){
    let q = supabaseClient.from(table).select(cols).order(opts.orderBy||'id',{ascending:!!opts.ascending});
    if(opts.eq) q = q.eq(opts.eq.field, opts.eq.value);
    if(opts.ilike) q = q.ilike(opts.ilike.field, opts.ilike.value);
    if(opts.or) q = q.or(opts.or);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  static async insert(table, payload){
    const { data, error } = await supabaseClient.from(table).insert(payload).select();
    if (error) throw error;
    return data;
  }

  static async update(table, payload, key){
    const { data, error } = await supabaseClient.from(table).update(payload).eq(key.field, key.value).select();
    if (error) throw error;
    return data;
  }

  static async remove(table, key){
    const { data, error } = await supabaseClient.from(table).delete().eq(key.field, key.value);
    if (error) throw error;
    return data;
  }
}

const RotasUI = {
    init() {
        this.SupabaseService = SupabaseService;
        this.cache();
        this.bind();
        this.setupInitialState();
    },

    cache() {
        this.section = document.getElementById('sectionCadastrarRotas');
        this.form = document.getElementById('formCadastrarRota');
        this.tableBody = document.getElementById('rotasTableBody');
        this.btnSubmit = document.getElementById('btnSubmitRota');
        this.btnClearForm = document.getElementById('btnClearRotaForm');
        this.searchInput = document.getElementById('searchRotaInput');
        this.rotaSummary = document.getElementById('rotaSummary');
        this.editingIdInput = document.getElementById('rotaEditingId');

        // Botão e input de importação
        this.btnImportarLista = document.getElementById('btnImportarLista');
        this.importFileInput = document.getElementById('importFile');
    },

    bind() {
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
        if (this.btnClearForm) {
            this.btnClearForm.addEventListener('click', () => this.clearForm());
        }
        if (this.tableBody) {
            this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
        }
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this.renderGrid());
        }

        // Eventos de importação
        if (this.btnImportarLista) {
            this.btnImportarLista.addEventListener('click', () => this.handleImportClick());
            this.importFileInput.addEventListener('change', (e) => this.handleFileImport(e));
        }

        // Adiciona listeners para ordenação dos cabeçalhos da tabela
        const ths = this.section?.querySelectorAll('.data-grid thead th[data-field]');
        ths?.forEach(th => {
            const field = th.getAttribute('data-field');
            th.addEventListener('click', () => { this.toggleSort(field) });
        });
    },

    setupInitialState() {
        this._sort = { field: 'numero', ascending: true };
    },

    async handleFormSubmit(e) {
        e.preventDefault();

        const payload = {
            numero: parseInt(document.getElementById('rotaNumero').value),
            semana: document.getElementById('rotaSemana').value,
            responsavel: document.getElementById('rotaResponsavel').value,
            supervisor: document.getElementById('rotaSupervisor').value,
            cidades: document.getElementById('rotaCidades').value,
            dias: parseInt(document.getElementById('rotaDias').value),
            // Incluímos o ID para o caso de estarmos editando, mas o upsert cuidará disso.
            // Se o ID existir, ele atualiza. Se não, o upsert usará o 'numero' para o conflito.
            id: this.editingIdInput.value || undefined
        };

        if (!payload.numero || !payload.semana || !payload.responsavel || !payload.cidades || !payload.dias) {
            return alert('Todos os campos da rota são obrigatórios.');
        }

        try {
            const { error } = await supabaseClient.from('rotas').upsert(payload, { onConflict: 'numero' });
            if (error) throw error;

            alert('✅ Rota salva com sucesso!');
            this.clearForm();
            this.renderGrid();
        } catch (err) {
            console.error('Erro ao salvar rota:', err);
            alert(`❌ Erro ao salvar rota: ${err.message}`);
        }
    },

    clearForm() {
        this.form?.reset();
        this.editingIdInput.value = '';
        this.btnSubmit.textContent = 'Cadastrar Rota';
    },

    async loadForEditing(id) {
        try {
            const { data: rota, error } = await supabaseClient.from('rotas').select('*').eq('id', id).single();
            if (error) throw error;
            if (!rota) return alert('Rota não encontrada.');

            this.editingIdInput.value = rota.id;
            document.getElementById('rotaNumero').value = rota.numero || '';
            document.getElementById('rotaSemana').value = rota.semana || '';
            document.getElementById('rotaResponsavel').value = rota.responsavel || '';
            document.getElementById('rotaSupervisor').value = rota.supervisor || '';
            document.getElementById('rotaCidades').value = rota.cidades || '';
            document.getElementById('rotaDias').value = rota.dias || '';

            this.btnSubmit.textContent = 'Atualizar Rota';
            this.form.scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            console.error('Erro ao carregar rota para edição', e);
        }
    },

    async handleTableClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;

        if (btn.classList.contains('btn-delete')) {
            if (confirm('Tem certeza que deseja excluir esta rota?')) {
                try {
                    await this.SupabaseService.remove('rotas', { field: 'id', value: id });
                    this.renderGrid();
                } catch (err) {
                    console.error('Erro ao excluir rota', err);
                    alert('❌ Não foi possível excluir a rota.');
                }
            }
        } else if (btn.classList.contains('btn-edit')) {
            this.loadForEditing(id);
        }
    },

    toggleSort(field) {
        if (this._sort.field === field) {
            this._sort.ascending = !this._sort.ascending;
        } else {
            this._sort.field = field;
            this._sort.ascending = true;
        }
        this.renderGrid();
    },

    handleImportClick() {
        // Aciona o clique no input de arquivo oculto
        this.importFileInput.click();
    },

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                if (json.length === 0) {
                    alert('A planilha está vazia ou em um formato inválido.');
                    return;
                }

                await this.processImportedData(json);

            } catch (error) {
                console.error('Erro ao processar o arquivo XLSX:', error);
                alert('Ocorreu um erro ao ler a planilha. Verifique se o formato está correto.');
            } finally {
                // Limpa o valor do input para permitir a importação do mesmo arquivo novamente
                this.importFileInput.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    },

    async processImportedData(importedRows) {
        if (!confirm(`Foram encontradas ${importedRows.length} rotas na planilha. Deseja continuar?\n\nAtenção:\n1. Rotas existentes (pelo número) serão ATUALIZADAS.\n2. Rotas novas serão CADASTRADAS.`)) {
            return;
        }

        const upsertPayload = importedRows.map(row => ({
            numero: row.ROTA,
            semana: row.SEMANA,
            responsavel: row.RESPONSÁVEL,
            supervisor: row.SUPERVISOR,
            cidades: row.CIDADES,
            dias: row.DIAS
        })).filter(r => r.numero); // Garante que a rota tenha um número

        if (upsertPayload.length === 0) {
            alert("Nenhuma rota válida encontrada na planilha para importar.");
            return;
        }

        try {
            // O método 'upsert' do Supabase faz exatamente o que precisamos:
            // Insere se não existir, atualiza se existir, com base na chave primária ou em uma constraint.
            // Assumindo que 'numero' é a chave primária ou tem uma constraint UNIQUE.
            const { error } = await supabaseClient
                .from('rotas')
                .upsert(upsertPayload, { onConflict: 'numero' });

            if (error) throw error;

            alert(`Importação concluída com sucesso! ${upsertPayload.length} rotas foram processadas.`);
            this.renderGrid();
        } catch (error) {
            console.error('Erro detalhado no processamento:', error);
            alert('Erro ao processar os dados e atualizar o banco: ' + error.message);
        }
    },

    async renderGrid() {
        if (!this.tableBody) return;

        // Atualiza os indicadores de ordenação nos cabeçalhos
        const ths = this.section?.querySelectorAll('.data-grid thead th[data-field]');
        ths?.forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.field === this._sort.field) {
                th.classList.add(this._sort.ascending ? 'sort-asc' : 'sort-desc');
            }
        });

        let rotas = []; // Declarar a variável aqui para que seja acessível fora do try/catch
        try {
            const searchTerm = this.searchInput?.value.trim();
            let queryOptions = { orderBy: this._sort.field, ascending: this._sort.ascending };

            if (searchTerm) {
                const searchConditions = [
                    `semana.ilike.%${searchTerm}%`,
                    `responsavel.ilike.%${searchTerm}%`,
                    `supervisor.ilike.%${searchTerm}%`,
                ];
                // Se o termo de busca for um número, também busca no campo 'numero'
                if (!isNaN(searchTerm)) {
                    searchConditions.push(`numero.eq.${searchTerm}`);
                }
                queryOptions.or = searchConditions.join(',');
            }

            rotas = await this.SupabaseService.list('rotas', '*', queryOptions);

            const dayClassMap = {
                'SEGUNDA': 'semana-segunda',
                'TERÇA': 'semana-terca',
                'QUARTA': 'semana-quarta',
                'QUINTA': 'semana-quinta',
                'SEXTA': 'semana-sexta',
            };

            this.tableBody.innerHTML = rotas.map(r => {
                const rowClass = dayClassMap[r.semana] || '';
                return `
                <tr class="${rowClass}">
                    <td>${r.numero || ''}</td>
                    <td>${r.semana || ''}</td>
                    <td>${r.responsavel || ''}</td>
                    <td>${r.supervisor || ''}</td>
                    <td>${r.cidades || ''}</td>
                    <td>${r.dias || ''}</td>
                    <td>
                        <button class="btn-edit" data-id="${r.id}">Editar</button>
                        <button class="btn-delete" data-id="${r.id}">Excluir</button>

                    </td>
                </tr>`;
            }).join('');
        } catch (e) {
            console.error('Erro ao carregar rotas', e);
            this.tableBody.innerHTML = `<tr><td colspan="7">Erro ao carregar rotas.</td></tr>`;
        }

        // Renderiza o resumo após carregar o grid
        this.renderSummary(rotas);
    },

    renderSummary(rotas) {
        if (!this.rotaSummary) return;

        const summaryData = {};

        rotas.forEach(rota => {
            const supervisor = rota.supervisor || 'Não Atribuído';
            if (!summaryData[supervisor]) {
                summaryData[supervisor] = {
                    quantidadeRotas: 0,
                    totalDias: 0
                };
            }
            summaryData[supervisor].quantidadeRotas++;
            summaryData[supervisor].totalDias += (rota.dias || 0);
        });

        // --- Cálculos para o totalizador ---
        const totalSupervisores = Object.keys(summaryData).length;
        const totalRotas = rotas.length; // Mais simples que somar, é só pegar o total de rotas
        const totalGeralDias = Object.values(summaryData).reduce((sum, data) => sum + data.totalDias, 0);

        let summaryHtml = `
            <h3>Resumo por Supervisor</h3>
            <table>
                <thead>
                    <tr>
                        <th>Supervisor</th>
                        <th>Quantidade de Rotas</th>
                        <th>Total de Dias</th>
                    </tr>
                </thead>
                <tbody>
        `;
        for (const supervisor in summaryData) {
            summaryHtml += `
                <tr>
                    <td>${supervisor}</td>
                    <td>${summaryData[supervisor].quantidadeRotas}</td>
                    <td>${summaryData[supervisor].totalDias}</td>
                </tr>
            `;
        }
        summaryHtml += `
                </tbody>
                <tfoot>
                    <tr class="summary-total">
                        <td><strong>${totalSupervisores} Supervisor(es)</strong></td>
                        <td><strong>${totalRotas} Rota(s)</strong></td>
                        <td><strong>${totalGeralDias} Dia(s)</strong></td>
                    </tr>
                </tfoot>
            </table>`;
        this.rotaSummary.innerHTML = summaryHtml;
    }
};

// Inicializa a UI quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    RotasUI.init();
    RotasUI.renderGrid(); // Carrega os dados iniciais
});
