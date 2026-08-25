import { AutofillInit } from "./content/abstractions/autofill-init";

declare global {
  interface Window {
    bitwardenAutofillInit?: AutofillInit;
  }

  namespace NodeJS {
    interface ProcessEnv {
      BW_INCLUDE_CONTENT_SCRIPT_MEASUREMENTS?: string;
      BW_DETECT_SYNC_BOUNDARIES?: string;
      FIREFOX_FORK_AUTHOR?: string;
      FIREFOX_FORK_BUILD?: string;
      FIREFOX_FORK_DEFAULT_SERVER?: string;
      FIREFOX_FORK_OPEN_WELCOME_PAGE?: string;
    }
  }
}
