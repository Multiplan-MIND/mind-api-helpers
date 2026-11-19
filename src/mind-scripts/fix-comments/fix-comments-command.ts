import { fixComments } from './fix-comments';

/**
 * O comando `mind-fix-comments` converte os comentários a partir do diretório em que roda, que pelo `yarn` é a raiz do
 * serviço. O código de saída fica em 1 quando algum arquivo falha, para que o hook de commit que o chama pare.
 */
const summary = fixComments(process.cwd());

console.log('\nDone!');
console.log(`   Processed files: ${summary.processedCount}`);
console.log(`   Converted files: ${summary.convertedCount}`);
console.log(`   Errors: ${summary.errorCount}`);

if (summary.convertedCount > 0) console.log(`\nRun 'git diff' to review the changes`);
if (summary.errorCount > 0) process.exitCode = 1;
