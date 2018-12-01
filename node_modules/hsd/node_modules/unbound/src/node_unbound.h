#ifndef _NODE_UNBOUND_HH
#define _NODE_UNBOUND_HH

#include <node.h>
#include <nan.h>
#include <unbound.h>

class NodeUnbound : public Nan::ObjectWrap {
public:
  static NAN_METHOD(New);
  static void Init(v8::Local<v8::Object> &target);

  NodeUnbound();
  ~NodeUnbound();

  struct ub_ctx *ctx;

private:
  static NAN_METHOD(Version);
  static NAN_METHOD(SetOption);
  static NAN_METHOD(GetOption);
  static NAN_METHOD(SetConfig);
  static NAN_METHOD(SetForward);
  static NAN_METHOD(SetStub);
  static NAN_METHOD(SetResolvConf);
  static NAN_METHOD(SetHosts);
  static NAN_METHOD(AddTrustAnchor);
  static NAN_METHOD(AddTrustAnchorFile);
  static NAN_METHOD(AddTrustedKeys);
  static NAN_METHOD(AddZone);
  static NAN_METHOD(RemoveZone);
  static NAN_METHOD(AddData);
  static NAN_METHOD(RemoveData);
  static NAN_METHOD(Resolve);
};
#endif
