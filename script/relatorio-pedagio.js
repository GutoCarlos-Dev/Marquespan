import { supabaseClient } from './supabase.js';

let dadosCompletos = [];
let sortState = { field: 'data_hora_passagem', ascending: false };

document.addEventListener('DOMContentLoaded', async () => {
    // Configura datas iniciais
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('dataInicial').valueAsDate = primeiroDia;
    document.getElementById('dataFinal').valueAsDate = hoje;

    await carregarFiltros();

    document.getElementById('btnBuscarRelatorio').addEventListener('click', buscarDados);
    document.getElementById('searchResultadosLocal').addEventListener('input', filtrarLocal);
    document.getElementById('btnExportarPDF').addEventListener('click', exportarPDF);
    document.getElementById('btnExportarXLS').addEventListener('click', exportarExcel);

    // Ordenação
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            sortState.ascending = (sortState.field === field) ? !sortState.ascending : true;
            sortState.field = field;
            renderizarTabela();
        });
    });
});

async function carregarFiltros() {
    // Filiais
    const { data: filiais } = await supabaseClient.from('filiais').select('nome, sigla').order('nome');
    const comboFilial = document.getElementById('filial');
    filiais?.forEach(f => {
        const opt = new Option(f.sigla ? `${f.nome} (${f.sigla})` : f.nome, f.sigla || f.nome);
        comboFilial.add(opt);
    });

    // Veículos (Datalist)
    const { data: veiculos } = await supabaseClient.from('veiculos').select('placa').eq('situacao', 'ativo').order('placa');
    const datalist = document.getElementById('listaPlacas');
    veiculos?.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.placa;
        datalist.appendChild(opt);
    });
}

async function buscarDados() {
    const btn = document.getElementById('btnBuscarRelatorio');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';

    try {
        const dataIni = document.getElementById('dataInicial').value;
        const dataFim = document.getElementById('dataFinal').value;
        const filial = document.getElementById('filial').value;
        const placa = document.getElementById('veiculo').value.toUpperCase();
        const rodovia = document.getElementById('rodovia').value;
        const praca = document.getElementById('praca').value;

        let query = supabaseClient
            .from('pedagios_lancamentos')
            .select('*, veiculos!inner(filial)');

        if (dataIni) query = query.gte('data_hora_passagem', `${dataIni}T00:00:00`);
        if (dataFim) query = query.lte('data_hora_passagem', `${dataFim}T23:59:59`);
        if (filial) query = query.eq('veiculos.filial', filial);
        if (placa) query = query.eq('placa', placa);
        if (rodovia) query = query.ilike('rodovia', `%${rodovia}%`);
        if (praca) query = query.ilike('praca', `%${praca}%`);

        const { data, error } = await query;
        if (error) throw error;

        dadosCompletos = data || [];
        renderizarTabela();

    } catch (err) {
        console.error(err);
        alert('Erro ao buscar dados.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search"></i> Buscar';
    }
}

function renderizarTabela() {
    const tbody = document.getElementById('tabelaResultados');
    const search = document.getElementById('searchResultadosLocal').value.toUpperCase();
    
    let filtrados = dadosCompletos.filter(d => 
        d.placa.includes(search) || (d.rodovia || '').toUpperCase().includes(search)
    );

    // Aplicar ordenação
    filtrados.sort((a, b) => {
        let valA = a[sortState.field];
        let valB = b[sortState.field];
        if (typeof valA === 'string') {
            valA = valA.toUpperCase();
            valB = valB.toUpperCase();
        }
        if (valA < valB) return sortState.ascending ? -1 : 1;
        if (valA > valB) return sortState.ascending ? 1 : -1;
        return 0;
    });

    tbody.innerHTML = filtrados.map(d => `
        <tr>
            <td>${new Date(d.data_hora_passagem).toLocaleString('pt-BR')}</td>
            <td><strong>${d.placa}</strong></td>
            <td>${d.marca_veiculo || '-'}</td>
            <td>${d.categoria_eixos || '-'}</td>
            <td>${d.rodovia || '-'}</td>
            <td>${d.praca || '-'}</td>
            <td>R$ ${parseFloat(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td>${d.usuario_nome || '-'}</td>
        </tr>
    `).join('');

    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
    }

    // Totais
    const totalValor = filtrados.reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);
    document.getElementById('totalRegistros').textContent = filtrados.length;
    document.getElementById('valorTotal').textContent = totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    // Ícones de sort
    document.querySelectorAll('.sortable i').forEach(i => i.className = 'fas fa-sort');
    const thAtivo = document.querySelector(`.sortable[data-sort="${sortState.field}"] i`);
    if(thAtivo) thAtivo.className = sortState.ascending ? 'fas fa-sort-up' : 'fas fa-sort-down';
}

function filtrarLocal() {
    renderizarTabela();
}

async function exportarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    doc.setFontSize(16);
    doc.text('Relatório de Passagens de Pedágio', 14, 15);

    const colunas = ["Data/Hora", "Placa", "Marca", "Eixos", "Rodovia", "Praça", "Valor (R$)", "Usuário"];
    const rows = dadosCompletos.map(d => [
        new Date(d.data_hora_passagem).toLocaleString('pt-BR'),
        d.placa,
        d.marca_veiculo || '',
        d.categoria_eixos || '',
        d.rodovia || '',
        d.praca || '',
        parseFloat(d.valor).toFixed(2),
        d.usuario_nome || ''
    ]);

    doc.autoTable({
        head: [colunas],
        body: rows,
        startY: 20,
        theme: 'grid',
        styles: { fontSize: 8 }
    });

    doc.save(`relatorio_pedagio_${new Date().getTime()}.pdf`);
}

function exportarExcel() {
    const rows = dadosCompletos.map(d => ({
        "Data/Hora": new Date(d.data_hora_passagem).toLocaleString('pt-BR'),
        "Placa": d.placa,
        "Marca": d.marca_veiculo || '',
        "Eixos": d.categoria_eixos || '',
        "Rodovia": d.rodovia || '',
        "Praça": d.praca || '',
        "Valor (R$)": parseFloat(d.valor),
        "Usuário": d.usuario_nome || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedagios");

    XLSX.writeFile(wb, `relatorio_pedagio_${new Date().getTime()}.xlsx`);
}