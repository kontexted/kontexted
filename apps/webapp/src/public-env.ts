import { createPublicEnv } from 'next-public-env';

export const { getPublicEnv, PublicEnv } = createPublicEnv({
  PUBLIC_COLLAB_URL: process.env.PUBLIC_COLLAB_URL
});
