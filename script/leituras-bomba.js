import { supabaseClient } from './supabase.js';

const LeiturasBomba = {
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.setDefaultDate();
        this.carregarBicos(); // Carrega os bicos para o select do modal
        this.carregarLeituras(); // Carrega a lista do dia
    },

    cacheDOM() {
        // Filtros e Tabela
        this.dateInput = document.getElementById('leituraData');
        this.tbody = document.getElementById('tableBodyLeituras');
        this.btnNova = document.getElementById('btnNovaLeitura');
        
        // Modal e Formulário
        this.modal = document.getElementById('modalLeitura');
        this.formModal = document.getElementById('formNovaLeitura');
        this.modalData = document.getElementById('modalData');
        this.selectBico = document.getElementById('modalBomba'); // ID mantido do HTML, mas refere-se ao Bico
        this.inputInicial = document.getElementById('modalLeituraInicial');
        this.inputFinal = document.getElementById('modalLeituraFinal');
        this.btnClose = document.querySelector('.close');
    },

    bindEvents() {
        this.dateInput.addEventListener('change', () => this.carregarLeituras());
        this.btnNova.addEventListener('click', () => this.abrirModal());
        this.btnClose.addEventListener('click', () => this.fecharModal());
        this.formModal.addEventListener('submit', (e) => this.salvarLeitura(e));
        
        // Ao selecionar um bico, busca o encerrante anterior
        this.selectBico.addEventListener('change', (e) => this.buscarUltimaLeitura(e.target.value));
        
        // Fechar modal clicando fora
        window.addEventListener('click', (e) => {
            if (e.target == this.modal) this.fecharModal();
        });
    },

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        this.dateInput.value = today;
    },

    async carregarBicos() {
        // Busca bicos com as relações: Bico -> Bomba -> Tanque
        try {
            const { data, error } = await supabaseClient
                .from('bicos')
                .select(`
                    id,
                    nome,
                    bombas (
                        nome,
                        tanques (nome)
                    )
                `)
                .order('nome');

            if (error) throw error;

            this.selectBico.innerHTML = '<option value="">Selecione o Bico...</option>';
            data.forEach(bico => {
                const bombaNome = bico.bombas?.nome || 'S/ Bomba';
                const tanqueNome = bico.bombas?.tanques?.nome || 'S/ Tanque';
                // Exibe: Bico 01 - Bomba Diesel (Tanque 1)
                const option = document.createElement('option');
                option.value = bico.id;
                option.textContent = `${bico.nome} - ${bombaNome} (${tanqueNome})`;
                this.selectBico.appendChild(option);
            });
        } catch (err) {
            console.error('Erro ao carregar bicos:', err);
        }
    },

    async carregarLeituras() {
        const dataSelecionada = this.dateInput.value;
        this.tbody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';

        try {
            // 1. Busca as leituras do dia (sem join para evitar erro de FK inexistente)
            const { data: leituras, error: errorLeituras } = await supabaseClient
                .from('leituras_bomba')
                .select('id, leitura_inicial, leitura_final, bico_id')
                .eq('data_leitura', dataSelecionada);

            if (errorLeituras) throw errorLeituras;

            // 2. Busca os dados completos dos bicos (Bico -> Bomba -> Tanque)
            const { data: bicos, error: errorBicos } = await supabaseClient
                .from('bicos')
                .select('id, nome, bombas(nome, tanques(nome))');

            if (errorBicos) throw errorBicos;

            // 3. Cruza as informações manualmente
            const bicosMap = new Map((bicos || []).map(b => [b.id, b]));
            const dadosCompletos = (leituras || []).map(l => ({ ...l, bicos: bicosMap.get(l.bico_id) }));

            this.renderTabela(dadosCompletos);
        } catch (err) {
            console.error('Erro ao carregar leituras:', err);
            this.tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        }
    },

    renderTabela(dados) {
        if (!dados || dados.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma leitura registrada para esta data.</td></tr>';
            return;
        }

        this.tbody.innerHTML = dados.map(item => {
            const totalLitros = (parseFloat(item.leitura_final) || 0) - (parseFloat(item.leitura_inicial) || 0);
            return `
            <tr>
                <td>${item.bicos?.nome || '-'}</td>
                <td>${item.bicos?.bombas?.nome || '-'}</td>
                <td>${item.bicos?.bombas?.tanques?.nome || '-'}</td>
                <td>${parseFloat(item.leitura_inicial).toFixed(2)}</td>
                <td>${parseFloat(item.leitura_final).toFixed(2)}</td>
                <td class="total-litros-cell">${totalLitros.toFixed(2)} L</td>
                <td>
                    <button class="btn-acao excluir" onclick="LeiturasBomba.excluirLeitura(${item.id})" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `}).join('');
    },

    abrirModal() {
        this.modal.style.display = 'flex';
        this.modalData.value = this.dateInput.value;
        this.selectBico.value = '';
        this.inputInicial.value = '';
        this.inputFinal.value = '';
    },

    fecharModal() {
        this.modal.style.display = 'none';
    },

    async buscarUltimaLeitura(bicoId) {
        if (!bicoId) {
            this.inputInicial.value = '';
            return;
        }

        try {
            // Busca a última leitura registrada para este bico (independente da data, mas idealmente a mais recente anterior)
            const { data, error } = await supabaseClient
                .from('leituras_bomba')
                .select('leitura_final')
                .eq('bico_id', bicoId)
                .lt('data_leitura', this.modalData.value) // Busca leituras anteriores à data selecionada
                .order('data_leitura', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (data && data.length > 0) {
                this.inputInicial.value = data[0].leitura_final;
            } else {
                // Se não houver leitura anterior, tenta buscar a última inserida no geral ou define como 0
                // Aqui definimos como 0, permitindo ajuste manual se necessário (embora o campo seja readonly, pode-se remover o readonly via JS se for a primeira vez)
                this.inputInicial.value = '0.00';
            }
        } catch (err) {
            console.error('Erro ao buscar última leitura:', err);
            this.inputInicial.value = '0.00';
        }
    },

    async salvarLeitura(e) {
        e.preventDefault();
        
        const bicoId = this.selectBico.value;
        const dataLeitura = this.modalData.value;
        const inicial = parseFloat(this.inputInicial.value);
        const final = parseFloat(this.inputFinal.value);

        if (final < inicial) {
            alert('A leitura final não pode ser menor que a leitura inicial (Encerrante Anterior)!');
            return;
        }

        const total = final - inicial;

        try {
            const { error } = await supabaseClient
                .from('leituras_bomba')
                .insert({
                    data_leitura: dataLeitura,
                    bico_id: bicoId,
                    leitura_inicial: inicial,
                    leitura_final: final,
                });

            if (error) throw error;

            alert('Leitura salva com sucesso!');
            this.fecharModal();
            this.carregarLeituras();
        } catch (err) {
            console.error('Erro ao salvar:', err);
            alert('Erro ao salvar leitura: ' + err.message);
        }
    },
    
    async excluirLeitura(id) {
        if(!confirm('Deseja realmente excluir esta leitura?')) return;
        
        try {
            const { error } = await supabaseClient
                .from('leituras_bomba')
                .delete()
                .eq('id', id);
                
            if (error) throw error;
            this.carregarLeituras();
        } catch (err) {
            alert('Erro ao excluir: ' + err.message);
        }
    }
};

// Expõe o objeto para o escopo global para que os botões onclick funcionem
window.LeiturasBomba = LeiturasBomba;

document.addEventListener('DOMContentLoaded', () => {
    LeiturasBomba.init();
});