import { Observable } from "rxjs";

import { BottomNavigationButton } from "@bitwarden/components";
import { SafeInjectionToken } from "@bitwarden/ui-common";

/**
 * The Health tab's entry in the popup's bottom navigation, rendered between Send and Settings.
 *
 * The open source extension does not provide this token, so the Health tab remains hidden.
 */
export const HEALTH_TAB_NAV_BUTTON = new SafeInjectionToken<
  Observable<BottomNavigationButton | undefined>
>("HEALTH_TAB_NAV_BUTTON");
