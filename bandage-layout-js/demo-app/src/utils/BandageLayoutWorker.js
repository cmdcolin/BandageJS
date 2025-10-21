// Real Bandage Layout Worker using WASM
// This wraps the bandage-layout-worker-interface.js to work with the React app

export class BandageLayoutWorker {
  constructor() {
    this._worker = null;
    this._ready = false;
    this._messageId = 0;
    this._pending = new Map();

    // Initialize the worker
    this._initPromise = this._init();
  }

  async _init() {
    try {
      // Create worker from the public JS file
      this._worker = new Worker('/js/bandage-layout.worker.js', { type: 'module' });

      // Set up message handler
      this._worker.onmessage = (e) => {
        const { id, type, result, error, success } = e.data;

        // Handle initialization complete
        if (type === 'init-complete') {
          if (success) {
            this._ready = true;
          } else {
            console.error('Worker initialization failed:', error);
          }
          return;
        }

        // Handle layout result
        if (type === 'layout-result') {
          const pending = this._pending.get(id);
          if (pending) {
            this._pending.delete(id);
            if (success) {
              pending.resolve(result);
            } else {
              pending.reject(new Error(error));
            }
          }
          return;
        }

        // Handle progress updates (optional, could add callback support later)
        if (type === 'layout-progress') {
          console.log('Layout progress:', e.data);
          return;
        }
      };

      this._worker.onerror = (error) => {
        console.error('Worker error:', error);
        // Reject all pending promises
        for (const [id, pending] of this._pending.entries()) {
          pending.reject(error);
          this._pending.delete(id);
        }
      };

      // Send init message
      this._worker.postMessage({ type: 'init' });

      // Wait for ready
      await this._waitForReady();
    } catch (error) {
      console.error('Failed to initialize WASM worker:', error);
      throw error;
    }
  }

  async _waitForReady() {
    // Wait indefinitely for worker to be ready
    while (!this._ready) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async ready() {
    await this._initPromise;
    return this._ready;
  }

  async computeLayout(graph, options) {
    await this.ready();

    const id = this._messageId++;
    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });

      this._worker.postMessage({
        type: 'compute-layout',
        id,
        data: { graph, options }
      });
    }).then(result => {
      const duration = performance.now() - startTime;
      return { result, duration };
    });
  }

  terminate() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
      this._ready = false;
    }
  }
}
