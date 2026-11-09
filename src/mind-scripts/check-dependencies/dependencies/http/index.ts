import { SettingsOf, defineDependency, field } from '../../core';
import { assertExpectations, expectations } from './expectations';
import { buildInit, request } from './request';

/** Só leituras: o comando roda contra produção, e o POST fica para consultas como a do GraphQL. */
const HTTP_METHODS = ['GET', 'HEAD', 'POST'] as const;

/** Os cabeçalhos e o corpo são segredo, porque costumam levar o token da API. */
const fields = {
  url: field.url(),
  method: field.oneOf(HTTP_METHODS, { default: 'GET' }),
  headers: field.textMap({ secret: true }),
  body: field.json({ secret: true }),
  acceptAnyStatus: field.flag(),
  expect: expectations(),
};

export type HttpSettings = SettingsOf<typeof fields>;

/**
 * Exige status 2xx, a menos que o arquivo aceite qualquer resposta, como para a API que não tem leitura e só se prova
 * que o host responde. Com qualquer resposta aceita, o redirecionamento também conta como resposta.
 */
async function checkHttp(settings: HttpSettings): Promise<void> {
  const response = await request(settings.url, {
    ...buildInit(settings),
    redirect: settings.acceptAnyStatus ? 'manual' : 'error',
  });
  if (!settings.acceptAnyStatus && !response.ok) {
    throw new Error(`Unexpected HTTP status | httpStatus=${response.status}`);
  }

  await assertExpectations(response, settings.expect);
}

export const http = defineDependency({ fields, check: checkHttp });
