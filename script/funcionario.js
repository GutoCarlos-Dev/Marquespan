import { supabaseClient } from './supabase.js';

class FuncionarioManager {
    constructor() {
        this.cache();
        this.bind();
        this.setupInitialState();
        this.renderGrid();
    }

    cache() {
        this.form = document.getElementById('formCadastrarFuncionario');
        this.tableBody = document.getElementById('funcionarioTableBody');
        this.editingIdInput = document.getElementById('funcionarioEditingId');
        this.btnSubmit = document.getElementById('btnSubmitFuncionario');
        this.btnClearForm = document.getElementById('btnClearFuncionarioForm');
        this.searchInput = document.getElementById('searchFuncionarioInput');
        this.btnImportarLista = document.getElementById('btnImportarLista');
        this.importFileInput = document.getElementById('importFile');
        this.summaryDiv = document.getElementById('funcionarioSummary');

        // Campos do formulário
        this.nomeInput = document.getElementById('funcionarioNome');
        this.nomeCompletoInput = document.getElementById('funcionarioNomeCompleto');
        this.cpfInput = document.getElementById('funcionarioCpf');
        this.funcaoSelect = document.getElementById('funcionarioFuncao');
        this.statusSelect = document.getElementById('funcionarioStatus');
    }

    bind() {
        this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.btnClearForm.addEventListener('click', () => this.clearForm());
        this.tableBody.addEventListener('click', (e) => this.handleTableClick(e));
        this.btnImportarLista.addEventListener('click', () => this.handleImportClick());
        this.importFileInput.addEventListener('change', (e) => this.handleFileImport(e));
        this.searchInput.addEventListener('input', () => this.renderGrid());

        const ths = document.querySelectorAll('#sectionCadastrarFuncionario .data-grid thead th[data-field]');
        ths.forEach(th => {
            const field = th.getAttribute('data-field');
            th.addEventListener('click', () => { this.toggleSort(field) });
        });
    }

    setupInitialState() {
        this._sort = { field: 'nome', ascending: true };
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const id = this.editingIdInput.value;

        const payload = {
            nome: this.nomeInput.value,
            nome_completo: this.nomeCompletoInput.value,
            cpf: this.cpfInput.value,
            funcao: this.funcaoSelect.value,
            status: this.statusSelect.value,
        };

        if (!payload.nome || !payload.funcao) {
            alert('Os campos "Nome" e "Função" são obrigatórios.');
            return;
        }

        try {
            let result;
            if (id) {
                result = await supabaseClient.from('funcionario').update(payload).eq('id', id);
            } else {
                result = await supabaseClient.from('funcionario').insert([payload]);
            }

            if (result.error) throw result.error;

            alert(`Funcionário ${id ? 'atualizado' : 'cadastrado'} com sucesso!`);
            this.clearForm();
            this.renderGrid();

        } catch (error) {
            console.error('Erro ao salvar funcionário:', error);
            alert('Erro ao salvar funcionário: ' + error.message);
        }
    }

    async handleTableClick(e) {
        const target = e.target.closest('button');
        if (!target) return;

        const id = target.dataset.id;

        if (target.classList.contains('btn-edit')) {
            const { data, error } = await supabaseClient.from('funcionario').select('*').eq('id', id).single();
            if (error) {
                alert('Erro ao carregar dados para edição.');
                console.error(error);
            } else if (data) {
                this.fillForm(data);
            }
        } else if (target.classList.contains('btn-delete')) {
            if (confirm('Tem certeza que deseja excluir este funcionário?')) {
                const { error } = await supabaseClient.from('funcionario').delete().eq('id', id);
                if (error) {
                    alert('Erro ao excluir: ' + error.message);
                } else {
                    this.renderGrid();
                }
            }
        }
    }

    fillForm(funcionario) {
        this.editingIdInput.value = funcionario.id;
        this.nomeInput.value = funcionario.nome;
        this.nomeCompletoInput.value = funcionario.nome_completo || '';
        this.cpfInput.value = funcionario.cpf || '';
        this.funcaoSelect.value = funcionario.funcao;
        this.statusSelect.value = funcionario.status || 'Ativo'; // Garante um valor padrão

        this.btnSubmit.textContent = 'Atualizar Funcionário';
        this.form.scrollIntoView({ behavior: 'smooth' });
    }

    clearForm() {
        this.form.reset();
        this.editingIdInput.value = '';
        this.btnSubmit.textContent = 'Cadastrar Funcionário';
        this.statusSelect.value = 'Ativo'; // Garante que o padrão seja 'Ativo' ao limpar
    }

