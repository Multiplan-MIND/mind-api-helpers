#!/bin/bash

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Navegar para a raiz do projeto (assumindo que o script está em .deploy)
cd "$(dirname "$0")/.." || exit 1

BRANCH_NAME=$(git branch --show-current)
if [[ -z "$BRANCH_NAME" ]]; then
    echo -e "${RED}Branch não informada. Saindo...${NC}"
    exit 1
fi

# Tentar encontrar os PRs da release
echo -e "${YELLOW}Buscando PRs da branch $BRANCH_NAME...${NC}"

# Buscar PR para master
pr_master_info=$(gh pr list --head "$BRANCH_NAME" --base master --json number --jq '.[0].number' 2>/dev/null)
if [[ -n "$pr_master_info" ]]; then
    PR_MASTER_NUMBER=$pr_master_info
    echo -e "${GREEN}✓ PR para master encontrado: #$PR_MASTER_NUMBER${NC}"
fi

# Buscar PR para develop
pr_develop_info=$(gh pr list --head "$BRANCH_NAME" --base develop --json number --jq '.[0].number' 2>/dev/null)
if [[ -n "$pr_develop_info" ]]; then
    PR_DEVELOP_NUMBER=$pr_develop_info
    echo -e "${GREEN}✓ PR para develop encontrado: #$PR_DEVELOP_NUMBER${NC}"
fi

if [[ -z "$PR_MASTER_NUMBER" && -z "$PR_DEVELOP_NUMBER" ]]; then
    echo -e "${YELLOW}⚠ Nenhum PR da release encontrado${NC}"
fi
echo ""

# Verificar se gh CLI está instalado
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Erro: GitHub CLI (gh) não está instalado!${NC}"
    exit 1
fi

# Verificar se está autenticado no GitHub
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Erro: Você não está autenticado no GitHub CLI!${NC}"
    exit 1
fi

# Array para acumular changelogs
declare -a changelogs=()

