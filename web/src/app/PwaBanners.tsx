import { applyUpdate, dismissIosHint, dismissUpdate, usePwaState } from './pwa';
import { t } from './strings';

/** Install/update prompts: a "new version" banner (user decides when to reload) and the iOS install hint. */
export function PwaBanners() {
  const pwa = usePwaState();
  return (
    <>
      {pwa.needRefresh && (
        <div className="banner" role="status" data-testid="update-banner">
          <span>{t.updateAvailable}</span>
          <span className="banner-actions">
            <button type="button" className="btn btn-small btn-primary" onClick={applyUpdate} data-testid="update-now">
              {t.updateNow}
            </button>
            <button type="button" className="btn btn-small" onClick={dismissUpdate}>
              {t.later}
            </button>
          </span>
        </div>
      )}
      {pwa.iosHint && (
        <div className="banner" role="note" data-testid="ios-hint">
          <span>{t.iosHint}</span>
          <span className="banner-actions">
            <button type="button" className="btn btn-small" onClick={dismissIosHint} data-testid="ios-hint-dismiss">
              {t.dismiss}
            </button>
          </span>
        </div>
      )}
    </>
  );
}
