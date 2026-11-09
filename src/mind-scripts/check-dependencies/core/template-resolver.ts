/** `${NOME}` exige a variável; `${NOME:-padrão}` usa o padrão, que pode ser vazio, quando ela falta ou está vazia. */
const VARIABLE_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/**
 * Troca as referências a variável de ambiente pelos valores e guarda o que faltou, para o relatório listar todas as
 * variáveis ausentes de uma vez. O valor que entra em campo secreto fica guardado para ser mascarado no log.
 */
export class TemplateResolver {
  readonly missingVariables = new Set<string>();

  readonly secrets = new Set<string>();

  constructor(private readonly environment: NodeJS.ProcessEnv) {}

  resolve(template: string, secret = false): string {
    return template.replace(VARIABLE_REFERENCE, (_reference, name: string, fallback?: string) => {
      const value = this.environment[name];
      if (value !== undefined && value !== '') {
        if (secret) this.secrets.add(value);
        return value;
      }

      if (fallback === undefined) this.missingVariables.add(name);
      return fallback ?? '';
    });
  }

  /** Percorre objetos e listas, como o corpo de uma requisição, trocando as referências só nos textos. */
  resolveJson(value: unknown, secret = false): unknown {
    if (typeof value === 'string') return this.resolve(value, secret);
    if (Array.isArray(value)) return value.map((item) => this.resolveJson(item, secret));
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.resolveJson(item, secret)]));
    }

    return value;
  }
}

/**
 * O segredo some do texto antes de o texto chegar ao log, inclusive dentro da mensagem de erro de uma biblioteca. O
 * mais longo vai primeiro, para um segredo que contém outro não sair mascarado só em parte.
 */
export function maskSecrets(text: string, secrets: Iterable<string>): string {
  let masked = text;
  const longestFirst = [...secrets].sort((first, second) => second.length - first.length);
  for (const secret of longestFirst) masked = masked.split(secret).join('***');

  return masked;
}
