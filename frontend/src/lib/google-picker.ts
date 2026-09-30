export type NotebookSelection = { id: string; name: string };
export type PickerSession = { access_token: string; expires_in: number; api_key: string; project_number: string };
type PickerEvent = { action?: string; docs?: { id?: unknown; name?: unknown; mimeType?: unknown }[] };
type Picker = { setVisible(visible: boolean): void; dispose(): void };
type DocsView = { setMode(mode: string): DocsView; setIncludeFolders(include: boolean): DocsView; setSelectFolderEnabled(enabled: boolean): DocsView };
type PickerBuilder = {
  addView(view: DocsView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setSize(width: number, height: number): PickerBuilder;
  setCallback(callback: (event: PickerEvent) => void): PickerBuilder;
  build(): Picker;
};
type PickerApi = {
  DocsView: new () => DocsView;
  DocsViewMode: { LIST: string };
  PickerBuilder: new () => PickerBuilder;
  Action: { PICKED: string; CANCEL: string };
};
type GoogleWindow = Window & {
  google?: { picker?: PickerApi };
  gapi?: { load(name: string, options: { callback(): void; onerror(): void; timeout: number; ontimeout(): void }): void };
};

let library: Promise<PickerApi> | undefined;

export function loadPicker(): Promise<PickerApi> {
  const browser = window as GoogleWindow;
  if (browser.google?.picker) return Promise.resolve(browser.google.picker);
  if (library) return library;
  library = new Promise<PickerApi>((resolve, reject) => {
    let script: HTMLScriptElement | undefined;
    let finished = false;
    const timer = window.setTimeout(fail, 15_000);
    function finish(api?: PickerApi) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (script) { script.onload = null; script.onerror = null; }
      if (api) resolve(api);
      else { script?.remove(); reject(new Error("Google Drive picker could not load. Please try again.")); }
    }
    function fail() { finish(); }
    function initialize() {
      if (finished) return;
      try {
        if (!browser.gapi) { fail(); return; }
        browser.gapi.load("picker", { callback: () => finish(browser.google?.picker), onerror: fail, timeout: 10_000, ontimeout: fail });
      } catch { fail(); }
    }
    if (browser.gapi) initialize();
    else {
      script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.onload = initialize;
      script.onerror = fail;
      document.head.append(script);
    }
  }).catch((error: unknown) => { library = undefined; throw error; });
  return library;
}

export function selectedNotebook(event: PickerEvent): NotebookSelection {
  const document = event.docs?.length === 1 ? event.docs[0] : undefined;
  if (!document || typeof document.id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(document.id)
    || typeof document.name !== "string" || document.name.length > 1024 || !/\.ipynb$/i.test(document.name)
    || document.mimeType === "application/vnd.google-apps.folder" || document.mimeType === "application/vnd.google-apps.shortcut") {
    throw new Error("Select a Jupyter notebook (.ipynb).");
  }
  return { id: document.id, name: document.name };
}

export async function pickNotebook(session: PickerSession, signal: AbortSignal): Promise<NotebookSelection | null> {
  const api = await loadPicker();
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let picker: Picker | undefined;
    let finished = false;
    const timer = window.setTimeout(() => finish(undefined, new Error("Google Drive session expired. Select the notebook again.")), Math.max(1, session.expires_in - 30) * 1000);
    function finish(selection?: NotebookSelection | null, error?: unknown) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      picker?.dispose();
      if (error) reject(error);
      else resolve(selection ?? null);
    }
    function cancel() { finish(null); }
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const view = new api.DocsView().setMode(api.DocsViewMode.LIST).setIncludeFolders(true).setSelectFolderEnabled(false);
      picker = new api.PickerBuilder().addView(view).setOAuthToken(session.access_token)
        .setDeveloperKey(session.api_key).setAppId(session.project_number).setOrigin(window.location.origin)
        .setTitle("Select a notebook (.ipynb)").setSize(Math.min(900, window.innerWidth - 24), Math.min(600, window.innerHeight - 24))
        .setCallback((event) => {
          if (event.action === api.Action.CANCEL) finish(null);
          else if (event.action === api.Action.PICKED) {
            try { finish(selectedNotebook(event)); } catch (error) { finish(undefined, error); }
          } else if (event.action === "error") finish(undefined, new Error("Google Drive picker failed. Please try again."));
        }).build();
      picker.setVisible(true);
    } catch { finish(undefined, new Error("Google Drive picker could not open. Please try again.")); }
  });
}