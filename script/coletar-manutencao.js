import { supabaseClient } from './supabase.js';

const ColetarManutencaoUI = {
    init() {
        console.log('Página de Coleta de Manutenção iniciada.');
        this.cacheDOM();
        this.bindEvents();
        this.initTabs();
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
    },

    bindEvents() {
        this.btnAdicionarLancamento.addEventListener('click', () => this.abrirModal());
        this.btnCloseModal.addEventListener('click', () => this.fecharModal());
        this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this.fecharModal(); });
        this.coletaPlacaInput.addEventListener('change', () => this.preencherModeloVeiculo());
        this.formColeta.addEventListener('submit', (e) => this.registrarColeta(e));
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

    registrarColeta(e) {
        e.preventDefault();
        // Lógica futura para coletar os dados do formulário e dos checklists
        const formData = new FormData(this.formColeta);
        // ...
        alert('Registrando coleta... (lógica a ser implementada)');
        this.fecharModal();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ColetarManutencaoUI.init();
});