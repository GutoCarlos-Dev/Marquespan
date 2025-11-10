import { supabase } from './supabase.js';

let gridBody;

// 🚀 Inicialização
async function carregarEstoque() {
  gridBody = document.getElementById('grid-estoque-body');
  if (!gridBody) return;

  try {
    // Buscar dados da tabela estoque_pneus (mantida automaticamente atualizada pelos triggers)
    // Filtrar apenas itens com quantidade > 0 para mostrar apenas estoque positivo
    const { data: estoque, error } = await supabase
      .from('estoque_pneus')
      .select('*')
      .gt('quantidade', 0)
      .order('marca', { ascending: true })
      .order('modelo', { ascending: true });

    if (error) {
      console.error('Erro ao carregar estoque:', error);
      gridBody.innerHTML = '<div class="grid-row" style="padding: 20px; text-align: center;">Erro ao carregar dados.</div>';
      return;
    }

    const lista = estoque || [];
    await popularDatalists();
    renderizarEstoque(lista);
  } catch (error) {
    console.error('Erro ao carregar estoque:', error);
    gridBody.innerHTML = '<div class="grid-row" style="padding: 20px; text-align: center;">Erro ao carregar dados.</div>';
  }
}

async function buscarEstoque() {
  const placa = document.getElementById('campo-placa-estoque')?.value.trim().toUpperCase();
  const marca = document.getElementById('campo-marca-estoque')?.value.trim().toUpperCase();
  const modelo = document.getElementById('campo-modelo-estoque')?.value.trim().toUpperCase();
  const vida = document.getElementById('campo-vida-estoque')?.value.trim();
  const tipo = document.getElementById('campo-tipo-estoque')?.value.trim().toUpperCase();

  try {
    let query = supabase
      .from('estoque_pneus')
      .select('*')
      .order('placa', { ascending: true })
      .order('marca', { ascending: true })
      .order('modelo', { ascending: true });

    if (placa) {
      query = query.ilike('placa', `%${placa}%`);
    }
    if (marca) {
      query = query.ilike('marca', `%${marca}%`);
    }
    if (modelo) {
      query = query.ilike('modelo', `%${modelo}%`);
    }
    if (vida) {
      query = query.eq('vida', parseInt(vida));
    }
    if (tipo) {
      query = query.ilike('tipo', `%${tipo}%`);
    }

    const { data: estoque, error } = await query;

    if (error) {
      console.error('Erro ao buscar estoque:', error);
      return;
    }

    renderizarEstoque(estoque || []);
  } catch (error) {
    console.error('Erro ao buscar estoque:', error);
  }
}

function renderizarEstoque(lista) {
  gridBody.innerHTML = '';

  if (lista.length === 0) {
    gridBody.innerHTML = '<div class="grid-row" style="padding: 20px; text-align: center;">Nenhum item em estoque.</div>';
    document.getElementById('total-quantidade').textContent = '0';
    return;
  }

  let total = 0;

  lista.forEach((item, index) => {
    total += item.quantidade;
    const row = document.createElement('div');
    row.classList.add('grid-row');
    row.style.display = 'flex';
    row.style.whiteSpace = 'nowrap';
    row.style.borderBottom = '1px solid #eee';
    row.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
    row.style.cursor = 'default';

    row.innerHTML = `
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${item.placa}</div>
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${item.marca}</div>
      <div style="flex: 1.5; min-width: 120px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${item.modelo}</div>
      <div style="flex: 0.5; min-width: 50px; padding: 12px 8px; text-align: center; border-right: 1px solid #eee;">${item.vida}</div>
      <div style="flex: 1; min-width: 80px; padding: 12px 8px; text-align: left; border-right: 1px solid #eee;">${item.tipo}</div>
      <div style="flex: 1.5; min-width: 100px; padding: 12px 8px; text-align: center; border-right: 1px solid #eee; font-weight: bold; color: ${item.quantidade > 0 ? '#28a745' : '#dc3545'};">${item.quantidade}</div>
    `;

    gridBody.appendChild(row);
  });

  document.getElementById('total-quantidade').textContent = total;
}

