import { net } from 'electron';

export const fetchDesktopRequest: typeof fetch = (input, init) => net.fetch(
  input instanceof URL ? input.toString() : input,
  { ...init, credentials: 'omit' }
);
