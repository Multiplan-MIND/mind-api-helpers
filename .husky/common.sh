#
# Carregado no começo de todo hook do husky.
#

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

# Em devcontainer o NVM_DIR já vem definido. Quando ele aponta para um diretório sem nvm, a instalação
# padrão resolve, mas corrigindo a variável e não só o caminho do script: é por ela que o nvm localiza
# as versões instaladas.
[ -s "$NVM_DIR/nvm.sh" ] || NVM_DIR="$HOME/.nvm"
export NVM_DIR

if [ -s "$NVM_DIR/nvm.sh" ] && [ -f .nvmrc ]; then
  # O husky roda o hook com `sh -e`: sem desligar isso, um retorno não zero do nvm barraria o commit
  # aqui, antes da checagem abaixo, que é quem decide quando barrar.
  set +e
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use > /dev/null 2>&1
  nvm_use_status=$?
  set -e

  if [ "$nvm_use_status" -ne 0 ]; then
    echo "husky - Node $(tr -d '[:space:]' < .nvmrc) do .nvmrc não está instalado. Rode: nvm install" >&2
    exit 1
  fi
fi