// Função para popular os datalists com opções únicas do Supabase
async function popularDatalists() {
  try {
    const { data: estoque, error } = await supabase
      .from('estoque_pneus')
      .select('marca, modelo, tipo, vida');

    if (error) {
      console.error('Erro ao carregar opções para datalist:', error);
      return;
    }

    const lista = estoque || [];
    const marcas = [...new Set(lista.map(item => item.marca))].sort();
    const modelos = [...new Set(lista.map(item => item.modelo))].sort();
    const tipos = [...new Set(lista.map(item => item.tipo))].sort();
    const vidas = [...new Set(lista.map(item => item.vida))].sort();

    const marcasList = document.getElementById('marcas-list');
    const modelosList = document.getElementById('modelos-list');
    const tiposList = document.getElementById('tipos-list');

    if (marcasList) marcasList.innerHTML = '';
    if (modelosList) modelosList.innerHTML = '';
    if (tiposList) tiposList.innerHTML = '';

    marcas.forEach(marca => {
      if (marcasList) {
        const option = document.createElement('option');
        option.value = marca;
        marcasList.appendChild(option);
      }
    });

    modelos.forEach(modelo => {
      if (modelosList) {
        const option = document.createElement('option');
        option.value = modelo;
        modelosList.appendChild(option);
      }
    });

    tipos.forEach(tipo => {
      if (tiposList) {
        const option = document.createElement('option');
        option.value = tipo;
        tiposList.appendChild(option);
      }
    });
  } catch (error) {
    console.error('Erro ao popular datalists:', error);
  }
}

// Função para limpar filtros
function limparFiltros() {
  document.getElementById('campo-placa-estoque').value = '';
  document.getElementById('campo-marca-estoque').value = '';
  document.getElementById('campo-modelo-estoque').value = '';
  document.getElementById('campo-vida-estoque').value = '';
  document.getElementById('campo-tipo-estoque').value = '';
  carregarEstoque();
}

// Funções para gerar dados simulados de movimentação (entrada/saída)
function gerarDadosMovimentacao() {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
  const entradas = meses.map(() => Math.floor(Math.random() * 50) + 20);
  const saidas = meses.map(() => Math.floor(Math.random() * 40) + 15);
  return { meses, entradas, saidas };
}

