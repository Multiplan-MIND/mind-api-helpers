/**
 * O núcleo genérico do verificador: lê o arquivo, resolve as variáveis, mascara os segredos e roda cada verificação
 * no prazo. Não conhece nenhum tipo de dependência; os tipos importam daqui o contrato e os formatos de campo.
 */
export * from './constants';
export * from './dependency-checks';
export * from './dependency-config';
export * from './dependency-definition';
export * from './fields';
export * from './load-driver';
export * from './template-resolver';
