import { supabaseClient } from './supabase.js';

const ColetarManutencaoUI = {
    init() {
        console.log('Página de Coleta de Manutenção iniciada.');
        this.cacheDOM();
        this.bindEvents();
        this.initTabs();
        this.carregarLancamentos(); // Carrega a lista ao iniciar
        this.veiculosData = [];
    },

    cacheDOM() {
        this.btnAdicionarLancamento = document.getElementById('btnAdicionarLancamento');
        
        // Modal
        this.modal = document.getElementById('modalLancamento');
        this.btnCloseModal = this.modal.querySelector('.close-button');
        this.formColeta = document.getElementById('formLancamentoColeta');
        this.coletaDataHoraInput = document.getElementById('coletaDataHora');
        this.coletaUsuarioInput = document.getElementById('coletaUsuario');
        this.coletaPlacaInput = document.getElementById('coletaPlaca');
        this.coletaModeloInput = document.getElementById('coletaModelo');
        this.veiculosList = document.getElementById('veiculosList');
        this.tableBodyLancamentos = document.getElementById('tableBodyLancamentos');
    },

    bindEvents() {
        this.btnAdicionarLancamento.addEventListener('click', () => this.abrirModal());
        this.btnCloseModal.addEventListener('click', () => this.fecharModal());
        this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this.fecharModal(); });
        this.coletaPlacaInput.addEventListener('change', () => this.preencherModeloVeiculo());
        this.formColeta.addEventListener('submit', (e) => this.registrarColeta(e));
        
        // Event delegation para botões da tabela
        this.tableBodyLancamentos.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-delete');
            if (btn) this.excluirColeta(btn.dataset.id);
        });
    },

    initTabs() {
        const buttons = document.querySelectorAll('#menu-coletar-manutencao .painel-btn');
        const sections = document.querySelectorAll('.main-content .section');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                sections.forEach(s => s.classList.add('hidden'));

                btn.classList.add('active');
                const targetId = btn.getAttribute('data-secao');
                document.getElementById(targetId)?.classList.remove('hidden');
            });
        });
    },

    abrirModal() {
        this.formColeta.reset();
        this.preencherDadosPadrao();
        this.carregarVeiculos();
        this.modal.classList.remove('hidden');
    },

    fecharModal() {
        this.modal.classList.add('hidden');
    },

    preencherDadosPadrao() {
        // Preenche data e hora
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        this.coletaDataHoraInput.value = now.toISOString().slice(0, 16);

        // Preenche usuário
        const usuario = JSON.parse(localStorage.getItem('usuarioLogado'));
        if (usuario && usuario.nome) {
            this.coletaUsuarioInput.value = usuario.nome;
        }

        // Preenche Semana (Calculada a partir de 28/12/2025)
        const semana = this.calculateCurrentWeek();
        const semanaInput = document.getElementById('coletaSemana');
        if (semanaInput) {
            semanaInput.value = semana;
        }
    },

    calculateCurrentWeek() {
        const startDate = new Date('2025-12-28T00:00:00');
        const today = new Date();
        const diffInMs = today.getTime() - startDate.getTime();
        const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
        
        let weekNumber = Math.floor(diffInDays / 7) + 1;
        if (weekNumber < 1) weekNumber = 1; // Garante que não seja menor que 1
        return String(weekNumber).padStart(2, '0');
    },

    async carregarVeiculos() {
        try {
            const { data, error } = await supabaseClient
                .from('veiculos')
                .select('placa, modelo')
                .order('placa');
            if (error) throw error;

            this.veiculosList.innerHTML = '';
            this.veiculosData = data; // Armazena para uso posterior
            data.forEach(veiculo => {
                const option = document.createElement('option');
                option.value = veiculo.placa;
                option.textContent = veiculo.modelo;
                this.veiculosList.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar veículos:', error);
        }
    },

    preencherModeloVeiculo() {
        const placaSelecionada = this.coletaPlacaInput.value;
        const veiculo = this.veiculosData.find(v => v.placa === placaSelecionada);
        if (veiculo) {
            this.coletaModeloInput.value = veiculo.modelo;
        } else {
            this.coletaModeloInput.value = '';
        }
    },

    async registrarColeta(e) {
        e.preventDefault();
        
        const semana = document.getElementById('coletaSemana').value;
        const dataHora = document.getElementById('coletaDataHora').value;
        const usuario = document.getElementById('coletaUsuario').value;
        const placa = document.getElementById('coletaPlaca').value.toUpperCase();
        const modelo = document.getElementById('coletaModelo').value;
        const km = document.getElementById('coletaKm').value;

        // Validação de duplicidade visual na grid atual
        const duplicado = Array.from(this.tableBodyLancamentos.querySelectorAll('tr td:nth-child(3)'))
            .some(td => td.textContent === placa);
            
        if (duplicado) {
            if (!confirm(`⚠️ ATENÇÃO: A placa ${placa} já consta na lista de lançamentos abaixo. Deseja registrar novamente?`)) {
                return;
            }
        }

        const checklistItems = [];
        document.querySelectorAll('.checklist-item').forEach(item => {
            const nomeItem = item.dataset.item;
            const detalhes = item.querySelector('.checklist-details').value;
            const status = item.querySelector('.checklist-status').value;
            
            checklistItems.push({
                item: nomeItem,
                detalhes: detalhes,
                status: status
            });
        });

        try {
            // 1. Salvar cabeçalho
            const { data: coleta, error: coletaError } = await supabaseClient
                .from('coletas_manutencao')
                .insert([{
                    semana,
                    data_hora: dataHora,
                    usuario,
                    placa,
                    modelo,
                    km: parseInt(km)
                }])
                .select()
                .single();

            if (coletaError) throw coletaError;

            // 2. Salvar itens do checklist
            const checklistPayload = checklistItems.map(i => ({
                coleta_id: coleta.id,
                item: i.item,
                detalhes: i.detalhes,
                status: i.status
            }));

            const { error: checklistError } = await supabaseClient
                .from('coletas_manutencao_checklist')
                .insert(checklistPayload);

            if (checklistError) throw checklistError;

            alert('✅ Coleta registrada com sucesso!');
            this.fecharModal();
            this.carregarLancamentos(); // Atualiza a grid

        } catch (err) {
            console.error('Erro ao salvar coleta:', err);
            alert('Erro ao salvar coleta: ' + err.message);
        }
    },

    async carregarLancamentos() {
        this.tableBodyLancamentos.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';
        try {
            const { data, error } = await supabaseClient
                .from('coletas_manutencao')
                .select('*')
                .order('data_hora', { ascending: false })
                .limit(50);

            if (error) throw error;

            this.tableBodyLancamentos.innerHTML = '';
            if (!data || data.length === 0) {
                this.tableBodyLancamentos.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum lançamento encontrado nesta semana.</td></tr>';
                return;
            }

            data.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(item.data_hora).toLocaleString('pt-BR')}</td>
                    <td>${item.semana}</td>
                    <td>${item.placa}</td>
                    <td>${item.modelo || '-'}</td>
                    <td>${item.km}</td>
                    <td>${item.usuario}</td>
                    <td>
                        <button class="btn-action btn-delete" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                this.tableBodyLancamentos.appendChild(tr);
            });
        } catch (err) {
            console.error('Erro ao carregar lançamentos:', err);
            this.tableBodyLancamentos.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        }
    },

    async excluirColeta(id) {
        if (!confirm('Deseja realmente excluir este lançamento?')) return;
        try {
            // Supabase deve estar configurado com ON DELETE CASCADE, mas por segurança deletamos os itens primeiro se necessário
            await supabaseClient.from('coletas_manutencao_checklist').delete().eq('coleta_id', id);
            
            const { error } = await supabaseClient.from('coletas_manutencao').delete().eq('id', id);
            if (error) throw error;
            
            this.carregarLancamentos();
        } catch (err) {
            alert('Erro ao excluir: ' + err.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ColetarManutencaoUI.init();
});