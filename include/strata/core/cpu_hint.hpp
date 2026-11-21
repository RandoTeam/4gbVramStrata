// include/strata/core/cpu_hint.hpp - the two CPU intrinsics the host code used to take from <immintrin.h>.
//
// Four files of the donor's core (graph.cpp, session.cpp, mtp.cpp, verify.cpp) included <immintrin.h> for exactly two
// things: the spin hint `_mm_pause` and the store barrier `_mm_sfence`.  Neither header exists on aarch64, so the
// whole tree failed to configure there - found by the aarch64 job in .github/workflows/backends.yml on its first run.
//
// The pair maps like this:
//   x86     _mm_pause()   -> PAUSE          aarch64: `yield`                generic: nothing
//   x86     _mm_sfence()  -> SFENCE         aarch64: `dmb ishst`            generic: std::atomic_thread_fence(release)
//
// They are not the same instruction and deliberately so: both are *hints about ordering*, and every caller already
// asks a lock-free atomic whether the work it waits for is there.  What changes on another architecture is what the
// hint costs, not what the code does.
#pragma once

#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
#include <immintrin.h>
#else
#include <atomic>
#endif

namespace strata::core {

/// A hint that this thread is spinning.  Cheap, and yields the pipeline to a sibling hyperthread on x86.
inline void cpu_pause() {
#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
    _mm_pause();
#elif defined(__aarch64__) || defined(_M_ARM64)
    __asm__ __volatile__("yield" ::: "memory");
#endif
}

/// A store barrier: every store before this is visible to another core before any store after it.
inline void cpu_store_fence() {
#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
    _mm_sfence();
#elif defined(__aarch64__) || defined(_M_ARM64)
    __asm__ __volatile__("dmb ishst" ::: "memory");
#else
    std::atomic_thread_fence(std::memory_order_release);
#endif
}

}  // namespace strata::core
