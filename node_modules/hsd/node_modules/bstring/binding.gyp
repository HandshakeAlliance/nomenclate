{
  "targets": [{
    "target_name": "bstring",
    "sources": [
      "./src/base58.cc",
      "./src/bech32.cc",
      "./src/cashaddr.cc",
      "./src/bstring.cc"
    ],
    "cflags": [
      "-Wall",
      "-Wno-implicit-fallthrough",
      "-Wno-maybe-uninitialized",
      "-Wno-uninitialized",
      "-Wno-unused-function",
      "-Wno-cast-function-type",
      "-Wno-deprecated-declarations",
      "-Wextra",
      "-O3"
    ],
    "cflags_c": [
      "-std=c99"
    ],
    "cflags_cc+": [
      "-std=c++0x"
    ],
    "xcode_settings": {
      "OTHER_CFLAGS": [
        "-Wno-deprecated-declarations"
      ]
    },
    "msvs_disabled_warnings": [4996],
    "include_dirs": [
      "<!(node -e \"require('nan')\")"
    ]
  }]
}
