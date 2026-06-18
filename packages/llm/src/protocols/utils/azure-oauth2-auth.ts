import { Config, Effect, Redacted, Schema } from "effect"
import { Headers, HttpClientRequest } from "effect/unstable/http"
import { Auth, type AuthInput } from "../../route/auth"
import { ProviderShared } from "../shared"

interface CachedToken {
  readonly accessToken: string
  readonly expiresAt: number
}

const cache = new Map<string, CachedToken>()

interface TokenResponse {
  readonly access_token: string
  readonly expires_in: number
}

const TokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  expires_in: Schema.Number,
})

type ClientSecret = string | Redacted.Redacted | Config.Config<string | Redacted.Redacted>

function resolveSecret(secret: ClientSecret): Effect.Effect<string, Config.ConfigError> {
  if (typeof secret === "string") return Effect.succeed(secret)
  if (Redacted.isRedacted(secret)) return Effect.succeed(Redacted.value(secret))
  return secret.pipe(
    Effect.map((value) => (Redacted.isRedacted(value) ? Redacted.value(value) : value)),
  )
}

function cacheKey(tenantId: string, clientId: string): string {
  return `${tenantId}:${clientId}`
}

function tokenUrlFromTenant(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
}

const exchangeToken = Effect.fn("AzureOAuth2Auth.exchangeToken")(function* (
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  scope: string,
) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  })

  const request = HttpClientRequest.post(tokenUrl).pipe(
    HttpClientRequest.bodyText(body.toString(), "application/x-www-form-urlencoded"),
  )

  const response = yield* HttpClientRequest.toWeb(request).pipe(
    Effect.flatMap((web) => fetch(web)),
    Effect.flatMap((res) => {
      if (!res.ok) {
        return Effect.fail(
          ProviderShared.invalidRequest(
            `Azure OAuth2 token exchange failed: HTTP ${res.status} ${res.statusText}`,
          ),
        )
      }
      return Effect.succeed(res)
    }),
  )

  const text = yield* Effect.promise(() => response.text())
  const parsed = yield* Effect.try({
    try: () => JSON.parse(text) as TokenResponse,
    catch: () => ProviderShared.invalidRequest(`Azure OAuth2 token response is not valid JSON`),
  })

  if (!parsed.access_token) {
    return yield* ProviderShared.invalidRequest("Azure OAuth2 token response missing access_token")
  }

  const expiresAt = Date.now() + (parsed.expires_in * 1000) - 300_000
  return { accessToken: parsed.access_token, expiresAt }
})

export interface Options {
  readonly tenantId: string
  readonly clientId: string
  readonly clientSecret: ClientSecret
  readonly tokenUrl?: string
  readonly scope?: string
}

export function makeAuth(options: Options): Auth {
  const key = cacheKey(options.tenantId, options.clientId)
  const resolvedTokenUrl = options.tokenUrl ?? tokenUrlFromTenant(options.tenantId)
  const resolvedScope = options.scope ?? "https://graph.microsoft.com/.default"

  return Auth.custom((input: AuthInput) =>
    Effect.gen(function* () {
      const secret = yield* resolveSecret(options.clientSecret)

      const cached = cache.get(key)
      if (cached && cached.expiresAt > Date.now()) {
        return Headers.set(input.headers, "authorization", `Bearer ${cached.accessToken}`)
      }

      const token = yield* exchangeToken(resolvedTokenUrl, options.clientId, secret, resolvedScope)
      cache.set(key, token)

      return Headers.set(input.headers, "authorization", `Bearer ${token.accessToken}`)
    }),
  )
}

export * as AzureOAuth2Auth from "./azure-oauth2-auth"
