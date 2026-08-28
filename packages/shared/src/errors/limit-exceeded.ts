import { Schema } from "effect";

export class LimitExceeded extends Schema.ErrorClass<LimitExceeded>("LimitExceeded")({
  _tag: Schema.tag("LimitExceeded"),
  limit: Schema.String, // la clave de LIMITS: "maxMessageCharacters"
  ceiling: Schema.Number,
  received: Schema.Number,
  message: Schema.String // en español, para la interfaz
}) {}

export class RateLimited extends Schema.ErrorClass<RateLimited>("RateLimited")({
  _tag: Schema.tag("RateLimited"),
  limit: Schema.String,
  retryAfterMs: Schema.Number,
  message: Schema.String
}) {}
