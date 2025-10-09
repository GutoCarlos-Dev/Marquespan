import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("formPneu");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  console.log("Página carregada. ID na URL:", id);

  // 🔍 Preenche os campos se estiver em modo de edição
  if (id) {
    console.log("Modo edição ativado. Buscando pneu no Supabase...");

    const { data: pneu, error } = await supabase
      .from("pneus")
      .select("*")
      .eq("id", id)
      .single();

    console.log("Resposta da busca:", { pneu, error });

    if (error || !pneu) {
      console.error("Erro ao buscar pneu:", error);
      alert("Erro ao carregar dados do pneu.");
      return;
    }

    Object.keys(pneu).forEach((campo) => {
      const input = document.getElementById(campo);
      if (input && pneu[campo] !== null) {
        input.value = pneu[campo];
      }
    });
  }

  // 💾 Submeter dados
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    console.log("Formulário enviado.");

    const marca = form.marca.value.trim();
    const modelo = form.modelo.value.trim();
    const tamanho = form.tamanho.value.trim();
    const tipo = form.tipo.value.trim();
    const quantidade = parseInt(form.quantidade.value);

    if (!marca || !modelo || !tamanho || !tipo) {
      alert("Por favor, preencha os campos obrigatórios: Marca, Modelo, Tamanho e Tipo.");
      return;
    }

    const pneu = {
      marca,
      modelo,
      tamanho,
      tipo,
      quantidade,
    };

    console.log("Dados do pneu a salvar:", pneu);

    try {
      if (id) {
        console.log("Tentando atualizar pneu com ID:", id);

        const { data, error } = await supabase
          .from("pneus")
          .update(pneu)
          .eq("id", id);

        console.log("Resposta da atualização:", { data, error });

        if (error) {
          console.error("Erro ao atualizar:", error);
          alert("Erro ao atualizar o pneu.");
          return;
        }

        alert("Pneu atualizado com sucesso!");
        form.reset();
        window.close();
      } else {
        console.log("Inserindo novo pneu...");

        const { data, error } = await supabase
          .from("pneus")
          .insert([pneu]);

        if (error) {
          console.error("Erro ao salvar:", error);
          alert("Erro ao salvar o pneu. Tente novamente.");
          return;
        }

        alert("Pneu cadastrado com sucesso!");
        form.reset();
        window.close();
      }
    } catch (err) {
      console.error("Erro inesperado:", err);
      alert("Erro inesperado. Verifique sua conexão.");
    }
  });
});
