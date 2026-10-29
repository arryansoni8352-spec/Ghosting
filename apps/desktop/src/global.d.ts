/**
 * Window type augmentation for the VeilGuard preload API.
 * This file must be imported (or referenced) anywhere the renderer uses window.veilguard.
 */

import type { VeilguardAPI } from "../../electron/preload";

declare global {
  interface Window {
    veilguard: VeilguardAPI;
  }
}

export {};
