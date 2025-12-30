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
            this.qtdBicosInput = document.getElementById('tanqueQtdBicos');
            this.bicosContainer = document.getElementById('bicosContainer');
            this.tableBody = document.getElementById('tableBodyTanques');
            this.btnSalvar = document.getElementById('btnSalvarTanque');
            this.btnLimpar = document.getElementById('btnLimparForm');
        },

        bind() {
            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.qtdBicosInput.addEventListener('input', this.generateBicoFields.bind(this));
            this.tableBody.addEventListener('click', this.handleTableClick.bind(this));
            this.btnLimpar.addEventListener('click', this.clearForm.bind(this));
        },

        getTanques() {
            return JSON.parse(localStorage.getItem(this.KEY_TANQUES)) || [];
        },

        saveTanques(tanques) {
            localStorage.setItem(this.KEY_TANQUES, JSON.stringify(tanques));
        },

        generateBicoFields() {
            const qtd = parseInt(this.qtdBicosInput.value, 10);
            this.bicosContainer.innerHTML = '';

            if (isNaN(qtd) || qtd <= 0) {
                return;
            }

            const header = document.createElement('h4');
            header.textContent = 'Nome dos Bicos';
            this.bicosContainer.appendChild(header);

            for (let i = 1; i <= qtd; i++) {
                const group = document.createElement('div');
                group.className = 'bico-input-group';
                
                const label = document.createElement('label');
                label.setAttribute('for', `bicoNome${i}`);
                label.textContent = `Bico ${i}`;
                
                const input = document.createElement('input');
                input.type = 'text';
                input.id = `bicoNome${i}`;
                input.className = 'bico-nome-input';
                input.placeholder = `Nome do Bico ${i}`;
                input.required = true;

                group.appendChild(label);
                group.appendChild(input);
                this.bicosContainer.appendChild(group);
            }
        },

        handleFormSubmit(e) {
            e.preventDefault();

            const bicosInputs = this.bicosContainer.querySelectorAll('.bico-nome-input');
            const bicos = Array.from(bicosInputs).map(input => ({ nome: input.value }));

            if (bicos.length !== parseInt(this.qtdBicosInput.value, 10)) {
                alert('A quantidade de bicos informada não corresponde aos campos preenchidos.');
                return;
            }

            const tanque = {
                id: this.editingIdInput.value ? parseInt(this.editingIdInput.value, 10) : Date.now(),
                nome: this.nomeInput.value,
                capacidade: parseFloat(this.capacidadeInput.value),
                bicos: bicos
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
                const bicosNomes = tanque.bicos.map(b => b.nome).join(', ');

                tr.innerHTML = `
                    <td>${tanque.nome}</td>
                    <td>${tanque.capacidade.toLocaleString('pt-BR')} L</td>
                    <td>${bicosNomes}</td>
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
            this.qtdBicosInput.value = tanque.bicos.length;

            this.generateBicoFields(); // Gera os campos

            const bicosInputs = this.bicosContainer.querySelectorAll('.bico-nome-input');
            tanque.bicos.forEach((bico, index) => {
                if (bicosInputs[index]) {
                    bicosInputs[index].value = bico.nome;
                }
            });

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
            this.bicosContainer.innerHTML = '';
            this.btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Tanque';
            this.nomeInput.focus();
        }
    };

    TanqueUI.init();
});