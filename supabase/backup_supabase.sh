#!/bin/bash

# ==============================================================================
# SCRIPT DE BACKUP PARA SUPABASE (PostgreSQL)
# ==============================================================================
# Este script realiza um backup completo do seu banco de dados Supabase,
# salvando a estrutura, os dados e as permissões.
#
# REQUISITOS:
#   - Ter o PostgreSQL Client Tools instalado na sua máquina (pg_dump, pg_dumpall, psql).
#     Você pode baixar em: https://www.postgresql.org/download/
#
# COMO USAR:
#   1. Altere as variáveis na seção "Configuração" abaixo com os dados do seu projeto.
#   2. Salve este arquivo como `backup_supabase.sh`.
#   3. Abra um terminal (Linux/macOS) ou Git Bash (Windows).
#   4. Dê permissão de execução ao script: chmod +x backup_supabase.sh
#   5. Execute o script: ./backup_supabase.sh
#   6. Digite a senha do seu banco de dados quando solicitado.
# ==============================================================================

# --- Configuração ---
# Encontre esses valores no seu painel Supabase em: Project Settings > Database > Connection string
DB_HOST="db.xxxxxxxxxxxxxxxxxxxx.supabase.co" # Insira seu Host aqui
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"

# --- Diretório de Backup ---
BACKUP_DIR="supabase_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR/data"

# --- Senha ---
# Solicita a senha do banco de dados de forma segura
echo "Digite a senha do banco de dados (encontrada em Project Settings > Database):"
read -s PGPASSWORD
export PGPASSWORD

# --- Verificação de Ferramentas ---
if ! command -v pg_dump &> /dev/null || ! command -v pg_dumpall &> /dev/null || ! command -v psql &> /dev/null; then
    echo "Erro: As ferramentas pg_dump, pg_dumpall e psql precisam estar instaladas."
    echo "Instale o cliente PostgreSQL para o seu sistema operacional."
    exit 1
fi

echo "Iniciando o backup para o diretório: $BACKUP_DIR"

# 1. Backup do Schema (Estrutura das tabelas, views, funções, etc.)
echo "1/3: Fazendo backup do schema..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --schema-only -f "$BACKUP_DIR/schema.sql"
if [ $? -ne 0 ]; then echo "Erro no backup do schema."; exit 1; fi
echo "Schema salvo em: $BACKUP_DIR/schema.sql"

# 2. Backup de Roles e Permissões (Objetos Globais)
echo "2/3: Fazendo backup de roles e permissões..."
pg_dumpall -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --globals-only -f "$BACKUP_DIR/roles_permissions.sql"
if [ $? -ne 0 ]; then echo "Erro no backup de roles."; exit 1; fi
echo "Roles e permissões salvos em: $BACKUP_DIR/roles_permissions.sql"

# 3. Backup dos Dados (Tabela por Tabela em CSV)
echo "3/3: Fazendo backup dos dados (tabela por tabela)..."
TABLES=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
for TABLE in $TABLES; do echo "   - Exportando tabela: $TABLE"; psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\copy (SELECT * FROM public.\"$TABLE\") TO '$BACKUP_DIR/data/$TABLE.csv' WITH CSV HEADER"; if [ $? -ne 0 ]; then echo "Erro ao exportar a tabela $TABLE."; fi; done
echo "Backup dos dados concluído em: $BACKUP_DIR/data/"

unset PGPASSWORD
echo -e "\n✅ Backup concluído com sucesso! Os arquivos estão no diretório: $BACKUP_DIR"