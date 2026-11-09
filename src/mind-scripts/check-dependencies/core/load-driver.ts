/**
 * Os drivers são carregados só quando o arquivo usa o tipo, para o serviço que não fala com uma dependência não
 * precisar instalar o pacote dela. O erro diz qual pacote falta, em vez do "Cannot find module" sem contexto.
 */
export async function loadDriver<Driver>(packageName: string, load: () => Promise<Driver>): Promise<Driver> {
  try {
    return await load();
  } catch (error) {
    if ((error as { code?: string }).code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error(`The ${packageName} package is not installed in the service`);
  }
}
