declare global {
  interface Window {
    showNotification?: (
      message: string,
      type?: 'success' | 'error' | 'info' | 'warning',
      options?: { duration?: number; copyable?: boolean; closable?: boolean } | number,
    ) => void;
    dockerPageManager?: unknown;
  }
}

export {};
