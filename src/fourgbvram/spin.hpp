// spin_pause(): the CPU's "this is a spin" hint, per architecture.
//
// `_mm_pause` yields the pipeline to a sibling hyperthread on x86 (and is PAUSE's whole point on Skylake and later).
// The engine used to include <immintrin.h> unconditionally just for it, which is what kept an aarch64 build out; the
// ARM counterpart is the `yield` hint and the portable fallback is nothing at all.
//
// Only the hint differs between them: every spin loop that calls this asks an atomic whether it may stop, and the
// hint changes how long that costs and not what happens.
#pragma once

#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
#include <immintrin.h>
namespace strata::fourgbvram {
inline void spin_pause() { _mm_pause(); }
}  // namespace strata::fourgbvram
#elif defined(__aarch64__) || defined(_M_ARM64)
namespace strata::fourgbvram {
inline void spin_pause() { __asm__ __volatile__("yield" ::: "memory"); }
}  // namespace strata::fourgbvram
#else
namespace strata::fourgbvram {
inline void spin_pause() {}
}  // namespace strata::fourgbvram
#endif
