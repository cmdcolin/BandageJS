cmake_minimum_required(VERSION 3.10)
project(bandage-layout-js)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Check if building with Emscripten
if(EMSCRIPTEN)
    message(STATUS "Building with Emscripten for WebAssembly")

    # Emscripten-specific flags
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -s WASM=1 -s ALLOW_MEMORY_GROWTH=1")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s MODULARIZE=1 -s EXPORT_ES6=1")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s EXPORT_NAME='createBandageLayoutModule'")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s ENVIRONMENT='web,worker'")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} --bind")

    # Disable exceptions if not needed (smaller binary)
    # set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fno-exceptions")
else()
    message(STATUS "Building native binary (not for web)")
endif()

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)
include_directories(${CMAKE_SOURCE_DIR}/../thirdparty/ogdf/include)
include_directories(${CMAKE_SOURCE_DIR}/../thirdparty/ogdf/build-wasm/include)

# OGDF library path (you'll need to build OGDF separately with Emscripten)
# For now, we assume OGDF is built and available
link_directories(${CMAKE_SOURCE_DIR}/../thirdparty/ogdf/build-wasm)

# Source files
set(SOURCES
    src/graphlayout.cpp
    src/bindings.cpp
)

# Create executable/library
if(EMSCRIPTEN)
    add_executable(bandage-layout ${SOURCES})
    target_link_libraries(bandage-layout OGDF)

    # Set output to js folder
    set_target_properties(bandage-layout PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/build"
        SUFFIX ".js"
    )
else()
    add_library(bandage-layout STATIC ${SOURCES})
    target_link_libraries(bandage-layout OGDF)
endif()

# Installation
install(TARGETS bandage-layout
        RUNTIME DESTINATION ${CMAKE_SOURCE_DIR}/js
        LIBRARY DESTINATION ${CMAKE_SOURCE_DIR}/js
        ARCHIVE DESTINATION ${CMAKE_SOURCE_DIR}/js)
