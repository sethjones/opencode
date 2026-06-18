import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { LLM } from "../../src"
import { Auth, LLMClient } from "../../src/route"
import * as AzureOAuth from "../../src/providers/azure-oauth"
import { it } from "../lib/effect"

const commonOptions = {
  baseURL: "https://corporate-api.example.com/v1",
  tenantId: "my-tenant",
  clientId: "my-client",
  clientSecret: "my-secret",
}

describe("AzureOAuth provider", () => {
  it.effect("creates model with required options", () =>
    Effect.gen(function* () {
      const model = AzureOAuth.configure(commonOptions).model("gpt-4o")

      expect(model).toMatchObject({
        id: "gpt-4o",
        provider: "azure-oauth",
        route: { id: "azure-oauth-chat" },
      })
      expect(model.route.endpoint.baseURL).toBe("https://corporate-api.example.com/v1")
    }),
  )

  it.effect("creates model with custom token URL and scope", () =>
    Effect.gen(function* () {
      const model = AzureOAuth.configure({
        ...commonOptions,
        tokenUrl: "https://custom-token.test/token",
        scope: "https://cognitiveservices.azure.com/.default",
      }).model("gpt-4o")

      expect(model).toMatchObject({
        id: "gpt-4o",
        provider: "azure-oauth",
        route: { id: "azure-oauth-chat" },
      })
    }),
  )

  it.effect("prepares requests through the OpenAI Chat route", () =>
    Effect.gen(function* () {
      const model = AzureOAuth.route
        .with({
          provider: AzureOAuth.id,
          endpoint: { baseURL: "https://corporate-api.example.com/v1" },
          auth: Auth.passthrough,
        })
        .model({ id: "gpt-4o" })

      const prepared = yield* LLMClient.prepare(
        LLM.request({
          id: "req_azure_oauth_provider",
          model,
          prompt: "Say hello.",
        }),
      )

      expect(prepared.route).toBe("azure-oauth-chat")
      expect(prepared.body).toMatchObject({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Say hello." }],
        stream: true,
      })
    }),
  )
})