# Loop interativo para gerenciar PRs EXISTENTES
while true; do
    echo -e "${YELLOW}═══════════════════════════════════════${NC}"
    echo "Gerenciamento de Pull Requests Existentes"
    echo -e "${YELLOW}═══════════════════════════════════════${NC}"
    echo ""
    echo "Digite o número de um PR existente para reapontar para $BRANCH_NAME"
    echo "e fazer merge automaticamente."
    echo ""
    if [[ -n "$PR_MASTER_NUMBER" ]]; then
        echo -e "${BLUE}PRs da Release:${NC}"
        echo "  → Master: #$PR_MASTER_NUMBER"
    fi
    if [[ -n "$PR_DEVELOP_NUMBER" ]]; then
        if [[ -z "$PR_MASTER_NUMBER" ]]; then
            echo -e "${BLUE}PRs da Release:${NC}"
        fi
        echo "  → Develop: #$PR_DEVELOP_NUMBER"
    fi
    echo ""
    echo "Opções:"
    echo "  [número] - Processar PR específico (ex: 99)"
    echo "  list     - Listar PRs abertos apontando para master"
    echo "  0        - Sair"
    echo ""
    read -p "PR número (ou comando): " pr_input

    case $pr_input in
        0)
            echo -e "${GREEN}Processo finalizado!${NC}"
            break
            ;;
        list)
            echo ""
            echo -e "${BLUE}PRs abertos apontando para master:${NC}"
            gh pr list --base master --state open
            echo ""
            ;;
        "")
            echo -e "${RED}Por favor, digite um número de PR ou comando.${NC}"
            ;;
        *)
            # Verificar se é um número
            if ! [[ "$pr_input" =~ ^[0-9]+$ ]]; then
                echo -e "${RED}Entrada inválida! Digite um número de PR.${NC}"
                continue
            fi

            pr_number=$pr_input

            # Verificar se o PR existe
            echo -e "${YELLOW}Verificando PR #$pr_number...${NC}"
            pr_info=$(gh pr view "$pr_number" --json title,baseRefName,headRefName,body 2>&1)
            if [ $? -ne 0 ]; then
                echo -e "${RED}Erro: PR #$pr_number não encontrado!${NC}"
                continue
            fi

            # Extrair informações do PR usando jq se disponível, senão usar grep
            if command -v jq &> /dev/null; then
                pr_title=$(echo "$pr_info" | jq -r '.title')
                pr_base=$(echo "$pr_info" | jq -r '.baseRefName')
                pr_head=$(echo "$pr_info" | jq -r '.headRefName')
                pr_body=$(echo "$pr_info" | jq -r '.body')
            else
                pr_title=$(echo "$pr_info" | grep -o '"title":"[^"]*"' | sed 's/"title":"\(.*\)"/\1/')
                pr_base=$(echo "$pr_info" | grep -o '"baseRefName":"[^"]*"' | sed 's/"baseRefName":"\(.*\)"/\1/')
                pr_head=$(echo "$pr_info" | grep -o '"headRefName":"[^"]*"' | sed 's/"headRefName":"\(.*\)"/\1/')
                pr_body=$(echo "$pr_info" | grep -o '"body":"[^"]*"' | sed 's/"body":"\(.*\)"/\1/')
            fi

            # Extrair changelog do corpo do PR
            changelog_lines=$(echo "$pr_body" | sed -n '/## Changelog:/,/^$/p' | grep '^- ' | sed 's/\\n/\n/g')

            echo ""
            echo -e "${BLUE}Informações do PR #$pr_number:${NC}"
            echo "  Título: $pr_title"
            echo "  De: $pr_head"
            echo "  Para: $pr_base → $BRANCH_NAME"
            if [[ -n "$changelog_lines" ]]; then
                echo -e "${BLUE}  Changelog encontrado:${NC}"
                echo "$changelog_lines" | while IFS= read -r line; do
                    echo "    $line"
                done
            fi
            echo ""

            read -p "Confirma reapontamento e merge? (s/n): " confirm_pr
            if [[ ! $confirm_pr =~ ^[SsYy]$ ]]; then
                echo -e "${YELLOW}Operação cancelada para PR #$pr_number${NC}"
                continue
            fi

            # Encontrar qualquer PR aberto que tenha o "$pr_head" como base
            dependent_prs=$(gh pr list --base "$pr_head" --state open --json number --jq '.[].number')

            echo "Dependent PRs: $dependent_prs"
            # Se encontrar PRs dependentes, mude a base deles para 'develop'
            if [ -n "$dependent_prs" ]; then
              echo -e "${YELLOW} PRs dependentes encontrados apontando para $pr_head. Reapontando para develop...${NC}"
              while IFS= read -r dep_pr; do
                  [ -z "$dep_pr" ] && continue
                  echo -e "${YELLOW}  Reapontando PR #$dep_pr de '$pr_head' para 'develop'...${NC}"
                  if gh pr edit "$dep_pr" --base "develop"; then
                      echo -e "${GREEN}  ✓ PR #$dep_pr reapontado para develop${NC}"
                  else
                      echo -e "${RED}  Erro ao reapontar PR #$dep_pr para develop!${NC}"
                  fi
              done <<< "$dependent_prs"
            fi

            # Reapontar PR
            echo -e "${YELLOW}Reapontando PR #$pr_number para $BRANCH_NAME...${NC}"
            gh pr edit "$pr_number" --base "$BRANCH_NAME"
            if [ $? -ne 0 ]; then
                echo -e "${RED}Erro ao reapontar PR #$pr_number!${NC}"
                continue
            fi
            echo -e "${GREEN}✓ PR #$pr_number reapontado para $BRANCH_NAME${NC}"

            # Fazer merge
            echo -e "${YELLOW}Fazendo merge do PR #$pr_number...${NC}"
            gh pr merge "$pr_number" --merge --auto --delete-branch
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓ PR #$pr_number merged com sucesso!${NC}"
                echo -e "${GREEN}✓ Branch $pr_head deletada${NC}"

                # Adicionar changelog ao array se existir
                if [[ -n "$changelog_lines" ]]; then
                    changelogs+=("$changelog_lines")
                    echo -e "${GREEN}✓ Changelog coletado${NC}"

                    # Atualizar PRs de release com o novo changelog
                    if [[ -n "$PR_MASTER_NUMBER" ]] || [[ -n "$PR_DEVELOP_NUMBER" ]]; then
                        echo -e "${YELLOW}Atualizando changelogs nos PRs de release...${NC}"

                        # Montar novo corpo com todos os changelogs
                        new_changelog="## Changelog:"$'\n'
                        for log in "${changelogs[@]}"; do
                            new_changelog+="$log"$'\n'
                        done

                        # Atualizar PR para master
                        if [[ -n "$PR_MASTER_NUMBER" ]]; then
                            echo "$new_changelog" | gh pr edit "$PR_MASTER_NUMBER" --body-file -
                            if [ $? -eq 0 ]; then
                                echo -e "${GREEN}✓ PR #$PR_MASTER_NUMBER (master) atualizado${NC}"
                            fi
                        fi

                        # Atualizar PR para develop
                        if [[ -n "$PR_DEVELOP_NUMBER" ]]; then
                            echo "$new_changelog" | gh pr edit "$PR_DEVELOP_NUMBER" --body-file -
                            if [ $? -eq 0 ]; then
                                echo -e "${GREEN}✓ PR #$PR_DEVELOP_NUMBER (develop) atualizado${NC}"
                            fi
                        fi
                    fi
                fi
            else
                echo -e "${RED}Erro ao fazer merge do PR #$pr_number!${NC}"
                echo -e "${YELLOW}O PR foi reapontado mas não foi possível fazer merge.${NC}"
                echo -e "${YELLOW}Verifique se há conflitos ou se o PR está aprovado.${NC}"
            fi

            echo ""
            ;;
    esac
done
