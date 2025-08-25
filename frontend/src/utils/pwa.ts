// PWA utilities for service worker registration and offline support

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class PWAManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private isInstallable = false;

  constructor() {
    this.init();
  }

  private init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        this.registerServiceWorker();
      });
    }

    // Handle install prompt
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.isInstallable = true;
      
      // Dispatch custom event for UI components
      window.dispatchEvent(new CustomEvent('pwa-installable'));
    });

    // Handle successful installation
    window.addEventListener('appinstalled', () => {
      console.log('PWA was installed');
      this.deferredPrompt = null;
      this.isInstallable = false;
      
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    });
  }

  private async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered successfully:', registration);

      // Handle service worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker is available
              window.dispatchEvent(new CustomEvent('sw-update-available'));
            }
          });
        }
      });
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }

  public async installPWA(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }

    try {
      await this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the PWA install prompt');
        return true;
      } else {
        console.log('User dismissed the PWA install prompt');
        return false;
      }
    } catch (error) {
      console.error('Error during PWA installation:', error);
      return false;
    } finally {
      this.deferredPrompt = null;
      this.isInstallable = false;
    }
  }

  public isInstallAvailable(): boolean {
    return this.isInstallable;
  }

  public isPWA(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  }
}

// Offline storage utilities
export class OfflineStorage {
  private dbName = 'WoodieCampusOfflineDB';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create stores
        if (!db.objectStoreNames.contains('problems')) {
          const problemsStore = db.createObjectStore('problems', { keyPath: 'id' });
          problemsStore.createIndex('categoryId', 'categoryId', { unique: false });
        }

        if (!db.objectStoreNames.contains('submissions')) {
          const submissionsStore = db.createObjectStore('submissions', { 
            keyPath: 'id',
            autoIncrement: true 
          });
          submissionsStore.createIndex('problemId', 'problemId', { unique: false });
          submissionsStore.createIndex('synced', 'synced', { unique: false });
        }

        if (!db.objectStoreNames.contains('analytics')) {
          db.createObjectStore('analytics', { keyPath: 'id' });
        }
      };
    });
  }

  async storeProblem(problem: any): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['problems'], 'readwrite');
      const store = transaction.objectStore('problems');
      const request = store.put(problem);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getProblem(id: string): Promise<any> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['problems'], 'readonly');
      const store = transaction.objectStore('problems');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async storeOfflineSubmission(submission: any): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['submissions'], 'readwrite');
      const store = transaction.objectStore('submissions');
      const request = store.add({
        ...submission,
        timestamp: Date.now(),
        synced: false
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingSubmissions(): Promise<any[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['submissions'], 'readonly');
      const store = transaction.objectStore('submissions');
      const index = store.index('synced');
      const request = index.getAll(false);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// Network status utilities
export class NetworkManager {
  private listeners: ((isOnline: boolean) => void)[] = [];

  constructor() {
    window.addEventListener('online', () => this.notifyListeners(true));
    window.addEventListener('offline', () => this.notifyListeners(false));
  }

  public isOnline(): boolean {
    return navigator.onLine;
  }

  public onStatusChange(callback: (isOnline: boolean) => void): () => void {
    this.listeners.push(callback);
    
    // Return cleanup function
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  private notifyListeners(isOnline: boolean) {
    this.listeners.forEach(listener => listener(isOnline));
  }
}

// Singleton instances
export const pwaManager = new PWAManager();
export const offlineStorage = new OfflineStorage();
export const networkManager = new NetworkManager();