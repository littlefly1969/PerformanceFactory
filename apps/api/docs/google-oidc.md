# Google OIDC

Google is used only as an identity provider. The application remains the source
of truth for roles, activation, onboarding, consents, plans and all domain data.

Required environment variables:

```env
GOOGLE_OIDC_CLIENT_ID=""
GOOGLE_OIDC_CLIENT_SECRET=""
GOOGLE_OIDC_REDIRECT_URI="http://127.0.0.1:4000/api/auth/google/callback"
GOOGLE_OIDC_HOSTED_DOMAIN=""
WEB_LOGIN_SUCCESS_URL="http://127.0.0.1:3000/"
WEB_LOGIN_FAILURE_URL="http://127.0.0.1:3000/login"
```

Google Cloud authorized redirect URI:

```text
http://127.0.0.1:4000/api/auth/google/callback
```

Backend endpoints:

```text
GET /api/auth/google/login
GET /api/auth/google/register
GET /api/auth/google/callback
```

Security notes:

- The flow uses server-side OpenID Connect authorization code flow.
- `state`, `nonce` and PKCE `S256` are generated for each attempt.
- Google ID tokens are verified server-side with Google JWKS.
- Google access tokens are not stored.
- A separate `AuthIdentity` record stores provider, subject and verified email.
- Existing emails are not auto-linked. If the email already exists in the
  system with another authentication method, registration is blocked.
- New Google registrations create inactive athlete accounts, preserving admin activation.
