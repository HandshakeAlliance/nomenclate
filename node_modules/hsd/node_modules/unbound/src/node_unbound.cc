#include <unbound.h>
#include "node_unbound.h"

static const char *
nu_strerror(int err) {
  const char *msg = ub_strerror(err);

  if (!msg)
    msg = "unknown error";

  size_t size = strlen(msg);

  if (size > 256)
    msg = "unknown error";

  static char errmsg[12 + 256 + 1];

  sprintf(&errmsg[0], "libunbound: %s", msg);

  return errmsg;
}

static Nan::Persistent<v8::FunctionTemplate> unbound_constructor;

NodeUnbound::NodeUnbound() {
  ctx = NULL;
}

NodeUnbound::~NodeUnbound() {
  if (ctx) {
    ub_ctx_delete(ctx);
    ctx = NULL;
  }
}

void
NodeUnbound::Init(v8::Local<v8::Object> &target) {
  Nan::HandleScope scope;

  v8::Local<v8::FunctionTemplate> tpl =
    Nan::New<v8::FunctionTemplate>(NodeUnbound::New);

  unbound_constructor.Reset(tpl);

  tpl->SetClassName(Nan::New("NodeUnbound").ToLocalChecked());
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  Nan::SetMethod(tpl, "version", NodeUnbound::Version);
  Nan::SetPrototypeMethod(tpl, "setOption", NodeUnbound::SetOption);
  Nan::SetPrototypeMethod(tpl, "getOption", NodeUnbound::GetOption);
  Nan::SetPrototypeMethod(tpl, "setConfig", NodeUnbound::SetConfig);
  Nan::SetPrototypeMethod(tpl, "setForward", NodeUnbound::SetForward);
  Nan::SetPrototypeMethod(tpl, "setStub", NodeUnbound::SetStub);
  Nan::SetPrototypeMethod(tpl, "setResolvConf", NodeUnbound::SetResolvConf);
  Nan::SetPrototypeMethod(tpl, "setHosts", NodeUnbound::SetHosts);
  Nan::SetPrototypeMethod(tpl, "addTrustAnchor", NodeUnbound::AddTrustAnchor);
  Nan::SetPrototypeMethod(tpl, "addTrustAnchorFile",
    NodeUnbound::AddTrustAnchorFile);
  Nan::SetPrototypeMethod(tpl, "addTrustedKeys", NodeUnbound::AddTrustedKeys);
  Nan::SetPrototypeMethod(tpl, "addZone", NodeUnbound::AddZone);
  Nan::SetPrototypeMethod(tpl, "removeZone", NodeUnbound::RemoveZone);
  Nan::SetPrototypeMethod(tpl, "addData", NodeUnbound::AddData);
  Nan::SetPrototypeMethod(tpl, "removeData", NodeUnbound::RemoveData);
  Nan::SetPrototypeMethod(tpl, "resolve", NodeUnbound::Resolve);

  v8::Local<v8::FunctionTemplate> ctor =
    Nan::New<v8::FunctionTemplate>(unbound_constructor);

  target->Set(Nan::New("NodeUnbound").ToLocalChecked(), ctor->GetFunction());
}

NAN_METHOD(NodeUnbound::Version) {
  if (info.Length() != 0)
    return Nan::ThrowError("unbound.version() requires no arguments.");

  const char *version = ub_version();

  info.GetReturnValue().Set(Nan::New<v8::String>(version).ToLocalChecked());
}

NAN_METHOD(NodeUnbound::New) {
  if (!info.IsConstructCall())
    return Nan::ThrowError("Could not create Unbound instance.");

  NodeUnbound *ub = new NodeUnbound();
  ub->Wrap(info.This());

  ub->ctx = ub_ctx_create();

  if (!ub->ctx)
    return Nan::ThrowError("Could not create Unbound instance.");

  int err = ub_ctx_debugout(ub->ctx, NULL);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  err = ub_ctx_debuglevel(ub->ctx, 0);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::SetOption) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 2)
    return Nan::ThrowError("unbound.setOption() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  if (!info[1]->IsString())
    return Nan::ThrowTypeError("Second argument must be a string.");

  Nan::Utf8String opt_(info[0]);
  const char *opt = (const char *)*opt_;

  Nan::Utf8String value_(info[1]);
  const char *value = (const char *)*value_;

  int err = ub_ctx_set_option(ub->ctx, opt, value);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::GetOption) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 1)
    return Nan::ThrowError("unbound.getOption() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  Nan::Utf8String opt_(info[0]);
  const char *opt = (const char *)*opt_;

  char *value;
  int err = ub_ctx_get_option(ub->ctx, opt, &value);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  if (value == NULL) {
    info.GetReturnValue().Set(Nan::Null());
    return;
  }

  info.GetReturnValue().Set(Nan::New<v8::String>(value).ToLocalChecked());

  free(value);
}