    handleImportClick() {
        // Aciona o clique no input de arquivo oculto
        this.importFileInput.click();
    }

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
    }

    async processImportedData(importedRows) {
        if (!confirm(`Foram encontrados ${importedRows.length} funcionários na planilha. Deseja continuar?

Atenção:
1. Novos funcionários (por CPF) serão cadastrados como "Ativo".
2. Funcionários já existentes não serão alterados.
3. Funcionários no sistema que NÃO estão na lista serão marcados como "Desligado".`)) {
            return;
        }

        try {
            // 1. Buscar todos os funcionários existentes no banco pelo CPF
            const { data: existingFuncionarios, error: fetchError } = await supabaseClient
                .from('funcionario')
                .select('cpf');

            if (fetchError) throw fetchError;

            const existingCpfs = new Set(existingFuncionarios.map(f => f.cpf).filter(Boolean));
            const importedCpfs = new Set();

            // 2. Preparar a lista de novos funcionários para inserção
            const funcionariosToInsert = [];
            for (const row of importedRows) {
                const cpf = String(row.CPF || '').trim();
                if (!cpf) continue; // Pula linhas sem CPF

                importedCpfs.add(cpf);

                // Adiciona para inserção apenas se o CPF não existir no banco
                if (!existingCpfs.has(cpf)) {
                    funcionariosToInsert.push({
                        nome: row.Nome,
                        nome_completo: row['Nome Completo'],
                        cpf: cpf,
                        funcao: row.Função,
                        status: 'Ativo' // Status padrão para novos
                    });
                }
            }

            // 3. Inserir os novos funcionários em lote
            if (funcionariosToInsert.length > 0) {
                const { error: insertError } = await supabaseClient.from('funcionario').insert(funcionariosToInsert);
                if (insertError) throw insertError;
            }

            // 4. Atualizar o status para "Desligado" para funcionários que não estão na lista de importação
            const cpfsToDeactivate = [...existingCpfs].filter(cpf => !importedCpfs.has(cpf));
            if (cpfsToDeactivate.length > 0) {
                const { error: updateError } = await supabaseClient.from('funcionario').update({ status: 'Desligado' }).in('cpf', cpfsToDeactivate);
                if (updateError) throw updateError;
            }

            alert(`Importação concluída com sucesso!\n- ${funcionariosToInsert.length} funcionários novos cadastrados.\n- ${cpfsToDeactivate.length} funcionários existentes atualizados para "Desligado".`);
            this.renderGrid(); // Atualiza a tabela na tela
        } catch (error) {
            console.error('Erro detalhado no processamento:', error);
            alert('Erro ao processar os dados e atualizar o banco: ' + error.message);
        }
    }

    toggleSort(field) {
        if (this._sort.field === field) {
            this._sort.ascending = !this._sort.ascending;
        } else {
            this._sort.field = field;
            this._sort.ascending = true;
        }
        this.renderGrid();
    }

    async renderGrid() {
        const searchTerm = this.searchInput.value.trim();
        let query = supabaseClient.from('funcionario').select('*').order(this._sort.field, { ascending: this._sort.ascending });

        if (searchTerm) {
            query = query.or(`nome.ilike.%${searchTerm}%,cpf.ilike.%${searchTerm}%,funcao.ilike.%${searchTerm}%,status.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Erro ao buscar funcionários:', error);
            this.tableBody.innerHTML = `<tr><td colspan="6">Erro ao carregar dados.</td></tr>`;
            return;
        }

        this.tableBody.innerHTML = '';
        if (data.length === 0) {
            this.tableBody.innerHTML = `<tr><td colspan="6">Nenhum funcionário encontrado.</td></tr>`;
        } else {
            data.forEach(func => {
                const tr = document.createElement('tr');
                // Adiciona uma classe para estilizar o status se desejar
                const statusClass = func.status === 'Ativo' ? 'status-ativo' : 'status-desligado';
                tr.innerHTML = `
                    <td>${func.nome}</td>
                    <td>${func.nome_completo || ''}</td>
                    <td>${func.cpf || ''}</td>
                    <td>${func.funcao}</td>
                    <td><span class="status-badge ${statusClass}">${func.status}</span></td>
                    <td>
                        <button class="btn-action btn-edit" data-id="${func.id}">Editar</button>
                        <button class="btn-action btn-delete" data-id="${func.id}">Excluir</button>
                    </td>
                `;
                this.tableBody.appendChild(tr);
            });
        }

        this.renderSummary(data);
    }

    renderSummary(data) {
        if (!data) {
            this.summaryDiv.innerHTML = '';
            return;
        }

        const total = data.length;
        const ativos = data.filter(f => f.status === 'Ativo').length;
        const desligados = total - ativos;
        const motoristas = data.filter(f => f.funcao === 'Motorista' && f.status === 'Ativo').length;
        const auxiliares = data.filter(f => f.funcao === 'Auxiliar' && f.status === 'Ativo').length;

        this.summaryDiv.innerHTML = `
            <h3>Resumo</h3>
            <table>
                <tr>
                    <th>Total de Funcionários</th>
                    <td>${total}</td>
                </tr>
                <tr>
                    <th>Ativos</th>
                    <td>${ativos}</td>
                </tr>
                <tr>
                    <th>Desligados</th>
                    <td>${desligados}</td>
                </tr>
                <tr>
                    <th>Motoristas (Ativos)</th>
                    <td>${motoristas}</td>
                </tr>
                <tr>
                    <th>Auxiliares (Ativos)</th>
                    <td>${auxiliares}</td>
                </tr>
            </table>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FuncionarioManager();
});