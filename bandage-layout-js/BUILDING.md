# Building Bandage Layout JS

This document describes how to build the WebAssembly version of Bandage Layout.

## Prerequisites

1. **Emscripten SDK** (Latest version recommended)
   ```bash
   # Install Emscripten
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh
   ```

2. **CMake** (3.10 or higher)
   ```bash
   # Ubuntu/Debian
   sudo apt-get install cmake

   # macOS
   brew install cmake
   ```

3. **Build essentials**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install build-essential

   # macOS (install Xcode Command Line Tools)
   xcode-select --install
   ```

## Build Steps

### 1. Clone the Repository

If you haven't already:
```bash
cd /path/to/BandageNG
# bandage-layout-js folder should already exist
```

### 2. Activate Emscripten

Before building, make sure Emscripten is activated:
```bash
source /path/to/emsdk/emsdk_env.sh
```

Verify it's working:
```bash
emcc --version
```

### 3. Build OGDF Library

The build script will automatically build OGDF with Emscripten if not already built:
```bash
cd bandage-layout-js
./build.sh
```

This will:
1. Build OGDF with Emscripten → `../thirdparty/ogdf/build-wasm/`
2. Build Bandage Layout → `build/`
3. Copy outputs to `js/` directory

### 4. Build Outputs

After successful build, you should have:
```
bandage-layout-js/
├── js/
│   ├── bandage-layout.js          # Emscripten JS glue code
│   ├── bandage-layout.wasm        # WebAssembly binary
│   ├── bandage-layout-wrapper.js  # High-level JS API
│   ├── bandage-layout.worker.js   # Web Worker implementation
│   └── bandage-layout-worker-interface.js
└── build/
    └── ... (build artifacts)
```

## Build Configuration

### Release Build (Default)
```bash
./build.sh
```

### Debug Build

For debugging with source maps:
```bash
# Edit build.sh and change:
# -DCMAKE_BUILD_TYPE=Release
# to:
# -DCMAKE_BUILD_TYPE=Debug

# Also add to Emscripten flags:
# -g4 --source-map-base http://localhost:8080/
```

### Optimization Levels

The build uses `-O3` by default for maximum performance. You can adjust in `CMakeLists.txt`:

- `-O0` - No optimization (faster compilation, slower execution)
- `-O1` - Basic optimization
- `-O2` - More optimization
- `-O3` - Maximum optimization (default)
- `-Oz` - Optimize for size

## Troubleshooting

### "emcc: command not found"

Make sure Emscripten is activated:
```bash
source /path/to/emsdk/emsdk_env.sh
```

### OGDF build fails

Make sure you have the OGDF submodule:
```bash
cd /path/to/BandageNG
git submodule update --init --recursive
```

### Large WASM file size

The default build produces ~2-4MB WASM file (gzipped ~500KB-1MB). To reduce size:

1. Use `-Oz` optimization
2. Disable exceptions: add `-fno-exceptions` to CMakeLists.txt
3. Strip debug info: add `--strip-all`

### Memory issues

If you get memory errors at runtime, increase WASM memory:
```javascript
// In CMakeLists.txt, add:
-s INITIAL_MEMORY=64MB
-s MAXIMUM_MEMORY=512MB
```

## Testing the Build

### 1. Test in Browser

Start a local server:
```bash
cd bandage-layout-js
python3 -m http.server 8080
```

Open `http://localhost:8080/examples/basic-usage.html`

### 2. Test in Node.js

```bash
node examples/node-example.js
```

## Performance Benchmarks

Expected build times:
- OGDF (first time): 5-15 minutes
- Bandage Layout: 1-2 minutes
- Total (clean build): 6-17 minutes
- Incremental rebuild: <1 minute

Expected WASM performance:
- ~90-95% of native C++ speed
- Small graphs (<1000 nodes): <100ms
- Large graphs (10000+ nodes): 5-30s

## Continuous Integration

For CI/CD, use the provided Docker image (coming soon) or:

```bash
# Install Emscripten in CI
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

# Build
cd /path/to/bandage-layout-js
./build.sh
```

## Advanced: Custom OGDF Configuration

To customize OGDF build:

```bash
cd ../thirdparty/ogdf/build-wasm
emcmake cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DOGDF_SEPARATE_TESTS=OFF \
    -DOGDF_MEMORY_MANAGER=POOL_TS  # Or other memory manager

emmake make -j$(nproc)
```

## Next Steps

After building, see:
- [README.md](README.md) - Usage documentation
- [examples/](examples/) - Example code
- [API Documentation](API.md) - Detailed API reference (coming soon)
