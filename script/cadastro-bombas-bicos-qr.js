let html5QrCodeBico = null;
let isScanningBico = false;

document.addEventListener('DOMContentLoaded', () => {
    const btnScanQRBico    = document.getElementById('btnScanQRBico');
    const btnCloseScanner  = document.getElementById('btnCloseScannerBico');
    const modalScanner     = document.getElementById('modalScannerBico');

    if (btnScanQRBico) {
        btnScanQRBico.addEventListener('click', () => {
            if (modalScanner) {
                modalScanner.classList.remove('hidden');
                startScannerBico();
            }
        });
    }

    if (btnCloseScanner) {
        btnCloseScanner.addEventListener('click', () => {
            stopScannerBico();
            if (modalScanner) modalScanner.classList.add('hidden');
        });
    }
});

async function startScannerBico() {
    if (isScanningBico) return;

    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        alert('A câmera requer uma conexão segura (HTTPS).');
        return;
    }

    const readerElement = document.getElementById('readerBico');
    if (!readerElement) {
        console.error('Elemento #readerBico não encontrado.');
        return;
    }

    try {
        if (!html5QrCodeBico) {
            html5QrCodeBico = new Html5Qrcode('readerBico');
        }

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        await html5QrCodeBico.start(
            { facingMode: 'environment' },
            config,
            onScanSuccessBico,
            () => {}
        );

        isScanningBico = true;

        setTimeout(() => {
            const video = document.querySelector('#readerBico video');
            if (video) {
                video.style.objectFit = 'cover';
                video.style.width = '100%';
                video.style.height = '100%';
            }
        }, 500);

    } catch (err) {
        console.error('Erro ao iniciar câmera:', err);
        let msg = 'Não foi possível acessar a câmera.';
        if (err.name === 'NotAllowedError') msg = 'Permissão de câmera negada.';
        if (err.name === 'NotFoundError')   msg = 'Nenhuma câmera encontrada.';
        alert(msg);
        document.getElementById('modalScannerBico')?.classList.add('hidden');
    }
}

async function stopScannerBico() {
    if (html5QrCodeBico && isScanningBico) {
        try {
            await html5QrCodeBico.stop();
            isScanningBico = false;
        } catch (err) {
            console.warn('Erro ao parar câmera:', err);
        }
    }
}

function onScanSuccessBico(decodedText) {
    stopScannerBico();
    document.getElementById('modalScannerBico')?.classList.add('hidden');

    const qrCode = decodedText.trim();
    const inputQrcode = document.getElementById('bicoQrcode');
    if (inputQrcode) {
        inputQrcode.value = qrCode;
        inputQrcode.dispatchEvent(new Event('input', { bubbles: true }));
        inputQrcode.focus();
    }
}
