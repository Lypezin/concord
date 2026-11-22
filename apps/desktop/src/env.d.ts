/// <reference types="vite/client" />
import type { ConcordBridge } from './bridge-types.js';

declare global {
  interface Window {
    concordAPI?: ConcordBridge;
  }
}

export {};
