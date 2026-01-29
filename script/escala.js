// Importa o cliente Supabase, assumindo que ele está configurado em supabase.js
import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Página de Controle de Escala carregada.');

    // Proteção de página: verifica se o usuário está logado
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado) {
        alert('Acesso negado. Por favor, faça login.');
        window.location.href = '../index.html'; // Redireciona para a página de login na raiz
        return;
    }

    // --- ELEMENTOS DO DOM ---
    const selectSemana = document.getElementById('escalaSemana');
    const btnAbrirEscala = document.getElementById('btnAbrirEscala');
    const painelEscala = document.getElementById('painelEscala');
    const tabelaBody = document.getElementById('tabelaEscalaBody');
    const tituloDia = document.getElementById('tituloDia');
    const tabButtons = document.querySelectorAll('.tab-btn');

    // --- FUNÇÕES ---

    /**
     * Calcula o número da semana atual do ano.
     * @param {Date} d - A data atual.
     * @returns {number} O número da semana.
     */
    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return weekNo;
    }

    /**
     * Popula o select de semanas com as 52 semanas do ano e seleciona a atual.
     */
    function carregarSemanas() {
        const semanaAtual = getWeekNumber(new Date());
        selectSemana.innerHTML = ''; // Limpa opções existentes

        for (let i = 1; i <= 52; i++) {
            const nomeSemana = `SEMANA ${String(i).padStart(2, '0')}`;
            const option = new Option(nomeSemana, nomeSemana);
            selectSemana.appendChild(option);
        }
        selectSemana.value = `SEMANA ${String(semanaAtual).padStart(2, '0')}`;
    }

    /**
     * Gets the date of the Monday of a given ISO week number and year.
     * @param {number} weekNum The week number (1-53).
     * @param {number} year The year.
     * @returns {Date} The date of the Monday of that week.
     */
    function getMondayOfIsoWeek(weekNum, year) {
        // January 4th is always in week 1
        const d = new Date(Date.UTC(year, 0, 4));
        // Get the day of week, with Sunday as 7
        const dayOfWeek = d.getUTCDay() || 7;
        // Set to the Monday of the week of Jan 4th and add the weeks
        d.setUTCDate(d.getUTCDate() + (weekNum - 1) * 7 - dayOfWeek + 1);
        return d;
    }

    /**
     * Carrega os dados da escala para o dia e semana selecionados.
     * @param {string} dia - O dia da semana (ex: 'SEGUNDA').
     * @param {string} semana - A semana selecionada (ex: 'SEMANA 01').
     */
    async function carregarDadosDia(dia, semana) {
        tabelaBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Carregando...</td></tr>';

        const coresDia = {
            'SEGUNDA': '#007bff',
            'TERCA': '#fd7e14',
            'QUARTA': '#28a745',
            'QUINTA': '#6f42c1',
            'SEXTA': '#dc3545',
            'SABADO': '#17a2b8',
            'DOMINGO': '#e83e8c'
        };
        tituloDia.style.color = coresDia[dia] || '#006937';

        // --- NOVA LÓGICA PARA ADICIONAR A DATA ---
        const weekNum = parseInt(semana.replace('SEMANA ', ''), 10);
        const today = new Date();
        const currentMonth = today.getMonth(); // 0-11
        let year = today.getFullYear();

        // Adjust year for weeks at the boundary of the year
        if (currentMonth === 11 && weekNum < 5) { // It's December, but user chose an early week (e.g. week 1) -> must be next year
            year++;
        } else if (currentMonth === 0 && weekNum > 50) { // It's January, but user chose a late week (e.g. week 52) -> must be last year
            year--;
        }

        const mondayDate = getMondayOfIsoWeek(weekNum, year);
        const dayOffsets = { 'SEGUNDA': 0, 'TERCA': 1, 'QUARTA': 2, 'QUINTA': 3, 'SEXTA': 4, 'SABADO': 5, 'DOMINGO': 6 };
        const dayOffset = dayOffsets[dia] || 0;
        const currentDate = new Date(mondayDate);
        currentDate.setUTCDate(mondayDate.getUTCDate() + dayOffset);
        const formattedDate = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const diaNome = dia === 'TERCA' ? 'TERÇA' : dia;
        tituloDia.innerHTML = `<i class="fa-solid fa-calendar-day"></i> ${diaNome} - ${formattedDate}`;

        // AQUI VOCÊ DEVE IMPLEMENTAR A BUSCA REAL NO BANCO DE DADOS
        // Exemplo de estrutura esperada:
        // const { data, error } = await supabaseClient.from('escala_diaria').select('*').eq('semana', semana).eq('dia', dia);
        
        // Simulação de dados vazios por enquanto, pois a tabela específica não foi fornecida
        setTimeout(() => {
            tabelaBody.innerHTML = `<tr><td colspan="7" style="text-align: center;">Nenhum registro encontrado para ${dia} na ${semana}.</td></tr>`;
        }, 300);
    }

    // --- EVENT LISTENERS ---

    // Botão Abrir Escala
    if (btnAbrirEscala) {
        btnAbrirEscala.addEventListener('click', () => {
            const semanaSelecionada = selectSemana.value;
            if (!semanaSelecionada) {
                alert('Por favor, selecione uma semana.');
                return;
            }

            // --- NOVA LÓGICA PARA ATUALIZAR ABAS COM DATAS ---
            const weekNum = parseInt(semanaSelecionada.replace('SEMANA ', ''), 10);
            const today = new Date();
            const currentMonth = today.getMonth(); // 0-11
            let year = today.getFullYear();
            if (currentMonth === 11 && weekNum < 5) { year++; } 
            else if (currentMonth === 0 && weekNum > 50) { year--; }

            const mondayDate = getMondayOfIsoWeek(weekNum, year);
            const dayOffsets = { 'SEGUNDA': 0, 'TERCA': 1, 'QUARTA': 2, 'QUINTA': 3, 'SEXTA': 4, 'SABADO': 5, 'DOMINGO': 6 };

            tabButtons.forEach(btn => {
                const dia = btn.dataset.dia;
                const dayOffset = dayOffsets[dia] || 0;
                const currentDate = new Date(mondayDate);
                currentDate.setUTCDate(mondayDate.getUTCDate() + dayOffset);
                const formattedDate = currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                
                const diaNome = btn.textContent.split(' ')[0].replace(/\d/g, '').replace(/\//g, '').trim();
                btn.innerHTML = `${diaNome} <span class="tab-date">${formattedDate}</span>`;
            });
            // --- FIM DA NOVA LÓGICA ---

            painelEscala.classList.remove('hidden');
            
            // Ativa a primeira aba (SEGUNDA) por padrão
            const abaSegunda = document.querySelector('.tab-btn[data-dia="SEGUNDA"]');
            if (abaSegunda) abaSegunda.click();
        });
    }

    // Navegação por Abas
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove classe active de todos
            tabButtons.forEach(b => b.classList.remove('active'));
            // Adiciona ao clicado
            e.target.classList.add('active');
            
            const dia = e.target.dataset.dia;
            const semana = selectSemana.value;
            carregarDadosDia(dia, semana);
        });
    });

    // --- INICIALIZAÇÃO ---
    carregarSemanas();
});