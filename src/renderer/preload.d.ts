import { DesktopApi } from '../shared/contracts';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    desktopApi?: DesktopApi;
  }
}

export {};
