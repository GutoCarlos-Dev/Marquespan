import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("formVeiculo");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const dados = {
      tipo: form.tipo.value,
      modelo: form.modelo.value,
      marca: form.marca.value,
      frota: form.frota.value,
      placa: form.placa.value,
      situacao: form.situacao.value
    };

    try {
      const { error } = await supabase.from("veiculos").insert([dados]);

      if (error) {
        console.error("Erro ao cadastrar veículo:", error.message);
        alert("Erro ao cadastrar veículo. Verifique os dados e tente novamente.");
        return;
      }

      alert("Veículo cadastrado com sucesso!");
      window.close(); // Fecha a janela após o cadastro

    } catch (err) {
      console.error("Erro inesperado:", err);
      alert("Ocorreu um erro inesperado. Tente novamente mais tarde.");
    }
  });
});
