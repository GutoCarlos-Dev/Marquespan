export function normalizarFilial(valor) {
    return String(valor || '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function getValoresFilialRelacionados(filialUsuario, filiais = []) {
    const filialNormalizada = normalizarFilial(filialUsuario);
    if (!filialNormalizada) return [];

    const valores = new Set([String(filialUsuario).trim()]);

    (filiais || []).forEach(filial => {
        const nome = String(filial?.nome || '').trim();
        const sigla = String(filial?.sigla || '').trim();

        if (
            normalizarFilial(nome) === filialNormalizada
            || normalizarFilial(sigla) === filialNormalizada
            || normalizarFilial(sigla || nome) === filialNormalizada
        ) {
            if (nome) valores.add(nome);
            if (sigla) valores.add(sigla);
        }
    });

    return Array.from(valores).filter(Boolean);
}
