import { supabaseClient } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const formFiltro = document.getElementById('filtro-despesas-form');
    const resultadosContainer = document.getElementById('resultados-container');
    const tabelaResultadosBody = document.getElementById('tabela-resultados');
    const rotasList = document.getElementById('rotasList');

    let reportData = [];

    // Função para formatar moeda
    const formatCurrency = (value) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // Função para buscar rotas do banco de dados
    const fetchRotas = async () => {
        const { data, error } = await supabaseClient
            .from('rotas')
            .select('numero')
            .order('numero', { ascending: true });

        if (error) {
            console.error('Erro ao buscar rotas:', error);
            return [];
        }
        return data;
    };

    // Função para buscar despesas do banco de dados
    const fetchDespesas = async (startDate, endDate, rota) => {
        let query = supabaseClient
            .from('despesas')
            .select(`
                data_checkin,
                valor_total,
                numero_rota,
                funcionario1:funcionario!despesas_id_funcionario1_fkey(nome),
                funcionario2:funcionario!despesas_id_funcionario2_fkey(nome),
                obs:voucher
            `)
            .gte('data_checkin', startDate)
            .lte('data_checkin', endDate)
            .order('data_checkin', { ascending: false });

        if (rota) {
            query = query.eq('numero_rota', rota);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Erro ao buscar despesas:', error);
            return [];
        }
        return data;
    };

    const popularRotas = async () => {
        const rotas = await fetchRotas();
        rotasList.innerHTML = '';
        rotas.forEach(rota => {
            const option = document.createElement('option');
            option.value = rota.numero;
            rotasList.appendChild(option);
        });
    };

    const renderizarTabela = (dados) => {
        tabelaResultadosBody.innerHTML = '';
        let totalGeral = 0;

        if (dados.length === 0) {
            tabelaResultadosBody.innerHTML = '<tr><td colspan="5">Nenhuma despesa encontrada para os filtros selecionados.</td></tr>';
            return;
        }

        dados.forEach(item => {
            totalGeral += item.valor_total;
            const tr = document.createElement('tr');

            // Formata os nomes dos funcionários para exibição
            const func1 = item.funcionario1?.nome || null;
            const func2 = item.funcionario2?.nome || null;
            let funcionariosDisplay = func1 || 'N/A';
            if (func1 && func2) {
                funcionariosDisplay = `<strong>${func1}</strong><br><small>${func2}</small>`;
            }

            tr.innerHTML = `
                <td>${new Date(item.data_checkin + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${item.numero_rota}</td>
                <td>${formatCurrency(item.valor_total)}</td>
                <td>${funcionariosDisplay}</td>
                <td>${item.obs || ''}</td>
            `;
            tabelaResultadosBody.appendChild(tr);
        });

        // Adiciona a linha de rodapé com o total
        const tfoot = tabelaResultadosBody.parentElement.querySelector('tfoot') || document.createElement('tfoot');
        tfoot.innerHTML = `
            <tr>
                <td colspan="2"><strong>Total Geral</strong></td>
                <td><strong>${formatCurrency(totalGeral)}</strong></td>
                <td colspan="2"></td>
            </tr>
        `;
        tabelaResultadosBody.parentElement.appendChild(tfoot);
    };

    formFiltro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rota = document.getElementById('rota').value;
        const dataInicial = document.getElementById('data-inicial').value;
        const dataFinal = document.getElementById('data-final').value;

        if (!dataInicial || !dataFinal) {
            alert('Por favor, selecione as datas de início e fim.');
            return;
        }

        // Mostra um feedback de carregamento
        tabelaResultadosBody.innerHTML = '<tr><td colspan="5">Buscando...</td></tr>';
        resultadosContainer.style.display = 'block';

        const despesas = await fetchDespesas(dataInicial, dataFinal, rota);
        reportData = despesas; // Armazena os dados brutos para exportação

        renderizarTabela(reportData);
    });

    // Carrega as rotas ao iniciar a página
    popularRotas();
});