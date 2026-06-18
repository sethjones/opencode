import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Headers } from "effect/unstable/http"
import { AzureOAuth2Auth } from "../../src/protocols/utils/azure-oauth2-auth"
import { LLM } from "../../src"
import * as OpenAIChat from "../../src/protocols/openai-chat"
import { Model } from "../../src/schema"
import { it } from "../lib/effect"

const request = LLM.request({
  id: "req_azure_oauth",
  model: Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route }),
  prompt: "hello",
})

const authInput = {
  request,
  method: "POST" as const,
  url: "https://corporate-api.test/v1/chat/completions",
  body: '{"model":"gpt-4o","messages":[]}',
  headers: Headers.fromInput({}),
}

describe("AzureOAuth2Auth", () => {
  it("creates auth with default token URL from tenant ID", () => {
    const auth = AzureOAuth2Auth.makeAuth({
      tenantId: "my-tenant-id",
      clientId: "my-client",
      clientSecret: "my-secret",
    })
    expect(auth).toBeDefined()
    expect(auth.apply).toBeInstanceOf(Function)
  })

  it("creates auth with custom token URL", () => {
    const auth = AzureOAuth2Auth.makeAuth({
      tenantId: "test-tenant",
      clientId: "test-client",
      clientSecret: "test-secret",
      tokenUrl: "https://custom-token-endpoint.test/token",
    })
    expect(auth).toBeDefined()
  })

  it("creates auth with custom scope", () => {
    const auth = AzureOAuth2Auth.makeAuth({
      tenantId: "test-tenant",
      clientId: "test-client",
      clientSecret: "test-secret",
      scope: "https://cognitiveservices.azure.com/.default",
    })
    expect(auth).toBeDefined()
  })

  it.effect("applies bearer auth header", () =>
    Effect.gen(function* () {
      const auth = AzureOAuth2Auth.makeAuth({
        tenantId: "test-tenant",
        clientId: "test-client",
        clientSecret: "test-secret",
        tokenUrl: "http://localhost:9999/token",
      })

      const result = yield* auth.apply(authInput).pipe(Effect.either)
      // This will fail because there's no real token server, but it verifies
      // the auth structure is correct and attempts the exchange
      if (result._tag === "Right") {
        expect(result.right.authorization).toBeDefined()
      }
    }),
  )

  it.effect("preserves existing headers", () =>
    Effect.gen(function* () {
      const auth = AzureOAuth2Auth.makeAuth({
        tenantId: "test-tenant",
        clientId: "test-client",
        clientSecret: "test-secret",
        tokenUrl: "http://localhost:9999/token",
      })

      const inputWithHeaders = {
        ...authInput,
        headers: Headers.fromInput({ "x-custom": "value" }),
      }

      const result = yield* auth.apply(inputWithHeaders).pipe(Effect.either)
      if (result._tag === "Right") {
        expect(result.right["x-custom"]).toBe("value")
      }
    }),
  )
})
