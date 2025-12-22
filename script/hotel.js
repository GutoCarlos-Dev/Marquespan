import { supabaseClient } from './supabase.js';
import XLSX from "https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs";

class HotelManager {
    constructor() {
        this.cache();
        this.bind();
        this.renderHotels();
    }

    cache() {
        // Formulário e tabela de Hotéis
        this.formHotel = document.getElementById('formCadastrarHotel');
        this.redirectUrlOnPanelClose = null; // Armazena a URL de redirecionamento
        this.hotelTableBody = document.getElementById('hotelTableBody');
        this.hotelEditingId = document.getElementById('hotelEditingId');
        this.btnSubmitHotel = document.getElementById('btnSubmitHotel');
        this.hotelRazaoSocialInput = document.getElementById('hotelRazaoSocial');
        this.searchHotelInput = document.getElementById('searchHotelInput');
        // Elementos de importação
        this.btnImportarLista = document.getElementById('btnImportarLista');
        this.importFileInput = document.getElementById('importFile');

        // Painel de Quartos
        this.quartosPanelBackdrop = document.getElementById('quartosPanelBackdrop');
        this.quartosPanel = document.getElementById('quartosPanel');
        this.quartosPanelTitle = document.getElementById('quartosPanelTitle');
        this.listaQuartos = document.getElementById('listaQuartos');
        this.formQuarto = document.getElementById('formCadastrarQuarto');
        this.quartoHotelIdInput = document.getElementById('quartoHotelId');
        this.quartoNomeInput = document.getElementById('quartoNome');
    }

    bind() {
        this.formHotel.addEventListener('submit', (e) => this.handleHotelSubmit(e));
        document.getElementById('btnClearHotelForm').addEventListener('click', () => this.clearHotelForm());
        this.hotelTableBody.addEventListener('click', (e) => this.handleHotelTableClick(e));
        this.searchHotelInput.addEventListener('input', () => this.renderHotels());

        // Eventos do painel de quartos
        this.quartosPanel.querySelector('.close-button').addEventListener('click', () => this.closeQuartosPanel());
        this.quartosPanelBackdrop.addEventListener('click', (e) => {
            if (e.target === this.quartosPanelBackdrop) this.closeQuartosPanel();
        });
        this.formQuarto.addEventListener('submit', (e) => this.handleQuartoSubmit(e));
        this.listaQuartos.addEventListener('click', (e) => this.handleQuartoListClick(e));

        // Eventos de importação
        if (this.btnImportarLista) {
            this.btnImportarLista.addEventListener('click', () => this.handleImportClick());
            this.importFileInput.addEventListener('change', (e) => this.handleFileImport(e));
        }
    }

    // --- Lógica para Hotéis ---

    async renderHotels() {
        const searchTerm = this.searchHotelInput.value.trim();
        let query = supabaseClient.from('hoteis').select('*').order('nome', { ascending: true });

        if (searchTerm) {
            query = query.or(`razao_social.ilike.%${searchTerm}%,nome.ilike.%${searchTerm}%,cnpj.ilike.%${searchTerm}%,responsavel.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Erro ao buscar hotéis:', error);
            return;
        }

        this.hotelTableBody.innerHTML = '';
        data.forEach(hotel => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${hotel.razao_social || ''}</td>
                <td>${hotel.nome || ''}</td>
                <td>${hotel.cnpj || ''}</td>
                <td>${hotel.endereco}</td>
                <td>${hotel.telefone || ''}</td>
                <td>${hotel.responsavel || ''}</td>
                <td>
                    <button class="btn-action btn-edit" data-id="${hotel.id}">Editar</button>
                    <button class="btn-action btn-delete" data-id="${hotel.id}">Excluir</button>
                    <button class="btn-action btn-manage-rooms" data-id="${hotel.id}" data-name="${hotel.nome}">Gerenciar Quartos</button>
                </td>
            `;
            this.hotelTableBody.appendChild(tr);
        });
    }

