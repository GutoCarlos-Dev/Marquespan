-- Atualiza o campo oficina_id para 1 onde o item é 'ACESSORIOS' e o status é 'FINALIZADO'
UPDATE coletas_manutencao_checklist
SET oficina_id = 1
WHERE item = 'ACESSORIOS' AND status = 'FINALIZADO';