/** Só o módulo ausente que é o próprio pacote; o que falta dentro dele é outro problema e segue como veio. */
function isPackageMissing(error: unknown, packageName: string): boolean {
  const { code, message } = error as { code?: string; message?: string };

  return code === 'MODULE_NOT_FOUND' && (message ?? '').includes(`'${packageName}'`);
}

/**
 * Os drivers são carregados só quando o arquivo usa o tipo, para o serviço que não fala com uma dependência não
 * precisar instalar o pacote dela. O erro diz qual pacote falta, em vez do "Cannot find module" sem contexto.
 */
export async function loadDriver<Driver>(packageName: string, load: () => Promise<Driver>): Promise<Driver> {
  try {
    return await load();
  } catch (error) {
    if (!isPackageMissing(error, packageName)) throw error;
    throw new Error(`The ${packageName} package is not installed in the service`);
  }
}
