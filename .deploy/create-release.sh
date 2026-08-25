#!/bin/bash

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Navegar para a raiz do projeto (assumindo que o script está em .deploy)
cd "$(dirname "$0")/.." || exit 1

# Função para extrair a versão atual do package.json
get_current_version() {
    if [ ! -f "package.json" ]; then
        echo -e "${RED}Erro: package.json não encontrado!${NC}"
        exit 1
    fi
    
    version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' package.json | sed 's/.*"\([0-9.]*\)".*/\1/')
    echo "$version"
}

# Função para atualizar versão usando npm version e obter a nova versão
update_version_with_npm() {
    local release_type=$1
    
    # Executar npm version e capturar a saída
    npm_output=$(npm version "$release_type" --no-git-tag-version 2>&1)
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Erro ao executar npm version: $npm_output${NC}"
        exit 1
    fi
    
    # Extrair a nova versão da saída (remove o 'v' do início)
    new_version=$(echo "$npm_output" | sed 's/^v//')
    
    echo "$new_version"
}

# Verificar se npm está instalado
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Erro: npm não está instalado!${NC}"
    exit 1
fi

# Verificar se gh CLI está instalado
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Erro: GitHub CLI (gh) não está instalado!${NC}"
    echo "Instale com: brew install gh (macOS) ou https://cli.github.com/"
    exit 1
fi

# Verificar se está autenticado no GitHub
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Erro: Você não está autenticado no GitHub CLI!${NC}"
    echo "Execute: gh auth login"
    exit 1
fi

# Verificar se estamos em um repositório git
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Erro: Não está em um repositório git!${NC}"
    exit 1
fi

# Verificar se está na branch master
current_branch=$(git branch --show-current)
if [ "$current_branch" != "master" ]; then
    echo -e "${RED}Erro: Você deve estar na branch 'master' para criar uma release!${NC}"
    echo -e "${YELLOW}Branch atual: $current_branch${NC}"
    echo ""
    read -p "Deseja mudar para a branch master? (s/n): " switch_branch
    if [[ $switch_branch =~ ^[SsYy]$ ]]; then
        git checkout master
        if [ $? -ne 0 ]; then
            echo -e "${RED}Erro ao mudar para a branch master!${NC}"
            exit 1
        fi
        echo -e "${GREEN}✓ Mudou para a branch master${NC}"
    else
        echo -e "${YELLOW}Operação cancelada.${NC}"
        exit 1
    fi
fi

# Atualizar a branch master
echo -e "${YELLOW}Atualizando branch master...${NC}"
git pull origin master
if [ $? -ne 0 ]; then
    echo -e "${RED}Erro ao atualizar a branch master!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Branch master atualizada${NC}"

# Verificar se há mudanças não commitadas
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}Erro: Há mudanças não commitadas. Commit ou stash antes de continuar.${NC}"
    exit 1
fi

# Obter versão atual
current_version=$(get_current_version)
echo -e "${GREEN}Versão atual: $current_version${NC}"

# Perguntar o tipo de release
echo ""
echo "Qual tipo de release deseja criar?"
echo "1) Minor (nova funcionalidade)"
echo "2) Patch (correção de bug)"
echo ""
read -p "Escolha (1/2): " choice

case $choice in
    1) release_type="minor" ;;
    2) release_type="patch" ;;
    *)
        echo -e "${RED}Opção inválida!${NC}"
        exit 1
        ;;
esac

# Confirmar ação antes de atualizar a versão
read -p "Deseja continuar com a criação da release $release_type? (s/n): " confirm
if [[ ! $confirm =~ ^[SsYy]$ ]]; then
    echo -e "${YELLOW}Operação cancelada.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Iniciando processo de release...${NC}"

# Atualizar versão usando npm version e obter a nova versão
echo "1/6 - Atualizando versão com npm version..."
echo "Atualizando versão usando npm version $release_type..."
new_version=$(update_version_with_npm "$release_type")
echo -e "${GREEN}✓ Arquivos package.json e package-lock.json atualizados${NC}"
echo -e "${GREEN}Nova versão: $new_version${NC}"

# Nome da branch
branch_name="release/$new_version"

# Criar nova branch
echo "2/6 - Criando branch $branch_name..."
git checkout -b "$branch_name"
if [ $? -ne 0 ]; then
    echo -e "${RED}Erro ao criar branch!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Branch criada${NC}"

# Commitar mudanças dos arquivos package*
echo "3/6 - Commitando mudanças dos arquivos package*..."
git add package*.json
git commit -m "bump version to $new_version"
if [ $? -ne 0 ]; then
    echo -e "${RED}Erro ao commitar mudanças!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Mudanças commitadas${NC}"

# Push para o GitHub
echo "4/6 - Fazendo push para o GitHub..."
git push -u origin "$branch_name"
if [ $? -ne 0 ]; then
    echo -e "${RED}Erro ao fazer push!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Push realizado com sucesso${NC}"

# Criar PR para master
echo "5/6 - Criando Pull Request para master..."
pr_master_url=$(gh pr create \
    --base master \
    --head "$branch_name" \
    --title "Release/$new_version" \
    --body "## Changelog:
- " \
    --assignee "@me" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PR para master criado${NC}"
    echo -e "${BLUE}   $pr_master_url${NC}"
else
    echo -e "${YELLOW}⚠ Não foi possível criar PR para master (branch pode não existir)${NC}"
fi

# Criar PR para develop
echo "6/6 - Criando Pull Request para develop..."
pr_develop_url=$(gh pr create \
    --base develop \
    --head "$branch_name" \
    --title "Release/$new_version" \
    --body "## Changelog:
- " \
    --assignee "@me" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PR para develop criado${NC}"
    echo -e "${BLUE}   $pr_develop_url${NC}"
else
    echo -e "${YELLOW}⚠ Não foi possível criar PR para develop (branch pode não existir)${NC}"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Release $new_version criada com sucesso!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "Branch: $branch_name"
echo "Versão anterior: $current_version"
echo "Nova versão: $new_version"
echo ""
echo "Pull Requests criados:"
if [[ $pr_master_url == http* ]]; then
    echo "  → Master: $pr_master_url"
fi
if [[ $pr_develop_url == http* ]]; then
    echo "  → Develop: $pr_develop_url"
fi
echo ""
echo "Próximos passos:"
echo "  1. Revise os Pull Requests criados"
echo "  2. Aguarde aprovação e CI passar"
echo "  3. Faça o merge dos PRs quando estiverem prontos"
