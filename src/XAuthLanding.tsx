import { IconLogoX } from "./icons";
import { apiOrigin, apiUrlAbsolute } from "./api/base";

const ENTERED_KEY = "ifixedx_app_entered";

export function clearLandingPreference(): void {
  sessionStorage.removeItem(ENTERED_KEY);
}

type Props = {
  apiReachable: boolean | null;
  oauthClientConfigured: boolean | null;
  onContinue: () => void;
  authError?: string | null;
  onDismissAuthError?: () => void;
};

export function XAuthLanding({
  apiReachable,
  oauthClientConfigured,
  onContinue,
  authError,
  onDismissAuthError
}: Props) {
  const apiOk = apiReachable === true;

  function signInWithX(): void {
    window.location.href = apiUrlAbsolute("/api/auth/x/login");
  }

  return (
    <div className="ifix-landing">
      <div className="ifix-landing-grid">
        <div className="ifix-landing-visual" aria-hidden>
          <div className="ifix-landing-logo">
            <IconLogoX />
          </div>
          <span className="ifix-landing-mark">iFixedX</span>
        </div>

        <div className="ifix-landing-panel">
          {authError ? (
            <div className="ifix-landing-toast" role="alert">
              <span>{authError}</span>
              {onDismissAuthError ? (
                <button type="button" className="ifix-landing-toast-dismiss" onClick={onDismissAuthError}>
                  Dismiss
                </button>
              ) : null}
            </div>
          ) : null}
          <h1 className="ifix-landing-h1">Happening now</h1>
          <p className="ifix-landing-lead">Join iFixedX today.</p>
          <p className="ifix-landing-sub">
            Same idea as X — one primary path: sign in with your account so we can fetch real Recent Search posts
            through the official API. Prefer to poke around first? Continue without signing in (mock corpus only).
          </p>

          {!apiOk ? (
            <p className="ifix-landing-warn">
              Start the{" "}
              <strong>
                <code>iFixedX</code> API
              </strong>{" "}
              {apiOrigin()
                ? `(expected at ${apiOrigin()})`
                : "(npm run dev proxies /api to localhost:3847)"}{" "}
              so OAuth and search can run.
            </p>
          ) : null}

          {oauthClientConfigured === false ? (
            <p className="ifix-landing-warn">
              Add <code>TWITTER_CLIENT_ID</code> and a callback URL in the developer portal — see{" "}
              <code>.env.example</code>.
            </p>
          ) : null}

          <button
            type="button"
            className="ifix-landing-btn ifix-landing-btn--primary"
            onClick={signInWithX}
            disabled={!apiOk || oauthClientConfigured === false}
            title={
              !apiOk
                ? "API not ready"
                : oauthClientConfigured === false
                  ? "Configure OAuth client ID"
                  : "Open X OAuth"
            }
          >
            Sign in with X
          </button>

          <div className="ifix-landing-or" aria-hidden>
            <span className="ifix-landing-or-line" />
            <span className="ifix-landing-or-text">or</span>
            <span className="ifix-landing-or-line" />
          </div>

          <button
            type="button"
            className="ifix-landing-btn ifix-landing-btn--outline"
            onClick={onContinue}
            disabled={!apiOk}
          >
            Continue without signing in
          </button>
          {!apiOk ? (
            <p className="ifix-landing-hint ifix-landing-hint--muted">
              {apiOrigin()
                ? `The UI needs the API host in your build (VITE_PUBLIC_API_ORIGIN=${apiOrigin()}).`
                : "Mocks and UI need the API proxy on port 3847 (npm run dev)."}
            </p>
          ) : (
            <p className="ifix-landing-hint ifix-landing-hint--muted">
              Offline mock corpus works immediately; live search stays available after you sign in (or configure a
              bearer token).
            </p>
          )}

          <p><a href="?page=trott">Explore TROTT — The Rest Of The Thread →</a></p>
          <p className="ifix-landing-disclaimer">
            Independent demo UI — not affiliated with X Corp. Search uses documented API tokens only on your machine.
          </p>
        </div>
      </div>
    </div>
  );
}

export { ENTERED_KEY };
