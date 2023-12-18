export function logPrefix(method?: string, infos?: string[]) {
  let prefix = `${process.pid}|${method}`;
  if (infos) {
    prefix += '#';
    for (let i = 0; i < infos.length; i++) {
      prefix += infos[i];
      if (i + 1 != infos.length) prefix += ';';
    }
  }
  return prefix;
}
