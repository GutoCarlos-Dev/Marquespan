// Configuração do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

class PDFImporter {
    constructor() {
        this.file = null;
        this.pdfData = null;
        this.extractedData = {
            cliente: '',
            cidade: '',
            data: '',
            motivo: '',
            requerente: '',
            atendidoPor: '',
            items: []
        };

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const btnImportData = document.getElementById('btnImportData');
        const btnClear = document.getElementById('btnClear');

        // Upload area events (apenas drag and drop)
        uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        uploadArea.addEventListener('drop', this.handleDrop.bind(this));

        // File input event
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Button events
        btnImportData.addEventListener('click', this.importData.bind(this));
        btnClear.addEventListener('click', this.clearAll.bind(this));
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    async processFile(file) {
        if (!file.type.includes('pdf')) {
            alert('⚠️ Por favor, selecione um arquivo PDF válido.');
            return;
        }

        this.file = file;
        this.showLoading(true);

        try {
            // Converte o arquivo para ArrayBuffer
            const arrayBuffer = await this.readFileAsArrayBuffer(file);

            // Carrega o PDF
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            // Extrai o texto da primeira página
            const page = await pdf.getPage(1);
            const textContent = await page.getTextContent();

            // Processa o texto extraído
            this.processTextContent(textContent);

            // Exibe os resultados
            this.displayResults();

        } catch (error) {
            console.error('Erro ao processar PDF:', error);
            alert('❌ Erro ao processar o arquivo PDF. Verifique se o arquivo está válido.');
        } finally {
            this.showLoading(false);
        }
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    processTextContent(textContent) {
        const textItems = textContent.items;
        const fullText = textItems.map(item => item.str).join(' ');

        console.log('Texto extraído do PDF:', fullText);

        // Processa os dados extraídos
        this.extractedData = this.parseMarquespanForm(fullText, textItems);
    }

    parseMarquespanForm(fullText, textItems) {
        const data = {
            cliente: '',
            cidade: '',
            data: '',
            motivo: '',
            requerente: '',
            atendidoPor: '',
            atencao: '',
            observacao: '',
            items: []
        };

        // Padrões de busca para cada campo
        const patterns = {
            cliente: /CLIENTE:\s*([^\n\r]+)/i,
            cidade: /CIDADE:\s*([^\n\r]+)/i,
            data: /DATA[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
            motivo: /Motivo[s]?[:]?\s*([^\n\r]+)/i, // Aceita variações como "Motlvo"
            requerente: /REQUERENTE[:]?\s*([^\n\r]+)/i,
            atendidoPor: /ATENDIDO POR[:]?\s*([^\n\r]+)/i,
            atencao: /ATEN[ÇC][AÃ]O[:]?\s*([^\n\r]+)/i,
            observacao: /OBSERVA[ÇC][AÃ]O[:]?\s*([\s\S]*?)(?=CLIENTE|$)/i
        };

        // Extrai dados básicos
        Object.keys(patterns).forEach(key => {
            const match = fullText.match(patterns[key]);
            if (match) {
                data[key] = match[1].trim();
            }
        });

        // Lógica especial para o campo MOTIVO
        if (!data.motivo && data.observacao) {
            // Se motivo não foi encontrado, procura na observação
            const motivoInObs = data.observacao.match(/Motivo[s]?[:]?\s*([^\n\r]+)/i);
            if (motivoInObs) {
                data.motivo = motivoInObs[1].trim();
            }
        }

        // Se ainda não encontrou motivo, define padrão
        if (!data.motivo) {
            data.motivo = 'Cliente Novo'; // Valor padrão
        }

        // Extrai itens da tabela
        data.items = this.extractItemsFromText(textItems);

        return data;
    }

    extractItemsFromText(textItems) {
        const items = [];
        const lines = [];

        // Agrupa itens por linha aproximada
        textItems.forEach((item, index) => {
            if (item.str.trim()) {
                lines.push({
                    text: item.str.trim(),
                    x: item.transform[4], // posição X
                    y: item.transform[5], // posição Y
                    index: index
                });
            }
        });

        // Ordena por posição Y (de cima para baixo) e depois por X (da esquerda para direita)
        lines.sort((a, b) => {
            if (Math.abs(a.y - b.y) < 5) { // Mesma linha
                return a.x - b.x;
            }
            return b.y - a.y; // Linhas de cima para baixo
        });

        console.log('Linhas ordenadas:', lines);

        // Identifica cabeçalhos da tabela
        const headerPatterns = {
            qtd: /^(QTD|Qtd|Qtde|Quantidade)$/i,
            equipamento: /^(EQUI|Equip|Equipamento|BQUI)$/i,
            modelo: /^(MOD|Mod|Modelo|MOD\.?)$/i,
            novo: /^(N|NOVO|Novo|New)$/i,
            usado: /^(U|USADO|Usado|Used)$/i
        };

        // Encontra a linha de cabeçalho
        let headerLine = null;
        let headerPositions = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let isHeader = false;

            // Verifica se esta linha contém cabeçalhos
            Object.keys(headerPatterns).forEach(key => {
                if (headerPatterns[key].test(line.text)) {
                    isHeader = true;
                    headerPositions[key] = line.x;
                }
            });

            if (isHeader) {
                headerLine = i;
                break;
            }
        }

        console.log('Posições dos cabeçalhos:', headerPositions);

        // Identifica linhas que podem ser itens da tabela (após o cabeçalho)
        const potentialItems = lines.filter((line, index) => {
            if (index <= headerLine) return false; // Ignora linhas antes do cabeçalho

            // Aceita números (quantidade)
            if (/^\d+$/.test(line.text)) return true;

            // Aceita textos que podem ser equipamentos
            if (/^[A-Z\s]{3,}$/.test(line.text)) return true;

            // Aceita textos que podem ser modelos
            if (/^[A-Z0-9\s\-]{3,}$/.test(line.text)) return true;

            // Aceita N ou U (novo/usado)
            if (/^(N|U)$/i.test(line.text)) return true;

            return false;
        });

        console.log('Itens potenciais:', potentialItems);

        // Tenta agrupar em itens completos baseado nas posições dos cabeçalhos
        let currentItem = null;
        const processedItems = [];

        potentialItems.forEach(line => {
            // Determina a qual coluna este item pertence baseado na posição X
            let column = null;
            let minDistance = Infinity;

            Object.keys(headerPositions).forEach(key => {
                const distance = Math.abs(line.x - headerPositions[key]);
                if (distance < minDistance && distance < 100) { // 100px de tolerância
                    minDistance = distance;
                    column = key;
                }
            });

            if (/^\d+$/.test(line.text)) {
                // Se é um número, inicia novo item
                if (currentItem) {
                    processedItems.push(currentItem);
                }
                currentItem = { quantidade: parseInt(line.text), equipamento: '', modelo: '', n: '', u: '' };
            } else if (currentItem) {
                // Adiciona à coluna apropriada
                if (column) {
                    currentItem[column] = line.text;
                } else if (!currentItem.equipamento) {
                    currentItem.equipamento = line.text;
                } else if (!currentItem.modelo) {
                    currentItem.modelo = line.text;
                }
            }
        });

        // Adiciona o último item
        if (currentItem) {
            processedItems.push(currentItem);
        }

        // Filtra e formata os itens
        const validItems = processedItems
            .filter(item => item.equipamento || item.modelo) // Deve ter pelo menos equipamento ou modelo
            .map(item => ({
                quantidade: item.quantidade || 1,
                equipamento: item.equipamento || '',
                modelo: item.modelo || '',
                n: item.n || '',
                u: item.u || ''
            }));

        console.log('Itens extraídos:', validItems);

        return validItems.slice(0, 10); // Limita a 10 itens para evitar duplicatas
    }

    displayResults() {
        const previewContainer = document.getElementById('previewContainer');
        const extractedData = document.getElementById('extractedData');

        // Exibe o preview
        previewContainer.style.display = 'block';

        // Preenche os dados extraídos
        document.getElementById('clienteValue').textContent = this.extractedData.cliente || 'Não identificado';
        document.getElementById('cidadeValue').textContent = this.extractedData.cidade || 'Não identificado';
        document.getElementById('dataValue').textContent = this.extractedData.data || 'Não identificado';
        document.getElementById('motivoValue').textContent = this.extractedData.motivo || 'Não identificado';
        document.getElementById('requerenteValue').textContent = this.extractedData.requerente || 'Não identificado';
        document.getElementById('atendidoValue').textContent = this.extractedData.atendidoPor || 'Não identificado';

        // Exibe informações adicionais se disponíveis
        console.log('Dados extraídos:', this.extractedData);

        // Preenche a tabela de itens
        this.displayItemsTable();

        // Exibe a seção de dados extraídos
        extractedData.style.display = 'block';
    }

    displayItemsTable() {
        const tableBody = document.getElementById('itemsTableBody');

        if (this.extractedData.items.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #666;">
                        Nenhum item encontrado no PDF
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = '';

        this.extractedData.items.forEach((item, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.quantidade || 1}</td>
                <td>${item.equipamento || ''}</td>
                <td>${item.modelo || ''}</td>
                <td>${item.n || ''}</td>
                <td>${item.u || ''}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    async importData() {
        if (!this.extractedData.cliente) {
            alert('⚠️ Não foi possível extrair o nome do cliente. Verifique se o PDF contém essas informações.');
            return;
        }

        try {
            this.showLoading(true);

            // Busca o cliente no banco de dados
            const { data: clientes, error: clienteError } = await supabase
                .from('clientes')
                .select('id, nome, codigo')
                .or(`nome.ilike.%${this.extractedData.cliente}%, codigo.ilike.%${this.extractedData.cliente}%`);

            if (clienteError) {
                throw clienteError;
            }

            let clienteId = null;
            let clienteNome = this.extractedData.cliente;

            if (clientes && clientes.length > 0) {
                clienteId = clientes[0].id;
                clienteNome = `${clientes[0].codigo} - ${clientes[0].nome}`;
            } else {
                // Cria novo cliente se não encontrado
                const { data: novoCliente, error: novoClienteError } = await supabase
                    .from('clientes')
                    .insert([{
                        nome: this.extractedData.cliente,
                        codigo: this.extractedData.cliente.substring(0, 10).toUpperCase(),
                        cidade: this.extractedData.cidade || 'Não informado',
                        estado: 'Não informado'
                    }])
                    .select()
                    .single();

                if (novoClienteError) {
                    throw novoClienteError;
                }

                clienteId = novoCliente.id;
                clienteNome = `${novoCliente.codigo} - ${novoCliente.nome}`;
            }

            // Determina o motivo baseado nos dados extraídos
            const motivo = this.determineMotivo();

            // Cria a requisição
            const novaRequisicao = {
                cliente_id: clienteId,
                cliente_nome: clienteNome,
                motivo: motivo,
                itens: this.extractedData.items.map(item => ({
                    item_nome: item.equipamento || 'Item não identificado',
                    modelo: item.modelo || '',
                    tipo: 'Equipamento', // Tipo padrão
                    quantidade: item.quantidade || 1
                }))
            };

            // Armazena no localStorage para ser usado na página de carregamento
            localStorage.setItem('importedRequest', JSON.stringify(novaRequisicao));

            alert('✅ Dados importados com sucesso! Você será redirecionado para a página de carregamento.');

            // Redireciona para a página de carregamento
            window.location.href = 'iniciar-carregamento.html';

        } catch (error) {
            console.error('Erro ao importar dados:', error);
            alert('❌ Erro ao importar os dados. Tente novamente.');
        } finally {
            this.showLoading(false);
        }
    }

    determineMotivo() {
        // Lógica para determinar o motivo baseado nos dados extraídos
        if (this.extractedData.motivo) {
            const motivoLower = this.extractedData.motivo.toLowerCase();
            if (motivoLower.includes('novo') || motivoLower.includes('cliente novo')) {
                return 'Cliente Novo';
            } else if (motivoLower.includes('aumento')) {
                return 'Aumento';
            } else if (motivoLower.includes('troca')) {
                return 'Troca';
            } else if (motivoLower.includes('retirada')) {
                return 'Retirada Parcial';
            }
        }

        // Motivo padrão
        return 'Aumento';
    }

    clearAll() {
        this.file = null;
        this.extractedData = {
            cliente: '',
            cidade: '',
            data: '',
            motivo: '',
            requerente: '',
            atendidoPor: '',
            atencao: '',
            observacao: '',
            items: []
        };

        // Limpa a interface
        document.getElementById('previewContainer').style.display = 'none';
        document.getElementById('extractedData').style.display = 'none';
        document.getElementById('fileInput').value = '';

        // Limpa a tabela de itens
        document.getElementById('itemsTableBody').innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: #666;">
                    Nenhum item extraído ainda
                </td>
            </tr>
        `;
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (show) {
            loading.style.display = 'flex';
        } else {
            loading.style.display = 'none';
        }
    }
}

// Inicializa o importador quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    new PDFImporter();
});
