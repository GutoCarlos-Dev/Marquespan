import { supabaseClient } from './supabase.js';

const BombaManager = {
    async init() {
        this.cache();
        this.bind();
        await this.loadTanques();
        this.renderBombas();
    },
    cache() {
        this.form = document.getElementById('formBomba');
        this.editingId = document.getElementById('bombaEditingId');
        this.tanqueSelect = document.getElementById('bombaTanque');
        this.nomeInput = document.getElementById('bombaNome');
        this.tableBody = document.getElementById('tableBodyBombas');
        document.getElementById('btnLimparBomba').addEventListener('click', () => this.clearForm());
    },
    bind() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
    },
    async loadTanques() {
        const { data, error } = await supabaseClient.from('tanques').select('id, nome').order('nome');
        if (error) return;
        this.tanqueSelect.innerHTML = '<option value="">-- Selecione o Tanque --</option>';
        data.forEach(t => this.tanqueSelect.add(new Option(`${t.nome}`, t.id)));
    },
    async renderBombas() {
        this.tableBody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';
        const { data, error } = await supabaseClient.from('bombas').select('*, tanques(nome)').order('nome');
        if (error) {
            this.tableBody.innerHTML = '<tr><td colspan="3">Erro ao carregar.</td></tr>';
            return;
        }
        this.tableBody.innerHTML = '';
        data.forEach(bomba => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${bomba.nome}</td>
                <td>${bomba.tanques.nome}</td>
                <td class="actions-cell">
                    <button class="btn-edit" data-id="${bomba.id}"><i class="fas fa-pen"></i></button>
                    <button class="btn-delete" data-id="${bomba.id}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            this.tableBody.appendChild(tr);
        });
        BicoManager.loadBombas(); // Atualiza a lista de bombas para o cadastro de bicos
    },
    async handleSubmit(e) {
        e.preventDefault();
        const payload = {
            nome: this.nomeInput.value,
            tanque_id: this.tanqueSelect.value
        };
        if (this.editingId.value) payload.id = this.editingId.value;

        const { error } = await supabaseClient.from('bombas').upsert(payload);
        if (error) {
            alert('Erro ao salvar bomba: ' + error.message);
        } else {
            this.clearForm();
            this.renderBombas();
        }
    },
    handleTableClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('btn-edit')) this.loadForEditing(id);
        if (btn.classList.contains('btn-delete')) this.delete(id);
    },
    async loadForEditing(id) {
        const { data, error } = await supabaseClient.from('bombas').select('*').eq('id', id).single();
        if (error) return;
        this.editingId.value = data.id;
        this.nomeInput.value = data.nome;
        this.tanqueSelect.value = data.tanque_id;
        this.form.scrollIntoView({ behavior: 'smooth' });
    },
    async delete(id) {
        if (!confirm('Deseja excluir esta bomba? Todos os bicos associados também serão excluídos.')) return;
        const { error } = await supabaseClient.from('bombas').delete().eq('id', id);
        if (error) alert('Erro ao excluir: ' + error.message);
        else this.renderBombas();
    },
    clearForm() {
        this.form.reset();
        this.editingId.value = '';
    }
};

const BicoManager = {
    async init() {
        this.cache();
        this.bind();
        await this.loadBombas();
        this.renderBicos();
    },
    cache() {
        this.form = document.getElementById('formBico');
        this.editingId = document.getElementById('bicoEditingId');
        this.bombaSelect = document.getElementById('bicoBomba');
        this.nomeInput = document.getElementById('bicoNome');
        this.tableBody = document.getElementById('tableBodyBicos');
        document.getElementById('btnLimparBico').addEventListener('click', () => this.clearForm());
    },
    bind() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
    },
    async loadBombas() {
        const { data, error } = await supabaseClient.from('bombas').select('id, nome, tanques(nome)').order('nome');
        if (error) return;
        this.bombaSelect.innerHTML = '<option value="">-- Selecione a Bomba --</option>';
        data.forEach(b => this.bombaSelect.add(new Option(`${b.nome} (Tanque: ${b.tanques.nome})`, b.id)));
    },
    async renderBicos() {
        this.tableBody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';
        const { data, error } = await supabaseClient.from('bicos').select('*, bombas(nome, tanques(nome))').order('nome');
        if (error) {
            this.tableBody.innerHTML = '<tr><td colspan="3">Erro ao carregar.</td></tr>';
            return;
        }
        this.tableBody.innerHTML = '';
        data.forEach(bico => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${bico.nome}</td>
                <td>${bico.bombas.nome} (Tanque: ${bico.bombas.tanques.nome})</td>
                <td class="actions-cell">
                    <button class="btn-edit" data-id="${bico.id}"><i class="fas fa-pen"></i></button>
                    <button class="btn-delete" data-id="${bico.id}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            this.tableBody.appendChild(tr);
        });
    },
    async handleSubmit(e) {
        e.preventDefault();
        const payload = {
            nome: this.nomeInput.value,
            bomba_id: this.bombaSelect.value
        };
        if (this.editingId.value) payload.id = this.editingId.value;

        const { error } = await supabaseClient.from('bicos').upsert(payload);
        if (error) {
            alert('Erro ao salvar bico: ' + error.message);
        } else {
            this.clearForm();
            this.renderBicos();
        }
    },
    handleTableClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('btn-edit')) this.loadForEditing(id);
        if (btn.classList.contains('btn-delete')) this.delete(id);
    },
    async loadForEditing(id) {
        const { data, error } = await supabaseClient.from('bicos').select('*').eq('id', id).single();
        if (error) return;
        this.editingId.value = data.id;
        this.nomeInput.value = data.nome;
        this.bombaSelect.value = data.bomba_id;
        this.form.scrollIntoView({ behavior: 'smooth' });
    },
    async delete(id) {
        if (!confirm('Deseja excluir este bico?')) return;
        const { error } = await supabaseClient.from('bicos').delete().eq('id', id);
        if (error) alert('Erro ao excluir: ' + error.message);
        else this.renderBicos();
    },
    clearForm() {
        this.form.reset();
        this.editingId.value = '';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    BombaManager.init();
    BicoManager.init();
});