{
  "targets": [{
    "target_name": "unbound",
    "sources": [
      "./src/node_unbound.cc"
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
    ],
    "libraries": [
      "-lunbound"
    ]
  }]
}
