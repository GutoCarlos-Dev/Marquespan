import { supabaseClient } from './supabase.js';

const ColetarManutencaoUI = {
    init() {
        console.log('Página de Coleta de Manutenção iniciada.');
        this.cacheDOM();
        this.bindEvents();
        this.initTabs();
    },

    cacheDOM() {
        // Exemplo: this.meuElemento = document.getElementById('meu-elemento');
    },

    bindEvents() {
        // Exemplo: this.meuElemento.addEventListener('click', () => this.minhaFuncao());
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
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ColetarManutencaoUI.init();
});