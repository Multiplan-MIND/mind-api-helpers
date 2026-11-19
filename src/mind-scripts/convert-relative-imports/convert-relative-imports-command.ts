import { convertRelativeImports } from './convert-relative-imports';

/**
 * O comando `mind-convert-relative-imports` converte os imports a partir do diretório em que roda, que pelo `yarn` é a
 * raiz do serviço. O código de saída fica em 1 quando o `tsconfig.json` não serve ou algum arquivo falha, para que o
 * hook de commit que o chama pare.
 */
try {
  const summary = convertRelativeImports(process.cwd());

  console.log('\nDone!');
  console.log(`   Processed files: ${summary.processedCount}`);
  console.log(`   Converted files: ${summary.convertedCount}`);
  console.log(`   Converted imports: ${summary.importCount}`);
  console.log(`   Errors: ${summary.errorCount}`);

  if (summary.errorCount > 0) process.exitCode = 1;
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
