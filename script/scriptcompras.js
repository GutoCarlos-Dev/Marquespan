import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- LÓGICA DE NAVEGAÇÃO ---
    const navLinks = document.querySelectorAll('#menu a');
    const sections = document.querySelectorAll('main .section');

    const showSection = (targetId) => {
        sections.forEach(section => {
            if (section.id === targetId) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });
        if (targetId === 'sectionRealizarCotacoes') {
            if (!editingQuotationId) generateNextQuotationCode(); // Gera código apenas se não estiver editando
            populateProductDropdown(); // Garante que o dropdown de produtos esteja atualizado
            populateSupplierDropdowns(); // Garante que o dropdown de fornecedores esteja atualizado
        }
    };

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            showSection(targetId);
        });
    });

    // Mostrar a primeira seção por padrão (ou a que não tiver a classe 'hidden')
    const initialSection = document.querySelector('main .section:not(.hidden)');
    if (initialSection) {
        showSection(initialSection.id);
    }

    // --- LÓGICA DE COTAÇÕES ---
    const btnAddToCart = document.getElementById('btnAddToCart');
    const cartBody = document.getElementById('cartBody');
    let cartItems = [];
    let editingQuotationId = null; // Variável para controlar o modo de edição

    // Carregar dados do localStorage
    const loadFromLocalStorage = () => {
        const savedCart = localStorage.getItem('cotacaoCart');
        if (savedCart) {
            cartItems = JSON.parse(savedCart);
            renderCart();
            // Recarregar preços salvos
            for (let i = 1; i <= 3; i++) {
                const savedPrices = localStorage.getItem(`cotacaoPrecosEmpresa${i}`);
                const empresaInput = document.getElementById(`empresa${i}Cot`);
                const obsInput = document.getElementById(`obsEmpresa${i}`);
                if (savedPrices) {
                    const prices = JSON.parse(savedPrices);
                    empresaInput.value = prices.nomeEmpresa;
                    if (obsInput && prices.observacao) {
                        obsInput.value = prices.observacao;
                    }
                    cartItems.forEach(item => {
                        const priceInput = document.getElementById(`price-${i}-${item.cod}`);
                        if (priceInput && prices.produtos[item.cod]) {
                            priceInput.value = prices.produtos[item.cod];
                        }
                    });
                }
            }
            updateAllTotals();
        }
    };

    const saveToLocalStorage = () => {
        localStorage.setItem('cotacaoCart', JSON.stringify(cartItems));
        for (let i = 1; i <= 3; i++) {
            const empresaInput = document.getElementById(`empresa${i}Cot`);
            const obsInput = document.getElementById(`obsEmpresa${i}`);
            const prices = {
                nomeEmpresa: empresaInput.value,
                observacao: obsInput.value,
                produtos: {}
            };
            cartItems.forEach(item => {
                const priceInput = document.getElementById(`price-${i}-${item.cod}`);
                if (priceInput) {
                    prices.produtos[item.cod] = priceInput.value;
                }
            });
            localStorage.setItem(`cotacaoPrecosEmpresa${i}`, JSON.stringify(prices));
        }
    };

    const renderCart = () => {
        cartBody.innerHTML = '';
        // Limpar campos de preços antigos
        for (let i = 1; i <= 3; i++) {
            document.getElementById(`precosEmpresa${i}`).innerHTML = '';
        }

        cartItems.forEach(item => {
            // Adicionar linha na tabela do carrinho
            const row = document.createElement('tr');
            row.dataset.cod = item.cod; // Manter para compatibilidade com seletores
            row.innerHTML = `
                <td>${item.cod}</td>
                <td>${item.produto}</td>
                <td>${item.qtd}</td>
                <td>${item.uni}</td>
                <td><button class="btn-remove">Remover</button></td>
            `;
            cartBody.appendChild(row);

            // Adicionar campos de preço para cada empresa
            for (let i = 1; i <= 3; i++) {
                const priceContainer = document.getElementById(`precosEmpresa${i}`);
                const priceDiv = document.createElement('div');
                priceDiv.classList.add('price-entry');
                priceDiv.dataset.cod = item.cod;
                priceDiv.innerHTML = `
                    <label for="price-${i}-${item.cod}">${item.produto} (Qtd: ${item.qtd}):</label>
                    <input type="number" step="0.01" id="price-${i}-${item.cod}" class="price-input" data-empresa="${i}" data-cod="${item.cod}" placeholder="Preço Unitário">
                `;
                priceContainer.appendChild(priceDiv);
            }
        });

        addEventListenersToButtons();
    };

    const updateCompanyTotal = (empresaIndex) => {
        let total = 0;
        cartItems.forEach(item => {
            const priceInput = document.getElementById(`price-${empresaIndex}-${item.cod}`);
            const price = parseFloat(priceInput.value) || 0;
            total += price * item.qtd;
        });
        document.getElementById(`totalEmpresa${empresaIndex}`).value = total.toFixed(2);
    };

    const updateAllTotals = () => {
        for (let i = 1; i <= 3; i++) {
            updateCompanyTotal(i);
        }
    };

    const addEventListenersToButtons = () => {
        // Botões de remover
        document.querySelectorAll('.btn-remove').forEach(button => {
            button.addEventListener('click', (e) => {
                const row = e.target.closest('tr');
                const codToRemove = row.dataset.cod;
                cartItems = cartItems.filter(item => item.cod !== codToRemove);
                renderCart();
                updateAllTotals();
            });
        });

        // Inputs de preço
        document.querySelectorAll('.price-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const empresaIndex = e.target.dataset.empresa;
                updateCompanyTotal(empresaIndex);
            });
        });
    };

    const populateProductDropdown = async () => {
        const productSelect = document.getElementById('cartProductSelect');
        if (!productSelect) return;

        const { data: produtosSalvos, error } = await supabase
            .from('produtos')
            .select('codigo_principal, nome')
            .order('nome', { ascending: true });

        if (error) return console.error("Erro ao carregar produtos para dropdown:", error);

        productSelect.innerHTML = '<option value="">-- Selecione um produto --</option>'; // Limpa e adiciona a opção padrão

        produtosSalvos.forEach(produto => {
            const option = document.createElement('option');
            option.value = produto.id; // O valor da opção agora é o ID do produto
            option.textContent = `${produto.codigo1} - ${produto.nome}`;
            productSelect.appendChild(option);
        });
    };

    btnAddToCart.addEventListener('click', async () => {
        const productSelect = document.getElementById('cartProductSelect');
        const selectedProductId = productSelect.value;

        const { data: selectedProduct, error } = await supabase
            .from('produtos')
            .select('id, codigo_principal, nome')
            .eq('id', selectedProductId)
            .single();

        if (error || !selectedProduct) {
            if(error) console.error("Erro ao buscar produto selecionado:", error);
            alert('Por favor, selecione um produto válido.');
            return;
        }

        const newItem = {
            id: selectedProduct.id, // Armazenar o ID do produto
            cod: selectedProduct.codigo_principal,
            produto: selectedProduct.nome,
            qtd: parseInt(document.getElementById('cartQtd').value),
            uni: 'UN' // Definindo um valor padrão, já que removemos o campo
        };

        if (isNaN(newItem.qtd) || newItem.qtd <= 0) {
            alert('Por favor, preencha a Quantidade e o Valor Unitário corretamente.');
            return;
        }

        // Verifica se o item já está no carrinho para evitar duplicatas
        if (cartItems.some(item => item.cod === newItem.cod)) {
            alert('Este produto já foi adicionado ao carrinho.');
            return;
        }

        cartItems.push(newItem);
        renderCart();
        updateAllTotals();

        // Limpar campos após adicionar
        productSelect.value = '';
        document.getElementById('cartQtd').value = '';
    });

    // --- LÓGICA DE EXPORTAÇÃO DE PDF ---
    const btnExportPdf = document.getElementById('btnExportPdf');
    if (btnExportPdf) {
        btnExportPdf.addEventListener('click', () => {
            if (cartItems.length === 0) {
                alert('Adicione produtos ao carrinho para gerar o PDF.');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Adicionar Logo
            const logoImg = document.querySelector('.logo');
            if (logoImg) {
                doc.addImage(logoImg, 'PNG', 15, 10, 40, 15);
            }

            // Título
            doc.setFontSize(20);
            doc.text('Pedido de Cotação', 105, 20, { align: 'center' });

            // Informações do Pedido
            const quotationCode = document.getElementById('quotationCode').value;
            const today = new Date().toLocaleDateString('pt-BR');
            doc.setFontSize(12);
            doc.text(`Código do Pedido: ${quotationCode}`, 15, 40);
            doc.text(`Data: ${today}`, 15, 46);

            // Tabela de Produtos
            const tableColumn = ["Código", "Produto", "Quantidade"];
            const tableRows = [];

            cartItems.forEach(item => {
                const itemData = [item.cod, item.produto, item.qtd];
                tableRows.push(itemData);
            });

            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 55,
            });

            doc.save(`cotacao_${quotationCode}.pdf`);
        });
    }

    document.getElementById('btnRegistrarCotacoes').addEventListener('click', async () => {
        if (cartItems.length === 0) {
            alert('Adicione pelo menos um produto ao carrinho para registrar a cotação.');
            return;
        }
    
        const quotationCode = document.getElementById('quotationCode').value.trim();
        if (!quotationCode) {
            alert('Por favor, informe o Código da Cotação.');
            return;
        }
    
        const winnerRadio = document.querySelector('input[name="empresaVencedora"]:checked');
        const winnerIndex = winnerRadio ? winnerRadio.value : null;
        let idFornecedorVencedor = null;
        let valorTotalVencedor = null;
    
        if (winnerIndex) {
            idFornecedorVencedor = document.getElementById(`empresa${winnerIndex}Cot`).value;
            valorTotalVencedor = parseFloat(document.getElementById(`totalEmpresa${winnerIndex}`).value);
        }
    
        // --- Iniciar Transação ---
        try {
            // 1. Inserir a cotação principal
            const { data: cotacaoData, error: cotacaoError } = await supabase
                .from('cotacoes')
                .insert({
                    codigo_cotacao: quotationCode,
                    status: 'Pendente',
                    id_fornecedor_vencedor: idFornecedorVencedor,
                    valor_total_vencedor: valorTotalVencedor
                })
                .select('id')
                .single();
    
            if (cotacaoError) throw cotacaoError;
            const cotacaoId = cotacaoData.id;
    
            // 2. Inserir os itens da cotação
            const itensParaInserir = cartItems.map(item => ({
                id_cotacao: cotacaoId,
                id_produto: item.id, // Usar o ID do produto que salvamos no carrinho
                quantidade: item.qtd
            }));
    
            const { error: itensError } = await supabase.from('cotacao_itens').insert(itensParaInserir);
            if (itensError) throw itensError;
    
            // 3. Inserir os orçamentos e os preços de cada item
            for (let i = 1; i <= 3; i++) {
                const idFornecedor = document.getElementById(`empresa${i}Cot`).value;
                const valorTotal = parseFloat(document.getElementById(`totalEmpresa${i}`).value);
    
                // Só insere o orçamento se um fornecedor foi selecionado
                if (idFornecedor && !isNaN(valorTotal)) {
                    const observacao = document.getElementById(`obsEmpresa${i}`).value;
    
                    // 3a. Inserir o orçamento
                    const { data: orcamentoData, error: orcamentoError } = await supabase
                        .from('cotacao_orcamentos')
                        .insert({
                            id_cotacao: cotacaoId,
                            id_fornecedor: idFornecedor,
                            valor_total: valorTotal,
                            observacao: observacao
                        })
                        .select('id')
                        .single();
    
                    if (orcamentoError) throw orcamentoError;
                    const orcamentoId = orcamentoData.id;
    
                    // 3b. Inserir os preços dos itens para este orçamento
                    const precosParaInserir = [];
                    for (const item of cartItems) {
                        const precoUnitarioInput = document.getElementById(`price-${i}-${item.cod}`);
                        const precoUnitario = parseFloat(precoUnitarioInput.value);
    
                        if (!isNaN(precoUnitario)) {
                            precosParaInserir.push({
                                id_orcamento: orcamentoId,
                                id_produto: item.id,
                                preco_unitario: precoUnitario
                            });
                        }
                    }
    
                    if (precosParaInserir.length > 0) {
                        const { error: precosError } = await supabase.from('orcamento_item_precos').insert(precosParaInserir);
                        if (precosError) throw precosError;
                    }
                }
            }
    
            alert('Cotação registrada com sucesso no banco de dados!');
            clearQuotationForm();
            renderSavedQuotations(); // Agora podemos chamar a função refatorada
    
        } catch (error) {
            console.error('Erro ao registrar cotação:', error);
            alert(`Ocorreu um erro ao salvar a cotação: ${error.message}. Verifique se o código da cotação já existe.`);
        }
    });

    function clearQuotationForm() {
        cartItems = [];
        renderCart();
        updateAllTotals();

        for (let i = 1; i <= 3; i++) {
            document.getElementById(`empresa${i}Cot`).value = '';
            document.getElementById(`obsEmpresa${i}`).value = '';
        }

        document.getElementById('cartProductSelect').value = '';
        document.getElementById('cartQtd').value = '';

        document.querySelectorAll('input[name="empresaVencedora"]').forEach(radio => radio.checked = false);
        document.querySelectorAll('.card-row .card').forEach(card => card.classList.remove('winner'));
        document.getElementById('quotationCode').value = '';
        document.getElementById('btnRegistrarCotacoes').textContent = 'Registrar Cotações'; // Reseta o texto do botão
        editingQuotationId = null; // Sai do modo de edição
        localStorage.removeItem('cotacaoCart');
    }

    async function generateNextQuotationCode() {
        const quotationCodeInput = document.getElementById('quotationCode');
        if (!quotationCodeInput) return;

        const { data, error } = await supabase
            .from('cotacoes')
            .select('codigo_cotacao')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        let nextId = 1;
        if (data && data.codigo_cotacao && data.codigo_cotacao.startsWith('PED-')) {
            nextId = parseInt(data.codigo_cotacao.split('-')[1]) + 1;
        }
        quotationCodeInput.value = `PED-${String(nextId).padStart(4, '0')}`;
    }

    // --- LÓGICA DO SELETOR DE VENCEDOR DA COTAÇÃO ---
    const winnerRadios = document.querySelectorAll('input[name="empresaVencedora"]');
    winnerRadios.forEach(radio => {
        if (!radio) return; // Adicionado para evitar erro se o elemento não existir
        radio.addEventListener('change', () => {
            // Remove a classe 'winner' de todos os cards
            document.querySelectorAll('.card-row .card').forEach(card => {
                card.classList.remove('winner');
            });

            // Adiciona a classe 'winner' ao card pai do rádio selecionado
            if (radio.checked) {
                radio.closest('.card').classList.add('winner');
            }
        });
    });

    // Carregar dados ao iniciar
    loadFromLocalStorage();

    // --- LÓGICA DE CADASTRO DE PRODUTOS ---
    const formCadastrarProduto = document.getElementById('formCadastrarProduto');
    const produtosTableBody = document.getElementById('produtosTableBody');
    const btnSubmitProduto = document.getElementById('btnSubmitProduto');
    let modoEdicao = false;
    let codigoOriginalEdicao = null;

    const renderProdutosGrid = async () => {
        if (!produtosTableBody) return;

        const { data: produtosSalvos, error } = await supabase
            .from('produtos')
            .select('id, codigo_principal, codigo_secundario, nome')
            .order('nome', { ascending: true });

        if (error) return console.error("Erro ao renderizar grid de produtos:", error);

        produtosTableBody.innerHTML = '';
        produtosSalvos.forEach(produto => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${produto.codigo_principal}</td>
                <td>${produto.codigo_secundario || ''}</td>
                <td>${produto.nome}</td>
                <td>
                    <button class="btn-action btn-edit" data-codigo1="${produto.codigo1}">Editar</button>
                    <button class="btn-action btn-delete btn-remove" data-codigo1="${produto.codigo1}">Excluir</button>
                </td>
            `;
            produtosTableBody.appendChild(row);
        });
    };

    if (formCadastrarProduto && produtosTableBody) {
        renderProdutosGrid(); // Renderiza a grade ao carregar a página

        formCadastrarProduto.addEventListener('submit', async (e) => {
            e.preventDefault();

            const codigo1 = document.getElementById('produtoCodigo1').value.trim();
            const codigo2 = document.getElementById('produtoCodigo2').value.trim();
            const nome = document.getElementById('produtoNome').value.trim();

            if (!codigo1 || !nome) {
                alert('Por favor, preencha pelo menos o Código 1 e o Nome do Produto.');
                return;
            }

            if (modoEdicao) {
                // Salvar edição
                const { error } = await supabase
                    .from('produtos')
                    .update({
                        codigo_principal: codigo1,
                        codigo_secundario: codigo2,
                        nome: nome
                    })
                    .eq('codigo_principal', codigoOriginalEdicao);

                if (error) {
                    console.error("Erro ao atualizar produto:", error);
                    alert('Erro ao atualizar produto. Verifique se o código já existe em outro produto.');
                } else {
                    alert('Produto atualizado com sucesso!');
                    modoEdicao = false;
                    codigoOriginalEdicao = null;
                    btnSubmitProduto.textContent = 'Cadastrar Produto';
                    document.getElementById('produtoCodigo1').readOnly = false;
                }
            } else {
                // Cadastrar novo produto
                const { error } = await supabase
                    .from('produtos')
                    .insert({
                        codigo_principal: codigo1,
                        codigo_secundario: codigo2,
                        nome: nome
                    });

                if (error) {
                    console.error("Erro ao cadastrar produto:", error);
                    alert('Erro ao cadastrar produto. Verifique se o código já existe.');
                } else {
                    alert(`Produto "${nome}" cadastrado com sucesso!`);
                }
            }

            formCadastrarProduto.reset();
            await renderProdutosGrid();
        });

        produtosTableBody.addEventListener('click', async (e) => {
            const target = e.target;
            const codigo1 = target.getAttribute('data-codigo1');

            if (target.classList.contains('btn-delete')) {
                // Excluir
                if (confirm(`Tem certeza que deseja excluir o produto com código ${codigo1}?`)) {
                    const { error } = await supabase
                        .from('produtos')
                        .delete()
                        .eq('codigo_principal', codigo1);

                    if (error) {
                        console.error("Erro ao excluir produto:", error);
                        alert('Erro ao excluir produto. Ele pode estar sendo usado em uma cotação.');
                    } else {
                        alert('Produto excluído com sucesso!');
                        await renderProdutosGrid();
                    }
                }
            } else if (target.classList.contains('btn-edit')) {
                // Editar
                const { data: produtoParaEditar, error } = await supabase
                    .from('produtos')
                    .select('codigo_principal, codigo_secundario, nome')
                    .eq('codigo_principal', codigo1)
                    .single();

                if (error || !produtoParaEditar) {
                    return alert("Erro ao carregar dados do produto para edição.");
                }

                if (produtoParaEditar) {
                    document.getElementById('produtoCodigo1').value = produtoParaEditar.codigo_principal;
                    document.getElementById('produtoCodigo2').value = produtoParaEditar.codigo_secundario || '';
                    document.getElementById('produtoNome').value = produtoParaEditar.nome;

                    modoEdicao = true;
                    codigoOriginalEdicao = produtoParaEditar.codigo_principal;
                    btnSubmitProduto.textContent = 'Salvar Alterações';
                    document.getElementById('produtoCodigo1').readOnly = true; // Impede a edição do código principal
                    window.scrollTo(0, 0); // Rola para o topo da página para ver o formulário
                }
            }
        });
    }

    // --- LÓGICA DO MODAL DE IMPORTAÇÃO/EXPORTAÇÃO ---
    const importExportModal = document.getElementById('importExportModal');
    const btnOpenImportExportModal = document.getElementById('btnOpenImportExportModal');
    const closeButton = importExportModal ? importExportModal.querySelector('.close-button') : null;
    const btnImportProducts = document.getElementById('btnImportProducts');
    const btnExportProducts = document.getElementById('btnExportProducts');
    const importExcelFile = document.getElementById('importExcelFile');

    const openModal = () => {
        if (importExportModal) importExportModal.classList.remove('hidden');
    };

    const closeModal = () => {
        if (importExportModal) importExportModal.classList.add('hidden');
    };

    if (btnOpenImportExportModal) {
        btnOpenImportExportModal.addEventListener('click', openModal);
    }
    if (closeButton) {
        closeButton.addEventListener('click', closeModal);
    }
    // Fechar modal clicando fora
    if (importExportModal) {
        importExportModal.addEventListener('click', (e) => {
            if (e.target === importExportModal) {
                closeModal();
            }
        });
    }

    // Lógica de Importação
    if (btnImportProducts) {
        btnImportProducts.addEventListener('click', () => {
            const file = importExcelFile.files[0];
            if (!file) {
                alert('Por favor, selecione um arquivo Excel para importar.');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                let produtosSalvos = JSON.parse(localStorage.getItem('produtosCadastrados')) || [];
                let importedCount = 0;
                let skippedCount = 0;
                let skippedDetails = [];

                json.forEach(row => {
                    const codigo1 = String(row.COD1 || '').trim();
                    const codigo2 = String(row.COD2 || '').trim();
                    const nome = String(row.PRODUTO || '').trim();

                    if (!codigo1 || !nome) {
                        skippedCount++;
                        skippedDetails.push(`Linha com COD1 ou PRODUTO faltando: ${JSON.stringify(row)}`);
                        return;
                    }

                    const isDuplicate = produtosSalvos.some(p =>
                        p.codigo1 === codigo1 || (codigo2 && p.codigo2 === codigo2 && p.codigo2 !== '')
                    );

                    if (isDuplicate) {
                        skippedCount++;
                        skippedDetails.push(`Produto duplicado (COD1: ${codigo1} ou COD2: ${codigo2}): ${nome}`);
                    } else {
                        produtosSalvos.push({ codigo1, codigo2, nome });
                        importedCount++;
                    }
                });

                localStorage.setItem('produtosCadastrados', JSON.stringify(produtosSalvos));
                renderProdutosGrid();
                alert(`Importação concluída!\n${importedCount} produtos importados.\n${skippedCount} produtos ignorados (duplicados ou dados incompletos).`);
                if (skippedDetails.length > 0) {
                    console.warn('Detalhes dos produtos ignorados:', skippedDetails);
                }
                closeModal();
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // Lógica de Exportação
    if (btnExportProducts) {
        btnExportProducts.addEventListener('click', () => {
            const produtosSalvos = JSON.parse(localStorage.getItem('produtosCadastrados')) || [];
            const dataToExport = [['COD1', 'COD2', 'PRODUTO']]; // Cabeçalhos
            produtosSalvos.forEach(p => {
                dataToExport.push([p.codigo1, p.codigo2, p.nome]);
            });

            const ws = XLSX.utils.aoa_to_sheet(dataToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
            XLSX.writeFile(wb, 'produtos_cadastrados.xlsx');
            alert('Produtos exportados com sucesso!');
            closeModal();
        });
    }

    // --- LÓGICA DE CADASTRO DE FORNECEDORES ---
    const formCadastrarFornecedor = document.getElementById('formCadastrarFornecedor');
    const fornecedoresTableBody = document.getElementById('fornecedoresTableBody');
    const btnSubmitFornecedor = document.getElementById('btnSubmitFornecedor');
    let modoEdicaoFornecedor = false;
    let idOriginalEdicao = null; // Alterado para usar o ID

    const renderFornecedoresGrid = async () => {
        if (!fornecedoresTableBody) return;

        const { data: fornecedoresSalvos, error } = await supabase
            .from('fornecedores')
            .select('id, nome, telefone')
            .order('nome', { ascending: true });

        if (error) return console.error("Erro ao renderizar grid de fornecedores:", error);

        fornecedoresTableBody.innerHTML = '';
        fornecedoresSalvos.forEach(fornecedor => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${fornecedor.nome}</td>
                <td>${fornecedor.telefone || ''}</td>
                <td>
                    <button class="btn-action btn-edit" data-id="${fornecedor.id}">Editar</button>
                    <button class="btn-action btn-delete btn-remove" data-id="${fornecedor.id}">Excluir</button>
                </td>
            `;
            fornecedoresTableBody.appendChild(row);
        });
    };

    if (formCadastrarFornecedor && fornecedoresTableBody) {
        renderFornecedoresGrid();

        formCadastrarFornecedor.addEventListener('submit', async (e) => {
            e.preventDefault();

            const nome = document.getElementById('fornecedorNome').value.trim();
            const telefone = document.getElementById('fornecedorTelefone').value.trim();

            if (!nome) {
                alert('Por favor, preencha o nome do fornecedor.');
                return;
            }

            if (modoEdicaoFornecedor) {
                const { error } = await supabase
                    .from('fornecedores')
                    .update({ nome, telefone })
                    .eq('id', idOriginalEdicao);

                if (error) {
                    console.error("Erro ao atualizar fornecedor:", error);
                    alert('Erro ao atualizar fornecedor. Verifique se o nome já existe.');
                } else {
                    alert('Fornecedor atualizado com sucesso!');
                    modoEdicaoFornecedor = false;
                    idOriginalEdicao = null;
                    btnSubmitFornecedor.textContent = 'Cadastrar Fornecedor';
                    document.getElementById('fornecedorNome').readOnly = false;
                }
            } else {
                const { error } = await supabase
                    .from('fornecedores')
                    .insert({ nome, telefone });

                if (error) {
                    console.error("Erro ao cadastrar fornecedor:", error);
                    alert('Erro ao cadastrar fornecedor. Verifique se o nome já existe.');
                } else {
                    alert(`Fornecedor "${nome}" cadastrado com sucesso!`);
                }
            }

            formCadastrarFornecedor.reset();
            await renderFornecedoresGrid();
            await populateSupplierDropdowns(); // Atualiza os dropdowns de cotação
        });

        fornecedoresTableBody.addEventListener('click', async (e) => {
            const target = e.target;
            const id = target.getAttribute('data-id');

            if (target.classList.contains('btn-delete')) {
                if (confirm(`Tem certeza que deseja excluir este fornecedor?`)) {
                    const { error } = await supabase
                        .from('fornecedores')
                        .delete()
                        .eq('id', id);

                    if (error) {
                        console.error("Erro ao excluir fornecedor:", error);
                        alert('Erro ao excluir fornecedor. Ele pode estar sendo usado em uma cotação.');
                    } else {
                        alert('Fornecedor excluído com sucesso!');
                        await renderFornecedoresGrid();
                        await populateSupplierDropdowns();
                    }
                }
            } else if (target.classList.contains('btn-edit')) {
                const { data: fornecedorParaEditar, error } = await supabase
                    .from('fornecedores')
                    .select('id, nome, telefone')
                    .eq('id', id)
                    .single();

                if (error || !fornecedorParaEditar) {
                    return alert("Erro ao carregar dados do fornecedor para edição.");
                }

                if (fornecedorParaEditar) {
                    document.getElementById('fornecedorNome').value = fornecedorParaEditar.nome;
                    document.getElementById('fornecedorTelefone').value = fornecedorParaEditar.telefone || '';
                    modoEdicaoFornecedor = true;
                    idOriginalEdicao = fornecedorParaEditar.id;
                    btnSubmitFornecedor.textContent = 'Salvar Alterações';
                    document.getElementById('fornecedorNome').readOnly = true;
                    window.scrollTo(0, 0);
                }
            }
        });
    }

    async function populateSupplierDropdowns() {
        const { data: fornecedoresSalvos, error } = await supabase
            .from('fornecedores')
            .select('id, nome')
            .order('nome', { ascending: true });

        if (error) return console.error("Erro ao carregar fornecedores para dropdown:", error);

        const dropdowns = [
            document.getElementById('empresa1Cot'),
            document.getElementById('empresa2Cot'),
            document.getElementById('empresa3Cot')
        ];

        for (const dropdown of dropdowns) {
            if (!dropdown) return;
            const currentValue = dropdown.value; // Salva o valor atual
            dropdown.innerHTML = '<option value="">-- Selecione um fornecedor --</option>';
            fornecedoresSalvos.forEach(fornecedor => {
                const option = new Option(fornecedor.nome, fornecedor.id); // Usar ID como valor
                dropdown.add(option);
            });
            dropdown.value = currentValue; // Tenta restaurar o valor anterior
        }
    }

    // --- LÓGICA DE COTAÇÕES SALVAS ---
    const savedQuotationsTableBody = document.getElementById('savedQuotationsTableBody');
    const searchQuotationInput = document.getElementById('searchQuotation');
    const btnSearchQuotation = document.getElementById('btnSearchQuotation');
    const filterStatusSelect = document.getElementById('filterStatus');

    async function renderSavedQuotations() {
        if (!savedQuotationsTableBody) return;

        const searchTerm = searchQuotationInput.value.trim();
        const statusFilter = filterStatusSelect.value;

        let query = supabase
            .from('cotacoes')
            .select(`
                id,
                codigo_cotacao,
                data_cotacao,
                status,
                valor_total_vencedor,
                fornecedores ( nome )
            `)
            .order('data_cotacao', { ascending: false });

        if (searchTerm) {
            query = query.ilike('codigo_cotacao', `%${searchTerm}%`);
        }
        if (statusFilter !== 'Todas') {
            query = query.eq('status', statusFilter);
        }

        const { data: cotacoes, error } = await query;

        if (error) {
            console.error("Erro ao carregar cotações salvas:", error);
            savedQuotationsTableBody.innerHTML = `<tr><td colspan="6">Erro ao carregar dados.</td></tr>`;
            return;
        }

        savedQuotationsTableBody.innerHTML = '';
        if (cotacoes.length === 0) {
            savedQuotationsTableBody.innerHTML = `<tr><td colspan="6">Nenhuma cotação encontrada.</td></tr>`;
            return;
        }

        cotacoes.forEach(cotacao => {
            const row = document.createElement('tr');
            const winnerName = cotacao.fornecedores ? cotacao.fornecedores.nome : 'N/A';
            const totalValue = cotacao.valor_total_vencedor ? `R$ ${parseFloat(cotacao.valor_total_vencedor).toFixed(2)}` : 'N/A';

            row.innerHTML = `
                <td>${cotacao.codigo_cotacao}</td>
                <td>${new Date(cotacao.data_cotacao).toLocaleDateString('pt-BR')}</td>
                <td>${winnerName}</td>
                <td>${totalValue}</td>
                <td><span class="status status-${cotacao.status}">${cotacao.status}</span></td>
                <td>
                    <button class="btn-action btn-view" data-id="${cotacao.id}">Ver</button>
                    <button class="btn-action btn-delete btn-remove" data-id="${cotacao.id}">Excluir</button>
                </td>
            `;
            savedQuotationsTableBody.appendChild(row);
        });
    }

    async function openQuotationDetailModal(quotationId) {
        const modal = document.getElementById('quotationDetailModal');
        const modalTitle = document.getElementById('quotationDetailTitle');
        const modalBody = document.getElementById('quotationDetailBody');

        try {
            // 1. Buscar dados da cotação principal
            const { data: cotacao, error: cotacaoError } = await supabase
                .from('cotacoes')
                .select('*, fornecedores(nome)')
                .eq('id', quotationId)
                .single();
            if (cotacaoError) throw cotacaoError;

            // 2. Buscar itens da cotação
            const { data: itens, error: itensError } = await supabase
                .from('cotacao_itens')
                .select('quantidade, produtos(codigo_principal, nome)')
                .eq('id_cotacao', quotationId);
            if (itensError) throw itensError;

            // 3. Buscar orçamentos
            const { data: orcamentos, error: orcamentosError } = await supabase
                .from('cotacao_orcamentos')
                .select('*, fornecedores(nome)')
                .eq('id_cotacao', quotationId);
            if (orcamentosError) throw orcamentosError;

            // 4. Para cada orçamento, buscar os preços dos itens
            for (const orcamento of orcamentos) {
                const { data: precos, error: precosError } = await supabase
                    .from('orcamento_item_precos')
                    .select('preco_unitario, id_produto')
                    .eq('id_orcamento', orcamento.id);
                if (precosError) throw precosError;
                orcamento.precos = precos;
            }

            // Montar o HTML do Modal
            modalTitle.textContent = `Detalhes da Cotação: ${cotacao.codigo_cotacao}`;

            let html = `
                <p><strong>Data:</strong> ${new Date(cotacao.data_cotacao).toLocaleDateString('pt-BR')}</p>
                <p><strong>Status:</strong> ${cotacao.status}</p>
                <p><strong>Vencedor:</strong> ${cotacao.fornecedores ? cotacao.fornecedores.nome : 'Não definido'}</p>
                <hr>
                <h3>Itens Cotados</h3>
                <ul>
                    ${itens.map(item => `<li>${item.quantidade}x ${item.produtos.nome} (${item.produtos.codigo_principal})</li>`).join('')}
                </ul>
                <hr>
                <h3>Orçamentos Recebidos</h3>
            `;

            orcamentos.forEach(orcamento => {
                const isWinner = orcamento.id_fornecedor === cotacao.id_fornecedor_vencedor;
                html += `
                    <div class="card ${isWinner ? 'winner' : ''}">
                        <h4>${orcamento.fornecedores.nome} ${isWinner ? '(Vencedor)' : ''}</h4>
                        <p><strong>Total:</strong> R$ ${parseFloat(orcamento.valor_total).toFixed(2)}</p>
                        <p><strong>Obs:</strong> ${orcamento.observacao || 'Nenhuma'}</p>
                        <table>
                            <thead><tr><th>Produto</th><th>Preço Unit.</th></tr></thead>
                            <tbody>
                                ${orcamento.precos.map(preco => {
                                    const produtoInfo = itens.find(i => i.produtos.id === preco.id_produto);
                                    return `<tr>
                                        <td>${produtoInfo ? produtoInfo.produtos.nome : 'Produto não encontrado'}</td>
                                        <td>R$ ${parseFloat(preco.preco_unitario).toFixed(2)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            });

            modalBody.innerHTML = html;
            modal.classList.remove('hidden');

        } catch (error) {
            console.error("Erro ao abrir detalhes da cotação:", error);
            alert("Não foi possível carregar os detalhes da cotação.");
        }
    }

    async function deleteQuotation(quotationId) {
        if (confirm('Tem certeza que deseja excluir esta cotação? Esta ação não pode ser desfeita.')) {
            const { error } = await supabase
                .from('cotacoes')
                .delete()
                .eq('id', quotationId);

            if (error) {
                console.error("Erro ao excluir cotação:", error);
                alert("Erro ao excluir cotação. Verifique o console para mais detalhes.");
            } else {
                alert("Cotação excluída com sucesso!");
                renderSavedQuotations();
            }
        }
    }

    // Event Listeners para a seção de Cotações Salvas
    if (btnSearchQuotation) btnSearchQuotation.addEventListener('click', renderSavedQuotations);
    if (filterStatusSelect) filterStatusSelect.addEventListener('change', renderSavedQuotations);
    if (savedQuotationsTableBody) {
        savedQuotationsTableBody.addEventListener('click', (e) => {
            const target = e.target;
            const quotationId = target.getAttribute('data-id');
            if (target.classList.contains('btn-view')) {
                openQuotationDetailModal(quotationId);
            } else if (target.classList.contains('btn-delete')) {
                deleteQuotation(quotationId);
            }
        });
    }

    // Fechar modal de detalhes
    const detailModal = document.getElementById('quotationDetailModal');
    if (detailModal) {
        detailModal.querySelector('.close-button').addEventListener('click', () => detailModal.classList.add('hidden'));
        detailModal.addEventListener('click', (e) => {
            if (e.target === detailModal) detailModal.classList.add('hidden');
        });
    }

    // Renderizar a lista ao carregar a página
    renderSavedQuotations();
});
