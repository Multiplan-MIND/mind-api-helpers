import { Field } from './fields';

export type FieldSpecs = Record<string, Field<unknown>>;

/** O valor que a verificação recebe de cada campo, já resolvido e convertido. */
export type SettingsOf<Fields extends FieldSpecs> = {
  [Name in keyof Fields]: Fields[Name] extends Field<infer Value> ? Value : never;
};

/**
 * Um tipo de dependência: os campos que o arquivo aceita para ele e a verificação que recebe os campos resolvidos. O
 * núcleo valida o arquivo, resolve as variáveis e mascara os segredos a partir dos campos, então o tipo novo não muda
 * nada fora da própria pasta além da linha no registro.
 */
export interface DependencyDefinition<Fields extends FieldSpecs = FieldSpecs> {
  readonly fields: Fields;
  /** Rejeita quando a dependência não responde como o serviço precisa; o prazo geral fica com o núcleo. */
  check(settings: SettingsOf<Fields>): Promise<void>;
}

/** Só infere os tipos: a verificação recebe cada campo já com o tipo do valor resolvido. */
export function defineDependency<Fields extends FieldSpecs>(
  definition: DependencyDefinition<Fields>,
): DependencyDefinition<Fields> {
  return definition;
}
