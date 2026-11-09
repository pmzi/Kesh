import Foundation
import React
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Bridge to Apple's on-device FoundationModels (iOS 26+). Every FoundationModels
/// symbol is behind canImport + @available so the app still builds and runs on iOS 15.1+.
@objc(KeshAI)
class KeshAI: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(availability:rejecter:)
  func availability(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(KeshAI.currentAvailability())
  }

  @objc(generate:prompt:schemaJSON:resolver:rejecter:)
  func generate(
    _ system: String?,
    prompt: String,
    schemaJSON: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      Task {
        do {
          resolve(try await KeshAI.run(system: system, prompt: prompt, schemaJSON: schemaJSON))
        } catch {
          reject("E_AI", KeshAI.readable(error), nil)
        }
      }
      return
    }
    #endif
    reject("E_AI", "On-device AI requires iOS 26.", nil)
  }

  static func currentAvailability() -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      switch SystemLanguageModel.default.availability {
      case .available:
        return ["available": true]
      case .unavailable(let why):
        switch why {
        case .deviceNotEligible:
          return ["available": false, "reason": "This device does not support Apple Intelligence"]
        case .appleIntelligenceNotEnabled:
          return ["available": false, "reason": "Apple Intelligence is not enabled"]
        case .modelNotReady:
          return ["available": false, "reason": "The on-device model is still downloading"]
        @unknown default:
          return ["available": false, "reason": "The on-device model is unavailable"]
        }
      }
    }
    return ["available": false, "reason": "Requires iOS 26"]
    #else
    return ["available": false, "reason": "Requires iOS 26"]
    #endif
  }

  #if canImport(FoundationModels)
  @available(iOS 26.0, *)
  static func run(system: String?, prompt: String, schemaJSON: String?) async throws -> String {
    guard case .available = SystemLanguageModel.default.availability else {
      throw KeshAIError.message((currentAvailability()["reason"] as? String) ?? "The on-device model is unavailable")
    }
    let session: LanguageModelSession
    if let system = system, !system.isEmpty {
      session = LanguageModelSession(instructions: system)
    } else {
      session = LanguageModelSession()
    }
    guard let schemaJSON = schemaJSON else {
      return try await session.respond(to: prompt).content
    }
    let schema = try buildSchema(schemaJSON)
    let r = try await session.respond(to: prompt, schema: schema)
    return r.content.jsonString
  }

  /// AiSchema subset: object of string | string[] properties (descriptions, minItems/maxItems).
  @available(iOS 26.0, *)
  static func buildSchema(_ json: String) throws -> GenerationSchema {
    guard let data = json.data(using: .utf8),
          let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let props = root["properties"] as? [String: [String: Any]]
    else { throw KeshAIError.message("Invalid schema") }
    let required = Set((root["required"] as? [String]) ?? [])
    var properties: [DynamicGenerationSchema.Property] = []
    for name in props.keys.sorted() {
      let p = props[name]!
      let desc = p["description"] as? String
      let inner: DynamicGenerationSchema
      switch p["type"] as? String {
      case "string":
        inner = DynamicGenerationSchema(type: String.self)
      case "array":
        let item = DynamicGenerationSchema(type: String.self)
        inner = DynamicGenerationSchema(
          arrayOf: item,
          minimumElements: p["minItems"] as? Int,
          maximumElements: p["maxItems"] as? Int
        )
      default:
        throw KeshAIError.message("Unsupported schema type for \"\(name)\"")
      }
      properties.append(.init(name: name, description: desc, schema: inner, isOptional: !required.contains(name)))
    }
    let obj = DynamicGenerationSchema(name: "Result", description: nil, properties: properties)
    return try GenerationSchema(root: obj, dependencies: [])
  }
  #endif

  static func readable(_ error: Error) -> String {
    if case KeshAIError.message(let m) = error { return m }
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *), let e = error as? LanguageModelSession.GenerationError {
      switch e {
      case .guardrailViolation: return "Apple's on-device model declined this request (safety guardrails)"
      case .exceededContextWindowSize: return "The prompt is too long for the on-device model"
      case .unsupportedLanguageOrLocale: return "The on-device model does not support this language"
      case .assetsUnavailable: return "The on-device model is not available right now"
      default: return "The on-device model could not complete the request"
      }
    }
    #endif
    return "The on-device model failed"
  }
}

enum KeshAIError: Error { case message(String) }
