import { TemplateResolver } from './template-resolver';

export interface FieldContext {
  resolver: TemplateResolver;
  /** Anota o valor resolvido fora do formato, para a etapa `environment` listar junto com as variáveis ausentes. */
  invalid: (reason: string) => void;
}

/**
 * Um campo do arquivo: o formato que o valor precisa ter, conferido antes de qualquer teste, e como ele vira o valor
 * que a verificação recebe. O campo sem padrão é obrigatório no arquivo.
 */
export interface Field<Value> {
  /** Completa a mensagem `<campo> of "<dependência>" must be ...` do valor fora do formato. */
  readonly description: string;
  readonly required: boolean;
  accepts: (raw: unknown) => boolean;
  /** Recebe `undefined` quando o arquivo não define o campo, e então resolve o padrão. */
  resolve: (raw: unknown, context: FieldContext) => Value;
}

interface TextOptions {
  /** Modelo usado quando o arquivo não define o campo; sem ele, o campo é obrigatório. */
  default?: string;
  /** O valor interpolado sai como `***` em qualquer mensagem ou pilha registrada. */
  secret?: boolean;
}

interface SecretOptions {
  secret?: boolean;
}

const PORT_PATTERN = /^\d+$/;

const MAXIMUM_PORT = 65_535;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function text({ default: fallback, secret = false }: TextOptions = {}): Field<string> {
  return {
    description: 'a string',
    required: fallback === undefined,
    accepts: isText,
    resolve: (raw, { resolver }) => resolver.resolve(isText(raw) ? raw : fallback, secret),
  };
}

/**
 * Texto que, depois de resolvido, precisa ser uma URL, inclusive quando um padrão vazio o deixa vazio; a variável
 * ausente sai só na lista de variáveis que faltam.
 */
function url(options: TextOptions = {}): Field<string> {
  const base = text(options);

  return {
    ...base,
    resolve: (raw, context) => {
      const template = isText(raw) ? raw : options.default ?? '';
      const value = base.resolve(raw, context);
      if (!context.resolver.referencesMissingVariable(template) && !URL.canParse(value)) {
        context.invalid('is not a valid URL');
      }
      return value;
    },
  };
}

/** Aceita o número direto ou o texto com variável, como `${REDIS_PORT:-6379}`, e entrega o número. */
function port({ default: fallback }: Omit<TextOptions, 'secret'> = {}): Field<number> {
  return {
    description: 'a string or an integer',
    required: fallback === undefined,
    accepts: (raw) => isText(raw) || Number.isInteger(raw),
    resolve: (raw, { resolver, invalid }) => {
      const template = isText(raw) ? raw : fallback ?? '';
      const value = typeof raw === 'number' ? String(raw) : resolver.resolve(template);
      const number = Number(value);
      if (PORT_PATTERN.test(value) && number > 0 && number <= MAXIMUM_PORT) return number;

      /** A variável ausente já sai na lista de variáveis que faltam; o vazio de um padrão vazio é apontado aqui. */
      if (typeof raw === 'number' || !resolver.referencesMissingVariable(template)) {
        invalid(`must be a number between 1 and ${MAXIMUM_PORT}`);
      }
      return number;
    },
  };
}

/** Lista de textos, vazia quando o arquivo não a define; cada item aceita variável. */
function textList({ secret = false }: SecretOptions = {}): Field<string[]> {
  return {
    description: 'a list of strings',
    required: false,
    accepts: (raw) => Array.isArray(raw) && raw.every(isText),
    resolve: (raw, { resolver }) => (Array.isArray(raw) ? raw : []).map((item) => resolver.resolve(item, secret)),
  };
}

/** Objeto de textos, como cabeçalhos, vazio quando o arquivo não o define; cada valor aceita variável. */
function textMap({ secret = false }: SecretOptions = {}): Field<Record<string, string>> {
  return {
    description: 'an object of strings',
    required: false,
    accepts: (raw) => isPlainObject(raw) && Object.values(raw).every(isText),
    resolve: (raw, { resolver }) =>
      Object.fromEntries(
        Object.entries(isPlainObject(raw) ? raw : {}).map(([key, item]) => [
          key,
          resolver.resolve(String(item), secret),
        ]),
      ),
  };
}

/** Qualquer valor JSON, como um corpo de requisição; troca as variáveis só nos textos e fica ausente sem padrão. */
function json({ secret = false }: SecretOptions = {}): Field<unknown> {
  return {
    description: 'a JSON value',
    required: false,
    accepts: (raw) => raw !== undefined,
    resolve: (raw, { resolver }) => resolver.resolveJson(raw, secret),
  };
}

function flag({ default: fallback = false }: { default?: boolean } = {}): Field<boolean> {
  return {
    description: 'true or false',
    required: false,
    accepts: (raw) => typeof raw === 'boolean',
    resolve: (raw) => (typeof raw === 'boolean' ? raw : fallback),
  };
}

/** Um valor fixo de uma lista, sem variável, como o método HTTP. */
function oneOf<Option extends string>(options: readonly Option[], { default: fallback }: { default: Option }) {
  const field: Field<Option> = {
    description: `one of ${options.join(', ')}`,
    required: false,
    accepts: (raw) => options.some((option) => option === raw),
    resolve: (raw) => options.find((option) => option === raw) ?? fallback,
  };

  return field;
}

/**
 * Os formatos de campo que qualquer tipo pode usar. O formato que só um tipo precisa, como o `expect` do `http`, fica
 * na pasta dele, implementando `Field`.
 */
export const field = { text, url, port, textList, textMap, json, flag, oneOf };