    async handleHotelSubmit(e) {
        e.preventDefault();
        const id = this.hotelEditingId.value;
        const hotelData = {
            razao_social: document.getElementById('hotelRazaoSocial').value,
            nome: document.getElementById('hotelNome').value,
            cnpj: document.getElementById('hotelCnpj').value,
            endereco: document.getElementById('hotelEndereco').value,
            telefone: document.getElementById('hotelTelefone').value,
            responsavel: document.getElementById('hotelResponsavel').value,
        };

        let result;
        if (id) {
            // Ao atualizar, retorna o dado para consistência
            result = await supabaseClient.from('hoteis').update(hotelData).eq('id', id).select().single();
        } else {
            // Ao inserir, usa .select() para obter o hotel recém-criado
            result = await supabaseClient.from('hoteis').insert([hotelData]).select().single();
        }

        if (result.error) {
            alert('Erro ao salvar hotel: ' + result.error.message);
        } else {
            const savedHotel = result.data;
            alert(`Hotel ${id ? 'atualizado' : 'cadastrado'} com sucesso!`);
            this.clearHotelForm();

            const urlParams = new URLSearchParams(window.location.search);
            const redirectPage = urlParams.get('redirect');

            // Se for um NOVO hotel e houver uma página de redirecionamento
            if (!id && redirectPage) {
                if (confirm('Deseja cadastrar os tipos de quarto para este hotel agora?')) {
                    this.redirectUrlOnPanelClose = redirectPage; // Armazena a URL para redirecionar ao fechar o painel
                    this.openQuartosPanel(savedHotel.id, savedHotel.nome);
                } else {
                    window.location.href = redirectPage; // Redireciona imediatamente se o usuário não quiser
                }
            } else if (redirectPage) {
                window.location.href = redirectPage; // Redireciona para atualizações ou se a lógica anterior não se aplicar
            } else {
                this.renderHotels(); // Comportamento padrão: apenas atualiza a lista
            }
        }
    }

    async handleHotelTableClick(e) {
        const target = e.target;
        const id = target.dataset.id;

        if (target.classList.contains('btn-edit')) {
            const { data, error } = await supabaseClient.from('hoteis').select('*').eq('id', id).single();
            if (data) this.fillHotelForm(data);
        } else if (target.classList.contains('btn-delete')) {
            if (confirm('Tem certeza que deseja excluir este hotel?')) {
                const { error } = await supabaseClient.from('hoteis').delete().eq('id', id);
                if (error) alert('Erro ao excluir: ' + error.message);
                else this.renderHotels();
            }
        } else if (target.classList.contains('btn-manage-rooms')) {
            this.openQuartosPanel(id, target.dataset.name);
        }
    }

    fillHotelForm(hotel) {
        this.hotelEditingId.value = hotel.id;
        document.getElementById('hotelRazaoSocial').value = hotel.razao_social || '';
        document.getElementById('hotelNome').value = hotel.nome;
        document.getElementById('hotelCnpj').value = hotel.cnpj || '';
        document.getElementById('hotelEndereco').value = hotel.endereco;
        document.getElementById('hotelTelefone').value = hotel.telefone || '';
        document.getElementById('hotelResponsavel').value = hotel.responsavel || '';
        this.btnSubmitHotel.textContent = 'Atualizar Hotel';
    }

    clearHotelForm() {
        this.formHotel.reset();
        this.hotelEditingId.value = '';
        this.btnSubmitHotel.textContent = 'Cadastrar Hotel';
    }

    // --- Lógica para Importação ---

    handleImportClick() {
        // Aciona o clique no input de arquivo oculto
        this.importFileInput.click();
    }

    handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                if (json.length === 0) {
                    alert('A planilha está vazia ou em um formato inválido.');
                    return;
                }

