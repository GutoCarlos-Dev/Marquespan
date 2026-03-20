import { supabaseClient } from './supabase.js';

let generatedCodesCache = [];

document.addEventListener('DOMContentLoaded', () => {
    const btnGerar = document.getElementById('btn-gerar-qrcode');
    const modal = document.getElementById('modalGerarQRCode');
    const btnClose = document.getElementById('btnCloseModalQRCode');
    const btnGerarLista = document.getElementById('btnGerarListaCodes');
    const btnBaixarPDF = document.getElementById('btnBaixarPDFQRCode');

    if (btnGerar) {
        btnGerar.addEventListener('click', () => {
            if (modal) {
                modal.classList.remove('hidden');
                resetModal();
            } else {
                console.error('Modal modalGerarQRCode não encontrado no HTML');
            }
        });
    }

    if (btnClose) {
        btnClose.addEventListener('click', () => {
            if (modal) modal.classList.add('hidden');
        });
    }

    // Fechar ao clicar no fundo (backdrop)
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }

    if (btnGerarLista) {
        btnGerarLista.addEventListener('click', gerarCodigosUnicos);
    }

    if (btnBaixarPDF) {
        btnBaixarPDF.addEventListener('click', exportarPDF);
    }
});

function resetModal() {
    const qtdInput = document.getElementById('qtdQRCode');
    if (qtdInput) qtdInput.value = 10;
    
    const previewDiv = document.getElementById('previewQRCodes');
    if (previewDiv) {
        previewDiv.style.display = 'none';
        previewDiv.innerHTML = '';
    }
    
    const btnDownload = document.getElementById('btnBaixarPDFQRCode');
    if (btnDownload) btnDownload.classList.add('hidden');
    
    generatedCodesCache = [];
}

async function gerarCodigosUnicos() {
    const qtdInput = document.getElementById('qtdQRCode');
    const qtd = parseInt(qtdInput ? qtdInput.value : 0) || 0;
    
    if (qtd <= 0) return alert('Informe uma quantidade válida.');

    const btn = document.getElementById('btnGerarListaCodes');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

    try {
        // 1. Buscar todos os códigos existentes no banco para evitar duplicidade
        const { data, error } = await supabaseClient
            .from('veiculos')
            .select('qrcode');

        if (error) throw error;

        const existingCodes = new Set(data.map(v => v.qrcode).filter(c => c));
        const newCodes = [];

        // 2. Gerar novos códigos únicos
        let attempts = 0;
        const maxAttempts = qtd * 50; // Limite de segurança

        while (newCodes.length < qtd && attempts < maxAttempts) {
            const code = generateRandomCode();
            if (!existingCodes.has(code) && !newCodes.includes(code)) {
                newCodes.push(code);
            }
            attempts++;
        }

        generatedCodesCache = newCodes;
        mostrarPreview(newCodes);

    } catch (err) {
        console.error('Erro ao gerar códigos:', err);
        alert('Erro ao verificar códigos existentes.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function generateRandomCode() {
    // Padrão: 10 caracteres alfanuméricos (letras minúsculas e números)
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function mostrarPreview(codes) {
    const previewDiv = document.getElementById('previewQRCodes');
    if (previewDiv) {
        previewDiv.innerHTML = `<strong>${codes.length} Códigos Gerados:</strong><br>` + codes.join(', ');
        previewDiv.style.display = 'block';
    }
    document.getElementById('btnBaixarPDFQRCode').classList.remove('hidden');
}

async function exportarPDF() {
    if (generatedCodesCache.length === 0) return;

    if (!window.jspdf) {
        return alert('Biblioteca jsPDF não carregada. Verifique sua conexão.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Configurações da Grade
    const labelWidth = 45, labelHeight = 50, marginX = 10, marginY = 10, gapX = 2, gapY = 2;
    const cols = 4, rows = 5;
    let col = 0, row = 0;

    const container = document.getElementById('qr-code-hidden-container');
    const btn = document.getElementById('btnBaixarPDFQRCode');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando PDF...';

    // Carregar Logo para o PDF
    let logoDataUrl = null;
    try {
        const response = await fetch('logo.png');
        if (response.ok) {
            const blob = await response.blob();
            logoDataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        }
    } catch (e) {
        console.warn('Logo não carregado', e);
    }

    try {
        for (let i = 0; i < generatedCodesCache.length; i++) {
            const code = generatedCodesCache[i];
            const qrDataUrl = await generateQRImage(code, container);
            
            const x = marginX + (col * (labelWidth + gapX));
            const y = marginY + (row * (labelHeight + gapY));

            // Desenha a etiqueta
            doc.setLineWidth(0.1);
            doc.setDrawColor(200);
            doc.rect(x, y, labelWidth, labelHeight);

            // Imagem QR Code
            if (qrDataUrl) {
                // QR Code aumentado (38x38mm) e centralizado no espaço disponível acima do logo
                doc.addImage(qrDataUrl, 'PNG', x + (labelWidth - 38)/2, y + 2, 38, 38);
            }

            // Rodapé (Logo substituindo texto)
            if (logoDataUrl) {
                doc.addImage(logoDataUrl, 'PNG', x + (labelWidth - 25)/2, y + 40, 25, 7);
            } else {
                doc.setFontSize(9);
                const footerText = "MARQUESPAN";
                const footerWidth = doc.getTextWidth(footerText);
                doc.text(footerText, x + (labelWidth/2) - (footerWidth/2), y + 45);
            }

            // Controle de Paginação
            col++;
            if (col >= cols) {
                col = 0; row++;
                if (row >= rows && i < generatedCodesCache.length - 1) {
                    doc.addPage(); row = 0;
                }
            }
        }
        doc.save(`Etiquetas_QR_Marquespan_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch(e) {
        console.error(e);
        alert('Erro ao gerar PDF.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function generateQRImage(text, container) {
    return new Promise((resolve) => {
        if (!container || !window.QRCode) {
            resolve(null); return;
        }
        container.innerHTML = '';
        const div = document.createElement('div');
        
        try {
            new QRCode(div, {
                text: text,
                width: 200,
                height: 200,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
            
            setTimeout(() => {
                const canvas = div.querySelector('canvas');
                const img = div.querySelector('img');
                if (canvas) resolve(canvas.toDataURL('image/png'));
                else if (img) resolve(img.src);
                else resolve(null);
            }, 50);
        } catch (e) {
            console.error(e);
            resolve(null);
        }
    });
}