// include/strata/quant/dot.hpp - one weight row times one quantized activation row, own-stack phase 2.
//
// The contract (isa.hpp): `dot_kernel(w, a, isa)->fn` returns the bits ggml-cpu's `vec_dot` of flavour `a` returns for the same row pair.
// `dot_ref` is the Generic scalar reference of every format.  A kernel is only returned when the CPU can run it.
#pragma once

#include <cstddef>
#include <cstdint>

#include "strata/quant/isa.hpp"
#include "strata/quant/types.hpp"

namespace strata::quant {

/// *s = dot(weight row w of n elements, activation row a of n elements).  n is a whole number of the weight type's blocks (and of the
/// activation type's: 32 for the 32-element formats, 256 for Q8_K).  The activation format is `TypeInfo::act` of the weight type.
using DotFn = void (*)(int n, float* s, const void* w, const void* a);

struct DotKernel {
    DotFn fn = nullptr;
    Type weight = Type::F32;
    Type act = Type::Q8_0;
    Arith arith = Arith::Generic;
    Isa isa = Isa::Scalar;
    const char* name = "";
};

/// The best kernel of contract `a` for weight type `w` that runs on a CPU of level `max_isa` (the second form: this CPU), or nullptr.
const DotKernel* dot_kernel(Type w, Arith a, Isa max_isa) noexcept;
const DotKernel* dot_kernel(Type w, Arith a) noexcept;

/// Every kernel the layer has for (w, a), best first, whether or not this CPU can run it (tests, benches, the oracle tool).
int dot_kernels(Type w, Arith a, const DotKernel** out, int cap) noexcept;

/// The Generic scalar reference.  Aborts for a type without one.
void dot_ref(Type w, int n, float* s, const void* wrow, const void* act);

/// s[r] = dot(weight row w, activation row a[r]) for r < rows: each the bits dot_kernel(w, contract)->fn gives for
/// that pair, with the weight row's blocks decoded once for all the rows.  nullptr where the layer has no such kernel
/// for (w, contract) on this CPU: the caller then calls the one-row kernel rows times.
using DotRowsFn = void (*)(int n, int rows, float* s, const void* w, const void* const* a);
DotRowsFn dot_rows_kernel(Type w, Arith a) noexcept;

/// Compute 4 consecutive weight rows (stride row_bytes) against 1 shared activation row.
using DotX4Fn = void (*)(int n, float out[4], const void* w_base, size_t row_bytes, const void* a);

struct DotX4Kernel {
    DotX4Fn fn = nullptr;
    Type weight = Type::F32;
    Type act = Type::Q8_0;
    Arith arith = Arith::Generic;
    Isa isa = Isa::Scalar;
    const char* name = "";
};

/// The best 4-row kernel of contract `a` for weight type `w` runnable on `max_isa` (second form: this CPU), or nullptr.
const DotX4Kernel* dot_x4_kernel(Type w, Arith a, Isa max_isa) noexcept;
const DotX4Kernel* dot_x4_kernel(Type w, Arith a) noexcept;

/// Batched multi-row/multi-token NVFP4 x Q8_0 AVX2 kernels (Basalt-style pre-unpacked activations across rows [r0, r1)).
/// Output layout: out[t * (r1 - r0) + (r - r0)] for t in [0, nt), r in [r0, r1). Returns false if unsupported.
bool nvfp4_gu_rows(Arith a, const uint8_t* gate, size_t g_row, const uint8_t* up, size_t u_row, int n,
                   const void* const* act, int nt, float* g_out, float* u_out, int r0, int r1) noexcept;
bool nvfp4_down_rows(Arith a, const uint8_t* down, size_t d_row, int n,
                     const void* const* act, int nt, float* out, int r0, int r1) noexcept;

}  // namespace strata::quant
