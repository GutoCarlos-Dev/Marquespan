import { supabase } from './supabase.js';

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("formVeiculo");
  const btnExcluir = document.getElementById("btnExcluir");
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  // 🔍 Preenche os campos se estiver em modo de edição
  if (id) {
    const { data: veiculo, error } = await supabase
      .from("veiculos")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !veiculo) {
      console.error("Erro ao buscar veículo:", error);
      alert("Erro ao carregar dados do veículo.");
      return;
    }

    Object.keys(veiculo).forEach((campo) => {
      const input = document.getElementById(campo);
      if (input && veiculo[campo] !== null) {
        input.value = veiculo[campo];
      }
    });

    // 🗑️ Ativa botão de exclusão
    if (btnExcluir) {
      btnExcluir.style.display = "inline-block";
      btnExcluir.addEventListener("click", async () => {
        const confirmar = confirm("Tem certeza que deseja excluir este veículo?");
        if (!confirmar) return;

        const { error: erroExclusao } = await supabase
          .from("veiculos")
          .delete()
          .eq("id", id);

        if (erroExclusao) {
          console.error("Erro ao excluir:", erroExclusao);
          alert("Erro ao excluir o veículo.");
        } else {
          alert("Veículo excluído com sucesso!");
          window.close();
        }
      });
    }
  } else {
    // Oculta botão de exclusão em novo cadastro
    if (btnExcluir) btnExcluir.style.display = "none";
  }

  // 💾 Submeter dados
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const placa = form.placa.value.trim();
    const filial = form.filial.value.trim();

    if (!placa || !filial) {
      alert("Por favor, preencha os campos obrigatórios: Placa e Filial.");
      return;
    }

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
      let resultado;

      if (id) {
        console.log("Tentando atualizar veículo com ID:", id);

        const { data, error } = await supabase
          .from("veiculos")
          .update(veiculo)
          .eq("id", id);

        if (error) {
          console.error("Erro ao atualizar:", error);
          alert("Erro ao atualizar o veículo.");
          return;
        }

        if (!data || data.length === 0) {
          console.warn("Nenhum registro foi atualizado. Verifique o ID.");
          alert("Veículo não encontrado ou dados não foram modificados.");
          return;
        }

        resultado = { data, error };
      } else {
        // 🆕 Inserção com verificação de placa duplicada
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

        const { data, error } = await supabase
          .from("veiculos")
          .insert([veiculo]);

        resultado = { data, error };
      }

      if (resultado.error) {
        console.error("Erro ao salvar:", resultado.error);
        alert("Erro ao salvar o veículo. Tente novamente.");
      } else {
        alert(id ? "Veículo atualizado com sucesso!" : "Veículo cadastrado com sucesso!");
        form.reset();
        form.classList.add("sucesso");
        setTimeout(() => form.classList.remove("sucesso"), 2000);
        window.close();
      }
    } catch (err) {
      console.error("Erro inesperado:", err);
      alert("Erro inesperado. Verifique sua conexão.");
    }
  });
});
