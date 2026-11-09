import { DependencyDefinition } from '../core';
import { http } from './http';
import { mongodb } from './mongodb';
import { rabbitmq } from './rabbitmq';
import { redis } from './redis';

/**
 * Os valores aceitos no `type` do arquivo, na ordem em que a mensagem de erro os lista. O tipo novo entra com a
 * própria pasta e uma linha aqui, sem mudar os demais nem o núcleo, e o serviço só passa a usá-lo quando o declara.
 */
export const DEPENDENCY_TYPES: Record<string, DependencyDefinition> = { mongodb, redis, rabbitmq, http };
