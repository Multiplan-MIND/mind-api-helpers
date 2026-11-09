/** O formato do driver, que não exporta a classe da topologia; só o que o relatório lê. */
interface TopologyDescription {
  type: string;
  servers: Map<string, { address: string; type: string; error?: { message: string } }>;
}

function isTopologyDescription(value: unknown): value is TopologyDescription {
  return typeof value === 'object' && value !== null && 'servers' in value && value.servers instanceof Map;
}

/**
 * O erro de seleção diz só que o prazo acabou; o motivo de cada servidor fica na topologia que ele carrega. O mongoose
 * embrulha o erro do driver numa classe própria, que copia a topologia.
 */
export function describeServerSelectionError(error: unknown): unknown {
  if (!(error instanceof Error) || !('reason' in error) || !isTopologyDescription(error.reason)) return error;
  const servers = [...error.reason.servers.values()]
    .map((server) => {
      const reason = server.error ? `(${server.error.message})` : '';
      return `${server.address}=${server.type}${reason}`;
    })
    .join(' ');
  return new Error(`${error.message} | topology=${error.reason.type} servers=${servers}`);
}
