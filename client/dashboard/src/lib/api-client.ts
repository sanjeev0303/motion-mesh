import { useMemo } from 'react';
import createClient, { Middleware } from 'openapi-fetch';
import type { paths } from './api-types';
import { useAuth } from '@clerk/nextjs';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export const apiClient = createClient<paths>({ baseUrl: API_URL });

/**
 * Creates a configured API client that automatically attaches the Clerk token.
 * This should be used within React components or hooks where `useAuth` is available.
 * 
 * Example:
 * const { getToken } = useAuth();
 * const api = createAuthClient(getToken);
 */
export function createAuthClient(getToken: () => Promise<string | null>) {
  const client = createClient<paths>({ baseUrl: API_URL });
  
  const authMiddleware: Middleware = {
    async onRequest({ request }) {
      const token = await getToken();
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      return request;
    },
  };

  client.use(authMiddleware);
  return client;
}

export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => createAuthClient(getToken), [getToken]);
}
