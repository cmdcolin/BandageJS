#!/bin/bash

# Bandage Layout JS Build Script
# Requires Emscripten SDK to be installed and activated

set -e

echo "=== Bandage Layout JS Build Script ==="
echo ""

# Auto-detect and source Emscripten if needed
if ! command -v emcc &> /dev/null; then
    echo "Emscripten not in PATH, attempting to activate..."

    # Try common emsdk locations
    EMSDK_PATHS=(
        "$HOME/emsdk/emsdk_env.sh"
        "/opt/emsdk/emsdk_env.sh"
        "/usr/local/emsdk/emsdk_env.sh"
    )

    EMSDK_FOUND=false
    for EMSDK_PATH in "${EMSDK_PATHS[@]}"; do
        if [ -f "$EMSDK_PATH" ]; then
            echo "Found Emscripten at: $EMSDK_PATH"
            source "$EMSDK_PATH"
            EMSDK_FOUND=true
            break
        fi
    done

    if [ "$EMSDK_FOUND" = false ]; then
        echo "ERROR: emcc (Emscripten compiler) not found!"
        echo "Please install and activate Emscripten SDK:"
        echo "  git clone https://github.com/emscripten-core/emsdk.git"
        echo "  cd emsdk"
        echo "  ./emsdk install latest"
        echo "  ./emsdk activate latest"
        echo "  source ./emsdk_env.sh"
        exit 1
    fi
fi

echo "✓ Emscripten found: $(emcc --version | head -n 1)"
echo ""

# Build OGDF first if not already built
OGDF_DIR="../thirdparty/ogdf"
OGDF_BUILD_DIR="${OGDF_DIR}/build-wasm"

if [ ! -f "${OGDF_BUILD_DIR}/libOGDF.a" ]; then
    echo "Building OGDF with Emscripten..."
    mkdir -p "${OGDF_BUILD_DIR}"
    cd "${OGDF_BUILD_DIR}"

    emcmake cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_SHARED_LIBS=OFF \
        -DOGDF_SEPARATE_TESTS=OFF

    emmake make -j$(nproc)
    cd -
    echo "✓ OGDF built successfully"
    echo ""
else
    echo "✓ OGDF already built"
    echo ""
fi

# Build Bandage Layout
echo "Building Bandage Layout..."
mkdir -p build
cd build

emcmake cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DOGDF_INCLUDE_DIR="${OGDF_DIR}/include" \
    -DOGDF_LIBRARY="${OGDF_BUILD_DIR}/libOGDF.a"

emmake make -j$(nproc)
cd ..

# Copy output files to js directory
echo ""
echo "Copying output files to js/ directory..."
mkdir -p js
cp build/bandage-layout.js js/
cp build/bandage-layout.wasm js/

echo ""
echo "=== Build Complete! ==="
echo "Output files:"
echo "  - js/bandage-layout.js"
echo "  - js/bandage-layout.wasm"
echo ""
echo "Total WASM size: $(du -h js/bandage-layout.wasm | cut -f1)"
echo ""
