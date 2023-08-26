import { MindLoggerFactory } from '../../mind-logger/mind-logger.factory';

export const handleContext = (req: Request) => {
  const logger = MindLoggerFactory('GraphQLModuleContext');
  const ctx = { mindUserId: null, mindUserRoles: null, mindSessionExpiresIn: null };
  try {
    if (req?.headers?.['mind-user-id']) {
      ctx.mindUserId = req?.headers?.['mind-user-id'];
      ctx.mindUserRoles = req?.headers?.['mind-user-roles'].split(',');
      ctx.mindSessionExpiresIn = new Date(req?.headers?.['mind-session-expires-in']);
    }
  } catch (e) {
    logger.error(`Error setting context: ${e.message}`, e.stack, 'GraphQLModuleContext');
    return null;
  }
  return ctx;
};
