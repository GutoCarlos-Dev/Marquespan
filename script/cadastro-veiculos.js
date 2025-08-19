import { supabase } from '..script/supabase.js';

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("formVeiculo");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 🔍 Validação básica
    const placa = form.placa.value.trim();
    const filial = form.filial.value.trim();

    if (!placa || !filial) {
      alert("Por favor, preencha os campos obrigatórios: Placa e Filial.");
      return;
    }

    // ✅ Coleta dos dados
    const veiculo = {
      placa,
      filial,
      marca: form.marca.value.trim(),
      modelo: form.modelo.value.trim(),
      tipo: form.tipo.value.trim(),
      situacao: form.situacao.value.trim(),
      chassi: form.chassi?.value.trim() || null,
      renavan: form.renavan?.value.trim() || null,
      anofab: parseInt(form.anofab.value),
      anomod: parseInt(form.anomod.value),
      qtdtanque: form.qtdtanque ? parseInt(form.qtdtanque.value) : null
    };

    try {
      // 🔎 Verifica se já existe veículo com a mesma placa
      const { data: existente, error: erroBusca } = await supabase
        .from("veiculos")
        .select("id")
        .eq("placa", veiculo.placa);

      if (erroBusca) {
        console.error("Erro ao verificar placa:", erroBusca);
        alert("Erro ao verificar placa. Tente novamente.");
        return;
      }

      if (existente.length > 0) {
        alert("Já existe um veículo com essa placa.");
        return;
      }

      // 🚀 Envio para Supabase
      const { data, error } = await supabase
        .from("veiculos")
        .insert([veiculo]);

      if (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar o veículo. Tente novamente.");
      } else {
        alert("Veículo cadastrado com sucesso!");
        form.reset();
        fecharModal();
      }
    } catch (err) {
      console.error("Erro inesperado:", err);
      alert("Erro inesperado. Verifique sua conexão.");
    }
  });
});

// 🔙 Função para fechar o modal
function fecharModal() {
  document.querySelector(".modal-veiculo").classList.remove("show");
}