NAN_METHOD(NodeUnbound::SetConfig) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 1)
    return Nan::ThrowError("unbound.setConfig() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  Nan::Utf8String fname_(info[0]);
  const char *fname = (const char *)*fname_;

  int err = ub_ctx_config(ub->ctx, fname);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::SetForward) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 1)
    return Nan::ThrowError("unbound.setForward() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  Nan::Utf8String addr_(info[0]);
  const char *addr = (const char *)*addr_;

  int err = ub_ctx_set_fwd(ub->ctx, addr);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::SetStub) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 3)
    return Nan::ThrowError("unbound.setStub() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  if (!info[1]->IsString())
    return Nan::ThrowTypeError("Second argument must be a string.");

  if (!info[2]->IsBoolean())
    return Nan::ThrowTypeError("Third argument must be a boolean.");

  Nan::Utf8String zone_(info[0]);
  const char *zone = (const char *)*zone_;

  Nan::Utf8String addr_(info[1]);
  const char *addr = (const char *)*addr_;

  bool isprime = Nan::To<bool>(info[2]).FromJust();

  int err = ub_ctx_set_stub(ub->ctx, zone, addr, (int)isprime);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::SetResolvConf) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 1)
    return Nan::ThrowError("unbound.setResolvConf() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  Nan::Utf8String fname_(info[0]);
  const char *fname = (const char *)*fname_;

  int err = ub_ctx_resolvconf(ub->ctx, fname);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::SetHosts) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 1)
    return Nan::ThrowError("unbound.setHosts() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  Nan::Utf8String fname_(info[0]);
  const char *fname = (const char *)*fname_;

  int err = ub_ctx_hosts(ub->ctx, fname);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::AddTrustAnchor) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 1)
    return Nan::ThrowError("unbound.addTrustAnchor() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  Nan::Utf8String ta_(info[0]);
  const char *ta = (const char *)*ta_;

  int err = ub_ctx_add_ta(ub->ctx, ta);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::AddTrustAnchorFile) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 2)
    return Nan::ThrowError("unbound.addTrustAnchorFile() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  if (!info[1]->IsBoolean())
    return Nan::ThrowTypeError("Second argument must be a boolean.");

  Nan::Utf8String fname_(info[0]);
  const char *fname = (const char *)*fname_;

  bool autr = Nan::To<bool>(info[2]).FromJust();

  int err;

  if (autr)
    err = ub_ctx_add_ta_autr(ub->ctx, fname);
  else
    err = ub_ctx_add_ta_file(ub->ctx, fname);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::AddTrustedKeys) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 1)
    return Nan::ThrowError("unbound.addTrustedKeys() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  Nan::Utf8String fname_(info[0]);
  const char *fname = (const char *)*fname_;

  int err = ub_ctx_trustedkeys(ub->ctx, fname);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::AddZone) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 2)
    return Nan::ThrowError("unbound.addZone() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  if (!info[1]->IsString())
    return Nan::ThrowTypeError("Second argument must be a string.");

  Nan::Utf8String zone_name_(info[0]);
  const char *zone_name = (const char *)*zone_name_;

  Nan::Utf8String zone_type_(info[1]);
  const char *zone_type = (const char *)*zone_type_;

  int err = ub_ctx_zone_add(ub->ctx, zone_name, zone_type);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::RemoveZone) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 1)
    return Nan::ThrowError("unbound.removeZone() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  Nan::Utf8String zone_name_(info[0]);
  const char *zone_name = (const char *)*zone_name_;

  int err = ub_ctx_zone_remove(ub->ctx, zone_name);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::AddData) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 1)
    return Nan::ThrowError("unbound.addData() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  Nan::Utf8String data_(info[0]);
  const char *data = (const char *)*data_;

  int err = ub_ctx_data_add(ub->ctx, data);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

NAN_METHOD(NodeUnbound::RemoveData) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 1)
    return Nan::ThrowError("unbound.removeData() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  Nan::Utf8String data_(info[0]);
  const char *data = (const char *)*data_;

  int err = ub_ctx_data_remove(ub->ctx, data);

  if (err != 0)
    return Nan::ThrowError(nu_strerror(err));

  info.GetReturnValue().Set(info.This());
}

