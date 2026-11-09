#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(KeshAI, NSObject)
RCT_EXTERN_METHOD(availability:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(generate:(NSString *)system prompt:(NSString *)prompt schemaJSON:(NSString *)schemaJSON resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
