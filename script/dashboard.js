import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificação de Login
    const usuarioLogado = localStorage.getItem('usuarioLogado');
    if (!usuarioLogado) {
        alert('Você precisa fazer login para acessar o dashboard.');
        window.location.href = 'index.html';
        return;
    }

    // 2. Inicializar Carrossel
    initCarousel();

    // 3. Carregar Dados
    carregarTotalVeiculos();
    carregarTotalManutencoes();
    carregarCustoTotal();
    carregarLitrosAbastecidos();
});

// Função para alternar o menu lateral no mobile (Global)
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
    }
};

function initCarousel() {
    const slides = document.querySelectorAll('.banner-slide');
    let currentSlide = 0;
    
    if(slides.length > 0) {
        setInterval(() => {
            slides[currentSlide].classList.remove('active');
            currentSlide = (currentSlide + 1) % slides.length;
            slides[currentSlide].classList.add('active');
        }, 4000); // Troca a cada 4 segundos
    }
}

async function carregarTotalVeiculos() {
    try {
        const { count, error } = await supabaseClient
            .from('veiculos')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;

        document.getElementById('total-veiculos').textContent = count;
    } catch (err) {
        console.error('Erro ao carregar total de veículos:', err);
    }
}

async function carregarTotalManutencoes() {
    try {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

        const { count, error } = await supabaseClient
            .from('coletas_manutencao_checklist')
            .select('*, coletas_manutencao!inner(data_hora)', { count: 'exact', head: true })
            .eq('status', 'FINALIZADO')
            .gte('coletas_manutencao.data_hora', firstDay)
            .lt('coletas_manutencao.data_hora', nextMonth);

        if (error) throw error;

        document.getElementById('total-manutencoes').textContent = count;
    } catch (err) {
        console.error('Erro ao carregar total de manutenções:', err);
    }
}

async function carregarCustoTotal() {
    try {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

        const { data, error } = await supabaseClient
            .from('coletas_manutencao_checklist')
            .select('valor, coletas_manutencao!inner(data_hora)')
            .gte('coletas_manutencao.data_hora', firstDay)
            .lt('coletas_manutencao.data_hora', nextMonth);

        if (error) throw error;

        const total = data.reduce((acc, item) => acc + (item.valor || 0), 0);
        document.getElementById('custo-total').textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (err) {
        console.error('Erro ao carregar custo total:', err);
        document.getElementById('custo-total').textContent = 'Erro';
    }
}

async function carregarLitrosAbastecidos() {
    try {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

        const { data, error } = await supabaseClient
            .from('abastecimentos')
            .select('qtd_litros')
            .neq('numero_nota', 'AJUSTE DE ESTOQUE')
            .gte('data', firstDay)
            .lt('data', nextMonth);

        if (error) throw error;

        const total = data.reduce((acc, item) => acc + (item.qtd_litros || 0), 0);
        document.getElementById('litros-abastecidos').textContent = total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' L';
    } catch (err) {
        console.error('Erro ao carregar litros:', err);
        document.getElementById('litros-abastecidos').textContent = 'Erro';
    }
}