                await this.processImportedData(json);

            } catch (error) {
                console.error('Erro ao processar o arquivo XLSX:', error);
                alert('Ocorreu um erro ao ler a planilha. Verifique se o formato está correto.');
            } finally {
                // Limpa o valor do input para permitir a importação do mesmo arquivo novamente
                this.importFileInput.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async processImportedData(importedRows) {
        if (!confirm(`Foram encontrados ${importedRows.length} hotéis na planilha. Deseja continuar?

Atenção:
1. Hotéis existentes (identificados pelo CNPJ) serão ATUALIZADOS.
2. Novos hotéis serão CADASTRADOS.`)) {
            return;
        }

        let linhasIgnoradas = 0;

        const upsertPayload = importedRows.map(row => {
            // Helper para encontrar a chave no objeto da linha, ignorando maiúsculas/minúsculas.
            const findKey = (obj, keyToFind) => {
                return Object.keys(obj).find(k => k.toLowerCase() === keyToFind.toLowerCase());
            };

            // Encontra as chaves corretas no objeto 'row', pois podem variar no arquivo Excel.
            const keyRazaoSocial = findKey(row, 'Razão Social');
            const keyNomeFantasia = findKey(row, 'Nome Fantasia');
            const keyCnpj = findKey(row, 'CNPJ');
            const keyEndereco = findKey(row, 'Endereço');
            const keyTelefone = findKey(row, 'Telefone');
            const keyResponsavel = findKey(row, 'Responsável');

            // Extrai e limpa os dados, tratando valores nulos ou indefinidos e removendo espaços.
            const cnpj = String(row[keyCnpj] || '').trim();
            const nome = String(row[keyNomeFantasia] || '').trim();
            const endereco = String(row[keyEndereco] || '').trim();

            // Validação: Ignora a linha se campos essenciais estiverem faltando
            if (!cnpj || !nome || !endereco) {
                linhasIgnoradas++;
                return null;
            }

            return {
                razao_social: String(row[keyRazaoSocial] || ''),
                nome: nome,
                cnpj: cnpj,
                endereco: endereco,
                telefone: String(row[keyTelefone] || ''),
                responsavel: String(row[keyResponsavel] || '') || null
            };
        }).filter(Boolean); // Remove as entradas nulas que foram retornadas na validação.

        if (upsertPayload.length === 0) {
            return alert('Nenhum hotel com os dados obrigatórios (CNPJ, Nome Fantasia, Endereço) foi encontrado na planilha para importar.');
        }

        try {
            // Fornece feedback visual durante a importação
            this.btnImportarLista.disabled = true;
            this.btnImportarLista.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';

            const { error } = await supabaseClient.from('hoteis').upsert(upsertPayload, { onConflict: 'cnpj' });
            if (error) throw error;

            let successMessage = `Importação concluída! ${upsertPayload.length} registros de hotéis foram processados.`;
            if (linhasIgnoradas > 0) {
                successMessage += `\n${linhasIgnoradas} linha(s) foram ignoradas por não conterem CNPJ, Nome Fantasia ou Endereço.`;
            }
            alert(successMessage);
            this.renderHotels(); // Atualiza a tabela na tela
        } catch (error) {
            console.error('Erro detalhado no processamento:', error);
            alert('Erro ao processar os dados e atualizar o banco: ' + error.message);
        } finally {
            // Restaura o botão após a operação
            this.btnImportarLista.disabled = false;
            this.btnImportarLista.innerHTML = 'Importar Lista';
        }
    }

    // --- Lógica para Tipos de Quarto ---

    async openQuartosPanel(hotelId, hotelName) {
        this.quartoHotelIdInput.value = hotelId;
        this.quartosPanelTitle.textContent = `Gerenciar Quartos - ${hotelName}`;
        this.quartosPanelBackdrop.classList.remove('hidden');
        await this.renderQuartos(hotelId);
    }

    closeQuartosPanel() {
        this.quartosPanelBackdrop.classList.add('hidden');
        this.formQuarto.reset();
        this.listaQuartos.innerHTML = '';

        // Se houver uma URL de redirecionamento pendente, executa agora
        if (this.redirectUrlOnPanelClose) {
            window.location.href = this.redirectUrlOnPanelClose;
            this.redirectUrlOnPanelClose = null; // Limpa para evitar redirecionamentos futuros
        }
    }

    async renderQuartos(hotelId) {
        this.listaQuartos.innerHTML = '<li>Carregando...</li>';
        const { data, error } = await supabaseClient
            .from('hotel_quartos')
            .select('*')
            .eq('id_hotel', hotelId)
            .order('nome_quarto', { ascending: true });

        if (error) {
            console.error('Erro ao buscar quartos:', error);
            this.listaQuartos.innerHTML = '<li>Erro ao carregar quartos.</li>';
            return;
        }

        this.listaQuartos.innerHTML = '';
        if (data.length === 0) {
            this.listaQuartos.innerHTML = '<p class="empty-list-message">Nenhum tipo de quarto cadastrado.</p>';
        } else {
            data.forEach(quarto => {
                const div = document.createElement('div');
                div.className = 'quarto-item';
                div.innerHTML = `
                    <span class="quarto-item-name"><i class="fas fa-bed"></i> ${quarto.nome_quarto}</span>
                    <button class="btn-delete-quarto" data-id="${quarto.id}" title="Excluir quarto"><i class="fas fa-trash-alt"></i></button>
                `;
                this.listaQuartos.appendChild(div);
            });
        }
    }

    async handleQuartoSubmit(e) {
        e.preventDefault();
        const hotelId = this.quartoHotelIdInput.value;
        const nomeQuarto = this.quartoNomeInput.value.trim();

        if (!nomeQuarto || !hotelId) {
            alert('Por favor, preencha o nome do quarto.');
            return;
        }

        const { error } = await supabaseClient.from('hotel_quartos').insert([{
            id_hotel: hotelId,
            nome_quarto: nomeQuarto
        }]);

        if (error) {
            alert('Erro ao adicionar quarto: ' + error.message);
        } else {
            this.quartoNomeInput.value = '';
            await this.renderQuartos(hotelId);
        }
    }

    async handleQuartoListClick(e) {
        const target = e.target;
        if (target.classList.contains('btn-delete-quarto')) {
            const quartoId = target.dataset.id;
            const hotelId = this.quartoHotelIdInput.value;

            if (confirm('Tem certeza que deseja excluir este tipo de quarto?')) {
                const { error } = await supabaseClient.from('hotel_quartos').delete().eq('id', quartoId);
                if (error) {
                    alert('Erro ao excluir quarto: ' + error.message);
                } else {
                    await this.renderQuartos(hotelId);
                }
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HotelManager();
});