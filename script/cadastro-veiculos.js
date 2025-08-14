import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("formVeiculo");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 🔍 Validação básica
    const placa = form.placa.value.trim();
    const filial = form.Filial.value;

    if (!placa || !filial) {
      alert("Por favor, preencha os campos obrigatórios: Placa e Filial.");
      return;
    }

    // ✅ Coleta dos dados
    const veiculo = {
      placa,
      frota: form.frota.value.trim(),
      ano: form.ano.value,
      grupo: form.grupo.value.trim(),
      filial,
      agregado: form.agregado.value.trim(),
    };

    try {
      // 🔄 Envio para Supabase ou outro backend
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
