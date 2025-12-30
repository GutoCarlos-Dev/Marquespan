document.addEventListener('DOMContentLoaded', () => {
    const TanqueUI = {
        KEY_TANQUES: 'marquespan_tanques',
        
        init() {
            this.cache();
            this.bind();
            this.renderTable();
        },

        cache() {
            this.form = document.getElementById('formTanque');
            this.editingIdInput = document.getElementById('tanqueEditingId');
            this.nomeInput = document.getElementById('tanqueNome');
            this.capacidadeInput = document.getElementById('tanqueCapacidade');
            this.tipoCombustivelSelect = document.getElementById('tanqueTipoCombustivel');
            this.tableBody = document.getElementById('tableBodyTanques');
            this.btnSalvar = document.getElementById('btnSalvarTanque');
            this.btnLimpar = document.getElementById('btnLimparForm');
        },

        bind() {
            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.tableBody.addEventListener('click', this.handleTableClick.bind(this));
            this.btnLimpar.addEventListener('click', this.clearForm.bind(this));
        },

        getTanques() {
            return JSON.parse(localStorage.getItem(this.KEY_TANQUES)) || [];
        },

        saveTanques(tanques) {
            localStorage.setItem(this.KEY_TANQUES, JSON.stringify(tanques));
        },

        handleFormSubmit(e) {
            e.preventDefault();

            const tanque = {
                id: this.editingIdInput.value ? parseInt(this.editingIdInput.value, 10) : Date.now(),
                nome: this.nomeInput.value,
                capacidade: parseFloat(this.capacidadeInput.value),
                tipoCombustivel: this.tipoCombustivelSelect.value
            };

            let tanques = this.getTanques();
            if (this.editingIdInput.value) {
                const index = tanques.findIndex(t => t.id === tanque.id);
                if (index > -1) {
                    tanques[index] = tanque;
                }
            } else {
                tanques.push(tanque);
            }

            this.saveTanques(tanques);
            alert(`Tanque ${this.editingIdInput.value ? 'atualizado' : 'salvo'} com sucesso!`);
            this.clearForm();
            this.renderTable();
        },

        renderTable() {
            const tanques = this.getTanques();
            this.tableBody.innerHTML = '';

            if (tanques.length === 0) {
                this.tableBody.innerHTML = '<tr><td colspan="4">Nenhum tanque cadastrado.</td></tr>';
                return;
            }

            tanques.forEach(tanque => {
                const tr = document.createElement('tr');

                tr.innerHTML = `
                    <td>${tanque.nome}</td>
                    <td>${tanque.capacidade.toLocaleString('pt-BR')} L</td>
                    <td>${tanque.tipoCombustivel || '-'}</td>
                    <td class="actions-cell">
                        <button class="btn-edit" data-id="${tanque.id}" title="Editar"><i class="fas fa-pen"></i></button>
                        <button class="btn-delete" data-id="${tanque.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBody.appendChild(tr);
            });
        },

        handleTableClick(e) {
            const button = e.target.closest('button');
            if (!button) return;

            const id = parseInt(button.dataset.id, 10);

            if (button.classList.contains('btn-edit')) {
                this.loadForEditing(id);
            } else if (button.classList.contains('btn-delete')) {
                if (confirm('Tem certeza que deseja excluir este tanque?')) {
                    this.deleteTanque(id);
                }
            }
        },

        loadForEditing(id) {
            const tanques = this.getTanques();
            const tanque = tanques.find(t => t.id === id);

            if (!tanque) return;

            this.editingIdInput.value = tanque.id;
            this.nomeInput.value = tanque.nome;
            this.capacidadeInput.value = tanque.capacidade;
            this.tipoCombustivelSelect.value = tanque.tipoCombustivel || "";
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Atualizar Tanque';
            this.form.scrollIntoView({ behavior: 'smooth' });
        },

        deleteTanque(id) {
            let tanques = this.getTanques();
            tanques = tanques.filter(t => t.id !== id);
            this.saveTanques(tanques);
            this.renderTable();
        },

        clearForm() {
            this.form.reset();
            this.editingIdInput.value = '';
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Tanque';
            this.nomeInput.focus();
        }
    };

    TanqueUI.init();
});