class NodeUnboundWorker : public Nan::AsyncWorker {
public:
  NodeUnboundWorker (
    struct ub_ctx *ctx,
    char *name,
    int rrtype,
    int rrclass,
    Nan::Callback *callback
  );

  virtual ~NodeUnboundWorker();
  virtual void Execute();
  void HandleOKCallback();

private:
  struct ub_ctx *ctx;
  char *name;
  int rrtype;
  int rrclass;
  struct ub_result *result;
};

NodeUnboundWorker::NodeUnboundWorker (
  struct ub_ctx *ctx,
  char *name,
  int rrtype,
  int rrclass,
  Nan::Callback *callback
) : Nan::AsyncWorker(callback)
  , ctx(ctx)
  , name(name)
  , rrtype(rrtype)
  , rrclass(rrclass)
  , result(NULL)
{
  Nan::HandleScope scope;
}

NodeUnboundWorker::~NodeUnboundWorker() {
  if (name) {
    free(name);
    name = NULL;
  }

  if (result) {
    ub_resolve_free(result);
    result = NULL;
  }
}

void
NodeUnboundWorker::Execute() {
  int err = ub_resolve(ctx, name, rrtype, rrclass, &result);

  if (err != 0)
    SetErrorMessage(nu_strerror(err));
}

void
NodeUnboundWorker::HandleOKCallback() {
  Nan::HandleScope scope;

  assert(result);

  uint8_t *pkt = (uint8_t *)result->answer_packet;
  size_t pkt_len = result->answer_len;

  v8::Local<v8::Array> ret = Nan::New<v8::Array>();

  ret->Set(0, Nan::CopyBuffer((char *)pkt, pkt_len).ToLocalChecked());
  ret->Set(1, Nan::New<v8::Boolean>((bool)result->secure));
  ret->Set(2, Nan::New<v8::Boolean>((bool)result->bogus));

  if (result->bogus && result->why_bogus)
    ret->Set(3, Nan::New<v8::String>(result->why_bogus).ToLocalChecked());
  else
    ret->Set(3, Nan::Null());

  ub_resolve_free(result);
  result = NULL;

  v8::Local<v8::Value> argv[] = { Nan::Null(), ret };

  callback->Call(2, argv, async_resource);
}

NAN_METHOD(NodeUnbound::Resolve) {
  NodeUnbound *ub = ObjectWrap::Unwrap<NodeUnbound>(info.Holder());

  if (info.Length() != 4)
    return Nan::ThrowError("unbound.resolve() requires arguments.");

  if (!info[0]->IsString())
    return Nan::ThrowTypeError("First argument must be a string.");

  if (!info[1]->IsNumber())
    return Nan::ThrowTypeError("Second argument must be a number.");

  if (!info[2]->IsNumber())
    return Nan::ThrowTypeError("Third argument must be a number.");

  if (!info[3]->IsFunction())
    return Nan::ThrowTypeError("Fourth argument must be a function.");

  Nan::Utf8String name_(info[0]);
  const char *name = (const char *)*name_;

  uint32_t rrtype = Nan::To<uint32_t>(info[1]).FromJust();
  uint32_t rrclass = Nan::To<uint32_t>(info[2]).FromJust();

  v8::Local<v8::Function> callback = info[3].As<v8::Function>();

  char *qname = strdup(name);

  if (!qname)
    return Nan::ThrowTypeError("Could not allocate memory.");

  NodeUnboundWorker *worker = new NodeUnboundWorker(
    ub->ctx,
    qname,
    (int)rrtype,
    (int)rrclass,
    new Nan::Callback(callback)
  );

  v8::Local<v8::Object> _this = info.This();
  worker->SaveToPersistent("unbound", _this);

  Nan::AsyncQueueWorker(worker);

  info.GetReturnValue().Set(info.This());
}

NAN_MODULE_INIT(init) {
  NodeUnbound::Init(target);
}

NODE_MODULE(unbound, init)
