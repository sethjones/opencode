import { Route, type RouteDefaultsInput } from "../route/client"
import { Endpoint } from "../route/endpoint"
import { Framing } from "../route/framing"
import { ProviderID, type ModelID } from "../schema"
import * as OpenAIChat from "../protocols/openai-chat"
import { AzureOAuth2Auth } from "../protocols/utils/azure-oauth2-auth"

export const id = ProviderID.make("azure-oauth")

export type Options = RouteDefaultsInput & {
  /** Azure AD tenant ID */
  readonly tenantId: string
  /** Azure AD application (client) ID */
  readonly clientId: string
  /** Azure AD client secret */
  readonly clientSecret: string
  /** Corporate OpenAI-compatible API base URL */
  readonly baseURL: string
  /** Custom token endpoint (defaults to login.microsoftonline.com) */
  readonly tokenUrl?: string
  /** OAuth2 scope (defaults to https://graph.microsoft.com/.default) */
  readonly scope?: string
}

const baseRoute = Route.make({
  id: "azure-oauth-chat",
  provider: id,
  protocol: OpenAIChat.protocol,
  endpoint: Endpoint.path("/chat/completions"),
  framing: Framing.sse,
})

export const route = baseRoute

export const routes = [route]

const auth = (input: Options) =>
  AzureOAuth2Auth.makeAuth({
    tenantId: input.tenantId,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    tokenUrl: input.tokenUrl,
    scope: input.scope,
  })

const defaults = (input: Options) => {
  const {
    tenantId: _tenantId,
    clientId: _clientId,
    clientSecret: _clientSecret,
    tokenUrl: _tokenUrl,
    scope: _scope,
    baseURL: _baseURL,
    ...rest
  } = input
  return rest
}

const configuredRoute = (input: Options) =>
  baseRoute.with({
    ...defaults(input),
    auth: auth(input),
    endpoint: { baseURL: input.baseURL },
  })

export const configure = (input: Options) => {
  const route = configuredRoute(input)
  return {
    id,
    model: (modelID: string | ModelID) => route.model({ id: modelID }),
    configure,
  }
}