// Função para gerar gráficos com dados do Supabase
async function gerarGraficos() {
  try {
    // Buscar dados do estoque para gráficos
    const { data: estoque, error: estoqueError } = await supabase
      .from('estoque_pneus')
      .select('*');

    if (estoqueError) {
      console.error('Erro ao buscar dados para gráficos:', estoqueError);
      return;
    }

    const lista = estoque || [];

    // Buscar dados de movimentação dos últimos 6 meses
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);

    const { data: movimentacoes, error: movError } = await supabase
      .from('pneus')
      .select('data, status, quantidade')
      .gte('data', seisMesesAtras.toISOString())
      .order('data', { ascending: true });

    if (movError) {
      console.error('Erro ao buscar dados de movimentação:', movError);
      return;
    }

    const movLista = movimentacoes || [];

    // Processar dados de movimentação por mês
    const movimentacaoPorMes = {};
    movLista.forEach(mov => {
      const data = new Date(mov.data);
      const mesAno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;

      if (!movimentacaoPorMes[mesAno]) {
        movimentacaoPorMes[mesAno] = { entradas: 0, saidas: 0 };
      }

      if (mov.status === 'ENTRADA') {
        movimentacaoPorMes[mesAno].entradas += mov.quantidade;
      } else if (mov.status === 'SAIDA') {
        movimentacaoPorMes[mesAno].saidas += mov.quantidade;
      }
    });

    // Preparar dados para o gráfico (últimos 6 meses)
    const meses = [];
    const entradas = [];
    const saidas = [];

    for (let i = 5; i >= 0; i--) {
      const data = new Date();
      data.setMonth(data.getMonth() - i);
      const mesAno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      const nomeMes = data.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

      meses.push(nomeMes);
      entradas.push(movimentacaoPorMes[mesAno]?.entradas || 0);
      saidas.push(movimentacaoPorMes[mesAno]?.saidas || 0);
    }

    const ctxMovimentacao = document.getElementById('chartMovimentacao');
    if (ctxMovimentacao) {
      const context = ctxMovimentacao.getContext('2d');
      new Chart(context, {
        type: 'bar',
        data: {
          labels: meses,
          datasets: [{
            label: 'Entradas',
            data: entradas,
            backgroundColor: 'rgba(40, 167, 69, 0.7)',
            borderColor: 'rgba(40, 167, 69, 1)',
            borderWidth: 1
          }, {
            label: 'Saídas',
            data: saidas,
            backgroundColor: 'rgba(220, 53, 69, 0.7)',
            borderColor: 'rgba(220, 53, 69, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
    }

    // Gráfico de Distribuição por Marca (Pizza)
    const marcasCount = {};
    lista.forEach(item => {
      if (item.quantidade > 0) { // Filtrar apenas itens com estoque positivo
        marcasCount[item.marca] = (marcasCount[item.marca] || 0) + item.quantidade;
      }
    });

    const ctxMarcas = document.getElementById('chartMarcas');
    if (ctxMarcas) {
      const context = ctxMarcas.getContext('2d');
      new Chart(context, {
        type: 'doughnut',
        data: {
          labels: Object.keys(marcasCount),
          datasets: [{
            data: Object.values(marcasCount),
            backgroundColor: [
              'rgba(255, 99, 132, 0.8)',
              'rgba(54, 162, 235, 0.8)',
              'rgba(255, 205, 86, 0.8)',
              'rgba(75, 192, 192, 0.8)',
              'rgba(153, 102, 255, 0.8)',
              'rgba(255, 159, 64, 0.8)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'bottom',
            }
          }
        }
      });
    }

    // Gráfico de Fluxo por Modelo (Barras Horizontais)
    const modelosCount = {};
    lista.forEach(item => {
      if (item.quantidade > 0) { // Filtrar apenas itens com estoque positivo
        modelosCount[item.modelo] = (modelosCount[item.modelo] || 0) + item.quantidade;
      }
    });

    const topModelos = Object.entries(modelosCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    const ctxModelos = document.getElementById('chartModelos');
    if (ctxModelos) {
      const context = ctxModelos.getContext('2d');
      new Chart(context, {
        type: 'bar',
        data: {
          labels: topModelos.map(([modelo]) => modelo),
          datasets: [{
            label: 'Quantidade em Estoque',
            data: topModelos.map(([,quantidade]) => quantidade),
            backgroundColor: 'rgba(54, 162, 235, 0.7)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          scales: {
            x: {
              beginAtZero: true
            }
          }
        }
      });
    }

    // Gráfico de Análise de Vida Útil (Linha)
    const vidaCount = {};
    lista.forEach(item => {
      if (item.quantidade > 0) { // Filtrar apenas itens com estoque positivo
        vidaCount[item.vida] = (vidaCount[item.vida] || 0) + item.quantidade;
      }
    });

    const ctxVida = document.getElementById('chartVida');
    if (ctxVida) {
      const context = ctxVida.getContext('2d');
      new Chart(context, {
        type: 'line',
        data: {
          labels: Object.keys(vidaCount).sort((a, b) => a - b),
          datasets: [{
            label: 'Quantidade por Vida Útil',
            data: Object.keys(vidaCount).sort((a, b) => a - b).map(vida => vidaCount[vida]),
            backgroundColor: 'rgba(255, 159, 64, 0.2)',
            borderColor: 'rgba(255, 159, 64, 1)',
            borderWidth: 2,
            fill: true
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('Erro ao gerar gráficos:', error);
  }
}

// Função para exportar dados do estoque para XLSX com formatação profissional
async function exportarEstoqueXLSX() {
  try {
    // Buscar dados atuais do estoque (mesmos filtros aplicados na tela)
    const placa = document.getElementById('campo-placa-estoque')?.value.trim().toUpperCase();
    const marca = document.getElementById('campo-marca-estoque')?.value.trim().toUpperCase();
    const modelo = document.getElementById('campo-modelo-estoque')?.value.trim().toUpperCase();
    const vida = document.getElementById('campo-vida-estoque')?.value.trim();
    const tipo = document.getElementById('campo-tipo-estoque')?.value.trim().toUpperCase();

    let query = supabase
      .from('estoque_pneus')
      .select('*')
      .order('placa', { ascending: true })
      .order('marca', { ascending: true })
      .order('modelo', { ascending: true });

    if (placa) {
      query = query.ilike('placa', `%${placa}%`);
    }
    if (marca) {
      query = query.ilike('marca', `%${marca}%`);
    }
    if (modelo) {
      query = query.ilike('modelo', `%${modelo}%`);
    }
    if (vida) {
      query = query.eq('vida', parseInt(vida));
    }
    if (tipo) {
      query = query.ilike('tipo', `%${tipo}%`);
    }

    const { data: estoque, error } = await query;

    if (error) {
      console.error('Erro ao buscar dados para exportação:', error);
      alert('Erro ao exportar dados. Tente novamente.');
      return;
    }

    const lista = estoque || [];

    if (lista.length === 0) {
      alert('Nenhum dado encontrado para exportar.');
      return;
    }

    // Preparar dados para XLSX
    const dadosXLSX = [];

    // Cabeçalho com informações da empresa
    dadosXLSX.push(['MARQUESPAN - SISTEMA DE GESTÃO DE PNEUS']);
    dadosXLSX.push([`Relatório de Estoque - ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`]);
    dadosXLSX.push(['Filtros aplicados:']);
    dadosXLSX.push([placa ? `Placa: ${placa}` : 'Placa: Todos']);
    dadosXLSX.push([marca ? `Marca: ${marca}` : 'Marca: Todos']);
    dadosXLSX.push([modelo ? `Modelo: ${modelo}` : 'Modelo: Todos']);
    dadosXLSX.push([vida ? `Vida: ${vida}` : 'Vida: Todos']);
    dadosXLSX.push([tipo ? `Tipo: ${tipo}` : 'Tipo: Todos']);
    dadosXLSX.push(['']); // Linha em branco

    // Cabeçalhos das colunas
    dadosXLSX.push(['PLACA', 'MARCA', 'MODELO', 'VIDA', 'TIPO', 'QUANTIDADE EM ESTOQUE']);

    // Dados dos itens
    lista.forEach(item => {
      dadosXLSX.push([item.placa, item.marca, item.modelo, item.vida, item.tipo, item.quantidade]);
    });

    // Calcular totais
    const totalQuantidade = lista.reduce((sum, item) => sum + item.quantidade, 0);

    // Adicionar linha de total
    dadosXLSX.push(['TOTAL GERAL', '', '', '', '', totalQuantidade]);
    dadosXLSX.push(['']); // Linha em branco
    dadosXLSX.push([`Total de registros exportados: ${lista.length}`]);
    dadosXLSX.push([`Gerado por: Sistema Marquespan - ${new Date().toLocaleString('pt-BR')}`]);

    // Criar workbook e worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dadosXLSX);

    // Definir larguras das colunas
    ws['!cols'] = [
      { wch: 15 }, // PLACA
      { wch: 20 }, // MARCA
      { wch: 30 }, // MODELO
      { wch: 8 },  // VIDA
      { wch: 15 }, // TIPO
      { wch: 20 }  // QUANTIDADE
    ];

    // Estilos para o cabeçalho (simulação básica)
    // Nota: XLSX não suporta estilos avançados, mas podemos definir tipos de células
    if (ws['A1']) ws['A1'].t = 's'; // String
    if (ws['A6']) ws['A6'].t = 's'; // Cabeçalho

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque_Pneus');

    // Nome do arquivo com data e hora
    const dataHora = new Date().toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_');
    const nomeArquivo = `estoque_pneus_marquespan_${dataHora}.xlsx`;

    // Salvar arquivo
    XLSX.writeFile(wb, nomeArquivo);

    // Feedback visual
    alert(`✅ Exportação concluída!\n\n📊 ${lista.length} registros exportados\n📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n⏰ Hora: ${new Date().toLocaleTimeString('pt-BR')}\n\nArquivo salvo como: ${nomeArquivo}`);
  } catch (error) {
    console.error('Erro na exportação:', error);
    alert('Erro ao exportar dados. Verifique o console para mais detalhes.');
  }
}

// Expor funções globalmente
window.carregarEstoque = carregarEstoque;
window.buscarEstoque = buscarEstoque;
window.limparFiltros = limparFiltros;
window.exportarEstoqueXLSX = exportarEstoqueXLSX;
window.gerarGraficos = gerarGraficos;
